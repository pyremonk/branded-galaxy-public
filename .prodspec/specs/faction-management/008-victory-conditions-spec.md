# Victory Conditions

## Overview

Victory Conditions define how factions win games in Branded Galaxy, providing multiple asymmetric paths to victory that reinforce each faction's unique identity and strategic strengths. Each of the three factions has 3-4 distinct victory conditions, creating strategic diversity and replay value. The system tracks progress toward each victory condition, provides UI feedback, validates win conditions each turn, and triggers appropriate end-game sequences when victory is achieved.

This creates strategic depth through:
- **Asymmetric Victory**: Different factions pursue different goals
- **Multiple Paths**: Each faction can win via 3-4 different routes
- **Progress Tracking**: Players monitor victory progress in real-time
- **Strategic Tension**: Opponents can see victory threats and respond
- **Replayability**: Different victory paths encourage varied strategies

## Requirements

### FR-VC-001: Victory Condition System Architecture
- System shall track victory progress for all factions simultaneously
- Victory checks shall occur each turn during Resolution Phase (after production, before new turn)
- First faction to meet any victory condition wins the game
- Multiple victory conditions can be active simultaneously (first to complete wins)
- Victory condition progress shall be visible to all players (except secret progress for specific conditions)
- System shall support single-player (vs AI) and multiplayer (2-3 players)

### FR-VC-002: Victory Progress Tracking
- Each faction shall track progress toward all applicable victory conditions
- Progress tracked as:
  - **Percentage** (0-100%) for gradual conditions (e.g., territorial control)
  - **Boolean** (true/false) for binary conditions (e.g., secret base destroyed)
  - **Counter** (integer) for cumulative conditions (e.g., loyalty points earned)
  - **Threshold** (current/required) for resource-based conditions (e.g., credits accumulated)
- Progress shall update each turn automatically
- Progress shall be queryable via UI at any time

### FR-VC-003: Victory Notifications and Warnings
- System shall notify player when:
  - Victory condition becomes achievable (e.g., unlocked via tech)
  - Faction reaches 80% progress toward victory (warning to opponents)
  - Faction reaches 95% progress (imminent victory alert)
  - Victory condition is met (immediate notification)
- Notifications shall be faction-specific (each faction sees their own progress)
- Opponent progress shall be visible with appropriate warnings (anti-surprise)
- Notifications shall integrate with UI alert system

### FR-VC-004: Victory Condition Validation
- Victory conditions shall validate each turn:
  1. Check prerequisites (tech unlocks, turn minimums, etc.)
  2. Evaluate current state against victory requirements
  3. Trigger victory if all requirements met
  4. Log victory condition state changes
- Validation shall be deterministic (no randomness in victory checks)
- Validation shall be performant (< 20ms for all factions)

### FR-VC-005: End-Game Sequence
- When victory condition met:
  1. Pause game (prevent further actions)
  2. Display victory screen with:
     - Winning faction and victory type
     - Final statistics (turns taken, resources, systems controlled)
     - Victory condition requirements and how they were met
     - Losing factions' closest victory progress
  3. Offer options:
     - Continue playing (ignore victory, sandbox mode)
     - Return to main menu
     - Save final game state
     - View detailed post-game statistics
- Victory screen shall be visually distinctive and celebratory
- Losing factions shall see defeat screen with encouragement

### FR-VC-006: Brand Authority Victory Conditions
- **The Brand Authority has 4 possible victory paths**:

#### VC-BA-001: Territorial Control Victory
- **Requirement**: Control ≥70% of galaxy systems with average loyalty ≥60
- **Description**: "Establish economic and military dominance across the galaxy"
- **Tracking**:
  - Count systems with loyalty='brandAuthority' and loyaltyValue ≥60
  - Calculate percentage: `(qualifyingSystems / totalSystems) × 100`
  - Victory triggers when percentage ≥70%
- **Unlock**: Available from game start
- **Strategic Notes**: Most straightforward victory; requires military strength and diplomatic effort

#### VC-BA-002: Military Elimination Victory
- **Requirement**: Destroy all enemy factions' military and bases
  - The Union: Destroy secret base + all fleets
  - The Autoforge: Destroy all capital systems + all fleets
- **Description**: "Crush all opposition through overwhelming military might"
- **Tracking**:
  - Union secret base destroyed: Boolean
  - All Union fleets destroyed: Boolean
  - All Autoforge capital systems captured: Boolean
  - All Autoforge fleets destroyed: Boolean
  - Victory triggers when all conditions true
