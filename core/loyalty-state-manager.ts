/**
 * LoyaltyStateManager — Per-system per-faction loyalty tracking.
 *
 * Each star system has an independent loyalty value (0–100) for every faction.
 * The controlling faction is the one with the highest loyalty value, provided
 * it is ≥ 40. If no faction meets this threshold the system is Neutral.
 *
 * Specs: 024-loyalty-system-spec.md, 026-loyalty-effects-spec.md,
 *        027-system-capture-spec.md
 */

import { SeededRandom } from './seeded-random.js';

// All recognised faction IDs. Additional factions are supported automatically
// but these are the canonical three for Phase 1B.
const FACTION_IDS = ['brandAuthority', 'union', 'autoforge'];

// Loyalty threshold below which the controlling faction loses control
const CONTROL_THRESHOLD = 40;

// Loyalty threshold that triggers a defection check (FR-LS-004)
const DEFECTION_TRIGGER = 30;

// Passive drift amounts (FR-LS-002)
const DRIFT_TOWARD_CONTROLLER = 2;
const DRIFT_FROM_NON_CONTROLLER = -1;

// Military occupation drift (FR-LS-002)
const OCCUPATION_DRIFT_CONTROLLER = -3;
const OCCUPATION_DRIFT_OCCUPIER = 1;

// Passive drift floor — passive drift cannot reduce controlling faction below 10 (FR-LS-005)
const PASSIVE_DRIFT_FLOOR = 10;

export class LoyaltyStateManager {
  factionIds: string[];
  _loyalties: any = {};
  _previousLoyalties: any = {};
  _diplomaticHolds: any = {};
  _actionHistory: any = {};
  _timedBonuses: any[] = [];

  /**
   * @param {string[]} [factionIds] — Active faction IDs; defaults to the canonical three
   */
  constructor(factionIds: string[] = FACTION_IDS) {
    this.factionIds = factionIds;
    // systemId → { factionId: loyaltyValue }
    this._loyalties = {};
    // systemId → last-turn loyalty snapshot for trend calculation
    this._previousLoyalties = {};
    // systemId → { factionId: boolean } — systems temporarily immune to diplo conversion
    this._diplomaticHolds = {}; // systemId → { expiryTurn }
    // Diplomatic action history per system (last 5 turns, FR-DA-005)
    this._actionHistory = {}; // systemId → Array<{ turn, type, factionId }>
    // Pending trade/production bonuses (Trade Agreement & Resource Investment)
    this._timedBonuses = []; // Array<{ systemId, factionId, type, turnsLeft, value }>
  }

  // ─── Initialization ──────────────────────────────────────────────────────────

