# 060 – Async Turn-Based Flow & Mode Switching UI

## Overview

This spec covers two tightly coupled features:
1. **Async turn-based flow** — the default pacing mode where players submit turn orders at their own pace and the game advances turn-by-turn.
2. **Mode switching UI** — the player-facing controls for transitioning between async and sync modes, viewing session status, and adjusting sync speed.

These are combined in one spec because the async flow is meaningless without mode switching, and the mode switching UI needs the async flow to exist as the "other side" of the toggle.

## Depends On

- 055 (Simulation Determinism) — async resolution must also be deterministic for consistency.
- 056 (Game Session & Presence Foundation) — `turn_orders` table, `games` table, Presence.
- 057 (Host Election & Ready System) — ready toggles and host election gate sync entry.
- 058 (Sync Mode Tick Loop) — the sync side of the mode switch.
- 059 (Snapshots & Reconciliation) — snapshot on mode transition.

## Background

### Current Turn Submission Flow

The existing network turn flow (per `NetworkSessionManager` and `MainStage`):

1. Player stages orders during Action Phase.
2. Player clicks End Turn → `MainStage.submitActionPhase()`.
3. If `networkMode`: orders are broadcast via Supabase Realtime → host accumulates.
4. When all players submit: host runs `TurnResolutionEngine` → broadcasts state delta.
5. Guests apply the delta.

This is close to the async model but has gaps:
- **Orders are ephemeral** — sent via Broadcast, not persisted. If a player disconnects, their orders are lost.
- **No turn timer** — spec 031 mentions one but implementation is a stub.
- **No "waiting for players" persistence** — if the host disconnects mid-collection, the turn is lost.

The async flow in this spec writes orders to the `turn_orders` **table** (persistent) instead of ephemeral Broadcast, making them survive disconnects.

### Hot-Seat / Network / Sync Branch Conflict

`MainStage.submitActionPhase()` currently has separate code paths:
```js
if (this.networkMode) {
  // submit via NetworkSessionManager
  return;
}
if (this.hotSeatManager && !isLastPlayer()) {
  // advance to next player
  return;
}
// single-player: run resolution immediately
```

Adding async + sync modes creates a fourth and fifth branch. This must be refactored into a unified submission strategy:

```js
const strategy = this._getSubmissionStrategy();
//  'solo'     → resolve immediately
//  'hotseat'  → cycle players, resolve when last submits
//  'async'    → write to turn_orders, wait for all
//  'sync'     → submit via SyncTickManager per-tick
strategy.submit(orders);
```

## Requirements

### Async Turn-Based Flow

#### FR-ATF-001: Order Persistence

When a player submits their Action Phase orders in async mode:
1. Orders are written to the `turn_orders` table: `(game_id, turn_number, player_id, orders JSONB)`.
2. The unique constraint `(game_id, turn_number, player_id)` prevents double-submission.
3. Orders survive browser close — the player can disconnect and return later.

#### FR-ATF-002: Turn Advancement

A turn advances when:
1. **All human players** have rows in `turn_orders` for the current `turn_number`, **OR**
2. **Turn timer expires** (if configured at game setup; default: no timer).

Detection:
- Each client subscribes to Postgres Changes on `turn_orders` (filtered by `game_id` and `turn_number`).
- When a new row appears, client checks if all players have submitted.
- The **lobby host** (or any single designated client — use advisory lock) runs the resolution.

#### FR-ATF-003: Turn Resolution in Async Mode

The lobby host:
1. Fetches all `turn_orders` for `(game_id, current_turn)`.
2. Sorts orders by `player_id` (deterministic order per spec 029).
3. Runs AI turns for AI-controlled factions.
4. Runs `TurnResolutionEngine.runPreInvasionPhase()` and `runPostInvasionPhase()`.
5. Runs maintenance phase.
6. Serializes new state → writes to `game_state` table.
7. Increments `games.current_turn`.
8. All clients receive the updated `game_state` via Postgres Changes and hydrate.

