# 059 – Snapshots & State Reconciliation

## Overview

Implement periodic snapshot writing during sync mode and snapshot-based reconciliation for clients that fall behind, diverge, or re-join mid-session. Also formalizes the `serialize()`/`hydrate()` contract across all state managers — closing the largest implementation gap identified in the codebase audit.

## Depends On

- 055 (Simulation Determinism) — deterministic state is a prerequisite for meaningful snapshot comparison.
- 056 (Game Session & Presence Foundation) — `game_snapshots` table and Postgres Changes subscription.
- 058 (Sync Mode Tick Loop) — snapshots are triggered by the tick loop.

## Background

### Current Serialization Status

Most state managers already have `serialize()` and `deserialize()` (or `static deserialize()`) methods, used by `SaveStateManager.createSnapshot()`:

| State Manager | Has serialize | Has deserialize | Notes |
|---|---|---|---|
| `TurnStateManager` | ✅ | ✅ | |
| `ResourceStateManager` | ✅ | ✅ | Returns JSON string |
| `TechStateManager` | ✅ | ✅ | Returns JSON string |
| `CharacterStateManager` | ✅ | ✅ | Per-faction |
| `FleetStateManager` | ✅ | ✅ | All factions in one object |
| `ConstructionStateManager` | ✅ | ✅ | |
| `MissionStateManager` | ✅ | ✅ | Returns JSON string |
| `LoyaltyStateManager` | ✅ | ✅ | |
| `VictoryStateManager` | ✅ | ✅ | Static methods |
| `IntelStateManager` | ✅ | ✅ | |
| `EventEngine` | ✅ | ✅ | |
| `InitiativeEngine` | ✅ | ✅ | Instance method |
| `FactionStateManager` | ✅ | ✅ | |
| `HotSeatManager` | ✅ | ✅ | |
| `NetworkSessionManager` | ❌ | ❌ | No persistence — relies on Supabase session |
| `SeededRandom` | ❌ | ❌ | No state capture (spec 055 adds this) |
| `AIController` | ❌ | ❌ | Difficulty stored in game config, not manager state |

### Key Gap: Inconsistent Format

Some managers return **JSON strings** from `serialize()` while others return **plain objects**. For snapshot writing, all serialized forms must be **plain objects** (JSONB column stores objects, not double‐encoded strings). Managers that return strings must be normalized.

### Shallow Delta Problem

The existing network turn resolution broadcasts state via `broadcastResolution(stateDelta)` in `NetworkSessionManager`, but guests apply it with shallow `Object.assign` — only patching galaxy state, resource states, and turn counter. This misses:
- Fleet state
- Tech state
- Character state
- Construction state
- Mission state
- Loyalty state
- Intel state
- Event state
- Victory state

Full snapshot hydration replaces this shallow delta approach entirely.

## Requirements

### FR-SNP-001: Unified Serialization Contract

Every state manager that holds game-affecting state must implement:

```js
// Returns a plain JS object (no circular refs, no Phaser objects, no functions)
serialize() → object

// Restores state from a plain JS object produced by serialize()
// Static or instance method depending on existing pattern
hydrate(data) → void  // or static deserialize(data, ...deps) → instance
```

**Normalization required**: Managers that currently return JSON strings from `serialize()` must be updated to return plain objects. The JSON parse/stringify happens once at the snapshot boundary, not per-manager.

Affected managers:
- `ResourceStateManager.serialize()` — currently returns `JSON.stringify(...)`. Change to return plain object.
- `TechStateManager.serialize()` — same.
- `MissionStateManager.serialize()` — same.

### FR-SNP-002: Snapshot Format

