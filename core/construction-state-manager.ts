/**
 * ConstructionStateManager — Per-system construction queues, facility state,
 * ground troops, and faction base tracking.
 *
 * Specs:
 *   017-base-types-spec.md         (FR-BT-001 through FR-BT-006)
 *   018-facility-construction-spec.md (FR-FC2-001 through FR-FC2-008)
 *   019-base-management-spec.md    (FR-BM-001 through FR-BM-007)
 *   020-planetary-defenses-spec.md (FR-PD-001 through FR-PD-007)
 */

import { applyVariance } from './timescale-config.js';

// ─── ID helpers ──────────────────────────────────────────────────────────────

let _facilityIdCounter = 1;
let _queueIdCounter    = 1;
let _baseIdCounter     = 1;

function _newFacilityId() { return `fac-${_facilityIdCounter++}`; }
function _newQueueId()    { return `qitem-${_queueIdCounter++}`; }
function _newBaseId()     { return `base-${_baseIdCounter++}`; }

// ─── ConstructionStateManager ─────────────────────────────────────────────────

export class ConstructionStateManager {
  config: any;
  systemStates: any = {};
  factionStates: any = {};

  /**
   * @param {string[]} factionIds - All active faction IDs
   * @param {Object} config - Loaded construction-config.json
   */
  constructor(factionIds: any, config: any) {
    this.config = config;

    /**
     * systemStates: systemId → SystemConstructionState
     * SystemConstructionState: {
     *   systemId: string,
     *   facilities: FacilityInstance[],
     *   queue: QueueItem[],
     *   groundTroops: number
     * }
     * FacilityInstance: {
     *   id: string,          // unique instance id
     *   facilityId: string,  // type key (e.g. 'shipyard')
     *   level: number,
     *   currentHP: number,
     *   maxHP: number
     * }
     * QueueItem: {
     *   id: string,
     *   facilityId: string,  // facility type key OR base type key
     *   action: 'build' | 'upgrade' | 'repair' | 'demolish',
     *   turnsRemaining: number,
     *   cost: { credits?, materials? },
     *   started: boolean,
     *   targetFacilityId?: string  // for upgrade/repair/demolish, the instance id
     * }
     */
    this.systemStates = {};

    /**
     * factionStates: factionId → FactionBaseState
     * FactionBaseState: {
     *   factionId: string,
     *   bases: BaseInstance[],
     *   secretBaseClues: number  // only relevant for union
     * }
     * BaseInstance: {
     *   id: string,
     *   baseTypeId: string,  // e.g. 'secretBase', 'sectorHQ', 'outpost'
     *   systemId: string,
     *   currentHP: number,
     *   maxHP: number
     * }
     */
    this.factionStates = {};

    for (const factionId of factionIds) {
      this.factionStates[factionId] = {
        factionId,
        bases: [],
        secretBaseClues: 0
      };
    }
  }

  // ─── System state accessors ───────────────────────────────────────────────

  /**
   * Get or create a system state record.
   * @param {string} systemId
   * @returns {Object} SystemConstructionState
   */
  getOrCreateSystemState(systemId: any) {
    if (!this.systemStates[systemId]) {
      this.systemStates[systemId] = {
        systemId,
        facilities: [],
        queue: [],
        groundTroops: 0
      };
    }
    return this.systemStates[systemId];
  }

  /**
   * Get system state without creating if absent.
   * @param {string} systemId
   * @returns {Object|null}
   */
  getSystemState(systemId: any) {
    return this.systemStates[systemId] ?? null;
  }

  /**
   * Get all facilities at a system.
   * @param {string} systemId
   * @returns {Array}
   */
  getFacilities(systemId: any) {
    return this.systemStates[systemId]?.facilities ?? [];
  }

  /**
   * Get construction queue for a system.
   * @param {string} systemId
   * @returns {Array}
   */
  getQueue(systemId: any) {
    return this.systemStates[systemId]?.queue ?? [];
  }

  /**
   * Get ground troops at a system.
   * @param {string} systemId
   * @returns {number}
   */
  getGroundTroops(systemId: any) {
    return this.systemStates[systemId]?.groundTroops ?? 0;
  }