**Guard**: Use an atomic `UPDATE games SET current_turn = current_turn + 1 WHERE current_turn = {expected}` to prevent double resolution if two clients race.

#### FR-ATF-004: Turn Timer

Optional per-game configuration:
- `turnTimerMinutes`: 0 (disabled, default), 5, 10, 30, 60, 1440 (24h).
- Timer starts when the first player submits orders for the current turn.
- Timer is stored in the `games` table (add `turn_timer_minutes` and `turn_timer_started_at` columns).
- On expiry: unsubmitted players' orders default to empty `[]` (they took no action).
- Client-side countdown display in the HUD.

#### FR-ATF-005: `TurnManager` Module

New module: `core/turn-manager.js`

```js
// Order submission
submitOrders(gameId, turnNumber, playerId, commands[])  → Promise<void>
hasSubmitted(gameId, turnNumber, playerId)               → Promise<boolean>
getSubmittedPlayers(gameId, turnNumber)                  → Promise<string[]>

// Turn resolution (host only)
resolveTurn(gameId, turnNumber, stateManagers)           → Promise<void>
canResolveTurn(gameId, turnNumber, requiredPlayers)      → Promise<boolean>

// Subscriptions
subscribeToOrderUpdates(gameId, turnNumber, callback)    → unsubscribe
subscribeToTurnAdvance(gameId, callback)                 → unsubscribe

// Timer
startTurnTimer(gameId, durationMinutes)                  → void
getTurnTimerRemaining(gameId)                            → number | null  // seconds
```

Offline mode: persists orders to `localStorage`; resolves immediately (single-player).

#### FR-ATF-006: Offline Mode Async Flow

- Single-player; `resolveTurn` is called immediately after `submitOrders`.
- No network calls; all state in `localStorage`.
- Orders stored as `localStorage.getItem('turn_orders_{gameId}_{turn}')`.
- Timer is not applicable in offline mode.

### Mode Switching

#### FR-MSW-001: Mode Indicator Badge

Persistent HUD element showing current mode:
- **ASYNC** — amber background, shows `Turn {N}`.
- **SYNC** — green background, shows `Tick {N} @ {rate} Hz`.
- Positioned in the existing HUD area (near turn counter).
- Uses Unicode text glyphs from `src/icons.js` — no emoji.

#### FR-MSW-002: Session Panel

New React component: `SessionPanel.jsx`

Displayed as an expandable/collapsible side panel (similar to existing info panels). The panel adapts based on game mode:

**Multiplayer layout** (2+ human players):
1. **Player list**: For each player:
   - Display name
   - Online indicator: `●` (green=online, gray=offline) — use `\u25CF` from `icons.js`
   - Ready indicator: `✓` (green when ready) — use `\u2713` from `icons.js`
   - Host indicator: `★` (gold) — use `\u2605` from `icons.js`
   - Faction name and color
2. **Ready toggle button** (own row only): toggles `isReady` via `SessionPresenceManager`.
3. **Mode section**:
   - Current mode label (ASYNC / SYNC).
   - In async mode: "All players must be ready to start Realtime Mode".
   - In sync mode: "Realtime Mode active".
4. **Speed controls** (host only, sync mode only):
   - `ticksPerSecond` slider: 1–4 Hz.
   - `timePerTick` selector: configurable game-time units.
5. **Return to Async button**:
   - Host: immediate return (calls `SyncTickManager.stopTickLoop()`).
   - Non-host: sends async vote.

**Solo layout** (1 human player):
1. **Mode toggle button**: a single prominent button:
   - In async mode: "Switch to Realtime" (green accent).
   - In sync mode: "Switch to Turn-Based" (amber accent).
   - Click transitions immediately — no ready ceremony, no vote, no waiting.
2. **Speed controls** (sync mode only):
   - `ticksPerSecond` slider: 1–4 Hz.
   - `timePerTick` selector.
