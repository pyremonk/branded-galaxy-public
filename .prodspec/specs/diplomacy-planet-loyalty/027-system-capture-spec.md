# System Capture

## Overview

System Capture defines the mechanics by which a faction takes control of a star system currently held by another faction. Capture occurs through military victory (planetary invasion) combined with a loyalty threshold transfer. This spec covers the full transfer process: what changes at capture, how facilities are affected, how the captured system re-integrates into the attacker's economy, and how the prior occupying faction loses access to their assets.

## Requirements

### FR-SCP-001: Capture Trigger
- System capture triggers when:
  1. An attacking fleet defeats all defending forces in a system (Space Combat, spec 015)
  2. The subsequent Planetary Invasion phase resolves in the attacker's favor (spec 020)
- If there are no defending ground troops and no defending fleets, a fleet entering a neutral or enemy system automatically captures it (no combat needed) provided the fleet has ≥ 1 ship

### FR-SCP-002: Ownership Transfer
- On capture, the system's controlling faction changes to the capturing faction
- Loyalty values are updated:
  - Capturing faction's loyalty set to `max(30, current_attacker_loyalty)` (occupation floor)
  - Former controlling faction's loyalty set to `max(0, former_controller_loyalty - 30)` (conquest penalty)
  - Other factions' loyalty values unchanged
- System's troop count is reset to 0 (all defenders eliminated or routed)
- Any enemy ground troops that were present are considered eliminated (no prisoner mechanic for troops)

### FR-SCP-003: Facility State After Capture
- All facilities at the captured system transfer to the new controlling faction
- Each facility takes 1 HP damage at the moment of capture (combat damage)
- Facilities below 50% HP at capture are immediately inoperative (bonuses suspended until repaired)
- The capturing faction can use all transferred facilities (Shipyards, Research Facilities, etc.) starting the turn after capture
- Union Secret Base special behavior: if captured, see spec 017 (FR-BT-002) for relocation mechanics

### FR-SCP-004: Character Relocation at Capture
- All stationed characters of the now-displaced faction at the captured system roll for capture per spec 012 (FR-CCR-001)
- Characters that escape are relocated to the nearest friendly system (by hyperspace hop count)
- Characters that are captured are held at the captured system under the new controlling faction

### FR-SCP-005: Economic Impact on Captured Factions
- From the turn of capture onward, the former controller no longer receives any resource production from the system
- Any pending construction items in the system's queue are paused; the capturing faction inherits the queue and may cancel or continue each item (they are NOT charged again for already-paid items)
- Fleet maintenance coverage from Sector HQs (Brand Authority) recalculates immediately if a Sector HQ is captured

### FR-SCP-006: Liberation vs. Conquest
- **Liberation** occurs when a faction captures a system that previously had high loyalty to them (their own system retaken from occupation):
  - Applies if attacker's loyalty ≥ 60 at capture time
  - Loyalty bonus: attacker's loyalty jumps to `min(100, current + 20)` instead of the standard floor
  - Population bonus: +3 bonus troops generated immediately, reflecting a welcoming population
  - Notification: "[System] has been liberated!" (instead of "captured")
- **Conquest** is the standard capture where attacker loyalty < 60 — uses standard FR-SCP-002 rules

### FR-SCP-007: Diplomatic Conversion
- Alternative to military capture: a system may switch control via pure diplomacy
- If a non-controlling faction's loyalty at the system reaches or exceeds the controlling faction's loyalty AND both values are above 40, at the end of the Maintenance Phase a Diplomatic Conversion occurs:
  - Control transfers to the faction with the higher loyalty
  - No facility damage (peaceful transition)
  - Notification to both factions: "[System] has diplomatically converted to [Faction]"
- This can be prevented by the current controlling faction by spending 200 influence to "lock" the system for 3 turns (Diplomatic Hold action, available from System Detail panel)

### FR-SCP-008: Capture Notifications and Events
- When a system is captured, the following notifications fire:
  - Capturing faction: "[System] captured!" with production and facility summary
  - Losing faction: "[System] has been captured by [Faction]!" (high-priority modal alert)
- Captures are recorded in a game event log accessible from the HUD
- Captures that affect victory conditions (e.g. Brand Authority nearing galaxy control threshold) are flagged with a victory proximity warning

## Constraints

- Facility ownership transfer must be atomic — no scenario where a facility is "owned by nobody" mid-turn
- Diplomatic Conversion must not fire on the same turn as a Military Capture (military capture takes priority)
- Occupied queue items must remain available to the capturing faction without double-charging

## Acceptance Criteria

- [x] A fleet entering an undefended enemy system immediately captures it
- [x] Capture sets attacker loyalty to max(30, current) and reduces former controller by 30
- [x] All facilities take 1 HP damage on capture
- [x] Facilities below 50% HP suspend bonuses until repaired
- [x] Capturing faction can use inherited facilities from the turn after capture
- [x] Constructed queue items are inherited by capturing faction at no cost
- [x] Liberation path triggers when attacker loyalty ≥ 60 and grants +20 loyalty bonus and 3 troops
- [x] Diplomatic Conversion fires at end of Maintenance Phase when loyalty conditions are met
- [x] Diplomatic Hold correctly prevents Diplomatic Conversion for 3 turns
- [x] High-priority modal alert fires to the losing faction on military capture