  /**
   * Set ground troops at a system (clamped to 0–max).
   * @param {string} systemId
   * @param {number} value
   */
  setGroundTroops(systemId: any, value: any) {
    const state = this.getOrCreateSystemState(systemId);
    state.groundTroops = Math.max(0, Math.min(value, this.config.groundTroopsMax));
  }

  // ─── Faction base accessors ───────────────────────────────────────────────

  /**
   * Get all bases for a faction.
   * @param {string} factionId
   * @returns {Array}
   */
  getBases(factionId: any) {
    return this.factionStates[factionId]?.bases ?? [];
  }

  /**
   * Get the base at a specific system for a faction.
   * @param {string} factionId
   * @param {string} systemId
   * @returns {Object|null}
   */
  getBaseAtSystem(factionId: any, systemId: any) {
    return this.factionStates[factionId]?.bases.find((b: any) => b.systemId === systemId) ?? null;
  }

  /**
   * Get secret base clue count (union only).
   * @param {string} factionId
   * @returns {number}
   */
  getSecretBaseClues(factionId: any) {
    return this.factionStates[factionId]?.secretBaseClues ?? 0;
  }

  /**
   * Add a discovery clue for the Union's Secret Base.
   * Returns true if newly discovered (clues reached threshold).
   * @param {number} count - Number of clues to add (default 1)
   * @returns {boolean} True if secret base is now discovered
   */
  addSecretBaseClue(count = 1) {
    const fs = this.factionStates['union'];
    if (!fs) return false;
    const wasDiscovered = fs.secretBaseClues >= this.config.baseTypes.union.discoveryCluesRequired;
    fs.secretBaseClues = Math.min(
      fs.secretBaseClues + count,
      this.config.baseTypes.union.discoveryCluesRequired
    );
    const isDiscovered = fs.secretBaseClues >= this.config.baseTypes.union.discoveryCluesRequired;
    return !wasDiscovered && isDiscovered;
  }

  /**
   * Check if Union's Secret Base has been discovered.
   * @returns {boolean}
   */
  isSecretBaseDiscovered() {
    const fs = this.factionStates['union'];
    if (!fs) return false;
    return fs.secretBaseClues >= this.config.baseTypes.union.discoveryCluesRequired;
  }

  // ─── Facility CRUD ────────────────────────────────────────────────────────

  /**
   * Add a completed facility to a system.
   * @param {string} systemId
   * @param {string} facilityId - e.g. 'shipyard'
   * @param {number} level
   * @returns {Object} The new FacilityInstance
   */
  addFacility(systemId: any, facilityId: any, level = 1) {
    const state   = this.getOrCreateSystemState(systemId);
    const def     = this.config.facilityTypes[facilityId];
    const maxHP   = def?.maxHP ?? 5;
    const instance = {
      id:         _newFacilityId(),
      facilityId,
      level,
      currentHP:  maxHP,
      maxHP
    };
    state.facilities.push(instance);
    return instance;
  }

  /**
   * Remove a facility instance from a system.
   * @param {string} systemId
   * @param {string} instanceId
   * @returns {boolean} True if removed
   */
  removeFacility(systemId: any, instanceId: any) {
    const state = this.systemStates[systemId];
    if (!state) return false;
    const idx = state.facilities.findIndex((f: any) => f.id === instanceId);
    if (idx === -1) return false;
    state.facilities.splice(idx, 1);
    return true;
  }

  /**
   * Deal damage to a facility.
   * Returns the updated facility instance (or null if not found).
   * @param {string} systemId
   * @param {string} instanceId
   * @param {number} damage
   * @returns {Object|null}
   */
  damageFacility(systemId: any, instanceId: any, damage: any) {
    const state = this.systemStates[systemId];
    if (!state) return null;
    const fac = state.facilities.find((f: any) => f.id === instanceId);
    if (!fac) return null;
    fac.currentHP = Math.max(0, fac.currentHP - damage);
    return fac;
  }

  /**
   * Repair a facility instance by `amount` HP.
   * @param {string} systemId
   * @param {string} instanceId
   * @param {number} amount
   * @returns {Object|null}
   */
  repairFacility(systemId: any, instanceId: any, amount: any) {
    const state = this.systemStates[systemId];
    if (!state) return null;
    const fac = state.facilities.find((f: any) => f.id === instanceId);
    if (!fac) return null;
    fac.currentHP = Math.min(fac.maxHP, fac.currentHP + amount);
    return fac;
  }

