# Technology/Research Tree - Technical Implementation Plan

## Architecture Overview

The Technology/Research Tree system provides **faction-specific technological progression** through a data-driven tree of 60+ technologies organized into 5 tiers. It operates as a **state machine + effect applier** on top of the resource management and faction state systems, advancing research progress each turn and applying permanent bonuses upon completion.

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                  Technology/Research Tree System                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  Tech Tree JSON  │→ │  Tech Loader +   │→ │  Research Engine  │  │
│  │ (3 faction files)│  │  Validator       │  │  (turn progress)  │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────┘  │
│                               ↓                        ↓             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  Effect Applier  │  │  Prerequisite    │  │   Queue Manager   │  │
│  │  (bonus/unlocks) │  │  Validator       │  │  (3-slot queue)   │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                               ↓
                    Faction Tech State Object
                               ↓
        ┌──────────────────────┴──────────────────────┐
        ↓                      ↓                       ↓
  Resource System        React Tech Tree UI        Phaser HUD
  (cost deduction)       (visual tree + queue)     (research progress)
```

### Core Modules

1. **TechTreeLoader** (`core/tech-loader.js`) - Loads and validates JSON tech definitions per faction
2. **TechResearchEngine** (`core/tech-research-engine.js`) - Research start/advance/complete logic, queue management
3. **TechEffectApplier** (`core/tech-effect-applier.js`) - Applies stat bonuses, unlocks units/buildings/missions
4. **TechStateManager** (`core/tech-state-manager.js`) - Per-faction tech state, serialization
5. **TechTree** (`src/components/TechTree.jsx`) - Visual tree graph with tier rows and connection lines
6. **TechDetailPanel** (`src/components/TechDetailPanel.jsx`) - Info panel on tech click with Begin Research
7. **ResearchQueue** (`src/components/ResearchQueue.jsx`) - Queue display and reordering
8. **ResearchProgressHUD** (`src/components/ResearchProgressHUD.jsx`) - Compact in-game research status

### Data Flow (Per Turn)

```
Turn Resolution Phase
    ↓
For each active faction:
  advanceResearch(faction)
    → Decrement turnsRemaining on each active research project
    → If turnsRemaining reaches 0:
        completeTechnology(faction, techId)
          → Add to completedTechnologies[]
          → applyTechnologyEffect() for each effect
          → unlockContent() for units/buildings/missions
          → Trigger completion notification
        → Auto-start next queued tech if queue non-empty
          and research slots available

Player Actions:
  beginResearch(faction, techId)
    → validatePrerequisites()
    → calculateFinalCost() (faction modifier × facility discount)
    → spendResources() via ResourceEngine
    → Create activeResearchProject entry
    
  queueTechnology(faction, techId) → add to researchQueue (max 3)
  reorderQueue(faction, techIds)   → replace researchQueue
  removeFromQueue(faction, techId) → splice researchQueue
```

## Technical Approach

### Module Structure

```javascript
// core/tech-trees/brand-authority-tree.json  (one per faction)
{
  "factionId": "brandAuthority",
  "technologies": [
    {
      "id": "military-logistics-1",
      "tier": 1,
      "name": "Military Logistics I",
      "description": "Streamlined supply chains accelerate fleet production.",
      "icon": "🚢",
      "startingTech": true,
      "cost": { "credits": 200, "influence": 50, "turns": 3 },
      "prerequisites": [],
      "effects": [
        { "type": "production-bonus", "target": "fleetProductionSpeed", "value": 0.10 }
      ],
      "unlocks": { "units": [], "buildings": [], "missions": [], "victoryConditions": [] }
    }
    // ...
  ]
}

// core/tech-loader.js
export class TechTreeLoader {
  static async loadTree(factionId) {
    const module = await import(`./tech-trees/${factionId}-tree.json`);
    this.validateTree(module.default);
    return module.default;
  }

  static validateTree(tree) {
    // Check all techs have required fields
    // Validate duplicate IDs (must be globally unique)
    // Validate prerequisite IDs resolve within same faction
  }

  static getTech(factionId, techId) { /* lookup helper */ }
  static getAllTechs(factionId)      { /* returns full array */ }
}

// core/tech-state-manager.js
export class TechStateManager {
  constructor(factionId, startingTechs = []) {
    this.state = {
      factionId,
      completedTechnologies: [...startingTechs],
      activeResearchProjects: [],     // max = multiResearchSlots
      researchQueue: [],              // max 3
      multiResearchSlots: 1,
      appliedEffects: []              // accumulated from completed techs
    };
    // Apply starting tech effects immediately
    for (const techId of startingTechs) {
      this.markStartingTech(factionId, techId);
    }
  }

  serialize()               { return JSON.stringify(this.state); }
  static deserialize(json)  { /* reconstruct from JSON */ }
}

// core/tech-research-engine.js
export class TechResearchEngine {
  constructor(techLoader, resourceEngine) {
    this.techLoader = techLoader;
    this.resourceEngine = resourceEngine;
  }

  beginResearch(faction, techState, resourceState, techId, currentTurn) {
    const tech = this.techLoader.getTech(faction.id, techId);
    if (!tech)                                         return { success: false, error: 'Unknown tech ID' };
    if (!this.checkPrerequisites(techState, tech))     return { success: false, error: 'Prerequisites not met' };
    if (techState.activeResearchProjects.length >= techState.multiResearchSlots)
                                                       return { success: false, error: 'Research slots full' };
    if (techState.completedTechnologies.includes(techId))
                                                       return { success: false, error: 'Already researched' };

    const finalCost = this.calculateFinalCost(tech, faction, resourceState);
    const spendResult = this.resourceEngine.spendResources(
      resourceState, { credits: finalCost.credits, influence: finalCost.influence },
      `research:${techId}`, currentTurn
    );
    if (!spendResult.success) return spendResult;

    techState.activeResearchProjects.push({
      techId,
      turnsRemaining: finalCost.turns,
      startedOnTurn: currentTurn,
      completesOnTurn: currentTurn + finalCost.turns
    });
    return { success: true };
  }

  advanceResearch(faction, techState, currentTurn) {
    const completed = [];
    for (const project of techState.activeResearchProjects) {
      project.turnsRemaining -= 1;
      if (project.turnsRemaining <= 0) {
        completed.push(project.techId);
      }
    }

    for (const techId of completed) {
      techState.activeResearchProjects =
        techState.activeResearchProjects.filter(p => p.techId !== techId);
      this.completeTechnology(faction, techState, techId);

      // Auto-start from queue
      while (
        techState.researchQueue.length > 0 &&
        techState.activeResearchProjects.length < techState.multiResearchSlots
      ) {
        const nextId = techState.researchQueue.shift();
        this.beginResearch(faction, techState, faction.resourceState, nextId, currentTurn);
      }
    }
    return completed; // IDs of techs completed this turn
  }

