# Mission Execution

## Overview

Mission Execution covers the full lifecycle of a mission from the player's initial planning through character assignment, turn submission, resolution, and result delivery. It is the operational pipeline that connects Mission Types (spec 021), Mission Success Calculation (spec 011), and Character Assignment (spec 010) into a coherent player-facing workflow. This spec defines the mission planning UI, counter-intelligence response, multi-turn mission mechanics, and how results are surfaced to the player.

## Requirements

### FR-ME-001: Mission Planning Flow
- Mission planning begins when a player selects **New Mission** from:
  - The Character Roster panel (character-first flow)
  - The System Detail panel (system-first flow)
- Planning modal presents the following steps in sequence:
  1. **Select Mission Type** — filtered list of available missions for the player's faction
  2. **Select Target** — system, character, fleet, or facility depending on mission type
  3. **Assign Character(s)** — select from Available characters; shows success probability update live
  4. **Review & Confirm** — summary of mission parameters, final probability, and estimated outcome tiers
- Player may go back to any step before confirming
- Confirmed missions are staged in the pending missions list until turn submission

### FR-ME-002: Success Probability Display During Planning
- As characters are assigned in step 3, the success probability panel updates live:
  - Large percentage display: "72% chance of success"
  - Outcome tier breakdown (expandable): Critical Success / Success / Failure / Critical Failure with probability ranges
  - Key factor listing: relevant stat values, opposition resistance, any active faction modifiers
- Swapping characters recalculates the probability instantly (no server round-trip; client-side calculation)
- Modifiers that are unknown to the player (e.g. enemy spy network) are not displayed

### FR-ME-003: Mission Duration and Multi-Turn Missions
- Single-turn missions resolve at the end of the current turn's Resolution Phase
- Multi-turn missions (duration > 1) progress each turn:
  - Characters remain On Mission for the full duration
  - Progress is tracked as `current_turn / total_turns`
  - On the final turn, the mission resolves with a single success roll
  - No partial progress — mission either fully succeeds or fails at resolution
- Players can view active multi-turn missions in a **Active Missions** panel with countdown indicators

### FR-ME-004: Counter-Intelligence Response
- During the Resolution Phase, after a mission roll is made, the defending faction may have a counter-intelligence response:
  - Response triggers if the defending faction has a spy network active at the target system
  - Response probability: `spy_network_rating × 0.15` (0–30% depending on network rating, see spec 042)
  - If counter-intelligence activates, the mission's effective probability is reduced by 0.15 before the roll
  - Counter-intelligence activation is not revealed to the attacking faction unless the result is a detection event
- Counter-intelligence does not create additional failure outcomes; it reduces probabilities before the normal outcome tier determination

### FR-ME-005: Mission Resolution Order
- During the Resolution Phase, missions resolve in the following order:
  1. Reconnaissance missions (reveal intel before other missions use targets)
  2. Defensive missions (Rescue operations)
  3. Offensive missions (Sabotage, Assassination, Abduction, Incite Uprising)
  4. Support missions (Diplomatic, Recruitment, Research Assist, Espionage)
- Within each category, missions resolve in turn-submission order (first declared = first resolved)
- If a mission target (character or facility) is destroyed/captured by an earlier-resolving mission in the same turn, the later mission targeting it is automatically aborted (with a notification)

### FR-ME-006: Result Delivery
- After each resolved mission, the owning faction receives a Mission Report:
  - Mission type, target, character(s) assigned, outcome tier
  - Specific effect applied (e.g. "+15 loyalty at [System]")
  - Any secondary consequences (e.g. character captured, detection event)
- Mission Reports are added to a log accessible from the HUD notifications panel
- High-importance outcomes (Critical Failure, character capture, assassination) also appear as modal alerts

### FR-ME-007: Mission Cancellation
- Once a mission is confirmed (staged), it can be cancelled before turn submission
- Cancellation releases the assigned characters back to Available
- After turn submission, missions cannot be cancelled
- Multi-turn mission cancellation mid-execution is not permitted (characters remain unavailable until the mission resolves)

### FR-ME-008: Active Missions Panel
- An **Active Missions** tab in the HUD shall show:
  - All pending (staged but not yet resolved) missions with characters and targets
  - All in-progress multi-turn missions with progress bar and turns remaining
  - Completed missions from the most recent turn with outcome tier badge
- Clicking a mission entry opens the Mission Report for that mission

## Constraints

- Success probability calculation must be client-side to avoid latency during planning
- Mission resolution order must be deterministic and documented (no ambiguity for multiplayer fairness)
- Counter-intelligence response must not modify the visible probability shown to the attacking player
- Aborted missions (target destroyed same turn) must surface as a clear notification to the player

## Acceptance Criteria

- [x] Mission planning modal flows correctly through all 4 steps for all mission types
- [x] Success probability updates live when characters are swapped during planning
- [x] Single-turn missions resolve at end of Resolution Phase on the declared turn
- [x] Multi-turn missions hold characters On Mission for the correct duration and resolve on final turn
- [x] Counter-intelligence activation reduces effective probability by 0.15 without being visible to the attacker
- [x] Mission resolution order (Recon → Defensive → Offensive → Support) is correctly enforced
- [x] Mission abort fires if target is destroyed/captured by prior same-turn mission
- [x] Mission Reports are generated for all resolved missions with correct effect descriptions
- [x] Critical Failure and character capture outcomes trigger modal alerts
- [x] Active Missions panel shows all staged, in-progress, and recently completed missions
- [x] Mission cancellation before turn submission correctly releases characters
