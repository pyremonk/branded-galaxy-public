# 058 – Sync Mode Tick Loop

## Overview

Implement the deterministic lockstep tick loop that runs during sync (realtime) mode. The elected host drives ticks at a configurable rate (1–4 Hz); all clients apply the same authoritative input bundle per tick to keep simulation state identical.

## Depends On

- 055 (Simulation Determinism) — all simulation code must be deterministic before sync mode is viable.
- 056 (Game Session & Presence Foundation) — Broadcast channel `game:{gameId}:realtime` and `games` table.
- 057 (Host Election & Ready System) — elected host drives the tick loop.

## Background

### Current Turn Resolution Architecture

`TurnResolutionEngine` runs **synchronously** on the host during the Resolution Phase:

```
MainStage._runResolutionPhase()
  → turnResolutionEngine.runPreInvasionPhase(...)
  → [invasion choice modal pause]
  → turnResolutionEngine.runPostInvasionPhase(...)
  → _runMaintenancePhase()
```

The Resolution Phase is **stateless** — it reads from state managers, computes results, and writes back. This makes it suitable for lockstep execution if all clients have identical state and identical inputs.

### Key Architectural Conflict: UI Choreography in Resolution

`MainStage._runResolutionPhase()` is `async` because it interleaves UI modals (fleet arrival animations, combat result displays, invasion choice prompts) between resolution steps. In sync mode:

- **Resolution must be headless on all clients** — no blocking modals during lockstep ticks.
- **UI choreography becomes optional** — results are queued for display but don't block the tick loop.
- **Invasion choice** is the one exception: it requires player input. In sync mode, this becomes a **command** submitted during the tick where the invasion opportunity is detected.

This spec defines how the tick loop works. The separation of "headless resolution" from "UI presentation" is part of the implementation, not a separate spec.

## Requirements

### FR-STL-001: Broadcast Channel Messages

All messages are sent via Supabase Broadcast on channel `game:{gameId}:realtime`.

```js
// Host → All: Start of a new tick
TickStartMessage = {
  type: 'tick_start',
  gameId: string,
  tickNumber: number,
  ticksPerSecond: number,
  timePerTick: number,
}

// Player → Host: Commands for this tick
PlayerInputMessage = {
  type: 'player_input',
  gameId: string,
  tickNumber: number,
  playerId: string,
  commands: Command[],
}

// Host → All: Authoritative bundle all clients must apply
AuthoritativeInputBundleMessage = {
  type: 'authoritative_input_bundle',
  gameId: string,
  tickNumber: number,
  inputsByPlayer: Record<string, Command[]>,  // playerId → commands
}

// Host → All: Speed change announcement
SpeedChangeMessage = {
  type: 'speed_change',
  gameId: string,
  ticksPerSecond: number,
  timePerTick: number,
  effectiveAtTick: number,
  requestedBy: string,
}
```

### FR-STL-002: `Command` Structure

Commands are the same deterministic, serializable objects used in async `turn_orders`:

```js
Command = {
  type: string,       // e.g. 'move_fleet', 'claim_sector', 'start_research', 'invade_planet'
  payload: object,    // command-specific data; must contain no timestamps or random values
  seq: number,        // ordering index within the player's commands for this tick
}
```

The existing turn-order system (spec 029) already defines command types. Sync mode reuses the same command vocabulary — the difference is that commands are submitted per-tick instead of per-turn.

### FR-STL-003: New Module — `core/sync-tick-manager.js`

Singleton module. API:

```js
// Lifecycle (host only)
startTickLoop(gameId, ticksPerSecond, timePerTick)  → void
stopTickLoop()                                       → void
isRunning()                                          → boolean

// Input submission (all clients)
sendPlayerInput(gameId, tickNumber, playerId, commands[])  → void

// Event handlers (all clients)
onTickStart(callback)          → unsubscribe
onInputBundle(callback)        → unsubscribe
onSpeedChange(callback)        → unsubscribe

// Speed control (host only)
changeSpeed(ticksPerSecond, timePerTick)  → void

// State
getCurrentTick()               → number
getTicksPerSecond()            → number
getTimePerTick()               → number
```

