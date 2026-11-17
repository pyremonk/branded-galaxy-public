# 062 – Unified Time Display System

## Overview

Define how game time is communicated to the player across all UI components, adapting dynamically between async (turn-based) and sync (realtime) modes. This spec audits every existing time display, specifies how each adapts for sync mode, introduces a shared formatting utility, and resolves an existing inconsistency in per-turn rate suffixes.

## Depends On

- 061 (Timescale Conversion Layer) — defines `TICKS_PER_TURN` and turn-boundary mechanics.
- 060 (Async Flow & Mode Switching UI) — defines ModeIndicatorBadge and SessionPanel.
- 058 (Sync Mode Tick Loop) — defines `SyncTickManager` and tick state.

## Background

### Current State

The game has **25+ components** that display turn-based time information. They use several inconsistent formats:

| Format | Where Used |
|---|---|
| `{N}t` | TechTree nodes, construction queues, ship production, command overview |
| `{N} turn(s) left` | Fleet transit, missions, system overview |
| `{N} turns remaining` | TechDetailPanel research |
| `/t` | TopBarHUD resource deltas |
| `/turn` | ResourceHUD, SystemTooltip resource rates |
| `Turn {N}` | TopBarHUD, ResourceHUD, TurnSummaryHUD, TurnHistoryPanel, VictoryScreen |
| `T{N}` | TransactionLog, ActiveMissionsPanel, FleetStatusPanel combat log |
| `~Turn {N}` | ResearchQueue ETA |

### Problems to Solve

1. **No sync-mode adaptation**: Every component hardcodes "turn" labels. During sync mode, the player needs to know wall-clock estimates (e.g. "~30s" instead of "3 turns").
2. **Inconsistent rate suffix**: `/t` vs `/turn` for the same concept.
3. **No progress context in sync mode**: A construction project "3 turns away" means nothing to a player watching a realtime tick loop — they need "3 turns ≈ 30s" or a progress indicator.
4. **The TopBarHUD doesn't know about modes**: The END TURN button, turn chip, and resource deltas don't adapt.
5. **New sync-mode HUD elements** (ModeIndicatorBadge, SyncTickHUD, turn progress bar) are defined in other specs but not integrated with the existing TopBarHUD layout.

## Requirements

### FR-UTD-001: Time Formatting Utility

Create `src/utils/time-format.js` — a single source of truth for all time display strings:

```js
import { TICKS_PER_TURN } from '../../core/timescale-config.js';

/**
 * @param {number} turns     — duration in turns
 * @param {'async'|'sync'} mode
 * @param {number} ticksPerSecond — current tick rate (sync mode only)
 * @param {number} ticksPerTurn   — TICKS_PER_TURN for this game
 * @returns {string}
 */
export function formatDuration(turns, mode, ticksPerSecond = 1, ticksPerTurn = TICKS_PER_TURN) {
  if (mode === 'async' || !ticksPerSecond) {
    return turns === 1 ? '1 turn' : `${turns} turns`;
  }
  // Sync mode: show turns + wall-clock estimate
  const wallSeconds = (turns * ticksPerTurn) / ticksPerSecond;
  return `${turns} turn${turns !== 1 ? 's' : ''} (${formatWallClock(wallSeconds)})`;
}

/**
 * Compact duration for tight spaces (queue items, tech nodes).
 * @returns {string} e.g. "3t" (async) or "3t ~30s" (sync)
 */
export function formatDurationCompact(turns, mode, ticksPerSecond = 1, ticksPerTurn = TICKS_PER_TURN) {
  if (mode === 'async' || !ticksPerSecond) {
    return `${turns}t`;
  }
  const wallSeconds = (turns * ticksPerTurn) / ticksPerSecond;
  return `${turns}t ${formatWallClock(wallSeconds)}`;
}

/**
 * Per-turn rate suffix.
 * @returns {string} e.g. "/turn" (async) or "/turn (~5s)" (sync)
 */
export function formatRateSuffix(mode, ticksPerSecond = 1, ticksPerTurn = TICKS_PER_TURN) {
  if (mode === 'async' || !ticksPerSecond) {
    return '/turn';
  }
  const wallSeconds = ticksPerTurn / ticksPerSecond;
  return `/turn (${formatWallClock(wallSeconds)})`;
}

/**
 * Format seconds into human-readable wall-clock string.
 * @returns {string} e.g. "30s", "1m 30s", "5m"
 */
function formatWallClock(seconds) {
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
}

/**
 * Turn label for historical references (turn summary, history log, combat log).
 * @returns {string} e.g. "Turn 14" — unchanged between modes.
 */
export function formatTurnLabel(turnNumber) {
  return `Turn ${turnNumber}`;
}

/**
 * Compact turn label for table cells and small badges.
 * @returns {string} e.g. "T14"
 */
export function formatTurnLabelCompact(turnNumber) {
  return `T${turnNumber}`;
}
```

