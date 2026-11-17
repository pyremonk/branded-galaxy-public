/**
 * Deterministic ID Generator — Produces identical entity IDs on every client
 * given the same turn state and sequence counter.
 *
 * All entity ID generation in simulation code must use this function
 * to ensure sync-mode multiplayer produces byte-identical state.
 *
 * Spec: 055-simulation-determinism-spec.md (FR-DET-003)
 */

/**
 * Generate a deterministic entity ID.
 * @param {string} prefix  - Entity type prefix (e.g. 'prod', 'recruit', 'exchange')
 * @param {number} turn    - Current turn number
 * @param {string} context - Additional deterministic context (factionId, systemId, etc.)
 * @param {number} seq     - Per-turn sequence counter
 * @returns {string}       - e.g. 'prod-t5-faction_a-0'
 */
export function makeId(prefix: string, turn: number, context: string, seq: number): string {
  return `${prefix}-t${turn}-${context}-${seq}`;
}
