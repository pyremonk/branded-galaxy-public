# Fleet Commands

## Overview

Fleet Commands are standing orders assigned to fleets that govern their behavior beyond simple movement and combat. Rather than just moving from system to system, fleets can be assigned strategic roles — patrolling a region to reveal enemy activity, conducting hit-and-run raids, or enforcing blockades. Commands persist until cancelled or overridden and execute automatically each turn they are active.

## Requirements

### FR-FLC-001: Command Types
- System shall support three fleet command types:
  - **Patrol**: Fleet repeatedly moves through a defined hyperspace-lane route, revealing enemy activity
  - **Raid**: Fleet performs a hit-and-run strike against a target system, then retreats
  - **Blockade**: Fleet holds position, preventing enemy entry to a system (see Fleet Movement spec 014, FR-FM-007)
- Only one command may be active on a fleet at a time
- Assigning a new command cancels the previous command

### FR-FLC-002: Patrol Command
- Player assigns a **Patrol Route**: a sequence of 2–4 systems connected by hyperspace lanes
- Each turn, the fleet moves to the next system in the route via the lane connection (looping back to start after the last)
- While patrolling a system, the fleet reveals:
  - All enemy fleets in the system (even if normally in fog of war range)
  - Any mission activity detected in the system (25% base detection chance per active mission)
  - Enemy characters stationed at facilities in the system (if intel level permits)
- Patrol route must consist entirely of hyperspace-connected systems; direct travel is not permitted for patrol
- Patrol is cancelled if the fleet is forced into combat (it does not auto-retreat)

### FR-FLC-003: Raid Command
- Player assigns a **Raid Target**: a specific enemy-controlled system within 1 hyperspace hop
- On the turn the Raid executes:
  1. Fleet moves to the target system
  2. If enemy fleets are present, combat occurs (first round only — a forced short engagement)
  3. If attacker survives round 1, a random facility in the target system suffers damage equivalent to 10–25% of its HP
  4. Fleet retreats back to origin system at end of same turn
- Raid damage to facilities stacks across multiple raids
- Raid can be opposed: if defender has a fleet present, the first-round combat occurs and, if the raider loses all ships, no facility damage is dealt
- Raid faction modifiers:
  - Brand Authority: -15% facility damage (less effective at raiding)
  - The Union: +15% facility damage on raids in enemy-controlled systems
- Raid command is consumed after execution (one-shot order); player must re-issue to raid again

### FR-FLC-004: Blockade Command
- Covered in Fleet Movement spec 014 (FR-FM-007)
- Blockade command sets the fleet's standing order to hold position and deny enemy entry
- Fleet remains stationary until blockade is cancelled or fleet is destroyed

### FR-FLC-005: Command UI
- Fleet panel shall show the currently active command for each fleet with a status indicator
- A **Commands** section on a selected fleet shows available commands with descriptions
- Assigning a command opens a target selector:
  - Patrol: route builder showing available connected systems (lane-only routing)
  - Raid: target system selector (filtered to enemy systems ≤ 1 hop away)
  - Blockade: no additional input needed (fleet holds current position)
- Active commands are shown as icons on the fleet's system position on the galaxy map

### FR-FLC-006: Command Interruption
- Any command may be manually cancelled during the Action Phase before turn submission
- Commands are automatically cancelled in these situations:
  - Fleet is destroyed → all commands clear
  - Raid target system changes control to friendly before raid executes → raid aborts, fleet stays
  - Patrol route system becomes inaccessible (hyperspace connection severed by event) → patrol route is truncated

### FR-FLC-007: Command Persistence
- Active fleet commands (type, target, route) must be serialized in save state
- Patrol route current position (which system in the loop the fleet is heading to next) must also persist

## Constraints

- Raid command is single-use; it cannot be queued more than once per turn per fleet
- Patrol routes must consist of valid hyperspace-connected systems at the time of creation
- All command effects must fire during the Resolution Phase, not at declaration time

## Acceptance Criteria

- [x] Patrol fleet moves one step along its lane route each turn without player input
- [x] Patrol reveals enemy fleets and mission activity in patrolled systems
- [x] Raid fleet completes one-round combat, deals facility damage on survival, and retreats in one turn
- [x] Brand Authority -15% and Union +15% raid damage modifiers apply correctly
- [x] Blockade command correctly denies enemy entry (see Fleet Movement spec)
- [x] Commands panel shows current command and allows assignment of new commands
- [x] Cancelling a command during Action Phase removes it before turn resolution
- [x] Fleet command state persists through save-load cycle with correct patrol position
