# 056 – Game Session & Presence Foundation

## Overview

Establish the Supabase schema and Realtime Presence infrastructure that all hybrid async/sync features depend on. This is a **pure infrastructure spec** — no gameplay behavior changes, no new UI beyond a debug overlay.

## Background

The current network multiplayer implementation (`NetworkSessionManager` + `DataBridge`) uses:
- `network_sessions` table for lobby CRUD
- `network_orders` table for turn submission
- Supabase Realtime Broadcast for state deltas
- Presence tracking for connect/disconnect

This works for the existing "host resolves, broadcast delta" model, but **cannot support**:
- Async turn persistence (orders survive browser close)
- Sync-mode tick loops with input collection
- Periodic snapshot writes for reconciliation
- Formal game-status tracking (async vs sync)

This spec adds the missing schema and a new `SessionPresenceManager` that wraps Supabase Presence with the metadata needed for host election and ready-state tracking.

## Relationship to Existing Code

### `NetworkSessionManager` Coexistence
`NetworkSessionManager` currently handles lobby creation, chat, order validation, and basic presence. The new `SessionPresenceManager` **does not replace it** — it runs alongside it during the transition:

| Concern | Current Owner | New Owner | Migration Path |
|---|---|---|---|
| Lobby create/join | `NetworkSessionManager` | No change | Keep as-is |
| Chat messages | `NetworkSessionManager` | No change | Keep as-is |
| Order validation | `NetworkSessionManager` | No change | Keep as-is |
| Player presence | `NetworkSessionManager` (basic) | `SessionPresenceManager` (extended) | New manager adds `isReady`, `isHost` metadata; old presence listeners coexist |
| Disconnect handling | `NetworkSessionManager` | `SessionPresenceManager` (extended) | New manager handles mode-aware disconnect logic |
| Game status (async/sync) | Not tracked | `SessionPresenceManager` via `games` table | New |

### `DataBridge` Changes
`DataBridge` must expose the raw Supabase client instance so `SessionPresenceManager` can create its own Realtime channels without duplicating client setup. Currently `DataBridge._supabase` is private. Options:
1. **Preferred**: Add a `getClient()` accessor to `DataBridge` that returns the Supabase client (or `null` in offline mode).
2. Alternative: `SessionPresenceManager` imports `createClient` directly — rejected because it would duplicate connection management.

## Requirements

### FR-SPF-001: Schema — `games` Table

Extends the existing schema with a `games` row that tracks pacing metadata:

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` | |
| `session_id` | uuid FK → `network_sessions` | | Links to existing lobby |
| `status` | text | `'async'` | `'async'` or `'sync'` |
| `current_turn` | integer | 1 | |
| `current_tick` | integer | `null` | Null in async mode |
| `ticks_per_second` | numeric | 1.0 | Used only in sync mode |
| `time_per_tick` | numeric | 1.0 | In-game time units per tick |
| `host_user_id` | uuid | `null` | Null until sync mode starts |
| `created_at` | timestamptz | `now()` | |

### FR-SPF-002: Schema Extension — `turn_orders` Table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid FK → `games` | |
| `turn_number` | integer | |
| `player_id` | uuid FK → `auth.users` | |
| `orders` | jsonb | Array of `Command` objects |
| `submitted_at` | timestamptz | |
| Unique constraint | `(game_id, turn_number, player_id)` | Prevents double-submission |

### FR-SPF-003: Schema Extension — `game_state` Table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid FK → `games` | |
| `turn_number` | integer | |
| `tick_number` | integer | Nullable in async mode |
| `state` | jsonb | Serialized state from all state managers |
| `created_at` | timestamptz | |

### FR-SPF-004: Schema Extension — `game_snapshots` Table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid FK → `games` | |
| `tick_number` | integer | |
| `turn_number` | integer | |
| `state` | jsonb | |
| `version` | integer | Schema version for forward compatibility |
| `created_at` | timestamptz | |

### FR-SPF-005: RLS Policies

- `games`: SELECT by any authenticated user who is a participant; INSERT/UPDATE restricted to game participants.
- `turn_orders`: INSERT by the owning `player_id` only; SELECT by any participant of the same `game_id`.
- `game_state`: SELECT by any participant; INSERT/UPDATE by the current host or via RPC.
- `game_snapshots`: SELECT by any participant; INSERT by host only.

Participant membership is determined by cross-referencing `network_sessions.players` (existing column) with `games.session_id`.

### FR-SPF-006: Presence Channel

Channel name: `game:{gameId}:presence`

Presence metadata shape:
```js
{
  userId: string,       // Supabase auth user ID
  gameId: string,
  displayName: string,  // Player name for UI
  factionId: string,    // Assigned faction
  isReady: boolean,     // Toggled by player
  isHost: boolean,      // Set by host election algorithm
  latencyMs: number,    // Optional; updated periodically
}
```

### FR-SPF-007: Broadcast Channel

Channel name: `game:{gameId}:realtime`

Used for ephemeral messages during sync mode (tick_start, player_input, authoritative_input_bundle, speed_change). This spec only creates and subscribes to the channel — message handling is defined in spec 058 (Sync Mode Tick Loop).

### FR-SPF-008: `SessionPresenceManager` Module

New singleton module: `core/session-presence-manager.js`

**API:**

```js
// Lifecycle
initialize(gameId, userId, displayName, factionId)  → void
destroy()                                            → void

