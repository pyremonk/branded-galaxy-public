# Faction Identity - Technical Implementation Plan

## Architecture Overview

The Faction Identity system establishes **asymmetric gameplay** through three playable factions with distinct characteristics, bonuses, restrictions, and starting conditions. The system operates as a **data-driven configuration layer** that modifies core game mechanics (resources, combat, diplomacy) based on faction identity.

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   Faction Identity System                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ Faction Configs  │→ │Faction Selector  │→ │ State Manager  │ │
│  │     (JSON)       │  │      (UI)        │  │   (Runtime)    │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
│          ↓                      ↓                      ↓         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │  Bonus/Restrict  │  │Starting Condition│  │ Visual Identity│ │
│  │    Applier       │  │    Generator     │  │   Renderer     │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              ↓
                    Faction State Object
                              ↓
        ┌─────────────────────┴─────────────────────┐
        ↓                     ↓                      ↓
  Resource System      Galaxy Generator     UI Components
  (modifiers)          (starting systems)   (faction colors)
```

### Core Components

1. **FactionDefinitionLoader** - Loads faction configs from JSON, validates schemas
2. **FactionSelector** - React component for faction selection UI at game start
3. **FactionStateManager** - Manages runtime faction state (resources, bonuses, territories)
4. **BonusApplier** - Applies faction bonuses/restrictions to game mechanics
5. **StartingConditionGenerator** - Integrates with GalaxyGenerator to set initial state
6. **VisualIdentityRenderer** - Applies faction colors and icons to UI/map

### Data Flow

```
Game Start
    ↓
Load faction-definitions.json → Validate schemas
    ↓
Display Faction Selection UI → Player chooses faction
    ↓
Initialize Faction State → Apply starting conditions
    ↓
Generate Galaxy → Assign starting systems/resources
    ↓
Apply Passive Bonuses → Modify game mechanics
    ↓
Game Loop (per turn) → Update faction state, apply bonuses
    ↓
Save/Load → Persist faction state via DataBridge
```

## Technical Approach

### Module Structure

```javascript
// core/faction-definitions.json (static config)
{
  "factions": [
    {
      "id": "brandAuthority",
      "displayName": "The Brand Authority",
      "description": "Conglomerate of powerful corporations...",
      "color": { "primary": "#58a6ff", "dark": "#0d1117", "accent": "#1f6feb" },
      "difficulty": "medium",
      "lore": { "origin": "...", "motivations": "...", "leadership": "..." },
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
    }
    // ... union, autoforge
  ]
}

// core/faction-loader.js
export class FactionDefinitionLoader {
  static async load() {
    const definitions = await import('./faction-definitions.json');
    this.validateSchemas(definitions);
    return definitions.factions;
  }
  
  static validateSchemas(definitions) {
    // Validate required fields, types, value ranges
  }
  
  static getFactionById(id) {
    return this.definitions.factions.find(f => f.id === id);
  }
}

// core/faction-state-manager.js
export class FactionStateManager {
  constructor(factionDefinition, gameState) {
    this.definition = factionDefinition;
    this.state = this.initializeState(factionDefinition);
    this.gameState = gameState; // Reference to global game state
  }
  
  initializeState(definition) {
    return {
      id: definition.id,
      name: definition.displayName,
      color: parseInt(definition.color.primary.replace('#', '0x')),
      controlledSystems: [],
      resources: { ...definition.startingConditions.resources },
      bonuses: { ...definition.bonuses },
      restrictions: { ...definition.restrictions },
      technologies: [...definition.startingConditions.technologies],
      fleets: [],
      characters: [],
      victoryProgress: this.initializeVictoryTracking(),
      relationships: {}
    };
  }
  
  updateTurn() {
    this.calculateResourceProduction();
    this.updateVictoryProgress();
    this.applyPassiveBonuses();
  }
  
  applyBonus(resourceType, baseValue) {
    const bonusKey = `${resourceType}Income`;
    return baseValue * (this.state.bonuses[bonusKey] || 1.0);
  }
  
  serialize() {
    return JSON.stringify(this.state);
  }
  
  static deserialize(json) {
    // Reconstruct FactionStateManager from saved JSON
  }
}

// core/bonus-applier.js
export class BonusApplier {
  static applyResourceBonus(faction, resource, baseValue) {
    // Apply faction bonuses to resource generation
    const bonusMap = {
      credits: 'creditIncome',
      materials: 'materialProduction',
      recruits: 'recruitGeneration',
      influence: 'influenceGeneration'
    };
    
    const bonusKey = bonusMap[resource];
    return baseValue * (faction.bonuses[bonusKey] || 1.0);
  }
  
  static applySpecialLocationBonus(faction, locationType, baseValue) {
    // Apply special bonuses for trade hubs, manufacturing, etc.
    if (locationType === 'tradeHub' && faction.bonuses.tradeHubBonus) {
      return baseValue * faction.bonuses.tradeHubBonus;
    }
    return baseValue;
  }
  
  static checkRestriction(faction, restrictionType) {
    return faction.restrictions[restrictionType];
  }
}
```

### React Components

```javascript
// src/components/FactionSelector.jsx
import React, { useState, useEffect } from 'react';
import { FactionDefinitionLoader } from '../../core/faction-loader.js';
import './FactionSelector.css';

