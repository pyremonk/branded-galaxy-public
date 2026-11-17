/**
 * CombatEngine — Synchronous auto-resolve space combat simulator.
 *
 * Specs:
 *   015-space-combat-spec.md  (FR-SC-001 through FR-SC-009)
 *   046-combat-modes-spec.md  (FR-CM-004, FR-CM-005)
 *   047-combat-mechanics-spec.md (FR-CB-001 through FR-CB-007)
 *
 * All combat is deterministic for a given seed.
 * Must complete in < 100ms for fleets of up to 12 ships each.
 */

import { SeededRandom } from './seeded-random.js';
import { FactionDefinitionLoader } from './faction-loader.js';

const MAX_ROUNDS             = 10;    // FR-CB-002 / FR-CB-004
const SURRENDER_THRESHOLD    = 0.25;  // FR-CB-003: ≤25% of starting base_power
const RETREAT_BASE_CHANCE    = 0.50;  // FR-CB-003: 50% base retreat success
const RETREAT_LEADER_BONUS   = 0.05;  // FR-CB-003: +5% per Leadership point
const OVERWHELMING_THRESHOLD = 1.50;  // FR-CB-004: attacker power > defender × 150%
const OVERWHELMING_ROUNDS    = 5;     // FR-CB-004: must hold for 5 consecutive rounds
const LOYALTY_BONUS_THRESHOLD = 70;  // FR-CB-001: defending system loyalty ≥ 70 → +0.05
const LOYALTY_BONUS_VALUE    = 0.05;  // FR-CB-001
const EVASION_CHANCE         = 0.30;  // Stealth Corvette evasion per round
const SELF_REPAIR_SHIPS      = 2;     // Droid Carrier repairs up to 2 ships per round
const FIRST_STRIKE_MULT      = 1.50;  // Blockade Runner first-round power bonus
const CARRIER_SYNERGY        = 0.15;  // Fighter alongside Capital gets +15% power
const CAPITAL_KILLER_MULT    = 0.20;  // Nexus Battleship +20% vs enemy Capitals

// ─── Ship-type registry (loaded inline to keep engine self-contained) ─────────

import fleetConfigRaw from './fleet-config.json';

const SHIP_TYPE_MAP = Object.fromEntries(
  fleetConfigRaw.shipTypes.map(t => [t.id, t])
);

// ─── CombatEngine ─────────────────────────────────────────────────────────────

export class CombatEngine {
  fsm: any;
  csm: any;

