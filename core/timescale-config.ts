/**
 * Timescale Conversion Layer — constants and pure utility functions for
 * mapping tick-based time to turn-based game durations.
 *
 * All game systems remain turn-based.  During sync mode the tick loop
 * accumulates ticks; when the tick counter hits a turn boundary, the full
 * turn-resolution pipeline fires.  Between boundaries commands are accepted
 * but no resolution runs.
 *
 * Sub-turn completion system: actions store a float `completionTurn` (e.g. 3.75)
 * set at queue time using applyVariance().  Four times per turn (at .25/.50/.75/1.00
 * quarter boundaries) resolveCompletions() checks whether any queued actions have
 * reached their completionTurn.  This staggers completions naturally instead of
 * piling everything up at the integer turn boundary.
 *
 * Spec: 061-timescale-conversion-layer-spec.md
 */

import { SeededRandom } from './seeded-random.js';

// ─── Turn Tick Constants ───────────────────────────────────────────────────────

/** Default number of ticks that make up one game turn (4x speed → 30 s/turn). */
export const DEFAULT_TICKS_PER_TURN = 120;

/** Minimum allowed value for ticksPerTurn (4x speed → 15 s/turn — useful for testing). */
export const MIN_TICKS_PER_TURN = 30;

/** Maximum allowed value for ticksPerTurn (0.5x speed → 8 min/turn). */
export const MAX_TICKS_PER_TURN = 240;

// ─── Speed Level Constants ─────────────────────────────────────────────────────

/** Minimum tick rate: 0.5 Hz (2 s per tick). */
export const MIN_TICKS_PER_SECOND = 0.5;

/** Discrete speed levels shown in the HUD. Matches pip count. */
export const SPEED_LEVELS = [0.5, 1, 2, 4];

// ─── Sub-Turn Constants ────────────────────────────────────────────────────────

/**
 * Number of sub-turn checkpoints per full turn.
 * With DEFAULT_TICKS_PER_TURN = 120, checkpoints fall at ticks 30, 60, 90, 120.
 */
export const TURN_SUBDIVISIONS = 4;

// ─── Utility Functions — Turn Boundaries ─────────────────────────────────────

/**
 * Derive the current turn number from tick count.
 *
 * @param {number} tickNumber    – absolute tick counter (0-based, monotonic)
 * @param {number} ticksPerTurn  – ticks per game turn (≥ 1)
 * @param {number} [baseTurn=0]  – turn number when sync mode started
 *                                 (= games.current_turn at the async→sync transition)
 * @returns {number} Current turn number (integer)
 */
export function getCurrentTurnFromTicks(tickNumber: number, ticksPerTurn: number, baseTurn = 0): number {
  return Math.floor(tickNumber / ticksPerTurn) + baseTurn;
}

/**
 * Returns `true` on the tick that completes a turn boundary.
 *
 * Tick 0 is never a boundary (the game hasn't advanced yet).
 *
 * @param {number} tickNumber   – absolute tick counter
 * @param {number} ticksPerTurn – ticks per game turn
 * @returns {boolean}
 */
export function isTurnBoundary(tickNumber: number, ticksPerTurn: number): boolean {
  return tickNumber > 0 && tickNumber % ticksPerTurn === 0;
}

/**
 * Returns `true` on the tick that completes a sub-turn boundary (but NOT a full-turn boundary).
 *
 * With TURN_SUBDIVISIONS = 4 and ticksPerTurn = 240, fires at ticks 60, 120, 180
 * (NOT at 240, which is a full-turn boundary handled by isTurnBoundary).
 *
 * @param {number} tickNumber    – absolute tick counter
 * @param {number} ticksPerTurn  – ticks per game turn
 * @param {number} [subdivisions=TURN_SUBDIVISIONS]
 * @returns {boolean}
 */
export function isSubTurnBoundary(tickNumber: number, ticksPerTurn: number, subdivisions = TURN_SUBDIVISIONS): boolean {
  if (tickNumber <= 0) return false;
  if (isTurnBoundary(tickNumber, ticksPerTurn)) return false;
  const subSize = ticksPerTurn / subdivisions;
  return tickNumber % subSize === 0;
}

/**
 * Returns the current quarter-turn as a float, e.g. 3.75 = turn 3, Q4 checkpoint.
 *
 * Value advances at sub-turn boundaries: 0.0 → 0.25 → 0.50 → 0.75 → 1.00 → 1.25 …
 * At the full-turn boundary the integer portion increments.
 *
 * @param {number} tickNumber    – absolute tick counter
 * @param {number} ticksPerTurn  – ticks per game turn
 * @param {number} [baseTurn=0]  – base turn at sync start
 * @param {number} [subdivisions=TURN_SUBDIVISIONS]
 * @returns {number}
 */
export function quarterTurnNumber(tickNumber: number, ticksPerTurn: number, baseTurn = 0, subdivisions = TURN_SUBDIVISIONS): number {
  const subSize = ticksPerTurn / subdivisions;
  const totalQuarters = Math.floor(tickNumber / subSize);
  return baseTurn + totalQuarters / subdivisions;
}

/**
 * How many ticks remain until the next turn boundary.
 *
 * @param {number} tickNumber   – absolute tick counter
 * @param {number} ticksPerTurn – ticks per game turn
 * @returns {number} ticks remaining (1 … ticksPerTurn)
 */
export function ticksUntilNextTurn(tickNumber: number, ticksPerTurn: number): number {
  const remainder = tickNumber % ticksPerTurn;
  return ticksPerTurn - remainder;
}

/**
 * Clamp a candidate ticksPerTurn value to the allowed range.
 *
 * @param {number} value
 * @returns {number} clamped value within [MIN_TICKS_PER_TURN, MAX_TICKS_PER_TURN]
 */
export function clampTicksPerTurn(value: number): number {
  return Math.max(MIN_TICKS_PER_TURN, Math.min(MAX_TICKS_PER_TURN, Math.round(value)));
}

// ─── Utility Functions — Action Variance ──────────────────────────────────────

/**
 * Apply deterministic random variance to a base action duration.
 *
 * Returns the base duration shifted by ±(varianceFactor * base), rounded to the
 * nearest 0.25, and clamped to a minimum of (base * 0.75).
 *
 * Uses a SeededRandom keyed on actionId so all clients compute the same result
 * (multiplayer determinism).
 *
 * @param {number} baseDuration   – base duration in turns (may be fractional, e.g. 3.5)
 * @param {string} actionId       – unique action identifier (mission-id, queue-item-id, …)
 * @param {number} [varianceFactor=0.15] – fraction of baseDuration for max shift (±15%)
 * @returns {number} final duration rounded to nearest 0.25, minimum baseDuration * 0.75
 */
export function applyVariance(baseDuration: number, actionId: string, varianceFactor = 0.15): number {
  const rng = new SeededRandom(actionId);
  // Generate a value in [-1, 1] by mapping [0,1) → [-1, 1)
  const raw = rng.next() * 2 - 1;
  const shifted = baseDuration + raw * varianceFactor * baseDuration;
  const minimum = baseDuration * 0.75;
  const clamped = Math.max(minimum, shifted);
  // Round to nearest 0.25
  return Math.round(clamped * 4) / 4;
}