  /**
   * Initialize loyalty maps from existing galaxy state.
   * Systems that already have `system.loyalty` (faction ID) get 100 loyalty for
   * that faction and 0 for all others. Neutral systems get 0 for all factions.
   * @param {Object[]} systems — Galaxy systems array
   */
  initialize(systems: any) {
    for (const system of systems) {
      const existing = (this._loyalties as Record<string, Record<string, number>>)[system.id] ?? {};
      const loyalties: Record<string, number> = {};

      for (const fId of this.factionIds) {
        // Preserve already-set values (e.g. from deserialization)
        if (existing[fId] != null) {
          loyalties[fId] = existing[fId];
        } else if (system.loyalty && system.loyalty !== 'neutral' && system.loyalty === fId) {
          loyalties[fId] = system.loyaltyValue ?? 100;
        } else {
          loyalties[fId] = 0;
        }
      }

      (this._loyalties as Record<string, Record<string, number>>)[system.id] = loyalties;
      (this._previousLoyalties as Record<string, Record<string, number>>)[system.id] = { ...loyalties };

      // Ensure system.loyalties reference stays in sync
      system.loyalties = loyalties;

      // Recompute controlling faction
      this._syncSystemControl(system);
    }
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  /**
   * Get loyalty value for a faction at a system.
   * @param {string} systemId
   * @param {string} factionId
   * @returns {number} 0–100
   */
  getLoyalty(systemId: any, factionId: any) {
    return (this._loyalties as Record<string, Record<string, number>>)[systemId]?.[factionId] ?? 0;
  }

  /**
   * Set loyalty value for a faction at a system (clamped to [0, 100]).
   * @param {string} systemId
   * @param {string} factionId
   * @param {number} value
   */
  setLoyalty(systemId: any, factionId: any, value: any) {
    if (!(this._loyalties as Record<string, Record<string, number>>)[systemId]) (this._loyalties as Record<string, Record<string, number>>)[systemId] = {};
    (this._loyalties as Record<string, Record<string, number>>)[systemId][factionId] = Math.max(0, Math.min(100, Math.trunc(value)));
  }

  /**
   * Adjust loyalty by a delta (clamped to [0, 100]).
   * @param {string} systemId
   * @param {string} factionId
   * @param {number} delta — positive or negative
   */
  adjustLoyalty(systemId: any, factionId: any, delta: any) {
    const current = this.getLoyalty(systemId, factionId);
    this.setLoyalty(systemId, factionId, current + delta);
  }

  /**
   * Determine the controlling faction at a system.
   * Controlling faction = faction with highest loyalty ≥ CONTROL_THRESHOLD.
   * @param {string} systemId
   * @returns {string} factionId or 'neutral'
   */
  getControllingFaction(systemId: any) {
    const loyalties = (this._loyalties as Record<string, Record<string, number>>)[systemId] ?? {};
    let bestFaction = null;
    let bestValue = CONTROL_THRESHOLD - 1;

    for (const [fId, val] of (Object.entries(loyalties) as [string, number][])) {
      if (val > bestValue) {
        bestValue = val;
        bestFaction = fId;
      }
    }

    return bestFaction ?? 'neutral';
  }

  /**
   * Get loyalty trend (rising / falling / stable) for a faction at a system.
   * Compares current vs previous turn.
   * @param {string} systemId
   * @param {string} factionId
   * @returns {'rising'|'falling'|'stable'}
   */
  getTrend(systemId: any, factionId: any) {
    const current = this.getLoyalty(systemId, factionId);
    const previous = (this._previousLoyalties as Record<string, Record<string, number>>)[systemId]?.[factionId] ?? current;
    if (current > previous) return 'rising';
    if (current < previous) return 'falling';
    return 'stable';
  }

  /**
   * Get all loyalty values for a system.
   * @param {string} systemId
   * @returns {Object} factionId → value map (copy)
   */
  getAllLoyalties(systemId: any) {
    return { ...((this._loyalties as Record<string, Record<string, number>>)[systemId] ?? {}) };
  }

  // ─── Passive Drift ───────────────────────────────────────────────────────────

  /**
   * Apply passive loyalty drift to all systems for one maintenance tick.
   * Drift applies before resource production (FR-LS-002).
   *
   * @param {Object[]} systems — Galaxy systems array (mutated: loyalty, loyaltyValue)
   * @param {Function} [isOccupied] — (systemId) → { occupied: bool, occupierFactionId }
   * @returns {Array<{systemId, message}>} Notifications generated
   */
  applyPassiveDrift(systems: any, isOccupied: ((id: string) => any) | null = null) {
    const notifications: any[] = [];

    // Snapshot current values for trend calculation
    for (const system of systems) {
      (this._previousLoyalties as Record<string, Record<string, number>>)[system.id] = { ...(this._loyalties as Record<string, Record<string, number>>)[system.id] };
    }

    for (const system of systems) {
      const loyalties = (this._loyalties as Record<string, Record<string, number>>)[system.id] ?? {};
      const controller = this.getControllingFaction(system.id);
      const occupationInfo = isOccupied ? isOccupied(system.id) : { occupied: false };

      for (const fId of this.factionIds) {
        const current = loyalties[fId] ?? 0;

        if (occupationInfo.occupied) {
          // Military occupation drift (FR-LS-002)
          if (fId === controller) {
            // Passive drift floor does NOT apply under occupation (FR-LS-005)
            const raw = Math.max(0, current + OCCUPATION_DRIFT_CONTROLLER);
            loyalties[fId] = Math.min(100, raw);
          } else if (fId === occupationInfo.occupierFactionId) {
            loyalties[fId] = Math.min(100, current + OCCUPATION_DRIFT_OCCUPIER);
          }
          // Other factions unchanged during occupation
        } else {
          // Normal passive drift (FR-LS-002)
          if (fId === controller) {
            // Passive drift cannot reduce controlling faction below PASSIVE_DRIFT_FLOOR (FR-LS-005)
            const proposed = current + DRIFT_TOWARD_CONTROLLER;
            loyalties[fId] = Math.min(100, Math.max(current, proposed > PASSIVE_DRIFT_FLOOR ? proposed : Math.max(current, PASSIVE_DRIFT_FLOOR)));
          } else {
            // Non-controlling factions erode, floor at 0
            const proposed = current + DRIFT_FROM_NON_CONTROLLER;
            loyalties[fId] = Math.max(0, proposed);
          }
        }
      }

      (this._loyalties as Record<string, Record<string, number>>)[system.id] = loyalties;
    }

    // Sync controlling faction on all systems after drift
    for (const system of systems) {
      this._syncSystemControl(system);
    }

    return notifications;
  }

  // ─── Defection Checks ────────────────────────────────────────────────────────

  /**
   * Process defection checks for systems with controlling-faction loyalty < DEFECTION_TRIGGER.
   * Spec: FR-LS-004
   *
   * @param {Object[]} systems
   * @param {string} seed — Seeded random seed (turn-based for determinism)
   * @returns {Array<{systemId, systemName, oldFaction, message}>} Defection events
   */
  processDefections(systems: any, seed: any) {
    const rng = new SeededRandom(`defection-${seed}`);
    const events = [];

    for (const system of systems) {
      const controller = system.loyalty;
      if (!controller || controller === 'neutral') continue;

      const loyalty = this.getLoyalty(system.id, controller);
      if (loyalty >= DEFECTION_TRIGGER) continue;

      // Defection probability: (30 - loyalty) × 3
      const threshold = (DEFECTION_TRIGGER - loyalty) * 3;
      const roll = rng.nextInt(1, 100);

      if (roll <= threshold) {
        // Defection: transfer to Neutral
        const oldFaction = controller;
        this._executeDefection(system, oldFaction);

        events.push({
          systemId:   system.id,
          systemName: system.name,
          oldFaction,
          message:    `${system.name} has defected!`
        });

        console.log(`[LoyaltyStateManager] DEFECTION: ${system.name} left ${oldFaction} (loyalty ${loyalty}, roll ${roll}/${threshold})`);
      }
    }

    return events;
  }

  /** @private */
  _executeDefection(system: any, oldFaction: any) {
    // System becomes neutral — all factions reset their loyalty to current values unchanged
    // except the old controller which is cleared
    system.loyalty = 'neutral';
    system.loyaltyValue = 0;

    // Deal 1 HP damage to each facility (FR-LS-004)
    if (system.facilities) {
      for (const facility of system.facilities) {
        facility.hp = Math.max(0, (facility.hp ?? facility.level ?? 1) - 1);
      }
    }
  }

  // ─── System Capture (spec 027) ────────────────────────────────────────────────

  /**
   * Apply loyalty changes on military capture (FR-SCP-002).
   * @param {Object} system — System being captured
   * @param {string} attackerFactionId
   * @param {string} defenderFactionId — Former controlling faction
   */
  applyCaptureLoyalty(system: any, attackerFactionId: any, defenderFactionId: any) {
    const attackerLoyalty = this.getLoyalty(system.id, attackerFactionId);
    const defenderLoyalty = this.getLoyalty(system.id, defenderFactionId);

    let isLiberation = false;

    // Liberation path: attacker has ≥ 60 loyalty (FR-SCP-006)
    if (attackerLoyalty >= 60) {
      isLiberation = true;
      this.setLoyalty(system.id, attackerFactionId, Math.min(100, attackerLoyalty + 20));
    } else {
      // Standard capture: set to max(30, current_attacker_loyalty)
      this.setLoyalty(system.id, attackerFactionId, Math.max(30, attackerLoyalty));
    }

    // Former controller takes a -30 penalty
    this.setLoyalty(system.id, defenderFactionId, Math.max(0, defenderLoyalty - 30));

    // Reset troops
    system.troops = 0;

    // Apply facility damage (FR-SCP-003)
    if (system.facilities) {
      for (const facility of system.facilities) {
        const maxHp = facility.level ?? 1;
        facility.hp = Math.max(0, (facility.hp ?? maxHp) - 1);
        // Below 50% HP → inoperative
        facility.inoperative = (facility.hp < maxHp * 0.5);
      }
    }

    // Sync control
    this._syncSystemControl(system);

    return { isLiberation };
  }

  // ─── Diplomatic Conversion (FR-SCP-007) ──────────────────────────────────────

  /**
   * Check and process peaceful diplomatic conversions at end of maintenance.
   * A non-controlling faction whose loyalty equals or exceeds the controller's
   * loyalty (and both ≥ 40) takes control peacefully.
   *
   * @param {Object[]} systems
   * @param {number} currentTurn
   * @returns {Array<{systemId, systemName, fromFaction, toFaction, message}>}
   */
  processDiplomaticConversions(systems: any, currentTurn: any) {
    const events = [];

    for (const system of systems) {
      // Skip systems under a diplomatic hold
      const hold = (this._diplomaticHolds as Record<string, any>)[system.id];
      if (hold && hold.expiryTurn > currentTurn) continue;

      const controller = system.loyalty;
      if (!controller || controller === 'neutral') {
        // Check if any faction has reached ≥ 40 to take control of a neutral system
        const loyalties = (this._loyalties as Record<string, Record<string, number>>)[system.id] ?? {};
        let bestFaction = null;
        let bestValue = CONTROL_THRESHOLD - 1;
        for (const [fId, val] of (Object.entries(loyalties) as [string, number][])) {
          if (val > bestValue) { bestValue = val; bestFaction = fId; }
        }
        if (bestFaction) {
          system.loyalty = bestFaction;
          system.loyaltyValue = bestValue;
          events.push({
            systemId:   system.id,
            systemName: system.name,
            fromFaction: 'neutral',
            toFaction:   bestFaction,
            message:     `${system.name} has come under ${bestFaction} control`
          });
        }
        continue;
      }

      // Check if a rival faction has surpassed the controller
      const controllerLoyalty = this.getLoyalty(system.id, controller);
      if (controllerLoyalty < CONTROL_THRESHOLD) continue;

      const loyalties = (this._loyalties as Record<string, Record<string, number>>)[system.id] ?? {};
      for (const [fId, val] of (Object.entries(loyalties) as [string, number][])) {
        if (fId === controller) continue;
        if (val < CONTROL_THRESHOLD) continue;
        if (val >= controllerLoyalty) {
          // Diplomatic conversion (FR-SCP-007)
          const fromFaction = controller;
          system.loyalty = fId;
          system.loyaltyValue = val;
          events.push({
            systemId:   system.id,
            systemName: system.name,
            fromFaction,
            toFaction:   fId,
            message:     `${system.name} has diplomatically converted to ${fId}`
          });
          break;
        }
      }
    }

    return events;
  }

  // ─── Diplomatic Hold (FR-SCP-007) ────────────────────────────────────────────

  /**
   * Place a 3-turn diplomatic hold on a system (prevents Diplomatic Conversion).
   * Cost to the caller: 200 influence (handled by caller).
   * @param {string} systemId
   * @param {number} currentTurn
   */
  placeDiplomaticHold(systemId: any, currentTurn: any) {
    (this._diplomaticHolds as Record<string, any>)[systemId] = { expiryTurn: currentTurn + 3 };
    console.log(`[LoyaltyStateManager] Diplomatic hold placed on ${systemId} until turn ${currentTurn + 3}`);
  }

  // ─── Production Bonuses ───────────────────────────────────────────────────────

  /**
   * Add a timed production bonus (Trade Agreement or Resource Investment).
   * @param {string} systemId
   * @param {string} factionId
   * @param {'tradeAgreement'|'resourceInvestment'} type
   * @param {number} value — Multiplier bonus (e.g. 0.10 for +10%)
   * @param {number} turnsLeft — Duration in turns; -1 = permanent
   */
  addTimedBonus(systemId: any, factionId: any, type: any, value: any, turnsLeft: any) {
    (this._timedBonuses as any[]).push({ systemId, factionId, type, value, turnsLeft });
    console.log(`[LoyaltyStateManager] Bonus added: ${type} at ${systemId} for ${factionId} (+${Math.round(value * 100)}% × ${turnsLeft === -1 ? 'permanent' : turnsLeft + ' turns'})`);
  }

  /**
   * Advance timed bonuses one turn and return expired ones.
   * @returns {Array} Expired bonus objects
   */
  advanceTimedBonuses() {
    const expired: any[] = [];
    this._timedBonuses = (this._timedBonuses as any[]).filter((b: any) => {
      if (b.turnsLeft === -1) return true; // permanent
      b.turnsLeft--;
      if (b.turnsLeft <= 0) { expired.push(b); return false; }
      return true;
    });
    return expired;
  }

  /**
   * Get active production bonuses for a system + faction pair.
   * @param {string} systemId
   * @param {string} factionId
   * @returns {{ creditsMod: number, materialsMod: number }} Combined multiplier bonuses
   */
  getProductionBonuses(systemId: any, factionId: any) {
    let creditsMod = 0;
    let materialsMod = 0;

    for (const b of this._timedBonuses) {
      if (b.systemId !== systemId || b.factionId !== factionId) continue;
      if (b.type === 'tradeAgreement') {
        creditsMod   += b.value;
        materialsMod += b.value;
      } else if (b.type === 'resourceInvestment') {
        materialsMod += b.value;
      }
    }

    return { creditsMod, materialsMod };
  }

  /**
   * Check if a Trade Agreement is already active for a system (no stacking, FR-DA-002).
   * @param {string} systemId
   * @returns {boolean}
   */
  hasActiveTradeAgreement(systemId: any) {
    return this._timedBonuses.some((b: any) => b.systemId === systemId && b.type === 'tradeAgreement');
  }

  /**
   * Count active Resource Investments at a system (max 2, FR-DA-003).
   * @param {string} systemId
   * @returns {number}
   */
  countResourceInvestments(systemId: any) {
    return (this._timedBonuses as any[]).filter((b: any) => b.systemId === systemId && b.type === 'resourceInvestment').length;
  }

  // ─── Action History ───────────────────────────────────────────────────────────

  /**
   * Record a diplomatic action in the per-system history (last 5 turns).
   * @param {string} systemId
   * @param {string} factionId
   * @param {string} type
   * @param {number} turn
   */
  recordActionHistory(systemId: any, factionId: any, type: any, turn: any) {
    if (!(this._actionHistory as Record<string, any[]>)[systemId]) (this._actionHistory as Record<string, any[]>)[systemId] = [];
    (this._actionHistory as Record<string, any[]>)[systemId].push({ turn, type, factionId });
    // Keep only the last 5 entries
    if ((this._actionHistory as Record<string, any[]>)[systemId].length > 5) {
      (this._actionHistory as Record<string, any[]>)[systemId].shift();
    }
  }

  /**
   * Get diplomatic action history for a system.
   * @param {string} systemId
   * @returns {Array}
   */
  getActionHistory(systemId: any) {
    return [...((this._actionHistory as Record<string, any[]>)[systemId] ?? [])];
  }

  // ─── High-Loyalty Effects (specs 024, 026) ────────────────────────────────────

  /**
   * Apply end-of-maintenance high-loyalty bonuses.
   * - Loyalty 100: +1 influence per turn to controlling faction (FR-LE-004)
   * - Loyalty 80+: +1 troop per turn (FR-LE-003)
   * @param {Object[]} systems
   * @param {Object} resourceStates — factionId → ResourceStateManager
   * @param {Object} resourceEngine
   * @param {number} currentTurn
   */
  applyHighLoyaltyBonuses(systems: any, resourceStates: any, resourceEngine: any, currentTurn: any) {
    for (const system of systems) {
      const controller = system.loyalty;
      if (!controller || controller === 'neutral') continue;

      const loyalty = this.getLoyalty(system.id, controller);
      const rsm = resourceStates[controller];

      // Loyalty 100: +1 influence per turn (FR-LE-004)
      if (loyalty >= 100 && rsm && resourceEngine) {
        resourceEngine.applyProduction(rsm.state, { credits: 0, materials: 0, recruits: 0, influence: 1 }, currentTurn);
      }

      // Loyalty 80+: +1 troop generation per turn (FR-LE-003)
      if (loyalty >= 80) {
        system.troops = (system.troops ?? 0) + 1;
      }
    }
  }

  /**
   * Apply low-loyalty instability effects and warnings.
   * Systems at loyalty 30–39 halt troop generation (FR-LE-005).
   * @param {Object[]} systems
   * @param {string} playerFactionId — For generating player-specific warnings
   * @returns {Array<{systemId, message}>} Low-loyalty warnings for the player
   */
  applyLowLoyaltyEffects(systems: any, playerFactionId: any) {
    const warnings = [];

    for (const system of systems) {
      const controller = system.loyalty;
      if (!controller || controller === 'neutral') continue;

      const loyalty = this.getLoyalty(system.id, controller);

      // Instability range 30–39: halt troop generation
      if (loyalty >= 30 && loyalty < CONTROL_THRESHOLD) {
        // Troop generation halts — already handled by drift floor/Neutral check
        // but explicitly suppress any positive troop growth
        if (system.troops > (system.troops ?? 0)) {
          system.troops = system.troops; // no-op guard
        }
      }

      // Warn player about their own systems in 30–39 range (FR-LE-005)
      if (controller === playerFactionId && loyalty >= 30 && loyalty < 40) {
        warnings.push({
          systemId: system.id,
          message: `Low loyalty warning: ${system.name} (${loyalty}% — approaching defection)`
        });
      }
    }

    return warnings;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Synchronize `system.loyalty` and `system.loyaltyValue` from the loyalty map.
   * @param {Object} system
   * @private
   */
  _syncSystemControl(system: any) {
    const controller = this.getControllingFaction(system.id);
    system.loyalty = controller;
    system.loyaltyValue = (controller === 'neutral')
      ? 0
      : ((this._loyalties as Record<string, Record<string, number>>)[system.id]?.[controller] ?? 0);
    // Keep system.loyalties reference in sync
    if ((this._loyalties as Record<string, Record<string, number>>)[system.id]) {
      system.loyalties = (this._loyalties as Record<string, Record<string, number>>)[system.id];
    }
  }

  // ─── Serialization ────────────────────────────────────────────────────────────

  /**
   * Serialize to a plain object for save data.
   * FR-LS-007: values are truncated to integers in [0, 100].
   * @returns {Object}
   */
  serialize() {
    const loyalties: Record<string, Record<string, number>> = {};
    for (const [sysId, factionMap] of (Object.entries(this._loyalties) as [string, Record<string, number>][])) {
      loyalties[sysId] = {};
      for (const [fId, val] of (Object.entries(factionMap) as [string, number][])) {
        loyalties[sysId][fId] = Math.max(0, Math.min(100, Math.trunc(val)));
      }
    }

    return {
      _version: 1,
      loyalties,
      diplomaticHolds: { ...this._diplomaticHolds },
      actionHistory:   { ...this._actionHistory },
      timedBonuses:    JSON.parse(JSON.stringify(this._timedBonuses))
    };
  }

  /**
   * Restore from serialized data and re-apply to galaxy systems.
   * @param {Object} data — Output of serialize()
   * @param {Object[]} systems — Galaxy systems to sync
   * @param {string[]} [factionIds]
   * @returns {LoyaltyStateManager}
   */
  static deserialize(data: any, systems: any, factionIds = FACTION_IDS) {
    if (!data || data._version !== 1) {
      throw new Error('[LoyaltyStateManager] Cannot deserialize: missing or incompatible data');
    }

    const mgr = new LoyaltyStateManager(factionIds);
    mgr._loyalties       = data.loyalties       ?? {};
    mgr._diplomaticHolds = data.diplomaticHolds  ?? {};
    mgr._actionHistory   = data.actionHistory    ?? {};
    mgr._timedBonuses    = data.timedBonuses      ?? [];

    // Sync loaded values back onto systems
    for (const system of systems) {
      if (mgr._loyalties[system.id]) {
        system.loyalties = mgr._loyalties[system.id];
        mgr._syncSystemControl(system);
      }
    }

    console.log('[LoyaltyStateManager] Deserialized');
    return mgr;
  }
}
