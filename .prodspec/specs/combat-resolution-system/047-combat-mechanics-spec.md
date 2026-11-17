# Combat Mechanics

## Overview

This spec defines the detailed mechanics of space combat resolution — how fleet power is calculated, how rounds proceed, how casualties are applied, and how special abilities and tech effects modify outcomes. These mechanics apply to both Auto-Resolve mode and (in Phase 2) inform Tactical Combat. The base formula is introduced in spec 015; this spec expands it.

## Requirements

### FR-CB-001: Effective Fleet Power Calculation
- The effective combat power of a fleet is:
  ```
  effective_power = base_power × (1 + leadership_bonus + tech_bonus + facility_bonus + loyalty_bonus)
  ```
  Where:
  - `base_power` = sum of ship power values in the fleet
  - `leadership_bonus` = commander's Leadership stat / 20 (spec 015, FR-SC-001)
  - `tech_bonus` = sum of all active technology combat modifiers for the faction (from `TechEffectApplier`)
  - `facility_bonus` = +0.10 for a Defense Platform in the defender's system, +0.15 for an Ion Cannon (spec 015, FR-SC-003)
  - `loyalty_bonus` = if defending system loyalty ≥ 70 for the defending faction: +0.05

### FR-CB-002: Round Resolution
- Auto-Resolve combat proceeds in rounds (maximum 10 per engagement, spec 015)
- Each round:
  1. Both sides calculate effective_power for the round
  2. Damage dealt by each side = `effective_power × 0.1` (10% of power per round)
  3. Damage is converted to ship losses: 1 ship lost per `avg_ship_power` damage absorbed (rounding down)
  4. Losses are applied from weakest ship tier to strongest
  5. Surviving ships reduce the fleet's `base_power` for the next round
  6. Round ends; continue to next round or check for surrender

### FR-CB-003: Surrender Check
- After each round, check if either fleet has fallen below surrender threshold:
  - Surrender threshold: current `base_power` ≤ 25% of starting `base_power`
  - The faction crossing the threshold first attempts to retreat
  - Retreat success: 50% base chance + 5% per Leadership point of the commander (max 100%)
  - On successful retreat, remaining ships move to the nearest friendly system (1 hop away); if none, ships are lost
  - On failed retreat, combat continues until the 10-round cap

### FR-CB-004: Draw Resolution
- If combat reaches 10 rounds without surrender:
  - The defending fleet remains in the system; the defending faction controls the system
  - Both sides take casualties as calculated in the final round
  - The system changes hands only if the attacker's power exceeded the defender's by ≥ 50% for 5 consecutive rounds (overwhelming superiority rule)

### FR-CB-005: Seeded Randomness
- All random outcomes in combat (initiative rolls, retreat success, round-level variance) use `SeededRandom`:
  - Seed = `turnNumber + systemId + attackerFactionId`
- This ensures combat is fully deterministic and reproducible for a given game seed

### FR-CB-006: Special Abilities (Phase 2 — Tactical Combat)
- Special abilities are faction-exclusive modifiers applied to individual ship classes in Tactical Combat
- Phase 1: special abilities do not apply in Auto-Resolve; they are reserved for Phase 2 implementation
- The ability data model is defined here for forward compatibility:
  - Each ship class may declare a `special_ability` field in the ship definitions JSON (to be created)
  - Ability types: `first_strike` (attacks before opponent in round 1), `shield` (50% damage reduction for first hit), `emp` (reduces enemy tech_bonus by 0.05 for 2 rounds)

### FR-CB-007: Tech and Faction Modifiers
- Active technology effects from `TechEffectApplier` that modify `combat_power_modifier` are automatically included in `tech_bonus`
- Faction-specific modifiers from `faction-definitions.json` may define a base combat bonus (e.g. Autoforge drone fleets have +0.05 base tech_bonus when defending)

## Constraints

- All combat calculations must use floating-point arithmetic with results rounded to 2 decimal places
- The maximum 10-round cap is absolute; no override exists in Phase 1
- Ship losses must always remove the weakest ships first; never remove higher-tier ships when lower-tier ships remain

## Acceptance Criteria

- [x] Effective power formula correctly integrates leadership, tech, facility, and loyalty bonuses
- [x] Round damage reduces weakest-tier ships first
- [x] Surrender threshold check fires at ≤25% of starting base_power
- [x] Retreat success uses correct formula (50% + 5% per Leadership)
- [x] Successful retreat moves surviving ships to nearest friendly system
- [x] 10-round cap resolves as defender win (draw) unless overwhelming superiority rule triggers
- [x] All round-level random outcomes are seeded and reproducible
- [x] Active tech combat modifiers from TechEffectApplier are included in effective_power calculation
