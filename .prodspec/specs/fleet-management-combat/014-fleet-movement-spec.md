# Fleet Movement

## Overview

Fleet Movement governs how fleets travel between star systems, the time and rules involved in those journeys, fleet merging and splitting during movement, and the blockade mechanic that denies enemy movement. Fleets may travel between any two systems — either quickly via established hyperspace lanes or slowly via direct travel through open space.

Movement is declared during the Action Phase and resolves at the beginning of the following turn's Resolution Phase.

## Requirements

### FR-FM-001: Movement Modes
- Fleets may move between **any two systems** on the map using one of two travel modes:
  - **Lane travel**: Fleet hops system-by-system along hyperspace connections. Each hop costs exactly 1 turn. The game computes the shortest lane path (BFS) and the fleet advances one hop per Resolution Phase.
  - **Direct travel**: Fleet travels in a straight line through open space, ignoring the lane network. Travel time is determined by Euclidean distance scaled to a configurable maximum of 8 turns (1 turn minimum per hop, 2 turns minimum for direct travel).
- The player chooses the travel mode when issuing the move order. The UI shows the turn cost of each available option.
- A fleet cannot complete more than 1 hyperspace hop per turn in lane mode.

### FR-FM-002: Fleet Speed
- Fleet Speed (minimum Speed value among all ships) is computed and stored but is not used to modify travel time in the current implementation. It is reserved for future content.
- A fleet that begins movement is **In Transit** and cannot take any other action until it arrives

### FR-FM-003: Movement Declaration
- During the Action Phase, the player selects a fleet and chooses **Move**
- A route planner UI shows available hyperspace connections from the fleet's current system
- Player selects the destination system (or multi-hop waypoints)
- Movement is staged until turn submission; staged moves can be cancelled before submission
- Once the turn is submitted, movement cannot be cancelled

### FR-FM-004: Arrival Resolution
- Fleets arrive at the destination system at the start of the Resolution Phase
- Upon arrival:
  - Fleet location is updated to the destination system
  - If enemy fleets are present and no pre-existing ceasefire, combat is triggered automatically
  - If the system is uncontrolled or friendly, no combat occurs
  - Commander character's locationSystemId is updated to the destination system

### FR-FM-005: Fleet Merging During Movement
- Two fleets bound for the same destination via the same route may merge in transit
- Merge in transit is declared during the Action Phase before submission by selecting both fleets and choosing **Merge Route**
- Combined fleet arrives at destination as a single unit
- Combined fleet must not exceed the 12-ship cap; merge is rejected if it would exceed the cap

### FR-FM-006: Fleet Splitting
- A fleet may be split into two fleets while stationed at a system (not in transit)
- Split is declared during the Action Phase: player selects ships to move to the new fleet
- The original fleet retains its name and fleet ID; the new fleet receives a generated name (player may rename)
- Each resulting fleet must contain at least 1 ship
- Split fleets may then receive independent movement orders in the same turn

### FR-FM-007: Blockade Mechanics
- A fleet may be assigned the **Blockade** order at a system it currently occupies
- A blockaded system:
  - Prevents enemy fleets from entering the system without initiating combat
  - Prevents enemy characters from departing the system on missions
  - Reduces the system's resource output to the controlling faction by 50% (disruption of trade)
- Blockades persist until the blockading fleet moves, is destroyed, or receives a new order
- A system may only be blockaded by one faction at a time
- Friendly fleets may freely enter a blockaded system

### FR-FM-008: Movement UI
- Fleet movement routes shall be visualized as animated dashed lines on the Phaser galaxy map
- **In Transit** fleets shall show a position indicator between origin and destination systems
- Destination system shall be highlighted when a fleet is selected and Move is active
- Blocked routes (enemy blockade, no hyperspace connection) shall be visually indicated
- Multi-hop waypoints are shown as a sequential path on the map

### FR-FM-010: Travel Cost Formula
- Lane travel cost: `turns = count of hops in the BFS shortest path` (1 turn per hop)
- Direct travel cost: `turns = clamp(ceil(euclideanDist / (maxDiagonal / maxTurns)), directTravelMinTurns, maxTurns)`
  - `maxDiagonal`: diagonal of the galaxy map (2500 for small, ~3606 for medium, 5000 for large)
  - `maxTurns`: configurable in `fleet-config.json travelConfig.maxTurns` (default 8)
  - `directTravelMinTurns`: configurable in `fleet-config.json travelConfig.directTravelMinTurns` (default 2)
- Direct travel is always slower than or equal to lane travel for adjacent connected systems (min 2 turns vs lane 1 turn)
- Direct-travel fleets are invisible to enemies while in transit (they do not appear at an intermediate position; the owner sees an "En Route" indicator with remaining turns)

### FR-FM-009: Movement Persistence
- In-transit fleet state (origin, destination, waypoints, travelMode, turnsRemaining) must be persisted in save state
- Saves without `travelMode` are treated as lane travel (backward compatibility)

## Constraints

- Fleets may move to any system via lane or direct travel; isolated systems are reachable by direct travel
- In-transit fleets cannot split, merge (unless planned before departure), or be recalled
- Blockade orders cannot be issued while a fleet is in transit
- Fleet movement must support galaxy sizes from small (few connections) to large (dense network)

## Acceptance Criteria

- [x] Fleet can move to any system via lane travel (shortest path) or direct travel
- [x] Lane fleet arrives at each intermediate hop each Resolution Phase; arrives at destination when last hop resolves
- [x] Direct-travel fleet arrives at destination after computed turn count; invisible to enemies during transit
- [x] Player can select between lane and direct travel in the Move UI with turn costs shown for both options
- [x] In-transit status blocked all other actions for that fleet
- [x] Arriving fleet triggers combat if enemy fleet present
- [x] Merge-in-transit correctly combines two fleets at destination without exceeding 12-ship cap
- [x] Split operation correctly divides ships between two fleets at the same system
- [x] Blockade order prevents enemy fleet entry without combat
- [x] Blockade reduces system resource output by 50%
- [ ] Movement route visualization renders correctly on galaxy map
- [x] In-transit state (including travelMode and turnsRemaining) persists through save-load cycle
