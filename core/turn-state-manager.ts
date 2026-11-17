/**
 * TurnStateManager — Phase state machine for the three-phase turn model.
 *
 * Manages:
 *  - currentPhase enum (ACTION | RESOLUTION | MAINTENANCE)
 *  - pendingActions[] staged-action list
 *  - turnSummary[] accumulator cleared each new Action Phase
 *  - Phase transitions with galaxy:phaseStart CustomEvent
 *
 * Spec: 028-turn-structure-spec.md
 */

// Phase constants — use these everywhere instead of raw strings
export const TURN_PHASE = {
  ACTION:      'ACTION',
  RESOLUTION:  'RESOLUTION',
  MAINTENANCE: 'MAINTENANCE'
};

export class TurnStateManager {
  _getTurn: any;
  currentPhase: any;
  pendingActions: any[] = [];
  turnSummary: any[] = [];
  lastTurnSummary: any[] = [];
  turnHistory: any[] = [];
  _nextActionId: number = 1;
  /**
   * @param {() => number} getTurnFn - Callback that returns the current turn number
   */
  constructor(getTurnFn: any) {
    this._getTurn = getTurnFn;

    /** @type {string} Current phase */
    this.currentPhase = TURN_PHASE.ACTION;

    /**
     * Staged actions declared during the Action Phase.
     * Each entry: { id, type, payload }
     * Will be consumed by TurnResolutionEngine during Resolution Phase.
     * @type {Array<{id: string, type: string, payload: Object}>}
     */
    this.pendingActions = [];

    /**
     * Accumulator of events from the last Resolution + Maintenance phases.
     * Displayed in the TurnSummaryHUD at the start of the next Action Phase.
     * Each entry: { category, message, systemId?, urgent?, factionId?, outcome?, domain?, systemOwnerFactionId?, playerChoice? }
     * @type {Array}
     */
    this.turnSummary = [];

    /**
     * Turn summary snapshot shown to the player at start of Action Phase.
     * Copied from turnSummary when the previous turn completes.
     * @type {Array}
     */
    this.lastTurnSummary = [];

    /**
     * Running log of all past turn summaries (newest first).
     * Each entry: { turn: number, entries: Array }
     * Persisted via serialize/deserialize; never purged during session.
     * @type {Array<{turn: number, entries: Array}>}
     */
    this.turnHistory = [];

    this._nextActionId = 1;
  }

  // ─── Phase Transitions ───────────────────────────────────────────────────────

  /**
   * Transition to a new phase and fire galaxy:phaseStart event.
   * @param {string} phase - One of TURN_PHASE values
   * @param {Object} [extraDetail={}] - Additional fields merged into the event detail
   * @private
   */
  _transitionTo(phase: any, extraDetail = {}) {
    this.currentPhase = phase;
    window.dispatchEvent(new CustomEvent('galaxy:phaseStart', {
      detail: { phase, turn: this._getTurn(), ...extraDetail }
    }));
    console.log(`[TurnStateManager] Phase transition → ${phase} (Turn ${this._getTurn()})`);
  }

  /**
   * Begin the Action Phase for the current turn (or at game start).
   * - Clears pending actions
   * - Copies turnSummary to lastTurnSummary for HUD display
   * - Resets turnSummary accumulator for the new turn
   */
  beginActionPhase() {
    this.lastTurnSummary = [...this.turnSummary];
    this.turnSummary = [];
    this.pendingActions = [];

    // Add this turn's summary to turn history (newest first).
    // _getTurn() returns the NEW turn number; the summary is from the previous turn.
    if (this.lastTurnSummary.length > 0) {
      this.turnHistory = [
        { turn: this._getTurn() - 1, entries: this.lastTurnSummary },
        ...this.turnHistory,
      ];
    }

    // Pass the previous turn's summary and full history so React can display them.
    this._transitionTo(TURN_PHASE.ACTION, {
      summary:     this.lastTurnSummary,
      turnHistory: this.turnHistory,
    });
  }

  /**
   * Lock the Action Phase and transition to Resolution.
   * Called when the player clicks End Turn.
   *
   * @param {Function} [validateFn] - Optional `() => { valid, conflicts }` callback.
   *   If provided and returns `{ valid: false }`, submission is blocked and
   *   a `galaxy:stagingError` event is dispatched with the conflict list.
   * @returns {{ success: boolean, errors?: string[] }}
   */
  submitActionPhase(validateFn: any) {
    if (this.currentPhase !== TURN_PHASE.ACTION) {
      console.warn('[TurnStateManager] submitActionPhase called outside ACTION phase — ignored');
      return { success: false, errors: ['Not in Action Phase'] };
    }

    if (typeof validateFn === 'function') {
      const { valid, conflicts } = validateFn();
      if (!valid) {
        console.warn('[TurnStateManager] Budget validation failed:', conflicts);
        window.dispatchEvent(new CustomEvent('galaxy:stagingError', {
          detail: { conflicts }
        }));
        return { success: false, errors: conflicts };
      }
    }

    this._transitionTo(TURN_PHASE.RESOLUTION);
    return { success: true };
  }

  /**
   * Transition from Resolution to Maintenance Phase.
   */
  beginMaintenancePhase() {
    if (this.currentPhase !== TURN_PHASE.RESOLUTION) {
      console.warn('[TurnStateManager] beginMaintenancePhase called outside RESOLUTION phase — ignored');
      return;
    }
    this._transitionTo(TURN_PHASE.MAINTENANCE);
  }

  // ─── Staged Actions ──────────────────────────────────────────────────────────

