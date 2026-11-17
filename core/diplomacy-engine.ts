/**
 * DiplomacyEngine — Diplomatic action execution for Phase 1B.
 *
 * Handles Propaganda Campaigns, Trade Agreements, Resource Investments,
 * and Alliance Proposals. Resources are reserved at staging time (via
 * stagePlayerAction) and confirmed at Resolution Phase by this engine.
 *
 * Spec: 025-diplomatic-actions-spec.md
 */

// ─── Action type constants ───────────────────────────────────────────────────

export const DIPLOMATIC_ACTION_TYPES = {
  PROPAGANDA:          'propaganda',
  TRADE_AGREEMENT:     'tradeAgreement',
  RESOURCE_INVESTMENT: 'resourceInvestment',
  ALLIANCE_PROPOSAL:   'allianceProposal',
  DIPLOMATIC_HOLD:     'diplomaticHold'
};

// ─── Base costs (before faction modifiers) ───────────────────────────────────

const BASE_COSTS = {
  [DIPLOMATIC_ACTION_TYPES.PROPAGANDA]:          { credits: 150, influence: 50 },
  [DIPLOMATIC_ACTION_TYPES.TRADE_AGREEMENT]:     { credits: 300 },
  [DIPLOMATIC_ACTION_TYPES.RESOURCE_INVESTMENT]: { materials: 200 },
  [DIPLOMATIC_ACTION_TYPES.ALLIANCE_PROPOSAL]:   { credits: 100, influence: 200 },
  [DIPLOMATIC_ACTION_TYPES.DIPLOMATIC_HOLD]:     { influence: 200 }
};

// Union: -10% on all diplomatic actions (FR-DA-006)
const UNION_COST_DISCOUNT = 0.9;

export class DiplomacyEngine {
  loyaltyStateManager: any;
  factionDefinitions: any;
  _propagandaThisTurn: any = {};
  _diploActionsThisTurn: any = {};
  _resolvedThisTurn: Set<any> = new Set();

  /**
   * @param {import('./loyalty-state-manager.js').LoyaltyStateManager} loyaltyStateManager
   * @param {Object} factionDefinitions — map of factionId → definition (with .bonuses, .restrictions)
   */
  constructor(loyaltyStateManager: any, factionDefinitions: any = {}) {
    this.loyaltyStateManager = loyaltyStateManager;
    this.factionDefinitions  = factionDefinitions;
    // Track propaganda usage per system per turn to enforce one-per-faction limit (FR-DA-001)
    this._propagandaThisTurn = {}; // `${systemId}:${factionId}` → true
    // Track total diplomatic actions per system per faction per turn (FR-APL-004, FR-APL-007)
    this._diploActionsThisTurn = {}; // `${systemId}:${factionId}` → count
    // Track actions that have already been applied this turn (dedup by action id)
    this._resolvedThisTurn = new Set();
  }

  // ─── Cost Calculation ────────────────────────────────────────────────────────

  /**
   * Get the effective cost of an action for a given faction (after modifiers).
   * @param {string} actionType
   * @param {string} factionId
   * @returns {Object} cost object { credits?, materials?, influence? }
   */
  getEffectiveCost(actionType: any, factionId: any) {
    const base: Record<string, number> = { ...((BASE_COSTS as Record<string, any>)[actionType] ?? {}) };
    const def  = this.factionDefinitions[factionId];

    // Union: -10% on all diplomatic actions (FR-DA-006)
    if (factionId === 'union') {
      for (const [k, v] of Object.entries(base)) {
        base[k] = Math.floor(v * UNION_COST_DISCOUNT);
      }
    }

    return base;
  }

  // ─── Eligibility Validation ──────────────────────────────────────────────────

