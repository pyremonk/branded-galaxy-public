/**
 * ConstructionEngine — Construction queue processing, cost calculation, validation,
 * planetary invasion resolution, and facility bonus application.
 *
 * Stateless calculation layer — all mutable state lives in ConstructionStateManager.
 *
 * Specs:
 *   017-base-types-spec.md            (FR-BT-001 through FR-BT-006)
 *   018-facility-construction-spec.md  (FR-FC2-001 through FR-FC2-008)
 *   019-base-management-spec.md        (FR-BM-001 through FR-BM-007)
 *   020-planetary-defenses-spec.md     (FR-PD-001 through FR-PD-007)
 */

import { SeededRandom } from './seeded-random.js';

export class ConstructionEngine {
  csm: any;
  config: any;

  /**
   * @param {import('./construction-state-manager.js').ConstructionStateManager} csm
   * @param {Object} config - Loaded construction-config.json
   */
  constructor(csm: any, config: any) {
    this.csm    = csm;
    this.config = config;
  }

  // ─── Cost helpers ─────────────────────────────────────────────────────────

  /**
   * Get the effective construction cost for a facility, applying faction discounts.
   * Spec: FR-FC2-007
   * @param {string} facilityId - e.g. 'shipyard', 'defense'
   * @param {string} factionId
   * @returns {{ credits: number, materials: number }}
   */
  getEffectiveCost(facilityId: any, factionId: any) {
    const def  = this.config.facilityTypes[facilityId];
    if (!def) return { credits: 0, materials: 0 };
    const base = { ...def.cost };

    const mods = this.config.factionCostModifiers[factionId] ?? {};
    let factor = 1.0;

    if (mods.allFacilities)        factor *= mods.allFacilities;
    if (mods[facilityId])          factor *= mods[facilityId];

    return {
      credits:   Math.ceil((base.credits   ?? 0) * factor),
      materials: Math.ceil((base.materials ?? 0) * factor)
    };
  }

  /**
   * Get the effective upgrade cost (50% of build cost, with faction modifier).
   * @param {string} facilityId
   * @param {string} factionId
   * @returns {{ credits: number, materials: number }}
   */
  getUpgradeCost(facilityId: any, factionId: any) {
    const full   = this.getEffectiveCost(facilityId, factionId);
    const factor = this.config.facilityTypes[facilityId]?.upgradeCostFactor ?? 0.5;
    return {
      credits:   Math.ceil(full.credits   * factor),
      materials: Math.ceil(full.materials * factor)
    };
  }

  /**
   * Get repair cost for restoring a single HP on a facility.
   * Formula: base_build_cost / max_HP × 0.5, rounded up to nearest 10.
   * Spec: FR-BM-002
   * @param {string} facilityId
   * @param {string} factionId
   * @returns {{ credits: number, materials: number }}
   */
  getRepairCostPerHP(facilityId: any, factionId: any) {
    const def  = this.config.facilityTypes[facilityId] ?? this._baseDef(factionId);
    if (!def) return { credits: 0, materials: 0 };
    const maxHP = def.maxHP ?? 5;
    const base  = { ...def.cost };
    const factor = 0.5;

    const perHP = (resource: any) => {
      const raw = ((base[resource] ?? 0) / maxHP) * factor;
      return Math.ceil(raw / 10) * 10;
    };

    return {
      credits:   perHP('credits'),
      materials: perHP('materials')
    };
  }

  // ─── Prerequisite + cap validation ───────────────────────────────────────