- **Unlock**: Available from game start
- **Strategic Notes**: High-risk, requires massive military investment; vulnerable to guerrilla tactics

#### VC-BA-003: Economic Dominance Victory
- **Requirement**: Accumulate 500,000 credits while controlling ≥50% of all trade hubs
- **Description**: "Achieve unassailable economic supremacy"
- **Tracking**:
  - Current credits: Integer
  - Trade hubs controlled: Count systems with specialType='tradeHub' and loyalty='brandAuthority'
  - Total trade hubs: Count all systems with specialType='tradeHub'
  - Trade hub percentage: `(controlled / total) × 100`
  - Victory triggers when credits ≥500,000 AND tradeHubPercent ≥50%
- **Unlock**: Requires Tier 5 "Galactic Administration" technology
- **Strategic Notes**: Economic focus; requires protecting trade routes and infrastructure

#### VC-BA-004: Discovery Victory (Union Secret Base Destruction)
- **Requirement**: Locate and destroy The Union's secret base
- **Description**: "Eliminate the rebel threat by destroying their hidden stronghold"
- **Tracking**:
  - Union secret base location known: Boolean
  - Union secret base destroyed: Boolean
  - Victory triggers when base destroyed
- **Unlock**: Available from game start
- **Discovery Mechanics**:
  - Espionage missions in Union territory have 15% chance to reveal base location
  - Captured Union characters can be interrogated (50% success) to reveal base
  - Special event: "Intercepted Transmission" (5% per turn) reveals base
- **Strategic Notes**: Asymmetric counter to Union; high-risk espionage required

### FR-VC-007: The Union Victory Conditions
- **The Union has 4 possible victory paths**:

#### VC-UN-001: Cumulative Loyalty Victory
- **Requirement**: Achieve 5,000 cumulative loyalty points across all systems
- **Description**: "Win the hearts and minds of the galaxy through liberation"
- **Tracking**:
  - Each turn, sum loyalty gain across all systems influenced by Union
  - Cumulative total: Integer counter (persists across turns)
  - Formula per system per turn: `max(0, loyaltyTowardsUnion - 50)`
  - Victory triggers when cumulative total ≥5,000
- **Unlock**: Available from game start
- **Strategic Notes**: Rewards diplomacy and long-game strategy; less vulnerable to military setbacks

#### VC-UN-002: Survival Victory
- **Requirement**: Survive 100 turns with secret base intact while controlling ≥30% of galaxy
- **Description**: "Outlast the oppressors and prove the resistance endures"
- **Tracking**:
  - Current turn: Integer
  - Secret base intact: Boolean
  - Systems controlled: Count loyalty='union'
  - Control percentage: `(controlled / total) × 100`
  - Victory triggers when turn ≥100 AND secretBaseIntact=true AND controlPercent ≥30%
- **Unlock**: Available from game start
- **Strategic Notes**: Defensive strategy; requires protecting secret base and maintaining territory

#### VC-UN-003: Liberation Victory
- **Requirement**: Liberate 50 systems from Brand Authority control (flip loyalty to Union)
- **Description**: "Free the oppressed systems from corporate tyranny"
- **Tracking**:
  - Counter: Number of systems flipped from brandAuthority to union
  - Tracks via loyalty change events (only counts Brand Authority → Union transitions)
  - Cumulative counter (persists across turns)
  - Victory triggers when counter ≥50
- **Unlock**: Available from game start
- **Strategic Notes**: Aggressive diplomacy and sabotage focus; rewards active play

#### VC-UN-004: Heroic Victory (Revolutionary Spark)
- **Requirement**: Complete special "Revolutionary Spark" mission chain
- **Description**: "Ignite the spark of revolution that liberates the entire galaxy"
- **Tracking**:
  - Mission chain progress: 0-5 (5 sequential missions)
  - Mission chain missions:
    1. "Inspire Hope" (3 diplomatic missions in high-pop systems)
    2. "Sabotage Propaganda" (destroy 5 Brand Authority Propaganda Centers)
    3. "Rescue Champion" (rescue specific captured Union character)
    4. "Rally the People" (achieve 70+ loyalty in 10 systems simultaneously)
    5. "Revolutionary Spark" (special ultimate mission, requires Tier 5 tech)
  - Victory triggers when mission 5 ("Revolutionary Spark") completes successfully
