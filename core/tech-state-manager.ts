/**
 * TechStateManager - Per-faction technology state with serialization.
 *
 * Tracks completed technologies, active research projects, queued technologies,
 * research slots, and applied effects for a single faction.
 *
 * Design note: Starting techs are marked completed without spending resources.
 * Effects from starting techs are already baked into faction base bonuses defined
 * in faction-definitions.json, so they are NOT re-applied here — only recorded
 * in appliedEffects for audit purposes.
 */

const TECH_STATE_VERSION = 1;

export class TechStateManager {
  state: any;
  /**
   * @param {string} factionId - Faction this state belongs to
   * @param {string[]} [startingTechIds=[]] - Tech IDs already completed at game start
   */
  constructor(factionId: any, startingTechIds = []) {
    this.state = this._initializeState(factionId, startingTechIds);
  }

  // ─── Initialization ──────────────────────────────────────────────────────────

  /**
   * Build the initial state object.
   * @private
   */
  _initializeState(factionId: any, startingTechIds: any) {
    const state = {
      techStateVersion: TECH_STATE_VERSION,
      factionId,

      /**
       * IDs of all researched (completed) technologies.
       * @type {string[]}
       */
      completedTechnologies: [] as any[],

      /**
       * Active research projects. Each entry:
       *   { techId, turnsRemaining, totalTurns, startedOnTurn, completesOnTurn }
       * @type {Object[]}
       */
      activeResearchProjects: [],

      /**
       * Queued technology IDs waiting to start (max 3).
       * @type {string[]}
       */
      researchQueue: [],

      /**
       * How many research projects can be active simultaneously.
       * Starts at 1; Autoforge can reach 2 via research-acceleration.
       * @type {number}
       */
      multiResearchSlots: 1,

      /**
       * Record of every applied effect (for re-application on save/load).
       * Each entry: { techId, type, target, value }
       * @type {Object[]}
       */
      appliedEffects: [] as any[]
    };

    // Mark starting techs as completed without spending resources or applying effects
    for (const techId of startingTechIds) {
      state.completedTechnologies.push(techId);
      // Starting tech effects are pre-baked into faction boues — record for audit only
      state.appliedEffects.push({ techId, type: 'starting-tech', target: 'pre-applied', value: 0 });
    }

    return state;
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  /**
   * Check if a technology has been completed.
   * @param {string} techId
   * @returns {boolean}
   */
  isCompleted(techId: any) {
    return this.state.completedTechnologies.includes(techId);
  }

  /**
   * Check if a technology is currently being researched.
   * @param {string} techId
   * @returns {boolean}
   */
  isResearching(techId: any) {
    return this.state.activeResearchProjects.some((p: any) => p.techId === techId);
  }

  /**
   * Check if a technology is in the research queue.
   * @param {string} techId
   * @returns {boolean}
   */
  isQueued(techId: any) {
    return this.state.researchQueue.includes(techId);
  }

  /**
   * Get the active research project for a tech, if any.
   * @param {string} techId
   * @returns {Object|null}
   */
  getActiveProject(techId: any) {
    return this.state.activeResearchProjects.find((p: any) => p.techId === techId) ?? null;
  }

  /**
   * True if there is at least one available research slot.
   * @returns {boolean}
   */
  hasOpenResearchSlot() {
    return this.state.activeResearchProjects.length < this.state.multiResearchSlots;
  }

  // ─── Serialization ───────────────────────────────────────────────────────────

  /**
   * Serialize state to a plain object for persistence.
   * @returns {Object} Plain JS object (safe to embed in JSONB)
   */
  serialize() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Reconstruct a TechStateManager from a previously serialized object or JSON string.
   * Performs a deep copy to avoid shared references.
   *
   * @param {Object|string} data - Plain object or JSON string from serialize()
   * @returns {TechStateManager}
   */
  static deserialize(data: any) {
    let parsed;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (err) {
      throw new Error(`[TechStateManager] Failed to parse serialized state: ${(err as Error).message}`);
    }

    const instance = new TechStateManager(parsed.factionId || 'unknown');

    // Deep-copy all fields from parsed data
    instance.state = {
      techStateVersion: parsed.techStateVersion ?? TECH_STATE_VERSION,
      factionId:                 parsed.factionId ?? 'unknown',
      completedTechnologies:     [...(parsed.completedTechnologies ?? [])],
      activeResearchProjects:    (parsed.activeResearchProjects ?? []).map((p: any) => ({ ...p })),
      researchQueue:             [...(parsed.researchQueue ?? [])],
      multiResearchSlots:        parsed.multiResearchSlots ?? 1,
      appliedEffects:            (parsed.appliedEffects ?? []).map((e: any) => ({ ...e }))
    };

    return instance;
  }

  /**
   * Create a TechStateManager from a plain state object (used when restoring from DataBridge).
   * @param {Object} stateObj
   * @returns {TechStateManager}
   */
  static fromStateObject(stateObj: any) {
    return TechStateManager.deserialize(stateObj);
  }

  // ─── Internal Mutation Helpers ───────────────────────────────────────────────

  /**
   * Mark a tech as completed (called after research finishes).
   * Does NOT apply effects — that is the responsibility of TechResearchEngine.
   * @param {string} techId
   */
  markCompleted(techId: any) {
    if (!this.state.completedTechnologies.includes(techId)) {
      this.state.completedTechnologies.push(techId);
    }
    // Remove from active projects
    this.state.activeResearchProjects = this.state.activeResearchProjects.filter((p: any) => p.techId !== techId);
  }

  /**
   * Record effects applied from a completed tech.
   * @param {string} techId
   * @param {Object[]} effects - The tech's effects array
   */
  recordAppliedEffects(techId: any, effects: any) {
    for (const effect of effects) {
      this.state.appliedEffects.push({ techId, ...effect });
    }
  }
}