  /**
   * Stage an action during the Action Phase.
   * @param {string} type - Action type (e.g. 'mission', 'construction', 'diplomatic')
   * @param {Object} payload - Action-specific data
   * @returns {{ success: boolean, id?: string, error?: string }}
   */
  stageAction(type: any, payload: any) {
    if (this.currentPhase !== TURN_PHASE.ACTION) {
      return { success: false, error: 'Cannot stage actions outside Action Phase' };
    }
    const id = `action-${this._nextActionId++}`;
    this.pendingActions.push({ id, type, payload });
    return { success: true, id };
  }

  /**
   * Remove a previously staged action.
   * @param {string} id - Action ID returned by stageAction()
   * @returns {{ success: boolean }}
   */
  unstageAction(id: any) {
    const before = this.pendingActions.length;
    this.pendingActions = this.pendingActions.filter((a: any) => a.id !== id);
    return { success: this.pendingActions.length < before };
  }

  /**
   * Get all staged actions of a given type (or all if no type specified).
   * @param {string} [type]
   * @returns {Array}
   */
  getStagedActions(type: any) {
    if (!type) return [...this.pendingActions];
    return this.pendingActions.filter((a: any) => a.type === type);
  }

  // ─── Turn Summary ────────────────────────────────────────────────────────────

  /**
   * Record an event into the turn summary accumulator.
   * Called by TurnResolutionEngine and runMaintenancePhase during processing.
   * @param {string} category - 'resolution' | 'maintenance'
   * @param {string} message - Human-readable description
   * @param {Object} [options]
   * @param {string} [options.systemId] - Primary system ID for map navigation
   * @param {boolean} [options.urgent] - Whether to highlight as urgent alert
   * @param {string|null} [options.factionId] - Faction whose action produced this event
   * @param {string} [options.outcome] - 'critical_success'|'success'|'failure'|'critical_failure'|'info'
   * @param {string|null} [options.domain] - 'combat'|'mission'|'construction'|'diplomacy'|'intel'|'event'|'resource'|'loyalty'|'fleet'|'character'|'tip'
   * @param {string|null} [options.systemOwnerFactionId] - Faction that owned the primary system when the event was recorded
   * @param {string|null} [options.playerChoice] - For alert rows: name of the choice made by the player ('Invade', 'Blockade', etc.)
   * @param {string|null} [options.missionType] - Mission type ID (e.g. 'reconnaissance', 'espionage', 'false_intel')
   */
  recordEvent(category: any, message: any, {
    systemId, urgent,
    factionId, outcome, domain,
    systemOwnerFactionId, playerChoice, missionType
  } : Record<string, any> = {}) {
    this.turnSummary.push({
      category,
      message,
      systemId:             systemId             ?? null,
      urgent:               urgent               ?? false,
      factionId:            factionId            ?? null,
      outcome:              outcome              ?? 'info',
      domain:               domain               ?? null,
      systemOwnerFactionId: systemOwnerFactionId ?? null,
      playerChoice:         playerChoice         ?? null,
      missionType:          missionType          ?? null,
    });
  }

  /**
   * Find the first summary event matching predicate and merge patch into it.
   * Used to retroactively attach player choices to existing alert rows.
   * @param {(evt: Object) => boolean} predicate
   * @param {Object} patch
   */
  updateEvent(predicate: any, patch: any) {
    const evt = this.turnSummary.find(predicate);
    if (evt) Object.assign(evt, patch);
  }

  /**
   * Seal the current turn into turn history with a mode-switch label.
   * Called when switching between realtime and turn-based modes to ensure the
   * current turn (which may never be resolved by the normal path) is visible
   * in the Turn History panel with a system label indicating the mode change.
   *
   * Does NOT change currentPhase, clear pendingActions, or advance turn counter.
   * @param {string} label - Human-readable label for the mode-switch event
   */
  sealTurnForModeSwitch(label: any) {
    // Add a synthetic system entry to make the turn visible even if it has no
    // resolution events (e.g. the player switched modes before any turn resolved).
    this.turnSummary.push({
      category:             'system',
      message:              label,
      systemId:             null,
      urgent:               false,
      factionId:            null,
      outcome:              'info',
      domain:               null,
      systemOwnerFactionId: null,
      playerChoice:         null,
      missionType:          null,
    });

    // Archive the current turn's summary (including the label above).
    this.lastTurnSummary = [...this.turnSummary];
    this.turnSummary     = [];
    this.turnHistory     = [
      { turn: this._getTurn(), entries: this.lastTurnSummary },
      ...this.turnHistory,
    ];

    // Notify React so TurnHistoryPanel refreshes immediately.
    window.dispatchEvent(new CustomEvent('galaxy:phaseStart', {
      detail: {
        phase:       this.currentPhase,
        turn:        this._getTurn(),
        summary:     this.lastTurnSummary,
        turnHistory: this.turnHistory,
      },
    }));
  }

  /**
   * Whether there are any summary events from the previous turn to show.
   * @returns {boolean}
   */
  hasLastTurnSummary() {
    return this.lastTurnSummary.length > 0;
  }

  // ─── Serialization ───────────────────────────────────────────────────────────

  serialize() {
    return {
      currentPhase:     this.currentPhase,
      pendingActions:   [...this.pendingActions],
      turnSummary:      [...this.turnSummary],
      lastTurnSummary:  [...this.lastTurnSummary],
      turnHistory:      [...this.turnHistory],
    };
  }

  static deserialize(data: any, getTurnFn: any) {
    const tsm = new TurnStateManager(getTurnFn);
    tsm.currentPhase    = data.currentPhase    ?? TURN_PHASE.ACTION;
    tsm.pendingActions  = data.pendingActions   ?? [];
    tsm.turnSummary     = data.turnSummary      ?? [];
    tsm.lastTurnSummary = data.lastTurnSummary  ?? [];
    tsm.turnHistory     = data.turnHistory      ?? [];
    return tsm;
  }
}
