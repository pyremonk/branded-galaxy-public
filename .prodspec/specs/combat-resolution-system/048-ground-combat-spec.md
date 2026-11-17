# Ground Combat

## Overview

Ground combat resolves the planetary invasion phase after a victorious fleet engagement. When an attacking fleet wins space combat, the attacker may choose to invade the system. Ground combat simulates a round-by-round battle between attacking forces and the system's defending garrison (troops + fortifications). This spec expands on the ground combat summary in spec 020.

## Requirements

### FR-GC-001: Invasion Trigger
- After winning space combat at a system (spec 015, spec 047), the attacking faction is presented with a choice:
  - **Invade**: proceed to ground combat
  - **Blockade**: occupy the system space without invading (spec 016, FR-FC-004)
- If the attacker has no fleet power remaining after space combat (empty fleet due to losses), invasion is not possible
- Invasion occurs in the Invasion step of the Resolution Phase (spec 028, FR-TS-002)

### FR-GC-002: Ground Forces
- Attacking forces: `fleet_power / 10` (rounded down); represents marines/ground troops carried by the fleet
- Minimum attacking force: 1 (even small fleets can attempt an invasion)
- Defending garrison:
  - `troops` garrison in the system (spec 020, FR-PD-001): each troop = 1 defending unit
  - `facility_defense_bonus` from facilities:
    - Defense Platform: adds +0.15 to defender's effective combat ratio
    - Ion Cannon: adds +0.10 to defender's effective combat ratio
    - Shield Generator: reduces attacker's effective damage by 20%

### FR-GC-003: Ground Combat Resolution
- Ground combat is resolved in rounds (maximum 15 per invasion)
- Each round:
  1. Attacker effective power = `attacking_units × (1 + tech_ground_bonus)`
  2. Defender effective power = `defending_units × (1 + facility_defense_bonus + loyalty_defense_bonus)`
     - `loyalty_defense_bonus`: `(loyalty / 100) × 0.30` (loyal populations resist harder)
  3. Attacker casualties = `floor(defender_effective_power × 0.15)`
  4. Defender casualties = `floor(attacker_effective_power × 0.15)`
  5. Apply Shield Generator reduction to attacker casualties if applicable
  6. Reduce attacking_units and defending_units by their respective casualties
  7. If `defending_units ≤ 0`: invader wins; proceed to system capture (spec 027)
  8. If `attacking_units ≤ 0`: invasion fails; attacker retreats to orbit (remains in space combat victor position)

### FR-GC-004: Invasion Failure
- An invasion failure means:
  - Attacking fleet remains at the system as a blockade (spec 016)
  - The system does not change control
  - The attacker loses the committed ground forces (no recovery)
  - The defender's garrison is reduced by casualties taken

### FR-GC-005: Seeded Randomness
- Ground combat round outcomes use `SeededRandom`:
  - Seed = `turnNumber + systemId + "ground" + attackerFactionId`

### FR-GC-006: Ground Combat Report
- A Ground Combat Report is appended to the Space Combat Report for the same engagement:
```json
{
  "invasionAttempted": true,
  "attackingUnits": 5,
  "defendingUnits": 8,
  "rounds": 7,
  "outcome": "attacker_wins | defender_wins",
  "attackerLosses": 3,
  "defenderLosses": 8
}
```

### FR-GC-007: Troop Replenishment After Victory
- Upon winning ground combat, the attacking fleet does not automatically station troops
- Troops are stationed at rate of 1 per turn from population (spec 020, FR-PD-001), up to the system's troop cap
- The new controlling faction's loyalty in the system is set per the system capture rules (spec 027)

### FR-GC-008: Ground Combat in Auto-Resolve Mode
- The full round simulation described above runs internally and instantly
- The player sees only the Ground Combat Report summary (outcome + losses) in the Combat Report

## Constraints

- Invasion requires the attacking faction to have won space combat in the same Resolution Phase step; it cannot be deferred to a later turn
- A maximum of 15 ground combat rounds prevents infinite loops (unlikely with the 0.15 damage rate but enforced)
- Ground combat does not apply commander Leadership bonus (that is space combat only); the fleet power / 10 formula is flat

## Acceptance Criteria

- [x] Invade / Blockade choice is presented after winning space combat (if any fleet power remains)
- [x] Attacking units = `floor(fleet_power / 10)`; minimum 1
- [x] Defense Platform, Ion Cannon, and Shield Generator facilities apply their correct bonuses
- [x] Loyalty defense bonus applies correctly per formula
- [x] Invasion failure leaves attacker in blockade position without changing system control
- [x] Attacker casualties apply Shield Generator reduction when present
- [x] Ground combat resolves in ≤ 15 rounds regardless of outcome
- [x] Ground Combat Report fields are populated correctly after resolution
- [x] Seeded randomness produces reproducible results for the same game state