  /**
   * Validate whether a diplomatic action is eligible given current game state.
   * @param {string} actionType
   * @param {string} factionId
   * @param {Object} system — Target system object
   * @param {Object} context — { galaxy, resourceStates, currentTurn }
   * @returns {{ valid: boolean, reason?: string }}
   */
  validate(actionType: any, factionId: any, system: any, context: any) {
    const lsm      = this.loyaltyStateManager;
    const loyalty  = lsm.getLoyalty(system.id, factionId);
    const controller = system.loyalty;

    // Overall 2-diplomatic-actions per system per faction per turn (FR-APL-004, FR-APL-007)
    const actionKey = `${system.id}:${factionId}`;
    if ((this._diploActionsThisTurn[actionKey] ?? 0) >= 2) {
      return { valid: false, reason: 'Maximum 2 diplomatic actions per system this turn' };
    }

    switch (actionType) {
      case DIPLOMATIC_ACTION_TYPES.PROPAGANDA: {
        // Target: any system with current faction loyalty < 80 (FR-DA-001)
        if (loyalty >= 80) {
          return { valid: false, reason: 'Loyalty already at 80+; propaganda not needed' };
        }
        // Loyalty 100 immunity (FR-LE-004)
        if (controller && controller !== 'neutral' && controller !== factionId) {
          const controllerLoyalty = lsm.getLoyalty(system.id, controller);
          if (controllerLoyalty >= 100) {
            return { valid: false, reason: 'Enemy system at maximum loyalty — immune to propaganda' };
          }
        }
        // One propaganda per system per faction per turn (FR-DA-001)
        const key = `${system.id}:${factionId}`;
        if (this._propagandaThisTurn[key]) {
          return { valid: false, reason: 'Already ran a propaganda campaign here this turn' };
        }
        return { valid: true };
      }

      case DIPLOMATIC_ACTION_TYPES.TRADE_AGREEMENT: {
        // Target: system with loyalty between 40 and 80 for this faction (FR-DA-002)
        if (loyalty < 40 || loyalty > 80) {
          return { valid: false, reason: `Loyalty must be between 40 and 80 (current: ${loyalty})` };
        }
        // No stacking (FR-DA-002)
        if (lsm.hasActiveTradeAgreement(system.id)) {
          return { valid: false, reason: 'A Trade Agreement is already active at this system' };
        }
        return { valid: true };
      }

      case DIPLOMATIC_ACTION_TYPES.RESOURCE_INVESTMENT: {
        // Target: system with loyalty ≥ 30 (FR-DA-003)
        if (loyalty < 30) {
          return { valid: false, reason: `Loyalty must be ≥ 30 (current: ${loyalty})` };
        }
        // Max 2 resource investments per system (FR-DA-003)
        if (lsm.countResourceInvestments(system.id) >= 2) {
          return { valid: false, reason: 'Maximum 2 Resource Investments already applied at this system' };
        }
        return { valid: true };
      }

      case DIPLOMATIC_ACTION_TYPES.ALLIANCE_PROPOSAL: {
        // Autoforge only (FR-DA-004)
        if (factionId !== 'autoforge') {
          return { valid: false, reason: 'Alliance Proposals are available to The Autoforge only' };
        }
        // Target: neutral OR loyalty < 40 for target faction (FR-DA-004)
        const isNeutral = !controller || controller === 'neutral';
        if (!isNeutral && controller === factionId) {
          return { valid: false, reason: 'Already an Autoforge system' };
        }
        // Acceptance conditions: Autoforge loyalty < 30 (FR-DA-004)
        if (loyalty >= 30) {
          return { valid: false, reason: `Autoforge loyalty must be below 30 (current: ${loyalty})` };
        }
        // No existing Autoforge outpost
        const hasOutpost = (system.facilities ?? []).some(
          (f: any) => f.type === 'outpost' && f.factionId === 'autoforge'
        );
        if (hasOutpost) {
          return { valid: false, reason: 'An Autoforge Outpost is already present at this system' };
        }
        return { valid: true };
      }

      case DIPLOMATIC_ACTION_TYPES.DIPLOMATIC_HOLD: {
        // Available to controlling faction only
        if (controller !== factionId) {
          return { valid: false, reason: 'Diplomatic Hold is only available to the controlling faction' };
        }
        return { valid: true };
      }

      default:
        return { valid: false, reason: `Unknown action type: ${actionType}` };
    }
  }

  // ─── Resolution ──────────────────────────────────────────────────────────────