```js
GameSnapshot = {
  id: string,           // UUID
  gameId: string,
  tickNumber: number,
  turnNumber: number,
  version: number,       // SNAPSHOT_VERSION constant; increment on schema changes
  createdAt: string,     // ISO 8601
  state: {
    galaxy: object,      // Galaxy sectors, systems, connections
    factions: object,    // FactionStateManager per faction
    resources: object,   // ResourceStateManager per faction
    tech: object,        // TechStateManager per faction
    characters: object,  // CharacterStateManager per faction
    fleets: object,      // FleetStateManager (all factions)
    construction: object,// ConstructionStateManager per faction
    missions: object,    // MissionStateManager per faction
    loyalty: object,     // LoyaltyStateManager
    intel: object,       // IntelStateManager
    events: object,      // EventEngine
    initiative: object,  // InitiativeEngine
    victory: object,     // VictoryStateManager per faction
    turn: object,        // TurnStateManager
    hotSeat: object,     // HotSeatManager (if hot-seat + network hybrid)
    aiConfig: object,    // AI difficulty settings per faction
  }
}
```

### FR-SNP-003: `SnapshotManager` Module

New singleton: `core/snapshot-manager.js`

```js
// Constants
SNAPSHOT_VERSION = 1
SNAPSHOT_INTERVAL = 10  // ticks between snapshots (configurable)

// API
writeSnapshot(gameId, tickNumber, turnNumber, stateManagers)  → Promise<void>
loadLatestSnapshot(gameId)                                     → Promise<GameSnapshot | null>
loadSnapshot(gameId, tickNumber)                               → Promise<GameSnapshot | null>
applySnapshot(snapshot, stateManagers)                         → void
subscribeToSnapshots(gameId, callback)                         → unsubscribe
detectDivergence(localTick, latestSnapshotTick, threshold?)    → boolean
getSnapshotVersion()                                           → number
```

**`stateManagers`** parameter: an object containing references to all active state manager instances. This avoids the SnapshotManager importing singletons directly and improves testability.

### FR-SNP-004: Snapshot Writing (Host Only)

Triggered by the tick loop (spec 058) every `SNAPSHOT_INTERVAL` ticks:

1. Collect `serialize()` output from every state manager.
2. Construct the `GameSnapshot` object.
3. Write to `game_snapshots` table via Supabase INSERT.
4. The Postgres Changes subscription on `game_snapshots` notifies all clients.

**Optimization**: Only write if state has actually changed since the last snapshot. Compare a hash of the serialized state to the previous snapshot's hash (store hash as an additional column or compute client-side).

### FR-SNP-005: Snapshot Consumption (All Clients)

Clients subscribe to `game_snapshots` Postgres Changes (set up in spec 056). On new snapshot:

1. Compare `snapshot.tickNumber` to local `currentTick`.
2. If `detectDivergence(localTick, snapshotTick)` returns true (gap > `RECONCILE_THRESHOLD`, default 5 ticks):
   - Call `applySnapshot(snapshot, stateManagers)`.
   - Rebuild Phaser rendering from hydrated state (fire `galaxy:snapshotApplied` CustomEvent).
   - Resume tick processing from `snapshot.tickNumber + 1`.
3. If within threshold: no action (normal operation).

### FR-SNP-006: `applySnapshot` Implementation

```js
applySnapshot(snapshot, stateManagers) {
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(`Snapshot version mismatch: expected ${SNAPSHOT_VERSION}, got ${snapshot.version}`);
  }
  
  const s = snapshot.state;
  
  // Hydrate each state manager in dependency order
  stateManagers.loyalty.hydrate(s.loyalty);
  stateManagers.galaxy.hydrate(s.galaxy);
  // ... all other managers ...
  stateManagers.turn.hydrate(s.turn);
  
  // Signal Phaser to rebuild visuals
  window.dispatchEvent(new CustomEvent('galaxy:snapshotApplied', {
    detail: { tickNumber: snapshot.tickNumber, turnNumber: snapshot.turnNumber }
  }));
}
```

### FR-SNP-007: Phaser Re-render on Snapshot

When `MainStage` receives `galaxy:snapshotApplied`:
1. Destroy all existing sector/system Phaser objects.
2. Rebuild from the hydrated galaxy state (same flow as initial scene creation).
3. Update all HUD elements.
4. Resume normal rendering.

