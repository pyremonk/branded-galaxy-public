/**
 * ResourceEngine - Production calculation, spending, refunds, and transaction logging.
 *
 * Stateless calculation layer — all mutable state lives in ResourceStateManager.
 * Accepts config loaded from resource-config.json.
 */
export class ResourceEngine {
  config: any;
  /**
   * @param {Object} config - Loaded resource-config.json
   */
  constructor(config: any) {
    this.config = config;
  }

  // ─────────────────────────────────────────────
  // PHASE 2: Production Calculation
  // ─────────────────────────────────────────────

  /**
   * Calculate base (unmodified) production for a single system.
   * @param {Object} system - { population, loyaltyValue }
   * @returns {{ credits, materials, recruits, influence }}
   */
  calculateBaseProduction(system: any) {
    return {
      credits:   system.population * 10,
      materials: system.population *  5,
      recruits:  system.population *  2,
      influence: (system.loyaltyValue - 50) / 10
    };
  }

  /**
   * Get loyalty multiplier for a given loyalty value (0–100).
   * @param {number} loyaltyValue
   * @returns {number} Multiplier
   */
  getLoyaltyModifier(loyaltyValue: any) {
    const modifiers = this.config.loyaltyModifiers;
    const entry = modifiers.find((m: any) => loyaltyValue >= m.min && loyaltyValue <= m.max);
    return entry ? entry.multiplier : 1.0;
  }

  /**
   * Get special location modifiers for a system type.
   * Trade hub bonus stacks with Brand Authority tradeHubBonus.
   * @param {string|null} specialType
   * @param {Object} factionBonuses - Faction bonus object (e.g. faction.bonuses)
   * @returns {{ credits, materials, recruits, influence }}
   */
  getSpecialLocationModifiers(specialType: any, factionBonuses = {}) {
    const defaults = { credits: 1.0, materials: 1.0, recruits: 1.0, influence: 1.0 };
    if (!specialType) return defaults;

    const specials = this.config.specialLocationBonuses[specialType] || {};
    const tradeHubStackBonus = (factionBonuses as any).tradeHubBonus || 1.0;

    return {
      credits:   (specials.credits   || 1.0) * (specialType === 'tradeHub' ? tradeHubStackBonus : 1.0),
      materials:  specials.materials  || 1.0,
      recruits:   specials.recruits   || 1.0,
      influence:  specials.influence  || 1.0
    };
  }

  /**
   * Calculate full per-system production after all modifiers.
   * Formula: base × loyaltyMod × factionBonus × specialMod (all multiplicative)
   * All values floored to integer. Influence can be negative before flooring.
   *
   * @param {Object} system - { population, loyaltyValue, specialType }
   * @param {Object} factionBonuses - Faction bonus object
   * @returns {{ credits, materials, recruits, influence }}
   */
  calculateSystemProduction(system: any, factionBonuses = {}) {
    const base       = this.calculateBaseProduction(system);
    const loyaltyMod = this.getLoyaltyModifier(system.loyaltyValue ?? 50);
    const specialMod = this.getSpecialLocationModifiers(system.specialType, factionBonuses);

    // Autoforge: resourceProduction bonus applies to materials (mapped as materialProd)
    const creditMod   = (factionBonuses as any).creditIncome    || 1.0;
    const materialMod = (factionBonuses as any).materialProd    || (factionBonuses as any).resourceProduction || 1.0;
    const recruitMod  = (factionBonuses as any).recruitGen      || (factionBonuses as any).recruitGeneration  || 1.0;

    // Union applies baseResourceProduction penalty as a flat multiplier
    const basePenalty = (factionBonuses as any).baseResourceProduction ?? 1.0;

    return {
      credits:   Math.floor(base.credits   * loyaltyMod * creditMod   * specialMod.credits   * basePenalty),
      materials: Math.floor(base.materials * loyaltyMod * materialMod * specialMod.materials * basePenalty),
      recruits:  Math.floor(base.recruits  * loyaltyMod * recruitMod  * specialMod.recruits  * basePenalty),
      influence: Math.floor(base.influence                             * specialMod.influence)
    };
  }

  /**
   * Aggregate production across all controlled systems for a faction.
   * @param {Object[]} controlledSystems - Systems owned by this faction
   * @param {Object} factionBonuses - Faction bonus object
   * @returns {{ credits, materials, recruits, influence }}
   */
  calculateFactionProduction(controlledSystems: any, factionBonuses = {}) {
    const total = { credits: 0, materials: 0, recruits: 0, influence: 0 };
    for (const system of controlledSystems) {
      const prod = this.calculateSystemProduction(system, factionBonuses);
      total.credits   += prod.credits;
      total.materials += prod.materials;
      total.recruits  += prod.recruits;
      total.influence += prod.influence;
    }
    return total;
  }

