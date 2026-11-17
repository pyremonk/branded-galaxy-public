# Intel System

## Overview

The Intel System manages the game's fog-of-war and information asymmetry. By default, players have limited knowledge of enemy systems, fleets, and activities. Intelligence is gathered through fleet patrols, spy missions, and Outpost sensor networks, then stored as discrete intel items with expiry turns. This spec defines fog-of-war rules, intel acquisition, and the intel data model.

## Requirements

### FR-IS-001: Fog of War
- All non-friendly systems start with limited visibility; only publicly known facts are visible by default:
  - System name, star type, population, and hyperspace connections
  - Whether the system is currently controlled by a faction (faction color shown on map)
  - Current loyalty is hidden unless an intel item reveals it
- Hidden information (enemy faction only):
  - Fleet composition and size (system icons but not ship counts unless scouted)
  - Facility types and levels
  - Current loyalty values (exact number)
  - Character locations (on mission or assigned to fleet in enemy space)
  - Resource outputs
- A faction's own systems are always fully visible
- Neutral/uncontrolled systems expose basic information publicly (no fog for unowned systems)

### FR-IS-002: Intel Item Data Model
- Intel items are stored in `gameState.intel[factionId][]` as an array of objects
- Each intel item is a JSON object:
```json
{
  "id": "string (unique)",
  "type": "system_loyalty | fleet_composition | facility_status | character_location | resource_output | event_warning",
  "systemId": "string",
  "targetFactionId": "string",
  "data": {},
  "revealedOnTurn": 1,
  "expiresOnTurn": 5
}
```
- `expiresOnTurn` equals `revealedOnTurn + baseDuration`, where base durations are:
  - `system_loyalty`: 3 turns
  - `fleet_composition`: 2 turns
  - `facility_status`: 4 turns
  - `character_location`: 1 turn
  - `resource_output`: 3 turns
  - `event_warning`: 1 turn
- Expired items are purged during the Maintenance Phase (spec 028, FR-TS-003)
- A faction may not hold more than 50 active intel items simultaneously; oldest items are discarded when over the cap

### FR-IS-003: Intel Acquisition — Fleet Patrol
- Fleet Patrol order (spec 016, FR-FC-001) generates intel items for all systems in the patrol route
- Each system in the route generates: `fleet_composition` (for any enemy fleet present) and `facility_status`
- Patrol intel is added at the end of the Resolution Phase

### FR-IS-004: Intel Acquisition — Spy Missions
- Reconnaissance mission (folded into spec 044): yields `system_loyalty`, `fleet_composition`, `facility_status`, and `character_location` items based on mission outcome tier
- Sabotage missions may yield `event_warning` items as a side effect of Critical Success

### FR-IS-005: Intel Acquisition — Outpost Network (Autoforge)
- Each Autoforge Outpost (spec 017, FR-BT-003) provides passive intel for its host system each turn
- Outpost intel generates `resource_output` and `fleet_composition` items for the Outpost's system every turn while the Outpost is operational

### FR-IS-006: Intel Display on Map
- When a valid (non-expired) intel item exists for a system:
  - An intel indicator icon is shown on that system's map node
  - Clicking the system opens the System Detail panel with a dedicated "Intelligence" tab populated from current intel items
- Expired intel is not displayed and is not accessible in the UI

### FR-IS-007: Intel Accuracy Degradation
- All intel reflects a snapshot of the state at the time of acquisition
- Nothing in the system validates intel against current truth; it is the player's responsibility to keep intel fresh
- Re-acquiring the same intel type for the same system before expiry refreshes the `expiresOnTurn` to the current turn + base duration

## Constraints

- Fog-of-war must be enforced in all map filter overlays (spec 034) — Fleet Positions and Facility overlays only show intel-confirmed or own-faction data
- Intel items must not contain live references to game state objects; they are snapshots (serializable plain JSON)
- Intel acquisition from missions happens during Resolution Phase processing, not immediately

## Acceptance Criteria

- [x] Non-friendly system panels hide loyalty, fleet details, facility levels, and character locations by default
- [x] Uncontrolled systems show basic information without fog restrictions
- [x] Intel items conform to the defined JSON schema and persist in save data
- [x] Intel items expire and are purged during Maintenance Phase
- [x] Fleet patrols generate `fleet_composition` and `facility_status` items for each patrolled system
- [x] Autoforge Outposts generate passive intel items each turn for their host systems
- [x] Map node shows intel indicator icon when non-expired intel items exist for that system
- [x] Map filter overlays (Fleet Positions, Facility) respect fog-of-war
- [x] Intel store is capped at 50 items per faction; overflow discards oldest items