- **Unlock**: Requires Tier 5 "Revolutionary Spark" technology
- **Strategic Notes**: Narrative-driven victory; requires tech investment and careful execution

### FR-VC-008: The Autoforge Victory Conditions
- **The Autoforge has 4 possible victory paths**:

#### VC-AF-001: System Dependency Victory
- **Requirement**: 60% of galaxy systems depend on Autoforge infrastructure
- **Description**: "Create universal dependence on automated technology"
- **Tracking**:
  - Dependency calculated per system based on:
    - Autoforge facilities in system: +15% dependency per facility
    - Active trade agreements with Autoforge: +20% dependency
    - Low industrial capacity (pop <4) without Autoforge: +10% dependency
    - System uses Autoforge-produced goods: +15% dependency
  - System considered "dependent" if dependency ≥50%
  - Victory triggers when (dependentSystems / totalSystems) ≥0.60
- **Unlock**: Available from game start
- **Strategic Notes**: Unique infrastructure-building victory; requires spreading Autoforge influence

#### VC-AF-002: Research Victory
- **Requirement**: Complete entire Autoforge technology tree (all Tier 1-5 techs)
- **Description**: "Achieve technological singularity through total research dominance"
- **Tracking**:
  - Completed techs: Count
  - Total techs in Autoforge tree: Count
  - Completion percentage: `(completed / total) × 100`
  - Victory triggers when completion percentage = 100%
- **Unlock**: Available from game start
- **Strategic Notes**: Science victory; leverages Autoforge research bonuses

#### VC-AF-003: Manufacturing Victory
- **Requirement**: Produce 1,000 total units (ships + facilities + droids)
- **Description**: "Demonstrate industrial supremacy through mass production"
- **Tracking**:
  - Cumulative counter: Ships built + facilities built + droid units produced
  - Counter increments each time unit/facility constructed
  - Victory triggers when counter ≥1,000
- **Unlock**: Available from game start
- **Strategic Notes**: Production-focused victory; rewards Autoforge manufacturing bonuses

#### VC-AF-004: Peaceful Victory
- **Requirement**: Maintain non-aggression with both factions for 75 turns while controlling ≥25% of galaxy
- **Description**: "Prove coexistence through technological symbiosis"
- **Tracking**:
  - Non-aggression turns counter: Integer (resets if aggression occurs)
  - Aggression defined as:
    - Autoforge attacks Brand Authority or Union systems
    - Autoforge declares war
    - Autoforge conducts sabotage missions
  - Systems controlled: Count loyalty='autoforge'
  - Control percentage: `(controlled / total) × 100`
  - Victory triggers when nonAggressionTurns ≥75 AND controlPercent ≥25%
- **Unlock**: Available from game start
- **Strategic Notes**: Pacifist strategy; requires diplomacy and defensive capability

### FR-VC-009: Victory Progress UI - Victory Screen
- Dedicated victory screen accessible from main menu or hotkey (V key)
- Displays for current faction:
  - List of all available victory conditions (unlocked + locked)
  - Current progress for each condition (percentage, counter, or boolean)
  - Progress bar visual for gradual conditions
  - Requirements and unlock conditions
  - Estimated turns to victory (if trending toward victory)
- Displays for opponent factions (if visible):
  - Known victory progress (based on intelligence)
  - Warnings for high-progress opponents (80%+ toward victory)
- Tooltips explain how each victory condition works

### FR-VC-010: Victory Progress UI - HUD Indicators
- Main game HUD displays compact victory progress:
  - Icon for closest victory condition
  - Progress percentage or counter
  - Color coding:
    - Green: >50% progress (on track)
    - Yellow: 25-50% progress (moderate progress)
    - Orange: 80-95% progress (nearing victory)
    - Red: >95% progress (imminent victory)
- Warning icon when opponent reaches 80%+ progress toward victory
- Clicking HUD indicator opens full victory screen

### FR-VC-011: Victory Condition Unlock System
- Some victory conditions require technology to unlock:
  - Brand Authority Economic Dominance: Tier 5 "Galactic Administration"
  - Union Heroic Victory: Tier 5 "Revolutionary Spark"
  - (Other conditions available from start)
- Locked conditions display in victory screen with unlock requirements
- Unlocking condition triggers notification: "New Victory Condition Unlocked"
- Unlocked conditions immediately begin tracking progress