  // ─── Base CRUD ────────────────────────────────────────────────────────────

  /**
   * Add a base for a faction at a system.
   * @param {string} factionId
   * @param {string} systemId
   * @param {string} baseTypeId - e.g. 'secretBase', 'sectorHQ', 'outpost'
   * @returns {Object} The new BaseInstance
   */
  addBase(factionId: any, systemId: any, baseTypeId: any) {
    const fs         = this.factionStates[factionId];
    if (!fs) return null;
    const def        = this.config.baseTypes[factionId];
    const maxHP      = def?.maxHP ?? 5;
    const instance   = {
      id:         _newBaseId(),
      baseTypeId,
      systemId,
      currentHP:  maxHP,
      maxHP
    };
    fs.bases.push(instance);
    return instance;
  }

  /**
   * Remove a base by its instance id for a faction.
   * @param {string} factionId
   * @param {string} baseId
   * @returns {boolean}
   */
  removeBase(factionId: any, baseId: any) {
    const fs = this.factionStates[factionId];
    if (!fs) return false;
    const idx = fs.bases.findIndex((b: any) => b.id === baseId);
    if (idx === -1) return false;
    fs.bases.splice(idx, 1);
    return true;
  }

  /**
   * Deal damage to a base.
   * @param {string} factionId
   * @param {string} baseId
   * @param {number} damage
   * @returns {Object|null}
   */
  damageBase(factionId: any, baseId: any, damage: any) {
    const fs = this.factionStates[factionId];
    if (!fs) return null;
    const base = fs.bases.find((b: any) => b.id === baseId);
    if (!base) return null;
    base.currentHP = Math.max(0, base.currentHP - damage);
    return base;
  }

  // ─── Queue management ─────────────────────────────────────────────────────

  /**
   * Add an item to a system's construction queue.
   * @param {string} systemId
   * @param {Object} item - { facilityId, action, turnsRemaining, cost, targetFacilityId? }
   * @returns {{ success: boolean, id?: string, error?: string }}
   */
  enqueue(systemId: any, item: any) {
    const state = this.getOrCreateSystemState(systemId);
    const maxSlots = this._getQueueSlots(systemId);
    if (state.queue.length >= maxSlots) {
      return { success: false, error: `Queue full (max ${maxSlots} items)` };
    }
    const qid = _newQueueId();
    const qitem = {
      id:              qid,
      facilityId:      item.facilityId,
      action:          item.action,
      turnsRemaining:  item.turnsRemaining,
      cost:            { ...(item.cost ?? {}) },
      started:         false,
      targetFacilityId: item.targetFacilityId ?? null,
      completionTurn:  item.currentQuarterTurn != null
        ? item.currentQuarterTurn + applyVariance(item.turnsRemaining, qid)
        : null
    };
    state.queue.push(qitem);
    return { success: true, id: qitem.id };
  }

  /**
   * Return (and remove) all queued items whose completionTurn <= quarterTurn.
   * Used by the sub-turn resolution pass.
   * @param {number} quarterTurn
   * @returns {Array<{ systemId: string, qitem: Object }>}
   */
  getCompletedAtQuarterTurn(quarterTurn: any) {
    const completed = [];
    for (const [systemId, state] of (Object.entries(this.systemStates) as [string, any][])) {
      const remaining = [];
      for (const qitem of state.queue) {
        if (qitem.completionTurn != null && qitem.completionTurn <= quarterTurn) {
          completed.push({ systemId, qitem });
        } else {
          remaining.push(qitem);
        }
      }
      state.queue = remaining;
    }
    return completed;
  }

  /**
   * Remove a queued item (cancel).
   * @param {string} systemId
   * @param {string} qitemId
   * @returns {{ success: boolean, item?: Object }}
   */
  dequeue(systemId: any, qitemId: any) {
    const state = this.systemStates[systemId];
    if (!state) return { success: false };
    const idx = state.queue.findIndex((q: any) => q.id === qitemId);
    if (idx === -1) return { success: false };
    const [item] = state.queue.splice(idx, 1);
    return { success: true, item };
  }

