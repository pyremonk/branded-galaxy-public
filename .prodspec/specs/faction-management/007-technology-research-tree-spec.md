# Technology/Research Tree

## Overview

The Technology/Research Tree system provides faction-specific technological progression paths that unlock new capabilities, enhance existing systems, and provide strategic advantages. Each faction has a unique tech tree with 5 tiers containing 3-5 technologies each, representing different specializations and playstyles. Players invest resources (credits + influence) and time (turns) to research technologies that provide permanent bonuses, unlock new units/buildings, enable advanced missions, and ultimately support victory conditions.

This system creates strategic depth through:
- **Tech Diversity**: 60+ total technologies across three faction trees
- **Meaningful Choices**: Limited research capacity forces prioritization
- **Progression**: Tiers unlock sequentially with prerequisites
- **Synergy**: Technologies combine to create powerful faction strategies
- **Asymmetry**: Each faction's tech tree reinforces their unique identity

## Requirements

### FR-TRT-001: Technology Tree Structure
- System shall maintain three distinct tech trees (one per faction)
- Each tech tree shall have 5 tiers of progressive technologies
- Each tier shall contain 3-5 technologies
- Technologies shall have prerequisites (prior tier techs or specific techs)
- Tech tree structure shall be defined in JSON configuration files
- System shall support future expansion of tech trees via config

### FR-TRT-002: Technology Definition Format
- Each technology shall be defined with:
  - **ID**: Unique identifier (string)
  - **Name**: Display name  
  - **Description**: Flavor text and mechanical explanation
  - **Tier**: 1-5 (progression level)
  - **Cost**: Resources required (credits + influence)
  - **Research Time**: Number of turns to complete
  - **Prerequisites**: Array of technology IDs that must be completed first
  - **Effects**: Array of bonuses/unlocks provided
  - **Faction**: Which faction tree it belongs to
  - **Icon**: Visual representation (emoji or SVG path)
  
### FR-TRT-003: Research Costs by Tier
- Technology costs shall scale by tier:
  - **Tier 1**: 200-400 credits, 50-100 influence, 3-4 turns
  - **Tier 2**: 500-800 credits, 100-200 influence, 4-6 turns
  - **Tier 3**: 1,000-1,500 credits, 200-350 influence, 5-8 turns
  - **Tier 4**: 2,000-3,000 credits, 400-600 influence, 7-10 turns
  - **Tier 5**: 4,000-6,000 credits, 800-1,200 influence, 10-15 turns
- Costs shall be modified by faction bonuses/penalties:
  - Brand Authority: +10% cost (bureaucratic overhead)
  - The Union: Standard cost
  - The Autoforge: -20% cost (research bonus)
- Research Facility special locations provide -10% cost
- Costs must be paid upfront when research begins

### FR-TRT-004: Research Mechanics
- Only one technology may be actively researched at a time (base rule)
- Research progress accumulates each turn
- Research cannot be paused or cancelled (resources non-refundable)
- Research completes when progress reaches 100% (turns elapsed)
- Technology effects apply immediately upon completion
- Faction may queue next research (auto-starts when current completes)
- Research queue displays in tech tree UI

### FR-TRT-005: Technology Effects - Stat Bonuses
- Technologies shall provide percentage-based stat bonuses:
  - **Production Bonuses**: +10-40% to resource generation (credits, materials, recruits, influence)
  - **Military Bonuses**: +10-30% to ship combat power, defense rating, fleet capacity
  - **Economic Bonuses**: +15-40% to resource storage caps, trade efficiency
  - **Mission Bonuses**: +10-30% to mission success rates (espionage, diplomacy, sabotage)
  - **Research Bonuses**: +10-25% to research speed, -10-20% to costs
- Bonuses shall stack multiplicatively with faction bonuses and facility bonuses
- Bonuses apply faction-wide (all systems and units benefit)

### FR-TRT-006: Technology Effects - Unit Unlocks
- Some technologies unlock new unit types:
  - **Tier 2**: Advanced Fighters, Corvettes with specialists
  - **Tier 3**: Heavy Cruisers, Stealth Ships (The Union), Droid Carriers (Autoforge)
  - **Tier 4**: Dreadnoughts, Supercarriers
  - **Tier 5**: Unique capital ships (Brand Authority "Enforcer", Union "Liberation", Autoforge "Nexus")
- Unlocked units available for construction immediately
- Unit stats defined in separate unit definition files (not in tech definitions)

