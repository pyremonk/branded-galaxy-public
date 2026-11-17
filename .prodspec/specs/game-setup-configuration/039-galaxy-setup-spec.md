# Galaxy Setup

## Overview

Galaxy Setup is the final configuration step before a new game begins. It governs how the galaxy is generated — random vs. preset seed, starting system selection for each faction, and whether a campaign scenario is applied. Galaxy Setup feeds directly into the galaxy generator (spec 001) and faction state initialization.

## Requirements

### FR-GS-001: Generation Mode
- Players choose between two generation modes:
  - **Random**: Galaxy is generated from a new randomly chosen seed; galaxy layout is unknown in advance
  - **Fixed Seed**: Player inputs a specific seed string; galaxy layout is deterministic and reproducible
- The seed used to generate the galaxy is displayed after generation and can be copied by the player (for sharing)
- Both modes use the same galaxy generator; the only difference is seed origin

### FR-GS-002: Galaxy Seed Display and Sharing
- After galaxy generation, the HUD shows the active seed string in the game settings overlay
- Players may share this seed with friends to play on the same galaxy layout
- On new game setup, a "Use Seed" text input allows pasting a seed from another player

### FR-GS-003: Starting System Assignment
- Each faction is assigned starting systems at game creation
- Assignment options:
  - **Random**: Galaxy generator assigns starting systems based on faction-appropriate criteria (spec 001)
  - **Choose**: Each human player is presented with a ranked list of valid starting systems and selects their starting anchor (AI factions' starting systems are auto-assigned after human picks)
- Choose mode is only available in multiplayer; single-player always uses Random assignment to avoid early information advantage
- Starting system criteria (used in both modes): population ≥ 3, at least 2 hyperspace connections, distance from other faction starts ≥ 4 hops

### FR-GS-004: Campaign Scenarios
- Phase 1B: only the standard "Open Galaxy" scenario is available
- Campaign scenario selection UI is pre-built but all non-default scenarios show "Coming Soon"
- A scenario definition format (JSON) is established for future expansion:
  ```json
  {
    "id": "open-galaxy",
    "name": "Open Galaxy",
    "description": "Standard start — all factions begin with equal opportunity",
    "forcedSeed": null,
    "startingSystemOverrides": {},
    "victoryModifiers": {}
  }
  ```

### FR-GS-005: Galaxy Preview
- After generation (before game starts), a small minimap preview of the galaxy is shown
- Preview shows system positions, hyperspace connections, and faction starting system highlights
- Players can regenerate (new random seed) or confirm and proceed to game start
- In Fixed Seed or Choose mode, regeneration is not available (seed/selections locked)

### FR-GS-006: Game Start Transition
- Once players confirm galaxy setup, the full Phaser game initializes:
  - Galaxy state is built from generator output
  - Faction states are initialized with starting systems and resources
  - Turn 1 Action Phase begins
- The transition uses the existing `window.startPhaserGame()` bridge (per repo architecture)
- A loading screen is shown during initialization if startup takes > 500ms

## Constraints

- Galaxy generation must complete within 3 seconds for all galaxy sizes
- The preview minimap must be a lightweight render (no full Phaser scene; SVG or Canvas 2D)
- Fixed seed mode must produce identical galaxy layouts on all platforms given the same seed string
- Choose mode must prevent a human player from seeing another human player's system choices before both have confirmed

## Acceptance Criteria

- [ ] Random mode generates a unique galaxy each new game
- [ ] Fixed Seed mode produces the identical galaxy for the same seed across sessions
- [ ] Seed string is displayed and copyable after each game start
- [ ] "Use Seed" input correctly initializes the generator with the provided seed
- [ ] Galaxy preview renders system layout before game confirmation
- [ ] Confirm-and-start triggers `window.startPhaserGame()` and enters Turn 1 Action Phase
- [ ] Loading screen appears if startup exceeds 500ms
- [ ] All scenario slots other than "Open Galaxy" show "Coming Soon"
- [ ] Starting system criteria (population ≥ 3, ≥ 2 connections, ≥ 4 hops apart) is enforced