  /**
   * Reorder the construction queue for a system.
   * @param {string} systemId
   * @param {string[]} orderedIds - Queue item IDs in desired order
   */
  reorderQueue(systemId: any, orderedIds: any) {
    const state = this.systemStates[systemId];
    if (!state) return;
    const map = Object.fromEntries(state.queue.map((q: any) => [q.id, q]));
    const reordered = orderedIds.map((id: any) => map[id]).filter(Boolean);
    // Keep any items not in orderedIds at the end
    const remaining = state.queue.filter((q: any) => !orderedIds.includes(q.id));
    state.queue = [...reordered, ...remaining];
  }

  /**
   * Advance the first item in each system queue by 1 turn.
   * Returns completed items: [{ systemId, qitem }]
   * @returns {Array}
   */
  advanceAllQueues() {
    const completed = [];
    for (const [systemId, state] of (Object.entries(this.systemStates) as [string, any][])) {
      if (state.queue.length === 0) continue;

      const first = state.queue[0];
      first.started = true;
      first.turnsRemaining = Math.max(0, first.turnsRemaining - 1);

      if (first.turnsRemaining === 0) {
        state.queue.shift();
        completed.push({ systemId, qitem: first });
      }
    }
    return completed;
  }

  /**
   * Get number of queue slots for a system (increased by Shipyard Lvl 2+).
   * @param {string} systemId
   * @returns {number}
   */
  _getQueueSlots(systemId: any) {
    const base      = this.config.queueMaxSize ?? 3;
    const state     = this.systemStates[systemId];
    if (!state) return base;
    const shipyard  = state.facilities.find((f: any) => f.facilityId === 'shipyard');
    return shipyard && shipyard.level >= 2 ? base + (shipyard.level - 1) : base;
  }

  // ─── Bonus computation ────────────────────────────────────────────────────

  /**
   * Compute the combined facility + base production bonus multipliers for a system.
   * Returns { creditsMultiplier, materialsMultiplier, recruitsMultiplier, influenceFlat, fleetDefenseBonus }
   *
   * Partial damage (< 50% HP): facility applies only 50% of its bonus.
   * At 0 HP: no bonus.
   *
   * @param {string} systemId
   * @param {string} factionId - Owning faction
   * @returns {Object}
   */
  getSystemBonuses(systemId: any, factionId: any) {
    const state = this.systemStates[systemId];
    const result = {
      creditsMultiplier:   1.0,
      materialsMultiplier: 1.0,
      fleetDefenseBonus:   0.0,
      researchCostReduction: 0.0,
      recruitGenBonus:     0.0,
      influenceFlat:       0,
      raidDamageReduction: 0.0
    };

    const applyFactor = (fac: any) => {
      if (fac.currentHP <= 0) return 0.0;
      return fac.currentHP / fac.maxHP < 0.5 ? 0.5 : 1.0;
    };

    const facilities = state?.facilities ?? [];
    for (const fac of facilities) {
      const def    = this.config.facilityTypes[fac.facilityId];
      if (!def) continue;
      const level  = fac.level ?? 1;
      const efx    = def.levelEffects?.[String(level)] ?? def.effects ?? {};
      const factor = applyFactor(fac);

      if (efx.creditsBonus)          result.creditsMultiplier   += efx.creditsBonus * factor;
      if (efx.materialsBonus)        result.materialsMultiplier += efx.materialsBonus * factor;
      if (efx.fleetDefenseBonus)     result.fleetDefenseBonus   += efx.fleetDefenseBonus * factor;
      if (efx.researchCostReduction) result.researchCostReduction += efx.researchCostReduction * factor;
      if (efx.recruitGenBonus)       result.recruitGenBonus     += efx.recruitGenBonus * factor;
      if (efx.raidDamageReduction)   result.raidDamageReduction += efx.raidDamageReduction * factor;
    }

    // Base type bonuses
    const fs  = this.factionStates[factionId];
    const baseDef = this.config.baseTypes[factionId];
    if (fs && baseDef) {
      const base = fs.bases.find((b: any) => b.systemId === systemId);
      if (base && base.currentHP > 0) {
        const bFactor = base.currentHP / base.maxHP < 0.5 ? 0.5 : 1.0;
        const bEfx    = baseDef.effects ?? {};
        if (bEfx.productionBonus) {
          result.creditsMultiplier   += bEfx.productionBonus * bFactor;
          result.materialsMultiplier += bEfx.productionBonus * bFactor;
        }
        if (bEfx.fleetDefenseBonus) result.fleetDefenseBonus += bEfx.fleetDefenseBonus * bFactor;
      }

      // Autoforge network bonus: +5% per 3 active outposts
      if (factionId === 'autoforge') {
        const activeOutposts = fs.bases.filter(
          (b: any) => b.baseTypeId === 'outpost' && b.currentHP > 0 &&
               b.currentHP / b.maxHP >= 0.5
        ).length;
        const networkTiers = Math.floor(activeOutposts / 3);
        if (networkTiers > 0 && base?.baseTypeId === 'outpost' && base.currentHP > 0) {
          const netBonus = networkTiers * (baseDef.effects?.networkBonusPerThree ?? 0.05);
          result.creditsMultiplier   += netBonus;
          result.materialsMultiplier += netBonus;
        }
      }

      // Autoforge outpost: influence per turn
      if (factionId === 'autoforge' && baseDef.effects?.influencePerTurn) {
        const activeOutposts = fs.bases.filter(
          (b: any) => b.baseTypeId === 'outpost' && b.systemId === systemId && b.currentHP > 0
        ).length;
        result.influenceFlat += activeOutposts * baseDef.effects.influencePerTurn;
      }
    }

    return result;
  }