3. **Mode section**: Current mode label and brief description.
4. No player list, no ready toggle, no vote UI — these are multiplayer-only concerns.

**Hot-seat**: Session Panel is hidden entirely. Hot-seat games are async-only (spec 057 FR-HER-008).

#### FR-MSW-003: Async → Sync Transition

Trigger varies by player count:

**Multiplayer**: All players ready + game at turn boundary + host elected (per spec 057).

**Solo**: Player clicks "Switch to Realtime" button. No prerequisites other than being at a turn boundary (not mid-resolution).

Transition sequence:
1. Host writes a snapshot of current state (spec 059).
2. Host sets `games.status = 'sync'`, writes `current_tick = 0`.
3. `session:gameStatusChanged` CustomEvent fires on all clients.
4. `SyncTickManager.startTickLoop()` begins.
5. Mode badge updates to SYNC.
6. Session panel updates player status.

#### FR-MSW-004: Sync → Async Transition

Triggers vary by player count:

**Multiplayer** (per spec 057 FR-HER-006):
1. Host clicks "Return to Async".
2. Majority vote (non-host players).
3. Required player disconnect.
4. Any player sets `isReady = false`.

**Solo**: Player clicks "Switch to Turn-Based" button. Immediate transition.

Transition sequence:
1. Host completes the current tick and writes final snapshot.
2. Host calls `SyncTickManager.stopTickLoop()`.
3. Host sets `games.status = 'async'`, `games.host_user_id = null`, `games.current_tick = null`.
4. `session:fallbackToAsync` fires on all clients.
5. Mode badge updates to ASYNC.
6. Normal async Action Phase begins for the next turn.

#### FR-MSW-005: Async Vote for Non-Host Players

When a non-host player clicks "Request Async Mode" during sync:
1. A broadcast message `{ type: 'vote_async', playerId }` is sent.
2. Host tracks votes. When votes ≥ ceil(playerCount / 2): host initiates sync → async transition.
3. UI shows vote count: `{n}/{required} voted`.
4. Votes reset when a new sync session starts.

#### FR-MSW-006: Unified Submission Strategy

Refactor `MainStage.submitActionPhase()` to use a strategy pattern:

```js
_getSubmissionStrategy() {
  if (this.gameStatus === 'sync' && this._isSolo())  return this._soloSyncStrategy;
  if (this.gameStatus === 'sync')                     return this._syncSubmissionStrategy;
  if (this.networkMode)                               return this._asyncNetworkStrategy;
  if (this.hotSeatManager)                            return this._hotSeatStrategy;
  return this._soloStrategy;  // solo async (turn-based)
}
```

**`soloSyncStrategy`**: feeds commands directly to the local `SyncTickManager` without network. AI commands are generated by `AIController` each tick.

**`soloStrategy`**: existing behavior — resolve turn immediately.

Each strategy implements:
```js
{
  submit(orders)        → void | Promise<void>
  canSubmit()           → boolean
  getStatusLabel()      → string  // "Waiting for players...", "Your turn", etc.
}
```

This eliminates the branching `if/else` chain and makes adding new modes safe.

#### FR-MSW-007: Async Turn HUD Elements

- **Turn indicator**: `Turn {N}` (already exists; integrate with mode badge).
- **Submission status**: `{submitted}/{total} submitted` — shown during async collection phase.
- **End Turn button**: calls `TurnManager.submitOrders()`, then disables until next turn starts.
- **Timer countdown**: if turn timer is configured, shows remaining time.
- **Waiting overlay**: semi-transparent overlay with "Waiting for other players..." when local player has submitted but not all have.

### Icons

All new icons defined in `src/icons.js` using `\u{XXXXX}` escapes:

```js
export const ICON_ONLINE      = '\u25CF';  // ● filled circle
export const ICON_READY       = '\u2713';  // ✓ check mark
export const ICON_HOST        = '\u2605';  // ★ filled star
export const ICON_CLOCK       = '\u23F1';  // ⏱ stopwatch (timer)
export const ICON_SYNC        = '\u27F3';  // ⟳ clockwise arrow (sync mode)
```

