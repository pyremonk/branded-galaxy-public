# Mission Success Calculation

## Overview

The Mission Success Calculation system defines how the game determines the outcome of character-driven missions. It combines character stats, specialization bonuses, opposition resistance, faction modifiers, and a seeded random element to produce a weighted probability of success. The system supports four distinct outcome tiers (Critical Success, Success, Failure, Critical Failure) and maps each outcome to specific consequences in the mission resolution pipeline.

This system is intentionally transparent: players always see success probability before committing a character to a mission, enabling informed strategic risk management.

## Requirements

### FR-MSC-001: Mission Type to Stat Mapping
- Each mission type shall map to a primary and secondary character stat:

  | Mission Type       | Primary Stat | Secondary Stat |
  |--------------------|-------------|----------------|
  | Diplomacy          | Diplomacy   | Leadership     |
  | Espionage          | Espionage   | —              |
  | Sabotage           | Espionage   | Combat         |
  | Recruitment        | Diplomacy   | —              |
  | Research Assist    | Research    | Diplomacy      |
  | Incite Uprising    | Diplomacy   | Espionage      |
  | Abduction          | Espionage   | Combat         |
  | Assassination      | Espionage   | Combat         |
  | Reconnaissance     | Espionage   | —              |
  | Rescue             | Combat      | Espionage      |

- If a mission uses two characters, the primary stat is taken from the lead character and secondary from the support character
- All stat lookups must account for specialization bonuses before calculation

### FR-MSC-002: Base Success Probability Formula
- Base success probability is calculated as:

  ```
  effective_stat = primary_stat + specialization_bonus
  base_prob = (effective_stat / 10) × 0.6 + 0.2
  ```

  This yields a range of [0.26 (stat 1) → 0.80 (stat 10)] for the base probability.

- If a mission has a secondary stat, apply a secondary modifier:
  ```
  secondary_effective = secondary_stat + specialization_bonus
  secondary_modifier = (secondary_effective / 10) × 0.15
  base_prob += secondary_modifier
  ```

  Combined range: [0.275 → 0.95] with maximum secondary stat.

### FR-MSC-003: Opposition Resistance
- Each system has an Opposition Resistance value (0–10), reflecting enemy presence and defenses
- Opposition Resistance is determined by:
  - Base system value (configured per system, default 3)
  - +2 for each enemy fleet present in the system
  - +3 if the system is the enemy faction's homeworld
  - +2 if the enemy has a spy network active in the system (detected or suspected)
  - -2 if the system has low loyalty to the defending faction (≤ 30%)
- Resistance modifier applied to success probability:
  ```
  resistance_penalty = (opposition_resistance / 10) × 0.35
  adjusted_prob = base_prob - resistance_penalty
  ```
- Adjusted probability is clamped to [0.05, 0.95] (never guaranteed success or failure)

### FR-MSC-004: Faction Mission Modifiers
- Faction-level modifiers adjust final probability:
  - **Brand Authority**: -0.10 on Sabotage missions (corporate oversight restriction)
  - **The Union**: +0.05 on missions in enemy-controlled systems with loyalty < 50%
  - **The Autoforge**: +0.05 on Espionage missions using `droid-interface` characters
- Technology research may provide additional flat modifiers (see Tech Tree spec)
- Modifiers are additive; final probability is re-clamped to [0.05, 0.95]

### FR-MSC-005: Outcome Tier Thresholds
- A seeded random roll (0.0–1.0) is compared against the final probability to determine outcome tier:

  | Roll vs. Probability     | Outcome Tier     |
  |--------------------------|------------------|
  | roll < prob × 0.15       | Critical Success |
  | roll < prob              | Success          |
  | roll < prob + 0.20       | Failure          |
  | roll ≥ prob + 0.20       | Critical Failure |

- **Critical Success**: Mission goal achieved at maximum effect; +25 XP to assigned character(s)
- **Success**: Mission goal achieved at standard effect; +15 XP to assigned character(s)
- **Failure**: Mission goal not achieved; +5 XP to assigned character(s); possible detection
- **Critical Failure**: Mission goal not achieved; +0 XP; character capture risk triggered (see spec 012)

### FR-MSC-006: Detection Probability on Failure
- Missions that fail may alert the defending faction
- Base detection chance on Failure: 25%
- Base detection chance on Critical Failure: 75%
- Detection chance modifiers:
  - +15% if the system has an active enemy spy network
  - -10% if the character has the `covert-ops` or `assassin` specialization
- When detected, the defending faction receives an intelligence report with mission type and approximate origin region (not exact character identity)

### FR-MSC-007: Multi-Character Mission Calculation
- When two characters are assigned to a mission:
  - Lead character provides primary stat; support character provides secondary stat
  - Average level of both characters contributes a small level bonus:
    `level_bonus = (avg_level - 1) × 0.01` (max +0.09 at average level 10)
  - Both characters share XP from the outcome
  - Critical Failure applies capture risk to both characters independently

### FR-MSC-008: Probability Display to Player
- Before finalizing a mission assignment, the UI shall display:
  - Final success probability as a percentage (e.g. "67% chance of success")
  - Outcome tier breakdown (hover/tooltip): probability ranges for each tier
  - Key factors influencing the probability (stat values, opposition, faction modifier)
- Probability display must update live if the player swaps assigned characters
- Display must not reveal hidden modifiers the player has not yet discovered (e.g. enemy spy network in system unless already detected)

### FR-MSC-009: Random Seed Management
- Mission rolls shall use the project's `SeededRandom` utility (see `core/seeded-random.js`)
- Each mission gets a unique roll derived from `gameState.turnNumber + missionId + characterId`
- Using seeded randomness ensures replay consistency and prevents save-scumming in LAN multiplayer

### FR-MSC-010: Effect Resolution by Outcome
- The calculation system is responsible only for determining the outcome tier
- Effect resolution (loyalty changes, resource gains, intel reports, etc.) is handled by the Mission Resolution subsystem, which receives the outcome tier as input
- This separation keeps the calculation system stateless and independently testable

## Constraints

- All probability values must remain in the range [0.05, 0.95] after all modifiers are applied
- The calculation must be deterministic for a given set of inputs and seed (no floating-point surprises)
- Faction modifiers must be read from faction definition config, not hardcoded in the calculation function
- The system must be callable without a UI context (pure function) for AI opponent use
- Performance: calculation must complete in < 1ms per mission (single-threaded JS)

## Acceptance Criteria

- [x] A character with stat 1 on a standard mission in a default resistance system yields ~26% base probability
- [x] A character with stat 10 on a standard mission in a default resistance system yields ~80% base probability
- [x] Opposition resistance of 10 reduces probability by 0.35 before clamping
- [x] Brand Authority character attempting Sabotage has -0.10 applied to final probability
- [x] Critical Success threshold is correctly 15% of the success probability
- [x] Critical Failure triggers when roll ≥ prob + 0.20
- [x] Multi-character missions apply level bonus and share XP correctly
- [ ] Probability display updates live in the UI when swapping assigned characters
- [x] Two runs with the same turn, missionId, and characterId yield the same roll
- [x] Calculation function returns correct result with no UI context (AI use case)