### FR-VC-012: Intelligence and Victory Visibility
- Players can see opponent victory progress based on intelligence:
  - **Full Visibility**: Own faction's progress always visible
  - **Partial Visibility**: Opponent progress visible if:
    - Have active espionage network in opponent territory
    - Opponent progress >80% (too obvious to hide)
    - Special events reveal information
  - **Hidden Progress**: Cumulative counters hidden until >50% complete
- Espionage missions can reveal opponent victory progress
- Intelligence reports include victory threat assessments

### FR-VC-013: Victory Condition Configuration
- Victory conditions defined in JSON configuration files per faction
- Configuration includes:
  - Victory ID, name, description
  - Requirements (formula/thresholds)
  - Unlock conditions (tech required, turn minimum)
  - Tracking method (percentage, boolean, counter)
  - Weight/priority (for AI decision-making)
- Support for custom victory conditions via config (modding support)

### FR-VC-014: Victory Persistence
- Victory progress state shall serialize to JSON for save/load
- Serialized data includes:
  - Progress for each victory condition (percentages, counters, booleans)
  - Cumulative trackers (loyalty points, systems liberated, units produced)
  - Turn counters (survival turns, non-aggression turns)
  - Unlocked victory conditions
- Deserialization shall restore exact victory state
- Victory progress continues correctly after load

### FR-VC-015: Post-Victory Statistics
- After victory, display comprehensive statistics:
  - **General Stats**:
    - Final turn number
    - Game duration (real time)
    - Galaxy size and faction count
  - **Faction Stats**:
    - Systems controlled (peak and final)
    - Total resources generated
    - Total resources spent
    - Technologies researched
    - Units produced
    - Missions conducted (success/failure rates)
  - **Victory-Specific Stats**:
    - How victory condition was achieved
    - Turns to victory from unlock
    - Closest other victory conditions (own faction)
  - **Opponent Stats**:
    - Closest victory progress for each opponent
    - Final standings
- Statistics exportable as JSON for analysis

## Constraints

### CN-VC-001: Balance
- Each faction should have roughly equal chances to win via different paths (no dominant single strategy)
- Victory conditions should be achievable within 80-120 turns for typical game
- No victory condition should be trivially easy or impossibly hard
- Victory thresholds tested via playtesting and adjusted for balance

### CN-VC-002: Performance
- Victory condition checks must complete in < 20ms per turn (all factions, all conditions)
- Victory UI must load in < 200ms
- Progress calculations must not impact game frame rate
- Stats generation upon victory must complete in < 500ms

### CN-VC-003: Data Structure
- Victory progress stored as part of faction state
- Victory conditions defined in JSON config files
- Victory tracking logic data-driven (scriptable formulas)
- Victory checks deterministic (no randomness)

### CN-VC-004: Integration Points
- Victory system must integrate with:
  - **Faction Identity**: Victory conditions unique per faction
  - **Resource Management**: Economic victory tracks credits
  - **Technology System**: Some victories require tech unlocks
  - **Turn System**: Victory checks occur each turn
  - **Diplomacy & Loyalty**: Loyalty-based victories track system support
  - **Fleet Management**: Military victories track fleet destruction
  - **Mission System**: Some victories require mission completion
  - **Galaxy Data**: Territorial victories calculate system control percentages

### CN-VC-005: UI/UX
- Victory progress must be easily understandable (clear percentages/counters)
- Victory requirements must be clearly explained (no hidden mechanics)
- Opponent victory threats must be visible (prevent surprise losses)
- Victory screen should celebrate achievement (rewarding UX)

### CN-VC-006: Technical Limitations
- Pure JavaScript implementation (no TypeScript)
- ES module structure with `.js` extensions
- Compatible with Vite build system
- React components for victory UI screens
- Phaser integration for victory animations/effects

## Acceptance Criteria

### AC-VC-001: Victory System Architecture
- [ ] System tracks victory progress for all factions simultaneously
- [ ] Victory checks occur each turn during Resolution Phase
- [ ] First faction to meet victory condition wins
- [ ] Multiple victory conditions can be active (first wins)
- [ ] Victory progress visible to all players (with intelligence restrictions)

### AC-VC-002: Victory Progress Tracking
- [ ] Progress tracked as percentage, boolean, counter, or threshold as appropriate
- [ ] Progress updates automatically each turn
- [ ] Progress queryable via UI at any time
- [ ] Progress persists across save/load