### FR-TRT-007: Technology Effects - Building Unlocks
- Some technologies unlock new building types:
  - **Tier 2**: Advanced Shipyards (build faster), Propagation Centers (influence generation)
  - **Tier 3**: Automated Factories (material production), Intelligence Networks (espionage boost)
  - **Tier 4**: Research Complexes (multi-research capability), Fortress Stations (ultimate defense)
  - **Tier 5**: Faction-specific wonders (see Faction Tech Trees)
- Unlocked buildings available for construction immediately
- Buildings provide passive bonuses or enable new actions

### FR-TRT-008: Technology Effects - Mission Unlocks
- Some technologies unlock advanced mission types:
  - **Tier 2**: "Incite Uprising" mission (reduce loyalty), "Acquire Technology" (steal tech)
  - **Tier 3**: "Assassination" mission (eliminate characters), "Deep Cover" (long-term espionage)
  - **Tier 4**: "False Flag Operation" (frame another faction), "Propaganda Campaign" (mass loyalty shift)
  - **Tier 5**: Faction-specific ultimate missions
- Unlocked missions integrate with Mission System (Phase 1B)

### FR-TRT-009: Technology Effects - Unique Capabilities
- Tier 5 technologies provide game-changing unique capabilities:
  - Enable special victory condition paths
  - Unlock faction-specific mechanics
  - Provide overwhelming strategic advantages
  - Serve as late-game power spikes
- Examples:
  - Brand Authority Tier 5: "Galactic Administration" - Can govern systems remotely (no loyalty decay)
  - Union Tier 5: "Revolutionary Spark" - Can trigger galaxy-wide uprising event
  - Autoforge Tier 5: "Singularity Protocol" - Perfect resource efficiency (zero waste)

### FR-TRT-010: Brand Authority Tech Tree
- **Focus**: Military supremacy, economic efficiency, control and governance
- **Tier 1 Technologies**:
  1. "Military Logistics I" (Starting tech - unlocked by default)
     - +10% fleet production speed
     - Cost: 200 credits, 50 influence, 3 turns
  2. "Corporate Tax Reform"
     - +15% credit income from all systems
     - Cost: 300 credits, 75 influence, 4 turns
  3. "Advanced Materials Science"
     - +10% materials production
     - Cost: 250 credits, 60 influence, 3 turns
     
- **Tier 2 Technologies** (require any 1 Tier 1 tech):
  1. "Fleet Doctrine: Overwhelming Force"
     - +15% ship combat power
     - Unlocks Heavy Cruiser unit
     - Cost: 600 credits, 150 influence, 5 turns
  2. "Economic Consolidation"
     - +25% resource storage caps
     - +10% trade hub bonus (stacks with faction bonus)
     - Cost: 700 credits, 175 influence, 6 turns
  3. "Propaganda Networks"
     - +20% influence generation
     - Unlocks Propaganda Center building
     - Cost: 500 credits, 125 influence, 5 turns
    
- **Tier 3 Technologies** (require any 2 Tier 2 techs):
  1. "Advanced Shipyards"
     - +25% fleet production speed
     - Unlocks Dreadnought unit
     - Cost: 1,200 credits, 300 influence, 7 turns
  2. "Intelligence Apparatus"
     - +30% espionage defense (counter-intel)
     - Unlocks Intelligence Network building
     - Cost: 1,000 credits, 250 influence, 6 turns
  3. "Resource Optimization"
     - +20% production from all special locations
     - -15% construction costs
     - Cost: 1,400 credits, 325 influence, 8 turns
    
- **Tier 4 Technologies** (require any 2 Tier 3 techs):
  1. "Supercarrier Program"
     - Unlocks Supercarrier unit (mobile shipyard + fleet command)
     - +30% fleet capacity
     - Cost: 2,500 credits, 500 influence, 9 turns
  2. "Integrated Defense Grid"
     - +40% defense rating for all systems
     - Unlocks Fortress Station building
     - Cost: 2,200 credits, 450 influence, 8 turns
  3. "Economic Hegemony"
     - +30% credit income
     - Credit income provides passive influence generation (1 influence per 100 credits)
     - Cost: 2,800 credits, 550 influence, 10 turns
    
- **Tier 5 Technologies** (require all 3 Tier 4 techs):
  1. "Galactic Administration"
     - Systems no longer suffer loyalty decay
     - Remote system management (no range limits)
     - Unlocks "Enforcer" ultimate capital ship
     - Enables "Economic Dominance" victory condition
     - Cost: 5,000 credits, 1,000 influence, 12 turns