// Ready state
setReady(isReady: boolean)                          → void
isLocalReady()                                      → boolean

// Presence queries
getPresenceList()                                   → PresenceMeta[]
getOnlinePlayerCount()                              → number
areAllPlayersReady()                                → boolean

// Host state (managed by spec 057)
setHost(isHost: boolean)                            → void
isLocalHost()                                       → boolean
getHostId()                                         → string | null

// Subscriptions
onPresenceChange(callback)                          → unsubscribe function
onAllReady(callback)                                → unsubscribe function
onHostChange(callback)                              → unsubscribe function

// Game status
getGameStatus()                                     → 'async' | 'sync'
setGameStatus(status)                               → Promise<void>  // writes to games table
```

**Offline mode behavior:** When `dataBridge.offlineMode === true`:
- `initialize()` creates a mock single-player presence state (always ready, always host).
- All subscriptions fire once with the mock state, then never again.
- `setGameStatus()` writes to `localStorage` instead of Supabase.
- No network calls are made.

### FR-SPF-009: `DataBridge` Accessor

Add to `core/data-bridge.js`:

```js
getClient() {
  return this.offlineMode ? null : this._supabase;
}
```

No other changes to DataBridge in this spec.

### FR-SPF-010: Postgres Changes Subscriptions

`SessionPresenceManager` subscribes to Postgres Changes on:
1. `games` table (filter: `id=eq.{gameId}`) — for `status`, `current_turn`, `current_tick` changes.
2. `game_snapshots` table (filter: `game_id=eq.{gameId}`) — snapshot availability (used by spec 059).

Subscription callbacks dispatch `window.CustomEvent` events following the existing React↔Phaser bridge pattern:
- `session:gameStatusChanged` — `{ detail: { status, currentTurn, currentTick } }`
- `session:snapshotAvailable` — `{ detail: { tickNumber, turnNumber } }`

## Constraints

- Must not break existing `NetworkSessionManager` or any current multiplayer flow.
- Schema changes are additive — no modifications to existing tables (`network_sessions`, `network_orders`, `galaxy_snapshots`, `game_saves`).
- `SessionPresenceManager` must clean up all Supabase channel subscriptions on `destroy()` — no leaked listeners.
- Channel names must be unique per game to avoid cross-talk between different game instances.

## Acceptance Criteria

- [ ] Migration SQL creates all four tables with correct columns, types, and constraints.
- [ ] RLS policies pass manual testing (authenticated user can only see their own game's data).
- [ ] `SessionPresenceManager.initialize()` succeeds in both online and offline mode without errors.
- [ ] Two browser tabs joined to the same game see each other in `getPresenceList()`.
- [ ] `setReady(true)` updates Presence metadata visible to other clients within 1 second.
- [ ] `onPresenceChange` callback fires when a player joins, leaves, or changes metadata.
- [ ] `DataBridge.getClient()` returns the Supabase client in online mode, `null` in offline mode.
- [ ] `destroy()` removes all channel subscriptions (verified via Supabase Realtime dashboard or console).
- [ ] No existing gameplay or lobby flows are broken.

## Files to Create / Modify

- `supabase/migrations/{timestamp}_hybrid_turn_schema.sql` — **new**
- `core/session-presence-manager.js` — **new**
- `core/data-bridge.js` — add `getClient()` accessor

## Relationship to Other Specs

- **Blocks**: 057 (Host Election), 058 (Sync Tick Loop), 059 (Snapshots), 060 (Mode Switching UI)
- **Related**: 050 (Network Features) — extends the network architecture without replacing it.
- **Related**: 049 (Multiplayer Modes) — adds a new mode dimension (async/sync pacing) orthogonal to the player-configuration modes (solo, hot-seat, network).
