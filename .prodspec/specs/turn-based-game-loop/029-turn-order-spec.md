# Turn Order

## Overview

Turn Order governs the sequencing of players within a multiplayer game — which faction acts first in sequence-dependent scenarios, how initiative is determined, and how simultaneous action submission is handled for async fairness. In single-player mode, turn order is trivial (one player); in 2- and 3-player modes, some resolution events must process in a defined per-faction order.

## Requirements

### FR-TO-001: Simultaneous Action Submission Model
- All human players submit their Action Phase orders simultaneously (no sequential waiting)
- Submitted orders are not visible to other players until all players have submitted (hidden order system)
- Once all players have submitted, Resolution Phase begins
- In async multiplayer, a player may submit early and wait; other players' turns continue in parallel

### FR-TO-002: Initiative System
- Initiative determines the per-faction processing order during Resolution Phase events that require sequencing
- Initiative is determined at game start by a seeded random roll; the faction with the highest roll goes first
- Initiative order persists for the whole game (no re-roll per turn in Phase 1B)
- Phase 1D may introduce turn-based initiative shifting based on game events
- Initiative order is displayed in the HUD as a small faction-order indicator

### FR-TO-003: Resolution Sequencing by Initiative
- Events processed by initiative order in the Resolution Phase:
  - Fleet arrival order (when multiple fleets arrive at the same system in the same turn, highest initiative fleet arrives first and potentially triggers combat before the lower initiative fleet)
  - Simultaneous contested mission resolution at the same target (when two factions both run an offensive mission against the same system, higher initiative faction's mission resolves first)
  - Diplomatic Action order at the same system (higher initiative applies their diplomatic action first)
- Events not subject to initiative order:
  - Construction completions (per-system, not contested)
  - Loyalty drift (per-system passive calculation)
  - Maintenance calculations (simultaneous, non-contested)

### FR-TO-004: 3-Player Initiative Tiebreaking
- In 3-player mode, if two factions' actions would conflict and they have the same initiative (not possible with random roll, but handled defensively):
  - Alphabetical faction ID order is used as a final tiebreaker

### FR-TO-005: Player Turn Notification in Multiplayer
- In async multiplayer, when it is a player's Action Phase window, they receive a notification:
  - In-app notification (HUD badge)
  - (Future: email or push notification — out of scope for Phase 1B)
- While a player's Action Phase is open, other players see a "Waiting for [Faction]..." indicator
- Once all players have submitted, a "All players ready — resolving..." message appears before Resolution begins

### FR-TO-006: AI Player Turn Processing
- AI opponents do not require a wait — their Action Phase orders are computed and submitted in the same server tick that the Action Phase begins
- From the human player's perspective, the AI has "already submitted" when the Action Phase opens
- AI turn order (in which AI factions compute their orders) follows the initiative order

### FR-TO-007: Single-Player Turn Order
- In single-player mode, only one faction is human-controlled
- The human player always has implicitly highest initiative in single-player for tie-breaking purposes
- AI factions process in initiative order after the human player's actions are locked

## Constraints

- Hidden order system must not allow a player to see another's submitted orders before Resolution begins
- Initiative rolls must use the same seeded random system as all other rolls, seeded from the game seed
- AI turn computation must not introduce perceptible delay (must complete in < 500ms)

## Acceptance Criteria

- [ ] All players submit simultaneously; no player sees another's orders before Resolution
- [ ] Initiative order is determined by seeded random roll at game start and persists
- [ ] Fleet arrival order follows initiative order when multiple fleets arrive at the same system
- [ ] Contested missions at the same target resolve in initiative order
- [ ] 3-player alphabetical tiebreaker activates correctly on initiative tie
- [ ] Multiplayer waiting UI shows which factions have and haven't submitted
- [ ] AI factions compute and submit orders within 500ms of Action Phase start
- [ ] Initiative order indicator is visible in the HUD during gameplay
- [ ] Single-player human faction always wins initiative tiebreaks
