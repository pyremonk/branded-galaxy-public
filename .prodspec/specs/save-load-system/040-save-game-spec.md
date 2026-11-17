# Save Game

## Overview

The Save Game system allows players to manually preserve the full state of a game session at any point during the Action Phase, and automatically saves at the end of each turn. Saves are stored locally via DataBridge (localStorage offline mode or Supabase cloud mode) and may occupy multiple named slots. This spec covers save creation, auto-save mechanics, save slot management, and the serialization contract.

## Requirements

### FR-SG-001: Manual Save
- Players may initiate a manual save during the Action Phase at any time
- Save is triggered from the top-bar **hamburger menu (☰)** → **Save game**
- Player selects a save slot (1–5 named slots) or chooses "Overwrite Current"
- Player may rename the slot before saving; default name is `[FactionName] Turn [N]`
- Save operation completes synchronously for localStorage mode; async (with loading indicator) for Supabase mode
- On completion, a brief "Game saved" toast notification appears

### FR-SG-002: Auto-Save
- Auto-save fires automatically at the end of each Maintenance Phase (each turn end)
- Auto-save always writes to a dedicated "Auto-Save" slot (not one of the 5 manual slots)
- Auto-save does not prompt the player; it runs silently
- If auto-save fails (storage quota exceeded or network error), a warning notification fires:
  - "Auto-save failed: [reason]. Please save manually."
- The Auto-Save slot is always overwritten; only the most recent auto-save is kept

### FR-SG-003: Save Slot Management
- The save/load screen shows 6 slots: Auto-Save (read-only slot indicator) + 5 manual slots
- Each slot displays:
  - Slot name / game label
  - Faction played
  - Current turn number
  - Timestamp of last save
  - Galaxy seed (for reference)
  - Thumbnail minimap (small galaxy layout preview if feasible; otherwise an icon placeholder)
- Empty slots show "Empty" with a "Save Here" prompt when saving

### FR-SG-004: Full Game State Serialization
- A save file contains a complete snapshot of all game state:
  - Galaxy state: all systems with loyalty values, resource output, facilities, troop counts
  - Faction states: resources, roster, tech state, active missions, construction queues
  - Fleet states: all fleets, ship compositions, commanders, locations, active commands
  - Turn state: current turn number, phase (always saves in Action Phase), initiative order
  - Intel store: all current intel items per faction
  - Settings: game mode, difficulty, galaxy seed, victory threshold modifiers
  - Notifications log: last 20 notifications (for Turn Summary continuity)
- Serialization format: JSON, stored as a single string in DataBridge

### FR-SG-005: Save Versioning
- Each save file includes a `saveVersion` field (integer, increments with breaking schema changes)
- On load, the save version is checked against the current game version
- If the save version is older but compatible (minor schema additions), it loads with default values for new fields
- If the save version is incompatible (major schema change), the load fails with a clear message: "This save file is from an older version and cannot be loaded."

### FR-SG-006: DataBridge Integration
- Save operations use `dataBridge.saveGameState(slotId, saveData)` and `dataBridge.loadGameState(slotId)`
- In cloud mode (Supabase), saves are associated with the authenticated user's account
- In offline mode, saves are stored in localStorage under namespaced keys
- Cloud saves sync automatically when the player is online; the in-memory state is always the authoritative source

### FR-SG-007: Return to Main Menu
- The top-bar hamburger menu (☰) includes a **Return to main menu** option in addition to Save game
- If the current turn has not yet been ended (Action Phase still active), selecting "Return to main menu" displays an inline confirmation dialog:
  - Message: *"Exiting without ending your turn will cause you to lose the actions you've set. Return to the main menu anyway?"*
  - Buttons: **Stay in game** (cancel) / **Return to menu** (confirm)
- If the turn has already been submitted, no confirmation is shown and the transition is immediate
- On confirmation (or when turn is already submitted), the Phaser game instance is destroyed and the app returns to MAIN_MENU, refreshing the auto-save slot status for the Continue button

## Constraints

- Save must only be available during the Action Phase (not during Resolution or Maintenance)
- Total save data for all slots must remain under 5MB in localStorage to avoid quota issues
- Auto-save must not block the UI thread for more than 50ms (use async serialization)

## Acceptance Criteria

- [x] Manual save writes correct full game state to the selected slot
- [x] Save slot name defaults to "Turn [N]" and is user-editable before confirming
- [x] Auto-save fires at end of every Maintenance Phase and writes to Auto-Save slot
- [x] Auto-save failure fires a warning notification with the reason
- [x] Save/load screen displays all 6 slots with correct metadata
- [x] Loaded save restores all game state fields including turn, resources, and fleet positions
- [x] `saveVersion` field is present in every save; incompatible version shows a clear error
- [x] DataBridge `saveGameState` / `loadGameState` are called correctly for both cloud and offline modes
- [x] Save is blocked during Resolution and Maintenance phases ([SAVE] button checks `inputLocked`)
- [x] Total save size for all slots remains under 5MB in localStorage mode
- [x] Hamburger menu (☰) is present in the top bar with "Save game" and "Return to main menu" items
- [x] Selecting "Return to main menu" during the Action Phase shows the confirmation dialog with the correct message
- [x] Confirming the dialog destroys the Phaser instance and returns to MAIN_MENU; cancelling keeps the game running
- [x] No confirmation dialog is shown if the turn has already been submitted
