# Counter-Intelligence & Reconnaissance

## Overview

Counter-Intelligence encompasses defensive espionage operations that detect and neutralize enemy spy activity, plant false intel, and make systems harder to infiltrate. Reconnaissance covers active scouting — gathering fresh intel through character missions and fleet operations. Both subsystems share the underlying mission execution framework (spec 022) and intel data model (spec 042).

## Requirements

### FR-CI-001: Counter-Intelligence Presence
- Each system may have a Counter-Intelligence (CI) presence rating from 0 to 10
- CI presence is established by:
  - Assigning a character with Espionage ≥ 6 to a system in "CI Duty" (a passive assignment, not a mission)
  - Building a Training Facility (spec 018) in a system grants +2 passive CI presence
- CI presence decays by 1 per turn that no character is assigned to CI Duty in that system (minimum 0)
- CI presence is stored per system in `gameState.systems[systemId].ciPresence[factionId]`

### FR-CI-002: CI Impact on Enemy Missions
- When an enemy faction launches a mission targeting a system where a defending faction has CI presence:
  - Each CI presence point reduces the attacker's effective mission success probability by 0.015 (capped at -0.15 total for 10 CI points)
  - This stacks with the global counter-intel modifier from spec 022 (FR-ME-005)
- CI presence value is not publicly visible (hidden from the attacker)

### FR-CI-003: Spy Detection
- During mission resolution, if an attacker's mission results in a Failure or Critical Failure:
  - A detection check is made: detection probability = `(ciPresence × 0.08) + 0.05`
  - On successful detection, the defending faction receives a notification: "Enemy operative detected in [system]"
  - The detected character is placed in Captured status (spec 012) with detection as the capture trigger
  - The attacker's faction receives a notification: "Operative [name] was detected and captured in [system]"
- On Critical Failure outcomes, the detection probability doubles

### FR-CI-004: False Intel Operation
- A new mission type available to factions with a character with Espionage ≥ 7:
  - **False Intel**: Plant fabricated intel in an enemy faction's intel store
  - Target: enemy system; success adds a false intel item in enemy's `gameState.intel[targetFactionId]`
  - False intel items are structurally identical to real intel items but flagged internally as `"false": true`
  - False items are never revealed to the target player as false; they appear as legitimate intel
  - False items expire normally; they are subject to the same cap rules as real intel

### FR-CI-005: Reconnaissance (Active Scouting)
- Reconnaissance is a mission type (framed as a special case of the spy mission framework):
  - **Mission Name**: Reconnaissance
  - **Primary Stat**: Espionage
  - **Duration**: 1 turn
  - Outcome effects by tier:

| Outcome Tier | Effect |
|---|---|
| Critical Success | Generates all 5 intel types for the target system (loyalty, fleet composition, facility status, character locations, resource output); +1 turn expiry bonus |
| Success | Generates `system_loyalty`, `fleet_composition`, `facility_status` for the target system |
| Failure | No intel gained; character returns safely |
| Critical Failure | No intel gained; detection check triggered (FR-CI-003 applies) |

### FR-CI-006: Reconnaissance via Fleet Patrol
- Fleet Patrol orders (spec 016, FR-FC-001) also serve as a reconnaissance mechanism:
  - Generates `fleet_composition` and `facility_status` intel for each system in the route
  - This is automatic and requires no character assignment; see spec 042 FR-IS-003 for full details

### FR-CI-007: CI Duty Character Assignment UI
- In the Character Roster panel (spec 035), each character card has an "Assign to CI Duty" option
- CI Duty characters are shown with a shield icon overlay
- A character on CI Duty cannot simultaneously be assigned to a mission or fleet command
- CI Duty may be cancelled at any time; cancellation takes effect at the start of the next Action Phase

## Constraints

- CI presence must be serialized in save data (`careState.systems[systemId].ciPresence`)
- False intel items must be distinguishable internally (for save/load fidelity) but must never be revealed to the target faction in any UI
- Reconnaissance and CI Duty do not interfere with the base mission slot system; a character on CI Duty occupies their availability normally

## Acceptance Criteria

- [x] Assigning a character with Espionage ≥ 6 to CI Duty increases system CI presence
- [x] Training Facility grants +2 passive CI presence to its host system
- [x] CI presence decays by 1 per turn with no CI Duty character; floor is 0
- [x] CI presence reduces enemy mission success probability by 0.015 per point (max -0.15)
- [x] Detection check triggers on Failure/Critical Failure missions with correct probability formula
- [x] Detected character enters Captured status; both factions receive notifications
- [x] False Intel mission plants a `"false": true` flagged item in target faction's intel store
- [x] False items are never labeled or distinguished in the target faction's UI
- [x] Reconnaissance mission (Critical Success) generates all 5 intel types for target system
- [x] Reconnaissance Failure returns character safely with no intel
- [x] Reconnaissance Critical Failure triggers the spy detection check
- [x] CI Duty assignment/cancellation reflected in Character Roster with shield icon
