# Mission Types

## Overview

Mission Types define the full catalogue of covert and diplomatic operations that characters can be dispatched on. Each mission type has a distinct goal, target requirements, the stat used for success calculation, and the effect produced by each outcome tier. Mission types are the primary mechanism through which characters interact with the strategic layer — shifting loyalty, gathering intelligence, damaging enemy infrastructure, acquiring new assets, or neutralizing threats.

## Requirements

### FR-MT-001: Mission Type Definitions
- All mission types shall be defined in a JSON configuration file
- Each definition includes:
  - **ID**: Unique string identifier
  - **Name**: Display name
  - **Description**: What the mission does and why
  - **Phase**: Which game phase unlocks this mission type (1B = available from start)
  - **Primary Stat**: The character stat used for success calculation (see spec 011)
  - **Secondary Stat**: Optional second stat for multi-stat missions
  - **Target Type**: `system` / `character` / `fleet` / `facility`
  - **Min Characters**: 1 or 2
  - **Duration**: Number of turns for multi-turn missions (default 1)
  - **Faction Restrictions**: Array of faction IDs that can use this mission (empty = all factions)
  - **Effects**: Object mapping outcome tier (critical_success / success / failure / critical_failure) to effect descriptor

### FR-MT-002: Diplomatic Mission
- **Target**: Any system not at maximum faction loyalty
- **Primary Stat**: Diplomacy · Secondary: —
- **Effects**:
  - Critical Success: +25 system loyalty toward caster's faction
  - Success: +15 system loyalty toward caster's faction
  - Failure: No loyalty change
  - Critical Failure: -5 loyalty (backlash); character capture risk

### FR-MT-003: Espionage Mission
- **Target**: Any system controlled by another faction
- **Primary Stat**: Espionage · Secondary: —
- **Effects**:
  - Critical Success: Fully reveals system's current troop count, all facilities, and all fleet details in-system
  - Success: Reveals system's facility list and troop count
  - Failure: No intel gained; 25% detection chance
  - Critical Failure: No intel; 75% detection; character capture risk

### FR-MT-004: Sabotage Mission
- **Target**: A specific facility at an enemy system
- **Primary Stat**: Espionage · Secondary: Combat
- **Effects**:
  - Critical Success: Target facility loses 3 HP
  - Success: Target facility loses 2 HP
  - Failure: No damage; 30% detection chance
  - Critical Failure: No damage; 80% detection; character capture risk
- Brand Authority: -0.10 success probability (FR-MSC-004)

### FR-MT-005: Recruitment Mission
- **Target**: Any neutral or enemy system (attempts to recruit a new character)
- **Primary Stat**: Diplomacy · Secondary: —
- **Effects**:
  - Critical Success: New Tier-3 character joins faction roster
  - Success: New Tier-2 character joins faction roster
  - Failure: No recruit; mission character gains 5 XP
  - Critical Failure: No recruit; 40% detection; character capture risk
- If roster is full (12 characters), the mission cannot be initiated

### FR-MT-006: Research Assist Mission
- **Target**: Own faction's system with an active Research Facility
- **Primary Stat**: Research · Secondary: Diplomacy
- **Effects**:
  - Critical Success: Current research progress advances by 2 extra turns
  - Success: Current research progress advances by 1 extra turn
  - Failure: No effect (mission still consumes the character for the turn)
  - Critical Failure: Current research progress set back by 1 turn (accident)
- This mission may only target own-faction systems

### FR-MT-007: Incite Uprising Mission
- **Target**: Any system with loyalty < 50% to the controlling faction
- **Primary Stat**: Diplomacy · Secondary: Espionage
- **Effects**:
  - Critical Success: System temporarily revolts — transfers to Neutral for 2 turns; ground troops reduced by 5
  - Success: System loyalty towards controlling faction reduced by 20
  - Failure: No effect; 20% detection
  - Critical Failure: Loyalty toward controlling faction increases by 5 (mission backfires); character capture risk

### FR-MT-008: Abduction Mission
- **Target**: A specific enemy character that is Available or Stationed (not On Mission or In Fleet)
- **Primary Stat**: Espionage · Secondary: Combat
- **Min Characters**: 2
- **Effects**:
  - Critical Success: Target character captured and held at abductor's nearest base system
  - Success: Target character captured and held at target system (same system as abduction)
  - Failure: No capture; 50% detection; both characters at elevated capture risk (30%)
  - Critical Failure: Mission characters captured; target unharmed

### FR-MT-009: Assassination Mission
- **Target**: A specific enemy character that is Available, Stationed, or On Mission
- **Primary Stat**: Espionage · Secondary: Combat
- **Effects**:
  - Critical Success: Target character dies immediately
  - Success: Target character wounded — forced to Available status (if On Mission, mission is abandoned); loses 2 stat points temporarily (1 turn)
  - Failure: No effect; 60% detection
  - Critical Failure: Mission character captured; 10% chance target character is alerted and gains +2 Espionage permanently
- This mission carries diplomatic consequences: executing successful assassination grants opposing faction +25 influence (martyrdom effect)

### FR-MT-010: Reconnaissance Mission
- **Target**: Any enemy or neutral system
- **Primary Stat**: Espionage · Secondary: —
- **Effects**:
  - Critical Success: Reveals fleet positions within 2 hyperspace hops of target; reveals all facilities at target
  - Success: Reveals fleet positions at target system; reveals number of facilities at target
  - Failure: No intel; 15% detection
  - Critical Failure: No intel; 50% detection; character capture risk

### FR-MT-011: Rescue Mission
- Defined in spec 012 (FR-CCR-006); included here for completeness
- **Target**: System where a friendly captured character is held
- **Primary Stat**: Combat · Secondary: Espionage

## Constraints

- Mission type definitions must be externalized in JSON config
- Mission type availability must enforce faction restrictions at the UI and engine levels
- Research Assist must validate the faction has an active research target before allowing initiation
- Abduction requires a 2-character team; UI must enforce this before allowing submission
- Assassination diplomatic consequence must fire as a game event even when the owning player has no Intel on the target faction

## Acceptance Criteria

- [x] All 10 mission types load from config with correct stat mappings and effect descriptors
- [x] Each outcome tier produces the correct effect for each mission type
- [x] Brand Authority -0.10 penalty applies to Sabotage missions
- [x] Recruitment fails gracefully if the roster is at max capacity
- [x] Research Assist correctly advances or sets back active research progress
- [x] Incite Uprising correctly triggers a 2-turn revolt on Critical Success
- [x] Abduction requires 2 characters and cannot be submitted with only 1
- [x] Assassination diplomatic consequence (+25 influence to target faction) fires on Critical Success
- [x] Reconnaissance reveals fleet positions within 2 hops on Critical Success
- [x] All mission effects are applied during the Resolution Phase, not at declaration
