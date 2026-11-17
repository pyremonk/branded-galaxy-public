# Space Combat

## Overview

Space Combat resolves when two or more hostile fleets occupy the same system simultaneously, or when an attacking fleet enters a system defended by an enemy fleet. Combat is resolved automatically at the end of the Resolution Phase using a turn-by-turn simulation that accounts for fleet composition, commander bonuses, technology effects, special abilities, and a seeded random element.

Players may choose Auto-Resolve for a quick simulation result, or view a detailed Combat Log showing round-by-round events. Full tactical combat UI is a Phase 1D feature; in Phase 1B all combat is auto-resolved.

## Requirements

### FR-SC-001: Combat Triggers
- Combat triggers when:
  1. A fleet moves into a system occupied by at least one hostile fleet
  2. A blockade is challenged by a hostile fleet attempting to enter the system
  3. A forced engagement occurs from a `Raid` fleet command
- Combat does not trigger between fleets of the same faction
- Neutral (Autoforge) fleets do not engage in combat unless they have been explicitly assigned an attack order

### FR-SC-002: Combat Power Calculation
- Each fleet's effective combat power at the start of battle is calculated as:
  ```
  base_power = sum of Combat values of all ships in fleet
  commander_bonus = base_power × (leader_stat / 20)   // if commander assigned
  tech_bonus = base_power × faction_tech_military_bonus
  effective_power = base_power + commander_bonus + tech_bonus
  ```
- The defending fleet receives a +10% defensive bonus if the system has a defense platform facility
- The defending fleet receives an additional +5% if the system has a shield generator facility

### FR-SC-003: Auto-Resolve Simulation
- Combat is resolved in rounds; each round both sides deal damage simultaneously
- Damage dealt in a round:
  ```
  attacker_damage = attacker_effective_power × (0.8 + random_factor × 0.4) / 10
  defender_damage = defender_effective_power × (0.8 + random_factor × 0.4) / 10
  ```
  where `random_factor` is seeded random [0, 1] per round
- Damage reduces hull points of ships; ships are removed when hull reaches 0
- Combat ends when one side has no ships remaining, or after 10 rounds (defender wins draws)
- Hull damage is distributed starting from the weakest ships (fighters first)

### FR-SC-004: Combat Outcomes
- **Attacker Victory**: All defending ships destroyed; attacker takes control of the system
- **Defender Victory**: All attacking ships destroyed; system remains under defender control
- **Draw (10-round cap)**: Both sides retain their surviving ships; attacker retreats to origin; system stays with defender
- Following Attacker Victory, if the system had a Loyalty value < 30 for the attacker's faction, loyalty is set to 30 (military occupation floor)

### FR-SC-005: Ship Casualties and Damage
- Destroyed ships are permanently removed from the fleet
- Ships that survive combat retain any hull damage carried between battles (no automatic repair)
- Hull repair occurs 1 point per turn when a ship is stationed in a friendly system with a Shipyard
- Damaged ships (hull < max) have proportionally reduced combat power: `effective = base × (current_hull / max_hull)`

### FR-SC-006: Commander Capture/Death in Combat
- If a fleet is destroyed (0 ships remain), the fleet commander (if any) rolls for capture per spec 012 (FR-CCR-001)
- If the roll results in capture, the character is captured by the winning faction and held at the combat system
- If the capture roll fails, the commander escapes to the nearest friendly system

### FR-SC-007: Special Abilities in Combat
- Certain ship types have special abilities that modify combat:
  - *Fighter Squadron*: +15% combat power when fighting alongside a Capital Ship (carrier synergy)
  - *Stealth Corvette* (Union): 30% chance per round to evade all damage that round
  - *Blockade Runner* (Brand Authority): +50% combat power in the first round only (initial strike)
  - *Droid Carrier* (Autoforge): Recovers 1 Hull Point per round to up to 2 damaged ships in the fleet
- Special abilities are applied during the round-by-round simulation

### FR-SC-008: Combat Log
- Every combat event shall produce a Combat Log entry:
  - Round number
  - Damage dealt by each side
  - Ships destroyed (name and class)
  - Special ability activations
  - Final outcome
- The Combat Log is accessible from the notifications/alerts panel
- Combat Log entries are retained for the last 10 combats; older entries are archived

### FR-SC-009: Retreat Mechanics
- Before declaring a combat, the attacking player may declare a **Probe** instead
  - A Probe retreats if the defender's effective power exceeds the attacker's by more than 20%
  - A successful Probe reveals the defender's fleet composition without combat
  - A failed Probe (defender power ≤ 20% more) still results in combat
- During auto-resolve, the underdog side (effective power < 50% of enemy) automatically retreats after round 3 if still alive, returning to the origin system with surviving ships

## Constraints

- All combat resolution must be deterministic for a given seed (reproducible)
- Auto-resolve must complete in < 100ms for fleets up to 12 ships each
- Ship hull damage state must persist between combats across turns
- Combat must handle edge cases: fleet of 1 ship, fleets with no commander, both sides reduced to 0 in same round

## Acceptance Criteria

- [x] Combat triggers when a hostile fleet enters an occupied system
- [x] Effective combat power correctly adds commander and tech bonuses
- [x] Defender bonus (+10%/+15%) applies when defense facilities are present
- [x] Round simulation deals damage, removes destroyed ships, and repeats up to 10 rounds
- [x] Attacker Victory correctly transfers system control and sets loyalty floor
- [x] Draw result retreats the attacker to origin system with surviving ships
- [x] Ship hull damage persists between combats; damaged ships have reduced power
- [x] Commander capture roll is triggered when fleet is destroyed
- [x] Stealth Corvette evasion and other special abilities apply correctly
- [x] Combat Log is generated with full round-by-round detail
- [x] Auto-resolve completes in under 100ms for max-size fleets