### FR-TRT-011: The Union Tech Tree
- **Focus**: Guerrilla warfare, covert operations, popular uprising, survival
- **Tier 1 Technologies**:
  1. "Guerrilla Tactics I" (Starting tech - unlocked by default)
     - +15% sabotage mission success rate
     - Cost: 200 credits, 50 influence, 3 turns
  2. "Underground Networks"
     - +20% loyalty gain from diplomatic missions
     - -10% mission costs
     - Cost: 250 credits, 75 influence, 3 turns
  3. "Improvised Manufacturing"
     - +15% materials production despite lower population
     - -20% ship maintenance costs
     - Cost: 300 credits, 60 influence, 4 turns
    
- **Tier 2 Technologies** (require any 1 Tier 1 tech):
  1. "Stealth Technology"
     - +25% espionage mission success rate
     - Unlocks Stealth Ship unit
     - Cost: 550 credits, 125 influence, 5 turns
  2. "Popular Support"
     - Loyalty decay 75% slower (improves on faction bonus)
     - +15% influence generation from high-loyalty systems
     - Cost: 600 credits, 150 influence, 5 turns
  3. "Sabotage Techniques"
     - +30% sabotage damage to facilities
     - Unlocks "Incite Uprising" mission
     - Cost: 500 credits, 140 influence, 4 turns
    
- **Tier 3 Technologies** (require any 2 Tier 2 techs):
  1. "Deep Cover Operations"
     - +20% success on all covert missions
     - Unlocks "Deep Cover" mission (long-term espionage, reveals enemy plans)
     - Cost: 1,100 credits, 275 influence, 6 turns
  2. "Decentralized Command"
     - Can have 2 minor secret bases (in addition to main base)
     - +25% recruit generation
     - Cost: 1,300 credits, 300 influence, 7 turns
  3. "Hit-and-Run Tactics"
     - +20% fleet combat power in defensive battles
     - Can retreat from combat without penalty
     - Cost: 1,000 credits, 250 influence, 6 turns
    
- **Tier 4 Technologies** (require any 2 Tier 3 techs):
  1. "Liberation Fleet"
     - Unlocks "Liberation" capital ship (morale boost, loyalty conversion)
     - +30% loyalty gain when liberating systems
     - Cost: 2,200 credits, 450 influence, 8 turns
  2. "Mass Mobilization"
     - +50% recruit generation
     - Can recruit militia units (weak but free)
     - Cost: 2,000 credits, 400 influence, 7 turns
  3. "Revolutionary Ideology"
     - +40% influence generation
     - Diplomatic missions can trigger instant loyalty shifts (25% chance)
     - Cost: 2,600 credits, 520 influence, 9 turns
    
- **Tier 5 Technologies** (require all 3 Tier 4 techs):
  1. "Revolutionary Spark"
     - Can trigger galaxy-wide uprising event (all systems shift +20 loyalty toward Union)
     - Enables "Heroic Victory" condition
     - Diplomatic missions have double effect
     - Cost: 4,500 credits, 900 influence, 14 turns

### FR-TRT-012: The Autoforge Tech Tree
- **Focus**: Automation, AI superiority, research acceleration, technological dependence
- **Tier 1 Technologies**:
  1. "Automated Production I" (Starting tech - unlocked by default)
     - +20% materials production
     - Cost: 200 credits, 50 influence, 3 turns
  2. "Neural Network Expansion"
     - +15% research speed
     - Cost: 250 credits, 60 influence, 3 turns
  3. "Drone Fleet Protocols"
     - -25% fleet maintenance costs (improves faction bonus)
     - +10% fighter production speed
     - Cost: 300 credits, 75 influence, 4 turns
    
- **Tier 2 Technologies** (require any 1 Tier 1 tech):
  1. "Advanced Fabrication"
     - +30% materials production
     - Unlocks Automated Factory building
     - Cost: 600 credits, 125 influence, 5 turns
  2. "Research Acceleration"
     - +25% research speed
     - Can research 2 technologies simultaneously
     - Cost: 700 credits, 150 influence, 6 turns
  3. "Droid Legion"
     - +20% recruit generation (droid workers count as recruits)
     - Unlocks Droid Carrier unit
     - Cost: 550 credits, 140 influence, 5 turns
    
- **Tier 3 Technologies** (require any 2 Tier 2 techs):
  1. "Self-Replicating Systems"
     - Buildings auto-repair (zero maintenance cost remains, but damage heals)
     - Can build facilities in population 0 systems at 2× speed
     - Cost: 1,300 credits, 280 influence, 7 turns
  2. "Quantum Computing"
     - +35% research speed
     - -15% research costs
     - Unlocks Research Complex building
     - Cost: 1,400 credits, 320 influence, 8 turns
  3. "Infrastructure Integration"
     - +20% to system dependency (for victory condition)
     - Systems with Autoforge facilities produce +15% resources
     - Cost: 1,100 credits, 250 influence, 6 turns
    