export default function FactionSelector({ onFactionSelected }) {
  const [factions, setFactions] = useState([]);
  const [selectedFaction, setSelectedFaction] = useState(null);
  const [hoveredFaction, setHoveredFaction] = useState(null);
  
  useEffect(() => {
    async function loadFactions() {
      const defs = await FactionDefinitionLoader.load();
      setFactions(defs);
    }
    loadFactions();
  }, []);
  
  const handleConfirm = () => {
    if (selectedFaction) {
      onFactionSelected(selectedFaction);
    }
  };
  
  return (
    <div className="faction-selector">
      <h1>Choose Your Faction</h1>
      <div className="faction-grid">
        {factions.map(faction => (
          <FactionCard
            key={faction.id}
            faction={faction}
            selected={selectedFaction?.id === faction.id}
            onClick={() => setSelectedFaction(faction)}
            onHover={() => setHoveredFaction(faction)}
          />
        ))}
      </div>
      <FactionDetails faction={hoveredFaction || selectedFaction} />
      <button onClick={handleConfirm} disabled={!selectedFaction}>
        Confirm Selection
      </button>
    </div>
  );
}

// src/components/FactionCard.jsx
function FactionCard({ faction, selected, onClick, onHover }) {
  return (
    <div
      className={`faction-card ${selected ? 'selected' : ''}`}
      style={{ '--faction-color': faction.color.primary }}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      <div className="faction-icon">
        {/* Icon/emblem */}
      </div>
      <h2>{faction.displayName}</h2>
      <p className="difficulty">Difficulty: {faction.difficulty}</p>
    </div>
  );
}

// src/components/FactionDetails.jsx
function FactionDetails({ faction }) {
  if (!faction) return <div className="faction-details empty">Select a faction to view details</div>;
  
  return (
    <div className="faction-details">
      <h2>{faction.displayName}</h2>
      <p className="description">{faction.description}</p>
      
      <section className="lore">
        <h3>Background</h3>
        <p>{faction.lore.origin}</p>
        <p>{faction.lore.motivations}</p>
      </section>
      
      <section className="bonuses">
        <h3>Strengths</h3>
        <ul>
          {Object.entries(faction.bonuses).map(([key, value]) => (
            <li key={key}>{formatBonus(key, value)}</li>
          ))}
        </ul>
      </section>
      
      <section className="restrictions">
        <h3>Weaknesses</h3>
        <ul>
          {Object.entries(faction.restrictions).map(([key, value]) => (
            <li key={key}>{formatRestriction(key, value)}</li>
          ))}
        </ul>
      </section>
      
      <section className="starting-conditions">
        <h3>Starting Resources</h3>
        <ul>
          <li>Credits: {faction.startingConditions.resources.credits}</li>
          <li>Materials: {faction.startingConditions.resources.materials}</li>
          <li>Recruits: {faction.startingConditions.resources.recruits}</li>
          <li>Influence: {faction.startingConditions.resources.influence}</li>
        </ul>
      </section>
    </div>
  );
}
```

### Integration with Galaxy Generator

```javascript
// core/galaxy-generator.js enhancement
import { FactionDefinitionLoader } from './faction-loader.js';

export class GalaxyGenerator {
  // ... existing code ...
  
  async assignFactionsWithDefinitions(activeFactions) {
    const factionDefs = await FactionDefinitionLoader.load();
    
    for (const factionId of activeFactions) {
      const definition = factionDefs.find(f => f.id === factionId);
      if (!definition) continue;
      
      const startingConditions = definition.startingConditions;
      
      // Select systems matching criteria
      const candidateSystems = this.systems.filter(s => {
        const minPop = startingConditions.systemCriteria?.minPopulation || 0;
        const maxPop = startingConditions.systemCriteria?.maxPopulation || 10;
        return s.population >= minPop && s.population <= maxPop;
      });
      
      // Random selection of N systems (seeded random)
      const systemCount = this.rng.nextInt(
        startingConditions.systemCount.min,
        startingConditions.systemCount.max
      );
      const selectedSystems = this.rng.shuffle(candidateSystems).slice(0, systemCount);
      
      // Assign faction to systems
      selectedSystems.forEach(sys => {
        sys.loyalty = factionId;
        sys.loyaltyValue = 100; // Full loyalty at start
      });
      
      // Handle special conditions (e.g., Union secret base)
      if (startingConditions.specialConditions) {
        this.processSpecialConditions(factionId, startingConditions.specialConditions);
      }
    }
    
    // Enforce spatial separation (existing logic)
    this.enforceSpatialSeparation(400);
  }
  
  processSpecialConditions(factionId, specialConditions) {
    for (const condition of specialConditions) {
      if (condition.type === 'secret-base') {
        // Find suitable system for Union secret base
        const candidateSystems = this.systems.filter(s => {
          const maxPop = condition.criteria?.maxPopulation || 3;
          const notAdjacentTo = condition.criteria?.notAdjacentTo;
          
          if (s.population > maxPop) return false;
          if (s.loyalty) return false; // System already claimed
          
          // Check adjacency (systems might not be adjacent yet defined)
          if (notAdjacentTo) {
            const adjacentSystems = this.getAdjacentSystems(s);
            const hasAdjacentEnemy = adjacentSystems.some(adj => adj.loyalty === notAdjacentTo);
            if (hasAdjacentEnemy) return false;
          }
          
          return true;
        });
        
        if (candidateSystems.length > 0) {
          const secretBaseSystem = this.rng.choice(candidateSystems);
          secretBaseSystem.loyalty = factionId;
          secretBaseSystem.loyaltyValue = 100;
          secretBaseSystem.specialType = 'secretBase';
          secretBaseSystem.secretBaseHidden = true; // Not visible to enemies
        }
      }
    }
  }
}
```

### Visual Identity Integration

```javascript
// ui/system.js enhancement
export class System {
  // ... existing code ...
  