## Constraints

- No emoji anywhere (per project icon rules).
- The existing `NetworkSessionManager` turn-submission flow (Broadcast-based) must continue to work as a fallback for games that haven't been migrated to the new `turn_orders` table flow.
- **Hot-seat mode is async-only** — the mode toggle and Session Panel are hidden for hot-seat games. Hot-seat is earmarked for deprecation (see backlog).
- Speed controls are only interactive for the host (or the solo player); non-host sees read-only values.
- The Session Panel must not reveal information about other factions that the player shouldn't know (e.g. don't show faction-specific state — only names, online status, ready status).
- **Solo mode switching must feel instant** — no loading screens, no waiting states, no multi-step ceremony. One click to toggle.

## Acceptance Criteria

### Async Flow
- [ ] Player can submit orders; row appears in `turn_orders` table.
- [ ] Turn resolves when all players submit; new `game_state` row appears.
- [ ] All connected clients hydrate new state via Postgres Changes.
- [ ] End Turn button disables after submission and re-enables on new turn.
- [ ] Double-submission is blocked by unique constraint.
- [ ] Turn timer countdown displays correctly; turn auto-resolves on expiry.
- [ ] Offline mode completes a full turn cycle without network.

### Mode Switching
- [ ] Mode badge shows ASYNC/SYNC with correct styling.
- [ ] Session Panel renders multiplayer layout with player list for 2+ human players.
- [ ] Session Panel renders solo layout with direct mode toggle for single player.
- [ ] Solo player can switch from async to sync with one click (no ready ceremony).
- [ ] Solo player can switch from sync to async with one click.
- [ ] Solo mode switch is instant — no loading screen or waiting state.
- [ ] Ready toggle reflects on all clients within 1 second (multiplayer).
- [ ] Host-only speed controls are not interactive for non-host.
- [ ] Solo player always has access to speed controls in sync mode.
- [ ] Speed change takes effect within one tick interval.
- [ ] Return-to-async vote works for both host and non-host paths (multiplayer).
- [ ] Async → Sync transition produces a snapshot before starting tick loop.
- [ ] Sync → Async transition writes final snapshot and resets tick state.
- [ ] Unified submission strategy routes correctly for solo-async, solo-sync, multiplayer-async, multiplayer-sync, and hot-seat modes.
- [ ] Hot-seat games: Session Panel is hidden; mode toggle is unavailable.
- [ ] No emoji in any icon or label.

## Files to Create / Modify

- `core/turn-manager.js` — **new**
- `src/components/SessionPanel.jsx` — **new**
- `src/components/ModeIndicatorBadge.jsx` — **new**
- `src/components/TurnTimerDisplay.jsx` — **new**
- `src/components/EndTurnButton.jsx` — **new** (or modify existing HUD)
- `src/icons.js` — add session/mode icon constants
- `engine/main-stage.js` — refactor `submitActionPhase()` to use strategy pattern
- `core/sync-tick-manager.js` — integrate speed change from UI controls
- `supabase/migrations/{timestamp}_turn_timer_columns.sql` — add `turn_timer_minutes`, `turn_timer_started_at` to `games` table

## Relationship to Other Specs

- **Depends on**: 055, 056, 057, 058, 059 (all prior specs in this feature set)
- **Related**: 028 (Turn Structure) — async mode follows the same 3-phase turn model
- **Related**: 029 (Turn Order) — command ordering rules apply to async orders
- **Related**: 031 (Turn Timer) — this spec implements the network turn timer that 031 designed for
- **Related**: 049 (Multiplayer Modes) — adds async/sync as a pacing dimension
- **Related**: 050 (Network Features) — async mode replaces ephemeral Broadcast order submission with persistent `turn_orders` table
- **Related**: 037 (Game Mode Selection) — mode selection screen will need a new option for async/sync preference (future UI enhancement)