### FR-UTD-002: Game Time Context Provider

Create a React context so every component can access the current mode and tick settings without prop-drilling:

```jsx
// src/contexts/GameTimeContext.jsx
export const GameTimeContext = createContext({
  mode: 'async',         // 'async' | 'sync'
  currentTurn: 1,
  currentTick: 0,
  ticksPerSecond: 1,
  ticksPerTurn: 10,
});

export function useGameTime() {
  return useContext(GameTimeContext);
}
```

The provider wraps the game UI in `App.jsx` and updates from `galaxy:turnUpdate`, `session:gameStatusChanged`, `syncTick:started`, and `syncTick:speedChanged` events.

### FR-UTD-003: TopBarHUD Adaptation

The TopBarHUD layout changes based on mode:

**Async mode** (current behavior, with fixes):

```
[END TURN] | Turn 14 | ◆ 1,200 +50/turn | ⬡ 800 +30/turn | ... | Victory | 🔊 | ☰
```

- Fix: resource delta suffix standardized to `/turn` (currently `/t` in TopBarHUD).

**Sync mode**:

```
[Turn 14 ════════── 70%] | ◆ 1,200 +50/turn (~10s) | ⬡ 800 +30/turn (~10s) | ... | Victory | 🔊 | ☰
```

Changes in sync mode:
- **END TURN button is hidden** — turns resolve automatically at tick boundaries.
- **Turn chip is replaced** by the turn progress bar (spec 061 FR-TCL-006): `Turn 14 [progress bar] 70%` with a `Next turn in 3s` tooltip.
- **Resource delta suffix** changes from `/turn` to `/turn (~10s)` showing wall-clock estimate per turn.
- **Mode badge** (from spec 060) is integrated at the far left of the bar or as a distinct visual treatment (green gradient background for sync, default for async).

### FR-UTD-004: Component Duration Display Adaptations

Every component that displays turn-based durations must call the formatting utility instead of hardcoding strings. The following table specifies the change per component:

#### Duration Countdown Displays

| Component | Current | Async (after) | Sync |
|---|---|---|---|
| **TechTree.jsx** nodes | `{N}t` | `{N}t` | `{N}t ~30s` |
| **TechDetailPanel.jsx** cost | `↻ {N} Turns` | `↻ {N} turns` | `↻ {N} turns (~50s)` |
| **TechDetailPanel.jsx** progress | `{N} turns remaining` | `{N} turns remaining` | `{N} turns remaining (~30s)` |
| **ResearchProgressHUD.jsx** | `{N}t left` | `{N}t left` | `{N}t left ~30s` |
| **ResearchProgressHUD.jsx** ETA | `Completes Turn {N}` | `Completes Turn {N}` | `Completes Turn {N} (~30s)` |
| **ResearchQueue.jsx** | `Starts ~Turn {N} (in {M})` | `Starts ~Turn {N} (in {M} turns)` | `Starts ~Turn {N} (in {M} turns, ~30s)` |
| **FleetStatusPanel.jsx** options | `{N} turn(s)` | `{N} turns` | `{N} turns (~30s)` |
| **FleetStatusPanel.jsx** transit | `{N} turn(s) left` | `{N} turns left` | `{N} turns left (~20s)` |
| **SystemOverviewFleets.jsx** | `Moving ({N} turns)` | `Moving ({N} turns)` | `Moving ({N} turns, ~20s)` |
| **ActiveMissionsPanel.jsx** | `{N} turn(s) left` | `{N} turns left` | `{N} turns left (~10s)` |
| **SystemOverviewMissions.jsx** | `— {N} turn(s) left` | `— {N} turns left` | `— {N} turns left (~10s)` |
| **SystemDetails.jsx** queue | `{N}t` | `{N}t` | `{N}t ~30s` |
| **CommandOverviewPanel.jsx** | `{N}t` | `{N}t` | `{N}t ~30s` |
| **IntelReportsPanel.jsx** gathered | `{N} turn(s) ago` | `{N} turns ago` | `{N} turns ago` (no wall-clock — historical) |
| **IntelReportsPanel.jsx** expiry | `Expires in {N} turn(s)` | `Expires in {N} turns` | `Expires in {N} turns (~30s)` |
| **VictoryScreen.jsx** ETA | `ETA: ~{N} turns` | `ETA: ~{N} turns` | `ETA: ~{N} turns (~5m)` |

