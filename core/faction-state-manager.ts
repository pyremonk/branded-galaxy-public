/**
 * FactionStateManager - Runtime faction state management
 * Manages resources, controlled systems, bonuses, and victory progress
 */

// Resource caps per type
const RESOURCE_CAPS = {
  credits: 100000,
  materials: 50000,
  recruits: 10000,
  influence: 5000
};

// Victory condition threshold mappings
const VICTORY_THRESHOLDS = {
  'territorial-control': { target: 0.60, label: 'Control 60% of galaxy' },
  'military-elimination': { target: 1.0, label: 'Eliminate all rival fleets' },
  'economic-dominance': { target: 50000, label: 'Accumulate 50,000 credits' },
  'union-base-destruction': { target: 1.0, label: 'Destroy the Union secret base' },
  'covert-liberation': { target: 0.50, label: 'Liberate 50% of systems via espionage' },
  'brand-authority-collapse': { target: 1.0, label: 'Destroy Brand Authority fleet' },
  'diplomatic-unification': { target: 0.70, label: 'Unify 70% of systems diplomatically' },
  'resistance-network': { target: 20, label: 'Establish 20 resistance cells' },
  'total-optimization': { target: 0.80, label: 'Optimize 80% of galaxy systems' },
  'technological-singularity': { target: 10, label: 'Complete 10 advanced research projects' },
  'galactic-integration': { target: 0.90, label: 'Integrate 90% of galaxy into the network' },
  'industrial-supremacy': { target: 100000, label: 'Produce 100,000 total materials' }
};

export class FactionStateManager {
  definition: any;
  gameState: any;
  _callbacks: any;
  state: any;
  /**
   * @param {Object} factionDefinition - Faction definition from FactionDefinitionLoader
   * @param {Object} [gameState] - Reference to global game state (optional)
   */
  constructor(factionDefinition: any, gameState: any = null) {
    this.definition = factionDefinition;
    this.gameState = gameState;
    this._callbacks = { resourceChange: [], victoryUpdate: [], turnUpdate: [] };

    this.state = this._initializeState(factionDefinition);
    console.log(`[FactionState] Initialized state for ${factionDefinition.displayName}`);
  }

  // ─── Initialization ──────────────────────────────────────────────────────────

  /**
   * Initialize faction state from definition.
   * @param {Object} definition - Faction definition object
   * @returns {Object} Initial faction state
   */
  _initializeState(definition: any) {
    return {
      id: definition.id,
      name: definition.displayName,
      color: parseInt(definition.color.primary.replace('#', ''), 16),
      colorHex: definition.color.primary,

      // Territory
      controlledSystems: [],
      systemCount: 0,

      // Resources
      resources: { ...definition.startingConditions.resources },
      resourceCaps: { ...RESOURCE_CAPS },

      // Modifiers from definition
      bonuses: { ...definition.bonuses },
      restrictions: { ...definition.restrictions },

      // Progression
      technologies: [...definition.startingConditions.technologies],
      fleets: [],
      characters: [],

      // Victory tracking
      victoryProgress: this._initializeVictoryTracking(definition.victoryConditions),

      // Inter-faction relationships (-100 hostile → +100 allied)
      relationships: {},

      // Turn counter
      turnNumber: 0,

      // Special flags
      specialFlags: {}
    };
  }

  /**
   * Initialize victory progress tracking for each condition.
   * @param {Array} victoryConditions - List of condition IDs
   * @returns {Object} Victory progress map
   */
  _initializeVictoryTracking(victoryConditions: any) {
    const progress: Record<string, any> = {};
    victoryConditions.forEach((conditionId: any) => {
      const threshold = (VICTORY_THRESHOLDS as Record<string, any>)[conditionId];
      (progress as Record<string, any>)[conditionId] = {
        current: 0,
        target: threshold?.target ?? 1,
        label: threshold?.label ?? conditionId,
        achieved: false
      };
    });
    return progress;
  }

  // ─── Resource Operations ──────────────────────────────────────────────────────

  /**
   * Add resources to the faction, capped at maximums.
   * @param {string} type - Resource type (credits, materials, recruits, influence)
   * @param {number} amount - Amount to add (positive)
   * @returns {number} Actual amount added after capping
   */
  addResource(type: any, amount: any) {
    if (!this.state.resources.hasOwnProperty(type)) {
      console.warn(`[FactionState] Unknown resource type: ${type}`);
      return 0;
    }
    const cap = this.state.resourceCaps[type] ?? Infinity;
    const before = this.state.resources[type];
    this.state.resources[type] = Math.min(before + amount, cap);
    const actual = this.state.resources[type] - before;
    if (actual !== 0) this._emit('resourceChange', { type, delta: actual, total: this.state.resources[type] });
    return actual;
  }