### AC-VC-003: Victory Notifications
- [ ] Notification when victory condition becomes achievable
- [ ] Warning at 80% progress toward victory
- [ ] Alert at 95% progress (imminent victory)
- [ ] Immediate notification when victory achieved
- [ ] Opponent warnings visible when appropriate

### AC-VC-004: Victory Validation
- [ ] Validation checks prerequisites correctly
- [ ] Validation evaluates state against requirements correctly
- [ ] Victory triggers when all requirements met
- [ ] Validation is deterministic
- [ ] Validation completes in < 20ms per turn

### AC-VC-005: End-Game Sequence
- [ ] Game pauses when victory achieved
- [ ] Victory screen displays with winning faction and type
- [ ] Final statistics shown
- [ ] Options available (continue, menu, save, statistics)
- [ ] Victory screen visually distinctive
- [ ] Defeat screen shown to losing factions

### AC-VC-006: Brand Authority Victories
- [ ] Territorial Control victory implemented (70% galaxy, loyalty ≥60)
- [ ] Military Elimination victory implemented (all enemies destroyed)
- [ ] Economic Dominance victory implemented (500k credits, 50%+ trade hubs)
- [ ] Discovery Victory implemented (Union base destroyed)
- [ ] All requirements validate correctly

### AC-VC-007: The Union Victories
- [ ] Cumulative Loyalty victory implemented (5,000 loyalty points)
- [ ] Survival Victory implemented (100 turns, base intact, 30% control)
- [ ] Liberation Victory implemented (50 systems liberated from Brand Authority)
- [ ] Heroic Victory implemented (complete Revolutionary Spark mission chain)
- [ ] All requirements validate correctly

### AC-VC-008: The Autoforge Victories
- [ ] System Dependency victory implemented (60% systems dependent)
- [ ] Research Victory implemented (complete entire tech tree)
- [ ] Manufacturing Victory implemented (1,000 units produced)
- [ ] Peaceful Victory implemented (75 turns non-aggression, 25% control)
- [ ] All requirements validate correctly
- [ ] Dependency calculation works correctly

### AC-VC-009: Victory Screen UI
- [ ] Victory screen accessible from menu/hotkey
- [ ] Displays all available victory conditions
- [ ] Shows current progress (percentages, counters, booleans)
- [ ] Visualizes progress bars for gradual conditions
- [ ] Shows requirements and unlock conditions
- [ ] Estimates turns to victory
- [ ] Displays opponent progress (based on intelligence)
- [ ] Tooltips explain victory mechanics

### AC-VC-010: HUD Victory Indicators
- [ ] HUD shows compact victory progress
- [ ] Icon for closest victory condition displays
- [ ] Progress percentage or counter displays
- [ ] Color coding applies correctly (green/yellow/orange/red)
- [ ] Warning icon shows when opponent near victory (80%+)
- [ ] Clicking indicator opens full victory screen

### AC-VC-011: Victory Unlock System
- [ ] Locked conditions display with unlock requirements
- [ ] Tier 5 techs unlock respective victories:
  - [ ] Brand Authority "Galactic Administration" unlocks Economic Dominance
  - [ ] Union "Revolutionary Spark" unlocks Heroic Victory
- [ ] Notification triggers when victory condition unlocked
- [ ] Progress tracking begins immediately upon unlock

### AC-VC-012: Intelligence and Visibility
- [ ] Own faction progress always fully visible
- [ ] Opponent progress visible if espionage network active OR progress >80%
- [ ] Cumulative counters hidden until >50% complete
- [ ] Espionage missions can reveal opponent progress
- [ ] Intelligence reports include victory threat assessments

### AC-VC-013: Victory Configuration
- [ ] Victory conditions defined in JSON config files
- [ ] Config includes ID, name, description, requirements, unlocks, tracking
- [ ] Custom victory conditions supportable via config
- [ ] Configuration loads correctly at game start

### AC-VC-014: Victory Persistence
- [ ] Victory progress state serializes to JSON
- [ ] Serialization includes: progress values, counters, unlocks
- [ ] Deserialization restores exact state
- [ ] Victory progress continues correctly after load

### AC-VC-015: Post-Victory Statistics
- [ ] Comprehensive statistics display after victory
- [ ] General stats shown (turns, duration, galaxy size)
- [ ] Faction stats shown (systems, resources, techs, units, missions)
- [ ] Victory-specific stats shown (how achieved, turns to victory)
- [ ] Opponent stats shown (final standings, closest victories)
- [ ] Statistics exportable as JSON

