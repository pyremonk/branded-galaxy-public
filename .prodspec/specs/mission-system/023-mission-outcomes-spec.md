# Mission Outcomes

## Overview

Mission Outcomes defines how the results of a resolved mission are translated into concrete changes in game state. While Mission Success Calculation (spec 011) determines which outcome tier applies, and Mission Types (spec 021) defines the effects per tier, this spec covers the effect application pipeline: how different outcome types modify game state, how conflicting effects from simultaneous missions are arbitrated, how outcome consequences cascade into other systems, and how all changes are presented to the player.

## Requirements

### FR-MO-001: Effect Application Pipeline
- After an outcome tier is determined, the effects are applied in this order:
  1. **Direct state changes** (loyalty shift, resource gain, facility damage, character status change)
  2. **Secondary consequences** (detection events, XP gain, diplomatic consequences)
  3. **Cascading triggers** (a successful Incite Uprising may trigger a system revolt event)
  4. **Notifications** (Mission Report generated; alerts fired)
- All effects apply atomically within the same turn's Resolution Phase

### FR-MO-002: Outcome Effect Types
- System shall support the following outcome effect types, each with a defined state mutation:
  - `loyalty_shift` — Adjust target system's loyalty value by `amount` toward `faction`
  - `intel_reveal` — Add specified intel items to requesting faction's intel store
  - `facility_damage` — Deal `amount` HP damage to a specific facility at target system
  - `character_status` — Change a character's status (e.g. Captured, Dead, Available)
  - `resource_gain` — Add `amount` of `type` (credits, materials, recruits, influence) to faction
  - `research_advance` — Advance or retard current research progress by `turns`
  - `system_revolt` — Temporarily set system control to Neutral for `duration` turns
  - `troop_reduction` — Reduce defender troop count at target system by `amount`
  - `diplomatic_consequence` — Apply `amount` of influence to a specified faction

### FR-MO-003: Simultaneous Mission Conflict Resolution
- When two missions from different factions target the same object (system, character, or facility) and resolve in the same turn, conflicts are resolved by resolution order (spec 022, FR-ME-005)
- Specific conflict rules:
  - Two `loyalty_shift` effects on the same system apply sequentially; net loyalty is the sum
  - If a character is Captured by one mission and targeted by another mission in the same turn, the second mission's character-targeting effects are aborted (target gone)
  - Two `facility_damage` effects on the same facility both apply; facility can reach 0 HP within one turn
  - If a system is set to `system_revolt` and another faction attempts `loyalty_shift` on the same system in the same turn, the revolt takes priority and the loyalty shift is discarded

### FR-MO-004: Partial Success Scaling
- Some outcome types scale between Success and Critical Success tiers:
  - `loyalty_shift`: Critical Success gives 25, Success gives 15 (amounts defined in mission config)
  - `intel_reveal`: Critical Success reveals more intel items than plain Success
  - `facility_damage`: Critical Success deals more HP damage
- Scaling amounts are specified in the mission type definition (spec 021); the effect application pipeline reads amounts directly from the resolved outcome tier's effect descriptor

### FR-MO-005: Loyalty Outcome Constraints
- Loyalty values are clamped to [0, 100] after any shift
- Loyalty shifts cannot push a system past 80 in a single mission (cap per mission: max shift of 25 → can't go from 60 to 100 in one successful diplomatic mission; excess is discarded)
- A system at maximum loyalty (100) for a faction cannot be targeted by Diplomatic missions from that faction

### FR-MO-006: Intel Reveal Format
- Intel revealed by mission outcomes is structured as intel items added to the faction's intel store:
  ```json
  {
    "type": "fleet_position | facility | troop_count | mission_activity | character_location",
    "systemId": "...",
    "faction": "...",
    "value": "...",
    "turnRevealed": N,
    "expiresAfterTurns": 3
  }
  ```
- Intel items expire after `expiresAfterTurns` turns unless refreshed by new intelligence
- Critical Success reveals typically produce 3–5 items; plain Success produces 1–3

### FR-MO-007: Mission Report Generation
- Each resolved mission produces a Mission Report object:
  ```json
  {
    "missionType": "...",
    "characterIds": [...],
    "targetId": "...",
    "targetType": "system | character | fleet | facility",
    "outcomeTier": "critical_success | success | failure | critical_failure",
    "effectsApplied": [...],
    "detectionOccurred": false,
    "xpAwarded": 15,
    "turn": N
  }
  ```
- Reports are stored in the faction's mission log (last 30 reports retained; older are purged)
- Reports are accessible from the Notifications panel

### FR-MO-008: XP Award on Resolution
- XP awards are applied to all characters on the mission at resolution time:
  - Critical Success: +25 XP
  - Success: +15 XP
  - Failure: +5 XP
  - Critical Failure: +0 XP
- XP application triggers a level-up check (see spec 009, FR-CR-005)

## Constraints

- The effect application pipeline must be a pure function given outcome tier + game state snapshot (no side effects outside the defined mutations)
- All state mutations must be reversible in memory until committed at end of Resolution Phase (to support conflict arbitration)
- Intel items must not contain data the faction has not earned (no inadvertent leaks through the data model)
- Mission Report purge (30-report limit) happens at end of Maintenance Phase, not mid-resolution

## Acceptance Criteria

- [x] `loyalty_shift` correctly adjusts system loyalty within [0, 100] with per-mission cap of 25
- [x] `facility_damage` correctly applies HP damage and can destroy a facility in one turn with multi-source damage
- [x] `system_revolt` sets system control to Neutral for the correct duration
- [x] `diplomatic_consequence` correctly adds influence to the target faction
- [x] Simultaneous loyalty shifts sum correctly; revolt takes priority over loyalty shift
- [x] Critical Success reveals correct number of intel items; items expire after correct number of turns
- [x] Mission Report is generated with all required fields for every resolved mission
- [x] XP is awarded to all characters assigned to the mission at the correct amount per tier
- [x] Level-up is triggered when XP award pushes a character to the next threshold
- [x] Mission log retains last 30 reports and purges oldest at end of Maintenance Phase
