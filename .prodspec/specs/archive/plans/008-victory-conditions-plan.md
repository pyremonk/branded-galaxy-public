# Victory Conditions - Technical Implementation Plan

## Architecture Overview

The Victory Conditions system is a **multi-faction progress tracking and validation engine** that evaluates 16 distinct victory paths (4 per faction) each turn. It operates as a **read-only observer** over game state — it never mutates game state itself, only reads it to compute progress and fire events. This keeps the system clean, testable, and easy to extend.

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Victory Conditions System                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  Victory Config  │→ │ Progress Updater │→ │ Victory Validator │  │
│  │     (JSON)       │  │  (per turn)      │  │  (win detection)  │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────┘  │
│                               ↓                        ↓             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  State Manager   │  │  Notification    │  │  Intelligence     │  │
│  │  (serialization) │  │  Engine          │  │  Filter           │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                               ↓
               ┌───────────────┴───────────────┐
               ↓                               ↓
         React Victory UI               Phaser HUD
         (screen + HUD indicators)      (end-game overlay)
```

### Core Modules

1. **VictoryConfig** (`core/victory-conditions.json`) — All 16 victory definitions, requirements, thresholds, unlock conditions
2. **VictoryProgressUpdater** (`core/victory-progress-updater.js`) — Recalculates progress values each turn for every condition
3. **VictoryValidator** (`core/victory-validator.js`) — Evaluates win conditions, detects victory, fires events
4. **VictoryStateManager** (`core/victory-state-manager.js`) — Per-faction state init, serialization, deserialization
5. **VictoryNotificationEngine** (`core/victory-notification-engine.js`) — 80%/95%/100% threshold alerts
6. **IntelligenceFilter** (`core/victory-intelligence-filter.js`) — Restricts visible opponent progress per intel level
7. **VictoryScreen** (`src/components/VictoryScreen.jsx`) — Full victory progress screen (V key)
8. **VictoryHUD** (`src/components/VictoryHUD.jsx`) — Compact HUD indicator for closest victory
9. **VictoryEndScreen** (`src/components/VictoryEndScreen.jsx`) — Win/Defeat screen with statistics
10. **PostGameStats** (`src/components/PostGameStats.jsx`) — Exportable comprehensive statistics panel

### Data Flow (Per Turn)

```
Turn Resolution Phase (after resource production)
    ↓
