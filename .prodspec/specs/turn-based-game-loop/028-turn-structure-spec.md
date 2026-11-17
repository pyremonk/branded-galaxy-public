# Turn Structure

## Overview

Turn Structure defines the phases that make up a single game turn, the order in which events and player actions are processed, and the sequencing rules that ensure consistency across all game systems. Every turn follows the same three-phase pipeline — Action Phase, Resolution Phase, Maintenance Phase — providing a predictable and fair framework that all other systems depend on.

## Requirements

### FR-TS-001: Three-Phase Turn Model
- Each game turn consists of exactly three phases executed in strict order:
  1. **Action Phase** — Players declare orders (missions, fleet movements, construction, diplomatic actions)
  2. **Resolution Phase** — All declared orders are processed and results applied
  3. **Maintenance Phase** — Passive effects apply (resources generated, loyalty drifts, upkeep paid)
- Phases do not overlap; no Resolution events occur during Action Phase and vice versa
- Players may not alter staged orders once the Action Phase submission is confirmed

### FR-TS-002: Action Phase
- The Action Phase is the player's window for input; all player-facing panels and menus are available
- Players stage the following types of actions:
  - Mission assignments (characters → missions)
  - Fleet movement orders and command assignments
  - Construction queue additions/reordering
  - Diplomatic actions
  - Character assignments to fleets and facilities
- Staged actions are held in a pending list visible in the HUD
- Players submit the Action Phase by clicking **End Turn**; this locks all staged actions
- In multiplayer, all factions must submit before Resolution begins (simultaneous submission model)

### FR-TS-003: Resolution Phase
- Resolution processes all staged actions in a defined order (no player input during this phase):
  1. Fleet movement arrivals
  2. Space combat (at systems where hostile fleets now co-occupy)
  3. Planetary invasions (systems where attacker won space combat)
  4. Mission resolution (in order: Recon → Defensive → Offensive → Support per spec 022)
  5. Construction completions
  6. Diplomatic action effects
  7. Intel updates and expiry
- Resolution is animated or summarized in the game log; player views a resolution summary screen
- If a resolution event (e.g. fleet arrival) creates a condition requiring a new decision (e.g. captured by enemy), the decision is deferred to the next Action Phase

### FR-TS-004: Maintenance Phase
- Maintenance Phase runs automatically after Resolution; no player input required:
  1. Resource production calculation (per-system, loyalty-adjusted)
  2. Fleet maintenance cost deduction
  3. Loyalty passive drifts (+2 controller / -1 others / occupation modifiers)
  4. Ground troop generation
  5. Facility HP repair (1 HP per stationed repair character)
  6. Defection checks (systems with loyalty < 30)
  7. Victory condition checks
  8. Turn counter increment
- Maintenance Phase completes before the next turn's Action Phase begins
- If any Maintenance event requires player attention (e.g. defection), a notification is queued for display at the start of the next Action Phase

### FR-TS-005: Turn Counter
- A turn counter tracks the current turn number, starting at Turn 1
- Turn counter is displayed in the HUD at all times
- Turn counter is used by:
  - Multi-turn mission duration tracking
  - Construction queue countdown
  - Tech research progress
  - Victory condition turn-based thresholds
  - Intel item expiry

### FR-TS-006: Turn Transition Notification
- At the start of each Action Phase, a **Turn Summary** notification displays:
  - Turn number
  - All completed events from the previous Resolution Phase
  - All Maintenance Phase events (defections, loyalty changes, completed construction)
  - Any urgent alerts (character captured, system lost)
- The Turn Summary can be dismissed; individual event entries can be clicked to navigate to their location on the map

### FR-TS-007: Action Phase Time Limit (Multiplayer)
- In multiplayer, each player's Action Phase has an optional time limit (configured at game setup)
- Default: no time limit
- Optional: 3 / 5 / 10 minute timer per player per turn
- On timer expiry, the player's staged actions are auto-submitted (incomplete orders left as-is)
- Single-player: no time limit

## Constraints

- Resolution Phase must be deterministic for a given set of inputs and seed
- No player input is accepted during Resolution or Maintenance phases
- Turn counter must be monotonically increasing; no game mechanic can reduce it
- All phase transitions must emit a game event (`galaxy:phaseStart`) for UI synchronization

## Acceptance Criteria

- [ ] Action Phase accepts all action types and maintains pending list
- [ ] End Turn submission locks all staged actions
- [ ] Resolution Phase processes all action types in the correct order
- [ ] Fleet arrivals before combat before invasion before missions in Resolution
- [ ] Maintenance Phase applies resources, loyalty, troops, and defection checks in correct order
- [ ] Turn counter increments by 1 every Maintenance Phase
- [ ] Turn Summary notification appears at Action Phase start with all previous events
- [ ] `galaxy:phaseStart` event fires with phase name on each phase transition
- [ ] Multiplayer time limit auto-submits the active player on expiry
- [ ] Victory condition check fires at end of Maintenance Phase every turn
