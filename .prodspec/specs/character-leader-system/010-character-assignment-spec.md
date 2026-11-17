# Character Assignment

## Overview

The Character Assignment system governs how players deploy characters from their roster to missions, fleets, and facilities. Characters are the primary action-takers in Branded Galaxy — without proper assignment, no covert missions fire, fleets lose their command bonuses, and research facilities operate at base efficiency. This system enforces assignment rules, tracks character availability, and communicates changes to all dependent systems.

Assignment is turn-based: a character may be reassigned at the start of each turn before the action phase resolves. Mid-turn reassignment is not permitted once actions are submitted.

## Requirements

### FR-CA-001: Assignment Types
- Characters may be assigned to one of four contexts at a time:
  - **Mission Assignment**: Character is sent on a mission (see Mission System)
  - **Fleet Command**: Character serves as fleet commander (see Fleet Management)
  - **Facility Station**: Character is stationed at a system's facility to provide a passive bonus
  - **Unassigned (Available)**: Character is idle at their current system
- A character may only hold one assignment at a time
- Attempting to assign an already-assigned character shall produce a clear error

### FR-CA-002: Mission Assignment
- Player selects a mission type and a target system
- Player selects one or more characters to assign to the mission
- Each mission type defines its character slot requirements:
  - Most missions require exactly 1 character
  - Some advanced missions (e.g. Abduction, Rescue) may allow up to 2 characters (both stats contribute)
- Assigned characters' status changes to **On Mission**
- Characters remain On Mission until the mission resolves (end of turn or multi-turn duration)
- Players cannot view or modify an in-progress mission's character assignment once it has started

### FR-CA-003: Fleet Command Assignment
- A fleet may have at most 1 assigned commander
- Player selects a fleet and a character to assign as commander
- Character's Leadership stat provides a percentage bonus to fleet combat power:
  - Formula: `fleet_power × (1 + (leadership / 20))` — Leadership 5 → +25%, Leadership 10 → +50%
- Character status changes to **In Fleet** when assigned as fleet commander
- If a fleet is destroyed, character status transitions to either **Captured** or **Dead** based on combat outcome
- Removing a commander from a fleet (if the fleet survives) returns character to **Available**

### FR-CA-004: Facility Station Assignment
- Player selects a system controlled by their faction and a facility type at that system
- Player assigns one character to the facility
- Valid facility-character pairings and bonuses:
  - **Research Facility** + any character → +5% research speed per Research stat point above 5
  - **Training Facility** + any character → +10% recruit production per Diplomacy stat point above 5
  - **Shipyard** + any character → +5% ship construction speed per Leadership stat point above 5
  - **Trade Hub** + any character → +8% credit income per Diplomacy stat point above 5
- Only one character may staff a given facility at a time
- Character must be **Available** and located in the same system as the facility
- Character status changes to **Stationed** (a sub-status of Available; no mission restriction while stationed)
- If the system is captured, stationed characters are relocated to the faction's nearest friendly system

### FR-CA-005: Character Location Tracking
- Each character has a current `locationSystemId` property
- Characters not on mission are located at a specific system
- Travel between systems takes turns equal to the hyperspace distance (minimum 1 turn)
- Characters in transit cannot be assigned until they arrive
- When assigned to a mission or fleet, character location updates to the target system upon assignment resolution

### FR-CA-006: Assignment UI
- Assignment interface shall be accessible from the Character Roster panel
- For each available character, an "Assign" button opens an assignment modal
- Assignment modal presents four tabs: Mission, Fleet, Facility, Unassign
- **Mission tab**: Shows available mission types; selecting one opens mission planning (see Mission System spec)
- **Fleet tab**: Lists player's fleets with current commander slot; select fleet to assign character as commander
- **Facility tab**: Lists all player-controlled facilities that currently have no stationed character and are in the character's system
- **Unassign tab**: Returns character to Available status (only active if currently assigned to a fleet or facility)
- Assignment changes are staged until turn submission; a staged summary shows pending assignments
- Conflicting assignments (same character assigned twice) shall be highlighted with an error state

### FR-CA-007: Assignment Validation Rules
- System shall reject assignment if:
  - Character status is not **Available** (or **Stationed** for facility reassignment)
  - Character is assigned to a mission that is still in progress
  - Character is in transit (location not yet resolved)
  - Target fleet already has a commander
  - Target facility already has a stationed character
  - Mission character slot is already filled
- All validation errors shall include a human-readable explanation

### FR-CA-008: Assignment Events
- Assignment state changes shall emit CustomEvents on `window`:
  - `galaxy:characterAssigned` — `{ characterId, assignmentType, targetId, factionId }`
  - `galaxy:characterUnassigned` — `{ characterId, previousAssignmentType, factionId }`
- These events allow the Phaser HUD and React panels to reflect updated character states without polling

### FR-CA-009: Turn Resolution Integration
- At turn resolution, the game engine shall process all staged assignments in order:
  1. Unassignments (frees up characters first)
  2. Facility station assignments
  3. Fleet command assignments
  4. Mission assignments (missions begin after all other assignments resolve)
- Turn resolution shall validate all assignments once more; invalid assignments roll back with a notification

## Constraints

- A character may only hold one assignment type at a time (enforced at both UI and engine levels)
- Facility station bonuses are only active while the system remains under faction control
- Characters in transit cannot be assigned; the UI must clearly indicate transit status
- Assignment system must be independent of (but integrate with) Mission, Fleet, and Facility systems
- All assignment state must be serializable as part of the game save payload

## Acceptance Criteria

- [x] Assigning a character to a mission changes their status to On Mission and blocks re-assignment
- [x] Fleet commander Leadership bonus is calculated correctly at all Leadership values (1–10)
- [x] Facility bonuses apply correctly and are reflected in the resource/research tick
- [x] An already-assigned character cannot be assigned a second time until unassigned
- [x] Assignment modal shows correct available options based on character location and status
- [x] Staged assignments display a pending summary before turn submission
- [x] Conflicting staged assignments are flagged with an error state
- [x] `galaxy:characterAssigned` and `galaxy:characterUnassigned` events fire on all valid transitions
- [x] Assignment state is included in the game save payload and restores correctly on load
- [x] Capturing a system correctly returns/relocates any stationed characters to a friendly system