#### Per-Turn Rate Displays

| Component | Current | Async (after) | Sync |
|---|---|---|---|
| **TopBarHUD.jsx** | `+{N}/t` | `+{N}/turn` | `+{N}/turn (~10s)` |
| **ResourceHUD.jsx** | `+{N}/turn` | `+{N}/turn` | `+{N}/turn (~10s)` |
| **SystemTooltip.jsx** | `+{N}/turn` | `+{N}/turn` | `+{N}/turn (~10s)` |
| **SystemDetails.jsx** header | `Production per Turn` | `Production per Turn` | `Production per Turn (~10s)` |
| **ResourceBreakdown.jsx** | `Next Turn (est.)` | `Next Turn (est.)` | `Next Turn (est. ~10s)` |

#### Historical Turn References (No Change Needed)

These display past turn numbers and don't need wall-clock estimates:

| Component | Format | Notes |
|---|---|---|
| **TurnSummaryHUD** | `Turn {N} Summary` | Historical — always shows turn number |
| **TurnHistoryPanel** | `Turn {N}` | Historical log entries |
| **TransactionLog** | `T{N}` | Historical log entries |
| **ActiveMissionsPanel** completed | `T{N}` | Historical |
| **FleetStatusPanel** combat log | `T{N}` | Historical |
| **ResourceBreakdown** history | `{N}` in Turn column | Historical |
| **VictoryEndScreen** | `Turn {turnCount}` | Game-over stat |
| **PostGameStats** | `Turn {N}` | Game-over stat |

These use `formatTurnLabel()` or `formatTurnLabelCompact()` for consistency but do not add wall-clock estimates.

### FR-UTD-005: Resource Delta Suffix Standardization

**Current inconsistency**: TopBarHUD uses `/t`, ResourceHUD uses `/turn`, SystemTooltip uses `/turn`.

**Fix**: Standardize all to `/turn` in async mode. The `/t` abbreviation in TopBarHUD was a space-saving choice — with `formatRateSuffix()`, the suffix adapts per mode:
- Async: `/turn`
- Sync: `/turn (~10s)`

TopBarHUD can use a shorter variant if space is tight: `/trn (~10s)`. Define this as `formatRateSuffixCompact()` in the utility.

### FR-UTD-006: Tooltip Enrichment in Sync Mode

In sync mode, all duration displays gain an enriched tooltip on hover showing:

```
3 turns remaining
≈ 30 ticks (30 seconds at 1 Hz)
Next resolution: Turn 15 boundary at tick 150
```

This is implemented via a `<TimeTooltip>` wrapper component:

```jsx
// src/components/TimeTooltip.jsx
export function TimeTooltip({ turns, children }) {
  const { mode, ticksPerSecond, ticksPerTurn, currentTick } = useGameTime();
  
  if (mode === 'async') return children;  // no enrichment in async
  
  const ticks = turns * ticksPerTurn;
  const seconds = ticks / ticksPerSecond;
  const nextBoundaryTick = Math.ceil(currentTick / ticksPerTurn) * ticksPerTurn;
  
  return (
    <span title={`${turns} turns ≈ ${ticks} ticks (${formatWallClock(seconds)})\nNext turn boundary: tick ${nextBoundaryTick}`}>
      {children}
    </span>
  );
}
```