### AC-VC-016: Performance
- [ ] Victory checks complete in < 20ms per turn
- [ ] Victory UI loads in < 200ms
- [ ] Progress calculations don't impact frame rate
- [ ] Stats generation completes in < 500ms

### AC-VC-017: Balance Validation
- [ ] Each faction has viable paths to victory (requires playtesting)
- [ ] Victory achievable within 80-120 turns (requires playtesting)
- [ ] No victory trivially easy or impossibly hard (requires playtesting)
- [ ] Multiple strategies viable for each faction

## Technical Notes

### Victory State Data Structure

```javascript
// Victory state (part of faction state object)
{
  victoryProgress: {
    // Brand Authority
    territorialControl: {
      type: 'percentage',
      current: 42,              // 42% of galaxy with loyalty ≥60
      required: 70,
      unlocked: true
    },
    militaryElimination: {
      type: 'boolean',
      current: false,
      conditions: {
        unionBaseDestroyed: false,
        unionFleetsDestroyed: false,
        autoforgeCapitalsCaptured: false,
        autoforgeFleetsDestroyed: false
      },
      unlocked: true
    },
    economicDominance: {
      type: 'threshold',
      current: 125000,          // Current credits
      required: 500000,
      secondaryCondition: {
        tradeHubControl: 35,    // % of trade hubs controlled
        tradeHubRequired: 50
      },
      unlocked: false           // Requires Tier 5 tech
    },
    discoveryVictory: {
      type: 'boolean',
      current: false,
      conditions: {
        secretBaseKnown: false,
        secretBaseDestroyed: false
      },
      unlocked: true
    },
    
    // The Union
    cumulativeLoyalty: {
      type: 'counter',
      current: 1250,            // Cumulative loyalty points
      required: 5000,
      unlocked: true
    },
    survivalVictory: {
      type: 'composite',
      current: {
        turns: 65,
        secretBaseIntact: true,
        territoryControl: 32
      },
      required: {
        turns: 100,
        secretBaseIntact: true,
        territoryControl: 30
      },
      unlocked: true
    },
    liberationVictory: {
      type: 'counter',
      current: 23,              // Systems liberated from Brand Authority
      required: 50,
      unlocked: true
    },
    heroicVictory: {
      type: 'mission-chain',
      current: 2,               // Completed 2 of 5 missions
      required: 5,
      missionChain: [
        { id: 'inspire-hope', completed: true },
        { id: 'sabotage-propaganda', completed: true },
        { id: 'rescue-champion', completed: false },
        { id: 'rally-people', completed: false },
        { id: 'revolutionary-spark', completed: false }
      ],
      unlocked: false           // Requires Tier 5 tech
    },
    
    // The Autoforge
    systemDependency: {
      type: 'percentage',
      current: 38,              // 38% of systems dependent
      required: 60,
      unlocked: true
    },
    researchVictory: {
      type: 'percentage',
      current: 65,              // 65% of tech tree complete
      required: 100,
      unlocked: true
    },
    manufacturingVictory: {
      type: 'counter',
      current: 342,             // Units produced
      required: 1000,
      unlocked: true
    },
    peacefulVictory: {
      type: 'composite',
      current: {
        nonAggressionTurns: 48,
        territoryControl: 28
      },
      required: {
        nonAggressionTurns: 75,
        territoryControl: 25
      },
      unlocked: true
    }
  },
  
  closestVictory: 'researchVictory',    // Auto-calculated closest to completion
  turnsToVictory: 18                     // Estimated turns to closest victory
}
```

### Victory Validation Algorithm