  /**
   * Apply per-turn production to a faction's resource pool (respecting caps).
   * Updates productionThisTurn and logs each transaction.
   *
   * @param {Object} resourceState - ResourceStateManager.state
   * @param {{ credits, materials, recruits, influence }} production
   * @param {number} currentTurn
   */
  applyProduction(resourceState: any, production: any, currentTurn: any) {
    for (const [resource, amount] of Object.entries(production)) {
      const cap     = resourceState.resourceCaps[resource] ?? Infinity;
      const current = resourceState.resources[resource]    ?? 0;
      const capped  = Math.min(current + amount, cap);
      resourceState.resources[resource] = capped;

      // Track production this turn
      resourceState.productionThisTurn[resource] =
        (resourceState.productionThisTurn[resource] ?? 0) + amount;

      this.logTransaction(resourceState, currentTurn, 'production', resource, amount, 'turn-generation');
    }

    this.pushProductionHistory(resourceState, production, currentTurn);
  }

  /**
   * Append turn production summary to history (max 10 entries).
   * @param {Object} resourceState
   * @param {Object} production
   * @param {number} turn
   */
  pushProductionHistory(resourceState: any, production: any, turn: any) {
    resourceState.productionHistory.push({ turn, ...production });
    if (resourceState.productionHistory.length > 10) {
      resourceState.productionHistory.shift();
    }
  }

  // ─────────────────────────────────────────────
  // PHASE 3: Spending Engine
  // ─────────────────────────────────────────────

  /**
   * Attempt to spend resources. All-or-nothing: validates all before deducting any.
   * @param {Object} resourceState - ResourceStateManager.state
   * @param {Object} costs - { credits?: number, materials?: number, ... }
   * @param {string} source - What caused the spending (e.g. 'shipyard:cruiser')
   * @param {number} currentTurn
   * @returns {{ success: boolean, error?: string }}
   */
  spendResources(resourceState: any, costs: any, source: any, currentTurn: any) {
    // Pre-validate all resources
    for (const [resource, amount] of (Object.entries(costs) as [string, number][])) {
      const have = resourceState.resources[resource] ?? 0;
      if (have < amount) {
        return {
          success: false,
          error: `Insufficient ${resource}: need ${amount}, have ${have}`
        };
      }
    }

    // Atomically deduct
    for (const [resource, amount] of (Object.entries(costs) as [string, number][])) {
      resourceState.resources[resource] -= amount;
      resourceState.spendingThisTurn[resource] =
        (resourceState.spendingThisTurn[resource] ?? 0) + amount;
      this.logTransaction(resourceState, currentTurn, 'spending', resource, -amount, source);
    }

    return { success: true };
  }

  /**
   * Get ship construction cost from config.
   * @param {string} shipType - e.g. 'fighter', 'cruiser'
   * @returns {Object} Cost object or throws if unknown
   */
  getShipCost(shipType: any) {
    const cost = this.config.shipCosts[shipType];
    if (!cost) throw new Error(`Unknown ship type: ${shipType}`);
    return { ...cost };
  }

  /**
   * Get building construction cost from config.
   * @param {string} buildingType - e.g. 'shipyard', 'researchLab'
   * @returns {Object} Cost object or throws if unknown
   */
  getBuildingCost(buildingType: any) {
    const cost = this.config.buildingCosts[buildingType];
    if (!cost) throw new Error(`Unknown building type: ${buildingType}`);
    return { ...cost };
  }

  /**
   * Get mission cost, applying faction-specific modifiers.
   * @param {string} missionType - e.g. 'diplomacy', 'espionage'
   * @param {Object} factionRestrictions - faction.restrictions object
   * @returns {Object} Cost object
   */
  getMissionCost(missionType: any, factionRestrictions = {}) {
    const base = this.config.missionCosts[missionType];
    if (!base) throw new Error(`Unknown mission type: ${missionType}`);

    const cost = { ...base };

    // Autoforge: 2× influence cost for diplomacy
    if (missionType === 'diplomacy' && (factionRestrictions as any).diplomaticMissionCost) {
      if (cost.influence != null) {
        cost.influence = Math.ceil(cost.influence * (factionRestrictions as any).diplomaticMissionCost);
      }
    }

    return cost;
  }