- **Tier 4 Technologies** (require any 2 Tier 3 techs):
  1. "Nexus Network"
     - Unlocks "Nexus" ultimate capital ship (AI command vessel)
     - All Autoforge systems networked (share bonuses)
     - Cost: 2,400 credits, 480 influence, 9 turns
  2. "Total Automation"
     - +50% materials and credits production
     - Zero-maintenance extends to fleets (no upkeep costs)
     - Cost: 2,800 credits, 550 influence, 10 turns
  3. "Technological Dependence"
     - +30% to system dependency metric
     - Enables "Dependency Victory" condition tracking acceleration
     - Cost: 2,200 credits, 450 influence, 8 turns
    
- **Tier 5 Technologies** (require all 3 Tier 4 techs):
  1. "Singularity Protocol"
     - Perfect resource efficiency (zero waste, resources never lost to cap)
     - +50% to all production
     - Auto-completes all Tier 1-4 technologies instantly (research victory)
     - Enables "Research Victory" condition
     - Cost: 5,500 credits, 1,100 influence, 15 turns

### FR-TRT-013: Research Queue System
- Faction may queue up to 3 technologies for sequential research
- Queued techs auto-start when current research completes
- Queued techs can be reordered or removed without penalty
- Queued techs display in tech tree UI with order indicators
- Resources for queued techs not reserved (must be available when research starts)

### FR-TRT-014: Multi-Research Capability
- Base rule: Only 1 technology researched at a time
- Autoforge Tier 2 "Research Acceleration" unlocks simultaneous research (2 techs)
- Future technologies may increase multi-research capacity to 3+ (Phase 1C)
- Each simultaneous research tracks progress independently
- Each research costs full resources (no discount for multi-research)

### FR-TRT-015: Technology UI - Tech Tree View
- Tech tree shall display as visual graph/tree structure
- Technologies arranged in tiers (horizontal rows)
- Prerequisite connections shown as lines/arrows between techs
- Technology state indicators:
  - **Locked**: Prerequisites not met (grayed out, no interaction)
  - **Available**: Prerequisites met, not researched (normal color, clickable)
  - **Researching**: Currently being researched (highlighted, progress bar)
  - **Completed**: Research finished (check mark, green tint)
- Clicking technology shows detailed info panel:
  - Full description
  - Cost breakdown (credits, influence, turns)
  - Effects list
  - Prerequisites
  - "Begin Research" button (if available)

### FR-TRT-016: Technology UI - Research Progress Display
- Current research displays prominently in HUD or tech screen
- Progress bar shows research completion percentage
- Turns remaining displayed numerically
- ETA shown (e.g., "Completes on Turn 15")
- Option to cancel research (confirmation dialog, resources lost)
- Queue shows next 3 technologies with order

### FR-TRT-017: Technology Costs - Research Facilities Integration
- Systems with Research Facility special type provide -10% research costs
- If active research applies to faction-wide, benefit applies to faction
- Each Research Facility reduces cost by 10% (capped at -50% max discount)
- Research Lab buildings (Phase 1C) provide additional -15% cost reduction
- Total cost reduction capped at -60% (prevent exploit)

### FR-TRT-018: Technology Persistence
- All technology state shall serialize to JSON for save/load
- Serialized data includes:
  - Completed technologies (array of tech IDs)
  - Current research (tech ID, progress %, turns remaining)
  - Research queue (array of tech IDs)
  - Technology effects actively applied
- Deserialization shall restore exact tech state
- Tech tree unlocks and bonuses reapply correctly on load

## Constraints

### CN-TRT-001: Balance
- No technology shall provide >+50% bonus to single stat (prevent overpowered techs)
- Total tech tree completion bonuses (all Tier 1-5) shall be balanced across factions
- Research costs must scale such that completing full tree requires 60-100 turns minimum
- Tier 5 technologies should be achievable but require significant investment (victory enablers)

### CN-TRT-002: Performance
- Tech tree rendering shall load in < 300ms
- Technology effects calculations shall complete in < 5ms per turn
- Tech tree UI shall support 60+ technologies without lag
- Prerequisite validation shall complete in < 10ms