  completeTechnology(faction, techState, techId) {
    const tech = this.techLoader.getTech(faction.id, techId);
    techState.completedTechnologies.push(techId);
    TechEffectApplier.applyEffects(faction, techState, tech);
    TechEffectApplier.unlockContent(faction, tech.unlocks);
  }

  calculateFinalCost(tech, faction, resourceState) {
    const factionMod  = this.getFactionCostModifier(faction.id);
    const facilityMod = this.getResearchFacilityDiscount(faction, resourceState);
    const combined    = Math.max(factionMod * (1 - facilityMod), 0.40); // floor at -60% total

    return {
      credits:  Math.floor(tech.cost.credits   * combined),
      influence: Math.floor(tech.cost.influence * combined),
      turns:    tech.cost.turns    // turn count not modified in Phase 1A
    };
  }

  getFactionCostModifier(factionId) {
    return { brandAuthority: 1.10, union: 1.00, autoforge: 0.80 }[factionId] ?? 1.00;
  }

  getResearchFacilityDiscount(faction, resourceState) {
    // Count Research Facility systems controlled by faction (loyalty >= 51)
    const facilityCount = faction.controlledSystems
      .filter(sys => sys.specialType === 'researchFacility' && sys.loyaltyValue >= 51)
      .length;
    return Math.min(facilityCount * 0.10, 0.50); // each -10%, cap -50%
  }

  checkPrerequisites(techState, tech) {
    return tech.prerequisites.every(req => techState.completedTechnologies.includes(req));
  }
}

// core/tech-effect-applier.js
export class TechEffectApplier {
  static applyEffects(faction, techState, tech) {
    for (const effect of tech.effects) {
      switch (effect.type) {
        case 'production-bonus':
          faction.bonuses[effect.target] = (faction.bonuses[effect.target] || 1.0) * (1 + effect.value);
          break;
        case 'military-bonus':
          faction.militaryBonuses[effect.target] = (faction.militaryBonuses[effect.target] || 1.0) * (1 + effect.value);
          break;
        case 'storage-cap-bonus':
          faction.resourceCaps[effect.target] = Math.floor(faction.resourceCaps[effect.target] * (1 + effect.value));
          break;
        case 'mission-bonus':
          faction.missionBonuses[effect.target] = (faction.missionBonuses[effect.target] || 1.0) * (1 + effect.value);
          break;
        case 'research-bonus':
          faction.researchBonuses[effect.target] = (faction.researchBonuses[effect.target] || 1.0) * (1 + effect.value);
          break;
        case 'multi-research':
          techState.multiResearchSlots = Math.max(techState.multiResearchSlots, effect.value);
          break;
        case 'unique-capability':
          faction.uniqueCapabilities[effect.target] = true;
          break;
      }
      techState.appliedEffects.push({ techId: tech.id, ...effect });
    }
  }