  /**
   * Get research cost for a tier, applying faction modifiers.
   * Returns mid-range (average of min + max) by default.
   * @param {number|string} tier - 1–5 or 'tier1'–'tier5'
   * @param {Object} factionRestrictions - faction.restrictions object
   * @returns {{ credits: number, influence: number }}
   */
  getResearchCost(tier: any, factionRestrictions = {}) {
    const key = typeof tier === 'number' ? `tier${tier}` : tier;
    const tierConfig = this.config.researchCosts[key];
    if (!tierConfig) throw new Error(`Unknown research tier: ${tier}`);

    let credits   = Math.floor((tierConfig.credits.min   + tierConfig.credits.max)   / 2);
    let influence = Math.floor((tierConfig.influence.min + tierConfig.influence.max) / 2);

    // Faction research cost modifier (e.g. Brand Authority +10%, Autoforge -20% from researchFacility)
    const mod = (factionRestrictions as any).researchCostModifier ?? 1.0;
    credits   = Math.ceil(credits   * mod);
    influence = Math.ceil(influence * mod);

    return { credits, influence };
  }

  /**
   * Get rush construction cost (2× remaining cost).
   * @param {Object} remainingCost
   * @returns {Object}
   */
  getRushConstructionCost(remainingCost: any) {
    const mult = this.config.emergencyActionCosts.rushConstruction.costMultiplier;
    const result: Record<string, number> = {};
    for (const [r, v] of Object.entries(remainingCost) as [string, number][]) result[r as string] = Math.ceil(v * mult);
    return result;
  }

  /**
   * Get emergency recruitment cost (3× base cost).
   * @param {Object} baseCost
   * @returns {Object}
   */
  getEmergencyRecruitmentCost(baseCost: any) {
    const mult = this.config.emergencyActionCosts.emergencyRecruitment.costMultiplier;
    const result: Record<string, number> = {};
    for (const [r, v] of Object.entries(baseCost) as [string, number][]) result[r as string] = Math.ceil(v * mult);
    return result;
  }

  /**
   * Get forced loyalty cost.
   * @returns {{ influence: number, credits: number }}
   */
  getForcedLoyaltyCost() {
    return { ...this.config.emergencyActionCosts.forcedLoyalty };
  }

  /**
   * Process a refund back into the resource pool.
   * @param {Object} resourceState - ResourceStateManager.state
   * @param {Object} originalCost - Original costs paid
   * @param {number} refundRate - 0.0–1.0 (e.g. 0.75)
   * @param {string} source
   * @param {number} currentTurn
   */
  processRefund(resourceState: any, originalCost: any, refundRate: any, source: any, currentTurn: any) {
    for (const [resource, amount] of Object.entries(originalCost) as [string, number][]) {
      const refund = Math.floor(amount * refundRate);
      if (refund <= 0) continue;

      const cap     = resourceState.resourceCaps[resource] ?? Infinity;
      const current = resourceState.resources[resource]    ?? 0;
      resourceState.resources[resource] = Math.min(current + refund, cap);

      this.logTransaction(resourceState, currentTurn, 'refund', resource, refund, source);
    }
  }

  /**
   * Validate that all staged (queued) resource reservations can be covered by the
   * current resource pool. Called on Action Phase submission as a safety net.
   * (reserveResources() already prevents individual over-commits; this catches
   * edge cases such as resource spending that occurred after staging.)
   *
   * @param {Object} resourceState - ResourceStateManager.state
   * @returns {{ valid: boolean, conflicts: string[] }}
   */
  validateStagedBudget(resourceState: any) {
    const conflicts = [];
    for (const resource of ['credits', 'materials', 'recruits', 'influence']) {
      const pool   = resourceState.resources[resource]       ?? 0;
      const queued = resourceState.queuedSpending[resource]  ?? 0;
      if (queued > pool) {
        conflicts.push(
          `${resource}: need ${queued} reserved but only ${pool} available`
        );
      }
    }
    return { valid: conflicts.length === 0, conflicts };
  }

  /**
   * Reserve resources for a queued action (soft reservation).
   * Validates that resources are available including existing reservations.
   * @param {Object} resourceState
   * @param {Object} costs
   * @returns {{ success: boolean, error?: string }}
   */
  reserveResources(resourceState: any, costs: any) {
    for (const [resource, amount] of (Object.entries(costs) as [string, number][])) {
      const available = (resourceState.resources[resource] ?? 0) -
                        (resourceState.queuedSpending[resource] ?? 0);
      if (available < amount) {
        return {
          success: false,
          error: `Insufficient ${resource} to reserve: need ${amount}, available ${available}`
        };
      }
    }
    for (const [resource, amount] of (Object.entries(costs) as [string, number][])) {
      resourceState.queuedSpending[resource] =
        (resourceState.queuedSpending[resource] ?? 0) + amount;
    }
    return { success: true };
  }

  /**
   * Release a previously reserved resource amount (action cancelled).
   * @param {Object} resourceState
   * @param {Object} costs
   */
  releaseReserved(resourceState: any, costs: any) {
    for (const [resource, amount] of (Object.entries(costs) as [string, number][])) {
      resourceState.queuedSpending[resource] =
        Math.max(0, (resourceState.queuedSpending[resource] ?? 0) - amount);
    }
  }