  /**
   * Get per-system invasion defense modifiers (for FR-PD-002).
   * Returns { defenseModifier, shieldPresent, ionCannonPresent, ionCannonInstanceId }
   * @param {string} systemId
   * @returns {Object}
   */
  getInvasionModifiers(systemId: any) {
    const facilities = this.getFacilities(systemId);
    let defenseModifier   = 0;
    let shieldPresent     = false;
    let shieldHP          = 0;
    let ionCannonPresent  = false;
    let ionCannonInstanceId = null;

    for (const fac of facilities) {
      if (fac.currentHP <= 0) continue;
      if (fac.facilityId === 'defense') {
        const def = this.config.facilityTypes.defense;
        defenseModifier += def.effects.invasionDefenseModifier ?? 0.15;
      }
      if (fac.facilityId === 'shield') {
        shieldPresent = true;
        shieldHP = fac.currentHP;
      }
      if (fac.facilityId === 'ion_cannon') {
        ionCannonPresent    = true;
        ionCannonInstanceId = fac.id;
      }
    }
    return { defenseModifier, shieldPresent, shieldHP, ionCannonPresent, ionCannonInstanceId };
  }

  /**
   * Get troop generation rate per turn for a system.
   * @param {string} systemId
   * @param {string} factionId
   * @param {number} loyaltyValue
   * @returns {number}
   */
  getTroopGenerationRate(systemId: any, factionId: any, loyaltyValue: any) {
    if (loyaltyValue < this.config.groundTroopsLoyaltyThreshold) return 0;
    let rate = this.config.groundTroopsBaseGenPerTurn;
    const facilities = this.getFacilities(systemId);
    for (const fac of facilities) {
      if (fac.facilityId === 'training' && fac.currentHP > 0) {
        const def = this.config.facilityTypes.training;
        const efx = def.levelEffects?.[String(fac.level)] ?? def.effects;
        rate += (efx?.troopsPerTurn ?? 1);
      }
    }
    return rate;
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  /**
   * Serialize state to a plain object for save/load.
   * @returns {Object}
   */
  serialize() {
    return {
      version: 1,
      systemStates:  this.systemStates,
      factionStates: this.factionStates,
      counters: {
        facilityIdCounter: _facilityIdCounter,
        queueIdCounter:    _queueIdCounter,
        baseIdCounter:     _baseIdCounter
      }
    };
  }

  /**
   * Restore state from a serialized object.
   * @param {Object} data - From serialize()
   * @param {string[]} factionIds
   * @param {Object} config
   * @returns {ConstructionStateManager}
   */
  static deserialize(data: any, factionIds: any, config: any) {
    const mgr = new ConstructionStateManager(factionIds, config);
    mgr.systemStates  = data.systemStates  ?? {};
    mgr.factionStates = data.factionStates ?? {};
    if (data.counters) {
      _facilityIdCounter = data.counters.facilityIdCounter ?? _facilityIdCounter;
      _queueIdCounter    = data.counters.queueIdCounter    ?? _queueIdCounter;
      _baseIdCounter     = data.counters.baseIdCounter     ?? _baseIdCounter;
    }
    return mgr;
  }
}
