# Network Features

## Overview

Network Features enable real-time and asynchronous multiplayer over a network. This spec covers the architecture for host/join lobbies, turn synchronization, state broadcasting, and disconnect handling. All Network Features are Phase 2+ and are not implemented in Phase 1. This spec is forward-design documentation to guide future implementation.

## Requirements

### FR-NF-001: Host/Join Lobby
- One player acts as the **Host**: creates a lobby and receives a shareable game code
- Other players act as **Guests**: enter the game code to join the lobby
- Game code format: 6-character alphanumeric (e.g. `G7K2PX`)
- Lobby screen shows:
  - Connected players (name + selected faction, green checkmark when ready)
  - Chat text field (lobby chat, not in-game)
  - Start Game button (host only, enabled when all players are ready and factions are assigned)
- Maximum 3 players (matching max faction count)

### FR-NF-002: Connection Architecture
- Real-time multiplayer: uses Supabase Realtime channels for state sync
- Each game session has a dedicated channel keyed to the game session ID
- Game state is not broadcast in full each turn; only deltas (changed fields) are transmitted
- Fallback: if Supabase Realtime is unavailable, online play is disabled; offline Solo and Hot-Seat remain available

### FR-NF-003: Turn Submission Sync (Real-Time Mode)
- When a player submits their orders (ends their Action Phase):
  - Orders are sent to the host via the Supabase channel
  - Host accumulates orders from all players; once all are received, host resolves the turn
  - Resolved state delta is broadcast to all guests
  - All clients apply the delta and advance to the next turn
- A "Waiting for [player name]..." indicator is shown during the collection window

### FR-NF-004: Turn Submission Sync (Async Mode)
- Each player submits their Action Phase orders via the Supabase database (not Realtime)
- The server resolves the turn when all submitted orders are received (or after a configurable timeout)
- Players are notified when the resolution is complete and it is their next Action Phase

### FR-NF-005: Reconnection and Disconnect Handling
- If a guest disconnects mid-turn:
  - Their submitted orders (if any) are preserved
  - If they have not yet submitted, the host may kick them after a configurable grace period (default 120s)
  - Kicked players' factions are converted to AI control for the remainder of the game
- If the host disconnects:
  - The guest with the next-lowest player ordinal is promoted to host
  - All state is transferred to the new host; the game continues

### FR-NF-006: Spectrum Latency and Validation
- All player orders are validated server-side before being applied to game state
- Invalid orders (e.g. insufficient resources, targeting a non-existent system) are rejected; the submitting client is notified with an error
- Validation uses the same rules as single-player order validation

### FR-NF-007: Async Notifications
- When it is a player's turn in Async mode and they are offline:
  - If Supabase Email Auth is used, a turn-notification email is sent
  - In-app: a badge indicator appears when the player re-opens the game

## Constraints

- All network features require Supabase credentials (cloud mode); offline mode does not support network play
- Game codes expire 24 hours after lobby creation if the game has not started
- The maximum player count is 3; network features are not required to support more

## Acceptance Criteria

- [x] Host can create a lobby and receive a 6-character game code
- [x] Guest can join a lobby with a valid game code
- [x] Lobby shows connected players, faction assignments, and ready status
- [x] Turn submission sync accumulates orders from all players before resolving
- [x] Resolved state delta is broadcast and applied on all clients
- [x] Disconnected guest's faction converts to AI after grace period
- [x] New host is promoted if current host disconnects
- [x] Invalid orders are rejected with a client-side error notification
- [x] Async turn notifications are sent when Supabase Email Auth is active
