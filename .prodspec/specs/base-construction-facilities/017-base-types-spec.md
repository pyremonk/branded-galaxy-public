# Base Types

## Overview

Each faction has a distinct strategic headquarters archetype that reflects their identity and gameplay role. Base Types define the unique HQ structures available exclusively to each faction, their properties, placement rules, and special mechanics. Unlike ordinary facilities which can be built anywhere, base types are fundamental to a faction's long-term survival and strategy.

## Requirements

### FR-BT-001: Faction Base Archetypes
- Each faction has exactly one base archetype, established at game start:
  - **The Union**: Secret Base — a hidden headquarters that must remain undiscovered
  - **The Brand Authority**: Sector HQ — a visible regional command center with strong defensive bonuses
  - **The Autoforge**: Outpost Network — a distributed set of forward bases across multiple systems
- Base archetypes are defined in faction configuration JSON
- Base type confers passive bonuses and special rules that apply faction-wide

### FR-BT-002: Secret Base (The Union)
- The Union starts with one Secret Base at a pre-selected or randomly placed system
- The Secret Base system is **hidden** from enemy intelligence unless actively discovered
- Secret Base properties:
  - Hidden from enemy fog-of-war by default (system appears as uncontrolled neutral)
  - Provides +25% production bonus to all resources at the system
  - Acts as the faction's strategic command center — if destroyed, Union loses access to Tier 4+ tech
- Discovery mechanics:
  - Brand Authority may accumulate discovery clues by completing Espionage missions against The Union
  - At 5 accumulated clues, the Secret Base location is revealed to Brand Authority permanently
  - The Union may relocate the Secret Base once per game at the cost of 500cr + 200mat (new location selected by player)
- If the Brand Authority captures the Secret Base system, The Union may declare a new Secret Base at any system they control (one-time recovery)

### FR-BT-003: Sector HQ (The Brand Authority)
- Brand Authority starts with 1 Sector HQ at their home system
- Additional Sector HQs may be constructed in any Brand Authority-controlled system (up to 3 total)
- Sector HQ properties:
  - Fully visible to all factions (no hidden mechanics)
  - Provides +20% production bonus to all resources at the system
  - Grants +15% combat defensive bonus to friendly fleets in the same system
  - Provides a +2 Opposition Resistance bonus for missions targeting the system
  - Acts as a regional supply hub: maintains fleet maintenance for all friendly fleets within 2 hyperspace hops
- Constructing additional Sector HQs requires: 800cr + 300mat + 4 turns at a Shipyard-equivalent facility

### FR-BT-004: Outpost Network (The Autoforge)
- The Autoforge starts with 2 Outposts distributed across their starting systems
- Additional Outposts may be constructed at any Autoforge-controlled system (no cap)
- Outpost properties:
  - Provides +10% production bonus at the system (lower per-unit bonus, higher aggregate)
  - Generates 1 Influence per turn per Outpost (Autoforge's primary Influence source)
  - Enables the `droid-interface` espionage bonus for Autoforge characters operating from this system
  - Outposts share a **Network Bonus**: for every 3 active Outposts, all Outposts gain an additional +5% production bonus (stacking)
- Outpost construction cost: 300cr + 100mat + 2 turns

### FR-BT-005: Base Destruction
- Bases may be damaged or destroyed by:
  - Successful Raid fleet commands dealing cumulative facility damage
  - Planetary invasion (system capture)
  - Sabotage missions
- Bases have a **HP** value:
  - Secret Base: 5 HP
  - Sector HQ: 8 HP
  - Outpost: 3 HP
- At 0 HP a base is destroyed and all its bonuses are lost
- Destroyed bases must be rebuilt from scratch (same cost and time as initial construction, except the Union Secret Base uses special relocation mechanics per FR-BT-002)

### FR-BT-006: Base UI
- Each faction's base(s) shall be visually distinct on the galaxy map:
  - Secret Base: Hidden icon (only visible to The Union player); star-shaped icon when revealed
  - Sector HQ: Shield icon on the system circle
  - Outpost: Small diamond icon
- Hovering a base-bearing system shows base type, HP, and active bonuses in the tooltip
- The Union player always sees their Secret Base location; other factions only see it if discovered

## Constraints

- Secret Base visibility must be enforced at the data layer, not just UI layer (cannot leak to opposing faction's data objects)
- Brand Authority may not have more than 3 Sector HQs simultaneously
- Outpost Network bonus must recalculate each turn as Outposts are built or destroyed
- Base type properties must be externalized in faction definition JSON

## Acceptance Criteria

- [x] Each faction starts with their correct base archetype at game start
- [x] Secret Base system is hidden from Brand Authority until 5 clues are accumulated (discovery clue counter tracked in ConstructionStateManager; reveal logic present)
- [x] Secret Base relocation costs 500cr+200mat and requires a player-controlled destination system (config defined; UI not yet implemented)
- [x] Brand Authority Sector HQ provides +20% production and +15% fleet defense bonus
- [x] Brand Authority cannot build more than 3 Sector HQs
- [x] Autoforge Outpost Network bonus increases by +5% for every 3 active Outposts
- [x] Bases take damage from raids, invasions, and sabotage; are destroyed at 0 HP
- [x] Destroyed bases require rebuild at full cost
- [ ] Galaxy map displays correct icons for each base type (map icon layer — deferred)
- [x] Secret Base location is never exposed in non-Union faction data structures until discovered

## Implementation Notes

- **Module**: `core/construction-state-manager.js` (`ConstructionStateManager`) — manages base instances, discovery clue counter, HP, serialization
- **Config**: `core/construction-config.json` — `baseTypes` section defines all faction base types with HP, cost, effects, maxCount
- **Engine**: `core/construction-engine.js` (`ConstructionEngine`) — `seedStartingBases()` seeds correct archetypes at game start; `addSecretBaseClue()` / `isSecretBaseDiscovered()` for Union mechanics; `getSystemBonuses()` applies production + fleet defense bonuses
- **Seeding**: Called during `initializeConstructionSystem()` in `engine/main-stage.js`
