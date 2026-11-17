# Loyalty Effects

## Overview

Loyalty Effects define how a system's loyalty level actively influences gameplay beyond the simple resource production scaling covered in the Loyalty System spec (024). High loyalty unlocks additional capabilities and bonuses; low loyalty creates instability and opens systems to exploitation. This spec covers the full matrix of loyalty-driven effects across fleet operations, mission difficulty, recruitment, troop generation, and intelligence visibility.

## Requirements

### FR-LE-001: Fleet Recruitment from System
- When a faction trains new ships at a Shipyard in a system, the `loyalty` of that system to the faction applies a modifier to production speed:
  - Loyalty 80–100: +10% production speed (highly loyal workforce)
  - Loyalty 60–79: No modifier (baseline)
  - Loyalty 40–59: -10% penalty (reduced support)
  - Loyalty < 40: The system is Neutral; production at any facility here is not available to the faction (the faction no longer controls the system)
- This modifier stacks multiplicatively with tech and facility bonuses

### FR-LE-002: Mission Difficulty Modifiers from Loyalty
- A faction's own loyalty at the target system reduces opposition resistance for their missions:
  - For every 10 points of own-faction loyalty above 50 at the target system, reduce opposition resistance by 1 (max -3 at loyalty 80+)
- An enemy faction's high loyalty at the target system increases opposition resistance:
  - For every 10 points of the defending faction's loyalty above 60, opposition resistance increases by 1 (max +4 at loyalty 100)
- These modifiers are factored into the success probability calculation (spec 011) and displayed to the player

### FR-LE-003: High-Loyalty System Bonuses (Loyalty 80+)
- A system at ≥ 80 loyalty for the controlling faction provides:
  - +1 troop generation per turn (in addition to base 1/turn)
  - Presence in the system grants +5% bonus to character XP gains for characters stationed here
  - Defensive modifier against enemy diplomatic missions: +5% reduction in enemy Diplomatic Action loyalty gains targeting this system
  - The Brand Authority additionally gets full intelligence visibility of this system (no fog of war) per faction identity bonus (spec 005)

### FR-LE-004: Maximum Loyalty (100) Bonuses
- A system at 100 loyalty (absolute allegiance):
  - All loyalty-80 bonuses apply
  - Resource output permanently set to 100% (immune to loyalty drift reductions that turn)
  - Cannot be targeted by enemy Propaganda Campaigns (population fully committed)
  - Enemy missions targeting this system have their success probability capped at 0.60 (extreme home-field resistance)
  - Provides +1 influence per turn to the controlling faction

### FR-LE-005: Low-Loyalty Instability Effects (Loyalty 30–39)
- Systems in the 30–39 range (approaching defection threshold) exhibit instability:
  - Resource production at 60% (below the 40–59 tier but not yet Neutral)
  - Available to enemy Incite Uprising missions with a +0.10 success probability bonus
  - Troop generation halts (loyalty too unstable to maintain a garrison)
- Players receive a **low loyalty warning** notification for any of their systems in this range each turn

### FR-LE-006: Neutral System Behavior
- Neutral systems (no faction loyalty ≥ 40) follow special rules:
  - Facilities at neutral systems are inactive (no production; no bonuses apply)
  - Fleets from any faction may pass through or station in neutral systems without triggering combat
  - Any faction may run Diplomatic missions targeting neutral systems to build loyalty
  - A neutral system with loyalty ≥ 40 for a faction automatically comes under that faction's control at the end of the Maintenance Phase

### FR-LE-007: Loyalty as Victory Condition Input
- Loyalty values feed directly into victory condition checks (spec 008):
  - Brand Authority "Galaxy Control" condition: counts systems with ≥ 60 loyalty toward BA
  - The Union "Sovereignty" condition: tracks systems converted above loyalty threshold
  - Autoforge "System Dependence" condition: tracks systems with Outpost installed (regardless of loyalty)
- Victory condition evaluations run at the end of each Maintenance Phase after loyalty updates

## Constraints

- All loyalty-driven modifiers must read from the loyalty values computed in FR-LS-001, not from cached/stale values
- The production scaling tiers in FR-LE-001 must not duplicate the scaling in Loyalty System spec 024 — this spec modifies the ship production speed only; resource production scaling is in spec 024
- Loyalty effects must support up to 3 factions with independent loyalty values per system

## Acceptance Criteria

- [x] System with loyalty 80+ to controlling faction generates +1 extra troop per turn
- [x] System at loyalty 100 cannot be targeted by Propaganda Campaigns
- [x] Enemy missions to a 100-loyalty system are capped at 0.60 success probability
- [x] Systems at loyalty 30–39 halt troop generation and apply +0.10 Incite Uprising bonus
- [x] Low loyalty warning fires each turn for player systems in the 30–39 range
- [x] Neutral system facilities are inactive; all faction fleets may coexist without combat
- [x] Shipyard production speed applies the correct loyalty modifier tier
- [x] Mission opposition resistance correctly adjusts based on own and enemy loyalty
- [x] Loyalty 100 systems provide +1 influence per turn
- [x] Victory condition evaluations correctly use loyalty values computed post-Maintenance Phase drift