  /**
   * Subtract resources from the faction. Will not go below 0.
   * @param {string} type - Resource type
   * @param {number} amount - Amount to subtract (positive)
   * @returns {number} Actual amount subtracted
   */
  subtractResource(type: any, amount: any) {
    if (!this.state.resources.hasOwnProperty(type)) {
      console.warn(`[FactionState] Unknown resource type: ${type}`);
      return 0;
    }
    const before = this.state.resources[type];
    this.state.resources[type] = Math.max(0, before - amount);
    const actual = before - this.state.resources[type];
    if (actual !== 0) this._emit('resourceChange', { type, delta: -actual, total: this.state.resources[type] });
    return actual;
  }

  /**
   * Check if faction has at least the given amount of a resource.
   * @param {string} type - Resource type
   * @param {number} amount - Required amount
   * @returns {boolean}
   */
  hasResource(type: any, amount: any) {
    return (this.state.resources[type] ?? 0) >= amount;
  }

  // ─── System Control ───────────────────────────────────────────────────────────

  /**
   * Register a system as controlled by this faction.
   * @param {string} systemId - System ID
   */
  claimSystem(systemId: any) {
    if (!this.state.controlledSystems.includes(systemId)) {
      this.state.controlledSystems.push(systemId);
      this.state.systemCount = this.state.controlledSystems.length;
    }
  }

  /**
   * Remove a system from this faction's control.
   * @param {string} systemId - System ID
   */
  loseSystem(systemId: any) {
    const idx = this.state.controlledSystems.indexOf(systemId);
    if (idx !== -1) {
      this.state.controlledSystems.splice(idx, 1);
      this.state.systemCount = this.state.controlledSystems.length;
    }
  }

  // ─── Technology ───────────────────────────────────────────────────────────────

  /**
   * Add a completed technology to the faction.
   * @param {string} techId - Technology ID
   */
  addTechnology(techId: any) {
    if (!this.state.technologies.includes(techId)) {
      this.state.technologies.push(techId);
    }
  }

  /**
   * Check if faction has a technology.
   * @param {string} techId - Technology ID
   * @returns {boolean}
   */
  hasTechnology(techId: any) {
    return this.state.technologies.includes(techId);
  }

  // ─── Turn Update ──────────────────────────────────────────────────────────────

  /**
   * Process end-of-turn updates for this faction.
   * @param {Object} galaxyState - Current galaxy state for context
   */
  updateTurn(galaxyState = null) {
    this.state.turnNumber++;
    this._calculateResourceProduction(galaxyState);
    this._updateVictoryProgress(galaxyState);
    this._applyPassiveBonuses();
    this._emit('turnUpdate', { turn: this.state.turnNumber });
    console.log(`[FactionState] ${this.state.name} turn ${this.state.turnNumber} processed`);
  }

  /**
   * Calculate and add resource income for this turn.
   * @param {Object} galaxyState - Galaxy state with systems
   */
  _calculateResourceProduction(galaxyState: any) {
    if (!galaxyState || !galaxyState.systems) return;

    let credits = 0;
    let materials = 0;
    let recruits = 0;
    let influence = 0;

    const controlled = galaxyState.systems.filter((s: any) => s.loyalty === this.state.id);
    controlled.forEach((system: any) => {
      credits += system.resources?.credits ?? 0;
      materials += system.resources?.materials ?? 0;
      recruits += Math.floor(system.population * 2);
      influence += Math.floor(system.population * 0.5);
    });

    // Apply faction resource bonuses
    const bonuses = this.state.bonuses;
    credits = Math.floor(credits * (bonuses.creditIncome ?? 1.0));
    materials = Math.floor(materials * (bonuses.resourceProduction ?? 1.0));
    recruits = Math.floor(recruits * (bonuses.recruitGeneration ?? (this.state.restrictions.recruitGeneration ?? 1.0)));
    influence = Math.floor(influence * (bonuses.influenceGeneration ?? 1.0));

    this.addResource('credits', credits);
    this.addResource('materials', materials);
    this.addResource('recruits', recruits);
    this.addResource('influence', influence);
  }