  /**
   * Check whether a facility can be queued at a system.
   * Returns { allowed: boolean, reason?: string }
   * Spec: FR-FC2-003, FR-FC2-002 (no duplicate per system)
   * @param {string} systemId
   * @param {string} facilityId
   * @param {string} factionId
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canQueueFacility(systemId: any, facilityId: any, factionId: any) {
    const def = this.config.facilityTypes[facilityId];
    if (!def) return { allowed: false, reason: `Unknown facility type: ${facilityId}` };

    const facilities = this.csm.getFacilities(systemId);

    // No duplicates per system (spec FR-FC2 constraint)
    const alreadyBuilt = facilities.some((f: any) => f.facilityId === facilityId);
    if (alreadyBuilt) return { allowed: false, reason: `${def.name} already built at this system` };

    // Check queue doesn't already contain this type
    const queue = this.csm.getQueue(systemId);
    const inQueue = queue.some((q: any) => q.facilityId === facilityId && q.action === 'build');
    if (inQueue) return { allowed: false, reason: `${def.name} already queued` };

    // Prerequisites
    for (const prereq of (def.prerequisites ?? [])) {
      const hasPrereq = facilities.some((f: any) => f.facilityId === prereq && f.currentHP > 0);
      if (!hasPrereq) {
        const prereqName = this.config.facilityTypes[prereq]?.name ?? prereq;
        return { allowed: false, reason: `Requires ${prereqName} first` };
      }
    }

    // Queue capacity
    const maxSlots = this.csm._getQueueSlots(systemId);
    if (queue.length >= maxSlots) {
      return { allowed: false, reason: `Construction queue full (max ${maxSlots})` };
    }

    return { allowed: true };
  }

  /**
   * Check whether a base can be built at a system.
   * @param {string} systemId
   * @param {string} factionId
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canQueueBase(systemId: any, factionId: any) {
    const baseDef = this.config.baseTypes[factionId];
    if (!baseDef) return { allowed: false, reason: `No base type for faction ${factionId}` };

    const bases = this.csm.getBases(factionId);
    if (bases.length >= baseDef.maxCount) {
      return { allowed: false, reason: `Maximum base count (${baseDef.maxCount}) reached` };
    }
    const existing = bases.find((b: any) => b.systemId === systemId);
    if (existing) return { allowed: false, reason: 'Base already exists at this system' };

    return { allowed: true };
  }

  // ─── Queue operations ─────────────────────────────────────────────────────

  /**
   * Add a facility build to the system queue, deducting resources immediately.
   * Spec: FR-FC2-002 (upfront payment)
   * @param {string} systemId
   * @param {string} facilityId
   * @param {string} factionId
   * @param {Object} resourceState - ResourceStateManager.state
   * @param {import('./resource-engine.js').ResourceEngine} resourceEngine
   * @param {number} currentTurn
   * @returns {{ success: boolean, id?: string, error?: string }}
   */
  queueFacilityBuild(systemId: any, facilityId: any, factionId: any, resourceState: any, resourceEngine: any, currentTurn: any) {
    const check = this.canQueueFacility(systemId, facilityId, factionId);
    if (!check.allowed) return { success: false, error: check.reason };

    const cost = this.getEffectiveCost(facilityId, factionId);
    const def  = this.config.facilityTypes[facilityId];

    const spend = resourceEngine.spendResources(resourceState, cost, `build:${facilityId}`, currentTurn);
    if (!spend.success) return spend;

    return this.csm.enqueue(systemId, {
      facilityId,
      action:         'build',
      turnsRemaining: def.buildTime,
      cost
    });
  }