  /**
   * Resolve a staged diplomatic action.
   * Called by TurnResolutionEngine._resolveDiplomaticEffects.
   *
   * @param {Object} action — Staged action { id, payload: { type, factionId, targetSystemId, costs } }
   * @param {Object} context — { galaxy, resourceStates, resourceEngine, currentTurn }
   * @returns {{ applied: boolean, message: string, systemId: string }}
   */
  resolveAction(action: any, context: any) {
    const { type, factionId, targetSystemId } = action.payload ?? {};

    if (this._resolvedThisTurn.has(action.id)) {
      return { applied: false, message: 'Action already resolved', systemId: targetSystemId };
    }

    const system = context.galaxy?.systems?.find((s: any) => s.id === targetSystemId);
    if (!system) {
      return { applied: false, message: `System ${targetSystemId} not found`, systemId: targetSystemId };
    }

    const rsm = context.resourceStates?.[factionId];
    if (!rsm) {
      return { applied: false, message: `No resource state for ${factionId}`, systemId: targetSystemId };
    }

    // Confirm reserved resources (already reserved at staging via stagePlayerAction)
    const costs = action.payload?.costs ?? {};
    if (Object.keys(costs).length > 0) {
      const confirm = context.resourceEngine?.confirmReserved(rsm.state, costs, `diplomacy:${type}`, context.currentTurn);
      if (confirm && !confirm.success) {
        return { applied: false, message: `Insufficient resources: ${confirm.error}`, systemId: targetSystemId };
      }
    }

    // Validate again at resolution time (state may have changed)
    const eligible = this.validate(type, factionId, system, context);
    if (!eligible.valid) {
      // Refund reserved resources
      if (Object.keys(costs).length > 0 && context.resourceEngine) {
        context.resourceEngine.releaseReserved(rsm.state, costs);
        // Return costs since already confirmed above — treat as refund
        context.resourceEngine.processRefund(rsm.state, costs, 1.0, `diplomacy:${type}:refund`, context.currentTurn);
      }
      return { applied: false, message: `Action invalid at resolution: ${eligible.reason}`, systemId: targetSystemId };
    }

    const result = this._applyAction(type, factionId, system, context);
    this._resolvedThisTurn.add(action.id);

    // Record history
    this.loyaltyStateManager.recordActionHistory(targetSystemId, factionId, type, context.currentTurn);

    return { applied: true, message: result.message, systemId: targetSystemId };
  }

