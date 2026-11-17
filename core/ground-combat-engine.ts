/**
 * GroundCombatEngine — Round-based planetary invasion resolver.
 *
 * Resolves ground combat after a victorious fleet engagement.
 * Simulates round-by-round battle between attacking forces and the defending garrison.
 *
 * Specs:
 *   048-ground-combat-spec.md (FR-GC-001 through FR-GC-008)
 *   027-system-capture-spec.md (FR-SCP-001 through FR-SCP-006)
 */

import { SeededRandom } from './seeded-random.js';

const MAX_GROUND_ROUNDS      = 15;   // FR-GC constraint
const ATTACKER_DAMAGE_RATE   = 0.15; // FR-GC-003 step 4
const DEFENDER_DAMAGE_RATE   = 0.15; // FR-GC-003 step 3
const SHIELD_DAMAGE_REDUCTION = 0.20; // FR-GC-002: Shield Generator -20% to attacker casualties

// ─── GroundCombatEngine ───────────────────────────────────────────────────────

export class GroundCombatEngine {
  csm: any;
  lsm: any;

  /**
   * @param {import('./construction-state-manager.js').ConstructionStateManager} constructionStateManager
   * @param {import('./loyalty-state-manager.js').LoyaltyStateManager} [loyaltyStateManager]
   */
  constructor(constructionStateManager: any, loyaltyStateManager: any) {
    this.csm = constructionStateManager;
    this.lsm = loyaltyStateManager ?? null;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Resolve a planetary invasion after the attacker won space combat.
   *
   * @param {Object} params
   * @param {string} params.systemId
   * @param {string} params.attackerFactionId
   * @param {string} params.defenderFactionId
   * @param {number} params.attackerFleetPower - Attacker's remaining fleet power after space combat
   * @param {Object} params.galaxy
   * @param {Object} [params.techStates={}] - factionId → TechStateManager
   * @param {number} [params.turnNumber=0]
   * @returns {GroundCombatResult}
   */
  resolve(params: any) {
    const {
      systemId,
      attackerFactionId,
      defenderFactionId,
      attackerFleetPower,
      galaxy,
      techStates = {},
      turnNumber = 0
    } = params;

    const system = galaxy?.systems?.find((s: any) => s.id === systemId);
    if (!system) return { invasionAttempted: false, outcome: 'error', error: 'System not found' };

    // FR-GC-002: attacking_units = floor(fleet_power / 10), minimum 1
    const startingAttackers = Math.max(1, Math.floor(attackerFleetPower / 10));
    let attackingUnits = startingAttackers;

    // FR-GC-002: defending garrison = troops garrisoned at the system
    const startingDefenders = this.csm.getGroundTroops(systemId);
    let defendingUnits = startingDefenders;

    // FR-GC-002: facility defense bonuses
    const { facilityDefenseBonus, ionCannonBonus, shieldPresent } =
      this._getFacilityModifiers(systemId);

    // FR-GC-003 step 2: loyalty_defense_bonus = (loyalty / 100) × 0.30
    const loyalty = system.loyaltyValue ?? system.loyaltyScore ?? 50;
    const loyaltyDefenseBonus = (loyalty / 100) * 0.30;

    // Tech ground bonus (forward-compatible; defaults to 0 until ground-combat tech exists)
    const techGroundBonus = this._getTechGroundBonus(attackerFactionId, techStates);

    const totalDefenseBonus = facilityDefenseBonus + ionCannonBonus + loyaltyDefenseBonus;

    // FR-GC-005: seeded RNG — seed = turnNumber + systemId + "ground" + attackerFactionId
    // RNG is created to ensure reproducible state; formula is deterministic per spec.
    // eslint-disable-next-line no-unused-vars
    const _rng = new SeededRandom(`${turnNumber}${systemId}ground${attackerFactionId}`);

    let attackerLosses = 0;
    let defenderLosses = 0;
    let roundsFought = 0;

    // FR-GC-003: round-by-round resolution
    for (let round = 0; round < MAX_GROUND_ROUNDS; round++) {
      if (defendingUnits <= 0 || attackingUnits <= 0) break;
      roundsFought++;

      // Step 1-2: effective powers
      const attackerEff = attackingUnits * (1 + techGroundBonus);
      const defenderEff = defendingUnits * (1 + totalDefenseBonus);

      // Step 3-4: casualties
      let atkCasualties = Math.floor(defenderEff * ATTACKER_DAMAGE_RATE);
      let defCasualties = Math.floor(attackerEff * DEFENDER_DAMAGE_RATE);

      // Step 5: Shield Generator reduces attacker casualties by 20% (FR-GC-002)
      if (shieldPresent) {
        atkCasualties = Math.floor(atkCasualties * (1 - SHIELD_DAMAGE_REDUCTION));
      }

      // Step 6: apply losses
      attackingUnits = Math.max(0, attackingUnits - atkCasualties);
      defendingUnits = Math.max(0, defendingUnits - defCasualties);
      attackerLosses += atkCasualties;
      defenderLosses += defCasualties;

      // Steps 7-8: check for end condition
      if (defendingUnits <= 0) break; // attacker wins
      if (attackingUnits <= 0) break; // defender wins
    }

    // Update garrison troops
    this.csm.setGroundTroops(systemId, Math.max(0, defendingUnits));

    // FR-GC-003 step 7: invader wins — system capture
    if (defendingUnits <= 0) {
      this._applySystemCapture(system, attackerFactionId, defenderFactionId, galaxy);

      return {
        invasionAttempted: true,
        attackingUnits:    startingAttackers,
        defendingUnits:    startingDefenders,
        rounds:            roundsFought,
        outcome:           'attacker_wins',
        attackerLosses,
        defenderLosses
      };
    }

    // FR-GC-003 step 8 / FR-GC-004: defender wins — attacker retreats to blockade
    return {
      invasionAttempted: true,
      attackingUnits:    startingAttackers,
      defendingUnits:    startingDefenders,
      rounds:            roundsFought,
      outcome:           'defender_wins',
      attackerLosses,
      defenderLosses
    };
  }

  // ─── Facility lookup ──────────────────────────────────────────────────────────

  /**
   * Get facility-based defense modifiers for a system.
   * FR-GC-002: Defense Platform +0.15, Ion Cannon +0.10, Shield Generator -20% attacker dmg.
   * @private
   */
  _getFacilityModifiers(systemId: any) {
    const facilities = this.csm.getFacilities(systemId);
    let facilityDefenseBonus = 0;
    let ionCannonBonus       = 0;
    let shieldPresent        = false;

    for (const fac of facilities) {
      if (fac.currentHP <= 0) continue;
      if (fac.facilityId === 'defense')    facilityDefenseBonus += 0.15;
      if (fac.facilityId === 'ion_cannon') ionCannonBonus       += 0.10;
      if (fac.facilityId === 'shield')     shieldPresent         = true;
    }

    return { facilityDefenseBonus, ionCannonBonus, shieldPresent };
  }

  /**
   * Get tech-based ground combat bonus for a faction.
   * Looks for military-bonus effects with stat === 'groundCombatPower'.
   * @private
   */
  _getTechGroundBonus(factionId: any, techStates: any) {
    const ts = techStates?.[factionId];
    if (!ts) return 0;
    const effects = ts.state?.appliedEffects ?? [];
    return effects.reduce((sum: any, e: any) => {
      const gfx = (e.effects ?? []).find((eff: any) =>
        eff.type === 'military-bonus' && eff.stat === 'groundCombatPower'
      );
      return sum + (gfx?.value ?? 0);
    }, 0);
  }

  // ─── System capture ───────────────────────────────────────────────────────────

  /**
   * Apply all system-capture effects after attacker wins ground combat.
   * Spec: 027-system-capture-spec.md (FR-SCP-002, FR-SCP-003)
   * @private
   */
  _applySystemCapture(system: any, attackerFactionId: any, defenderFactionId: any, galaxy: any) {
    if (this.lsm) {
      // FR-SCP-002: loyalty transfer + troop reset + _syncSystemControl
      this.lsm.applyCaptureLoyalty(system, attackerFactionId, defenderFactionId);
    } else {
      // Fallback if no loyalty manager (e.g. in unit tests)
      system.loyalty      = attackerFactionId;
      const cur           = system.loyaltyValue ?? 50;
      system.loyaltyValue = Math.max(30, cur - 20);
      system.troops       = 0;
    }

    // FR-SCP-003: each facility takes 1 HP damage at capture
    const facilities = this.csm.getFacilities(system.id);
    for (const fac of [...facilities]) {
      if (fac.currentHP > 0) {
        this.csm.damageFacility(system.id, fac.id, 1);
      }
    }

    window.dispatchEvent(new CustomEvent('galaxy:notify', {
      detail: {
        tier:             'warning',
        message:          `${attackerFactionId} captured ${system.name ?? system.id}!`,
        locationId:       system.id,
        locationCategory: 'combat'
      }
    }));
  }
}

/**
 * @typedef {Object} GroundCombatResult
 * @property {boolean} invasionAttempted
 * @property {number}  attackingUnits   - Starting attacker units
 * @property {number}  defendingUnits   - Starting defender units
 * @property {number}  rounds           - Rounds fought
 * @property {string}  outcome          - 'attacker_wins' | 'defender_wins' | 'error'
 * @property {number}  attackerLosses
 * @property {number}  defenderLosses
 */