```javascript
// Check all victory conditions each turn
function checkVictoryConditions(gameState) {
  for (const faction of gameState.factions) {
    for (const [conditionId, condition] of Object.entries(faction.victoryProgress)) {
      // Skip if not unlocked
      if (!condition.unlocked) continue;
      
      // Update progress
      updateVictoryProgress(faction, conditionId, gameState);
      
      // Check if victory achieved
      const victoryMet = evaluateVictoryCondition(faction, conditionId, condition);
      
      if (victoryMet) {
        triggerVictory(faction, conditionId);
        return { victory: true, faction: faction, condition: conditionId };
      }
      
      // Check for warning thresholds
      const progressPercent = getProgressPercent(condition);
      if (progressPercent >= 80 && progressPercent < 95) {
        notifyVictoryWarning(faction, conditionId, 'approaching');
      } else if (progressPercent >= 95) {
        notifyVictoryWarning(faction, conditionId, 'imminent');
      }
    }
  }
  
  return { victory: false };
}

// Evaluate specific victory condition
function evaluateVictoryCondition(faction, conditionId, condition) {
  switch (condition.type) {
    case 'percentage':
      return condition.current >= condition.required;
      
    case 'boolean':
      return condition.current === true;
      
    case 'counter':
      return condition.current >= condition.required;
      
    case 'threshold':
      const mainMet = condition.current >= condition.required;
      const secondaryMet = !condition.secondaryCondition || 
        (condition.secondaryCondition.tradeHubControl >= condition.secondaryCondition.tradeHubRequired);
      return mainMet && secondaryMet;
      
    case 'composite':
      // All sub-conditions must be met
      return Object.entries(condition.required).every(([key, value]) => {
        return condition.current[key] >= value;
      });
      
    case 'mission-chain':
      return condition.current >= condition.required;
      
    default:
      console.error(`Unknown victory condition type: ${condition.type}`);
      return false;
  }
}

// Update progress for specific victory types
function updateVictoryProgress(faction, conditionId, gameState) {
  const condition = faction.victoryProgress[conditionId];
  
  switch (conditionId) {
    case 'territorialControl':
      // Count systems with loyalty >=60
      const qualifyingSystems = gameState.systems.filter(s => 
        s.loyalty === faction.id && s.loyaltyValue >= 60
      ).length;
      condition.current = Math.floor((qualifyingSystems / gameState.systems.length) * 100);
      break;
      
    case 'economicDominance':
      condition.current = faction.resources.credits;
      const tradeHubs = gameState.systems.filter(s => s.specialType === 'tradeHub');
      const controlledTradeHubs = tradeHubs.filter(s => s.loyalty === faction.id).length;
      condition.secondaryCondition.tradeHubControl = Math.floor(
        (controlledTradeHubs / tradeHubs.length) * 100
      );
      break;
      
    case 'systemDependency':
      // Calculate dependency for each system
      let dependentCount = 0;
      for (const system of gameState.systems) {
        const dependency = calculateSystemDependency(system, faction);
        if (dependency >= 50) dependentCount++;
      }
      condition.current = Math.floor((dependentCount / gameState.systems.length) * 100);
      break;
      
    case 'survivalVictory':
      condition.current.turns = gameState.currentTurn;
      condition.current.secretBaseIntact = !faction.secretBaseDestroyed;
      const controlledSystems = gameState.systems.filter(s => s.loyalty === faction.id).length;
      condition.current.territoryControl = Math.floor((controlledSystems / gameState.systems.length) * 100);
      break;
      
    // ... other condition types
  }
}

// Calculate system dependency on Autoforge
function calculateSystemDependency(system, autoforgeFaction) {
  let dependency = 0;
  
  // Autoforge facilities in system
  const autoforgeBuildings = system.facilities.filter(f => f.faction === 'autoforge').length;
  dependency += autoforgeBuildings * 15;
  
  // Active trade agreements
  if (system.tradeAgreements && system.tradeAgreements.includes('autoforge')) {
    dependency += 20;
  }
  
  // Low industrial capacity without Autoforge support
  if (system.population < 4 && system.loyalty !== 'autoforge') {
    dependency += 10;
  }
  
  // Uses Autoforge-produced goods (check system imports)
  if (system.imports && system.imports.autoforgeGoods) {
    dependency += 15;
  }
  
  return Math.min(dependency, 100); // Cap at 100%
}
```

### Victory Screen UI Component (React)