### CN-TRT-003: Data Structure
- Technology definitions stored in JSON files per faction
- Technology effects shall be data-driven (scriptable bonuses)
- Tech tree structure shall support dynamic loading (modding support)
- Tech IDs must be globally unique across all factions

### CN-TRT-004: Integration Points
- Technology system must integrate with:
  - **Resource Management**: Research consumes credits/influence
  - **Faction Identity**: Faction bonuses modify research costs/speed
  - **Turn System**: Research progress advances each turn
  - **Fleet Management**: Unit unlocks enable new ship construction
  - **Base Construction**: Building unlocks enable new facility construction
  - **Mission System**: Mission unlocks enable new covert actions
  - **Victory Conditions**: Tier 5 techs enable/accelerate victory paths

### CN-TRT-005: UI/UX
- Tech tree must be navigable and readable (no overwhelming complexity)
- Prerequisite relationships must be clear (visual connections)
- Technology effects must be understandable without studying formulas
- Research queue must be easily manageable (drag-drop reordering)

### CN-TRT-006: Technical Limitations
- Pure JavaScript implementation (no TypeScript)
- ES module structure with `.js` extensions
- Compatible with Vite build system
- React components for tech tree UI
- Phaser integration for in-game research notifications

## Acceptance Criteria

### AC-TRT-001: Tech Tree Structure
- [ ] Three faction tech trees exist (Brand Authority, Union, Autoforge)
- [ ] Each tree has 5 tiers with 3-5 techs per tier
- [ ] Total of 60+ technologies across all factions
- [ ] Technology data loaded from JSON configuration files
- [ ] All technologies have required fields (ID, name, cost, effects, prerequisites)

### AC-TRT-002: Research Costs
- [ ] Tier 1 costs: 200-400 credits, 50-100 influence, 3-4 turns
- [ ] Tier 2 costs: 500-800 credits, 100-200 influence, 4-6 turns
- [ ] Tier 3 costs: 1,000-1,500 credits, 200-350 influence, 5-8 turns
- [ ] Tier 4 costs: 2,000-3,000 credits, 400-600 influence, 7-10 turns
- [ ] Tier 5 costs: 4,000-6,000 credits, 800-1,200 influence, 10-15 turns
- [ ] Faction cost modifiers apply correctly:
  - [ ] Brand Authority: +10% cost
  - [ ] The Union: Standard cost
  - [ ] The Autoforge: -20% cost
- [ ] Research Facility special locations provide -10% cost

### AC-TRT-003: Research Mechanics
- [ ] Only 1 technology researched at a time (base rule)
- [ ] Research progress accumulates each turn
- [ ] Research cannot be paused/cancelled (resources non-refundable)
- [ ] Research completes when turns elapsed reaches research time
- [ ] Technology effects apply immediately upon completion
- [ ] Research queue supports up to 3 queued technologies
- [ ] Queued tech auto-starts when current completes

### AC-TRT-004: Technology Effects - Stat Bonuses
- [ ] Production bonuses apply correctly (+10-40%)
- [ ] Military bonuses apply correctly (+10-30%)
- [ ] Economic bonuses apply correctly (+15-40%)
- [ ] Mission bonuses apply correctly (+10-30%)
- [ ] Research bonuses apply correctly (+10-25%)
- [ ] Bonuses stack multiplicatively with faction and facility bonuses
- [ ] Bonuses apply faction-wide (all systems/units)

### AC-TRT-005: Technology Effects - Unit Unlocks
- [ ] Tier 2-5 technologies unlock new unit types as specified
- [ ] Unlocked units available for construction immediately
- [ ] Unit unlock integrates with Fleet Management system
- [ ] Tier 5 unique capital ships unlock correctly (Enforcer, Liberation, Nexus)

### AC-TRT-006: Technology Effects - Building Unlocks
- [ ] Tier 2-5 technologies unlock new building types as specified
- [ ] Unlocked buildings available for construction immediately
- [ ] Building unlock integrates with Base Construction system
- [ ] Buildings provide documented passive bonuses

### AC-TRT-007: Technology Effects - Mission Unlocks
- [ ] Tier 2-5 technologies unlock advanced mission types as specified
- [ ] Unlocked missions integrate with Mission System
- [ ] Mission unlock notifications display to player

### AC-TRT-008: Technology Effects - Unique Capabilities
- [ ] Tier 5 technologies provide game-changing capabilities:
  - [ ] Brand Authority "Galactic Administration" works correctly
  - [ ] Union "Revolutionary Spark" works correctly
  - [ ] Autoforge "Singularity Protocol" works correctly
- [ ] Unique capabilities enable/accelerate victory conditions

