/**
 * ResourceStateManager - Per-faction resource state management and serialization.
 *
 * Manages the live resource pools, caps, production history, queued spending,
 * and transaction log for a single faction. Designed to be serialized/deserialized
 * for save/load operations.
 */
export class ResourceStateManager {
  state: any;
  /**
   * @param {string} factionId - Faction identifier (e.g. 'brandAuthority')
   * @param {Object} startingResources - Starting resource amounts { credits, materials, recruits, influence }
   * @param {Object} config - Resource config (from resource-config.json)
   */
  constructor(factionId: any, startingResources: any, config: any) {
    this.state = this.initializeState(factionId, startingResources, config);
  }

  /**
   * Initialize fresh state for a faction.
   * @param {string} factionId
   * @param {Object} startingResources
   * @param {Object} config
   * @returns {Object} Initialized state object
   */
  initializeState(factionId: any, startingResources: any, config: any) {
    return {
      factionId,
      resourceStateVersion: 1,
      resources: {
        credits:   startingResources.credits   ?? 0,
        materials: startingResources.materials ?? 0,
        recruits:  startingResources.recruits  ?? 0,
        influence: startingResources.influence ?? 0
      },
      resourceCaps: { ...config.defaultCaps },
      productionThisTurn: { credits: 0, materials: 0, recruits: 0, influence: 0 },
      spendingThisTurn:   { credits: 0, materials: 0, recruits: 0, influence: 0 },
      productionHistory:  [],
      queuedSpending:     { credits: 0, materials: 0, recruits: 0, influence: 0 },
      transactionLog:     []
    };
  }

  /**
   * Serialize state to a plain object for persistence.
   * @returns {Object} Plain JS object (safe to embed in JSONB)
   */
  serialize() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Deserialize state from a plain object or JSON string.
   * Accepts both formats for backward compatibility with older saves.
   * @param {Object|string} data - Plain object or JSON string from serialize()
   * @returns {ResourceStateManager} Restored instance
   */
  static deserialize(data: any) {
    const state = typeof data === 'string' ? JSON.parse(data) : data;
    const manager = Object.create(ResourceStateManager.prototype);
    manager.state = state;
    return manager;
  }

  /**
   * Get current resource amounts (read-only snapshot).
   * @returns {Object}
   */
  getResources() {
    return { ...this.state.resources };
  }

  /**
   * Get resource caps.
   * @returns {Object}
   */
  getCaps() {
    return { ...this.state.resourceCaps };
  }

  /**
   * Get production this turn.
   * @returns {Object}
   */
  getProductionThisTurn() {
    return { ...this.state.productionThisTurn };
  }

  /**
   * Get spending this turn.
   * @returns {Object}
   */
  getSpendingThisTurn() {
    return { ...this.state.spendingThisTurn };
  }

  /**
   * Get production history (up to last 10 turns).
   * @returns {Array}
   */
  getProductionHistory() {
    return [...this.state.productionHistory];
  }

  /**
   * Get queued spending totals.
   * @returns {Object}
   */
  getQueuedSpending() {
    return { ...this.state.queuedSpending };
  }

  /**
   * Get full transaction log.
   * @returns {Array}
   */
  getTransactionLog() {
    return [...this.state.transactionLog];
  }

  /**
   * Reset per-turn tracking at the start of each new turn.
   */
  resetTurnTracking() {
    this.state.productionThisTurn = { credits: 0, materials: 0, recruits: 0, influence: 0 };
    this.state.spendingThisTurn   = { credits: 0, materials: 0, recruits: 0, influence: 0 };
    // queuedSpending is cleared via releaseReserved calls during resolution, not here
  }

}