### FR-UTD-007: TopBarHUD Sync Mode Layout

In sync mode, the TopBarHUD transforms:

1. **END TURN button** → **hidden**. The turn resolves automatically. If the player wants to force-complete the current in-progress turn boundary (submit all queued commands immediately), a "FORCE TURN" button can appear instead — this is a stretch goal and NOT required for initial implementation.

2. **Turn chip** → **Turn progress indicator**:
   ```
   Turn 14 [═══════───] 70%
   ```
   - Shows current turn number.
   - Progress bar fills from 0% to 100% as ticks accumulate toward the next turn boundary.
   - Tooltip: "Next turn in 3 ticks (3s)".
   - Clicking still opens Turn History (same as async).

3. **Mode indicator**: The TopBarHUD background or a left-edge badge changes color:
   - Async: default dark theme (`#0d1117`).
   - Sync: subtle green-tinted border or a `SYNC` badge at the far left.

4. **Speed indicator** (sync only): Shows `1× / 2× / 4×` next to the turn progress, reflecting `ticksPerSecond`.

### FR-UTD-008: TurnTimerHUD Adaptation

The existing `TurnTimerHUD` is a multiplayer turn-submission countdown (spec 031). In sync mode:

- **Hidden** — there is no "submit by" deadline in sync mode; turns resolve automatically.
- In async multiplayer: remains as-is (countdown to turn timer expiry).
- In async solo: hidden (no timer in solo).

### FR-UTD-009: ActionLimitsHUD Adaptation

The `TURN ACTIONS` label and per-turn action counts need sync mode awareness:

- **Async**: Unchanged — shows `TURN ACTIONS` with `X / Y` committed this turn.
- **Sync**: Label changes to `PENDING ACTIONS` — shows commands queued since the last turn boundary. At each turn boundary, counters reset to 0.

### FR-UTD-010: TurnSummaryHUD in Sync Mode

In async mode, `TurnSummaryHUD` shows a modal summary after each turn resolution with a "Continue to Turn {N}" button.

In sync mode, the summary is **non-blocking** (per spec 058 FR-STL-007): results are pushed to a notification queue. The TurnSummaryHUD adapts:

- **Not shown as a blocking modal** — instead, a compact notification toast appears: "Turn 14 resolved — 2 combats, 1 mission complete".
- Clicking the toast expands the full summary (same content as async mode).
- The toast auto-dismisses after 5 seconds if not clicked.
- Historical summaries remain accessible via Turn History panel.

### FR-UTD-011: ResolutionHUD in Sync Mode

The `ResolutionHUD` animated step-through (fleet arrivals, combat, etc.) is designed for async mode. In sync mode:

- **Not shown** — resolution runs headlessly (spec 058 FR-STL-007).
- Results are instead displayed via:
  1. Brief toast notifications per significant event ("Fleet arrived at Alpha Centauri", "Combat at Sol — Victory").
  2. The notification queue (accessible via a notification center icon).
  3. Turn History entries.

### FR-UTD-012: Game Duration Display

`VictoryEndScreen` and `PostGameStats` show both turn count and real-time duration:
- `{turnCount}` + `Turns Played`
- `{N}m` + `Duration`

If the game used sync mode, add:
- `{tickCount}` + `Total Ticks` (only if game used sync mode at any point).
- No other changes needed — these are post-game stats.

## Icons

No new icons needed. Uses existing `src/icons.js` constants.

## Constraints

- **Wall-clock estimates are approximate** — displayed with `~` prefix. Network latency can cause actual times to vary.
- **Historical references never show wall-clock** — past turn numbers are absolute, not relative to current tick rate.
- **The formatting utility is the single source of truth** — no component should construct its own "turns"/"t"/"/turn" strings. All go through `time-format.js`.
- **Async mode must look identical to the current UI** after this refactor (modulo the `/t` → `/turn` fix in TopBarHUD). No visual regressions for players who never use sync mode.
- **Sync-mode displays degrade gracefully** — if `ticksPerSecond` is unknown (e.g. during transition), omit the wall-clock parenthetical rather than showing `NaN`.