  static unlockContent(faction, unlocks) {
    faction.unlockedUnits     = [...new Set([...faction.unlockedUnits,     ...unlocks.units])];
    faction.unlockedBuildings = [...new Set([...faction.unlockedBuildings, ...unlocks.buildings])];
    faction.unlockedMissions  = [...new Set([...faction.unlockedMissions,  ...unlocks.missions])];
    for (const vc of unlocks.victoryConditions || []) {
      faction.victoryProgress[vc] = faction.victoryProgress[vc] ?? 0;
    }
  }
}
```

## Implementation Tasks

### Phase 1: Tech Tree Data - Configuration Files
**Goal**: Define all 60+ technologies in JSON configuration files

**Status**: Complete

#### File Structure Setup
- [x] Create `core/tech-trees/` directory
- [x] Create `core/tech-trees/brand-authority-tree.json`
- [x] Create `core/tech-trees/union-tree.json`
- [x] Create `core/tech-trees/autoforge-tree.json`
- [x] Define common JSON schema used by all three files (factionId, technologies array)
- [x] Test all three files load without JSON syntax errors

#### Brand Authority Tech Tree - Tier 1
- [x] Define "military-logistics-1" (`startingTech: true`, +10% fleet production, 200c/50i/3t)
- [x] Define "corporate-tax-reform" (+15% credit income, 300c/75i/4t)
- [x] Define "advanced-materials-science" (+10% materials production, 250c/60i/3t)
- [x] Validate prerequisites: all Tier 1 have no prerequisites
- [x] Test Tier 1 definitions are syntactically correct

#### Brand Authority Tech Tree - Tier 2
- [x] Define "fleet-doctrine-overwhelming-force" (+15% ship combat power, unlocks Heavy Cruiser, 600c/150i/5t)
- [x] Define "economic-consolidation" (+25% storage caps, +10% trade hub, 700c/175i/6t)
- [x] Define "propaganda-networks" (+20% influence generation, unlocks Propaganda Center, 500c/125i/5t)
- [x] Set prerequisites: require any 1 Tier 1 tech (use `minFromTier: 1` or list all Tier 1 IDs)
- [x] Test Tier 2 prerequisites resolve correctly

#### Brand Authority Tech Tree - Tier 3
- [x] Define "advanced-shipyards" (+25% fleet production, unlocks Dreadnought, 1200c/300i/7t)
- [x] Define "intelligence-apparatus" (+30% espionage defense, unlocks Intelligence Network, 1000c/250i/6t)
- [x] Define "resource-optimization" (+20% special location output, -15% construction costs, 1400c/325i/8t)
- [x] Set prerequisites: require any 2 Tier 2 techs
- [x] Test Tier 3 prerequisites resolve correctly

#### Brand Authority Tech Tree - Tier 4
- [x] Define "supercarrier-program" (unlocks Supercarrier, +30% fleet capacity, 2500c/500i/9t)
- [x] Define "integrated-defense-grid" (+40% defense rating, unlocks Fortress Station, 2200c/450i/8t)
- [x] Define "economic-hegemony" (+30% credit income, influence from credits, 2800c/550i/10t)
- [x] Set prerequisites: require any 2 Tier 3 techs
- [x] Test Tier 4 prerequisites resolve correctly

#### Brand Authority Tech Tree - Tier 5
- [x] Define "galactic-administration" (no loyalty decay, remote management, unlocks Enforcer, enables economic-dominance VC, 5000c/1000i/12t)
- [x] Set prerequisites: require all 3 Tier 4 techs ("supercarrier-program", "integrated-defense-grid", "economic-hegemony")
- [x] Verify total BA tree = 15+ technologies with correct tiers
- [x] Validate all BA tech IDs are unique within the file

#### The Union Tech Tree - Tier 1
- [x] Define "guerrilla-tactics-1" (`startingTech: true`, +15% sabotage success, 200c/50i/3t)
- [x] Define "underground-networks" (+20% loyalty gain from diplomacy, -10% mission costs, 250c/75i/3t)
- [x] Define "improvised-manufacturing" (+15% materials, -20% ship maintenance, 300c/60i/4t)
- [x] Validate prerequisites empty for Tier 1
- [x] Test Tier 1 Union definitions load correctly

#### The Union Tech Tree - Tier 2
- [x] Define "stealth-technology" (+25% espionage success, unlocks Stealth Ship, 550c/125i/5t)
- [x] Define "popular-support" (loyalty decay 75% slower, +15% influence from high-loyalty, 600c/150i/5t)
- [x] Define "sabotage-techniques" (+30% sabotage damage, unlocks "Incite Uprising" mission, 500c/140i/4t)
- [x] Set prerequisites: any 1 Tier 1 Union tech
- [x] Test Tier 2 Union prerequisites

#### The Union Tech Tree - Tier 3
- [x] Define "deep-cover-operations" (+20% all covert mission success, unlocks "Deep Cover" mission, 1100c/275i/6t)
- [x] Define "decentralized-command" (2 minor secret bases allowed, +25% recruit gen, 1300c/300i/7t)
- [x] Define "hit-and-run-tactics" (+20% combat power in defensive battles, free retreat, 1000c/250i/6t)
- [x] Set prerequisites: any 2 Tier 2 Union techs
- [x] Test Tier 3 Union prerequisites

#### The Union Tech Tree - Tier 4
- [x] Define "liberation-fleet" (unlocks Liberation capital ship, +30% loyalty gain on liberation, 2200c/450i/8t)
- [x] Define "mass-mobilization" (+50% recruit gen, unlocks militia units, 2000c/400i/7t)
- [x] Define "revolutionary-ideology" (+40% influence gen, diplomacy 25% instant loyalty chance, 2600c/520i/9t)
- [x] Set prerequisites: any 2 Tier 3 Union techs
- [x] Test Tier 4 Union prerequisites

#### The Union Tech Tree - Tier 5
- [x] Define "revolutionary-spark" (galaxy-wide uprising +20 loyalty toward Union, enables Heroic Victory VC, 2× diplomacy effect, 4500c/900i/14t)
- [x] Set prerequisites: all 3 Tier 4 Union techs
- [x] Verify total Union tree = 15+ technologies
- [x] Validate all Union tech IDs unique

#### The Autoforge Tech Tree - Tier 1
- [x] Define "automated-production-1" (`startingTech: true`, +20% materials production, 200c/50i/3t)
- [x] Define "neural-network-expansion" (+15% research speed, 250c/60i/3t)
- [x] Define "drone-fleet-protocols" (-25% fleet maintenance, +10% fighter production, 300c/75i/4t)
- [x] Validate Tier 1 prerequisites empty
- [x] Test Tier 1 Autoforge definitions load

#### The Autoforge Tech Tree - Tier 2
- [x] Define "advanced-fabrication" (+30% materials, unlocks Automated Factory, 600c/125i/5t)
- [x] Define "research-acceleration" (+25% research speed, unlocks 2-simultaneous-research capability, 700c/150i/6t)
- [x] Define "droid-legion" (+20% recruit generation, unlocks Droid Carrier, 550c/140i/5t)
- [x] Set prerequisites: any 1 Tier 1 Autoforge tech
- [x] Test Tier 2 Autoforge prerequisites

#### The Autoforge Tech Tree - Tier 3
- [x] Define "self-replicating-systems" (buildings auto-repair, pop-0 facilities at 2× speed, 1300c/280i/7t)
- [x] Define "quantum-computing" (+35% research speed, -15% research costs, unlocks Research Complex, 1400c/320i/8t)
- [x] Define "infrastructure-integration" (+20% system dependency, +15% resource output in Autoforge systems, 1100c/250i/6t)
- [x] Set prerequisites: any 2 Tier 2 Autoforge techs
- [x] Test Tier 3 Autoforge prerequisites

#### The Autoforge Tech Tree - Tier 4
- [x] Define "nexus-network" (unlocks Nexus capital ship, all systems networked, 2400c/480i/9t)
- [x] Define "total-automation" (+50% materials and credits, zero fleet upkeep, 2800c/550i/10t)
- [x] Define "technological-dependence" (+30% system dependency metric, accelerates Dependency Victory, 2200c/450i/8t)
- [x] Set prerequisites: any 2 Tier 3 Autoforge techs
- [x] Test Tier 4 Autoforge prerequisites

#### The Autoforge Tech Tree - Tier 5
- [x] Define "singularity-protocol" (no resource cap overflow waste, +50% all production, auto-unlocks all Tier 1-4 instantly, enables Research Victory VC, 5500c/1100i/15t)
- [x] Set prerequisites: all 3 Tier 4 Autoforge techs
- [x] Verify total Autoforge tree = 15+ technologies
- [x] Validate all Autoforge tech IDs unique
- [x] Validate all 60+ tech IDs are globally unique (no cross-faction collisions)

### Phase 2: Tech Loader and Validator
**Goal**: Build the module that loads tech JSON and validates schemas

**Status**: Complete

#### TechTreeLoader Module
- [x] Create `core/tech-loader.js`
- [x] Implement `TechTreeLoader` class
- [x] Implement `loadTree(factionId)` — async dynamic import of faction JSON
- [x] Cache loaded trees to avoid re-importing on every call
- [x] Implement `getTech(factionId, techId)` — lookup by ID
- [x] Implement `getAllTechs(factionId)` — return full array
- [x] Implement `getTechsByTier(factionId, tier)` — return techs for a given tier
- [x] Test loader returns correct data for each faction

#### Schema Validation
- [x] Implement `validateTree(tree)` method
- [x] Check `factionId` present and matches expected values
- [x] Check `technologies` is non-empty array
- [x] For each tech: verify `id`, `tier`, `name`, `cost`, `prerequisites`, `effects`, `unlocks` present
- [x] Verify `tier` is integer 1-5
- [x] Verify `cost` contains `credits`, `influence`, `turns` (all positive integers)
- [x] Verify `prerequisites` is an array of strings
- [x] Verify `effects` is array with `type`, `target`, `value` fields
- [x] Verify `unlocks` has `units`, `buildings`, `missions`, `victoryConditions` arrays
- [x] Throw descriptive error for any schema violation
- [x] Test validation catches missing required fields
- [x] Test validation catches invalid tier values
- [x] Test validation passes for all three faction files

#### Global ID Uniqueness Check
- [x] Implement `validateGlobalUniqueness(trees)` — accepts array of all faction trees
- [x] Collect all tech IDs across all factions
- [x] Detect and throw error if any ID appears more than once
- [x] Run uniqueness check at startup (after all trees loaded)
- [x] Test catches duplicate IDs across faction trees

#### Prerequisite Resolution Check
- [x] Implement `validatePrerequisites(tree)` — verify all prerequisite IDs exist within same faction's tree
- [x] Warn (not error) on cross-faction prerequisite references (not supported in Phase 1A)
- [x] Test catches dangling prerequisite references
- [x] Test passes for valid prerequisite chains

### Phase 3: Tech State Manager
**Goal**: Create the per-faction technology state object with serialization

**Status**: Complete

#### TechStateManager Module
- [x] Create `core/tech-state-manager.js`
- [x] Implement `TechStateManager` class
- [x] Constructor accepts `(factionId, startingTechIds)` and calls `initializeState()`
- [x] Implement `initializeState()` — create all required state fields with defaults
- [x] Fields: `factionId`, `completedTechnologies`, `activeResearchProjects`, `researchQueue`, `multiResearchSlots`, `appliedEffects`
- [x] On construction, iterate `startingTechIds` and mark each as completed (call `markStartingTech()`)
- [x] Test state initializes correctly for Brand Authority (starting: "military-logistics-1")
- [x] Test state initializes correctly for Union (starting: "guerrilla-tactics-1")
- [x] Test state initializes correctly for Autoforge (starting: "automated-production-1")

#### Serialization and Deserialization
- [x] Implement `serialize()` → JSON string of full state
- [x] Implement static `deserialize(json)` → `TechStateManager` instance with restored state
- [x] Ensure all arrays and nested objects are deep-copied on deserialize (no shared references)
- [x] Test serialize/deserialize round-trip preserves `completedTechnologies`
- [x] Test serialize/deserialize preserves `activeResearchProjects` (with `turnsRemaining`)
- [x] Test serialize/deserialize preserves `researchQueue`
- [x] Test serialize/deserialize preserves `appliedEffects`
- [x] Test deserialize creates a functionally equivalent state

#### Starting Tech Effect Application
- [x] Implement `markStartingTech(factionId, techId)` method
- [x] Load tech definition for starting tech
- [x] Add to `completedTechnologies` without spending resources or turn progress
- [x] Add effects to `appliedEffects` array
- [x] Do NOT call effect applier (effects already included in faction definition's `bonuses`)
- [x] Test starting techs appear in completedTechnologies on init
- [x] Test starting techs do not double-apply effects (faction bonuses already include them)

### Phase 4: Research Engine
**Goal**: Implement research start, turn advancement, completion, and queue logic

**Status**: Complete

#### TechResearchEngine Module
- [x] Create `core/tech-research-engine.js`
- [x] Implement `TechResearchEngine` class
- [x] Constructor accepts `(techLoader, resourceEngine)` instances
- [x] Test engine instantiates correctly with dependencies

#### Prerequisite Checking
- [x] Implement `checkPrerequisites(techState, tech)` method
- [x] Return `true` only if all `tech.prerequisites` IDs are in `techState.completedTechnologies`
- [x] Return `false` with specific missing prereqs if not satisfied
- [x] Test returns `true` when all prerequisites complete
- [x] Test returns `false` when any prerequisite missing
- [x] Test returns `true` for techs with empty prerequisites array (Tier 1)

#### Research Cost Calculation
- [x] Implement `calculateFinalCost(tech, factionId, controlledSystems)` method
- [x] Apply faction cost modifier: Brand Authority ×1.10, Union ×1.00, Autoforge ×0.80
- [x] Count Research Facility systems with loyalty ≥ 51 → multiply -10% each
- [x] Cap facility discount at -50% (max 5 facilities)
- [x] Combine faction + facility modifiers, floor total discount at -60% (minimum cost = 40% of base)
- [x] Apply `Math.floor()` to final credits and influence
- [x] Do NOT modify turn count in Phase 1A
- [x] Test Brand Authority +10% cost on Tier 1 tech
- [x] Test Autoforge -20% cost on Tier 3 tech
- [x] Test 3 Research Facilities gives -30% facility discount
- [x] Test combined modifier caps at -60% total
- [x] Test cost floor enforced at 40% of base cost

#### Begin Research
- [x] Implement `beginResearch(faction, techState, resourceState, techId, currentTurn)` method
- [x] Validate tech ID exists in faction's tree (error: "Unknown tech ID")
- [x] Validate tech not already in completedTechnologies (error: "Already researched")
- [x] Validate tech not already in activeResearchProjects (error: "Already researching")
- [x] Validate prerequisites met (error: "Prerequisites not met: [X, Y]")
- [x] Validate multiResearchSlots not at capacity (error: "Research slots full — queue instead")
- [x] Call `calculateFinalCost()` 
- [x] Call `resourceEngine.spendResources()` with computed cost
- [x] If spend fails, return `{ success: false, error }` without modifying tech state
- [x] On success: push to `activeResearchProjects` with `{ techId, turnsRemaining, startedOnTurn, completesOnTurn }`
- [x] Return `{ success: true }`
- [x] Test all validation errors return without side effects
- [x] Test successful begin deducts resources
- [x] Test successful begin adds to activeResearchProjects

#### Advance Research (Turn Tick)
- [x] Implement `advanceResearch(faction, techState, currentTurn)` method
- [x] Decrement `turnsRemaining` on each active research project
- [x] Collect projects where `turnsRemaining <= 0`
- [x] For each completed project, call `completeTechnology()`
- [x] Remove completed projects from `activeResearchProjects`
- [x] After each completion, check queue: if queue non-empty and slots available, call `beginResearch()` for next item
- [x] Return array of completed tech IDs (for notification system)
- [x] Test research advances 1 turn per call
- [x] Test research completes at correct turn count
- [x] Test queue auto-starts on completion
- [x] Test multiple simultaneous research tracks independently

#### Complete Technology
- [x] Implement `completeTechnology(faction, techState, techId)` method
- [x] Add `techId` to `techState.completedTechnologies`
- [x] Load tech definition from TechTreeLoader
- [x] Call `TechEffectApplier.applyEffects(faction, techState, tech)`
- [x] Call `TechEffectApplier.unlockContent(faction, tech.unlocks)`
- [x] Return completion result including tech name (for notifications)
- [x] Test completion adds to completedTechnologies
- [x] Test completion applies effects
- [x] Test completion unlocks content

#### Queue Management
- [x] Implement `queueTechnology(techState, techId)` method
- [x] Validate tech not already in queue (error: "Already queued")
- [x] Validate tech not already researching or completed (error)
- [x] Validate queue has fewer than 3 items (error: "Queue full — max 3 technologies")
- [x] Append techId to `researchQueue`
- [x] Return `{ success: true }`
- [x] Implement `reorderQueue(techState, orderedTechIds)` — replace researchQueue with new order (validate all IDs match existing queue)
- [x] Implement `removeFromQueue(techState, techId)` — splice from researchQueue (no penalty)
- [x] Test queue enforces 3-item max
- [x] Test reorder preserves same set of IDs
- [x] Test remove correctly splices item

#### Multi-Research Slot Management
- [x] Implement slot management: `techState.multiResearchSlots` starts at 1
- [x] When Autoforge "research-acceleration" completes, set `multiResearchSlots = 2`
- [x] Effect in tech JSON: `{ "type": "multi-research", "value": 2 }`
- [x] Handled by `TechEffectApplier` via `case 'multi-research'`
- [x] Test base slot = 1 for all factions
- [x] Test Autoforge slot becomes 2 after "research-acceleration" completes
- [x] Test two independent research projects track correctly when slots = 2

### Phase 5: Tech Effect Applier
**Goal**: Apply all technology effect types to the faction state

**Status**: Complete

#### TechEffectApplier Module
- [x] Create `core/tech-effect-applier.js`
- [x] Implement `TechEffectApplier` class with static methods
- [x] Implement main `applyEffects(faction, techState, tech)` dispatcher
- [x] Iterate `tech.effects` array and dispatch on `effect.type`
- [x] Record each applied effect in `techState.appliedEffects`
- [x] Test dispatcher calls correct handler for each effect type

#### Production Bonus Effects
- [x] Handle `"type": "production-bonus"` effects
- [x] Targets: `fleetProductionSpeed`, `creditIncome`, `materialProduction`, `recruitGeneration`, `influenceGeneration`
- [x] Apply multiplicatively: `faction.bonuses[target] *= (1 + value)`
- [x] Initialize `faction.bonuses[target]` to 1.0 if not already set
- [x] Test +10% production bonus stacks correctly with existing faction bonus
- [x] Test multiple production bonuses on same target stack multiplicatively

#### Military Bonus Effects
- [x] Handle `"type": "military-bonus"` effects
- [x] Targets: `shipCombatPower`, `defenseRating`, `fleetCapacity`
- [x] Apply multiplicatively: `faction.militaryBonuses[target] *= (1 + value)`
- [x] Initialize `faction.militaryBonuses` object on faction if not present
- [x] Test military bonus stacks correctly
- [x] Test applies faction-wide (not per-ship)

#### Storage Cap Bonus Effects
- [x] Handle `"type": "storage-cap-bonus"` effects
- [x] Target: specific resource type (`credits`, `materials`, `recruits`, `influence`) or `all`
- [x] Apply: `faction.resourceCaps[target] = Math.floor(resourceCaps[target] * (1 + value))`
- [x] Test cap increases by correct percentage
- [x] Test cap persists across turns

#### Mission Bonus Effects
- [x] Handle `"type": "mission-bonus"` effects
- [x] Targets: `espionageSuccess`, `sabotageSuccess`, `diplomacySuccess`, `sabotageDefense`
- [x] Apply multiplicatively on `faction.missionBonuses[target]`
- [x] Test mission bonuses accumulate correctly
- [x] Test applies to all missions of specified type

#### Research Bonus Effects
- [x] Handle `"type": "research-bonus"` effects
- [x] Targets: `researchSpeed`, `researchCostModifier`
- [x] Apply to `faction.researchBonuses[target]`
- [x] Note: `researchSpeed` reduces turns (Phase 1B when turn cost becomes dynamic)
- [x] Test research bonus recorded correctly

#### Cost Reduction Effects
- [x] Handle `"type": "cost-reduction"` effects
- [x] Targets: `constructionCost`, `researchCost`, `missionCost`
- [x] Apply as negative modifier to relevant cost calculation (e.g., -15% construction)
- [x] Verify cost reductions don't reduce below 10% of base (minimum cost floor)
- [x] Test construction cost reduction applies in building system

#### Unique Capability Effects
- [x] Handle `"type": "unique-capability"` effects
- [x] Set boolean flag: `faction.uniqueCapabilities[effect.target] = true`
- [x] Implement check functions for each capability:
  - `hasCapability(faction, 'loyalty-decay-elimination')` — Brand Authority Tier 5
  - `hasCapability(faction, 'remote-system-management')` — Brand Authority Tier 5
  - `hasCapability(faction, 'zero-resource-cap-waste')` — Autoforge Tier 5
  - `hasCapability(faction, 'galaxy-wide-uprising')` — Union Tier 5
- [x] Integrate `loyalty-decay-elimination` with loyalty system (turn update skips decay for BA)
- [x] Integrate `zero-resource-cap-waste` with ResourceEngine (no overflow loss for Autoforge)
- [x] Test each capability flag set correctly on tech completion
- [x] Test game systems respect capability flags

#### Content Unlock Effects
- [x] Implement `unlockContent(faction, unlocks)` method
- [x] Merge `unlocks.units` into `faction.unlockedUnits` (deduplicated)
- [x] Merge `unlocks.buildings` into `faction.unlockedBuildings` (deduplicated)
- [x] Merge `unlocks.missions` into `faction.unlockedMissions` (deduplicated)
- [x] For each `unlocks.victoryConditions`, initialize tracking in `faction.victoryProgress`
- [x] Test units unlocked after correct tier tech completes
- [x] Test buildings unlocked after correct tier tech completes
- [x] Test unlocks are deduplicated (same unit not added twice)

### Phase 6: Turn Integration
**Goal**: Integrate research advancement into the turn resolution cycle

**Status**: Partially complete

#### Turn Hook
- [x] Identify turn resolution phase in `engine/main-stage.js` (or future turn-system module)
- [x] Call `TechResearchEngine.advanceResearch(faction, techState, currentTurn)` for each active faction
- [x] Collect completed tech IDs returned by `advanceResearch()`
- [x] Dispatch completion notifications (in-game popup/banner) for each completed tech
- [x] Test research advances each turn
- [x] Test effects apply after completion, not before

#### Research Completion Notifications
- [ ] Create notification for tech completion: "Technology Complete: [Name]"
- [ ] Show faction color, tech name, and icon in notification banner
- [ ] Auto-dismiss notification after 5 seconds or on click
- [ ] Queue multiple notifications if several techs complete same turn
- [ ] Test notification displays for Brand Authority tech completion
- [ ] Test notification displays for Union tech completion
- [ ] Test notification displays for Autoforge tech completion

#### Research Facility Bonus Re-evaluation
- [ ] Recalculate Research Facility discount each time research begins (not cached)
- [ ] Discount reflects current controlled systems with Research Facility at time of research start
- [ ] Discount does not change mid-research if systems are lost
- [ ] Test discount calculated correctly at research start
- [ ] Test losing a Research Facility mid-research does not change cost

#### Multi-Faction Turn Advances
- [ ] Advance research for all active factions each turn (not just player faction)
- [ ] AI factions research independently (auto-select from queue in Phase 1B)
- [ ] AI research state updates correctly without player interaction
- [ ] Test all faction research advances in same turn

### Phase 7: Tech Tree UI Component
**Goal**: Build the visual tech tree graph with tier rows and connection lines

**Status**: Complete

#### TechTree Component
- [x] Create `src/components/TechTree.jsx`
- [x] Create `src/components/TechTree.css`
- [x] Load tech tree for player's faction on mount (via `TechTreeLoader`)
- [x] Display "Tech Tree" header with faction name and color
- [x] Render 5 tier rows (Tier 1 at top or bottom — recommend top)
- [x] Test component mounts and loads tech definitions

#### Tech Node Component
- [x] Create `TechNode` sub-component (inline or separate file)
- [x] Display tech icon, name, and tier badge
- [x] Apply state class: `locked`, `available`, `researching`, `completed`
- [x] Visual states:
  - Locked: grayed out, 50% opacity, not clickable
  - Available: normal faction color, clickable, hover glow
  - Researching: highlighted border, circular progress indicator
  - Completed: green checkmark overlay, slightly brighter
- [x] Test each state renders with correct visual appearance

#### Prerequisite Connection Lines
- [x] Draw SVG lines between techs and their prerequisites
- [x] Lines rendered before tech nodes (behind them in z-order)
- [x] Line color: completed = green, locked prerequisite = gray, available = faction color
- [x] Arrow at end indicating direction (prerequisite → unlocks)
- [x] Lines route correctly (no crossing/overlapping nodes)
- [x] Test lines render correctly for each faction's tree structure

#### Tier Row Layout
- [x] Arrange techs in horizontal rows by tier
- [x] Center tech nodes within tier row
- [x] Consistent spacing between nodes (min 20px gap)
- [x] Tier label on left side ("Tier 1", "Tier 2", etc.)
- [x] Scroll support for large tier rows (Tier 2-4 may have 4-5 techs)
- [x] Test layout with different screen sizes

#### Tech State Color Coding
- [x] Apply faction primary color to available and researching techs
- [x] Completed techs use green (#3fb950) regardless of faction
- [x] Locked techs use #444 (dark gray)
- [x] Researching node pulses/animates
- [x] Test color coding matches expected states accurately

### Phase 8: Tech Detail Panel
**Goal**: Build the information panel that opens when a tech is clicked

**Status**: Complete

#### TechDetailPanel Component
- [x] Create `src/components/TechDetailPanel.jsx`
- [x] Create `src/components/TechDetailPanel.css`
- [x] Renders as overlay panel when a tech node clicked
- [x] Close button (X) dismisses panel
- [x] Close on Escape key press
- [x] Test panel opens when tech node clicked
- [x] Test panel closes on button click and Escape

#### Tech Information Display
- [x] Display tech icon (large) and name as panel header
- [x] Display tier badge ("Tier 3")
- [x] Display full description text
- [x] Display faction-adjusted cost (credits, influence, turns with faction modifier shown)
- [x] Display prerequisites list (name + state indicator: ✓ or ✗)
- [x] Display effects list in plain language:
  - "production-bonus" → "+10% Fleet Production Speed"
  - "military-bonus" → "+15% Ship Combat Power"
  - "storage-cap-bonus" → "+25% Resource Storage Capacity"
  - "mission-bonus" → "+30% Espionage Success Rate"
  - "unique-capability" → "Unique: [capability name friendly string]"
- [x] Display unlocked content: units, buildings, missions (with icons if available)
- [x] Test all sections render correctly for a Tier 3 tech

#### Begin Research Button
- [x] Show "Begin Research" button only when tech state = `available`
- [x] Disable button with tooltip when:
  - State = `locked`: "Complete prerequisites first: [list missing]"
  - State = `researching`: "Already researching"
  - State = `completed`: "Already completed"
  - Insufficient resources: "Insufficient [Credits/Influence]"
  - Slots full: "Add to Queue"
- [x] When clicked and research slots full → offer "Add to Queue" instead
- [x] On successful begin: close panel, update tech node to `researching`
- [x] Test button disabled states display correctly
- [x] Test successful begin updates tech node state

#### Add to Queue Button
- [x] Show "Add to Queue" button when tech is available but slots full
- [x] Disable if queue already has 3 items ("Queue Full")
- [x] On click: add to queue, update queue display, close panel
- [x] Test queue button adds tech to ResearchQueue component
- [x] Test queue button disabled when queue at 3 items

### Phase 9: Research Queue Component
**Goal**: Build the research queue display and management UI

**Status**: Complete

#### ResearchQueue Component
- [x] Create `src/components/ResearchQueue.jsx`
- [x] Create `src/components/ResearchQueue.css`
- [x] Display "Research Queue" section heading
- [x] List up to 3 queued technologies with order numbers (1, 2, 3)
- [x] Each queue item shows: icon, name, estimated turns to start
- [x] Empty queue shows helpful text: "Queue techs to auto-start after current research"
- [x] Test queue renders list of queued techs

#### Queue Item Actions
- [x] "Remove" (×) button on each queue item — removes without penalty
- [x] Up/Down arrow buttons to reorder queue items
- [x] Confirm reorder calls `TechResearchEngine.reorderQueue()`
- [x] Test remove correctly removes from state and updates display
- [x] Test reorder updates queue order in state

#### Queue ETA Display
- [x] Calculate estimated start turn for each queued item:
  - Item 1: current research `completesOnTurn` + 1
  - Item 2: Item 1 start + Item 1 research turns
  - Item 3: Item 2 start + Item 2 research turns
- [x] Display as "Starts ~Turn 18" or "Starts in ~4 turns"
- [x] Test ETA calculations correct for sequential queue items

### Phase 10: Research Progress HUD
**Goal**: Build the compact in-game research status display

**Status**: Complete

#### ResearchProgressHUD Component
- [x] Create `src/components/ResearchProgressHUD.jsx`
- [x] Display current research: tech icon, name, progress bar, turns remaining
- [x] If no active research: show "No Active Research" with "Open Tech Tree" link
- [x] If multi-research active (Autoforge): show stacked entries for each project
- [x] Progress bar: percentage filled based on turns elapsed / total turns
- [x] Display "Turn 8/12" or "4 turns remaining"
- [x] Display "Completes Turn 15" ETA
- [x] Test HUD shows correct progress percentage

#### HUD Positioning
- [x] Position HUD below resource HUD or in dedicated side panel
- [x] Compact design (single row per research project)
- [x] Expand on hover or click to show queue
- [x] Ensure HUD doesn't overlap System Details panel
- [x] Test HUD visible without obscuring game map

#### Turn Remaining Calculation
- [x] Calculate progress %: `((totalTurns - turnsRemaining) / totalTurns) * 100`
- [ ] Handle edge case: `turnsRemaining = 0` → show 100% briefly before completion processing
- [x] Update HUD every turn during turn resolution
- [x] Test progress updates each turn

### Phase 11: DataBridge Persistence
**Goal**: Persist technology state via DataBridge for save/load

**Status**: Partially complete

#### Save Tech State
- [x] Extend faction save data to include `techState` (serialized from `TechStateManager`)
- [x] Serialize: `completedTechnologies`, `activeResearchProjects`, `researchQueue`, `multiResearchSlots`, `appliedEffects`
- [x] Save via `dataBridge.saveFactionState()` (or combined galaxy save)
- [ ] Test tech state persists in offline (localStorage) mode
- [ ] Test tech state persists in cloud (Supabase) mode if env vars set

#### Load Tech State
- [x] Deserialize tech state using `TechStateManager.deserialize()`
- [x] Reconnect deserialized `TechStateManager` to `TechResearchEngine`
- [ ] Re-apply all `appliedEffects` to faction bonuses on load
  - NOTE: Must NOT double-apply — check if effects already embedded in faction bonuses
  - Recommended: Store "effective bonuses" separately; on load, reset to base and re-apply from `appliedEffects`
- [x] Restore `activeResearchProjects` with correct `turnsRemaining`
- [x] Restore `researchQueue`
- [ ] Test loaded state matches saved state exactly
- [ ] Test research resumes correctly (counts down from saved `turnsRemaining`)

#### Effect Re-application Strategy
- [ ] Define base bonuses for each faction (before any tech effects)
- [ ] Store `baseBonuses` separately from `effectiveBonuses` on faction state
- [ ] On load: reset faction bonuses to `baseBonuses`, then re-apply each `appliedEffect`
- [ ] Test re-application produces same effective bonuses as original game session
- [ ] Test base bonuses preserved when tech effects stripped and re-applied

#### Schema Versioning
- [ ] Add `techStateVersion: 1` field to serialized tech state
- [ ] On load: check version, apply migration if needed
- [ ] For missing `techStateVersion` (old save): default to empty state + starting tech
- [ ] Test old save format loads without crash (graceful degradation)

### Phase 12: Balance Validation and Performance
**Goal**: Validate tech progression pacing, bonus balance, and performance targets

**Status**: Not started

#### Full Tree Completion Time Check
- [ ] Calculate minimum turns to complete full Brand Authority tree (sequential, no multi-research)
- [ ] Sum turns: 3+4+3 (Tier 1) + 5+6+5 (Tier 2) + 7+6+8 (Tier 3) + 9+8+10 (Tier 4) + 12 (Tier 5) = 86 turns
- [ ] Verify all three faction trees require 60-100 turns minimum for full completion
- [ ] Test turn requirements are within spec bounds

#### Full Tree Completion Cost Check
- [ ] Sum all credit costs for each faction's complete tree
- [ ] Verify totals align with expected late-game resource accumulation
- [ ] Check no single tech costs more than 30% of the expected turn-60 credit pool
- [ ] Test costs scale correctly with faction modifier (BA +10%, Autoforge -20%)

#### Stat Bonus Cap Validation
- [ ] Test no single technology provides >+50% bonus to any single stat
- [ ] Test combined tree bonuses (all completed) balanced across factions within 20% variance
- [ ] Verify Tier 5 unique capabilities don't trivially win the game alone
- [ ] Test bonus stacking doesn't create degenerate multiplication values

#### Research Facility Discount Validation
- [ ] Test 1 Research Facility: -10% cost applied correctly
- [ ] Test 5 Research Facilities: -50% cap enforced
- [ ] Test combined BA (+10%) + 5 facilities (-50%): net = -40% (not below -60% floor)
- [ ] Test combined Autoforge (-20%) + 5 facilities (-50%): caps at -60% floor
- [ ] Test discount only counted for systems with loyalty ≥ 51

#### Performance Benchmarking
- [ ] Measure tech tree UI load time (target < 300ms with 60+ technologies)
- [ ] Measure `advanceResearch()` call time for all factions per turn (target < 5ms)
- [ ] Measure `checkPrerequisites()` for 15+ techs (target < 10ms)
- [ ] Measure TechTreeLoader with cached trees (should be < 1ms per call after first load)
- [ ] Profile bottlenecks if any target missed
- [ ] Test UI renders 60+ tech nodes without lag

#### Correctness Unit Tests
- [ ] Test `checkPrerequisites()` with empty, partial, full prerequisites
- [ ] Test `calculateFinalCost()` for all faction/tier combinations
- [ ] Test `advanceResearch()` at turn 1, midpoint, completion turn
- [ ] Test `queueTechnology()` at 0, 1, 2, 3 items (max enforcement)
- [ ] Test `TechEffectApplier.applyEffects()` for each effect type
- [ ] Test `TechEffectApplier.unlockContent()` deduplicates correctly
- [ ] Test serialization/deserialization round-trip for complex state

### Phase 13: Polish, Error Handling, and Documentation
**Goal**: Polish the tech UI, handle edge cases, and document the system

**Status**: Not started

#### Tech Tree UI Polish
- [ ] Add smooth open/close animation for TechDetailPanel
- [ ] Add hover tooltip on locked techs showing blocking prerequisites
- [ ] Add hover effect on available techs (glow, scale up slightly)
- [ ] Animate research completion: brief flash/pulse on tech node when done
- [ ] Tech tree scrollable if screen too small (horizontal or vertical scroll)
- [ ] Add "Collapse/Expand" per tier for large trees
- [ ] Test animations run at 60 FPS with no dropped frames

#### Notification System
- [ ] Notification banner appears when research completes (mid-game)
- [ ] Banner shows: tech icon, name, "Research Complete!", key benefit
- [ ] Auto-dismiss after 5 seconds or on click
- [ ] Multiple completions same turn: queue notifications sequentially
- [ ] Test notifications display in correct order
- [ ] Test notifications don't overlap other UI elements

#### Insufficient Resources Feedback
- [ ] When "Begin Research" fails for lack of credits/influence, highlight those resources in HUD briefly
- [ ] Show exact shortfall: "Need 450 more Credits, 75 more Influence"
- [ ] Disable "Begin Research" button proactively with tooltip (no click-to-fail required)
- [ ] Test insufficient feedback for credits only, influence only, both

#### Edge Case Handling
- [ ] Handle: faction completes Tier 5 tech while another active research project mid-way (both independent)
- [ ] Handle: Autoforge "Singularity Protocol" auto-completes Tier 1-4 techs — handle effect re-application without duplicates
- [ ] Handle: save loaded with research project that has 0 turns remaining (complete immediately on load)
- [ ] Handle: queue item prerequisite completed mid-research (auto-start if valid)
- [ ] Handle: queue item becomes invalid (already completed via another path) — auto-skip

#### Code Documentation
- [ ] Add JSDoc to all `TechResearchEngine` public methods
- [ ] Add JSDoc to all `TechEffectApplier` static methods
- [ ] Add JSDoc to `TechStateManager` with state schema documented
- [ ] Document tech JSON schema in `core/tech-trees/README.md` (or inline in plan)
- [ ] Document how to add a new technology (config-only, no code needed)
- [ ] Document how to add a new effect type (code change required: add case to applier)

#### Project Management Update
- [ ] Update `IMPLEMENTATION_SUMMARY.md` with technology system details
- [ ] Update `README.md` with tech tree overview
- [ ] Update `feature-catalog.md` status to "Complete"
- [ ] Update `backlog.md` (remove tech tree tasks)
- [ ] Update `roadmap.md` (mark tech tree implemented)
- [ ] Cross-reference tech system with dependent features (Fleet, Missions, Victory)

## Completion Checklist

- [x] All Phase 1 tasks complete — **60+ technologies defined in JSON**
- [x] All Phase 2 tasks complete — **Tech loader and schema validation**
- [x] All Phase 3 tasks complete — **Tech state manager with serialization**
- [x] All Phase 4 tasks complete — **Research engine (begin, advance, complete, queue)**
- [x] All Phase 5 tasks complete — **Tech effect applier (all 7 effect types)**
- [ ] All Phase 6 tasks complete — **Turn integration and notifications**
- [x] All Phase 7 tasks complete — **Tech tree UI with nodes and connection lines**
- [x] All Phase 8 tasks complete — **Tech detail panel with Begin Research**
- [x] All Phase 9 tasks complete — **Research queue with reordering**
- [x] All Phase 10 tasks complete — **Research progress HUD**
- [ ] All Phase 11 tasks complete — **DataBridge persistence with effect re-application**
- [ ] All Phase 12 tasks complete — **Balance validation and performance benchmarks**
- [ ] All Phase 13 tasks complete — **Polish, edge cases, documentation**
- [ ] All acceptance criteria from spec met
- [ ] Performance targets met: UI < 300ms load, effects < 5ms/turn, prerequisite check < 10ms
- [ ] Balance targets met: full tree = 60-100 turns, no single bonus > +50%, no faction > 20% variance
- [ ] Manual testing complete (all 3 faction trees, all effect types, queue, multi-research, save/load)
- [ ] Documentation updated (README, IMPLEMENTATION_SUMMARY, feature-catalog, backlog, roadmap)
- [ ] Ready for Phase 1B integration (Fleet Management, Mission System, Victory Conditions)

## Risk Analysis

### High-Risk Areas

1. **Effect Double-Application on Load**: Re-applying `appliedEffects` after deserialize could stack on top of already-modified bonuses
   - *Mitigation*: Separate `baseBonuses` from `effectiveBonuses`; always reset to base and recompute on load

2. **Autoforge "Singularity Protocol" Auto-Complete**: Auto-completing all Tier 1-4 techs needs careful effect deduplication
   - *Mitigation*: Check `completedTechnologies` before applying each effect; skip already-completed techs

3. **Prerequisite Logic Complexity**: Flexible "any N from tier X" prereqs vs specific ID prereqs  
   - *Mitigation*: Phase 1A uses specific ID lists only; "any N" logic deferred to Phase 1B if needed. All three trees use specific IDs.

4. **Tech Tree UI Layout**: 4-5 nodes per tier with connecting lines can get visually complex
   - *Mitigation*: Horizontal scrollable rows per tier; SVG lines computed from node positions post-render

### Medium-Risk Areas

1. **60+ Tech JSON Maintenance**: Large config files risk inconsistencies and typos
   - *Mitigation*: Strict schema validation at load time; descriptive error messages pinpoint issue

2. **Research Queue Auto-Start Edge Cases**: Queue item may become invalid by the time it auto-starts
   - *Mitigation*: Validate prerequisites again at auto-start time; skip invalid items with notification

3. **Faction Bonus Stacking Complexity**: Multiple tech bonuses + faction base bonuses + facility bonuses all multiplying
   - *Mitigation*: Consistent multiplicative model throughout; log accumulated bonuses for debugging

4. **Performance with Simultaneous Research (Autoforge)**: Two concurrent `advanceResearch` calls per turn
   - *Mitigation*: Trivially fast (just decrement integers); no expected performance impact

### Low-Risk Areas

1. **JSON Data Files**: Well-defined schema, no runtime logic; easy to write and validate
2. **Serialization**: Straightforward JSON, no circular references
3. **Queue Reordering**: Simple array manipulation with UI update

## Dependencies

### Prerequisite Features
- **Faction Identity** (Planned) — Provides `faction.bonuses`, `faction.id`, starting tech IDs
- **Resource Management** (Planned) — `ResourceEngine.spendResources()` called when research begins
- **DataBridge** (✅ Implemented) — State persistence
- **Galaxy Generation** (✅ Implemented) — Research Facility special type used for cost discount

### Blocked Features (Waiting on Tech System)
- **Fleet Management** (Phase 1B) — Unit unlocks (Dreadnought, Stealth Ship, etc.) need tech system
- **Base Construction** (Phase 1C) — Building unlocks need tech system
- **Mission System** (Phase 1B) — Mission unlocks ("Incite Uprising", "Deep Cover") need tech system
- **Victory Conditions** — Tier 5 techs enable/accelerate specific victory paths

### Parallel Development (Can Proceed Independently)
- **Galaxy Map Rendering** — No tech dependency
- **System Loyalty System** — Independent; tech system reads loyalty, doesn't modify it directly
- **Save/Load Infrastructure** — Can build general save/load before tech state added

## Future Enhancements (Post Phase 1A)

### Phase 1B Integration
- [ ] Connect tech unlocks to Fleet Management (actually construct unlocked ships)
- [ ] Connect mission unlocks to Mission System (enable mission type in UI)
- [ ] "Acquire Technology" espionage mission — copy tech from enemy faction
- [ ] Character-assisted research — assign character to research project for speed bonus
- [ ] Brand Authority and Union Tier 4 multi-research unlock (parity with Autoforge)

### Phase 1C Enhancements
- [ ] Research Lab buildings providing additional -15% cost reduction
- [ ] Branching tech paths (mutually exclusive specializations within a tier)
- [ ] Additional Tier 6-7 for extended campaigns
- [ ] Tech tree customization (player chooses starting tech from Tier 1 selection)

### Phase 1D Enhancements
- [ ] Tech achievements (bonus for completing all Tier X techs)
- [ ] Animated tech tree (particle effects on completion, animated connection lines)
- [ ] "Acquire Technology" advanced mechanics (partial steal, counter-intel)
- [ ] Tech trading between factions as diplomatic agreement

### Modding Support
- [ ] JSON tech definitions fully moddable (add new tech without code change)
- [ ] New effect types require one new `case` in `TechEffectApplier`
- [ ] Support custom faction IDs in tech tree JSON → custom faction modding
- [ ] Provide tech tree creation guide in `.prodspec` docs

## References

- [Technology/Research Tree Spec](./spec.md)
- [Faction Identity Spec](../faction-identity/spec.md)
- [Faction Identity Plan](../faction-identity/plan.md)
- [Resource Management Spec](../resource-management/spec.md)
- [Resource Management Plan](../resource-management/plan.md)
- [Feature Catalog](../../product/feature-catalog.md)
- [Galaxy Generator](../../../core/galaxy-generator.js)
- [DataBridge](../../../core/data-bridge.js)
- [Project README](../../../README.md)
- [IMPLEMENTATION_SUMMARY](../../../IMPLEMENTATION_SUMMARY.md)
