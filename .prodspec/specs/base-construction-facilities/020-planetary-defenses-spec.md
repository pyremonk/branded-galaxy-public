# Planetary Defenses

## Overview

Planetary Defenses encompass all ground-based defensive assets that protect a system from conquest: standing ground troops, shield generators (ground-side), and ion cannons. These assets force attackers to commit ground invasion forces rather than simply achieving space superiority, and they directly affect the cost and difficulty of taking a system. Planetary defenses are distinct from space-based fleet combat; they engage during the Planetary Invasion phase that follows space battle.

## Requirements

### FR-PD-001: Ground Troops
- Every system has a ground troop value (0–20 units) representing the local garrison
- Ground troop sources:
  - Faction-controlled systems generate 1 troop per turn automatically if loyalty ≥ 50%
  - Training Facilities add 1 additional troop per turn per level
  - Players may spend Recruits to add 5 troops per 10 Recruits (manual reinforcement action)
- Ground troops cannot be moved between systems; they are tied to the system
- Maximum ground troops at any system: 20 units

### FR-PD-002: Planetary Invasion Phase
- A planetary invasion occurs after the attacker wins space combat (or if no enemy fleet was present)
- Invasion can only be initiated if the attacking fleet contains at least 1 ship (fleet size = required ground force proxy)
- Invasion strength = attacking fleet's total combat power / 10 (rounded down, minimum 1)
- Invasion vs. Defense calculation (simultaneous resolution each round):
  ```
  attacker_effective = invasion_strength × tech_ground_bonus
  defender_effective = defender_troops × (1 + facility_defense_modifier)
  ```
  - `facility_defense_modifier`: +0.15 per Defense Platform, +0.10 per Ion Cannon at the system
- Each invasion round:
  - Attacker reduces defender troops by: `attacker_effective × (0.6 + rand × 0.4)`
  - Defender reduces attacker strength by: `defender_effective × (0.4 + rand × 0.4) × 0.1`
- Invasion ends when defender troops = 0 (attacker wins) or attacker strength = 0 (defender wins)
- Maximum 8 invasion rounds; if still contested, defender wins (failed invasion)

### FR-PD-003: Invasion Outcomes
- **Attacker Wins** (defender troops = 0):
  - System ownership transfers to attacker
  - System loyalty set to max(30, current_loyalty − 20) (occupation penalty)
  - Remaining defender facilities take 1 damage immediately (damage from fighting)
  - Stationed characters roll for capture (see spec 012, FR-CCR-001)
- **Defender Wins** (attacker fails to take the system):
  - Attacker's fleet retreats to origin (not destroyed — only reduced invasion strength, ships intact)
  - Defender troops reduced to the surviving amount (may be depleted)
  - System remains under defender control

### FR-PD-004: Shield Generators in Ground Defense
- A Shield Generator facility at a system provides additional protection during invasion:
  - Reduces invasion damage to defender troops by 20% per round
  - Reduces facility damage dealt to attacker by 1 (if normally ≥ 1, minimum 0)
- Shield Generators are special: they must be knocked out before the invasion phase begins
  - If the Shield Generator HP > 0 when invasion starts, attacker's invasion strength is reduced by 15%
  - The Shield Generator takes 2 HP damage automatically at the start of the invasion phase (representing focused fire during orbital bombardment)

### FR-PD-005: Ion Cannon in Ground Defense
- An Ion Cannon fires once at the start of the invasion phase (before round 1):
  - Reduces attacker's effective invasion strength by 15% for the entire invasion
  - This is in addition to its combat bonus during the Space Combat phase (spec 015)
- Ion Cannon takes 1 HP damage from firing; it may fire again in future invasions if repaired

### FR-PD-006: Troop Recruitment UI
- The System Detail panel shall show:
  - Current troop count / max (20)
  - Troop generation rate per turn
  - A **Reinforce** button: opens dialog to spend Recruits for immediate troop addition (5 troops per 10 Recruits)
  - Troop count is shown as a progress bar with a shield icon
- The Reinforce action is available during the Action Phase; troops added immediately are available for defense that turn

### FR-PD-007: Defense Calculation Preview
- When a player hovers over a system they intend to attack, the System Detail tooltip shall show:
  - Troop count (if known via intelligence)
  - Defense Platform and Shield Generator presence (if known or detected)
  - Estimated invasion difficulty (Low / Medium / High / Very High) based on current fleet vs. defender estimate

## Constraints

- Ground troops cannot be transported or moved between systems
- Invasion can only occur after attacker achieves space superiority (fleet combat resolved first)
- Planetary defense calculation must be deterministic for a given seed
- Facility damage from invasion (to defender) must use the same HP system as Raid damage

## Acceptance Criteria

- [x] Ground troops generate correctly per turn based on loyalty and Training Facility level
- [x] Manual reinforcement correctly deducts Recruits and adds troops up to the cap of 20
- [x] Invasion strength correctly derives from attacking fleet combat power / 10
- [x] Each invasion round deals damage to both sides using the correct formulas
- [x] Defense Platform and Ion Cannon bonuses apply correctly to defender_effective
- [x] Attacker Wins transfers system ownership and applies loyalty penalty
- [ ] Stationed characters roll capture correctly upon invasion success (character-combat integration deferred)
- [x] Shield Generator reduces invasion damage by 20% and takes 2 HP at invasion start
- [x] Ion Cannon fires once, reduces invasion strength by 15%, and takes 1 HP damage
- [x] Reinforce button correctly spends Recruits and adds troops immediately
- [ ] Defense difficulty preview displays correct rating in system tooltip (tooltip overlay deferred)

## Implementation Notes

- **Module**: `core/construction-engine.js` — `resolvePlanetaryInvasion()`, `generateGroundTroops()`, `reinforceTroops()`, `getInvasionModifiers()`
- **State**: `core/construction-state-manager.js` — `getTroopGenerationRate()`, `getGroundTroops()`, `setGroundTroops()`
- **Integration**: `_resolvePlanetaryInvasions()` in `core/turn-resolution-engine.js` calls `fleetStateManager.getPendingInvasions()` then resolves; `generateGroundTroops()` called each maintenance phase from `main-stage.js`
- **Fleet link**: `core/fleet-state-manager.js` gains `queueInvasion()`, `getPendingInvasions()`, `clearPendingInvasions()` stubs for future combat integration