  /**
   * Confirm reserved resources (action begins — move reservation to actual spending).
   * @param {Object} resourceState
   * @param {Object} costs
   * @param {string} source
   * @param {number} currentTurn
   * @returns {{ success: boolean, error?: string }}
   */
  confirmReserved(resourceState: any, costs: any, source: any, currentTurn: any) {
    this.releaseReserved(resourceState, costs);
    return this.spendResources(resourceState, costs, source, currentTurn);
  }

  /**
   * Log a resource transaction.
   * @param {Object} resourceState
   * @param {number} turn
   * @param {string} type - 'production' | 'spending' | 'refund' | 'adjustment'
   * @param {string} resource
   * @param {number} amount - Positive for income, negative for spending
   * @param {string} source
   * @param {Object} [details]
   */
  logTransaction(resourceState: any, turn: any, type: any, resource: any, amount: any, source: any, details = {}) {
    resourceState.transactionLog.push({
      turn,
      timestamp: Date.now(),
      type,
      resource,
      amount,
      source,
      details
    });

    // Cap log at 500 entries to prevent unbounded growth
    if (resourceState.transactionLog.length > 500) {
      resourceState.transactionLog.shift();
    }
  }

  // ─────────────────────────────────────────────
  // PHASE 7: Forecasting
  // ─────────────────────────────────────────────

  /**
   * Calculate average production from history.
   * @param {Array} productionHistory
   * @returns {{ credits, materials, recruits, influence }}
   */
  calculateAverageProduction(productionHistory: any) {
    if (productionHistory.length === 0) {
      return { credits: 0, materials: 0, recruits: 0, influence: 0 };
    }
    const sum = productionHistory.reduce(
      (acc: any, turn: any) => ({
        credits:   acc.credits   + (turn.credits   || 0),
        materials: acc.materials + (turn.materials || 0),
        recruits:  acc.recruits  + (turn.recruits  || 0),
        influence: acc.influence + (turn.influence || 0)
      }),
      { credits: 0, materials: 0, recruits: 0, influence: 0 }
    );
    const n = productionHistory.length;
    return {
      credits:   Math.floor(sum.credits   / n),
      materials: Math.floor(sum.materials / n),
      recruits:  Math.floor(sum.recruits  / n),
      influence: Math.floor(sum.influence / n)
    };
  }

  /**
   * Forecast resource levels N turns ahead using average production.
   * @param {Object} resourceState - ResourceStateManager.state
   * @param {{ credits, materials, recruits, influence }} avgProduction
   * @param {number} [turns=5]
   * @returns {Array<{ turn, credits, materials, recruits, influence }>}
   */
  forecastResources(resourceState: any, avgProduction: any, turns = 5) {
    const forecast   = [];
    const simulated  = { ...resourceState.resources };
    const caps       = resourceState.resourceCaps;

    for (let i = 1; i <= turns; i++) {
      simulated.credits   = Math.min(simulated.credits   + avgProduction.credits,   caps.credits);
      simulated.materials = Math.min(simulated.materials + avgProduction.materials, caps.materials);
      simulated.recruits  = Math.min(simulated.recruits  + avgProduction.recruits,  caps.recruits);
      simulated.influence = Math.min(simulated.influence + avgProduction.influence, caps.influence);
      forecast.push({ turn: i, ...simulated });
    }

    return forecast;
  }

  /**
   * Calculate trend for a single resource over the last 6 turns of history.
   * - 'rising'  (↑): latest 3-turn avg > earlier 3-turn avg by > 5%
   * - 'falling' (↓): latest 3-turn avg < earlier 3-turn avg by > 5%
   * - 'stable'  (→): within ±5% variance (or < 6 turns of history)
   *
   * @param {Array} productionHistory
   * @param {string} resource
   * @returns {'rising'|'falling'|'stable'}
   */
  calculateTrend(productionHistory: any, resource: any) {
    if (productionHistory.length < 6) return 'stable';

    const recent = productionHistory.slice(-3);
    const older  = productionHistory.slice(-6, -3);

    const avgRecent = recent.reduce((s: any, t: any) => s + (t[resource] || 0), 0) / 3;
    const avgOlder  = older.reduce( (s: any, t: any) => s + (t[resource] || 0), 0) / 3;

    if (avgOlder === 0) return 'stable';
    const ratio = (avgRecent - avgOlder) / Math.abs(avgOlder);

    if (ratio >  0.05) return 'rising';
    if (ratio < -0.05) return 'falling';
    return 'stable';
  }
}