  /** @private */
  _applyAction(type: any, factionId: any, system: any, context: any) {
    const lsm = this.loyaltyStateManager;

    switch (type) {
      case DIPLOMATIC_ACTION_TYPES.PROPAGANDA: {
        // +10 loyalty; Brand Authority gets +5% bonus → +10.5 → 11 (FR-DA-001, FR-DA-006)
        const base = 10;
        const bonus = (factionId === 'brandAuthority') ? 1 : 0; // +5% rounds up: 10 * 1.05 = 10.5 → 11
        const gain = base + bonus;
        lsm.adjustLoyalty(system.id, factionId, gain);
        this._propagandaThisTurn[`${system.id}:${factionId}`] = true;
        return { message: `Propaganda Campaign: ${system.name} +${gain} loyalty for ${factionId}` };
      }

      case DIPLOMATIC_ACTION_TYPES.TRADE_AGREEMENT: {
        // +20 loyalty; Autoforge gets +10 extra (FR-DA-002, FR-DA-006)
        const base = 20;
        const extra = (factionId === 'autoforge') ? 10 : 0;
        lsm.adjustLoyalty(system.id, factionId, base + extra);
        // +10% production bonus for 3 turns (FR-DA-002)
        lsm.addTimedBonus(system.id, factionId, 'tradeAgreement', 0.10, 3);
        return { message: `Trade Agreement: ${system.name} +${base + extra} loyalty, +10% production × 3 turns` };
      }

      case DIPLOMATIC_ACTION_TYPES.RESOURCE_INVESTMENT: {
        // +15 loyalty + permanent +5% materials bonus (FR-DA-003)
        lsm.adjustLoyalty(system.id, factionId, 15);
        lsm.addTimedBonus(system.id, factionId, 'resourceInvestment', 0.05, -1); // permanent
        return { message: `Resource Investment: ${system.name} +15 loyalty, +5% permanent materials bonus` };
      }

      case DIPLOMATIC_ACTION_TYPES.ALLIANCE_PROPOSAL: {
        // Check acceptance conditions (FR-DA-004)
        const afLoyalty = lsm.getLoyalty(system.id, 'autoforge');
        const hasFleetBlockade = this._checkAutoforgeFleetPresent(system.id, context);
        const hasOutpost = (system.facilities ?? []).some((f: any) => f.type === 'outpost' && f.factionId === 'autoforge');

        if (afLoyalty >= 30 || hasFleetBlockade || hasOutpost) {
          // Conditions not met — refund is handled by resolveAction
          return { message: `Alliance Proposal rejected at ${system.name}` };
        }

        // Acceptance: +30 loyalty + place Outpost (FR-DA-004)
        lsm.adjustLoyalty(system.id, 'autoforge', 30);
        if (!system.facilities) system.facilities = [];
        system.facilities.push({ type: 'outpost', level: 1, factionId: 'autoforge', hp: 1 });
        return { message: `Alliance Proposal accepted at ${system.name}: +30 loyalty + Outpost placed` };
      }

      case DIPLOMATIC_ACTION_TYPES.DIPLOMATIC_HOLD: {
        // 3-turn immunity to Diplomatic Conversion (FR-SCP-007)
        lsm.placeDiplomaticHold(system.id, context.currentTurn);
        return { message: `Diplomatic Hold placed at ${system.name} for 3 turns` };
      }

      default:
        return { message: `Unknown action type: ${type}` };
    }
  }

  /** @private */
  _checkAutoforgeFleetPresent(systemId: any, context: any) {
    if (!context.galaxy?.fleets) return false;
    return (context.galaxy.fleets ?? []).some(
      (f: any) => f.systemId === systemId && f.factionId === 'autoforge'
    );
  }

  /**
   * Record that a diplomatic action has been staged for a system+faction this turn.
   * Called by MainStage after validate() passes and the action is successfully staged.
   * @param {string} systemId
   * @param {string} factionId
   */
  recordAction(systemId: any, factionId: any) {
    const key = `${systemId}:${factionId}`;
    this._diploActionsThisTurn[key] = (this._diploActionsThisTurn[key] ?? 0) + 1;
  }

  // ─── Per-turn Reset ────────────────────────────────────────────────────────

  /**
   * Reset per-turn tracking state (call at start of each resolution phase).
   */
  resetTurnTracking() {
    this._propagandaThisTurn     = {};
    this._diploActionsThisTurn   = {};
    this._resolvedThisTurn.clear();
  }

  // ─── Available Actions Query ─────────────────────────────────────────────────

  /**
   * Get all available diplomatic actions for a faction at a system.
   * Returns an array of { type, cost, valid, reason } objects for the UI.
   *
   * @param {string} factionId
   * @param {Object} system
   * @param {Object} context
   * @returns {Array}
   */
  getAvailableActions(factionId: any, system: any, context: any) {
    const actions = [
      DIPLOMATIC_ACTION_TYPES.PROPAGANDA,
      DIPLOMATIC_ACTION_TYPES.TRADE_AGREEMENT,
      DIPLOMATIC_ACTION_TYPES.RESOURCE_INVESTMENT,
    ];

    // Alliance Proposal only for Autoforge (FR-DA-004)
    if (factionId === 'autoforge') {
      actions.push(DIPLOMATIC_ACTION_TYPES.ALLIANCE_PROPOSAL);
    }

    // Diplomatic Hold only for controlling faction
    if (system.loyalty === factionId) {
      actions.push(DIPLOMATIC_ACTION_TYPES.DIPLOMATIC_HOLD);
    }

    return actions.map(type => {
      const eligibility = this.validate(type, factionId, system, context);
      return {
        type,
        cost:   this.getEffectiveCost(type, factionId),
        valid:  eligibility.valid,
        reason: eligibility.reason
      };
    });
  }
}