```jsx
// src/components/VictoryScreen.jsx
export function VictoryScreen({ faction, gameState }) {
  const [selectedCondition, setSelectedCondition] = useState(null);
  
  const getProgressColor = (progressPercent) => {
    if (progressPercent >= 95) return 'red';
    if (progressPercent >= 80) return 'orange';
    if (progressPercent >= 50) return 'green';
    if (progressPercent >= 25) return 'yellow';
    return 'gray';
  };
  
  return (
    <div className="victory-screen">
      <h2>{faction.displayName} - Victory Conditions</h2>
      
      <div className="victory-list">
        {Object.entries(faction.victoryProgress).map(([conditionId, condition]) => {
          const progressPercent = getProgressPercent(condition);
          
          return (
            <div 
              key={conditionId} 
              className={`victory-condition ${condition.unlocked ? 'unlocked' : 'locked'}`}
              onClick={() => setSelectedCondition(conditionId)}
            >
              <div className="victory-header">
                <h3>{getVictoryName(conditionId)}</h3>
                {!condition.unlocked && <span className="locked-badge">🔒 Locked</span>}
              </div>
              
              <div className="victory-progress">
                <ProgressBar 
                  percent={progressPercent}
                  color={getProgressColor(progressPercent)}
                />
                <span className="progress-text">
                  {formatProgress(condition)} / {formatRequired(condition)}
                </span>
              </div>
              
              {progressPercent >= 80 && (
                <div className="victory-warning">
                  {progressPercent >= 95 ? '⚠️ Imminent Victory!' : '⚡ Approaching Victory'}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="opponent-progress">
        <h3>Opponent Threats</h3>
        {gameState.factions.filter(f => f.id !== faction.id).map(opponent => (
          <OpponentVictoryStatus 
            key={opponent.id}
            opponent={opponent}
            intelligenceLevel={getIntelligenceLevel(faction, opponent)}
          />
        ))}
      </div>
      
      {selectedCondition && (
        <VictoryDetailPanel 
          conditionId={selectedCondition}
          condition={faction.victoryProgress[selectedCondition]}
          onClose={() => setSelectedCondition(null)}
        />
      )}
    </div>
  );
}
```

## Dependencies

### Prerequisite Features
- **Faction Identity** - Defines faction-specific victory conditions
- **Galaxy Generation** (✅ Implemented) - Provides system data for territorial victories
- **DataBridge** (✅ Implemented) - Required for state persistence

### Dependent Features
- **Turn System** (Phase 1A) - Triggers victory checks each turn
- **Resource Management** - Tracks resources for economic victories
- **Technology System** - Unlocks certain victory conditions via Tier 5 techs
- **Fleet Management** (Phase 1B) - Tracks fleet destruction for military victories
- **Diplomacy & Loyalty** (Phase 1B) - Tracks loyalty for loyalty-based victories
- **Mission System** (Phase 1B) - Mission chain victories require mission completion

## Future Considerations

### Phase 1B Enhancements
- Custom victory conditions (player-defined goals)
- Alliance victories (team victories in multiplayer)
- Defeat conditions (auto-lose if certain events occur)

### Phase 1C Enhancements
- Victory achievements (special accomplishments)
- Speed run tracking (fastest victory by condition type)
- Challenge victories (additional difficulty modifiers)

### Phase 1D Enhancements
- Campaign-specific victory conditions (story-driven goals)
- Multiplayer-specific victories (eliminate specific rival)
- Sandbox mode victories (creative/builder achievements)

### Modding Support
- Expose victory definitions as JSON
- Scriptable victory validation logic via JavaScript
- Custom victory UI templates

## Open Questions

1. **Victory Visibility**: Should all opponent victory progress be visible or require intelligence?
   - *Recommendation*: Visible at 80%+ (prevents surprise losses), otherwise requires espionage

2. **Continue After Victory**: Should "continue playing" be default or require explicit choice?
   - *Recommendation*: Offer choice; some players want to keep building

3. **Multiple Winners**: What if two factions meet victory conditions same turn?
   - *Recommendation*: Tie-breaker: Earlier in turn order, or most victory conditions met

4. **Victory Difficulty**: Should some victory paths be marked as harder/easier?
   - *Recommendation*: Yes, add difficulty rating (Easy/Medium/Hard) per victory type

5. **Secret Base Discovery**: Is 15% espionage chance balanced for discovering Union base?
   - *Recommendation*: Validate via playtesting; should require 5-10 espionage missions average

6. **System Dependency**: Is dependency calculation formula balanced for Autoforge?
   - *Recommendation*: Playtest extensively; should be achievable but not trivial

## References

- [Feature Catalog - Faction Management](../../product/feature-catalog.md#2-faction-management)
- [Faction Identity Spec](../faction-identity/spec.md)
- [Resource Management Spec](../resource-management/spec.md)
- [Technology/Research Tree Spec](../technology-research-tree/spec.md)
- [Galaxy Generation Spec](../galaxy-generation/spec.md)
- [data-bridge.js](../../../core/data-bridge.js) - State persistence
