/**
 * Unified Time Display — formatting utility functions.
 *
 * Single source of truth for every time-related string in the UI.
 * Components MUST call these helpers instead of constructing their own
 * "turns" / "t" / "/turn" strings.
 *
 * Spec: 062-unified-time-display-spec.md  (FR-UTD-001)
 */

import { DEFAULT_TICKS_PER_TURN } from '../../core/timescale-config.js';

// ─── Internal Helper ──────────────────────────────────────────────────────────

/**
 * Format seconds into a compact, human-readable wall-clock string.
 * @param {number} seconds
 * @returns {string} e.g. "~30s", "~1m 30s", "~5m"
 */
function formatWallClock(seconds: number) {
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
}

// ─── Duration Formatters ──────────────────────────────────────────────────────

/**
 * Full-length duration string.
 *
 * Async → "1 month" / "3 months"
 * Sync  → "1 month (~10s)" / "3 months (~30s)"
 *
 * @param {number} turns
 * @param {'async'|'sync'} mode
 * @param {number} [ticksPerSecond=1]
 * @param {number} [ticksPerTurn]
 * @returns {string}
 */
export function formatDuration(turns: number, mode: 'async' | 'sync', ticksPerSecond = 1, ticksPerTurn = DEFAULT_TICKS_PER_TURN) {
  const label = turns === 1 ? '1 month' : `${turns} months`;
  if (mode === 'async' || !ticksPerSecond) return label;
  const wallSeconds = (turns * ticksPerTurn) / ticksPerSecond;
  return `${label} (${formatWallClock(wallSeconds)})`;
}

/**
 * Compact duration for tight spaces (queue items, tech nodes).
 *
 * Async → "3mo"
 * Sync  → "3mo ~30s"
 *
 * @param {number} turns
 * @param {'async'|'sync'} mode
 * @param {number} [ticksPerSecond=1]
 * @param {number} [ticksPerTurn]
 * @returns {string}
 */
export function formatDurationCompact(turns: number, mode: 'async' | 'sync', ticksPerSecond = 1, ticksPerTurn = DEFAULT_TICKS_PER_TURN) {
  if (mode === 'async' || !ticksPerSecond) return `${turns}mo`;
  const wallSeconds = (turns * ticksPerTurn) / ticksPerSecond;
  return `${turns}mo ${formatWallClock(wallSeconds)}`;
}

// ─── Rate Suffix Formatters ───────────────────────────────────────────────────

/**
 * Per-turn rate suffix (standard).
 *
 * Async → "/month"
 * Sync  → "/month (~10s)"
 *
 * @param {'async'|'sync'} mode
 * @param {number} [ticksPerSecond=1]
 * @param {number} [ticksPerTurn]
 * @returns {string}
 */
export function formatRateSuffix(mode: 'async' | 'sync', ticksPerSecond = 1, ticksPerTurn = DEFAULT_TICKS_PER_TURN) {
  if (mode === 'async' || !ticksPerSecond) return '/month';
  const wallSeconds = ticksPerTurn / ticksPerSecond;
  return `/month (${formatWallClock(wallSeconds)})`;
}

/**
 * Per-turn rate suffix (compact — for TopBarHUD or tight layouts).
 *
 * Async → "/mo"
 * Sync  → "/mo (~10s)"
 *
 * @param {'async'|'sync'} mode
 * @param {number} [ticksPerSecond=1]
 * @param {number} [ticksPerTurn]
 * @returns {string}
 */
export function formatRateSuffixCompact(mode: 'async' | 'sync', ticksPerSecond = 1, ticksPerTurn = DEFAULT_TICKS_PER_TURN) {
  if (mode === 'async' || !ticksPerSecond) return '/mo';
  const wallSeconds = ticksPerTurn / ticksPerSecond;
  return `/mo (${formatWallClock(wallSeconds)})`;
}

// ─── Turn Label Formatters ────────────────────────────────────────────────────

/**
 * Turn label for historical references (turn summary, history log).
 * Unchanged between modes — past turn numbers are absolute.
 *
 * @param {number} turnNumber
 * @returns {string} e.g. "Month 14"
 */
export function formatTurnLabel(turnNumber: number) {
  return `Month ${turnNumber}`;
}

/**
 * Compact turn label for table cells and small badges.
 *
 * @param {number} turnNumber
 * @returns {string} e.g. "M14"
 */
export function formatTurnLabelCompact(turnNumber: number) {
  return `M${turnNumber}`;
}