This is similar to what happens on game load — the same code path should be reused.

### FR-SNP-008: Re-join Flow

A player who disconnects and reconnects during sync mode:

1. `SessionPresenceManager` detects their return.
2. The returning client calls `loadLatestSnapshot(gameId)`.
3. Applies the snapshot via `applySnapshot()`.
4. Receives the next `authoritative_input_bundle` and resumes normal tick processing.
5. If the snapshot is stale (gap > current tick), the client requests a fresh snapshot from the host via a broadcast message `{ type: 'request_snapshot' }`.

### FR-SNP-009: Offline Mode

- Snapshots written to `localStorage` as `snapshot_{gameId}_{tickNumber}`.
- Only the latest 3 snapshots are kept (older ones pruned).
- `loadLatestSnapshot` reads from `localStorage`.
- This doubles as the foundation for future quick-save/quick-load.

### FR-SNP-010: Save/Load Integration

`SaveStateManager.createSnapshot()` currently gathers state from individual managers. The new `SnapshotManager.writeSnapshot()` should **reuse the same serialization calls**, not duplicate them. Refactor options:

1. **Preferred**: `SaveStateManager` delegates to `SnapshotManager` for the serialization step, then wraps the result in its own save-file envelope.
2. Alternative: Both call the same shared `serializeAllState(stateManagers)` utility function.

Either way, the single source of truth for "what gets serialized" is one function, not two.

## Constraints

- Snapshot writes must not block the tick loop. Use `async` write with error handling (log and continue on failure).
- `RECONCILE_THRESHOLD` must be configurable at game setup (default 5 ticks, range 3–20).
- Snapshot state must not contain Phaser objects, DOM references, or functions.
- Snapshot version mismatch must be a hard error (no silent data corruption).
- Serialization format normalization (FR-SNP-001) must not break existing save files. Existing saves that contain JSON strings should still load correctly — add a migration path in deserialization that detects and parses string-encoded state.

## Acceptance Criteria

- [ ] `SnapshotManager.writeSnapshot()` produces a `game_snapshots` row at the correct tick interval during sync mode.
- [ ] All state managers' `serialize()` methods return plain objects (not JSON strings).
- [ ] Existing save files load correctly after serialization normalization.
- [ ] A client that joins mid-session loads the latest snapshot and renders the correct game state.
- [ ] A simulated divergence (manually setting a client's tick counter back by 10) triggers reconciliation within one snapshot interval.
- [ ] `serialize()` → `hydrate()` round-trip produces identical state for every state manager (tested individually).
- [ ] `galaxy:snapshotApplied` event triggers a full Phaser re-render without visual artifacts.
- [ ] Snapshot version mismatch throws an error (not silently applied).
- [ ] Offline mode: snapshots written to and read from `localStorage` correctly.
- [ ] `SaveStateManager` and `SnapshotManager` share the same serialization code path.

## Files to Create / Modify

- `core/snapshot-manager.js` — **new**
- `core/resource-state-manager.js` — normalize `serialize()` to return plain object
- `core/tech-state-manager.js` — normalize `serialize()` to return plain object
- `core/mission-state-manager.js` — normalize `serialize()` to return plain object
- `core/save-state-manager.js` — refactor to delegate serialization to shared utility
- `engine/main-stage.js` — listen for `galaxy:snapshotApplied`, trigger re-render
- `core/network-session-manager.js` — add `request_snapshot` broadcast handler (optional)

## Relationship to Other Specs

- **Depends on**: 055 (Determinism), 056 (Schema), 058 (Tick Loop triggers snapshots)
- **Related**: 040/041 (Save/Load) — shares serialization infrastructure
- **Related**: 060 (Mode Switching UI) — re-join flow triggers snapshot load
- **Related**: 050 (Network Features) — replaces shallow delta broadcast with full snapshot reconciliation