  /**
   * Add a facility upgrade to the system queue.
   * Spec: FR-FC2-005
   * @param {string} systemId
   * @param {string} instanceId - FacilityInstance.id
   * @param {string} factionId
   * @param {Object} resourceState
   * @param {import('./resource-engine.js').ResourceEngine} resourceEngine
   * @param {number} currentTurn
   * @returns {{ success: boolean, id?: string, error?: string }}
   */
  queueFacilityUpgrade(systemId: any, instanceId: any, factionId: any, resourceState: any, resourceEngine: any, currentTurn: any) {
    const fac  = this.csm.getFacilities(systemId).find((f: any) => f.id === instanceId);
    if (!fac)  return { success: false, error: 'Facility not found' };
    const def  = this.config.facilityTypes[fac.facilityId];
    if (!def?.upgradable)    return { success: false, error: `${def?.name ?? fac.facilityId} cannot be upgraded` };
    if (fac.level >= def.maxLevel) return { success: false, error: 'Already at max level' };
    if (fac.currentHP / fac.maxHP < 0.5) return { success: false, error: 'Facility too damaged to upgrade (must be > 50% HP)' };

    const cost = this.getUpgradeCost(fac.facilityId, factionId);
    const spend = resourceEngine.spendResources(resourceState, cost, `upgrade:${fac.facilityId}`, currentTurn);
    if (!spend.success) return spend;

    const maxSlots = this.csm._getQueueSlots(systemId);
    const queue    = this.csm.getQueue(systemId);
    if (queue.length >= maxSlots) {
      resourceEngine.processRefund(resourceState, cost, 1.0, `upgrade-cancel:${fac.facilityId}`, currentTurn);
      return { success: false, error: 'Queue full' };
    }

    return this.csm.enqueue(systemId, {
      facilityId:       fac.facilityId,
      action:           'upgrade',
      turnsRemaining:   def.upgradeTime ?? 2,
      cost,
      targetFacilityId: instanceId
    });
  }

  /**
   * Add a facility repair to the system queue (1 HP per turn).
   * Spec: FR-BM-002
   * @param {string} systemId
   * @param {string} instanceId
   * @param {string} factionId
   * @param {Object} resourceState
   * @param {import('./resource-engine.js').ResourceEngine} resourceEngine
   * @param {number} currentTurn
   * @returns {{ success: boolean, id?: string, error?: string }}
   */
  queueFacilityRepair(systemId: any, instanceId: any, factionId: any, resourceState: any, resourceEngine: any, currentTurn: any) {
    const fac = this.csm.getFacilities(systemId).find((f: any) => f.id === instanceId);
    if (!fac)                  return { success: false, error: 'Facility not found' };
    if (fac.currentHP <= 0)    return { success: false, error: 'Fully destroyed facilities must be rebuilt' };
    if (fac.currentHP >= fac.maxHP) return { success: false, error: 'Facility is already at full HP' };

    const costPerHP = this.getRepairCostPerHP(fac.facilityId, factionId);
    const spend = resourceEngine.spendResources(resourceState, costPerHP, `repair:${fac.facilityId}`, currentTurn);
    if (!spend.success) return spend;

    const maxSlots = this.csm._getQueueSlots(systemId);
    const queue    = this.csm.getQueue(systemId);
    if (queue.length >= maxSlots) {
      resourceEngine.processRefund(resourceState, costPerHP, 1.0, `repair-cancel:${fac.facilityId}`, currentTurn);
      return { success: false, error: 'Queue full' };
    }

    return this.csm.enqueue(systemId, {
      facilityId:       fac.facilityId,
      action:           'repair',
      turnsRemaining:   1,
      cost:             costPerHP,
      targetFacilityId: instanceId
    });
  }

  /**
   * Queue facility demolition (1 turn, 25% cost refund in materials).
   * Spec: FR-FC2-006
   * @param {string} systemId
   * @param {string} instanceId
   * @param {string} factionId
   * @param {Object} resourceState
   * @param {import('./resource-engine.js').ResourceEngine} resourceEngine
   * @param {number} currentTurn
   * @returns {{ success: boolean, id?: string, error?: string }}
   */
  queueFacilityDemolish(systemId: any, instanceId: any, factionId: any, resourceState: any, resourceEngine: any, currentTurn: any) {
    const fac  = this.csm.getFacilities(systemId).find((f: any) => f.id === instanceId);
    if (!fac)  return { success: false, error: 'Facility not found' };
    const def  = this.config.facilityTypes[fac.facilityId];

    // Check dependent facilities (e.g. Shield Generator or Ion Cannon require Defense Platform)
    const dependents = (Object.values(this.config.facilityTypes) as any[]).filter(
      (d: any) => d.prerequisites?.includes(fac.facilityId)
    );
    const facilities = this.csm.getFacilities(systemId);
    for (const dep of (dependents as any[])) {
      if (facilities.some((f: any) => f.facilityId === dep.id)) {
        return { success: false, error: `Cannot demolish: ${dep.name} depends on ${def?.name}. Demolish it first.` };
      }
    }

    const maxSlots = this.csm._getQueueSlots(systemId);
    const queue    = this.csm.getQueue(systemId);
    if (queue.length >= maxSlots) return { success: false, error: 'Queue full' };

    return this.csm.enqueue(systemId, {
      facilityId:       fac.facilityId,
      action:           'demolish',
      turnsRemaining:   1,
      cost:             {},
      targetFacilityId: instanceId
    });
  }