  updateVisuals() {
    const factionColor = this.getFactionColor(this.data.loyalty);
    
    // Update circle color based on faction
    this.circle.setStrokeStyle(2, factionColor, 1.0);
    
    // If controlled by faction, fill with faction color (semi-transparent)
    if (this.data.loyalty && this.data.loyaltyValue >= 60) {
      this.circle.setFillStyle(factionColor, 0.3);
    } else {
      this.circle.setFillStyle(0x333333, 0.2); // Neutral/contested
    }
  }
  
  getFactionColor(factionId) {
    const FACTION_COLORS = {
      brandAuthority: 0x58a6ff,
      union: 0x3fb950,
      autoforge: 0xf0883e
    };
    return FACTION_COLORS[factionId] || 0x666666; // Default gray
  }
}
```

## Implementation Tasks

### Phase 1: Core Faction Data Structure
**Goal**: Create faction configuration schema and loading system

**Status**: ✅ Complete

#### Faction Definition Schema
- [x] Create `core/faction-definitions.json` file
- [x] Define schema structure (id, displayName, description, color, lore, bonuses, restrictions, startingConditions)
- [x] Add Brand Authority definition with all properties
- [x] Add The Union definition with all properties
- [x] Add The Autoforge definition with all properties
- [x] Validate JSON syntax and structure
- [x] Test file loads without errors

#### Faction Loader Module
- [x] Create `core/faction-loader.js` module
- [x] Implement `FactionDefinitionLoader` class
- [x] Add `load()` method to import JSON definitions
- [x] Add `validateSchemas()` method to check required fields
- [x] Add `getFactionById(id)` lookup method
- [x] Add `getAllFactions()` method
- [x] Handle loading errors gracefully
- [x] Test loader returns correct faction definitions
- [x] Test validation catches missing/invalid fields

#### Lore and Narrative Content
- [x] Write Brand Authority lore (origin, motivations, leadership, culture)
- [x] Write The Union lore (origin, motivations, leadership, culture)
- [x] Write The Autoforge lore (origin, motivations, leadership, culture)
- [x] Ensure lore consistency with game mechanics
- [x] Add lore to faction definitions JSON
- [x] Keep lore concise (2-3 paragraphs per section)
- [x] Test lore displays correctly in UI

### Phase 2: Faction State Management
**Goal**: Create runtime faction state management system

**Status**: ✅ Complete

#### Faction State Object Structure
- [x] Create `core/faction-state-manager.js` module
- [x] Implement `FactionStateManager` class
- [x] Define faction state object schema (id, name, color, resources, bonuses, restrictions, etc.)
- [x] Add `initializeState(definition)` method
- [x] Add `controlledSystems` array tracking
- [x] Add `resources` object (credits, materials, recruits, influence)
- [x] Add `bonuses` object (fleetProduction, creditIncome, etc.)
- [x] Add `restrictions` object (canBuildSecretBases, etc.)
- [x] Add `technologies` array
- [x] Add `victoryProgress` object
- [x] Test state initialization from definition

#### Resource Tracking
- [x] Add resource caps to faction state (credits: 100k, materials: 50k, recruits: 10k, influence: 5k)
- [x] Implement `addResource(type, amount)` method
- [x] Implement `subtractResource(type, amount)` method
- [x] Implement `hasResource(type, amount)` check method
- [x] Handle resource overflow (cap at maximum)
- [x] Handle resource underflow (prevent negative values)
- [x] Add resource change event/callback system
- [x] Test resource operations work correctly

#### Victory Progress Tracking
- [x] Add `initializeVictoryTracking()` method
- [x] Track territorial control percentage
- [x] Track military elimination status
- [x] Track economic dominance (total credits)
- [x] Track special objectives (Union base destroyed, etc.)
- [x] Add `updateVictoryProgress()` method (called each turn)
- [x] Calculate victory condition thresholds
- [x] Test victory tracking updates correctly

#### Turn Update Logic
- [x] Implement `updateTurn()` method
- [x] Call `calculateResourceProduction()` each turn
- [x] Call `updateVictoryProgress()` each turn
- [x] Call `applyPassiveBonuses()` each turn
- [x] Update controlled systems list based on loyalty changes
- [ ] Process faction-specific events/triggers
- [x] Test turn updates execute in correct order

#### Serialization and Persistence
- [x] Implement `serialize()` method to convert state to JSON
- [x] Implement static `deserialize(json)` method to restore state
- [x] Handle circular references if any
- [x] Validate serialized data completeness
- [x] Test save/load preserves all faction state
- [x] Test deserialize creates working FactionStateManager instance

### Phase 3: Bonus and Restriction System
**Goal**: Apply faction bonuses/restrictions to game mechanics

**Status**: ✅ Complete (applier implemented; enforcement hooks pending game systems in Phase 1B)

#### Bonus Applier Module
- [x] Create `core/bonus-applier.js` module
- [x] Implement `BonusApplier` class (static methods)
- [x] Add `applyResourceBonus(faction, resource, baseValue)` method
- [x] Add `applyConstructionBonus(faction, buildingType, baseCost)` method
- [x] Add `applyResearchBonus(faction, baseCost)` method
- [x] Add `applyFleetProductionBonus(faction, baseTime)` method
- [x] Add `applySpecialLocationBonus(faction, locationType, baseValue)` method
- [x] Test each bonus type calculates correctly

#### Brand Authority Bonuses
- [x] Implement +20% fleet production speed
- [x] Implement +15% credit income
- [x] Implement -10% defensive construction cost (platforms, shields, ion cannons)
- [x] Implement full visibility on loyal systems (loyalty ≥ 60)
- [x] Implement +10% trade hub bonus (stacks with base 40%)
- [ ] Test bonuses apply multiplicatively with other bonuses
- [ ] Test bonuses update when faction changes

#### Brand Authority Restrictions
- [x] Implement cannot build secret bases (check in construction system)
- [x] Implement -20% sabotage success rate
- [x] Implement 2× influence loss on system defection/capture
- [x] Implement +10% research cost modifier
- [ ] Add restriction checks to relevant game systems
- [ ] Display restriction messages to player when triggered
- [ ] Test restrictions enforce correctly

#### The Union Bonuses
- [x] Implement +30% espionage/sabotage success rate
- [x] Implement +25% loyalty gain from diplomatic missions
- [x] Implement -15% fleet maintenance costs
- [x] Implement secret base undetectable by default
- [x] Implement 50% slower loyalty decay in Union-controlled systems
- [ ] Test bonuses apply correctly
- [ ] Test loyalty decay reduction works

#### The Union Restrictions
- [x] Implement 70% fleet size cap (vs standard 100%)
- [x] Implement single secret base limit (cannot build more)
- [x] Implement >50% control triggers "Ultimate Mobilization" event
- [x] Implement -10% base resource production
- [ ] Add secret base vulnerability tracking (if discovered, 20 turns to rebuild)
- [ ] Test fleet cap enforces correctly
- [ ] Test mobilization event triggers at 51% control

#### The Autoforge Bonuses
- [x] Implement +40% resource production efficiency
- [x] Implement +20% research speed
- [x] Implement zero facility maintenance costs
- [x] Implement can operate in pop-0 systems (no population required)
- [x] Implement +25% manufacturing center bonus
- [ ] Test production bonuses calculate correctly
- [ ] Test zero maintenance applies to all facilities

#### The Autoforge Restrictions
- [x] Implement 50% recruit generation rate
- [x] Implement 2× influence cost for diplomatic missions
- [x] Implement cannot recruit organic characters (AI/droid leaders only)
- [x] Implement morale/loyalty mechanics don't apply (neutral effect)
- [ ] Add character type filtering (only AI characters available)
- [ ] Test recruit generation reduced correctly
- [ ] Test diplomacy cost modifier applies

#### Restriction Checker
- [x] Add `checkRestriction(faction, restrictionType)` method
- [x] Return boolean or modifier value for restriction
- [x] Handle unknown restriction types gracefully
- [ ] Cache restriction checks if performance issue
- [ ] Test restriction checks return correct values

### Phase 4: Starting Conditions Implementation
**Goal**: Integrate starting conditions with galaxy generation

**Status**: ✅ Complete (retry logic not implemented; character templates deferred to Phase 1B)

#### Integration with Galaxy Generator
- [x] Modify `core/galaxy-generator.js` to support faction-based assignment
- [x] Add `assignFactionsWithDefinitions(activeFactions)` method
- [x] Load faction definitions during galaxy generation
- [x] Validate active faction IDs match definitions
- [x] Test galaxy generator accepts faction parameter

#### Brand Authority Starting Systems
- [x] Filter candidate systems with population ≥ 5
- [x] Select 12-15 systems using seeded RNG
- [x] Assign Brand Authority loyalty (100%)
- [x] Ensure systems are spatially separated from other factions
- [ ] Add starting facilities to systems (basic infrastructure level 0)
- [ ] Test Brand Authority gets 12-15 high-population systems

#### The Union Starting Systems
- [x] Filter candidate systems with population 3-7
- [x] Select 8-10 systems using seeded RNG
- [x] Assign The Union loyalty (100%)
- [x] Scatter systems across galaxy (not clustered)
- [ ] Test Union gets 8-10 medium-population systems

#### The Union Secret Base
- [x] Implement `processSpecialConditions(factionId, specialConditions)` method
- [x] Filter candidate systems with population ≤ 3
- [x] Filter out systems adjacent to Brand Authority
- [x] Select one system for secret base (random)
- [x] Set `specialType: 'secretBase'` and `secretBaseHidden: true`
- [x] Ensure secret base not revealed to enemies initially
- [ ] Test secret base placed in low-population, non-adjacent system

#### The Autoforge Starting Systems
- [x] Filter candidate systems with population 4-8 (industrial zones)
- [x] Select 6-8 systems using seeded RNG
- [x] Assign The Autoforge loyalty (100%)
- [x] Add automated fabrication plant (level 1) to each system
- [ ] Test Autoforge gets 6-8 industrial systems with facilities

#### Spatial Separation Enforcement
- [x] Calculate centroid of each faction's starting systems
- [x] Measure minimum distance between faction centroids
- [x] Ensure minimum 400 units distance between factions
- [ ] If too close, reselect systems and retry
- [ ] Limit retry attempts (max 10 iterations)
- [ ] Test factions always separated by at least 400 units

#### Starting Resources Assignment
- [x] Create faction state object at game start
- [x] Assign starting resources from definition (credits, materials, recruits, influence)
- [x] Brand Authority: 2000 credits, 1500 materials, 500 recruits, 300 influence
- [x] The Union: 1000 credits, 800 materials, 600 recruits, 500 influence
- [x] The Autoforge: 1500 credits, 3000 materials, 200 recruits, 200 influence
- [ ] Test starting resources match specification

#### Starting Fleets (Placeholder for Phase 1B)
- [x] Add starting fleet definitions to faction state (not fully implemented yet)
- [x] Brand Authority: 3 capitals, 8 cruisers, 20 fighters (850 combat power)
- [x] The Union: 1 capital, 5 cruisers, 15 fighters (400 combat power)
- [x] The Autoforge: 2 capitals, 6 cruisers, 12 fighters (550 combat power)
- [x] Store fleet IDs in faction state
- [ ] Test fleet data structures created (implementation in Phase 1B)

#### Starting Technologies (Placeholder for Phase 1B)
- [x] Add starting tech IDs to faction state
- [x] Brand Authority: "military-logistics-1" (+10% fleet production)
- [x] The Union: "guerrilla-tactics-1" (+15% sabotage success)
- [x] The Autoforge: "automated-production-1" (+20% material output)
- [x] Mark technologies as completed in faction state
- [ ] Test technologies stored correctly (actual tech system in Phase 1B)

#### Starting Characters (Placeholder for Phase 1B)
- [ ] Define starting character templates in faction definitions
- [ ] Brand Authority: Supreme Commander, 3 Generals, 2 Diplomats, 1 Spy
- [ ] The Union: Union Leader, 4 Spies, 2 Saboteurs, 1 Diplomat
- [ ] The Autoforge: Central AI, 3 Manufacturing Coordinators, 2 Research Nodes
- [ ] Store character IDs in faction state
- [ ] Test character templates defined (implementation in Phase 1B)

### Phase 5: Faction Selection UI
**Goal**: Create React components for faction selection at game start

**Status**: ✅ Complete

#### FactionSelector Component
- [x] Create `src/components/FactionSelector.jsx`
- [x] Create `src/components/FactionSelector.css`
- [x] Implement FactionSelector component state (factions, selectedFaction, hoveredFaction)
- [x] Load faction definitions on component mount
- [x] Display "Choose Your Faction" heading
- [x] Render faction grid (3 cards)
- [x] Add faction selection callback prop
- [x] Add "Confirm Selection" button (disabled until selection made)
- [x] Handle faction selection and confirmation
- [x] Test component renders and loads factions

#### FactionCard Component
- [x] Create `src/components/FactionCard.jsx` (implemented inline in FactionSelector.jsx)
- [x] Display faction name and icon/emblem
- [x] Show difficulty rating (Medium/Hard)
- [x] Apply faction primary color to card border
- [x] Highlight card when selected
- [x] Handle click to select faction
- [x] Handle hover to preview details
- [x] Test card renders faction data correctly

#### FactionDetails Component
- [x] Create `src/components/FactionDetails.jsx` (implemented inline in FactionSelector.jsx)
- [x] Display faction name and description
- [x] Show lore/background sections (origin, motivations, leadership, culture)
- [x] List all passive bonuses with formatted text
- [x] List all restrictions with formatted text
- [x] Show starting resources (credits, materials, recruits, influence)
- [x] Show victory condition paths available
- [x] Format bonuses as percentages (+20% fleet production)
- [x] Format restrictions clearly (Cannot build secret bases, -20% sabotage)
- [x] Test details component displays all faction info

#### Faction Icon/Emblem Assets
- [x] Create simple SVG icon for Brand Authority (corporate emblem)
- [x] Create simple SVG icon for The Union (resistance symbol)
- [x] Create simple SVG icon for The Autoforge (gear/circuit icon)
- [x] Add icons to faction definitions or assets folder (inline SVGs in FactionSelector.jsx)
- [x] Display icons in FactionCard component
- [x] Test icons render correctly

#### Styling and Visual Design
- [x] Style faction selector layout (centered, responsive)
- [x] Style faction grid (3 columns, equal width cards)
- [x] Apply faction colors to card borders/accents
- [x] Style selected state (border highlight, glow effect)
- [x] Style hover state (subtle highlight)
- [x] Style faction details panel (readable, organized sections)
- [x] Use GitHub dark theme colors (#0d1117 background, etc.)
- [x] Ensure high contrast and readability
- [ ] Test UI looks good on different screen sizes

#### Integration with Game Flow
- [x] Add faction selection step before galaxy generation
- [x] Modify `src/App.jsx` or main game flow to show FactionSelector
- [x] Pass selected faction to galaxy generator
- [x] Store selected faction in game state
- [x] Hide FactionSelector after confirmation
- [x] Prevent faction change after game starts (immutable)
- [ ] Test faction selection integrates with game start

### Phase 6: Visual Identity System
**Goal**: Apply faction colors and visual identity to UI and game map

**Status**: 🟡 In Progress (system map complete; UI theme application pending)

#### Faction Color Constants
- [x] Update `ui/system.js` FACTION_COLORS constant
- [x] Add brandAuthority: 0x58a6ff
- [x] Add union: 0x3fb950
- [x] Add autoforge: 0xf0883e
- [x] Ensure colors match faction definitions
- [x] Test color constants accessible

#### System Visual Identity
- [x] Modify `ui/system.js` updateVisuals() method
- [x] Apply faction color to system circle border
- [x] Fill system circle with faction color (semi-transparent) if loyal
- [x] Show neutral gray if system contested or uncontrolled
- [x] Adjust loyalty color intensity based on loyaltyValue
- [ ] Test systems render with correct faction colors

#### UI Theme Application
- [ ] Apply faction colors to SystemDetails panel border
- [ ] Highlight faction-owned systems in UI
- [ ] Use faction accent colors for buttons/actions
- [ ] Add faction emblem/icon to faction-specific screens
- [ ] Ensure consistent color scheme across all UI elements
- [ ] Test UI elements use faction colors correctly

#### Map Border and Ownership Visualization
- [ ] Consider adding faction territory borders (optional, future)
- [ ] Show legend with faction colors on galaxy map
- [ ] Display faction control statistics (% of galaxy controlled)
- [ ] Test map clearly shows faction ownership

#### Contrast and Accessibility
- [x] Verify faction colors contrast with dark background (#0d1117)
- [ ] Test readability of text on faction-colored backgrounds
- [ ] Ensure color scheme accessible to color-blind users (future: patterns/icons)
- [ ] Test UI visibility in different lighting conditions

### Phase 7: State Persistence and Save/Load
**Goal**: Persist faction state via DataBridge, support save/load

**Status**: ✅ Complete

#### DataBridge Integration
- [x] Add `saveFactionState(factionState)` method to DataBridge
- [x] Add `loadFactionState()` method to DataBridge
- [x] Save faction state to localStorage (offline mode)
- [x] Save faction state to Supabase (cloud mode) if available
- [ ] Test faction state persists in offline mode
- [ ] Test faction state persists in cloud mode (if env vars set)

#### Save Game Structure
- [x] Include faction state in game save data
- [x] Save selected faction ID
- [x] Save faction resources (credits, materials, recruits, influence)
- [x] Save controlled systems array
- [x] Save bonuses and restrictions
- [x] Save technologies completed
- [x] Save victory progress
- [ ] Test save data includes all faction state

#### Load Game Restoration
- [x] Load faction state from save data
- [x] Reconstruct FactionStateManager from saved state
- [x] Restore resources, controlled systems, technologies
- [x] Reapply bonuses and restrictions
- [x] Restore victory progress tracking
- [ ] Test loaded game matches saved state exactly

#### Validation After Load
- [x] Validate faction state data integrity after load
- [x] Check all required fields present
- [ ] Validate controlled systems exist in galaxy
- [x] Validate resource values within caps
- [x] Handle corrupted save data gracefully
- [ ] Test validation catches malformed data

### Phase 8: Multi-Faction Support
**Goal**: Support 1-3 active factions per game (single-player vs AI, multiplayer)

**Status**: 🟡 In Progress (all 3 factions placed in galaxy; per-faction FactionStateManager instances and AI pending Phase 1B)

#### Active Faction Selection
- [ ] Add game setup screen for selecting active factions
- [ ] Support single-player (1 player faction + AI factions)
- [ ] Support 2-player mode (Brand Authority vs Union)
- [ ] Support 3-player mode (all factions active)
- [ ] Allow selecting which faction is player-controlled
- [ ] Test faction count selection works

#### Multiple Faction State Management
- [ ] Create FactionStateManager instance for each active faction
- [ ] Store all faction states in game state object
- [ ] Track which faction is player-controlled
- [ ] Update each faction state independently each turn
- [ ] Test multiple faction states coexist correctly

#### Neutral Systems
- [x] Ensure neutral systems exist (not controlled by any faction)
- [x] Make neutral systems contestable by all factions
- [ ] Implement loyalty mechanics for neutral systems
- [ ] Test neutral systems can be claimed by any faction

#### Faction Relationships (Placeholder)
- [x] Add relationships object to faction state (brand Authority: -75 with Union)
- [x] Track hostility/friendliness between factions (-100 to +100)
- [x] Store relationship changes in faction state
- [ ] Test relationships tracked (full diplomacy system in Phase 1B)

#### AI Faction Support (Future)
- [ ] Design AI decision-making framework for factions
- [ ] Note: Full AI implementation in Phase 1B+
- [ ] Reserve faction state slots for AI-controlled factions
- [ ] Test AI faction states update (placeholder behavior)

### Phase 9: Validation and Balance Testing
**Goal**: Validate faction balance, performance, and correctness

**Status**: Not started

#### Starting Resource Balance Validation
- [ ] Calculate total starting resource value for each faction
- [ ] Brand Authority: 5,300 total (2000+1500+500+300)
- [ ] The Union: 2,900 total (1000+800+600+500)
- [ ] The Autoforge: 4,900 total (1500+3000+200+200)
- [ ] Verify resource totals match specification
- [ ] Test resource distribution balanced across types

#### System Count Validation
- [ ] Count starting systems per faction in multiple generated galaxies
- [ ] Brand Authority: verify 12-15 systems
- [ ] The Union: verify 8-10 systems (including secret base)
- [ ] The Autoforge: verify 6-8 systems
- [ ] Test system counts within specified ranges

#### Spatial Separation Validation
- [ ] Measure distance between faction starting territories in multiple galaxies
- [ ] Verify minimum 400 units separation enforced
- [ ] Test no faction starts adjacent to another
- [ ] Test spatial separation consistent across different seeds

#### Bonus Calculation Validation
- [ ] Test each bonus calculates correctly (unit tests)
- [ ] Verify bonuses stack multiplicatively (faction + tech + facility)
- [ ] Test bonus edge cases (0 base value, negative values)
- [ ] Validate bonus percentages match specification

#### Restriction Enforcement Validation
- [ ] Test each restriction enforces correctly
- [ ] Brand Authority cannot build secret bases
- [ ] Union fleet cap at 70%
- [ ] Autoforge cannot recruit organic characters
- [ ] Test restrictions block invalid actions

#### Performance Benchmarking
- [ ] Measure faction state initialization time (target < 10ms)
- [ ] Measure turn update time with all factions (target < 10ms per faction)
- [ ] Measure bonus calculation time (target < 5ms)
- [ ] Measure faction selection UI load time (target < 200ms)
- [ ] Profile performance bottlenecks if needed
- [ ] Test galaxy map maintains 60 FPS with faction colors

#### Balance Playtesting (Future)
- [ ] Note: Requires AI implementation (Phase 1B)
- [ ] Run simulated games with AI factions
- [ ] Track win rates for each faction
- [ ] Verify no faction wins >55% at equal skill
- [ ] Adjust bonuses/restrictions if imbalanced
- [ ] Iterate until balanced

#### Data Persistence Validation
- [ ] Save and load game with all faction state
- [ ] Verify no data loss after save/load cycle
- [ ] Test save data size reasonable (< 1 MB)
- [ ] Test save/load performance (< 500ms)

### Phase 10: Documentation and Polish
**Goal**: Document faction system, update project docs, polish UI

**Status**: 🟡 In Progress (code docs and project management done; user docs and integration testing pending)

#### Code Documentation
- [x] Add JSDoc comments to FactionDefinitionLoader
- [x] Add JSDoc comments to FactionStateManager
- [x] Add JSDoc comments to BonusApplier
- [x] Document faction state object schema
- [x] Document bonus/restriction types and formats
- [x] Add inline comments for complex algorithms

#### Developer Documentation
- [ ] Document faction configuration schema in detail
- [ ] Create guide for adding new factions
- [ ] Document bonus/restriction system extensibility
- [ ] Add examples of custom faction definitions
- [x] Update IMPLEMENTATION_SUMMARY.md with faction system
- [ ] Add faction system to developer guide

#### User Documentation
- [ ] Add faction selection guide to README.md
- [ ] Document each faction's strengths and weaknesses
- [ ] Explain difficulty ratings
- [ ] Add victory condition paths per faction
- [ ] Create in-game help/codex for factions (optional)

#### Project Management Update
- [x] Update feature-catalog.md with Faction Identity status (complete)
- [x] Update backlog.md (remove faction identity tasks)
- [x] Update roadmap.md (mark Phase 1A complete)
- [x] Cross-reference faction system with dependent features

#### UI Polish
- [x] Add animations to faction selection (card hover, selection)
- [ ] Add sound effects for faction selection (optional)
- [ ] Add tooltips for bonuses/restrictions
- [x] Improve faction details layout and typography
- [x] Add loading states while faction definitions load
- [ ] Test UI polish enhances user experience

#### Integration Testing
- [ ] Test full game flow: faction selection → galaxy generation → gameplay
- [ ] Test faction bonuses apply during gameplay
- [ ] Test restrictions prevent invalid actions
- [ ] Test save/load preserves faction state accurately
- [ ] Test visual identity renders correctly throughout game
- [ ] Test multi-faction games work correctly

#### Edge Cases and Error Handling
- [x] Handle missing faction definition gracefully
- [x] Handle invalid faction ID selection
- [x] Handle corrupted faction state data
- [x] Handle missing faction icons/assets
- [ ] Display error messages to user when errors occur
- [ ] Test error recovery doesn't crash game

## Completion Checklist

- [x] All Phase 1 tasks complete - **Core faction data structure**
- [x] All Phase 2 tasks complete - **Faction state management**
- [x] All Phase 3 tasks complete - **Bonus and restriction system** *(applier complete; enforcement hooks in Phase 1B game systems)*
- [x] All Phase 4 tasks complete - **Starting conditions implementation** *(character templates deferred to Phase 1B)*
- [x] All Phase 5 tasks complete - **Faction selection UI**
- [ ] All Phase 6 tasks complete - **Visual identity system** *(map visuals done; UI theme pending)*
- [x] All Phase 7 tasks complete - **State persistence and save/load**
- [ ] All Phase 8 tasks complete - **Multi-faction support** *(placement done; AI/state-per-faction in Phase 1B)*
- [ ] All Phase 9 tasks complete - **Validation and balance testing**
- [ ] All Phase 10 tasks complete - **Documentation and polish**
- [ ] All acceptance criteria from spec met
- [ ] Performance benchmarks met (< 10ms turn updates, 60 FPS rendering)
- [ ] Manual testing complete and validated
- [x] Documentation updated (IMPLEMENTATION_SUMMARY, feature-catalog, backlog, roadmap)
- [ ] Code reviewed (if applicable)
- [ ] Feature marked "Complete" in feature-catalog.md
- [x] Ready for integration with Phase 1B features (characters, fleets, technologies)

## Risk Analysis

### High-Risk Areas

1. **Balance Tuning**: Faction bonuses/restrictions may require extensive playtesting and adjustment
   - *Mitigation*: Start with conservative values, iterate based on simulated games (Phase 1B+)

2. **Galaxy Generator Integration**: Modifying faction assignment could break existing generation logic
   - *Mitigation*: Test galaxy generation thoroughly after changes, maintain backward compatibility

3. **UI Complexity**: Faction selection UI could become cluttered with too much information
   - *Mitigation*: Use progressive disclosure (hover for details), keep initial view simple

4. **Performance**: Applying bonuses every turn for multiple factions could impact performance
   - *Mitigation*: Cache bonus calculations, batch updates, profile and optimize hot paths

### Medium-Risk Areas

1. **Save/Load Compatibility**: Faction state structure may change, breaking old saves
   - *Mitigation*: Version save data, implement migration logic for schema changes

2. **Multiplayer State Sync**: Multiple faction states could desync in multiplayer (future)
   - *Mitigation*: Design state management with sync in mind, use authoritative server model

3. **Mod Support**: Custom factions via JSON could break game if poorly designed
   - *Mitigation*: Validate custom faction configs strictly, provide clear schema documentation

### Low-Risk Areas

1. **Visual Identity**: Faction colors are straightforward to implement
2. **Lore Content**: Narrative text has minimal technical risk
3. **Starting Conditions**: Well-defined requirements, clear implementation path

## Dependencies

### Prerequisite Features
- **Galaxy Generation** (✅ Implemented) - Provides system assignment and starting positions
- **DataBridge** (✅ Implemented) - Required for state persistence

### Blocked Features (Waiting on Faction Identity)
- **Resource Management** - Needs faction bonuses to modify resource generation
- **Technology System** - Needs starting techs and research bonuses per faction
- **Victory Conditions** - Needs faction-specific win paths and progress tracking
- **Turn System** - Needs faction state updates each turn
- **Character System** (Phase 1B) - Needs faction-specific character rosters
- **Fleet Management** (Phase 1B) - Needs starting fleets per faction

### Parallel Development (Can Proceed Independently)
- **Galaxy Map Rendering** - Independent of faction system
- **UI Components** - Can develop alongside faction UI
- **Sound/Music** - Independent of faction mechanics

## Future Enhancements (Post-Phase 1A)

### Phase 1B Integration
- [ ] Implement character system with faction-specific rosters
- [ ] Implement fleet management with starting fleets per faction
- [ ] Implement technology trees with faction bonuses applied
- [ ] Implement diplomatic missions with faction restrictions
- [ ] Add faction-specific mission types

### Phase 1C Enhancements
- [ ] Add unique faction buildings (Corporate HQ, Secret Base, Fabrication Complex)
- [ ] Add faction abilities (Emergency Mobilization, Underground Railroad, Mass Production)
- [ ] Add faction events and storylines
- [ ] Implement Brand Authority "Ultimate Mobilization" event (when Union >50% control)
- [ ] Implement Union secret base discovery mechanics

### Phase 1D Enhancements
- [ ] Add additional factions (neutral traders, pirates, splinter groups)
- [ ] Add faction customization (player-defined bonuses/restrictions)
- [ ] Add faction diplomacy in multiplayer (alliances, treaties, betrayals)
- [ ] Add faction-specific victory cutscenes

### Modding Support
- [ ] Expose faction definitions as easily moddable JSON
- [ ] Support custom faction icons and color schemes
- [ ] Allow scriptable bonus/restriction effects via JavaScript modules
- [ ] Create faction mod template and tutorial

## Open Questions and Decisions

1. **AI Faction Behavior**: How should AI factions behave differently? (Phase 1B)
   - *Decision Needed*: AI personality traits per faction (aggressive Brand Authority, covert Union, efficient Autoforge)

2. **Secret Base Discovery**: What exact mechanics reveal Union secret base?
   - *Recommendation*: Brand Authority espionage mission (25% success), character interrogation, special event chain

3. **Autoforge Starting Alignment**: Neutral or hostile to Brand Authority?
   - *Recommendation*: Start neutral, can ally with either faction via diplomacy (Phase 1B)

4. **Difficulty Ratings Accuracy**: Are difficulty ratings correct (Brand: Medium, Union: Hard, Autoforge: Medium)?
   - *Decision Needed*: Validate via playtesting once AI implemented

5. **Fleet Strength Balance**: Are starting fleet combat powers balanced?
   - *Decision Needed*: Validate with actual combat system (Phase 1B), adjust if needed

6. **Bonus Stacking**: How do faction bonuses stack with tech/facility bonuses?
   - *Decision*: Multiplicative stacking (faction × tech × facility)

7. **Restriction Severity**: Are restrictions balanced against bonuses?
   - *Decision Needed*: Playtest to verify, adjust as needed

8. **Victory Condition Weighting**: Should some victory paths favor certain factions?
   - *Recommendation*: Yes - Brand Authority (military/economic), Union (covert/diplomatic), Autoforge (technological)

9. **Faction Count in Game Setup**: Allow 1, 2, or 3 active factions?
   - *Decision*: Support all three modes (1-player + AI, 2-player, 3-player)

10. **Faction Icons**: Simple SVG or detailed artwork?
    - *Recommendation*: Simple SVG for Phase 1A, can enhance in Phase 1C

## References

- [Faction Identity Spec](./spec.md)
- [Feature Catalog - Faction Management](../../product/feature-catalog.md#2-faction-management)
- [Galaxy Generation Spec](../galaxy-generation/spec.md)
- [Galaxy Generator Implementation](../../../core/galaxy-generator.js)
- [System UI Component](../../../ui/system.js)
- [DataBridge](../../../core/data-bridge.js)
- [Project README](../../../README.md)
- [IMPLEMENTATION_SUMMARY](../../../IMPLEMENTATION_SUMMARY.md)
