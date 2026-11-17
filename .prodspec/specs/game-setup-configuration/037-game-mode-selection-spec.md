# Game Mode Selection

## Overview

Game Mode Selection is the initial configuration screen players encounter after faction selection, defining how many players will participate, what roles are human-controlled vs. AI-controlled, and whether the game is played locally or networked. This screen establishes the game's core structure before any galaxy generation occurs.

## Requirements

### FR-GMS-001: Available Game Modes
- System shall provide the following game mode options:
  - **Solo vs. AI (2-faction)**: Human controls one faction; AI controls one opponent
  - **Solo vs. AI (3-faction)**: Human controls one faction; AI controls both opponents
  - **2-Player Local (Hot-Seat)**: Two humans on the same device; each has a private turn
  - **2-Player Network**: Two humans over network; each on their own device
  - **3-Player Local (Hot-Seat)**: Three humans on same device
  - **3-Player Network**: Three humans over network
- At launch (Phase 1B), only Solo vs. AI modes are fully supported; other modes are gated behind a "Coming Soon" badge

### FR-GMS-002: Faction Assignment Per Slot
- The mode selection screen shows player slots (1–3) based on the chosen mode
- Each slot is labeled with the faction assigned to it (following faction selection flow per spec 005)
- For AI-controlled slots, an AI difficulty selector appears: Easy / Medium / Hard (default Medium)
- The human player's slot cannot be assigned AI difficulty
- In 3-faction modes, The Autoforge must be one of the three assigned factions

### FR-GMS-003: Hot-Seat Mode Behavior
- In Hot-Seat mode, after a player submits their Action Phase, the screen transitions to a "Pass the device" interstitial:
  - Displays clear message: "Hand the device to [Next Faction Name]"
  - Requires a button press from the next player before revealing their board state
- Each player's sensitive information (enemy positions, messages) is hidden during the hand-off screen

### FR-GMS-004: Network Mode Skeleton
- Network mode entry is shown as a selectable option but displays a "Multiplayer coming in a future update" modal when selected
- The UI shell (join/host buttons) may be pre-rendered as disabled for visual completeness
- Network mode infrastructure is specified fully in spec 049 (Multiplayer Modes)

### FR-GMS-005: Mode Selection UI
- Displayed as a card-based selection grid on the new game setup screen
- Each mode card shows: mode icon, name, player count, and brief description
- Unavailable modes (Phase 1D) show a "Coming Soon" lock icon
- Selecting a mode highlights it; a "Confirm" button advances to difficulty/setup screen

### FR-GMS-006: Mode Persistence in Save State
- The selected game mode is saved with the game state
- On load, the game resumes in the same mode (Hot-Seat, network, or solo)
- Changing game mode requires starting a new game; no mid-game mode switch

## Constraints

- Only Solo vs. AI modes are implemented in Phase 1B; other modes must not be accessible
- Faction slot assignment must be consistent with faction selection choices already made
- The "Pass the device" interstitial must completely obscure game state during hot-seat hand-off

## Acceptance Criteria

- [ ] Solo vs. AI (2-faction and 3-faction) modes are fully playable in Phase 1B
- [ ] All other modes show "Coming Soon" and cannot be launched
- [ ] AI difficulty selector appears for all AI-controlled slots
- [ ] Hot-Seat mode shows pass-device interstitial between player turns
- [ ] Interstitial completely hides the outgoing player's board state
- [ ] Mode selection is preserved in save state and restored on load
- [ ] Mode selection screen renders correctly with faction assignments from prior faction selection step