## Acceptance Criteria

- [ ] `time-format.js` utility exists and is used by all 25+ components that display time.
- [ ] TopBarHUD `/t` suffix changed to `/turn` — consistent with ResourceHUD and SystemTooltip.
- [ ] In async mode, all UI looks identical to current (except the `/t` → `/turn` fix).
- [ ] In sync mode, all duration displays include wall-clock estimates in parentheses.
- [ ] In sync mode, TopBarHUD shows turn progress bar instead of END TURN button.
- [ ] In sync mode, TopBarHUD shows speed indicator.
- [ ] In sync mode, TurnTimerHUD is hidden.
- [ ] In sync mode, ActionLimitsHUD shows "PENDING ACTIONS" and resets at turn boundaries.
- [ ] In sync mode, TurnSummaryHUD shows compact toast instead of blocking modal.
- [ ] In sync mode, ResolutionHUD is not displayed; results appear as toasts.
- [ ] `GameTimeContext` provides mode, tick, and turn state to all child components.
- [ ] Tooltip enrichment shows tick/second breakdown in sync mode.
- [ ] Historical turn references (`Turn {N}`, `T{N}`) are unchanged between modes.
- [ ] Per-turn rate suffix is consistently `/turn` across all components.
- [ ] Graceful fallback: missing tick data omits wall-clock rather than showing errors.

## Files to Create / Modify

### New Files
- `src/utils/time-format.js` — formatting utility functions
- `src/contexts/GameTimeContext.jsx` — React context provider
- `src/components/TimeTooltip.jsx` — sync-mode tooltip enrichment wrapper
- `src/components/TurnProgressBar.jsx` — turn-boundary progress bar (extracted from TopBarHUD sync layout)

### Modified Files (25 components — use `formatDuration` / `formatDurationCompact` / `formatRateSuffix`)
- `src/components/TopBarHUD.jsx` — mode-aware layout, `/t` → `/turn`, sync turn progress bar
- `src/components/TechTree.jsx` — `formatDurationCompact` for node display
- `src/components/TechDetailPanel.jsx` — `formatDuration` for cost and progress
- `src/components/ResearchProgressHUD.jsx` — `formatDurationCompact` + turn ETA
- `src/components/ResearchQueue.jsx` — `formatDuration` for queue ETAs
- `src/components/FleetStatusPanel.jsx` — `formatDuration` for travel options and transit
- `src/components/SystemOverviewFleets.jsx` — `formatDuration` for transit display
- `src/components/ActiveMissionsPanel.jsx` — `formatDuration` for active missions
- `src/components/SystemOverviewMissions.jsx` — `formatDuration` for mission countdowns
- `src/components/SystemDetails.jsx` — `formatDurationCompact` for queues, `formatRateSuffix` for production header
- `src/components/CommandOverviewPanel.jsx` — `formatDurationCompact` for queue rows
- `src/components/IntelReportsPanel.jsx` — `formatDuration` for expiry
- `src/components/VictoryScreen.jsx` — `formatDuration` for ETA
- `src/components/ResourceHUD.jsx` — `formatRateSuffix` for rate display, sync-mode cap forecast
- `src/components/SystemTooltip.jsx` — `formatRateSuffix`
- `src/components/ResourceBreakdown.jsx` — `formatRateSuffix` for headers
- `src/components/TurnTimerHUD.jsx` — hidden in sync mode
- `src/components/ActionLimitsHUD.jsx` — label adaptation
- `src/components/TurnSummaryHUD.jsx` — non-blocking toast mode
- `src/components/ResolutionHUD.jsx` — hidden in sync mode
- `src/App.jsx` — wrap with `GameTimeContext.Provider`

## Relationship to Other Specs

- **Depends on**: 061 (Timescale Conversion), 060 (Mode Switching UI), 058 (Tick Loop)
- **Related**: 028 (Turn Structure) — defines the phases this spec's displays describe
- **Related**: 034–036 (UI & Controls) — existing HUD components being adapted
- **Related**: 006 (Resource Management) — resource production rates displayed per-turn
- **Related**: 051 (Visual Style) — display must follow dark theme conventions
