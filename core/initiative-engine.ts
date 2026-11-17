/**
 * InitiativeEngine — Seeded deterministic initiative order for faction sequencing.
 *
 * - Rolls initiative at game start using SeededRandom (same seed as galaxy generation)
 * - Stores faction order (highest score first) for use throughout the game
 * - Provides comparison helpers for resolution sequencing
 * - Initiative is static for the full game in Phase 1B (FR-TO-002)
 *
 * Spec: 029-turn-order-spec.md
 */
import { SeededRandom } from './seeded-random.js';

/** Event name dispatched once initiative is determined */
export const INITIATIVE_SET_EVENT = 'galaxy:initiativeSet';

export class InitiativeEngine {
  order: string[] = [];
  _scores: Record<string, number> = {};

  constructor() {
    /** @type {string[]} Faction IDs sorted highest-to-lowest initiative score */
    this.order = [];

    /** @type {Record<string, number>} factionId → initiative score */
    this._scores = {};
  }

  /**
   * Roll initiative for all factions using the game seed.
   * Must be called once during game initialization (MainStage.create()).
   *
   * @param {string[]} factionIds - All active faction IDs
   * @param {string|number} gameSeed - Seed used for galaxy generation (for determinism)
   * @returns {string[]} Faction IDs sorted highest-to-lowest initiative
   */
  rollInitiative(factionIds: any, gameSeed: any) {
    // Use a sub-seed derived from the game seed so initiative rolls don't
    // collide with the galaxy generation sequence
    const rng = new SeededRandom(`${gameSeed}:initiative`);

    const rolls = factionIds.map((id: any) => ({
      id,
      score: rng.nextInt(1, 1000)
    }));

    // Sort descending; use alphabetical faction ID as deterministic tiebreaker
    rolls.sort((a: any, b: any) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id < b.id ? -1 : 1;          // FR-TO-004 alphabetical tiebreaker
    });

    this._scores = Object.fromEntries(rolls.map((r: any) => [r.id, r.score]));
    this.order   = rolls.map((r: any) => r.id);

    console.log('[InitiativeEngine] Initiative order determined:',
      this.order.map((id: any) => `${id}(${this._scores[id]})`).join(' > ')
    );

    // Notify React layer so InitiativeIndicator can render the order
    window.dispatchEvent(new CustomEvent(INITIATIVE_SET_EVENT, {
      detail: {
        order:  this.order,
        scores: { ...this._scores }
      }
    }));

    return this.order;
  }

  /**
   * Get the current initiative order.
   * @returns {string[]} Faction IDs sorted highest-to-lowest
   */
  getOrder() {
    return [...this.order];
  }

  /**
   * Get the initiative score for a faction.
   * @param {string} factionId
   * @returns {number} Score, or -1 if unknown
   */
  getScore(factionId: any) {
    return this._scores[factionId] ?? -1;
  }

  /**
   * Compare two factions by initiative for use in sort callbacks.
   * Returns negative if factionA has higher initiative (sorts first).
   *
   * @param {string} factionA
   * @param {string} factionB
   * @returns {number}
   */
  compareInitiative(factionA: any, factionB: any) {
    const scoreA = this._scores[factionA] ?? -1;
    const scoreB = this._scores[factionB] ?? -1;
    if (scoreB !== scoreA) return scoreB - scoreA;       // higher score first
    return factionA < factionB ? -1 : 1;                 // alphabetical tiebreaker
  }

  /**
   * Get the index of a faction in the initiative order.
   * Lower index = higher initiative. Returns 999 for unknown factions.
   *
   * @param {string} factionId
   * @returns {number}
   */
  getInitiativeIndex(factionId: any) {
    const idx = this.order.indexOf(factionId);
    return idx === -1 ? 999 : idx;
  }

  /**
   * Serialize for save/load.
   * @returns {Object}
   */
  serialize() {
    return { order: [...this.order], scores: { ...this._scores } };
  }

  /**
   * Restore from saved data (no re-roll; initiative is static).
   * @param {Object} data
   */
  deserialize(data: any) {
    this.order   = data.order   ?? [];
    this._scores = data.scores  ?? {};
  }
}