### AC-TRT-009: Brand Authority Tech Tree
- [ ] All 15+ Brand Authority technologies implemented
- [ ] Tier 1-5 progression works correctly
- [ ] Prerequisites enforce correctly
- [ ] Technology effects apply as specified
- [ ] Tech tree reflects military/economic focus

### AC-TRT-010: The Union Tech Tree
- [ ] All 15+ Union technologies implemented
- [ ] Tier 1-5 progression works correctly
- [ ] Prerequisites enforce correctly
- [ ] Technology effects apply as specified
- [ ] Tech tree reflects guerrilla/covert ops focus

### AC-TRT-011: The Autoforge Tech Tree
- [ ] All 15+ Autoforge technologies implemented
- [ ] Tier 1-5 progression works correctly
- [ ] Prerequisites enforce correctly
- [ ] Technology effects apply as specified
- [ ] Tech tree reflects automation/research focus

### AC-TRT-012: Research Queue
- [ ] Can queue up to 3 technologies
- [ ] Queued techs auto-start when current completes
- [ ] Can reorder queue without penalty
- [ ] Can remove from queue without penalty
- [ ] Queue displays in tech tree UI with order indicators

### AC-TRT-013: Multi-Research
- [ ] Base rule: 1 tech at a time enforced
- [ ] Autoforge "Research Acceleration" enables 2 simultaneous techs
- [ ] Each simultaneous research tracks progress independently
- [ ] Full resource costs required for each research

### AC-TRT-014: Tech Tree UI
- [ ] Tech tree displays as visual graph/tree
- [ ] Technologies arranged in tier rows
- [ ] Prerequisites shown as connecting lines
- [ ] State indicators display correctly (locked/available/researching/completed)
- [ ] Clicking tech shows detailed info panel
- [ ] "Begin Research" button functional when available

### AC-TRT-015: Research Progress UI
- [ ] Current research displays in HUD or tech screen
- [ ] Progress bar shows completion percentage
- [ ] Turns remaining displayed
- [ ] ETA shown accurately
- [ ] Queue shows next 3 techs

### AC-TRT-016: Research Facilities Integration
- [ ] Research Facility special type provides -10% cost
- [ ] Multiple facilities stack discount (capped at -50%)
- [ ] Research Lab buildings provide additional -15% (Phase 1C)
- [ ] Total discount capped at -60%

### AC-TRT-017: Data Persistence
- [ ] Technology state serializes to JSON correctly
- [ ] Serialization includes: completed techs, current research, queue, effects
- [ ] Deserialization restores exact state
- [ ] Tech effects reapply correctly on load
- [ ] Research progress resumes correctly after load

### AC-TRT-018: Performance
- [ ] Tech tree UI loads in < 300ms
- [ ] Technology effects calculations complete in < 5ms per turn
- [ ] UI supports 60+ techs without lag
- [ ] Prerequisite validation completes in < 10ms

### AC-TRT-019: Balance Validation
- [ ] No single tech provides >+50% bonus to one stat
- [ ] Total tree completion bonuses balanced across factions (within 20% variance)
- [ ] Completing full tree requires 60-100 turns minimum
- [ ] Tier 5 techs achievable but require significant investment

## Technical Notes

### Technology Definition Data Structure

```javascript
// core/tech-trees/brand-authority-tree.json
{
  "factionId": "brandAuthority",
  "technologies": [
    {
      "id": "military-logistics-1",
      "tier": 1,
      "name": "Military Logistics I",
      "description": "Streamlined supply chains accelerate fleet production",
      "icon": "🚢",
      "cost": {
        "credits": 200,
        "influence": 50,
        "turns": 3
      },
      "prerequisites": [],
      "effects": [
        {
          "type": "production-bonus",
          "target": "fleet-production-speed",
          "value": 0.10
        }
      ],
      "unlocks": {
        "units": [],
        "buildings": [],
        "missions": []
      },
      "startingTech": true
    },
    {
      "id": "corporate-tax-reform",
      "tier": 1,
      "name": "Corporate Tax Reform",
      "description": "Optimized taxation policies increase revenue streams",
      "icon": "💰",
      "cost": {
        "credits": 300,
        "influence": 75,
        "turns": 4
      },
      "prerequisites": [],
      "effects": [
        {
          "type": "production-bonus",
          "target": "credit-income",
          "value": 0.15
        }
      ],
      "unlocks": {
        "units": [],
        "buildings": [],
        "missions": []
      }
    },
    // ... more technologies
    {
      "id": "galactic-administration",
      "tier": 5,
      "name": "Galactic Administration",
      "description": "Total bureaucratic control eliminates loyalty decay",
      "icon": "🏛️",
      "cost": {
        "credits": 5000,
        "influence": 1000,
        "turns": 12
      },
      "prerequisites": ["supercarrier-program", "integrated-defense-grid", "economic-hegemony"],
      "effects": [
        {
          "type": "unique-capability",
          "target": "loyalty-decay-elimination",
          "value": null
        },
        {
          "type": "unique-capability",
          "target": "remote-system-management",
          "value": null
        }
      ],
      "unlocks": {
        "units": ["enforcer-capital-ship"],
        "buildings": [],
        "missions": [],
        "victoryConditions": ["economic-dominance"]
      }
    }
  ]
}
```

