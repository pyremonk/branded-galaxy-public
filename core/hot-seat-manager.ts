/**
 * HotSeatManager — manages hot-seat multiplayer turn sequencing.
 *
 * Tracks which human player is currently taking their Action Phase and
 * advances through the player list until all humans have submitted, at
 * which point the Resolution Phase can run normally.
 *
 * Spec: 049-multiplayer-modes-spec.md (FR-MP-002, FR-MP-003)
 */
export class HotSeatManager {
  players: any;
  currentIndex: number = 0;
  /**
   * @param {Array<{factionId: string, name: string}>} players
   *   Ordered list of human players. P1 is index 0.
   */
  constructor(players: any) {
    /** @type {Array<{factionId: string, name: string}>} */
    this.players = players;
    /** @type {number} Index of the player currently taking their Action Phase */
    this.currentIndex = 0;
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  /** @returns {{factionId: string, name: string}} The active hot-seat player */
  getCurrentPlayer() {
    return this.players[this.currentIndex];
  }

  /**
   * @returns {boolean} True when the current player is the last human player
   *   in the sequence; after they submit, Resolution Phase should run.
   */
  isLastPlayer() {
    return this.currentIndex === this.players.length - 1;
  }

  /** @returns {number} Total number of human players */
  get playerCount() {
    return this.players.length;
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  /** Advance to the next player in the hot-seat sequence. */
  advanceToNextPlayer() {
    this.currentIndex = (this.currentIndex + 1) % this.players.length;
  }

  /** Reset to first player — called at the start of each new turn. */
  reset() {
    this.currentIndex = 0;
  }

  // ─── Serialization ───────────────────────────────────────────────────────────

  serialize() {
    return {
      players:      this.players,
      currentIndex: this.currentIndex,
    };
  }

  static deserialize(data: any) {
    const hsm = new HotSeatManager(data.players ?? []);
    hsm.currentIndex = data.currentIndex ?? 0;
    return hsm;
  }
}
