# 057 – Host Election & Ready System

## Overview

Implement the Presence-based ready/host system that gates entry into sync mode. Players toggle a "ready" flag; when all connected players are ready and the game is at a stable checkpoint (end of an async turn), a host is elected deterministically.

## Depends On

- 056 (Game Session & Presence Foundation) — `SessionPresenceManager`, Presence channel, `games` table.

## Background

### Existing Host Concept

`NetworkSessionManager` already has a host concept: the player who creates the lobby is the host. This is used for:
- Order validation (host validates guest orders)
- Turn resolution (host runs `TurnResolutionEngine`)
- Disconnect replacement (host converts kicked players to AI)

The existing host is **static** (assigned at lobby creation and transferred only on disconnect). The new system needs a **dynamic** host that is:
- Elected when transitioning to sync mode
- Re-elected if the current host disconnects during sync mode
- Cleared when returning to async mode

### Coexistence Strategy

The **lobby host** (who created the session) and the **sync host** (who drives the tick loop) can be different players. This spec introduces a `syncHostId` tracked in the `games` table and Presence metadata. The existing `NetworkSessionManager` host concept is unaffected.

## Requirements

### FR-HER-001: Ready Toggle

- Each connected player can toggle their `isReady` Presence metadata field.
- Default on connect: `isReady = false`.
- Ready state persists across brief disconnects (< grace period) by re-syncing from Presence on reconnect.
- A player who has not submitted their current async turn orders cannot set `isReady = true` — the UI prevents it and shows an explanation tooltip.

### FR-HER-002: Host Election Algorithm

Host election is **deterministic** — all clients independently compute the same result:

```js
function electHost(presenceList, requiredPlayerCount) {
  const eligible = presenceList
    .filter(p => p.isReady)
    .sort((a, b) => a.userId.localeCompare(b.userId));
  
  if (eligible.length < requiredPlayerCount) return null;
  return eligible[0].userId;  // lowest userId lexicographically
}
```

Election runs on every Presence change. When the result changes:
- The elected client sets `isHost = true` in Presence and writes `games.host_user_id`.
- All other clients set `isHost = false`.

### FR-HER-003: Sync Mode Entry Conditions

All of the following must be true before transitioning from async to sync:

1. **All required players are connected** in the Presence channel.
2. **All players are ready** (`isReady = true` for all).
3. **Game is at turn boundary** — no pending Resolution or Maintenance phase in progress.
4. **No unresolved async turn** — all `turn_orders` for the current turn are resolved, or it's the start of a new Action Phase.

When conditions are met:
1. Host election runs (FR-HER-002).
2. Elected host updates `games.status = 'sync'` and `games.host_user_id`.
3. `session:hostElected` CustomEvent fires on all clients.
4. Tick loop begins (spec 058).

### FR-HER-004: Host Disconnect During Sync Mode

If the host's Presence entry disappears (disconnect):

1. Wait a grace period (**5 seconds**, shorter than the async disconnect grace of 120s — sync mode is latency-sensitive).
2. If host does not reconnect within grace period:
   - **If 2+ players remain**: re-elect a new host using FR-HER-002 algorithm.
   - **If only 1 player remains**: fall back to async mode immediately.
3. During the grace period, the tick loop **pauses** — no new ticks are broadcast.
4. On re-election: new host resumes tick loop from the last completed tick.
5. On fallback: `games.status = 'async'`, `games.host_user_id = null`, `session:fallbackToAsync` fires.

### FR-HER-005: Non-Host Player Disconnect During Sync Mode

If any non-host player disconnects during sync mode:

1. Wait the same 5-second grace period.
2. If player does not reconnect:
   - Their faction is converted to AI control (existing `NetworkSessionManager` behavior).
   - If `remainingHumanPlayers < requiredPlayersForSync`: fall back to async mode.
   - Otherwise: sync continues with the AI-controlled faction.

### FR-HER-006: Returning to Async from Sync

Any of the following triggers a return to async mode:

1. Host calls `requestAsyncMode()` — immediate transition.
2. Majority of players vote for async (spec 060 handles the vote UI).
3. Any required player disconnects and isn't replaced within the grace period (FR-HER-004/005).
4. A player sets `isReady = false` — this triggers the all-ready check to fail, pausing the tick loop and reverting to async.

