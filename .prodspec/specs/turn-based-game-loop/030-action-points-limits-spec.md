# Action Points / Limits

## Overview

Action Points and Limits governs how many actions a faction can take per turn, constraining the pace of expansion and preventing any player from executing unlimited operations in a single turn. Rather than a single universal action point pool, the system uses per-category limits that reflect the real bottlenecks in a grand strategy: character availability, fleet command slots, construction capacity, and diplomatic bandwidth.

## Requirements

### FR-APL-001: Character-Based Mission Limits
- Mission actions are limited by character availability, not an explicit point pool
- A faction may submit any number of missions per turn, provided:
  - Each mission has an Available character assigned
  - No character is assigned to more than one mission per turn
- This creates a natural limit: a faction with 4 Available characters can run at most 4 missions per turn
- Characters on multi-turn missions remain unavailable (On Mission status) until completion

### FR-APL-002: Fleet Command Limits
- A faction may issue movement or command orders to any number of fleets per turn
- However, each fleet may only receive one order per turn (one move order, one command assignment, or one battle declaration)
- A fleet that is already **In Transit** cannot receive new movement orders; it must complete its current hop first
- The one-order-per-fleet limit applies to commands (Patrol, Escort, Raid) as well: a fleet with an active Patrol cannot also be assigned a Raid in the same turn

### FR-APL-003: Construction Queue Limits
- Each system's construction queue has a capacity of 3 pending items (shared between facilities and ships)
- A faction may add items to any number of systems' queues in a single turn, as long as each individual queue does not exceed 3 items
- There is no faction-level limit on total construction starts per turn; only the per-system queue cap applies
- Resource deduction for any number of queue additions in one turn must not exceed the faction's available resources

### FR-APL-004: Diplomatic Action Limits
- Each system may receive at most 2 diplomatic actions per faction per turn (of any combination of action types)
- A faction is not limited in how many different systems they target with diplomatic actions in a single turn
- Stacking rules for same-type actions at the same system within the same turn:
  - Propaganda Campaign: only 1 per faction per system per turn
  - Trade Agreement: only 1 per system total (regardless of turn)
  - Resource Investment: only 1 per faction per system per turn (up to 2 lifetime)
  - Alliance Proposal: only 1 per system total (regardless of turn)

### FR-APL-005: Simultaneous Action Budget Check
- When a player submits their Action Phase, the engine validates that all staged actions can be afforded simultaneously:
  - Total resource cost of all staged actions must be ≤ current faction resource pool
  - If total cost exceeds available resources, the system highlights the conflicting actions and requires the player to remove some before re-submission
- Resource reservations are applied as actions are staged (soft-lock) to prevent over-commitment during the planning phase

### FR-APL-006: Limits HUD Indicator
- The HUD shall display a per-category readiness summary:
  - **Characters**: X/N Available (where N is total roster size)
  - **Fleets**: number of fleets with no issued order / total fleets
  - **Construction**: number of systems with queue space / total controlled systems
  - **Resources**: current resource pool (live, reflecting staged deductions)
- This gives players an at-a-glance view of remaining capacity without requiring panel navigation

### FR-APL-007: Per-Turn Diplomatic Hold Action
- The Diplomatic Hold (from spec 027) also counts toward the 2-diplomatic-actions-per-system-per-turn limit
- Players should be made aware if the Diplomatic Hold would push them over the limit

## Constraints

- The per-system construction cap (3 items) is enforced at the queue level, not just in the UI
- Resource soft-lock on staged actions must be reversible when actions are de-staged (cancelled)
- In multiplayer, each faction's limits are enforced independently; no shared limit exists between players

## Acceptance Criteria

- [x] A faction with 4 Available characters cannot submit more than 4 missions
- [x] Each fleet accepts only one order per turn; second order assignment is blocked with an error
- [x] In-transit fleets do not accept new movement orders
- [x] Construction queue rejects a 4th item when already at cap of 3
- [x] Faction may add construction items to any number of systems in one turn
- [x] A second Propaganda Campaign at the same system by the same faction in the same turn is blocked
- [x] Submitting staged actions with total cost exceeding available resources triggers validation error
- [x] Resource soft-lock correctly reserves resources as actions are staged and releases on de-stage
- [x] HUD shows correct Available character count and fleet order status
- [x] All limits are enforced independently for each faction in multiplayer