  /**
   * Cancel a queued item, applying correct refund policy.
   * Started items: no refund. Not-yet-started: 50% refund.
   * Spec: FR-FC2 constraint ("Cancelling a queued item before it starts returns 50% of the cost")
   * @param {string} systemId
   * @param {string} qitemId
   * @param {Object} resourceState
   * @param {import('./resource-engine.js').ResourceEngine} resourceEngine
   * @param {number} currentTurn
   * @returns {{ success: boolean, error?: string }}
   */
  cancelQueueItem(systemId: any, qitemId: any, resourceState: any, resourceEngine: any, currentTurn: any) {
    const result = this.csm.dequeue(systemId, qitemId);
    if (!result.success) return { success: false, error: 'Item not found in queue' };

    const item   = result.item;
    const refund = item.started ? 0.0 : this.config.cancelRefundRate ?? 0.5;
    if (refund > 0 && item.cost && Object.keys(item.cost).length > 0) {
      resourceEngine.processRefund(resourceState, item.cost, refund, `cancel:${item.facilityId}`, currentTurn);
    }
    return { success: true };
  }

  // ─── Resolution phase ─────────────────────────────────────────────────────

  /**
   * Resolve construction completions for this turn.
   * Called during TurnResolutionEngine._resolveConstruction().
   *
   * @param {Object} context - { galaxy, resourceStates, currentTurn }
   * @param {import('./turn-state-manager.js').TurnStateManager} turnStateManager
   * @returns {Array} Completed items: [{ systemId, factionId, qitem }]
   */
  resolveCompletions(context: any, turnStateManager: any) {
    const completed = this.csm.advanceAllQueues();
    const results   = [];

    for (const { systemId, qitem } of completed) {
      // Find owning faction
      const system    = context.galaxy?.systems?.find((s: any) => s.id === systemId);
      const factionId = system?.loyalty;
      if (!factionId || factionId === 'neutral') continue;

      this._applyQueueCompletion(systemId, factionId, qitem, context);

      const facilityDef = this.config.facilityTypes[qitem.facilityId];
      const facilityName = facilityDef?.name ?? qitem.facilityId;
      const systemName   = system?.name ?? systemId;

      const message = `Construction complete: ${facilityName} at ${systemName}`;
      if (turnStateManager) {
        turnStateManager.recordEvent('resolution', message, {
          systemId,
          urgent: false,
          factionId,
          outcome: 'success',
          domain: 'construction',
          systemOwnerFactionId: factionId,
        });
      }

      // Player alert for construction completion (spec 063 FR-PA-009)
      window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
        detail: {
          category:  'construction',
          factionId,
          message,
          outcome:   {
            summary:    message,
            tier:       'Success',
            details:    [
              { label: 'Facility', value: facilityName },
              { label: 'System',   value: systemName   },
            ],
            systemId,
            systemName,
          },
          turn: context.currentTurn ?? 0,
        }
      }));

      window.dispatchEvent(new CustomEvent('galaxy:facilityComplete', {
        detail: { systemId, factionId, facilityId: qitem.facilityId, action: qitem.action, message }
      }));
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: { tier: 'info', message, locationId: systemId, locationCategory: 'construction' }
      }));

      results.push({ systemId, factionId, qitem });
    }

    return results;
  }

  /**
   * Apply the effect of a completed queue item to the system state.
   * @private
   */
  _applyQueueCompletion(systemId: any, factionId: any, qitem: any, context: any) {
    switch (qitem.action) {
      case 'build': {
        this.csm.addFacility(systemId, qitem.facilityId, 1);
        break;
      }
      case 'upgrade': {
        const fac = this.csm.getFacilities(systemId).find((f: any) => f.id === qitem.targetFacilityId);
        if (fac) fac.level = Math.min((fac.level ?? 1) + 1, this.config.facilityTypes[fac.facilityId]?.maxLevel ?? 3);
        break;
      }
      case 'repair': {
        this.csm.repairFacility(systemId, qitem.targetFacilityId, 1);
        const fac = this.csm.getFacilities(systemId).find((f: any) => f.id === qitem.targetFacilityId);
        if (fac && fac.currentHP >= fac.maxHP) {
          window.dispatchEvent(new CustomEvent('galaxy:facilityRepaired', {
            detail: { systemId, factionId, instanceId: fac.id, facilityId: fac.facilityId }
          }));
        }
        break;
      }
      case 'demolish': {
        const fac = this.csm.getFacilities(systemId).find((f: any) => f.id === qitem.targetFacilityId);
        if (fac) {
          const def  = this.config.facilityTypes[fac.facilityId];
          const rate = this.config.demolitionRefundRate ?? 0.25;
          const rsm  = context?.resourceStates?.[factionId];
          if (rsm && def?.cost) {
            // Refund in materials only
            const refundMat = Math.floor((def.cost.materials ?? 0) * rate);
            if (refundMat > 0) {
              rsm.state.resources.materials = Math.min(
                rsm.state.resources.materials + refundMat,
                rsm.state.resourceCaps?.materials ?? Infinity
              );
            }
          }
          this.csm.removeFacility(systemId, fac.id);
        }
        break;
      }
    }
  }

  // ─── Maintenance phase hooks ──────────────────────────────────────────────

  /**
   * Generate ground troops for all faction-controlled systems.
   * Called during _runMaintenancePhase().
   * Spec: FR-PD-001
   * @param {Object} galaxy
   */
  generateGroundTroops(galaxy: any) {
    for (const system of (galaxy?.systems ?? [])) {
      if (!system.loyalty || system.loyalty === 'neutral') continue;
      const loyalty = system.loyaltyValue ?? system.loyaltyScore ?? 75;
      const rate    = this.csm.getTroopGenerationRate(system.id, system.loyalty, loyalty);
      if (rate <= 0) continue;
      const current = this.csm.getGroundTroops(system.id);
      const max     = this.config.groundTroopsMax;
      if (current < max) {
        this.csm.setGroundTroops(system.id, Math.min(current + rate, max));
      }
    }
  }

  /**
   * Seed starting bases for all factions based on faction definitions.
   * Places the base at the faction's first controlled system.
   * Spec: FR-BT-001 (game start)
   * @param {Object} galaxy
   * @param {Object} [factionDefinitions] - Optional: if provided, seed extra autoforge outposts
   */
  seedStartingBases(galaxy: any) {
    const FACTION_BASE_MAP = {
      union:          { typeId: 'secretBase',  count: 1 },
      brandAuthority: { typeId: 'sectorHQ',    count: 1 },
      autoforge:      { typeId: 'outpost',     count: 2 }
    };

    for (const [factionId, { typeId, count }] of Object.entries(FACTION_BASE_MAP)) {
      const controlledSystems = (galaxy?.systems ?? []).filter((s: any) => s.loyalty === factionId);
      const toPlace           = Math.min(count, controlledSystems.length);

      for (let i = 0; i < toPlace; i++) {
        const system = controlledSystems[i];
        if (!this.csm.getBaseAtSystem(factionId, system.id)) {
          this.csm.addBase(factionId, system.id, typeId);
          // Also initialise ground troops
          const current = this.csm.getGroundTroops(system.id);
          if (current === 0) {
            this.csm.setGroundTroops(system.id, 5);
          }
        }
      }
    }
  }

  // ─── Damage application ───────────────────────────────────────────────────

  /**
   * Apply damage to a facility and fire events.
   * @param {string} systemId
   * @param {string} instanceId
   * @param {number} damage
   * @param {string} factionId
   * @returns {Object|null} Updated facility instance
   */
  applyFacilityDamage(systemId: any, instanceId: any, damage: any, factionId: any) {
    const fac = this.csm.damageFacility(systemId, instanceId, damage);
    if (!fac) return null;

    window.dispatchEvent(new CustomEvent('galaxy:facilityDamaged', {
      detail: { systemId, factionId, instanceId, facilityId: fac.facilityId, currentHP: fac.currentHP, maxHP: fac.maxHP }
    }));

    if (fac.currentHP <= 0) {
      window.dispatchEvent(new CustomEvent('galaxy:facilityDestroyed', {
        detail: { systemId, factionId, instanceId, facilityId: fac.facilityId }
      }));
      window.dispatchEvent(new CustomEvent('galaxy:notify', {
        detail: {
          tier: 'warning',
          message: `${this.config.facilityTypes[fac.facilityId]?.name ?? fac.facilityId} destroyed at system ${systemId}`,
          locationId: systemId,
          locationCategory: 'construction'
        }
      }));
    }
    return fac;
  }

  // ─── Planetary Invasion (FR-PD-002 through FR-PD-005) ────────────────────

  /**
   * Resolve a planetary invasion attempt.
   * Called after space combat is resolved when attacker wins or no defender fleet was present.
   *
   * @param {Object} params
   * @param {string} params.systemId - Target system
   * @param {string} params.attackerFactionId
   * @param {string} params.defenderFactionId
   * @param {number} params.attackerFleetPower - Attacking fleet's total combat power
   * @param {Object} params.galaxy - Galaxy state (used to update system ownership)
   * @param {Object} params.techStates - factionId → TechStateManager (for tech bonuses)
   * @param {string} params.seed - Deterministic seed string
   * @returns {Object} Invasion result { outcome, roundsFought, defenderTroopsRemaining, attackerStrengthRemaining, events }
   */
  resolvePlanetaryInvasion(params: any) {
    const { systemId, attackerFactionId, defenderFactionId, attackerFleetPower, galaxy, seed } = params;
    const rng = new SeededRandom(seed ?? `invasion-${systemId}`);

    const system = galaxy?.systems?.find((s: any) => s.id === systemId);
    if (!system) return { outcome: 'error', error: 'System not found' };

    // FR-PD-002: invasion_strength = fleet_power / 10 (min 1)
    let invasionStrength = Math.max(1, Math.floor(attackerFleetPower / 10));

    const defenderTroopsInit = this.csm.getGroundTroops(systemId);
    let defenderTroops = defenderTroopsInit;

    const { defenseModifier, shieldPresent, shieldHP, ionCannonPresent, ionCannonInstanceId } =
      this.csm.getInvasionModifiers(systemId);

    // FR-PD-004: Shield Generator fires before invasion starts
    if (shieldPresent && shieldHP > 0) {
      invasionStrength = Math.floor(invasionStrength * 0.85); // -15% attacker strength
      // Shield takes 2 HP at invasion start
      const shieldFac = this.csm.getFacilities(systemId).find((f: any) => f.facilityId === 'shield');
      if (shieldFac) this.applyFacilityDamage(systemId, shieldFac.id, 2, defenderFactionId);
    }

    // FR-PD-005: Ion Cannon fires once before round 1
    if (ionCannonPresent && ionCannonInstanceId) {
      invasionStrength = Math.floor(invasionStrength * 0.85); // -15% attacker strength
      this.applyFacilityDamage(systemId, ionCannonInstanceId, 1, defenderFactionId);
    }

    // Tech ground bonus (stub — no tech effect registered for ground yet, defaults to 1.0)
    const techGroundBonus = 1.0;

    const events = [];
    let roundsFought = 0;

    // FR-PD-002: Resolution rounds
    for (let round = 0; round < (this.config.invasionMaxRounds ?? 8); round++) {
      if (defenderTroops <= 0 || invasionStrength <= 0) break;
      roundsFought++;

      const attackerEff = invasionStrength * techGroundBonus;
      const defenderEff = defenderTroops   * (1 + defenseModifier);

      // Shield: reduces invasion damage to troops by 20%
      const shieldFac = this.csm.getFacilities(systemId).find((f: any) => f.facilityId === 'shield');
      const shieldBonus = shieldFac && shieldFac.currentHP > 0 ? 0.80 : 1.0;

      const troopDamage = Math.floor(attackerEff * (0.6 + (rng as any).random() * 0.4) * shieldBonus);
      const strengthDamage = Math.floor(defenderEff * (0.4 + (rng as any).random() * 0.4) * 0.1);

      defenderTroops   = Math.max(0, defenderTroops   - troopDamage);
      invasionStrength = Math.max(0, invasionStrength - strengthDamage);

      events.push({ round: round + 1, troopDamage, strengthDamage, defenderTroops, invasionStrength });
    }

    this.csm.setGroundTroops(systemId, defenderTroops);

    if (defenderTroops <= 0) {
      // FR-PD-003: Attacker wins
      this._applyInvasionVictory(systemId, attackerFactionId, defenderFactionId, galaxy);
      return {
        outcome: 'attackerWins',
        roundsFought,
        defenderTroopsRemaining: 0,
        attackerStrengthRemaining: invasionStrength,
        events
      };
    }

    // Defender wins (troops survived or max rounds exceeded)
    return {
      outcome: 'defenderWins',
      roundsFought,
      defenderTroopsRemaining: defenderTroops,
      attackerStrengthRemaining: invasionStrength,
      events
    };
  }

  /**
   * Apply the effects of a successful invasion (attacker wins).
   * Spec: FR-PD-003
   * @private
   */
  _applyInvasionVictory(systemId: any, attackerFactionId: any, defenderFactionId: any, galaxy: any) {
    const system = galaxy?.systems?.find((s: any) => s.id === systemId);
    if (system) {
      // Transfer ownership
      system.loyalty      = attackerFactionId;
      const curLoyalty    = system.loyaltyValue ?? system.loyaltyScore ?? 50;
      system.loyaltyValue = Math.max(30, curLoyalty - 20);

      // Remaining defender facilities take 1 damage each
      const facilities = this.csm.getFacilities(systemId);
      for (const fac of [...facilities]) {
        if (fac.currentHP > 0) {
          this.applyFacilityDamage(systemId, fac.id, 1, defenderFactionId);
        }
      }
    }

    window.dispatchEvent(new CustomEvent('galaxy:notify', {
      detail: {
        tier: 'warning',
        message: `${attackerFactionId} captured ${system?.name ?? systemId}!`,
        locationId: systemId,
        locationCategory: 'combat'
      }
    }));
  }

  /**
   * Handle manual troop reinforcement (FR-PD-006 Reinforce button).
   * @param {string} systemId
   * @param {Object} resourceState - Player's ResourceStateManager.state
   * @param {import('./resource-engine.js').ResourceEngine} resourceEngine
   * @param {number} currentTurn
   * @returns {{ success: boolean, troopsAdded?: number, error?: string }}
   */
  reinforceTroops(systemId: any, resourceState: any, resourceEngine: any, currentTurn: any) {
    const current = this.csm.getGroundTroops(systemId);
    const max     = this.config.groundTroopsMax;
    if (current >= max) return { success: false, error: 'Troop cap already reached' };

    const cost = { ...this.config.troopReinforcementCost };
    const add  = Math.min(this.config.troopReinforcementAmount, max - current);

    const spend = resourceEngine.spendResources(resourceState, cost, `reinforce-troops:${systemId}`, currentTurn);
    if (!spend.success) return spend;

    this.csm.setGroundTroops(systemId, current + add);
    return { success: true, troopsAdded: add };
  }

  /**
   * Lookup a base type definition helper.
   * @private
   */
  _baseDef(factionId: any) {
    return this.config.baseTypes[factionId] ?? null;
  }
}