### FR-STL-004: Host Tick Loop

The host runs a `setInterval`-based scheduler:

```
startTickLoop(gameId, ticksPerSecond, timePerTick):
  intervalMs = 1000 / ticksPerSecond
  
  every intervalMs:
    tick = ++currentTick
    
    broadcast TickStartMessage { tickNumber: tick, ticksPerSecond, timePerTick }
    
    // Collect inputs from all players (including self)
    inputs = collectInputs(tick, timeout = intervalMs * 0.8)
    
    // Build and broadcast authoritative bundle
    bundle = { tickNumber: tick, inputsByPlayer: inputs }
    broadcast AuthoritativeInputBundleMessage(bundle)
    
    // Apply locally (host is also a simulation client)
    applyInputBundle(bundle)
    
    // Periodic snapshot (spec 059)
    if (tick % SNAPSHOT_INTERVAL === 0):
      writeSnapshot(gameId, tick)
    
    // Update games table periodically (every 5 ticks)
    if (tick % 5 === 0):
      update games.current_tick = tick
```

### FR-STL-005: Input Collection

For each tick, the host:
1. Initializes an empty `inputsByPlayer` map.
2. Listens for `player_input` messages with matching `tickNumber`.
3. Waits until all expected players have submitted **or** the per-tick timeout (80% of interval) elapses.
4. Players who don't submit in time get an empty `commands: []` — they took no action this tick.
5. The host's own commands are injected locally (not via broadcast) to avoid round-trip latency.

### FR-STL-006: Client Simulation Integration

All clients (including host) process ticks identically:

1. **On `tick_start`**: UI may display tick progress indicator. Non-host clients collect pending commands from the current Action Phase UI.
2. **On `authoritative_input_bundle`**: 
   - Sort `inputsByPlayer` keys alphabetically (deterministic iteration order).
   - For each player, sort commands by `seq`.
   - Apply each command to the relevant state manager.
   - Advance in-game time by `timePerTick`.
3. **Queue model**: Bundles are queued and processed in order. If a client receives tick N+1 before finishing tick N, it queues N+1 and processes after N completes.

### FR-STL-007: Headless Resolution During Sync

During sync mode, the Resolution Phase is executed **without blocking modals**:

- `TurnResolutionEngine` methods run headlessly (no `await` for UI).
- Results (combat outcomes, mission results, construction completions) are **pushed to a notification queue** instead of displayed via modal.
- The notification queue is displayed asynchronously — React components pull from it on their render cycle.
- **Invasion choice**: In async mode, this is a modal that pauses resolution. In sync mode, it becomes a `PlayerInputMessage` with `type: 'invade_planet'` command. The host pauses invasion resolution until the relevant tick's input bundle includes the invasion decision (or the tick times out, defaulting to "no invasion").

### FR-STL-008: `MainStage` Integration

`MainStage` needs a mode switch:

```
if (gameStatus === 'sync') {
  // Simulation driven by input bundles from SyncTickManager
  // Phaser update() only handles rendering, camera, particles
  // No direct calls to _runResolutionPhase(), _runMaintenancePhase()
} else {
  // Existing async/turn-based flow unchanged
}
```

Window events bridge sync tick events to MainStage:
- `syncTick:bundle` — carries the `AuthoritativeInputBundleMessage` detail.
- `syncTick:started` — carries tick number for HUD update.
- `syncTick:stopped` — sync mode ended; resume async flow.

### FR-STL-009: Speed Change

Host can change `ticksPerSecond` and `timePerTick` mid-session:

1. Host broadcasts `SpeedChangeMessage` with `effectiveAtTick = currentTick + 2` (gives clients time to receive).
2. All clients adjust their local expectations at the specified tick.
3. Host restarts `setInterval` with the new interval.
4. Host updates `games.ticks_per_second` and `games.time_per_tick`.

