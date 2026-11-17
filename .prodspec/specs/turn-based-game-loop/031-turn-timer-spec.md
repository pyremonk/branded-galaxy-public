# Turn Timer

## Overview

The Turn Timer provides the temporal backbone of the game: a persistent turn counter that marks game progression, drives time-based victory conditions, triggers multi-turn event durations, and optionally enforces per-turn time limits for multiplayer. It is the authoritative source of "when" for all time-dependent game mechanics.

## Requirements

### FR-TT-001: Turn Counter
- A global turn counter starts at 1 and increments by exactly 1 at the end of each Maintenance Phase
- The turn counter is immutable during the Action and Resolution phases
- It is persisted in game save state and restored accurately on load
- The turn counter is accessible to all game systems via `gameState.currentTurn`

### FR-TT-002: Turn Display
- The current turn number is displayed persistently in the top HUD bar
- Display format: `Turn N` (e.g. "Turn 14")
- A tooltip on the turn display shows:
  - Estimated game length as a percentage (if a max-turn victory condition is active)
  - Number of turns remaining until the nearest turn-based victory threshold (whichever faction is closest)

### FR-TT-003: Turn-Based Victory Threshold Tracking
- Some victory conditions are expressed as turn survival goals (e.g. The Union: "Survive 60 turns")
- The Turn Timer subsystem tracks these thresholds and evaluates them each Maintenance Phase:
  - If `currentTurn >= threshold` and the associated faction is still alive, the condition triggers
  - Condition triggers are handled by the Victory Conditions system (spec 008)
- Thresholds are configured in victory condition JSON, not hardcoded

### FR-TT-004: Multi-Turn Duration Tracking
- All time-limited game state uses `currentTurn` as a reference for expiry:
  - Intel items: `turnRevealed + expiresAfterTurns`
  - System revolt: `revoltStartTurn + revoltDurationTurns`
  - Trade Agreement bonus: `agreementTurn + 3`
  - Diplomatic Hold: `holdTurn + 3`
  - Technology research: `researchStartTurn + totalResearchTurns` (adjusted for bonuses)
- No subsystem maintains its own independent turn clock; all duration tracking uses `gameState.currentTurn`

### FR-TT-005: Action Phase Time Limit Timer (Multiplayer)
- Covered in Turn Order spec 029 (FR-TO-007) for per-player time limit behavior
- The Turn Timer subsystem provides the countdown clock display when a time limit is active:
  - Visible countdown in the HUD (MM:SS format)
  - Visual urgency styling when < 60 seconds remain (amber color)
  - Red alert styling when < 15 seconds remain
  - Auto-submission trigger when the countdown reaches 0

### FR-TT-006: Game Age Display
- In addition to the turn counter, the HUD may optionally display a "Galactic Year" label
- Galactic Year starts at an in-universe year (e.g. "Year 1, Cycle 1") and advances each turn
- Galactic Year display is cosmetic only; all time-dependent logic uses `currentTurn`
- Galactic Year display can be toggled off in settings

### FR-TT-007: Maximum Turn Limit
- An optional maximum turn limit may be set at game setup (e.g. 100 turns)
- When `currentTurn` reaches the maximum:
  - The game ends immediately after Maintenance Phase completes
  - Victory is determined by the faction that has made the most progress toward their victory conditions (weighted score)
  - In case of equal scores, victory goes to the faction with the highest total loyalty across all systems

## Constraints

- Turn counter must be a non-negative integer; no fractional or negative values are permitted
- All time-dependent subsystems must read from `gameState.currentTurn` — independent clocks are prohibited
- The turn display must update before the Action Phase UI becomes interactive (player must see the new turn number before making decisions)

## Acceptance Criteria

- [ ] Turn counter starts at 1 and increments by 1 at end of each Maintenance Phase only
- [ ] Turn counter is correctly restored from save state
- [ ] HUD displays "Turn N" persistently with correct value
- [ ] Tooltip shows estimated game length percentage and nearest turn-based victory threshold
- [ ] Intel expiry, revolt duration, and Trade Agreement expiry all use `currentTurn` correctly
- [ ] Multiplayer action phase countdown displays MM:SS format with correct urgency coloring
- [ ] Auto-submission fires exactly when countdown reaches 0
- [ ] Maximum turn limit ends the game after Maintenance Phase with correct weighted victory determination
- [ ] Galactic Year display toggle works correctly and does not affect game logic