### Faction Technology State

```javascript
// Technology state (part of faction state object)
{
  completedTechnologies: [
    'military-logistics-1',
    'corporate-tax-reform',
    'fleet-doctrine-overwhelming-force'
  ],
  
  currentResearch: {
    techId: 'advanced-shipyards',
    progress: 45,           // Percentage complete
    turnsRemaining: 4,
    startedOnTurn: 8,
    completesOnTurn: 15
  },
  
  researchQueue: [
    'intelligence-apparatus',
    'resource-optimization'
  ],
  
  multiResearchSlots: 1,    // Base 1, can increase via tech
  
  activeResearchProjects: [
    {
      techId: 'advanced-shipyards',
      progress: 45,
      turnsRemaining: 4
    }
    // If multi-research enabled, more projects here
  ],
  
  appliedEffects: [
    { techId: 'military-logistics-1', type: 'production-bonus', target: 'fleet-production-speed', value: 0.10 },
    { techId: 'corporate-tax-reform', type: 'production-bonus', target: 'credit-income', value: 0.15 },
    // ... all effects from completed techs
  ]
}
```

### Research Algorithm

```javascript
// Begin research on a technology
function beginResearch(faction, techId) {
  const tech = getTechnologyDefinition(techId);
  
  // Validate prerequisites
  if (!checkPrerequisites(faction, tech)) {
    return { success: false, error: 'Prerequisites not met' };
  }
  
  // Check multi-research capacity
  if (faction.activeResearchProjects.length >= faction.multiResearchSlots) {
    return { success: false, error: 'Already researching maximum technologies' };
  }
  
  // Calculate costs (apply faction modifiers and Research Facility bonuses)
  const costModifier = getFactionResearchCostModifier(faction);
  const facilitiesBonus = getResearchFacilityBonus(faction);
  const totalCostModifier = costModifier * (1 - facilitiesBonus);
  
  const finalCost = {
    credits: Math.floor(tech.cost.credits * totalCostModifier),
    influence: Math.floor(tech.cost.influence * totalCostModifier),
    turns: tech.cost.turns // Turns not modified for base spec
  };
  
  // Check if faction has resources
  const canAfford = spendResources(faction, finalCost);
  if (!canAfford.success) {
    return { success: false, error: canAfford.error };
  }
  
  // Create research project
  faction.activeResearchProjects.push({
    techId: techId,
    progress: 0,
    turnsRemaining: finalCost.turns,
    startedOnTurn: currentTurn,
    completesOnTurn: currentTurn + finalCost.turns
  });
  
  return { success: true };
}

// Advance research each turn
function advanceResearch(faction) {
  for (const project of faction.activeResearchProjects) {
    project.turnsRemaining -= 1;
    project.progress = (1 - (project.turnsRemaining / project.completesOnTurn - project.startedOnTurn)) * 100;
    
    if (project.turnsRemaining <= 0) {
      completeTechnology(faction, project.techId);
      
      // Remove from active projects
      faction.activeResearchProjects = faction.activeResearchProjects.filter(p => p.techId !== project.techId);
      
      // Start next queued tech if available
      if (faction.researchQueue.length > 0 && faction.activeResearchProjects.length < faction.multiResearchSlots) {
        const nextTechId = faction.researchQueue.shift();
        beginResearch(faction, nextTechId);
      }
    }
  }
}

// Complete technology and apply effects
function completeTechnology(faction, techId) {
  const tech = getTechnologyDefinition(techId);
  
  // Add to completed list
  faction.completedTechnologies.push(techId);
  
  // Apply all effects
  for (const effect of tech.effects) {
    applyTechnologyEffect(faction, effect, techId);
  }
  
  // Unlock units, buildings, missions
  unlockContent(faction, tech.unlocks);
  
  // Notify player
  showNotification(`Technology Complete: ${tech.name}`, tech.description);
}
```