VictoryProgressUpdater.updateAll(gameState)
  → For each faction:
    → For each unlocked victory condition:
        updateTerritorialControl()      (count qualifying systems)
        updateEconomicDominance()       (read faction credits + trade hubs)
        updateCumulativeLoyalty()       (add this turn's loyalty gains)
        updateSystemDependency()        (recalculate per-system dependency)
        updateResearchVictory()         (fraction of tech tree complete)
        updateManufacturingVictory()    (read cumulative unit counter)
        updateSurvivalVictory()         (increment turn counter, check conditions)
        updateNonAggressionTurns()      (increment or reset based on actions)
        updateLiberationCounter()       (incremented by loyalty change events)
        ...etc
    ↓
VictoryValidator.checkAll(gameState)
  → For each faction, each unlocked condition:
      evaluateCondition(condition)  → boolean
        If true → triggerVictory(faction, conditionId)
          → Pause game
          → Display VictoryEndScreen
          → Log to game state
    ↓
VictoryNotificationEngine.checkThresholds(gameState)
  → Any faction at 80%+: notify all players (warning)
  → Any faction at 95%+: urgent alert
  → Victory just triggered: victory/defeat notification

Player Opens Victory Screen (V key or HUD click)
    ↓
VictoryScreen renders faction's victoryProgress
  → IntelligenceFilter.filterOpponentProgress() restricts opponent data
```

## Technical Approach

### Module Structure

```javascript
// core/victory-conditions.json
{
  "victoryConditions": {
    "brandAuthority": [
      {
        "id": "vc-ba-territorial-control",
        "name": "Territorial Control",
        "description": "Establish economic and military dominance across the galaxy",
        "difficulty": "medium",
        "type": "percentage",
        "required": 70,
        "secondaryRequired": null,
        "unlockCondition": null,
        "trackingNote": "Systems with loyalty=brandAuthority and loyaltyValue>=60 / total systems * 100"
      },
      {
        "id": "vc-ba-military-elimination",
        "name": "Military Elimination",
        "description": "Crush all opposition through overwhelming military might",
        "difficulty": "hard",
        "type": "boolean-composite",
        "conditions": [
          { "key": "unionBaseDestroyed",         "label": "Union secret base destroyed" },
          { "key": "unionFleetsDestroyed",        "label": "All Union fleets eliminated" },
          { "key": "autoforgeCapitalsCaptured",   "label": "All Autoforge capital systems captured" },
          { "key": "autoforgeFleetsDestroyed",    "label": "All Autoforge fleets eliminated" }
        ],
        "unlockCondition": null
      },
      {
        "id": "vc-ba-economic-dominance",
        "name": "Economic Dominance",
        "description": "Achieve unassailable economic supremacy",
        "difficulty": "hard",
        "type": "threshold-with-secondary",
        "required": 500000,
        "primaryLabel": "Credits accumulated",
        "secondaryRequired": 50,
        "secondaryLabel": "Trade hubs controlled (%)",
        "unlockCondition": { "type": "technology", "techId": "galactic-administration" }
      },
      {
        "id": "vc-ba-discovery",
        "name": "Discovery Victory",
        "description": "Eliminate the rebel threat by destroying their hidden stronghold",
        "difficulty": "medium",
        "type": "boolean-composite",
        "conditions": [
          { "key": "secretBaseKnown",    "label": "Union base location known" },
          { "key": "secretBaseDestroyed", "label": "Union secret base destroyed" }
        ],
        "unlockCondition": null
      }
    ],
    "union": [
      {
        "id": "vc-un-cumulative-loyalty",
        "name": "Cumulative Loyalty",
        "description": "Win the hearts and minds of the galaxy",
        "difficulty": "medium",
        "type": "counter",
        "required": 5000,
        "hiddenUntilPercent": 50,
        "unlockCondition": null
      },
      {
        "id": "vc-un-survival",
        "name": "Survival Victory",
        "description": "Outlast the oppressors and prove the resistance endures",
        "difficulty": "hard",
        "type": "composite",
        "conditions": [
          { "key": "turns",             "required": 100,  "label": "Turns survived" },
          { "key": "secretBaseIntact",  "required": true, "label": "Secret base intact" },
          { "key": "territoryControl",  "required": 30,   "label": "Galaxy control (%)" }
        ],
        "unlockCondition": null
      },
      {
        "id": "vc-un-liberation",
        "name": "Liberation Victory",
        "description": "Free the oppressed systems from corporate tyranny",
        "difficulty": "medium",
        "type": "counter",
        "required": 50,
        "hiddenUntilPercent": 50,
        "trackingNote": "Counts Brand Authority → Union loyalty transitions only",
        "unlockCondition": null
      },
      {
        "id": "vc-un-heroic",
        "name": "Heroic Victory",
        "description": "Ignite the spark of revolution that liberates the entire galaxy",
        "difficulty": "hard",
        "type": "mission-chain",
        "required": 5,
        "missionChain": [
          { "id": "inspire-hope",          "label": "Inspire Hope" },
          { "id": "sabotage-propaganda",   "label": "Sabotage Propaganda" },
          { "id": "rescue-champion",       "label": "Rescue Champion" },
          { "id": "rally-people",          "label": "Rally the People" },
          { "id": "revolutionary-spark",   "label": "Revolutionary Spark" }
        ],
        "unlockCondition": { "type": "technology", "techId": "revolutionary-spark" }
      }
    ],
    "autoforge": [
      {
        "id": "vc-af-system-dependency",
        "name": "System Dependency",
        "description": "Create universal dependence on automated technology",
        "difficulty": "medium",
        "type": "percentage",
        "required": 60,
        "unlockCondition": null
      },
      {
        "id": "vc-af-research",
        "name": "Research Victory",
        "description": "Achieve technological singularity",
        "difficulty": "medium",
        "type": "percentage",
        "required": 100,
        "unlockCondition": null
      },
      {
        "id": "vc-af-manufacturing",
        "name": "Manufacturing Victory",
        "description": "Demonstrate industrial supremacy through mass production",
        "difficulty": "medium",
        "type": "counter",
        "required": 1000,
        "hiddenUntilPercent": 50,
        "unlockCondition": null
      },
      {
        "id": "vc-af-peaceful",
        "name": "Peaceful Victory",
        "description": "Prove coexistence through technological symbiosis",
        "difficulty": "hard",
        "type": "composite",
        "conditions": [
          { "key": "nonAggressionTurns", "required": 75, "label": "Non-aggression turns" },
          { "key": "territoryControl",   "required": 25, "label": "Galaxy control (%)" }
        ],
        "unlockCondition": null
      }
    ]
  }
}

// core/victory-state-manager.js
export class VictoryStateManager {
  static initializeFactionState(factionId) {
    const stateMap = {
      brandAuthority: {
        'vc-ba-territorial-control':  { type: 'percentage',        current: 0,  required: 70,  unlocked: true,  notifiedAt: [] },
        'vc-ba-military-elimination': { type: 'boolean-composite', current: false, conditions: { unionBaseDestroyed: false, unionFleetsDestroyed: false, autoforgeCapitalsCaptured: false, autoforgeFleetsDestroyed: false }, unlocked: true, notifiedAt: [] },
        'vc-ba-economic-dominance':   { type: 'threshold-with-secondary', current: 0, required: 500000, secondaryCurrent: 0, secondaryRequired: 50, unlocked: false, notifiedAt: [] },
        'vc-ba-discovery':            { type: 'boolean-composite', current: false, conditions: { secretBaseKnown: false, secretBaseDestroyed: false }, unlocked: true, notifiedAt: [] }
      },
      union: {
        'vc-un-cumulative-loyalty':   { type: 'counter',    current: 0,   required: 5000, unlocked: true,  notifiedAt: [] },
        'vc-un-survival':             { type: 'composite',  current: { turns: 0, secretBaseIntact: true, territoryControl: 0 }, required: { turns: 100, secretBaseIntact: true, territoryControl: 30 }, unlocked: true, notifiedAt: [] },
        'vc-un-liberation':           { type: 'counter',    current: 0,   required: 50,   unlocked: true,  notifiedAt: [] },
        'vc-un-heroic':               { type: 'mission-chain', current: 0, required: 5, missionChain: [{ id: 'inspire-hope', completed: false }, { id: 'sabotage-propaganda', completed: false }, { id: 'rescue-champion', completed: false }, { id: 'rally-people', completed: false }, { id: 'revolutionary-spark', completed: false }], unlocked: false, notifiedAt: [] }
      },
      autoforge: {
        'vc-af-system-dependency':    { type: 'percentage', current: 0,  required: 60,   unlocked: true,  notifiedAt: [] },
        'vc-af-research':             { type: 'percentage', current: 0,  required: 100,  unlocked: true,  notifiedAt: [] },
        'vc-af-manufacturing':        { type: 'counter',    current: 0,  required: 1000, unlocked: true,  notifiedAt: [] },
        'vc-af-peaceful':             { type: 'composite',  current: { nonAggressionTurns: 0, territoryControl: 0 }, required: { nonAggressionTurns: 75, territoryControl: 25 }, unlocked: true, notifiedAt: [] }
      }
    };
    return stateMap[factionId];
  }

  static serialize(victoryProgress)  { return JSON.stringify(victoryProgress); }
  static deserialize(json)           { return JSON.parse(json); }
}
```

## Implementation Tasks

### Phase 1: Victory Configuration
**Goal**: Define all 16 victory conditions in JSON with requirements and unlock conditions

**Status**: Complete

#### Victory Conditions Config File
- [x] Create `core/victory-conditions.json`
- [x] Define schema: top-level `victoryConditions` object keyed by `factionId`
- [x] Each condition has: `id`, `name`, `description`, `difficulty`, `type`, `required`, `unlockCondition`
- [x] Add Brand Authority Territorial Control (`type: "percentage"`, `required: 70`)
- [x] Add Brand Authority Military Elimination (`type: "boolean-composite"`, 4 conditions)
- [x] Add Brand Authority Economic Dominance (`type: "threshold-with-secondary"`, `required: 500000`, secondary 50% trade hubs, `unlockCondition: galactic-administration`)
- [x] Add Brand Authority Discovery Victory (`type: "boolean-composite"`, base known + destroyed)
- [x] Add Union Cumulative Loyalty (`type: "counter"`, `required: 5000`, `hiddenUntilPercent: 50`)
- [x] Add Union Survival Victory (`type: "composite"`, turns 100, secretBaseIntact true, territory 30%)
- [x] Add Union Liberation Victory (`type: "counter"`, `required: 50`, `hiddenUntilPercent: 50`)
- [x] Add Union Heroic Victory (`type: "mission-chain"`, `required: 5`, mission chain IDs, `unlockCondition: revolutionary-spark`)
- [x] Add Autoforge System Dependency (`type: "percentage"`, `required: 60`)
- [x] Add Autoforge Research Victory (`type: "percentage"`, `required: 100`)
- [x] Add Autoforge Manufacturing Victory (`type: "counter"`, `required: 1000`, `hiddenUntilPercent: 50`)
- [x] Add Autoforge Peaceful Victory (`type: "composite"`, nonAggression 75, territory 25%)
- [x] Add `difficultyRating` field to each condition (easy/medium/hard)
- [x] Add `discoveryMechanics` metadata for Brand Authority Discovery Victory (15% espionage, 50% interrogation, 5% event)
- [x] Validate JSON syntax and completeness
- [ ] Test config loads without errors

#### VictoryConfig Loader
- [x] Create `core/victory-config-loader.js`
- [x] Implement `VictoryConfigLoader` class
- [x] Add `load()` — imports `victory-conditions.json`
- [x] Add `getConditionsForFaction(factionId)` — returns array of condition definitions
- [x] Add `getCondition(conditionId)` — global lookup across all factions
- [x] Add `validateConfig(config)` — verify required fields on each condition
- [ ] Test loader returns correct conditions for each faction
- [ ] Test validation catches missing required fields

### Phase 2: Victory State Manager
**Goal**: Create per-faction victory progress state structure with initialization and serialization

**Status**: Complete

#### VictoryStateManager Module
- [x] Create `core/victory-state-manager.js`
- [x] Implement `VictoryStateManager` class
- [x] Implement static `initializeFactionState(factionId)` factory method
- [x] Return full per-faction victory progress object with defaults per condition type:
  - `percentage`: `current: 0`, `required: N`, `unlocked: <bool>`, `notifiedAt: []`
  - `counter`: `current: 0`, `required: N`, `unlocked: <bool>`, `notifiedAt: []`
  - `boolean-composite`: `current: false`, `conditions: {...}`, `unlocked: <bool>`, `notifiedAt: []`
  - `threshold-with-secondary`: primary and secondary `current`, `required`, `unlocked`, `notifiedAt: []`
  - `composite`: `current: {...}` and `required: {...}` objects, `unlocked: <bool>`, `notifiedAt: []`
  - `mission-chain`: `current: 0`, `required: 5`, `missionChain: [...]`, `unlocked: <bool>`, `notifiedAt: []`
- [x] Add `closestVictory: null` and `turnsToVictory: null` meta-fields (computed, not persisted)
- [ ] Test initialization returns correct structure for all three factions
- [ ] Test all default values correct (no nulls where numbers expected)

#### Serialization and Deserialization
- [x] Implement static `serialize(victoryProgress)` → JSON string
- [x] Implement static `deserialize(json)` → plain object (no class dependency)
- [x] Validate deserialized object has all required condition keys
- [x] Handle missing keys gracefully (re-initialize missing conditions to defaults)
- [ ] Test round-trip preserves all counter values, booleans, and composite conditions
- [ ] Test deserialize handles old save formats without crashing

#### Unlock Condition Tracking
- [x] Add `unlocked: false` to conditions with `unlockCondition` in config
- [x] Implement `unlockCondition(victoryProgress, conditionId)` method
- [x] Set `condition.unlocked = true`
- [x] Initialize `current` baseline from current game state at time of unlock
- [x] Return notification payload `{ conditionId, name }` for UI
- [ ] Test unlocking sets `unlocked: true`
- [ ] Test unlocking starts progress tracking from current state (not 0)

### Phase 3: Victory Progress Updater
**Goal**: Compute per-turn progress for all 16 victory conditions across all active factions

**Status**: Complete

#### VictoryProgressUpdater Module
- [x] Create `core/victory-progress-updater.js`
- [x] Implement `VictoryProgressUpdater` class
- [x] Implement `updateAll(gameState)` — iterates all active factions, all unlocked conditions
- [x] Each update method is pure (reads game state, writes to `faction.victoryProgress[id]`)
- [x] `updateAll()` returns `{ updated: conditionIds[] }` for notification system
- [ ] Test `updateAll()` processes all factions in one call

#### Brand Authority: Territorial Control
- [x] Implement `updateTerritorialControl(faction, victoryProgress, gameState)` method
- [x] Filter systems: `loyalty === 'brandAuthority' && loyaltyValue >= 60`
- [x] Calculate: `Math.floor((count / totalSystems) * 100)`
- [x] Write to `victoryProgress['vc-ba-territorial-control'].current`
- [ ] Test with 0/partial/all qualifying systems
- [ ] Test uses `Math.floor()` (no rounding up to 70%)

#### Brand Authority: Military Elimination
- [x] Implement `updateMilitaryElimination(faction, victoryProgress, gameState)` method
- [x] Update `conditions.unionBaseDestroyed` — check `gameState.unionSecretBase.destroyed`
- [x] Update `conditions.unionFleetsDestroyed` — check all fleets with `loyalty === 'union'` are empty
- [x] Update `conditions.autoforgeCapitalsCaptured` — check all Autoforge capital systems have `loyalty !== 'autoforge'`
- [x] Update `conditions.autoforgeFleetsDestroyed` — check all fleets with `loyalty === 'autoforge'` are empty
- [x] Set `condition.current = true` only when ALL four conditions true
- [ ] Test individual condition tracking
- [ ] Test overall true only when all four met

#### Brand Authority: Economic Dominance (locked initially)
- [x] Implement `updateEconomicDominance(faction, victoryProgress, gameState)` method
- [x] Skip if `condition.unlocked === false`
- [x] Update `condition.current` with `faction.resources.credits`
- [x] Count trade hub systems with `loyalty === 'brandAuthority'`
- [x] Count total trade hub systems (`specialType === 'tradeHub'`)
- [x] Calculate `secondaryCurrent = Math.floor((controlled / total) * 100)`
- [x] Write both primary and secondary current values
- [ ] Test credits threshold tracked correctly
- [ ] Test trade hub percentage calculated correctly
- [ ] Test skipped when not unlocked

#### Brand Authority: Discovery Victory
- [x] Implement `updateDiscoveryVictory(faction, victoryProgress, gameState)` method
- [x] Update `conditions.secretBaseKnown` — check `gameState.unionSecretBaseLocation.revealedTo.includes('brandAuthority')`
- [x] Update `conditions.secretBaseDestroyed` — check `gameState.unionSecretBase.destroyed`
- [x] Set `condition.current = true` when `secretBaseDestroyed === true`
- [ ] Test base known/unknown tracking
- [ ] Test victory fires only when destroyed (not just known)

#### Secret Base Discovery Mechanics
- [x] Implement `rollSecretBaseDiscovery(faction, gameState)` — called during mission resolution
- [x] Espionage mission in Union territory: 15% chance to set `secretBaseLocation.revealedTo.push('brandAuthority')`
- [x] Captured Union character interrogation: 50% chance to reveal
- [x] Per-turn passive event roll: 5% chance "Intercepted Transmission" reveals base
- [x] On reveal: fire notification "Union Secret Base Location Discovered!"
- [ ] Test per-mission 15% probability (statistical validation)
- [ ] Test per-turn 5% passive check fires notification

#### Union: Cumulative Loyalty
- [x] Implement `updateCumulativeLoyalty(faction, victoryProgress, gameState)` method
- [x] Each turn, sum loyalty gain across all Union-influenced systems:
  - `sum of max(0, system.loyaltyValue - 50)` for systems where Union has influence
- [x] Add delta to `condition.current` (cumulative counter, never resets)
- [ ] Test adds each turn's loyalty gain to running total
- [ ] Test negative loyalty (loyalty < 50) contributes 0, not negative
- [ ] Test counter persists correctly across saves

#### Union: Survival Victory
- [x] Implement `updateSurvivalVictory(faction, victoryProgress, gameState)` method
- [x] Update `condition.current.turns = gameState.currentTurn`
- [x] Update `condition.current.secretBaseIntact = !gameState.unionSecretBase.destroyed`
- [x] Count Union-controlled systems, calculate `territoryControl %`
- [x] Write to `condition.current.territoryControl`
- [ ] Test turn counter increments correctly
- [ ] Test secret base flag reflects real-time state
- [ ] Test territory control calculated correctly

#### Union: Liberation Counter
- [x] Implement `incrementLiberationCounter(faction, victoryProgress, fromFactionId)` — event-driven, not turn-based
- [x] Called when a system changes `loyalty` from `'brandAuthority'` to `'union'`
- [x] Only increments if `fromFactionId === 'brandAuthority'` (neutral → union does not count)
- [x] Increment `condition.current` by 1 (cumulative, never decrements)
- [ ] Test increments on Brand Authority → Union transitions
- [ ] Test does NOT increment on neutral → Union or Autoforge → Union transitions
- [ ] Test counter never decrements even if system later recaptured

#### Union: Heroic Victory (Mission Chain)
- [x] Implement `updateHeroicVictory(faction, victoryProgress, gameState)` method
- [x] Skip if `condition.unlocked === false`
- [x] Update `condition.current` = count of `missionChain` entries where `completed === true`
- [x] Implement `completeMissionChainStep(victoryProgress, stepId)` — called by Mission System on step completion
- [x] Set corresponding `missionChain[i].completed = true`
- [x] Increment `condition.current`
- [x] Mission chain must complete in order (step N requires step N-1 completed)
- [ ] Test chain steps only available in order
- [ ] Test `condition.current` increments with each step
- [ ] Test final step triggers victory validation

#### Autoforge: System Dependency
- [x] Implement `updateSystemDependency(faction, victoryProgress, gameState)` method
- [x] For each system in `gameState.systems`, calculate dependency score:
  - `+15` per Autoforge facility in system (`system.facilities.filter(f => f.faction === 'autoforge').length * 15`)
  - `+20` if `system.tradeAgreements.includes('autoforge')`
  - `+10` if `system.population < 4 && system.loyalty !== 'autoforge'`
  - `+15` if `system.imports?.autoforgeGoods === true`
  - Cap at 100
- [x] Count systems with dependency ≥ 50
- [x] Calculate `Math.floor((dependentCount / totalSystems) * 100)`
- [x] Write to `condition.current`
- [ ] Test dependency calculation for each component
- [ ] Test cap at 100 per system
- [ ] Test victory threshold at 60%

#### Autoforge: Research Victory
- [x] Implement `updateResearchVictory(faction, victoryProgress, gameState)` method
- [x] Count `faction.techState.completedTechnologies.length`
- [x] Count total techs in Autoforge tree (from `TechTreeLoader`)
- [x] Calculate `Math.floor((completed / total) * 100)`
- [x] Write to `condition.current`
- [x] Victory triggers when `current === 100` (exactly 100%, not percentage ≥ 100)
- [ ] Test partial completion tracks correctly
- [ ] Test reaches 100% when all 15+ Autoforge techs complete

#### Autoforge: Manufacturing Counter
- [x] Implement `incrementManufacturingCounter(faction, victoryProgress, type)` — event-driven
- [x] Called when: ship constructed, facility built, droid unit produced
- [x] Increment `condition.current` by 1 per unit/facility
- [x] Counter is cumulative (never decrements if unit destroyed)
- [ ] Test increments for ships, buildings, and droid units independently
- [ ] Test counter persists correctly across saves

#### Autoforge: Peaceful Victory
- [x] Implement `updatePeacefulVictory(faction, victoryProgress, gameState)` method
- [x] Update `condition.current.territoryControl` from controlled system count
- [x] `nonAggressionTurns` counter incremented each turn if no aggressive acts
- [x] Implement `resetNonAggressionCounter(faction, victoryProgress)` — called on any aggressive act:
  - Autoforge attacks any other faction's system
  - Autoforge declares war
  - Autoforge conducts sabotage missions
- [x] Reset `condition.current.nonAggressionTurns = 0` on aggression
- [ ] Test counter increments each peaceful turn
- [ ] Test counter resets to 0 after any aggressive act
- [ ] Test territory control requirement calculated correctly

### Phase 4: Victory Validator
**Goal**: Evaluate win conditions each turn and trigger game-ending victory sequences

**Status**: Complete

#### VictoryValidator Module
- [x] Create `core/victory-validator.js`
- [x] Implement `VictoryValidator` class
- [x] Implement `checkAll(gameState)` — iterates all active factions and all unlocked conditions
- [x] Returns `{ victory: bool, faction: factionId, conditionId: string } | null`
- [x] Calls `evaluateCondition(faction, conditionId, condition)` for each
- [x] Stops on first victory found (returns immediately)
- [ ] Test returns null when no victory met
- [ ] Test returns correct faction/condition on victory

#### Condition Type Evaluators
- [x] Implement `evaluatePercentage(condition)` → `condition.current >= condition.required`
- [x] Implement `evaluateCounter(condition)` → `condition.current >= condition.required`
- [x] Implement `evaluateBooleanComposite(condition)` → `Object.values(condition.conditions).every(v => v === true)`
- [x] Implement `evaluateThresholdWithSecondary(condition)` → `primary >= required && secondary >= secondaryRequired`
- [x] Implement `evaluateComposite(condition)` → every key in `required` satisfied by `current`
  - Handle both numeric (`current.turns >= required.turns`) and boolean (`current.secretBaseIntact === required.secretBaseIntact`)
- [x] Implement `evaluateMissionChain(condition)` → `condition.current >= condition.required`
- [ ] Test each evaluator independently with edge values (just below and at threshold)

#### Turn Minimum Prerequisites
- [x] Some victory conditions have implied prerequisites (e.g., survival requires 100 turns)
- [x] Implement `checkPrerequisites(condition, gameState)` guard before evaluation
- [x] Survival Victory: minimum 100 turns enforced by turn counter in composite condition
- [x] Peaceful Victory: minimum 75 turns enforced by nonAggression counter
- [x] Research Victory: requires at least Tier 1 research complete (always true after init)
- [ ] Test prerequisites block early victory (turn 5 survival check returns false)

#### Tie-Breaking Logic
- [x] If multiple factions meet victory conditions on the same turn:
  - Primary: faction with more conditions met wins
  - Secondary: faction earlier in turn order wins
- [x] Implement `resolveTie(victories)` — accepts array of `{ faction, conditionId }`, returns winner
- [ ] Test tie-breaking selects correct winner
- [ ] Test single winner skips tie-breaking

#### Victory Trigger
- [x] Implement `triggerVictory(faction, conditionId, gameState)` method
- [x] Set `gameState.gameOver = true`
- [x] Set `gameState.winner = { factionId, conditionId, turnNumber }`
- [x] Pause game (prevent further player actions)
- [x] Dispatch `'game:victory'` event with winner data
- [x] Generate post-game statistics snapshot
- [ ] Test game pauses on victory
- [ ] Test winner data recorded correctly

#### Victory Prevention (Opponent Intervention)
- [x] Check if any victory conditions have blocking events (Phase 1B integration point)
- [x] E.g., Union secret base being rebuilt resets `vc-ba-discovery` conditions
- [x] Military elimination can be reversed if faction rebuilds forces
- [x] Document all re-evaluation triggers that can reset or reduce progress
- [ ] Test progress reductions applied correctly

### Phase 5: Victory Notification Engine
**Goal**: Alert players at 80%, 95%, and 100% victory progress thresholds

**Status**: Complete

#### VictoryNotificationEngine Module
- [x] Create `core/victory-notification-engine.js`
- [x] Implement `VictoryNotificationEngine` class
- [x] Implement `checkThresholds(gameState)` — runs after `VictoryProgressUpdater.updateAll()`
- [x] For each faction, each unlocked condition:
  - Calculate `getProgressPercent(condition)` (normalized 0-100)
  - If ≥80% and `notifiedAt` doesn't include 80: fire `'approaching'` notification, push `80` to `notifiedAt`
  - If ≥95% and `notifiedAt` doesn't include 95: fire `'imminent'` notification, push `95` to `notifiedAt`
- [x] `notifiedAt` ensures each threshold fires only once per game
- [ ] Test 80% notification fires exactly once
- [ ] Test 95% notification fires exactly once after 80%
- [ ] Test neither fires if progress drops back below threshold after notification (counter doesn't reset)

#### Progress Percent Normalization
- [x] Implement `getProgressPercent(condition)` — handles all condition types:
  - `percentage`: return `condition.current` directly
  - `counter`: `Math.floor((condition.current / condition.required) * 100)`
  - `threshold-with-secondary`: average of primary and secondary percentages
  - `boolean-composite`: `Math.floor((truthy values / total conditions) * 100)`
  - `composite`: average of each sub-condition's percent (numeric), and boolean = 0 or 100
  - `mission-chain`: `Math.floor((condition.current / condition.required) * 100)`
- [ ] Test returns 0 for empty state
- [ ] Test returns 100 for completed state (but not over 100)
- [ ] Test each condition type normalizes correctly

#### Notification Payloads
- [x] Define notification payload format: `{ type: 'victory-warning', faction, conditionId, conditionName, progressPercent, level: 'approaching' | 'imminent' }`
- [x] `'approaching'` (80-94%): yellow/orange banner — "⚡ [Faction] approaching [Victory Type] victory (80%)"
- [x] `'imminent'` (95%+): red urgent alert — "⚠️ [Faction] has NEAR-COMPLETE [Victory Type] victory (95%+)"
- [x] Show to ALL players (not just the faction approaching victory — opponent awareness is key)
- [x] Show "approaching" for own faction in different color (green/teal) vs opponent (red)
- [ ] Test notifications sent to all players
- [ ] Test faction-appropriate coloring

#### Unlock Notifications
- [x] Fire `'victory-unlocked'` notification when tech-gated condition becomes available
- [x] Payload: `{ faction, conditionId, conditionName, unlockedBy: techId }`
- [x] Display as in-game banner: "New Victory Condition Unlocked: [Name]"
- [ ] Test fires when `galactic-administration` completes for Brand Authority
- [ ] Test fires when `revolutionary-spark` completes for Union

### Phase 6: Intelligence Filter
**Goal**: Restrict opponent victory progress visibility based on espionage/intelligence level

**Status**: Complete

#### IntelligenceFilter Module
- [x] Create `core/victory-intelligence-filter.js`
- [x] Implement `IntelligenceFilter` class
- [x] Implement `filterOpponentProgress(viewerFactionId, targetFaction, gameState)` method
- [x] Returns redacted copy of `targetFaction.victoryProgress` based on visibility rules

#### Visibility Rules
- [x] **Own faction**: always full visibility — no filtering applied
- [x] **Opponent at ≥80% progress** (any condition): always visible to all players
- [x] **Opponent with active espionage network in their territory**: visible
- [x] **Hidden counters** (`hiddenUntilPercent` field in config): hidden if current progress < threshold
  - Cumulative Loyalty: hidden until >50% (2,500 points)
  - Liberation Victory: hidden until >50% (25 systems)
  - Manufacturing Victory: hidden until >50% (500 units)
- [x] **Default when no espionage**: show conditions and rough tier (0-25%, 25-50%, 50-75%, 75-100%) not exact value
- [ ] Test own faction returns unfiltered data
- [ ] Test opponent at 0% shows no detail without espionage
- [ ] Test opponent at 82% shows full detail (auto-visible)
- [ ] Test hidden counters obscured until threshold

#### Espionage Network Check
- [x] Implement `hasEspionageNetwork(viewerFactionId, targetFactionId, gameState)` — placeholder for Phase 1B
- [x] Phase 1A: return `false` (no espionage network system yet)
- [x] Phase 1B: integrate with Mission System (active spy in enemy territory)
- [ ] Test returns false in Phase 1A (opponent progress restricted to ≥80% threshold)

### Phase 7: Turn Integration
**Goal**: Integrate progress updates and validation into the turn resolution cycle

**Status**: Complete

#### Turn Resolution Hook
- [x] Identify turn resolution phase in `engine/main-stage.js` (or future turn system)
- [x] Call `VictoryProgressUpdater.updateAll(gameState)` in Resolution Phase
- [x] Call `VictoryValidator.checkAll(gameState)` immediately after progress update
- [x] If victory returned: call `triggerVictory()` and halt turn processing
- [x] Call `VictoryNotificationEngine.checkThresholds(gameState)` each turn
- [ ] Test victory check runs every turn
- [ ] Test game halts immediately when victory detected

#### Event Hooks for Cumulative Counters
- [x] Add `VictoryProgressUpdater.incrementLiberationCounter(faction)` call when system loyalty changes from Brand Authority to Union (in loyalty system)
- [x] Add `VictoryProgressUpdater.incrementManufacturingCounter(faction, type)` call when construction completes (in construction system)
- [x] Add `VictoryProgressUpdater.resetNonAggressionCounter(faction)` call when any Autoforge aggressive action fires
- [x] Add `VictoryProgressUpdater.completeMissionChainStep(faction, stepId)` call when mission chain step completes
- [x] Define clear integration points for each hook so Phase 1B systems know where to call
- [ ] Test each event hook increments/resets correct counter

#### Victory Unlock Integration with Tech System
- [x] When `TechResearchEngine.completeTechnology()` fires for `'galactic-administration'`:
  - Call `VictoryStateManager.unlockCondition(faction.victoryProgress, 'vc-ba-economic-dominance')`
  - Fire `'victory-unlocked'` notification
- [x] When `TechResearchEngine.completeTechnology()` fires for `'revolutionary-spark'`:
  - Call `VictoryStateManager.unlockCondition(faction.victoryProgress, 'vc-un-heroic')`
  - Fire `'victory-unlocked'` notification
- [ ] Test unlock fires when tech completes
- [ ] Test progress tracking begins immediately on unlock

#### Multi-Faction Support
- [x] Process all active factions in turn resolution (not just player faction)
- [x] AI factions' victory progress tracked identically to player faction
- [x] Victory check covers ALL factions simultaneously (AI can win if unchecked)
- [ ] Test AI faction progress updates each turn
- [ ] Test AI victory triggers end-game sequence same as player victory

### Phase 8: Victory Screen UI
**Goal**: Build the full-screen victory progress panel accessible via V key

**Status**: Complete

#### VictoryScreen Component
- [x] Create `src/components/VictoryScreen.jsx`
- [x] Create `src/components/VictoryScreen.css`
- [x] Accessible via `V` key hotkey or HUD indicator click
- [x] Close with `V` key again, Escape, or close button
- [x] Panel overlays game view (React layer, not Phaser)
- [ ] Test component opens and closes correctly

#### Player Faction Victory Conditions List
- [x] Display all 4 victory conditions for player's faction
- [x] Show condition name, description, difficulty badge (Easy/Medium/Hard)
- [x] Locked conditions shown grayed out with lock icon and unlock requirement text
- [x] Unlocked conditions shown in faction primary color
- [x] Progress bar per condition (fill based on normalized %)
- [x] Progress value label (e.g., "42% / 70%", "1,250 / 5,000 loyalty points", "23 / 50 systems liberated")
- [x] For composite conditions: sub-condition checklist with ✓/✗ per sub-item
- [x] For mission chain: numbered step list with ✓/✗ and current step highlighted
- [x] "ETA: ~18 turns" estimate for gradual conditions (based on recent turn delta)
- [ ] Test all condition types render correctly

#### Victory Condition Detail Panel
- [x] Click on condition row to expand detail panel (inline or modal)
- [x] Show full description text
- [x] Show complete requirements in plain language
- [x] Show unlock requirements if locked ("Requires: Galactic Administration (Tier 5)")
- [x] Show how progress is calculated (tooltip or section)
- [x] Show discovery mechanics hint for Brand Authority Discovery Victory
- [ ] Test detail panel shows all fields
- [ ] Test detail panel for locked condition shows unlock path

#### ETA Calculation
- [x] Implement `estimateTurnsToVictory(condition, recentHistory)` function
- [x] Track per-condition progress delta over last 3-5 turns
- [x] `turnsRemaining = Math.ceil((required - current) / averageDeltaPerTurn)`
- [x] Return null if delta is 0 (no progress trend)
- [x] Return null if progress is falling (display "—" in UI)
- [x] Cache calculation to avoid recomputing on every frame
- [ ] Test ETA based on 3-turn rolling average
- [ ] Test "—" shows when no progress trend

#### Opponent Victory Threats Section
- [x] Display opponent factions' known victory progress (below player section)
- [x] Apply `IntelligenceFilter.filterOpponentProgress()` to each opponent
- [x] Show opponent faction name and color
- [x] For visible conditions: show progress bar and value (fuzzy if partial visibility)
- [x] For hidden conditions: show "Intel Required" placeholder
- [x] Highlight conditions at ≥80% with warning color (orange/red)
- [x] Show "⚠️ IMMINENT VICTORY THREAT" for conditions at ≥95%
- [ ] Test opponent section renders filtered progress
- [ ] Test ≥80% conditions highlighted correctly

#### Color Coding
- [x] Progress bar color = `getProgressColor(progressPercent)`:
  - < 25%: gray (`#444`)
  - 25–49%: yellow (`#e3b341`)
  - 50–79%: green (`#3fb950`)
  - 80–94%: orange (`#f0883e`)
  - ≥95%: red (`#f85149`) with pulse animation
- [x] Apply same colors to HUD indicator
- [ ] Test each color tier displays correctly

### Phase 9: Victory HUD Indicator
**Goal**: Build the compact always-visible HUD element showing closest victory progress

**Status**: Complete

#### VictoryHUD Component
- [x] Create `src/components/VictoryHUD.jsx`
- [x] Create `src/components/VictoryHUD.css`
- [x] Shows compact progress for player's single closest victory condition
- [x] Display: condition icon + short name + progress bar + percentage
- [x] Click opens full VictoryScreen
- [x] Positioned near resource HUD (consistent location)
- [ ] Test HUD renders correctly and updates each turn

#### Closest Victory Calculation
- [x] Implement `findClosestVictory(victoryProgress)` — returns `{ conditionId, progressPercent }`
- [x] Compute `getProgressPercent(condition)` for each unlocked condition
- [x] Return condition with highest percent
- [x] If tie: prefer conditions the player is actively working toward (subjective heuristic — pick first in list)
- [x] Store as `faction.victoryProgress._closest` (recomputed each turn, not persisted)
- [ ] Test returns correct closest condition in all cases
- [ ] Test returns null if all conditions locked/0%

#### Opponent Warning Indicator
- [x] Show warning icon in HUD when any opponent has ≥80% progress on any visible condition
- [x] Warning icon: ⚠️ flashing orange
- [x] Tooltip: "The Brand Authority is approaching Military Elimination victory (82%)"
- [x] If ≥95%: red urgent icon with pulsing animation
- [ ] Test warning shows/hides based on opponent progress
- [ ] Test tooltip displays correct opponent + condition name

### Phase 10: End-Game Victory/Defeat Screen
**Goal**: Build the win/lose end-game overlay with statistics

**Status**: Complete

#### VictoryEndScreen Component
- [x] Create `src/components/VictoryEndScreen.jsx`
- [x] Create `src/components/VictoryEndScreen.css`
- [x] Triggered by `'game:victory'` event (game state `gameOver = true`)
- [x] Full-screen overlay above Phaser canvas
- [x] Different visual treatment for victory (celebratory) vs defeat (somber)
- [x] Faction-colored styling based on winner

#### Victory Screen Layout
- [x] Display winning faction name and emblem (large, prominent)
- [x] Display victory type name and description: "The Brand Authority achieved Territorial Control Victory"
- [x] Display final turn number
- [x] Display key statistic summary (top 3 most impressive stats)
- [x] Action buttons: "Continue Playing", "Return to Menu", "Save Final State", "View Statistics"
- [ ] Test victory screen renders for each faction × each victory condition
- [ ] Test all action buttons function correctly

#### Defeat Screen
- [x] Different layout for defeat (show own closest victory and encouraging message)
- [x] Show which condition the opponent won with
- [x] Show how close player's closest victory was: "You were X% away from [Victory Name]"
- [x] Same action buttons as victory screen
- [ ] Test defeat screen appears for non-winning factions (multiplayer) and for player in single-player

#### Final Game Statistics
- [x] Collect stats at time of `triggerVictory()`:
  - Final turn number, game start time → duration in minutes
  - Galaxy size (system count), faction count
  - Per-faction: peak systems controlled, final systems, total resources generated, total resources spent
  - Per-faction: technologies completed, units produced, missions conducted (success/failure rates)
  - Victory-specific: how condition was met, turns from unlock to victory
  - Opponent closest victory: condition ID and percentage for each faction
- [x] Store stats snapshot in `gameState.finalStats`
- [ ] Test stats snapshot collected correctly

#### PostGameStats Component
- [x] Create `src/components/PostGameStats.jsx`
- [x] Accessible from "View Statistics" button on end screen
- [x] Tabbed layout: General | Faction Stats | Victory | Opponents
- [x] Bar charts or simple number displays for each stat category
- [x] "Export JSON" button — downloads `finalStats` as `branded-galaxy-stats-[turn].json`
- [ ] Test stats display for all tabs
- [ ] Test JSON export generates correct file

### Phase 11: DataBridge Persistence
**Goal**: Persist all victory progress across save/load cycles

**Status**: Complete

#### Save Victory State
- [x] Extend faction save data to include `victoryProgress` (serialized from `VictoryStateManager`)
- [x] Serialize: all condition `current` values, `unlocked` flags, `notifiedAt` arrays, cumulative counters
- [x] Do NOT persist `closestVictory` and `turnsToVictory` (recomputed on load)
- [x] Save via `dataBridge.saveFactionState()` (or combined game save)
- [ ] Test victory progress persists in offline (localStorage) mode
- [ ] Test victory progress persists in cloud (Supabase) mode when env vars set

#### Load Victory State
- [x] Deserialize victory progress using `VictoryStateManager.deserialize(json)`
- [x] Validate all condition keys present — init missing conditions to defaults
- [x] Restore cumulative counters (loyalty, liberation, manufacturing, non-aggression)
- [x] Restore `notifiedAt` arrays (prevents re-firing threshold notifications)
- [x] Restore `unlocked` flags (tech-unlocked conditions remain unlocked)
- [x] Recompute `closestVictory` and `turnsToVictory` after load (not saved)
- [ ] Test loaded state matches saved state exactly
- [ ] Test victory check on first turn after load produces same result as pre-save

#### Save Final Stats
- [x] Save `gameState.finalStats` when `gameOver = true`
- [x] Include postGame statistics snapshot
- [x] Accessible for post-game review even after "Return to Menu"
- [ ] Test final stats persist after game ends

#### Schema Versioning
- [x] Add `victoryStateVersion: 1` to serialized state
- [x] On load: check version, apply migration if schema changed
- [x] Old saves without `victoryStateVersion`: re-initialize all conditions
- [ ] Test old save format doesn't crash on load

### Phase 12: Balance Validation and Performance
**Goal**: Validate victory pacing, threshold balance, and performance targets

**Status**: Not started

#### Turn Count Validation (Manual)
- [ ] Simulate Brand Authority Territorial Control: estimate turns for 70% at normal production (target 80-120)
- [ ] Simulate Union Cumulative Loyalty: estimate turns to 5,000 cumulative points
- [ ] Simulate Autoforge Research Victory: estimate turns to complete full tree (should be ~86 for Autoforge)
- [ ] Simulate Autoforge Peaceful Victory: verify 75 turns non-aggression is achievable without collapse
- [ ] Identify any conditions obviously outside 80-120 turn range and flag for adjustment
- [ ] Document recommended threshold adjustments for balance team

#### Victory Condition Difficulty Ratings Check
- [ ] Review all 16 conditions against stated difficulty (Easy/Medium/Hard)
- [ ] Verify no "Easy" condition achievable in < 30 turns
- [ ] Verify no "Hard" condition requires > 150 turns optimally
- [ ] Adjust difficulty labels or requirements based on analysis
- [ ] Document reasoning for each difficulty assignment

#### Performance Benchmarking
- [ ] Measure `VictoryProgressUpdater.updateAll()` time with 3 factions, 100 systems (target < 20ms)
- [ ] Measure `VictoryValidator.checkAll()` time (target < 5ms)
- [ ] Measure `VictoryNotificationEngine.checkThresholds()` time (target < 2ms)
- [ ] Measure `VictoryScreen` initial render time (target < 200ms)
- [ ] Measure `PostGameStats` data collection at game end (target < 500ms)
- [ ] Profile System Dependency calculation (most CPU-intensive per turn) separately
- [ ] Optimize if any target missed (cache dependency scores, lazy compute)

#### System Dependency Calculation Optimization
- [ ] Profile `calculateSystemDependency()` across 100+ systems per turn
- [ ] Cache dependency scores and invalidate only on relevant state changes
- [ ] Consider computing dependency incrementally (delta on facility/trade changes)
- [ ] Test cached vs fresh calculation produces same result
- [ ] Verify optimization achieves target (< 20ms total for all conditions)

#### Correctness Unit Tests
- [ ] Test `evaluatePercentage()`: values below, at, and above threshold
- [ ] Test `evaluateBooleanComposite()`: all false, partial true, all true
- [ ] Test `evaluateComposite()`: survival with all conditions met, one missing
- [ ] Test `evaluateThresholdWithSecondary()`: both met, only primary met, only secondary met
- [ ] Test `getProgressPercent()` for all 6 condition types at 0%, 50%, 100%
- [ ] Test `incrementLiberationCounter()` only fires on correct transition
- [ ] Test `resetNonAggressionCounter()` fires on each aggression type
- [ ] Test `checkThresholds()` fires notifications at exactly 80% and 95%
- [ ] Test tie-breaking logic with simultaneous victories

### Phase 13: Polish, Edge Cases, and Documentation
**Goal**: Polish end-game UI, handle edge cases, document the system

**Status**: Not started

#### Edge Case Handling
- [ ] Handle: Union secret base rebuilt after discovery — `conditions.secretBaseDestroyed` can only be set to `true` permanently (destroyed = destroyed)
- [ ] Handle: All factions meet victory conditions on same turn (tie-breaking logic)
- [ ] Handle: Player continues game after first victory — victory tracker resets for all conditions allowing "next victory" pursuit (sandbox mode)
- [ ] Handle: Brand Authority Economic Dominance — credits fluctuate; victory only triggers while BOTH conditions simultaneously met (snapshot check each turn, not cumulative)
- [ ] Handle: Autoforge Singularity Protocol auto-completing Tier 1-4 techs — Research Victory should fire next turn
- [ ] Handle: game loaded on the exact turn victory would trigger — run victory check on first turn after load
- [ ] Test each edge case handled without crash or incorrect outcome

#### Victory Screen Polish
- [ ] Add animated progress bars (fill on open)
- [ ] Add faction emblem/logo to victory screen header
- [ ] Add map thumbnail showing final galaxy state (last rendered map frame)
- [ ] Smooth transition animation when screen opens/closes
- [ ] Pulsing red border on opponent conditions at ≥95%
- [ ] Test animations run at 60 FPS

#### End-Game Screen Polish
- [ ] Victory: animated confetti or particle effect (Phaser overlay or CSS)
- [ ] Defeat: darkened overlay, muted colors
- [ ] Each victory type has unique flavor text / narrative summary
- [ ] Show a key moment or statistic ("Brand Authority controlled 72% of the galaxy at peak")
- [ ] Test visual polish adds to experience without impacting performance

#### Notification Polish
- [ ] Faction opponent warnings use faction colors (red for warning, faction color for own progress)
- [ ] Stack multiple notifications if several fire in same turn
- [ ] Auto-dismiss after 6 seconds or on click
- [ ] Link from notification to relevant part of Victory Screen
- [ ] Test stacked notifications display in order

#### Code Documentation
- [ ] JSDoc on all `VictoryProgressUpdater` public methods
- [ ] JSDoc on all `VictoryValidator` methods
- [ ] JSDoc on `IntelligenceFilter` explaining visibility rules
- [ ] Document victory condition JSON schema
- [ ] Document event hooks (where other systems must call victory methods)
- [ ] `core/victory-conditions.json` has inline comments per condition explaining formula

#### Project Management Update
- [ ] Update `IMPLEMENTATION_SUMMARY.md` with victory conditions system
- [ ] Update `README.md` with victory paths for each faction
- [ ] Update `feature-catalog.md` status to "Complete"
- [ ] Update `backlog.md` (remove victory condition tasks)
- [ ] Update `roadmap.md` (mark victory conditions implemented)
- [ ] Cross-reference with Faction Identity, Resource Management, and Tech plans

## Completion Checklist

- [x] All Phase 1 tasks complete — **16 victory conditions defined in JSON**
- [x] All Phase 2 tasks complete — **Victory state manager with serialization**
- [x] All Phase 3 tasks complete — **Progress updater for all 16 conditions**
- [x] All Phase 4 tasks complete — **Victory validator with tie-breaking and trigger**
- [x] All Phase 5 tasks complete — **Notification engine at 80%/95%/100% thresholds**
- [x] All Phase 6 tasks complete — **Intelligence filter for opponent progress visibility**
- [x] All Phase 7 tasks complete — **Turn integration with event hooks**
- [x] All Phase 8 tasks complete — **Victory screen UI with ETA and opponent section**
- [x] All Phase 9 tasks complete — **Victory HUD indicator and opponent warning**
- [x] All Phase 10 tasks complete — **End-game victory/defeat screen and statistics**
- [x] All Phase 11 tasks complete — **DataBridge persistence**
- [ ] All Phase 12 tasks complete — **Balance validation and performance benchmarks**
- [ ] All Phase 13 tasks complete — **Polish, edge cases, documentation**
- [ ] All acceptance criteria from spec met
- [ ] Performance targets met: < 20ms per-turn checks, < 200ms screen load, < 500ms stats generation
- [ ] Manual testing complete: all 16 victory conditions trigger correctly, save/load preserves state, notifications fire correctly
- [ ] Documentation updated (README, IMPLEMENTATION_SUMMARY, feature-catalog, backlog, roadmap)
- [ ] Ready for Phase 1B integration (fleet destruction events, mission chain steps, diplomacy loyalty hooks)

## Risk Analysis

### High-Risk Areas

1. **Cumulative Counter Integrity on Save/Load**: Loyalty, Liberation, and Manufacturing counters must survive saves without loss or duplication
   - *Mitigation*: Counters saved as plain integers; only incremented via event hooks (not recomputed from scratch), so save/load is just restoring the number

2. **Autoforge System Dependency Calculation**: Most CPU-intensive per turn, O(n_systems) with O(m_facilities) inner loop
   - *Mitigation*: Incremental cache; recompute per-system dependency only when facilities/trade agreements change, not every turn for every system

3. **Peaceful Victory Non-Aggression Reset**: Complex to determine what constitutes "aggression" — needs clear contract with all Phase 1B systems
   - *Mitigation*: Define an explicit `AggressionEvent` enum; all systems fire a single `gameEvent.emit('autoforge:aggression')` that the victory system listens to

4. **Brand Authority Economic Dominance Credits Threshold**: Credits fluctuate — victory must hold BOTH conditions simultaneously at check time
   - *Mitigation*: Check per-turn, not cumulative; if credits drop below 500k before check, no victory that turn. This is by design.

5. **Union Secret Base Discovery Mechanics**: Three different revelation paths with different probabilities must integrate before Phase 1B mission system exists
   - *Mitigation*: Implement discovery mechanics as stubs in Phase 1A with clear integration points; passive 5%/turn already testable

### Medium-Risk Areas

1. **Intelligence Filter Complexity**: Fuzzy visibility rules (exact vs. tier vs. hidden) could confuse players
   - *Mitigation*: Default to "visible at ≥80%" for Phase 1A; tiered intelligence in Phase 1B when espionage exists

2. **Mission Chain (Heroic Victory)**: Five sequential missions require full Mission System (Phase 1B) to be meaningful
   - *Mitigation*: Track chain state in Phase 1A; actual mission completion hooks added in Phase 1B

3. **Multiple Victory Conditions Simultaneously**: Player may have two conditions both at 95% — UI must surface both threats clearly
   - *Mitigation*: VictoryHUD shows closest, but full VictoryScreen shows all; opponent warning shows any condition at ≥80%

4. **System Dependency Formula Balance**: Four independent components each adding 10-20% means easy to reach 50% dependency
   - *Mitigation*: Requires all 4 sources to be active (trade agreement + facilities + low pop + imports); playtesting needed

### Low-Risk Areas

1. **Serialization**: Plain integer counters and boolean flags; trivially safe
2. **Victory Validator Logic**: Purely boolean evaluation of existing state; no randomness, easy to test
3. **Notification Thresholds**: Simple percent comparisons with idempotent `notifiedAt` guard

## Dependencies

### Prerequisite Features
- **Faction Identity** (Planned) — Defines per-faction victory conditions, `faction.id`
- **Galaxy Generation** (✅ Implemented) — System data powering territorial/dependency victories
- **DataBridge** (✅ Implemented) — State persistence
- **Technology System** (Planned) — Tier 5 tech completions unlock two victory conditions; Research Victory reads tech state

### Dependent Features
- **Turn System** (Phase 1A) — Triggers `updateAll()` and `checkAll()` each turn
- **Resource Management** (Phase 1A) — Economic Dominance reads `faction.resources.credits`
- **Fleet Management** (Phase 1B) — Military Elimination requires fleet destruction tracking
- **Mission System** (Phase 1B) — Heroic Victory mission chain, espionage base discovery
- **Diplomacy & Loyalty** (Phase 1B) — Cumulative Loyalty reads loyalty change events; Liberation counter tracks loyalty transitions

### Event Hooks Required from Other Systems (Phase 1B Integration Points)
- Loyalty system: `on('system:loyaltyChanged', (system, from, to) => incrementLiberationCounter())`
- Construction system: `on('unit:constructed', (faction, type) => incrementManufacturingCounter())`
- Combat system: `on('fleet:fleetAction', (faction, target) => resetNonAggressionCounter())`
- Technology system: `on('tech:completed', (faction, techId) => checkVictoryUnlocks())`
- Mission system: `on('mission:stepCompleted', (faction, stepId) => completeMissionChainStep())`

## Future Enhancements (Post Phase 1A)

### Phase 1B Integration
- [ ] Connect fleet destruction to Military Elimination tracking
- [ ] Implement espionage network check in IntelligenceFilter
- [ ] Implement Heroic Victory mission chain step completion hooks
- [ ] Add Brand Authority base discovery via captured character interrogation (50% success)
- [ ] Intelligence reports include "Victory Threat Assessment" (top threat from each opponent)

### Phase 1C Enhancements
- [ ] Custom victory conditions via JSON config (player-defined goals)
- [ ] Alliance victories (team victories in multiplayer — both players win)
- [ ] Defeat conditions (auto-lose if certain catastrophic events occur)
- [ ] Speed run tracking (fastest win by condition type — leaderboard)

### Phase 1D Enhancements
- [ ] Campaign-specific victory conditions (story chapter goals)
- [ ] Challenge victories (extra difficulty modifiers)
- [ ] Sandbox mode: infinite game with milestone "soft victories" celebrated but not game-ending

### Modding Support
- [ ] All 16 victory definitions fully moddable via JSON
- [ ] Custom victory validation logic via JavaScript callback in config
- [ ] Custom victory UI templates per condition type
- [ ] Document adding a new victory condition (config + updater method + evaluator case)

## References

- [Victory Conditions Spec](./spec.md)
- [Faction Identity Spec](../faction-identity/spec.md)
- [Faction Identity Plan](../faction-identity/plan.md)
- [Resource Management Spec](../resource-management/spec.md)
- [Resource Management Plan](../resource-management/plan.md)
- [Technology/Research Tree Spec](../technology-research-tree/spec.md)
- [Technology/Research Tree Plan](../technology-research-tree/plan.md)
- [Feature Catalog](../../product/feature-catalog.md)
- [Galaxy Generator](../../../core/galaxy-generator.js)
- [DataBridge](../../../core/data-bridge.js)
- [Project README](../../../README.md)
- [IMPLEMENTATION_SUMMARY](../../../IMPLEMENTATION_SUMMARY.md)