### FR-STL-010: Solo Mode Tick Loop

Solo mode (single human player vs AI) is a **first-class use case** for the sync tick loop, not just a testing fallback.

When solo:
- The tick loop runs **locally** with no Broadcast channel overhead.
- The player is always the host; `startTickLoop()` runs on the local client.
- **Input collection is instant** — no network timeout needed. The player’s commands are injected directly; AI commands are computed locally by `AIController` and injected into the bundle.
- `applyInputBundle()` runs identically to the multiplayer path — same deterministic command application.
- Speed controls are always available (player is always host).
- The player can toggle between async (turn-based) and sync (realtime) at any time via a direct mode switch (no ready ceremony; see spec 057 FR-HER-007).
- Snapshots are written to `localStorage` (offline) or `game_snapshots` table (online solo).
- **AI tick frequency**: In multiplayer sync, AI factions submit commands like any other player. In solo sync, AI commands are generated each tick by `AIController` synchronously before the bundle is assembled. The AI must be able to produce commands within the tick interval — at 4 Hz that’s 250ms, which is well within budget for the current AI logic.

**Offline mode** (`dataBridge.offlineMode === true`):
- Everything above applies.
- No Supabase calls of any kind.
- `games.status` and `current_tick` tracked in `localStorage`.

## Constraints

- **Determinism is mandatory**: All code in `applyInputBundle` must comply with spec 055 (Simulation Determinism). No `Math.random()`, no `Date.now()`, no unordered iteration.
- **No Phaser objects in commands**: Commands are plain JSON. Phaser rendering is a side-effect of state changes, never a cause.
- **Tick ordering**: Bundles must be applied in strict `tickNumber` order. Out-of-order bundles are queued, never dropped.
- **Maximum tick rate**: 4 Hz (250ms per tick). Higher rates risk Supabase Broadcast throughput limits.

## Acceptance Criteria

- [ ] Host tab drives tick increments visible in console at configured rate (1 Hz default).
- [ ] Non-host clients receive `tick_start` and `authoritative_input_bundle` in order.
- [ ] A command submitted by a non-host client appears in the bundle on all clients.
- [ ] Disconnecting a non-host client (with only 2 players) causes tick loop to stop and async fallback.
- [ ] Disconnecting the host causes all clients to receive `session:fallbackToAsync`.
- [ ] Two clients starting from the same state and processing 10 ticks with no commands produce identical serialized state.
- [ ] Speed change from 1 Hz to 2 Hz takes effect within 3 seconds on all clients.
- [ ] Resolution runs headlessly during sync mode — no blocking modals.
- [ ] Invasion choice in sync mode is handled via player input command.
- [ ] Solo player can start and stop the tick loop via direct mode toggle.
- [ ] Solo mode: AI commands are generated and applied each tick without network.
- [ ] Solo mode at 4 Hz: AI command generation completes within 250ms per tick.
- [ ] `applyInputBundle` contains zero calls to `Math.random()` or `Date.now()`.

## Files to Create / Modify

- `core/sync-tick-manager.js` — **new**
- `engine/main-stage.js` — add sync/async mode switch, queue-based bundle processing
- `core/turn-resolution-engine.js` — add headless mode (skip UI waits)
- `src/components/SyncTickHUD.jsx` — **new** (tick counter, speed indicator)

## Relationship to Other Specs

- **Depends on**: 055 (Determinism), 056 (Presence/Broadcast), 057 (Host Election)
- **Blocks**: 059 (Snapshots) — snapshots are written by the tick loop
- **Blocked by**: 061 (Timescale Conversion) — tick loop must know when to trigger turn-boundary resolution
- **Related**: 028 (Turn Structure) — tick loop replaces the turn-based flow during sync mode
- **Related**: 029 (Turn Order) — command types are reused
- **Related**: 060 (Mode Switching UI) — speed controls and mode badge
