/**
 * TutorialEngine — drives the tutorial step progression.
 *
 * Communicates with the rest of the app via window CustomEvents:
 *   Outbound:
 *     galaxy:tutorialStep      — { step, stepIndex, total }
 *     galaxy:tutorialComplete  — {}
 *   Inbound (player actions):
 *     galaxy:tutorialAdvance       — player pressed "Got it / Next"
 *     galaxy:tutorialSkip          — player pressed "Skip"
 *     galaxy:panelOpen             — panel opened { panel: string }
 *     galaxy:constructionQueued    — construction queued
 *     galaxy:turnSubmitted         — end-turn pressed
 *     galaxy:fleetOrderSubmitted   — fleet order issued
 *     galaxy:missionSubmitted      — mission submitted
 *     galaxy:researchStarted       — research queued
 *     galaxy:tutorialPanZoom       — camera panned or zoomed
 */
export class TutorialEngine {
  steps: any[] = [];
  currentStepIndex: number = -1;
  _autoTimer: any = null;
  _listeners: any = {};
  constructor(steps: any) {
    this.steps = steps;
    this.currentStepIndex = -1;
    this._autoTimer = null;
    this._listeners = {};
    this._registerListeners();
  }

  /** Start the tutorial at a given step index (default 0). */
  start(stepIndex = 0) {
    this.currentStepIndex = stepIndex - 1;
    this._advance();
  }

  /** Advance to the next step (called by player action or auto-advance timer). */
  advance() {
    this._advance();
  }

  /** Skip the current step if it is skipable. */
  skip() {
    const step = this.steps[this.currentStepIndex];
    if (step?.skipable) {
      this._advance();
    }
  }

  /** Reset to beginning and clean up timers/listeners. */
  reset() {
    this._clearAutoTimer();
    this.currentStepIndex = -1;
  }

  /** Tear down all event listeners (call when destroying the engine). */
  destroy() {
    this.reset();
    this._removeListeners();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _advance() {
    this._clearAutoTimer();

    this.currentStepIndex += 1;

    if (this.currentStepIndex >= this.steps.length) {
      window.dispatchEvent(new CustomEvent('galaxy:tutorialComplete', {}));
      return;
    }

    const step = this.steps[this.currentStepIndex];

    window.dispatchEvent(new CustomEvent('galaxy:tutorialStep', {
      detail: {
        step,
        stepIndex: this.currentStepIndex,
        total: this.steps.length
      }
    }));

    // Auto-advance steps that have no condition and a timer
    if (step.condition === null && step.autoAdvanceMs) {
      this._autoTimer = setTimeout(() => {
        this._advance();
      }, step.autoAdvanceMs);
    }
  }

  _clearAutoTimer() {
    if (this._autoTimer !== null) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
  }

  /** Check whether the current step's condition is satisfied and advance if so. */
  _checkCondition(condition: any) {
    const step = this.steps[this.currentStepIndex];
    if (!step || step.condition !== condition) return;
    this._advance();
  }

  _registerListeners() {
    const bind = (event: any, handler: any) => {
      this._listeners[event] = handler;
      window.addEventListener(event, handler);
    };

    // Player explicitly advances via overlay button
    bind('galaxy:tutorialAdvance', () => {
      const step = this.steps[this.currentStepIndex];
      if (!step) return;
      // Only allow manual advance when condition is already met (or no condition)
      if (!step.condition || step.condition === null) {
        this._advance();
      }
    });

    bind('galaxy:tutorialSkip', () => this.skip());

    // Panel open — matches conditions like "panelOpen:fleet"
    bind('galaxy:panelOpen', (e: any) => {
      const panelId = e.detail?.panel ?? '';
      this._checkCondition(`panelOpen:${panelId}`);
    });

    bind('galaxy:constructionQueued', () => this._checkCondition('constructionQueued'));
    bind('galaxy:turnSubmitted',      () => this._checkCondition('turnSubmitted'));
    bind('galaxy:fleetOrderSubmitted',() => this._checkCondition('fleetOrderSubmitted'));
    bind('galaxy:missionSubmitted',   () => this._checkCondition('missionSubmitted'));
    bind('galaxy:researchStarted',    () => this._checkCondition('researchStarted'));

    // Pan — triggers when the player pans the camera
    bind('galaxy:tutorialPanZoom', () => this._checkCondition('pan'));
  }

  _removeListeners() {
    for (const [event, handler] of (Object.entries(this._listeners) as [string, any][])) {
      window.removeEventListener(event as any, handler);
    }
    this._listeners = {};
  }
}