  /**
   * @param {import('./fleet-state-manager.js').FleetStateManager} fleetStateManager
   * @param {import('./construction-state-manager.js').ConstructionStateManager} [constructionStateManager]
   */
  constructor(fleetStateManager: any, constructionStateManager: any) {
    this.fsm = fleetStateManager;
    this.csm = constructionStateManager ?? null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Resolve all pending combats at systems where hostile fleets co-occupy.
   * Called during the Resolution Phase.
   *
   * @param {Object} galaxy - Galaxy state
   * @param {string[]} initiativeOrder - Faction IDs in initiative order
   * @param {Object} [techStates={}] - factionId → TechStateManager
   * @param {string} [seed='combat'] - Legacy seed prefix (no longer used for per-combat RNG)
   * @param {Object} [options={}]
   * @param {number} [options.currentTurn=0] - Turn number for seeding and reports (FR-CB-005)
   * @param {Object} [options.characterStates={}] - factionId → CharacterStateManager
   * @returns {Array<CombatResult>} One result per combat that occurred
   */
  resolveAllCombats(galaxy: any, initiativeOrder: any, techStates: any = {}, seed = 'combat', options: any = {}) {
    const { currentTurn = 0, characterStates = {} } = options;
    const results = [];
    const processedSystems = new Set();

    for (const factionId of initiativeOrder) {
      const attackerFleets = this.fsm.getFleetsForFaction(factionId);

      for (const attackerFleet of attackerFleets) {
        if (attackerFleet.inTransit) continue;
        const systemId = attackerFleet.systemId;
        if (processedSystems.has(systemId)) continue;

        // Collect all factions at this system
        const factionsAtSystem = (Object.entries(this.fsm.fleets) as [string, any[]][])
          .filter(([, fleets]) => fleets.some((f: any) => f.systemId === systemId && !f.inTransit))
          .map(([fid]) => fid);

        if (factionsAtSystem.length < 2) continue;

        // Resolve combat between each pair of hostile factions
        for (let i = 0; i < factionsAtSystem.length; i++) {
          for (let j = i + 1; j < factionsAtSystem.length; j++) {
            const f1 = factionsAtSystem[i];
            const f2 = factionsAtSystem[j];

            const f1Fleets = this.fsm.getFleetsForFactionAtSystem(f1, systemId);
            const f2Fleets = this.fsm.getFleetsForFactionAtSystem(f2, systemId);
            if (f1Fleets.length === 0 || f2Fleets.length === 0) continue;

            const systemData = galaxy.systems.find((s: any) => s.id === systemId);

            // FR-CB-005: seed = turnNumber + systemId + attackerFactionId
            const rng = new SeededRandom(`${currentTurn}${systemId}${f1}`);

            // FR-CB-001: leadership bonus from commander
            const f1LeaderBonus = this._getLeadershipBonus(f1Fleets, f1, characterStates);
            const f2LeaderBonus = this._getLeadershipBonus(f2Fleets, f2, characterStates);

            // FR-CB-001: facility_bonus (Defense Platform +0.10, Ion Cannon +0.15)
            // FR-CB-001: loyalty_bonus (+0.05 if defender system loyalty ≥ 70)
            const f2FacilityBonus = this._getDefenderFacilityBonus(systemId, systemData);
            const f2LoyaltyBonus  = this._getDefenderLoyaltyBonus(systemData, f2);

            const result = this._resolveCombat(
              f1, f1Fleets, f2, f2Fleets, systemData, techStates, rng, {},
              {
                attackerLeaderBonus:   f1LeaderBonus,
                defenderLeaderBonus:   f2LeaderBonus,
                attackerFacilityBonus: 0,
                defenderFacilityBonus: f2FacilityBonus,
                attackerLoyaltyBonus:  0,
                defenderLoyaltyBonus:  f2LoyaltyBonus,
                characterStates,
                galaxy,
                currentTurn
              }
            );
            (result as any).systemId = systemId;
            (result as any).turnNumber = currentTurn;
            (result as any).mode = 'auto_resolve';
            results.push(result);

            // Apply system control transfer on attacker victory
            if (result.winner && systemData) {
              if (systemData.loyalty !== result.winner) {
                systemData.loyalty = result.winner;
                // Military occupation loyalty floor (FR-SC-004)
                if ((systemData.loyaltyValue ?? 75) < 30) {
                  systemData.loyaltyValue = 30;
                }
              }

              // Queue planetary invasion if fleet power remains (spec 048 FR-GC-001)
              const remainingPower = this._calcRemainingFleetPower(f1Fleets);
              if (remainingPower > 0) {
                this.fsm.queueInvasion({
                  systemId,
                  attackerFactionId:  f1,
                  defenderFactionId:  f2,
                  attackerFleetPower: remainingPower
                });
              }
            }

            // FR-CM-004: store spec-compliant combat report in log
            this.fsm.appendCombatLog(this._buildCombatReport(result, currentTurn));

            // FR-CM-005: fire winner/loser notifications
            (result as any).systemName = systemData?.name ?? (result as any).systemId;
            this._emitCombatNotifications(result);
          }
        }

        processedSystems.add(systemId);
      }
    }

    return results;
  }

  /**
   * Resolve a single combat engagement between two fleets.
   * Public — also called for raid one-round combats.
   *
   * @param {string} attackerFactionId
   * @param {Object[]} attackerFleets
   * @param {string} defenderFactionId
   * @param {Object[]} defenderFleets
   * @param {Object|null} systemData - Galaxy system object (may be null)
   * @param {Object} [techStates={}]
   * @param {SeededRandom} [rng] - If omitted, a fresh unseeded RNG is used
   * @param {Object} [options={}] - { raiderMode: boolean, maxRounds: number }
   * @returns {CombatResult}
   */
  resolveCombat(
    attackerFactionId: any, attackerFleets: any,
    defenderFactionId: any, defenderFleets: any,
    systemData: any, techStates = {}, rng: any, options = {}
  ) {
    if (!rng) throw new Error('CombatEngine.resolveCombat requires an rng param in simulation paths (spec 055 FR-DET-006)');
    return this._resolveCombat(
      attackerFactionId, attackerFleets,
      defenderFactionId, defenderFleets,
      systemData, techStates, rng, options, {}
    );
  }

  // ─── Internal simulation ──────────────────────────────────────────────────

  /** @private */
  _resolveCombat(
    attackerFactionId: any, attackerFleets: any,
    defenderFactionId: any, defenderFleets: any,
    systemData: any, techStates: any, rng: any,
    { raiderMode = false, maxRounds: maxRoundsOverride }: any = {},
    bonuses: any = {}
  ) {
    const {
      attackerLeaderBonus   = 0,
      defenderLeaderBonus   = 0,
      attackerFacilityBonus = 0,
      defenderFacilityBonus = 0,
      attackerLoyaltyBonus  = 0,
      defenderLoyaltyBonus  = 0,
      characterStates       = {},
      galaxy                = null,
      currentTurn           = 0
    } = bonuses;

    const effectiveMaxRounds = raiderMode ? 1 : (maxRoundsOverride ?? MAX_ROUNDS);

    // Consolidate ships from all fleets on each side (treat as one combined force)
    const attackerShips = attackerFleets.flatMap((f: any) => f.ships.map((s: any) => ({ ...s, fleetId: f.id })));
    const defenderShips = defenderFleets.flatMap((f: any) => f.ships.map((s: any) => ({ ...s, fleetId: f.id })));

    // Working copies (mutated during simulation)
    const atkSide = attackerShips.map((s: any) => ({ ...s }));
    const defSide = defenderShips.map((s: any) => ({ ...s }));

    // FR-CB-001: base power at start of combat (for surrender threshold check)
    const atkStartPower = this._calcBasePower(atkSide);
    const defStartPower = this._calcBasePower(defSide);

    // Tech military bonuses (fraction of base power)
    const atkTechBonus = this._getTechMilitaryBonus(attackerFactionId, techStates);
    const defTechBonus = this._getTechMilitaryBonus(defenderFactionId, techStates);

    // FR-CB-001: combined multiplier bonus per side
    // effective_power = base_power × (1 + leadership + tech + facility + loyalty)
    const atkBonusMultiplier = attackerLeaderBonus + atkTechBonus + attackerFacilityBonus + attackerLoyaltyBonus;
    const defBonusMultiplier = defenderLeaderBonus + defTechBonus + defenderFacilityBonus + defenderLoyaltyBonus;

    const log = [];
    let round = 0;
    let overwhelmingRounds = 0; // FR-CB-004: consecutive rounds attacker > 1.5× defender

    // Track whether attacker has attempted retreat this combat
    let atkRetreated = false;

    while (atkSide.some((s: any) => s.currentHull > 0) && defSide.some((s: any) => s.currentHull > 0)) {
      if (round >= effectiveMaxRounds) break;
      round++;

      const atkPower = this._calcEffectivePower(atkSide, attackerFactionId, atkBonusMultiplier, round);
      const defPower = this._calcEffectivePower(defSide, defenderFactionId, defBonusMultiplier, round);

      // Evasion for Stealth Corvette (Union, FR-SC-007)
      const atkEvades = this._checkEvasion(atkSide, rng);
      const defEvades = this._checkEvasion(defSide, rng);

      const randomFactor = rng.next();
      const atkDamage = atkEvades ? 0 : (defPower  * (0.8 + randomFactor * 0.4)) / 10;
      const defDamage = defEvades ? 0 : (atkPower  * (0.8 + rng.next()   * 0.4)) / 10;

      const atkDestroyedNames = this._applyDamage(defSide, atkDamage);
      const defDestroyedNames = this._applyDamage(atkSide, defDamage);

      // Self-repair: Droid Carrier (Autoforge, FR-SC-007)
      this._applySelfRepair(atkSide, attackerFactionId);
      this._applySelfRepair(defSide, defenderFactionId);

      log.push({
        round,
        attackerDamageDealt: Math.round(atkDamage),
        defenderDamageDealt: Math.round(defDamage),
        attackerShipsLost:   defDestroyedNames,
        defenderShipsLost:   atkDestroyedNames,
        attackerEvaded:      atkEvades,
        defenderEvaded:      defEvades
      });

      if (raiderMode) continue;

      // FR-CB-004: track consecutive rounds where attacker overwhelms defender
      const atkCurrentPower = this._calcEffectivePower(atkSide.filter((s: any) => s.currentHull > 0), attackerFactionId, atkBonusMultiplier, round);
      const defCurrentPower = this._calcEffectivePower(defSide.filter((s: any) => s.currentHull > 0), defenderFactionId, defBonusMultiplier, round);

      if (atkCurrentPower > defCurrentPower * OVERWHELMING_THRESHOLD) {
        overwhelmingRounds++;
      } else {
        overwhelmingRounds = 0;
      }

      // FR-CB-003: Surrender check — at ≤25% of starting base_power
      const atkCurrentBase = this._calcBasePower(atkSide.filter((s: any) => s.currentHull > 0));
      const defCurrentBase = this._calcBasePower(defSide.filter((s: any) => s.currentHull > 0));

      if (!atkRetreated && atkCurrentBase <= atkStartPower * SURRENDER_THRESHOLD) {
        // Attacker attempts to retreat
        const leaderStat = this._getCommanderLeadershipStat(attackerFleets, attackerFactionId, characterStates);
        const retreatChance = Math.min(1.0, RETREAT_BASE_CHANCE + RETREAT_LEADER_BONUS * leaderStat);
        if (rng.chance(retreatChance)) {
          atkRetreated = true;
          // Move surviving attacker ships to nearest friendly system
          if (galaxy) {
            this._retreatFleets(attackerFleets, attackerFactionId, systemData?.id, galaxy);
          }
          break;
        }
        // Failed retreat: combat continues to 10-round cap
      }

      if (defCurrentBase <= defStartPower * SURRENDER_THRESHOLD && atkSide.some((s: any) => s.currentHull > 0)) {
        // Defender at surrender threshold — combat continues (defender cannot voluntarily retreat)
        // (Defender holds position; attacker presses advantage)
      }
    }

    // Write hull damage back to real fleet ships
    this._commitDamage(atkSide, attackerFleets);
    this._commitDamage(defSide, defenderFleets);

    // Determine outcome
    const atkSurvived = atkSide.some((s: any) => s.currentHull > 0) && !atkRetreated;
    const defSurvived = defSide.some((s: any) => s.currentHull > 0);

    let outcome, winner;
    if (atkSurvived && !defSurvived) {
      outcome = 'attackerVictory';
      winner  = attackerFactionId;
    } else if (!atkSurvived && defSurvived) {
      outcome = 'defenderVictory';
      winner  = defenderFactionId;
    } else if (atkRetreated) {
      // FR-CB-003: successful retreat → draw, defender holds
      outcome = 'draw';
      winner  = defenderFactionId;
    } else {
      // FR-CB-004: draw at 10-round cap
      // Overwhelming superiority: attacker power > 1.5× defender for 5+ consecutive rounds
      if (overwhelmingRounds >= OVERWHELMING_ROUNDS) {
        outcome = 'attackerVictory';
        winner  = attackerFactionId;
      } else {
        // Standard draw: defender holds system
        outcome = 'draw';
        winner  = defenderFactionId;
        // Attacker retreats — move to nearest friendly system
        if (galaxy) {
          this._retreatFleets(attackerFleets, attackerFactionId, systemData?.id, galaxy);
        }
      }
    }

    log.push({ round: 'final', outcome, winner });

    return {
      attackerFactionId,
      defenderFactionId,
      outcome,
      winner,
      attackerShipsBefore: attackerShips.length,
      defenderShipsBefore: defenderShips.length,
      attackerShipsAfter:  atkSide.filter((s: any) => s.currentHull > 0).length,
      defenderShipsAfter:  defSide.filter((s: any) => s.currentHull > 0).length,
      attackerPower:       Math.round(atkStartPower),
      defenderPower:       Math.round(defStartPower),
      rounds:              round,
      log
    };
  }

  // ─── Power calculation helpers ────────────────────────────────────────────

  /**
   * Calculate base fleet power (sum of combat power × hull ratio), no bonuses.
   * Used for surrender threshold calculation.
   * @private
   */
  _calcBasePower(ships: any) {
    return ships.filter((s: any) => s.currentHull > 0).reduce((sum: any, ship: any) => {
      const type = SHIP_TYPE_MAP[ship.shipTypeId];
      if (!type) return sum;
      const hullRatio = ship.maxHull > 0 ? ship.currentHull / ship.maxHull : 0;
      return sum + type.combatPower * hullRatio;
    }, 0);
  }

  /** @private */
  _calcEffectivePower(ships: any, factionId: any, bonusMultiplier: any, round: any) {
    const alive = ships.filter((s: any) => s.currentHull > 0);
    if (alive.length === 0) return 0;

    const hasCapital = alive.some((s: any) => SHIP_TYPE_MAP[s.shipTypeId]?.class === 'Capital');

    let power = alive.reduce((sum: any, ship: any) => {
      const type = SHIP_TYPE_MAP[ship.shipTypeId];
      if (!type) return sum;

      const hullRatio = ship.maxHull > 0 ? ship.currentHull / ship.maxHull : 0;
      let sp = type.combatPower * hullRatio;

      // Carrier synergy: Fighter Squadron alongside Capital +15% (FR-SC-007)
      if (type.specialAbility === 'carrierSynergy' && hasCapital) {
        sp *= 1 + CARRIER_SYNERGY;
      }

      // Blockade Runner first-strike (FR-SC-007)
      if (type.specialAbility === 'firstStrike' && round === 1) {
        sp *= FIRST_STRIKE_MULT;
      }

      // Nexus Battleship capital killer (FR-SC-007)
      if (type.specialAbility === 'capitalKiller') {
        sp *= 1 + CAPITAL_KILLER_MULT;
      }

      return sum + sp;
    }, 0);

    // FR-CB-001: effective_power = base_power × (1 + bonusMultiplier)
    // bonusMultiplier = leadership + tech + facility + loyalty combined
    power = power * (1 + bonusMultiplier);
    return power;
  }

  /** @private */
  _getTechMilitaryBonus(factionId: any, techStates: any) {
    const ts = techStates?.[factionId];
    if (!ts) return 0;
    // Look for applied military-bonus effects
    const effects = ts.state?.appliedEffects ?? [];
    return effects.reduce((sum: any, e: any) => {
      const militaryEffect = (e.effects ?? []).find((eff: any) =>
        eff.type === 'military-bonus' && eff.stat === 'combatPower'
      );
      return sum + (militaryEffect?.value ?? 0);
    }, 0);
  }

  // ─── Bonus helpers (spec 047 FR-CB-001) ──────────────────────────────────

  /**
   * Get the leadership bonus for the fleet's commander.
   * FR-CB-001: leadership_bonus = commander Leadership stat / 20
   * @private
   */
  _getLeadershipBonus(fleets: any, factionId: any, characterStates: any) {
    const csm = characterStates?.[factionId];
    if (!csm) return 0;

    for (const fleet of fleets) {
      if (!fleet.commanderId) continue;
      const char = csm.getCharacter?.(fleet.commanderId);
      if (char?.stats?.leadership) {
        return char.stats.leadership / 20;
      }
    }
    return 0;
  }

  /**
   * Get the commander's raw leadership stat for retreat probability calculation.
   * FR-CB-003: retreat_chance = 50% + 5% per Leadership point
   * @private
   */
  _getCommanderLeadershipStat(fleets: any, factionId: any, characterStates: any) {
    const csm = characterStates?.[factionId];
    if (!csm) return 0;
    for (const fleet of fleets) {
      if (!fleet.commanderId) continue;
      const char = csm.getCharacter?.(fleet.commanderId);
      if (char?.stats?.leadership != null) return char.stats.leadership;
    }
    return 0;
  }

  /**
   * Get defender facility bonus for the defending system.
   * FR-CB-001: +0.10 Defense Platform, +0.15 Ion Cannon
   * @private
   */
  _getDefenderFacilityBonus(systemId: any, systemData: any) {
    if (!this.csm || !systemId) return 0;
    let bonus = 0;
    const facilities = this.csm.getFacilities(systemId);
    for (const fac of facilities) {
      if (fac.currentHP <= 0) continue;
      if (fac.facilityId === 'defense')    bonus += 0.10;
      if (fac.facilityId === 'ion_cannon') bonus += 0.15;
    }
    return bonus;
  }

  /**
   * Get loyalty defense bonus for the defending faction at a system.
   * FR-CB-001: +0.05 if defending system loyalty ≥ 70 for the defending faction.
   * @private
   */
  _getDefenderLoyaltyBonus(systemData: any, defenderFactionId: any) {
    if (!systemData) return 0;
    // systemData.loyalty is the controlling faction; loyaltyValue is that faction's loyalty
    if (systemData.loyalty === defenderFactionId &&
        (systemData.loyaltyValue ?? 0) >= LOYALTY_BONUS_THRESHOLD) {
      return LOYALTY_BONUS_VALUE;
    }
    return 0;
  }

  /**
   * Calculate remaining fleet power after combat for invasion queuing.
   * @private
   */
  _calcRemainingFleetPower(fleets: any) {
    return fleets.reduce((sum: any, fleet: any) => {
      return sum + fleet.ships.reduce((s: any, ship: any) => {
        const type = SHIP_TYPE_MAP[ship.shipTypeId];
        if (!type) return s;
        const hullRatio = ship.maxHull > 0 ? ship.currentHull / ship.maxHull : 0;
        return s + type.combatPower * hullRatio;
      }, 0);
    }, 0);
  }

  /**
   * Move retreating fleets to the nearest friendly system.
   * FR-CB-003: surviving ships move to nearest friendly system (1 hop away); if none, ships lost.
   * @private
   */
  _retreatFleets(fleets: any, factionId: any, combatSystemId: any, galaxy: any) {
    if (!combatSystemId || !galaxy) return;

    const combatSys = galaxy.systems.find((s: any) => s.id === combatSystemId);
    if (!combatSys) return;

    // Find nearest friendly system (1 hop preferred, otherwise any reachable friendly)
    const friendlySystems = galaxy.systems.filter(
      (s: any) => s.id !== combatSystemId && s.loyalty === factionId
    );

    // Check adjacent friendly systems first (1 hop)
    let retreatTarget = friendlySystems.find(
      (s: any) => combatSys.connections?.includes(s.id)
    );

    // If no adjacent friendly, ships are lost (per spec FR-CB-003)
    if (!retreatTarget) {
      // Destroy all retreating ships
      for (const fleet of fleets) {
        if (fleet.systemId === combatSystemId) {
          fleet.ships = [];
        }
      }
      return;
    }

    // Move surviving fleets to retreat target
    for (const fleet of fleets) {
      if (fleet.systemId === combatSystemId && fleet.ships.some((s: any) => s.currentHull > 0)) {
        fleet.systemId = retreatTarget.id;
        fleet.inTransit = null;
        console.log(`[CombatEngine] Fleet ${fleet.id} (${factionId}) retreated to ${retreatTarget.id}`);
      }
    }
  }

  // ─── Combat Report helpers (spec 046 FR-CM-004, FR-CM-005) ───────────────

  /**
   * Build a spec-compliant Combat Report object from a resolved combat result.
   * FR-CM-004: stored in gameState.combatLog[]
   * @private
   */
  _buildCombatReport(result: any, turnNumber: any) {
    return {
      turnNumber:        turnNumber,
      systemId:          (result as any).systemId,
      attackerFactionId: result.attackerFactionId,
      defenderFactionId: result.defenderFactionId,
      attackerPower:     result.attackerPower ?? 0,
      defenderPower:     result.defenderPower ?? 0,
      rounds:            result.rounds,
      outcome:           result.outcome === 'attackerVictory' ? 'attacker_wins'
                       : result.outcome === 'defenderVictory' ? 'defender_wins'
                       : 'draw',
      attackerLosses:    (result.attackerShipsBefore ?? 0) - (result.attackerShipsAfter ?? 0),
      defenderLosses:    (result.defenderShipsBefore ?? 0) - (result.defenderShipsAfter ?? 0),
      mode:              (result as any).mode ?? 'auto_resolve'
    };
  }

  /**
   * Fire winner/loser notifications after combat.
   * FR-CM-005: winner = 'warning' tier, loser = 'critical' tier.
   * @private
   */
  _emitCombatNotifications(result: any) {
    const systemId = (result as any).systemId;
    const outcome  = result.outcome;

    if (outcome === 'attackerVictory') {
      // Winner notification (attacker)
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: {
          tier:             'warning',
          message:          `Victory at ${systemId}: ${result.attackerFactionId} defeated ${result.defenderFactionId}`,
          locationId:       systemId,
          locationCategory: 'combat'
        }
      }));
      // Loser notification (defender)
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: {
          tier:             'critical',
          message:          `Defeat at ${systemId}: fleet destroyed by ${result.attackerFactionId}`,
          locationId:       systemId,
          locationCategory: 'combat'
        }
      }));
    } else if (outcome === 'defenderVictory') {
      // Winner notification (defender)
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: {
          tier:             'warning',
          message:          `Victory at ${systemId}: ${result.defenderFactionId} repelled ${result.attackerFactionId}`,
          locationId:       systemId,
          locationCategory: 'combat'
        }
      }));
      // Loser notification (attacker)
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: {
          tier:             'critical',
          message:          `Defeat at ${systemId}: attack on ${result.defenderFactionId} failed`,
          locationId:       systemId,
          locationCategory: 'combat'
        }
      }));
    } else {
      // Draw — both sides get a warning notification
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: {
          tier:             'warning',
          message:          `Combat draw at ${systemId} — ${result.attackerFactionId} retreated`,
          locationId:       systemId,
          locationCategory: 'combat'
        }
      }));
    }

    // Player alerts for combat resolution (spec 063 FR-PA-009)
    {
      const sysName = (result as any).systemName ?? systemId;
      const atkName = FactionDefinitionLoader.getFactionById(result.attackerFactionId)?.displayName ?? result.attackerFactionId;
      const defName = FactionDefinitionLoader.getFactionById(result.defenderFactionId)?.displayName ?? result.defenderFactionId;
      const atkLoss = (result.attackerShipsBefore ?? 0) - (result.attackerShipsAfter ?? 0);
      const defLoss = (result.defenderShipsBefore ?? 0) - (result.defenderShipsAfter ?? 0);

      // Attacker alert
      const atkVictorious = outcome === 'attackerVictory';
      window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
        detail: {
          category:  'combat',
          factionId: result.attackerFactionId,
          message:   `${atkName} ${atkVictorious ? 'defeated' : outcome === 'draw' ? 'drew with' : 'was repelled by'} ${defName} at ${sysName}`,
          outcome:   {
            summary:    `Combat at ${sysName}: ${atkVictorious ? 'Victory' : outcome === 'draw' ? 'Draw' : 'Defeat'}`,
            details:    [
              { label: 'Attacker', value: atkName },
              { label: 'Defender', value: defName },
              { label: 'Ships lost (attacker)', value: String(atkLoss) },
              { label: 'Ships lost (defender)', value: String(defLoss) },
              { label: 'Result', value: outcome === 'attackerVictory' ? 'Attacker Victory' : outcome === 'defenderVictory' ? 'Defender Victory' : 'Draw' },
            ],
            systemId:   systemId,
            systemName: sysName,
          },
          turn: (result as any).turnNumber ?? 0,
        }
      }));

      // Defender alert
      const defVictorious = outcome === 'defenderVictory';
      window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
        detail: {
          category:       'combat',
          factionId:      result.defenderFactionId,
          actorFactionId: result.attackerFactionId,
          message:   `${defName} ${defVictorious ? 'repelled' : outcome === 'draw' ? 'drew with' : 'was defeated by'} ${atkName} at ${sysName}`,
          outcome:   {
            summary:    `Combat at ${sysName}: ${defVictorious ? 'Victory' : outcome === 'draw' ? 'Draw' : 'Defeat'}`,
            details:    [
              { label: 'Attacker', value: atkName },
              { label: 'Defender', value: defName },
              { label: 'Ships lost (attacker)', value: String(atkLoss) },
              { label: 'Ships lost (defender)', value: String(defLoss) },
              { label: 'Result', value: outcome === 'attackerVictory' ? 'Attacker Victory' : outcome === 'defenderVictory' ? 'Defender Victory' : 'Draw' },
            ],
            systemId:   systemId,
            systemName: sysName,
          },
          turn: (result as any).turnNumber ?? 0,
        }
      }));
    }
  }

  // ─── Special ability helpers ──────────────────────────────────────────────

  /**
   * Check if any ship on a side has evasion (Stealth Corvette).
   * Each corvette rolls independently; returns true if at least one evades.
   * @private
   */
  _checkEvasion(ships: any, rng: any) {
    return ships.some((s: any) => {
      const type = SHIP_TYPE_MAP[s.shipTypeId];
      return type?.specialAbility === 'evasion' && s.currentHull > 0 && rng.chance(EVASION_CHANCE);
    });
  }

  /**
   * Apply self-repair to Droid Carriers on a side (up to 2 damaged ships per round).
   * @private
   */
  _applySelfRepair(ships: any, factionId: any) {
    if (factionId !== 'autoforge') return;
    const hasDroidCarrier = ships.some((s: any) =>
      SHIP_TYPE_MAP[s.shipTypeId]?.specialAbility === 'selfRepair' && s.currentHull > 0
    );
    if (!hasDroidCarrier) return;

    let repaired = 0;
    for (const ship of ships) {
      if (repaired >= SELF_REPAIR_SHIPS) break;
      if (ship.currentHull > 0 && ship.currentHull < ship.maxHull) {
        ship.currentHull++;
        repaired++;
      }
    }
  }

  // ─── Damage application ───────────────────────────────────────────────────

  /**
   * Distribute damage to ships starting from weakest (fighters first).
   * @param {Object[]} ships - Working copies
   * @param {number} damage - Total hull damage to distribute
   * @returns {string[]} Names of destroyed ships
   * @private
   */
  _applyDamage(ships: any, damage: any) {
    const destroyed: any[] = [];
    if (damage <= 0) return destroyed;

    // Sort by hull points ascending (weakest first per spec FR-SC-003)
    const sorted = [...ships].sort((a, b) => {
      const aHull = SHIP_TYPE_MAP[a.shipTypeId]?.hullPoints ?? 1;
      const bHull = SHIP_TYPE_MAP[b.shipTypeId]?.hullPoints ?? 1;
      return aHull - bHull;
    });

    let remaining = damage;
    for (const ship of sorted) {
      if (remaining <= 0) break;
      if (ship.currentHull <= 0) continue;

      const idx = ships.findIndex((s: any) => s.id === ship.id);
      const dmg = Math.min(ships[idx].currentHull, Math.ceil(remaining));
      ships[idx].currentHull -= dmg;
      remaining -= dmg;

      if (ships[idx].currentHull <= 0) {
        const type = SHIP_TYPE_MAP[ship.shipTypeId];
        destroyed.push(type?.name ?? ship.shipTypeId);
      }
    }

    return destroyed;
  }

  /**
   * Write hull damage from simulation working copies back to real fleet ships.
   * @param {Object[]} simShips - Working copies with updated currentHull
   * @param {Object[]} fleets - Real fleet objects
   * @private
   */
  _commitDamage(simShips: any, fleets: any) {
    for (const simShip of simShips) {
      for (const fleet of fleets) {
        const realShip = fleet.ships.find((s: any) => s.id === simShip.id);
        if (realShip) {
          realShip.currentHull = simShip.currentHull;
        }
      }
    }

    // Remove destroyed ships
    for (const fleet of fleets) {
      fleet.ships = fleet.ships.filter((s: any) => s.currentHull > 0);
    }
  }
}

/**
 * @typedef {Object} CombatResult
 * @property {string}   attackerFactionId
 * @property {string}   defenderFactionId
 * @property {string}   outcome - 'attackerVictory' | 'defenderVictory' | 'draw'
 * @property {string}   winner  - Faction ID that won (defender in draw)
 * @property {number}   attackerShipsBefore
 * @property {number}   defenderShipsBefore
 * @property {number}   attackerShipsAfter
 * @property {number}   defenderShipsAfter
 * @property {number}   attackerPower  - Base power at combat start
 * @property {number}   defenderPower  - Base power at combat start
 * @property {number}   rounds
 * @property {Array}    log     - Round-by-round events
 * @property {string}   [systemId]
 * @property {number}   [turnNumber]
 * @property {string}   [mode]  - 'auto_resolve' | 'tactical'
 */