On async return:
1. Host writes a final snapshot for the current tick (spec 059).
2. Host sets `games.status = 'async'`, `games.host_user_id = null`, `games.current_tick = null`.
3. `session:fallbackToAsync` CustomEvent fires on all clients.
4. Tick loop stops; normal async Action Phase begins.

### FR-HER-007: Solo Mode (Online & Offline)

Solo mode — a single human player vs AI opponents — is a **first-class use case** for mode switching, not just an offline fallback. Solo players can freely toggle between async and sync whether online (Supabase connected) or offline (localStorage).

**Solo detection**: `playerCount === 1` (only one human participant in the game), regardless of AI opponent count.

When solo:
- The local player is **always host** — no election ceremony needed.
- The ready toggle and election algorithm are **skipped entirely**. The player is implicitly ready at all times.
- Mode switching is a **direct toggle** — clicking "Switch to Realtime" or "Switch to Turn-Based" transitions immediately (no waiting for other players, no vote).
- `SessionPresenceManager` initializes with a mock single-player presence state (`isReady: true`, `isHost: true`).
- Entry conditions (FR-HER-003) are auto-satisfied: single player is always connected, always ready, and there are no unresolved orders from other players.
- Disconnect handling (FR-HER-004/005) is not applicable — there are no other players to disconnect.
- All Presence channel operations are skipped in offline mode; online solo games may still use Presence for future spectator support.
- `games.status` is tracked in `localStorage` (offline) or the `games` table (online).

### FR-HER-008: Hot-Seat Mode Restriction

Hot-seat mode is **async only** — sync mode is not available for hot-seat games.

- The mode toggle (spec 060) is hidden when `hotSeatManager` is active.
- Hot-seat games always have `games.status = 'async'` (or the equivalent localStorage value).
- Rationale: hot-seat players share a single device; a real-time tick loop with simultaneous input from multiple players on one screen is not a viable UX. Hot-seat is earmarked for deprecation (see backlog).

## Constraints

- Host election must be **purely deterministic** — no randomness, no server-side logic. Every client must arrive at the same host independently from the same Presence state.
- Grace period timers must be consistent across clients (use a shared constant, not a per-client config).
- The existing `NetworkSessionManager` host (lobby creator) is **not** changed by this spec. `syncHostId` is a separate concept.

## Events (window CustomEvent)

| Event | Detail | Fired When |
|---|---|---|
| `session:hostElected` | `{ hostId, hostName }` | New host elected for sync mode |
| `session:hostChanged` | `{ oldHostId, newHostId }` | Host re-election after disconnect |
| `session:fallbackToAsync` | `{ reason }` | Sync → async transition |
| `session:allPlayersReady` | `{ playerCount }` | All players toggled ready |
| `session:playerNotReady` | `{ userId }` | Any player toggles not-ready |

## Acceptance Criteria

- [ ] Ready toggle updates Presence metadata visible to other clients within 1 second.
- [ ] Host election produces the same `hostId` on all clients simultaneously (tested with 2–3 tabs).
- [ ] `isHost = true` appears on exactly one client in Presence list.
- [ ] Closing the host tab causes `session:fallbackToAsync` on all other clients after 5s grace.
- [ ] Closing a non-host tab with only 2 players total causes async fallback.
- [ ] Closing a non-host tab with 3 players (2 remaining) continues sync with AI fill-in.
- [ ] A player with unsubmitted turn orders cannot toggle ready.
- [ ] Solo online: player can toggle sync mode immediately without ready ceremony.
- [ ] Solo offline: player can toggle sync mode with all state in localStorage.
- [ ] Hot-seat games: mode toggle is hidden; game remains async-only.
- [ ] No existing lobby flows are broken.

## Files to Create / Modify

- `core/session-presence-manager.js` — add host election, ready gating, disconnect grace timer
- `engine/main-stage.js` — listen for `session:hostElected` and `session:fallbackToAsync`
- `core/network-session-manager.js` — add `syncHostId` awareness (don't confuse with lobby host)

## Relationship to Other Specs

- **Depends on**: 056 (Presence Foundation)
- **Blocks**: 058 (Sync Tick Loop) — tick loop requires an elected host
- **Related**: 050 (Network Features) — extends disconnect handling
- **Related**: 060 (Mode Switching UI) — provides the ready toggle and status display