### Tech Tree UI Component (React)

```jsx
// src/components/TechTree.jsx
export function TechTree({ faction }) {
  const techTree = loadTechTree(faction.id);
  const [selectedTech, setSelectedTech] = useState(null);
  
  const getTechState = (tech) => {
    if (faction.completedTechnologies.includes(tech.id)) return 'completed';
    if (faction.activeResearchProjects.some(p => p.techId === tech.id)) return 'researching';
    if (checkPrerequisites(faction, tech)) return 'available';
    return 'locked';
  };
  
  return (
    <div className="tech-tree">
      <h2>{faction.displayName} Technology Tree</h2>
      
      {[1, 2, 3, 4, 5].map(tier => (
        <div key={tier} className="tech-tier">
          <h3>Tier {tier}</h3>
          <div className="tech-row">
            {techTree.technologies
              .filter(t => t.tier === tier)
              .map(tech => (
                <TechNode 
                  key={tech.id}
                  tech={tech}
                  state={getTechState(tech)}
                  onClick={() => setSelectedTech(tech)}
                  prerequisites={tech.prerequisites}
                />
              ))
            }
          </div>
        </div>
      ))}
      
      {selectedTech && (
        <TechDetailPanel 
          tech={selectedTech}
          faction={faction}
          onBeginResearch={(techId) => beginResearch(faction, techId)}
          onClose={() => setSelectedTech(null)}
        />
      )}
      
      <ResearchQueue faction={faction} />
    </div>
  );
}
```

## Dependencies

### Prerequisite Features
- **Faction Identity** - Defines faction bonuses/penalties and starting techs
- **Resource Management** - Research consumes credits/influence
- **DataBridge** (✅ Implemented) - Required for state persistence

### Dependent Features
- **Turn System** (Phase 1A) - Advances research progress each turn
- **Fleet Management** (Phase 1B) - Unit unlocks enable new ship construction
- **Base Construction** (Phase 1C) - Building unlocks enable new facility construction
- **Mission System** (Phase 1B) - Mission unlocks enable new covert actions
- **Victory Conditions** - Tier 5 techs enable/accelerate victory paths

## Future Considerations

### Phase 1B Enhancements
- Espionage mission: "Acquire Technology" (steal tech from enemies)
- Technology trading between factions (diplomacy)
- Character-assisted research (assign characters to research projects for speed bonus)

### Phase 1C Enhancements
- Additional tech tiers (Tier 6-7 for extended campaigns)
- Branching tech paths (mutually exclusive specializations)
- Tech tree customization (player chooses starting tech from Tier 1)

### Phase 1D Enhancements
- Research Labs building bonuses (already planned in spec)
- Tech achievements (complete all Tier X techs, etc.)
- Tech tree visualizations (animated tech tree, 3D representation)

### Modding Support
- Expose tech definitions as JSON for easy modding
- Support custom technology effects via JavaScript scripts
- Allow adding new tiers and technologies without code changes

## Open Questions

1. **Research Speed Balance**: Are turn requirements too long/short?
   - *Recommendation*: Validate via playtesting; Tier 5 should take ~12-15 turns minimum

2. **Multi-Research**: Should other factions unlock multi-research capability?
   - *Recommendation*: Yes, via Tier 4 tech for Brand Authority and Union to maintain balance

3. **Tech Stealing**: Should "Acquire Technology" mission copy or remove tech from enemy?
   - *Recommendation*: Copy only, but high difficulty/cost missions

4. **Prerequisite Flexibility**: Should some Tier 3+ techs require specific Tier 2 techs or just "any 2"?
   - *Recommendation*: Mix of both; some techs require specific (e.g., "Advanced Shipyards" requires "Fleet Doctrine"), others flexible

5. **Tier 5 Balance**: Are Tier 5 techs too powerful (victory enablers)?
   - *Recommendation*: Intentionally powerful; designed as late-game power spikes that feel rewarding

6. **Research Facility Stacking**: Should multiple facilities in different systems stack discount?
   - *Recommendation*: Yes, but cap at -50% to prevent exploit

## References

- [Feature Catalog - Faction Management](../../product/feature-catalog.md#2-faction-management)
- [Faction Identity Spec](../faction-identity/spec.md)
- [Resource Management Spec](../resource-management/spec.md)
- [galaxy-generator.js](../../../core/galaxy-generator.js) - Research Facility special type
- [data-bridge.js](../../../core/data-bridge.js) - State persistence
