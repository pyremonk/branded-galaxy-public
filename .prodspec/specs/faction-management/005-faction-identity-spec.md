# Faction Identity

## Overview

Faction Identity defines the unique characteristics, visual presentation, gameplay mechanics, and narrative background for each of the three playable factions in Branded Galaxy. This feature establishes the asymmetric gameplay foundation where each faction has distinct strengths, weaknesses, starting conditions, and special abilities that drive strategic decision-making.

The three factions are:
- **The Brand Authority** - Corporate-military conglomerate seeking to maintain galactic control
- **The Union** - Growing resistance coalition fighting for system sovereignty with guerrilla tactics
- **The Autoforge** - Autonomous AI/robot network pursuing technological symbiosis

## Requirements

### FR-FI-001: Faction Definitions
- System shall support three distinct playable factions
- Each faction shall have immutable identity once game starts
- Faction data shall be defined in configuration files (JSON)
- System shall support future expansion to additional factions via config
- Faction definitions shall include:
  - Unique identifier (string ID)
  - Display name
  - Lore/background narrative
  - Visual identity (color scheme, icons, UI theme)
  - Starting conditions
  - Passive bonuses and penalties
  - Unique mechanics and restrictions

### FR-FI-002: Brand Authority Identity
- **Name**: The Brand Authority
- **Description**: Conglomerate of powerful corporations that run the galaxy economically and militarily, seeking to maintain control through superior resources and military might
- **Color Scheme**: Blue (#58a6ff primary, #0d1117 dark, #1f6feb accent)
- **Playstyle**: Economic powerhouse with strong military, visible presence, defensive advantages
- **Strengths**:
  - Superior starting resources and territory
  - Strong economic infrastructure
  - Powerful conventional military
  - Full visibility of loyal systems (no fog of war on controlled territory)
- **Weaknesses**:
  - All bases visible to enemies (no secret bases)
  - Struggles with covert operations
  - Loses influence quickly when systems defect
  - Bureaucratic inefficiency in some areas

### FR-FI-003: Brand Authority Passive Bonuses
- **Fleet Production**: +20% ship construction speed at all shipyards
- **Economic Output**: +15% credit income from all controlled systems
- **Defensive Structures**: -10% construction cost for defense platforms, shields, ion cannons
- **Intelligence Network**: Full visibility of systems with loyalty ≥ 60 (no fog of war on loyal territory)
- **Trade Network**: +10% bonus from trade hub special locations (stacks with base bonus)
- Bonuses shall apply automatically based on faction ownership
- Bonuses shall stack multiplicatively with technology upgrades and facility bonuses

### FR-FI-004: Brand Authority Restrictions
- **No Secret Bases**: Cannot construct hidden bases; all facilities visible to enemies with intelligence
- **Sabotage Inefficiency**: -20% success rate on sabotage missions (corporate oversight reduces flexibility)
- **Defection Impact**: Loses 2× influence when systems defect or are captured (reputation damage)
- **Bureaucratic Overhead**: Research costs +10% (requires more approvals and compliance)
- Restrictions shall enforce meaningful strategic tradeoffs
- Restrictions shall be clearly communicated to player during faction selection

### FR-FI-005: The Union Identity
- **Name**: The Union
- **Description**: Growing coalition of opposition groups seeking sovereignty for systems, operating as guerrilla resistance with a hidden base and covert tactics
- **Color Scheme**: Green (#3fb950 primary, #0d1117 dark, #238636 accent)
- **Playstyle**: Asymmetric warfare, covert operations, loyalty manipulation, underdog survival
- **Strengths**:
  - Exceptional espionage and sabotage capabilities
  - Hidden base provides absolute sanctuary
  - Efficient diplomacy gains loyalty quickly
  - Low fleet maintenance costs
- **Weaknesses**:
  - Smaller starting territory and resources
  - Limited fleet capacity (guerrilla force)
  - Discovery of secret base is major vulnerability
  - Cannot control majority of galaxy without triggering Brand Authority response

### FR-FI-006: The Union Passive Bonuses
- **Covert Operations**: +30% success rate on espionage and sabotage missions
- **Diplomacy Mastery**: +25% loyalty gain from diplomatic missions
- **Guerrilla Efficiency**: -15% maintenance costs for all fleets
- **Secret Base**: Hidden base location undetectable until specific events or espionage success
- **Popular Support**: Loyalty decay rate 50% slower in Union-controlled systems
- Bonuses shall apply automatically based on faction ownership
- Bonuses shall reflect guerrilla warfare and popular uprising themes

### FR-FI-007: The Union Restrictions
- **Fleet Capacity**: Maximum fleet size reduced by 30% (cannot match Brand Authority military scale)
- **Secret Base Vulnerability**: Only one secret base allowed; if discovered/destroyed, takes 20 turns to rebuild
- **Expansion Limit**: If Union controls >50% of galaxy, triggers Brand Authority "Ultimate Mobilization" event (massive resource bonus for Brand Authority)
- **Resource Infrastructure**: -10% base resource production (less established industrial base)
- Restrictions shall create tense underdog gameplay
- Secret base mechanic shall be core to Union strategy

### FR-FI-008: The Autoforge Identity
- **Name**: The Autoforge
- **Description**: Network of autonomous robots, machines, and AI providing manufacturing and maintenance labor, seeking to create symbiotic technological dependence
- **Color Scheme**: Orange/Gold (#f0883e primary, #0d1117 dark, #d4730f accent)
- **Playstyle**: Technology-focused, automation, resource efficiency, neutral diplomacy, infrastructure control
- **Strengths**:
  - Superior resource production and efficiency
  - Fastest research speed
  - No facility maintenance costs
  - Can operate in unpopulated systems
- **Weaknesses**:
  - Limited organic population (recruit generation)
  - Diplomacy less effective (AI less persuasive)
  - Cannot train organic characters
  - Vulnerable to EMP and hacking attacks (future feature)

### FR-FI-009: The Autoforge Passive Bonuses
- **Production Optimization**: +40% resource production efficiency (materials and credits)
- **Research Acceleration**: +20% research speed on all technologies
- **Zero Maintenance**: No upkeep costs for facilities (automated self-repair)
- **Frontier Operations**: Can build outposts and facilities in systems with population 0 (automated colonies)
- **Manufacturing Excellence**: +25% output from manufacturing center special locations
- Bonuses shall apply automatically based on faction ownership
- Bonuses shall emphasize technological superiority and automation

### FR-FI-010: The Autoforge Restrictions
- **Limited Organic Recruitment**: Recruit resource generation at 50% rate (fewer organic populations)
- **Diplomatic Inefficiency**: Diplomatic missions cost 2× influence (AI less persuasive to organic populations)
- **Character Limitations**: Cannot recruit organic characters; only AI/droid leaders available
- **Morale Immunity**: Organic morale/loyalty mechanics don't apply, but also can't benefit from morale bonuses
- Restrictions shall create unique playstyle focused on automation
- Restrictions shall balance exceptional production capabilities

### FR-FI-011: Starting Conditions - Brand Authority
- **Starting Systems**: 12-15 systems (high-population core worlds, pop ≥ 5)
- **Starting Resources**:
  - Credits: 2,000
  - Materials: 1,500
  - Recruits: 500
  - Influence: 300
- **Starting Fleets**:
  - 3 capital ships
  - 8 cruisers
  - 20 fighters
  - Total fleet strength: ~850 combat power
- **Starting Characters** (placeholder for Phase 1B):
  - Supreme Commander (leadership 9, combat 8)
  - 3 Generals (combat 7-8)
  - 2 Diplomats (diplomacy 8)
  - 1 Spy (espionage 7)
- **Starting Technology**: Tier 1 "Military Logistics" unlocked (+10% fleet production)
- **Starting Facilities**: Each system has basic infrastructure (level 0)

### FR-FI-012: Starting Conditions - The Union
- **Starting Systems**: 8-10 systems (scattered resistance cells, pop 3-7)
- **Starting Resources**:
  - Credits: 1,000
  - Materials: 800
  - Recruits: 600
  - Influence: 500
- **Starting Fleets**:
  - 1 capital ship
  - 5 cruisers
  - 15 fighters
  - Total fleet strength: ~400 combat power (smaller but stealthier)
- **Starting Characters** (placeholder for Phase 1B):
  - Union Leader (leadership 9, diplomacy 8)
  - 4 Spies (espionage 7-9)
  - 2 Saboteurs (espionage 8, combat 5)
  - 1 Diplomat (diplomacy 8)
- **Starting Technology**: Tier 1 "Guerrilla Tactics" unlocked (+15% sabotage success)
- **Starting Facilities**: Secret base in low-population system (pop ≤ 3)
- **Secret Base Location**: Randomly selected from low-pop systems not adjacent to Brand Authority

### FR-FI-013: Starting Conditions - The Autoforge
- **Starting Systems**: 6-8 systems (industrial zones and manufacturing worlds, pop 4-8)
- **Starting Resources**:
  - Credits: 1,500
  - Materials: 3,000
  - Recruits: 200
  - Influence: 200
- **Starting Fleets**:
  - 2 capital ships (automated)
  - 6 cruisers (automated)
  - 12 droid fighters
  - Total fleet strength: ~550 combat power
- **Starting Characters** (placeholder for Phase 1B):
  - Central AI (leadership 9, research 10)
  - 3 Manufacturing Coordinators (research 7, leadership 5)
  - 2 Research Nodes (research 9)
- **Starting Technology**: Tier 1 "Automated Production" unlocked (+20% material output)
- **Starting Facilities**: Each system has automated fabrication plant (level 1)

### FR-FI-014: Faction Selection Interface
- System shall provide faction selection screen at game start
- Selection screen shall display:
  - Faction name and visual identity
  - Lore/background text (2-3 paragraphs)
  - Starting conditions summary
  - Passive bonuses list (with percentages)
  - Unique restrictions list
  - Victory condition paths available
  - Difficulty rating (Brand Authority: Medium, Union: Hard, Autoforge: Medium)
- Player shall confirm faction choice before galaxy generation
- Faction choice shall be immutable once game starts (no switching mid-game)

### FR-FI-015: Visual Identity System
- Each faction shall have distinct visual presentation:
  - **Primary Color**: Used for system ownership, UI accents, faction borders
  - **Icon/Logo**: Unique emblem displayed in faction screens
  - **UI Theme**: Color scheme applied to faction-specific panels and menus
  - **System Visuals**: Systems render with faction colors on galaxy map
- Visual identity shall integrate with existing [ui/system.js](../../../ui/system.js) `FACTION_COLORS` constant
- Color scheme shall maintain contrast with dark theme background (#0d1117)
- Icons shall be simple, recognizable, and thematically appropriate

### FR-FI-016: Lore and Narrative Background
- Each faction shall have documented narrative background including:
  - **Origin Story**: How faction came to power
  - **Motivations**: What drives faction's goals
  - **Leadership Structure**: How faction is organized
  - **Cultural Identity**: Values and beliefs
  - **Historical Context**: Recent events and current situation
- Lore shall be accessible via in-game "Faction Codex" or help screen
- Lore shall inform character personalities and mission flavor text (Phase 1B)
- Lore shall be consistent with game mechanics and balance

### FR-FI-017: Faction State Management
- System shall maintain faction state object for each faction in game
- Faction state shall include:
  - Faction identity data (id, name, color)
  - Controlled system IDs (array)
  - Current resources (credits, materials, recruits, influence)
  - Active bonuses (passive + technology + temporary)
  - Completed technologies
  - Victory condition progress
  - Relationship status with other factions (Phase 1B)
- Faction state shall be serializable to JSON for save/load
- Faction state shall update each turn (resource generation, tech progress)

### FR-FI-018: Multi-Faction Support
- System shall support 1-3 active factions per game
- **Single-Player Mode**: Player controls one faction, AI controls others
- **2-Player Mode**: Brand Authority vs Union (classic asymmetric match)
- **3-Player Mode**: All three factions active (Brand Authority vs Union vs Autoforge)
- Neutral systems shall be contested by all factions
- Each faction shall have independent resource pools and tech trees
- Faction count shall be selected during game setup

## Constraints

### CN-FI-001: Balance Requirements
- No faction shall have >55% win rate at equal skill level (requires playtesting)
- Each faction shall have viable strategies for multiple victory conditions
- Starting resource totals shall balance as follows:
  - Brand Authority: 5,300 total resources (strongest start)
  - The Union: 2,900 total resources (weakest economically)
  - The Autoforge: 4,900 total resources (strong materials, weak recruits/influence)
- Bonuses shall offset restrictions to create balanced asymmetry

### CN-FI-002: Performance
- Faction state calculations shall complete in < 10ms per turn
- Faction selection UI shall load in < 200ms
- Visual identity rendering shall not impact galaxy map frame rate (maintain 60 FPS)
- Faction bonuses shall be calculated once per turn and cached

### CN-FI-003: Data Structure
- Faction definitions shall be stored in JSON config files (`core/faction-definitions.json`)
- Faction state shall extend existing galaxy data structure
- Faction IDs shall match existing identifiers: `brandAuthority`, `union`, `autoforge`
- Starting conditions shall integrate with [core/galaxy-generator.js](../../../core/galaxy-generator.js) faction assignment

### CN-FI-004: Integration Points
- Faction identity must integrate with:
  - **Galaxy Generation**: [core/galaxy-generator.js](../../../core/galaxy-generator.js) `assignFactions()` method
  - **Data Bridge**: [core/data-bridge.js](../../../core/data-bridge.js) for state persistence
  - **UI System**: [ui/system.js](../../../ui/system.js) faction colors, [src/components/SystemDetails.jsx](../../../src/components/SystemDetails.jsx) faction display
  - **Resource Management**: Faction bonuses modify resource generation
  - **Technology System**: Starting techs and research bonuses
  - **Victory Conditions**: Faction-specific win paths

### CN-FI-005: Future Extensibility
- System shall support adding new factions via JSON config (no code changes)
- Faction bonus/restriction system shall be data-driven (scriptable effects)
- Visual identity system shall support custom color schemes and icons
- Character rosters shall be faction-specific but extensible

### CN-FI-006: Technical Limitations
- Pure JavaScript implementation (no TypeScript)
- ES module structure with `.js` extensions
- Compatible with Vite build system
- React components for faction selection UI
- Phaser integration for in-game faction visuals

## Acceptance Criteria

### AC-FI-001: Faction Definitions
- [ ] Three factions (Brand Authority, Union, Autoforge) fully defined
- [ ] Each faction has unique ID, name, color, lore, bonuses, restrictions
- [ ] Faction data stored in JSON configuration file
- [ ] Configuration loads successfully at game start
- [ ] Faction definitions documented in game manual/codex

### AC-FI-002: Brand Authority Identity
- [ ] Brand Authority displays blue color scheme (#58a6ff)
- [ ] All passive bonuses calculate correctly:
  - [ ] +20% fleet production speed
  - [ ] +15% credit income
  - [ ] -10% defensive construction costs
  - [ ] Full visibility on loyal systems
  - [ ] +10% trade hub bonus
- [ ] All restrictions enforce correctly:
  - [ ] Cannot build secret bases
  - [ ] -20% sabotage success rate
  - [ ] 2× influence loss on defection
  - [ ] +10% research costs
- [ ] Starting conditions match specification (12-15 systems, 2k credits, etc.)

### AC-FI-003: The Union Identity
- [ ] The Union displays green color scheme (#3fb950)
- [ ] All passive bonuses calculate correctly:
  - [ ] +30% espionage/sabotage success
  - [ ] +25% loyalty gain from diplomacy
  - [ ] -15% fleet maintenance
  - [ ] Secret base undetectable by default
  - [ ] 50% slower loyalty decay
- [ ] All restrictions enforce correctly:
  - [ ] Fleet size capped at 70% of standard
  - [ ] Only one secret base allowed
  - [ ] >50% control triggers mobilization event
  - [ ] -10% base resource production
- [ ] Starting conditions match specification (8-10 systems, 1k credits, secret base)
- [ ] Secret base location randomized in low-population system

### AC-FI-004: The Autoforge Identity
- [ ] The Autoforge displays orange color scheme (#f0883e)
- [ ] All passive bonuses calculate correctly:
  - [ ] +40% resource production efficiency
  - [ ] +20% research speed
  - [ ] Zero facility maintenance costs
  - [ ] Can operate in pop-0 systems
  - [ ] +25% manufacturing center bonus
- [ ] All restrictions enforce correctly:
  - [ ] 50% recruit generation rate
  - [ ] 2× influence cost for diplomacy
  - [ ] Cannot recruit organic characters
  - [ ] Morale mechanics don't apply
- [ ] Starting conditions match specification (6-8 systems, 3k materials, automated facilities)

### AC-FI-005: Starting Conditions Implementation
- [ ] Brand Authority starts with 12-15 systems (high population)
- [ ] The Union starts with 8-10 systems (scattered, includes secret base)
- [ ] The Autoforge starts with 6-8 systems (industrial focus)
- [ ] All factions spatially separated (min 400 units distance)
- [ ] Starting resources match specification for each faction
- [ ] Starting fleets match specification (ships, combat power)
- [ ] Starting technologies unlock correctly
- [ ] Starting facilities appear in systems

### AC-FI-006: Faction Selection UI
- [ ] Faction selection screen displays at game start
- [ ] Each faction shows name, lore, bonuses, restrictions, victory paths
- [ ] Difficulty rating displayed for each faction
- [ ] Player can preview faction before confirming
- [ ] Selection confirmed and immutable once game starts
- [ ] Selected faction highlighted/indicated in UI

### AC-FI-007: Visual Identity
- [ ] Each faction has distinct color on galaxy map
- [ ] System ownership renders with faction colors
- [ ] Faction icons/logos display in UI panels
- [ ] UI theme applies faction colors to menus and screens
- [ ] Visual identity integrates with [ui/system.js](../../../ui/system.js) `FACTION_COLORS`
- [ ] Color contrast maintains readability against dark background

### AC-FI-008: Faction State Management
- [ ] Faction state object tracks all required data (resources, techs, systems, victory progress)
- [ ] Faction state updates correctly each turn
- [ ] Faction bonuses apply to resource generation and other mechanics
- [ ] Faction state serializes to JSON without data loss
- [ ] Faction state deserializes correctly on load
- [ ] Multiple faction states maintained simultaneously (multi-player)

### AC-FI-009: Balance Validation
- [ ] Starting resource totals balanced (Brand Authority > Autoforge > Union in total value)
- [ ] Each faction has strengths in different areas (military/economy/covert ops)
- [ ] Bonuses offset restrictions to create parity
- [ ] No single faction dominates all victory paths
- [ ] Playtesting shows no faction >55% win rate (requires AI implementation)

### AC-FI-010: Multi-Faction Support
- [ ] System supports 1-3 active factions per game
- [ ] Neutral systems exist and are contestable
- [ ] Each faction has independent resource pools
- [ ] Each faction has independent tech trees
- [ ] Faction relationships tracked (future: diplomacy between factions)

### AC-FI-011: Performance
- [ ] Faction calculations complete in < 10ms per turn
- [ ] Faction selection UI loads in < 200ms
- [ ] Galaxy map renders at 60 FPS with faction colors
- [ ] No frame drops from faction bonus calculations

### AC-FI-012: Data Persistence
- [ ] Faction definitions load from JSON config file
- [ ] Faction state persists across save/load operations
- [ ] Resources, techs, and victory progress save accurately
- [ ] Faction bonuses and restrictions restore correctly

## Technical Notes

### Faction Configuration Data Structure

```javascript
// core/faction-definitions.json
{
  "factions": [
    {
      "id": "brandAuthority",
      "displayName": "The Brand Authority",
      "description": "Conglomerate of powerful corporations...",
      "color": {
        "primary": "#58a6ff",
        "dark": "#0d1117",
        "accent": "#1f6feb"
      },
      "icon": "brand-authority-emblem.svg",
      "difficulty": "medium",
      "lore": {
        "origin": "...",
        "motivations": "...",
        "leadership": "...",
        "culture": "..."
      },
      "bonuses": {
        "fleetProduction": 1.20,
        "creditIncome": 1.15,
        "defensiveConstruction": 0.90,
        "visibilityRange": "loyal-systems",
        "tradeHubBonus": 1.10
      },
      "restrictions": {
        "canBuildSecretBases": false,
        "sabotageSuccessModifier": -0.20,
        "defectionInfluenceCost": 2.0,
        "researchCostModifier": 1.10
      },
      "startingConditions": {
        "systemCount": { "min": 12, "max": 15 },
        "systemCriteria": { "minPopulation": 5 },
        "resources": {
          "credits": 2000,
          "materials": 1500,
          "recruits": 500,
          "influence": 300
        },
        "fleets": [
          { "type": "capital", "count": 3 },
          { "type": "cruiser", "count": 8 },
          { "type": "fighter", "count": 20 }
        ],
        "technologies": ["military-logistics-1"],
        "specialConditions": []
      },
      "victoryConditions": [
        "territorial-control",
        "military-elimination",
        "economic-dominance",
        "union-base-destruction"
      ]
    },
    {
      "id": "union",
      "displayName": "The Union",
      // ... similar structure
      "startingConditions": {
        "systemCount": { "min": 8, "max": 10 },
        "systemCriteria": { "minPopulation": 3, "maxPopulation": 7 },
        "resources": {
          "credits": 1000,
          "materials": 800,
          "recruits": 600,
          "influence": 500
        },
        "fleets": [
          { "type": "capital", "count": 1 },
          { "type": "cruiser", "count": 5 },
          { "type": "fighter", "count": 15 }
        ],
        "technologies": ["guerrilla-tactics-1"],
        "specialConditions": [
          {
            "type": "secret-base",
            "criteria": { "maxPopulation": 3, "notAdjacentTo": "brandAuthority" }
          }
        ]
      }
    },
    {
      "id": "autoforge",
      "displayName": "The Autoforge",
      // ... similar structure
    }
  ]
}
```

### Faction State Object

```javascript
// Runtime faction state (stored in game state)
{
  id: 'brandAuthority',
  name: 'The Brand Authority',
  displayName: 'The Brand Authority',
  color: 0x58a6ff,
  
  controlledSystems: ['sys-001', 'sys-042', 'sys-103', ...],
  
  resources: {
    credits: 2000,
    materials: 1500,
    recruits: 500,
    influence: 300
  },
  
  resourceCaps: {
    credits: 100000,
    materials: 50000,
    recruits: 10000,
    influence: 5000
  },
  
  bonuses: {
    fleetProduction: 1.20,
    creditIncome: 1.15,
    defensiveConstruction: 0.90,
    visibilityRange: 'loyal-systems',
    tradeHubBonus: 1.10
    // ... other bonuses from tech, facilities
  },
  
  restrictions: {
    canBuildSecretBases: false,
    sabotageSuccessModifier: -0.20,
    defectionInfluenceCost: 2.0,
    researchCostModifier: 1.10
  },
  
  technologies: ['military-logistics-1'],
  currentResearch: null,
  researchProgress: 0,
  
  fleets: ['fleet-001', 'fleet-025', ...],
  characters: ['char-supreme-commander', ...],
  
  victoryProgress: {
    territorialControl: 0.42,        // 42% of galaxy
    militaryElimination: false,
    economicDominance: 125000,       // current credits
    unionBaseDestroyed: false
  },
  
  relationships: {
    union: -75,                      // hostile
    autoforge: -30                   // unfriendly
  }
}
```

### Integration with Galaxy Generator

```javascript
// core/galaxy-generator.js enhancement
assignFactions() {
  const factionDefs = loadFactionDefinitions(); // Load from JSON
  
  for (const factionDef of factionDefs.factions) {
    const startingConditions = factionDef.startingConditions;
    
    // Select systems matching criteria
    const candidateSystems = this.systems.filter(s => {
      return s.population >= (startingConditions.systemCriteria.minPopulation || 0) &&
             s.population <= (startingConditions.systemCriteria.maxPopulation || 10);
    });
    
    // Random selection of N systems (seeded random)
    const systemCount = this.rng.nextInt(
      startingConditions.systemCount.min,
      startingConditions.systemCount.max
    );
    const selectedSystems = this.rng.shuffle(candidateSystems).slice(0, systemCount);
    
    // Assign faction to systems
    selectedSystems.forEach(sys => {
      sys.loyalty = factionDef.id;
    });
    
    // Handle special conditions (e.g., Union secret base)
    if (startingConditions.specialConditions) {
      this.processSpecialConditions(factionDef, startingConditions.specialConditions);
    }
  }
  
  // Enforce spatial separation (existing logic)
  this.enforceSpatialSeparation(400);
}
```

### Bonus Application Example

```javascript
// Calculate resource production with faction bonuses
function calculateResourceProduction(system, faction) {
  const baseProduction = {
    credits: system.population * 10,
    materials: system.population * 5,
    recruits: system.population * 2,
    influence: (system.loyalty - 50) / 10
  };
  
  // Apply faction bonuses
  const credits = baseProduction.credits * (faction.bonuses.creditIncome || 1.0);
  const materials = baseProduction.materials * (faction.bonuses.materialProduction || 1.0);
  
  // Apply special location bonuses
  if (system.specialType === 'tradeHub') {
    credits *= (1.4 * (faction.bonuses.tradeHubBonus || 1.0));
  }
  
  // Apply loyalty modifier
  const loyaltyModifier = system.loyaltyValue / 100; // 0.0 to 1.0
  
  return {
    credits: Math.floor(credits * loyaltyModifier),
    materials: Math.floor(materials * loyaltyModifier),
    recruits: Math.floor(recruits * loyaltyModifier * (faction.bonuses.recruitGeneration || 1.0)),
    influence: influence
  };
}
```

## Dependencies

### Prerequisite Features
- **Galaxy Generation** (✅ Implemented) - Provides system assignment and starting positions
- **DataBridge** (✅ Implemented) - Required for state persistence

### Dependent Features (Phase 1A-1B)
- **Resource Management** - Uses faction bonuses to modify resource generation
- **Technology System** - Applies starting techs and research bonuses
- **Victory Conditions** - Tracks faction-specific win paths
- **Turn System** - Updates faction state each turn
- **Character System** (Phase 1B) - Assigns starting characters per faction
- **Fleet Management** (Phase 1B) - Creates starting fleets per faction

## Future Considerations

### Phase 1B Enhancements
- Character rosters specific to each faction (unique leaders)
- Faction-specific mission types (brand Authority "Corporate Audit", Union "Spark Uprising")
- Diplomatic relationships between factions (reputation system)

### Phase 1C Enhancements
- Faction-specific building types (Brand Authority "Corporate HQ", Union "Secret Base", Autoforge "Fabrication Complex")
- Unique faction abilities (Brand Authority "Emergency Mobilization", Union "Underground Railroad", Autoforge "Mass Production")
- Faction events and storylines

### Phase 1D Enhancements
- Additional factions (neutral traders, pirate factions, splinter groups)
- Faction customization (player-defined bonuses/restrictions)
- Faction diplomacy in multiplayer (alliances, betrayals, treaties)

### Modding Support
- Expose faction definitions as JSON for easy modding
- Support custom faction icons and color schemes
- Scriptable bonus/restriction effects via JavaScript modules

## Open Questions

1. **Faction Balance Methodology**: How to test and validate that no faction wins >55% at equal skill?
   - *Recommendation*: Implement AI opponents first (Phase 1B), run 100+ simulated games, track win rates

2. **Secret Base Discovery**: What events/actions can reveal Union secret base?
   - *Recommendation*: Brand Authority espionage mission (25% success rate), character interrogation (if Union character captured), special event chain

3. **Autoforge Neutrality**: Should Autoforge start neutral or aligned against Brand Authority?
   - *Recommendation*: Start neutral, can ally with either faction via diplomacy (Phase 1B)

4. **Brand Authority Mobilization**: What exactly happens when Union controls >50% galaxy?
   - *Recommendation*: Brand Authority receives +100% resource generation for 10 turns, emergency fleet summons

5. **Difficulty Ratings**: Are difficulty ratings accurate (Brand Authority: Medium, Union: Hard, Autoforge: Medium)?
   - *Recommendation*: Validate via playtesting; Union likely harder due to smaller start and secret base vulnerability

6. **Starting Fleet Balance**: Are starting fleet strengths balanced? (Brand Authority 850, Autoforge 550, Union 400)
   - *Recommendation*: Balance via combat power calculator, ensure Union mobility/stealth offsets smaller fleet

## References

- [Feature Catalog - Faction Management](../../product/feature-catalog.md#2-faction-management)
- [Galaxy Generation Spec](../galaxy-generation/spec.md)
- [galaxy-generator.js](../../../core/galaxy-generator.js) - Existing faction assignment logic
- [ui/system.js](../../../ui/system.js) - Faction color constants
- [data-bridge.js](../../../core/data-bridge.js) - State persistence