  /**
   * Update victory condition progress.
   * @param {Object} galaxyState - Galaxy state for calculations
   */
  _updateVictoryProgress(galaxyState: any) {
    if (!galaxyState) return;
    const totalSystems = galaxyState.systems?.length ?? 1;
    const controlled = this.state.controlledSystems.length;

    Object.keys(this.state.victoryProgress).forEach(conditionId => {
      const progress = this.state.victoryProgress[conditionId];
      if (progress.achieved) return;

      switch (conditionId) {
        case 'territorial-control':
        case 'total-optimization':
        case 'galactic-integration':
          progress.current = controlled / totalSystems;
          break;
        case 'economic-dominance':
          progress.current = this.state.resources.credits;
          break;
        case 'industrial-supremacy':
          progress.current = (progress.current ?? 0) + (this.state.resources.materials ?? 0);
          break;
        default:
          // Other conditions updated by external events
          break;
      }

      if (progress.current >= progress.target) {
        progress.achieved = true;
        this._emit('victoryUpdate', { conditionId, faction: this.state.id });
        console.log(`[FactionState] ${this.state.name} achieved victory condition: ${conditionId}`);
      }
    });
  }

  /**
   * Apply ongoing passive bonuses (stub for future mechanic hooks).
   */
  _applyPassiveBonuses() {
    // Passive bonuses are applied contextually via BonusApplier
    // This method is reserved for turn-based passive effects
  }

  // ─── Relationships ────────────────────────────────────────────────────────────

  /**
   * Set relationship value with another faction.
   * @param {string} factionId - Target faction ID
   * @param {number} value - Relationship value (-100 to +100)
   */
  setRelationship(factionId: any, value: any) {
    this.state.relationships[factionId] = Math.max(-100, Math.min(100, value));
  }

  /**
   * Adjust relationship value with another faction.
   * @param {string} factionId - Target faction ID
   * @param {number} delta - Change in relationship value
   */
  adjustRelationship(factionId: any, delta: any) {
    const current = this.state.relationships[factionId] ?? 0;
    this.setRelationship(factionId, current + delta);
  }

  // ─── Victory ─────────────────────────────────────────────────────────────────

  /**
   * Check if any victory condition has been achieved.
   * @returns {string|null} Achieved victory condition ID or null
   */
  checkVictory() {
    for (const [conditionId, progress] of (Object.entries(this.state.victoryProgress) as [string, any][])) {
      if (progress.achieved) return conditionId;
    }
    return null;
  }

  /**
   * Manually mark a victory condition as achieved (for event-driven conditions).
   * @param {string} conditionId - Victory condition ID
   */
  achieveVictoryCondition(conditionId: any) {
    if (this.state.victoryProgress[conditionId]) {
      this.state.victoryProgress[conditionId].achieved = true;
      this.state.victoryProgress[conditionId].current = this.state.victoryProgress[conditionId].target;
      this._emit('victoryUpdate', { conditionId, faction: this.state.id });
    }
  }

  // ─── Event Callbacks ─────────────────────────────────────────────────────────

  /**
   * Register a callback for state events.
   * @param {string} event - Event name: 'resourceChange', 'victoryUpdate', 'turnUpdate'
   * @param {Function} callback - Callback function
   */
  on(event: any, callback: any) {
    if (this._callbacks[event]) {
      this._callbacks[event].push(callback);
    }
  }

  /** @private */
  _emit(event: any, data: any) {
    (this._callbacks[event] || []).forEach((cb: any) => cb(data));
  }

  // ─── Serialization ────────────────────────────────────────────────────────────

  /**
   * Serialize faction state to a plain object for storage.
   * @returns {Object} Serializable state object
   */
  serialize() {
    return {
      _version: 1,
      definitionId: this.definition.id,
      state: JSON.parse(JSON.stringify(this.state))
    };
  }

  /**
   * Restore a FactionStateManager from serialized data.
   * @param {Object} serialized - Data from serialize()
   * @param {Object} factionDefinition - Faction definition (re-loaded from definitions)
   * @param {Object} [gameState] - Optional game state reference
   * @returns {FactionStateManager} Restored instance
   */
  static deserialize(serialized: any, factionDefinition: any, gameState = null) {
    if (!serialized || serialized._version !== 1) {
      throw new Error('[FactionState] Cannot deserialize: missing or incompatible data');
    }
    const manager = new FactionStateManager(factionDefinition, gameState);
    // Restore all state fields, preserving definition-derived defaults for any missing keys
    Object.assign(manager.state, serialized.state);
    console.log(`[FactionState] Deserialized state for ${factionDefinition.displayName}`);
    return manager;
  }

  // ─── Accessors ────────────────────────────────────────────────────────────────

  /** @returns {Object} Current resources snapshot */
  getResources() { return { ...this.state.resources }; }

  /** @returns {string[]} Controlled system IDs */
  getControlledSystems() { return [...this.state.controlledSystems]; }

  /** @returns {Object} Bonuses object */
  getBonuses() { return { ...this.state.bonuses }; }

  /** @returns {Object} Restrictions object */
  getRestrictions() { return { ...this.state.restrictions }; }

  /** @returns {Object} Full state snapshot (read-only copy) */
  getState() { return JSON.parse(JSON.stringify(this.state)); }
}
