# Load Game

## Overview

The Load Game system allows players to restore a previously saved game state from any available save slot. Loading may occur from the main menu (before starting a new game) or from within an active game session (via the pause menu). This spec covers the load flow, state restoration, error handling, and the "Continue" shortcut.

## Requirements

### FR-LG-001: Load Entry Points
- Load Game is accessible from:
  - **Main Menu**: "Load Game" button on the main menu / lobby screen
  - **In-Game Pause Menu**: "Load Game" option (prompts confirmation: "Abandon current game and load?")
- Loading from in-game discards all unsaved changes in the current session
- If the player has unsaved changes (current session has no recent manual save), a warning is added to the in-game confirmation dialog

### FR-LG-002: Load Game Screen
- Displays all save slots (Auto-Save + 5 manual) with the same metadata shown on the save screen (spec 040, FR-SG-003)
- Each slot has a "Load" button and a "Delete" button
- Delete requires a single confirmation click ("Are you sure? This cannot be undone")
- Empty slots show "Empty" with no Load or Delete buttons

### FR-LG-003: Load Process
- On player confirmation to load:
  1. Current game state (if any) is discarded from memory
  2. Save data is retrieved from DataBridge (`dataBridge.loadGameState(slotId)`)
  3. `saveVersion` is validated (spec 040, FR-SG-005); incompatible saves are rejected with error message
  4. Game state is deserialized and validated (all required fields present, values in valid ranges)
  5. Phaser game re-initializes with the loaded state via the existing game bridge
  6. Player is placed at the Action Phase of the saved turn
- A loading screen is shown during steps 2–5
- If the load fails for any reason, the player is returned to the load screen with an error message

### FR-LG-004: State Restoration Completeness
- After a successful load, all systems must reflect the saved state exactly:
  - Galaxy map renders with correct system colors, loyalty, and facility icons
  - All fleets are at correct positions with correct ship compositions
  - All characters have correct status, stats, XP, and location
  - Active missions are restored with correct progress
  - Construction queues show correct items and remaining turns
  - Intel store shows correct items with correct remaining expiry turns
  - Turn counter shows correct turn number
  - HUD resource displays show correct resource values
- No system may rely on temporary in-memory state that is not serialized in the save

### FR-LG-005: Continue Last Game
- The main menu shall display a prominent "Continue" button if an Auto-Save slot is populated
- Clicking Continue loads the Auto-Save slot directly without showing the load screen
- If no Auto-Save exists, Continue is not shown

### FR-LG-006: Cloud Save Sync
- In cloud mode (Supabase), when the load screen opens, the system fetches the latest save metadata from the server
- If a cloud save is newer than the local cached version, the player is offered: "A newer cloud save is available. Use cloud save?"
- Player may choose cloud or local; both options proceed with the normal load process for the chosen source

### FR-LG-007: Error Handling
- Possible load errors and responses:
  - **Slot empty or missing**: "Save slot not found. It may have been deleted."
  - **Incompatible version**: "This save is from an older version and cannot be loaded."
  - **Corrupted data**: "Save data is corrupted. This slot cannot be loaded."
  - **Network error (cloud)**: "Unable to fetch cloud save. Check your connection."

## Constraints

- Loading must always begin from a clean state; no partial game state from a prior session may contaminate the load
- The Phaser game must be fully re-initialized on load (cannot hot-swap state into a running game)
- Load must complete within 5 seconds for all galaxy sizes; loading screen shows a progress indicator if > 1 second

## Acceptance Criteria

- [x] Load Game accessible from both main menu and in-game pause menu
- [x] In-game load confirms before discarding unsaved progress
- [x] Load screen shows all 6 slots with correct metadata
- [x] Delete slot requires one-step confirmation and removes the slot permanently
- [x] Loading a valid save restores all game systems to their saved state exactly
- [x] Turn counter, resources, fleet positions, and character statuses all restore correctly
- [x] "Continue" button appears on main menu only when Auto-Save slot is populated
- [x] Continue loads Auto-Save directly without the load screen
- [x] Cloud save newer-than-local prompt appears when applicable in Supabase mode
- [x] All four error cases display appropriate error messages without crashing
