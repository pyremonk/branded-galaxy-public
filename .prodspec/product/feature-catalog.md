# Branded Galaxy - Feature Catalog

## Project Overview

**Branded Galaxy** is a grand strategy game inspired by Star Wars: Rebellion (1998), featuring galactic-scale resource management, diplomacy, character-driven missions, and fleet combat. The game supports 1-3 players with asymmetric faction gameplay and distinct victory conditions.

### Core Design Pillars

1. **Grand Strategy** - Manage resources, fleets, and planets across a galaxy map
2. **Character-Driven Gameplay** - Deploy leaders on missions (diplomacy, espionage, sabotage, research)
3. **Asymmetric Factions** - Each faction has unique strengths, weaknesses, and win conditions
4. **Hidden Information** - Fog of war, secret bases, covert operations
5. **Multi-Player Support** - 1-3 player modes with AI opponents

### Faction Structure (3-Player Mode)

- **The Brand Authority** - Conglomerate of powerful corporations that run the galaxy economically and militarily, seeking to maintain control
- **The Union** - Growing coalition of Brand Authority opposition groups seeking sovereignty for systems, with a hidden base and guerrilla tactics
- **The Autoforge** - Network of autonomous robots, machines, and AI providing manufacturing and maintenance labor, mostly neutral with ties to both factions

---

## Feature Status Legend

- ✅ **Implemented** - Feature is live in the codebase
- 🚧 **Partial** - Core logic implemented; known gaps or incomplete acceptance criteria
- 📋 **Planned** - Designed but not started
- ⏸️ **Paused** - Started but blocked/deprioritized

---

## Feature Categories

### 1. Galaxy Map & Systems ✅  `specs: 001–004`

The galaxy map is the central playing field where all strategic actions occur.

#### Features:
- **Galaxy Generation** `001` [spec](../specs/galaxy-map-systems/001-galaxy-generation-spec.md) ✅ **Implemented**
  - Procedural galaxy layout with sectors and star systems
  - System properties (population, resources, loyalty)
  - Hyperspace tunnels connect highly-populated systems together
  - Seeded random generation for reproducibility
  - Configurable galaxy sizes (small/medium/large)
  - Static sector definitions from galaxy-names.json
  
- **Galaxy Map** `002` [spec](../specs/galaxy-map-systems/002-galaxy-map-spec.md) ✅ **Implemented**
  - Galaxy map provides a view of all sectors and systems
  - Shows sector regions and the systems within them
  - Visual representation with faction-colored systems
  - System size scales with population
  - Hyperspace connection visualization
  - Camera pan and zoom controls
  
- **System Details** `003` [spec](../specs/galaxy-map-systems/003-system-details-spec.md) ✅ **Implemented**
  - System loyalty (Brand Authority/Union/Autoforge/Neutral)
  - Population level and faction support
  - Resource production (credits, materials)
  - Special locations (manufacturing centers, research facilities, trade hubs, strategic chokepoints)
  - Hyperspace connection information
  - Interactive side panel with detailed information

- **Map Interaction** `004` [spec](../specs/galaxy-map-systems/004-map-interaction-spec.md) ✅ **Implemented**
  - Click to select systems
  - View system information panel
  - Hover tooltips for quick information
  - Camera pan (drag or arrow keys)
  - Camera zoom (mouse wheel or +/- keys)
  - Double-click to center on system
  - Keyboard shortcuts (Space, ESC, Tab)
  - System selection and deselection

---

### 2. Faction Management ✅  `specs: 005–008`

Each player controls a faction with unique characteristics and resources.

#### Features:
- **Faction Identity** `005` [spec](../specs/faction-management/005-faction-identity-spec.md) ✅ *Implemented February 17, 2026*
  - Three playable factions: Brand Authority, The Union, The Autoforge
  - Unique faction bonuses and penalties per faction (see `core/faction-definitions.json`)
  - Victory conditions specific to each faction (4 per faction)
  - Starting resources and territories (faction-specific counts and criteria)
  - Faction selection UI with emblem SVGs, lore, bonus/restriction display
  - Runtime state management via `FactionStateManager`
  - Bonus/restriction application via `BonusApplier`
  - Galaxy generator faction-aware assignment (`assignFactionsWithDefinitions`)
  - Faction state persistence via `DataBridge.saveFactionState/loadFactionState`
  - Visual identity: faction-colored system circles with loyalty-value opacity
  
- **Resource Management** `006` [spec](../specs/faction-management/006-resource-management-spec.md) ✅ *Implemented February 17, 2026*
  - Credits, Materials, Recruits, Influence resources with per-turn production
  - `ResourceEngine` — production calculation with faction bonuses and tech modifiers
  - `ResourceStateManager` — per-faction state with storage caps, serialization
  - `resource-config.json` — configurable base rates, storage caps, costs
  - React HUDs: `ResourceHUD`, `ResourceBreakdown`, `ResourceTrends`, `TransactionLog`
  - Phaser ↔ React bridge via `galaxy:resourceUpdate` CustomEvent
  - DataBridge persistence (`saveResourceState` / `loadResourceState`)

- **Technology/Research Tree** `007` [spec](../specs/faction-management/007-technology-research-tree-spec.md) ✅ *Implemented*
  - Faction-specific tech paths (39 technologies across 3 factions, 5 tiers each)
  - Per-faction `TechStateManager` with serialization/deserialization
  - `TechResearchEngine` — begin/advance/complete/queue with turn-based progress
  - `TechEffectApplier` — 8 effect types: production-bonus, military-bonus, storage-cap-bonus, mission-bonus, research-bonus, cost-reduction, unique-capability, multi-research
  - Research cost: faction modifier × Research Facility discount, floor at 40% of base
  - React UI: `TechTree` modal (5-tier visual tree + SVG prereq lines), `TechDetailPanel`, `ResearchQueue`, `ResearchProgressHUD`
  - DataBridge persistence: `saveTechState` / `loadTechState` (localStorage + Supabase)
  - Phaser ↔ React bridge via CustomEvents (`game:techUpdate`, `game:beginResearch`, etc.)

- **Victory Conditions** `008` [spec](../specs/faction-management/008-victory-conditions-spec.md) ✅ *Implemented*
  - **Brand Authority**: Control X% of galaxy, eliminate Union base, achieve dominance
  - **The Union**: Gain X loyalty points, survive Y turns, complete objective
  - **The Autoforge**: Achieve system dependence where X% of systems rely on Autoforge technology for survival (infrastructure, life support, manufacturing)
  
---

### 3. Character/Leader System ✅  `specs: 009–012`

Characters are heroes and leaders deployed on missions and commanding fleets.

#### Features:
- **Character Roster** `009` [spec](../specs/character-leader-system/009-character-roster-spec.md) ✅ *Implemented*
  - Named characters with portraits and backstories
  - Character stats (combat, espionage, diplomacy, leadership, research)
  - Skill specializations with +2 effective stat bonuses
  - Experience and leveling (XP thresholds, stat increase on level-up)
  - Starting rosters: Brand Authority (4), Union (4), Autoforge (3)
  
- **Character Assignment** `010` [spec](../specs/character-leader-system/010-character-assignment-spec.md) ✅ *Implemented*
  - Assign to missions, fleet command, facilities, or unassigned
  - Status transitions: Available → On Mission / In Fleet / Stationed / Captured / Dead
  - Facility bonuses (research speed, recruit production, construction, trade)
  - `galaxy:characterAssigned` / `galaxy:characterUnassigned` events
  
- **Mission Success Calculation** `011` [spec](../specs/character-leader-system/011-mission-success-calculation-spec.md) ✅ *Implemented*
  - Pure function probability engine: stat → [0.26, 0.80] base range
  - Opposition resistance, faction modifiers, specialization bonuses
  - Outcome tiers: Critical Success / Success / Failure / Critical Failure
  - Seeded randomness via SeededRandom (deterministic replay)
  
- **Character Capture & Rescue** `012` [spec](../specs/character-leader-system/012-character-capture-rescue-spec.md) ✅ *Implemented*
  - Capture probability by trigger type (mission failure, fleet destruction, invasion)
  - `CharacterCaptureEngine` for intel leakage, interrogation, execution effects
  - Rescue mission uses Combat+Espionage stats
  - UI: CAPTURED badge, "Initiate Rescue" button in roster panel
  
---

### 4. Fleet Management & Combat ✅  `specs: 013–016`

Military forces that control space and defend/attack systems.

#### Features:
- **Fleet Composition** `013` [spec](../specs/fleet-management-combat/013-fleet-composition-spec.md) ✅ *Implemented February 19, 2026*
  - Ship types in `core/fleet-config.json`: Fighter, Corvette, Cruiser, Capital Ship (universal) + 6 faction-exclusive ships
  - Fleet organization: named fleets of 1–12 ships; createFleet/splitFleet/mergeFleets/scrapShip
  - Fleet aggregate stats: total combat power (with commander/tech bonuses), fleet speed (min ship speed), total maintenance
  - Ship production queue per Shipyard system; `advanceProduction()` completes 1 ship per turn
  - `FleetStateManager` — full serialize/deserialize for save/load; persisted via `DataBridge.saveFleetState`
  - Maintenance deduction each turn during Maintenance Phase; -10% combat penalty when unpaid
  - Scrap returns 25% of production cost in Materials (FR-FC-005)
  
- **Fleet Movement** `014` [spec](../specs/fleet-management-combat/014-fleet-movement-spec.md) ✅ *Updated February 23, 2026*
  - Two movement modes: **lane travel** (1 turn/hop via BFS shortest path) and **direct travel** (2–8 turns based on Euclidean distance)
  - Any system is reachable; isolated systems (no lane connections) accessible via direct travel
  - `stageMoveFleet(fleetId, destinationId, travelMode, galaxy)` — validates lane path or computes direct turn cost
  - `calculateTravelOptions(fleetId, destinationId, galaxy)` — returns both options with turn costs for UI
  - BFS helper `_bfsLanePath` computes shortest hyperspace route
  - Direct transit: fleet stays at origin until arrival; invisible to enemies; `turnsRemaining` decrements each Resolution Phase
  - In-transit status shows mode and remaining hops/turns in FleetStatusPanel
  - `galaxy.dimensions` exposed on galaxy object; passed to React via `galaxy:fleetUpdate` for client-side travel cost computation
  - `travelConfig` in `fleet-config.json`: `maxTurns: 8`, `directTravelMinTurns: 2`, `laneHopTurns: 1`
  - Blockade mechanic: `assignCommand(fleetId, 'blockade')` prevents enemy entry without combat
  - `resolveFleetArrivals(galaxy)` handles both lane and direct modes in Resolution Phase
  
- **Space Combat** `015` [spec](../specs/fleet-management-combat/015-space-combat-spec.md) ✅ *Implemented February 19, 2026*
  - `CombatEngine` — synchronous auto-resolve in < 100ms for 12-ship fleets
  - Power calculation: base + commander bonus + tech bonus; defending fleet +10%/+5% for defense platforms/shields
  - Round simulation: simultaneous damage with seeded random factor; ships removed weakest-first
  - Outcomes: Attacker Victory / Defender Victory / Draw (after 10 rounds, or auto-retreat at < 50% power after round 3)
  - Commander capture roll triggered when fleet is destroyed (FR-SC-006 — external resolver hook)
  - Special abilities: Fighter carrier synergy (+15%), Stealth Corvette evasion (30%), Blockade Runner first strike (+50%), Droid Carrier self-repair (1 Hull/round)
  - Combat Log generated per-combat; last 10 entries retained in FleetStateManager
  - `resolveAllCombats()` wired into `TurnResolutionEngine._resolveSpaceCombat()`
  
- **Fleet Commands** `016` [spec](../specs/fleet-management-combat/016-fleet-commands-spec.md) ✅ *Updated February 23, 2026*
  - Three command types: Patrol (looping hyperspace-lane route), Raid (one-shot), Blockade (hold)
  - Escort command removed; fleet characters do not require escort
  - `assignCommand(fleetId, commandType, commandData)` — cancels previous command
  - Patrol executes one route step (lane hop) per Resolution Phase via `resolveFleetCommands()`
  - Patrol route is lane-only; direct travel not permitted for patrol commands
  - Raid command: single-use; fleet moves to adjacent target, initiates combat, retreats; resolved in Resolution Phase
  - Brand Authority -15% / Union +15% raid damage modifiers defined in fleet-config.json
  - All command state serialized in `FleetStateManager.serialize()`
  
---

### 5. Base Construction & Facilities ✅  `specs: 017–020`

Players build facilities on controlled planets to enhance capabilities.

#### Features:
- **Base Types** `017` [spec](../specs/base-construction-facilities/017-base-types-spec.md) ✅
  - **Secret Base** (The Union) - Hidden HQ that must remain undiscovered
  - **Sector HQ** (Brand Authority) - Regional command centers
  - **Outposts** (The Autoforge) - Forward operating bases
  
- **Facility Construction** `018` [spec](../specs/base-construction-facilities/018-facility-construction-spec.md) ✅
  - Shipyards (build ships)
  - Training facilities (recruit units/characters)
  - Research labs (speed up tech research)
  - Defense platforms (orbital defenses)
  - Resource extractors (boost production)
  
- **Base Management** `019` [spec](../specs/base-construction-facilities/019-base-management-spec.md) ✅
  - Construction queues
  - Construction time and costs
  - Facility upgrades
  - Demolition and reconstruction
  - Command Overview panel (multi-system facility status)
  
- **Planetary Defenses** `020` [spec](../specs/base-construction-facilities/020-planetary-defenses-spec.md) ✅
  - Ground troops (auto-generation + manual reinforcement)
  - Shield generators
  - Ion cannons
  - Defense calculation during invasions
  
---

### 6. Mission System ✅  `specs: 021–023`

Characters undertake covert and diplomatic missions to advance faction goals.

#### Features:
- **Mission Types** `021` [spec](../specs/mission-system/021-mission-types-spec.md) ✅ *Implemented*
  - **11 mission types** in `core/mission-config.json`: diplomatic, espionage, sabotage, recruitment, research-assist, incite-uprising, abduction, assassination, reconnaissance, false_intel, rescue
  - Each type has distinct stats, duration, effects, and outcome behavior
  - All mission types are selectable in the mission planning flow
  
- **Mission Execution** `022` [spec](../specs/mission-system/022-mission-execution-spec.md) ✅ *Implemented*
  - `MissionEngine` (871 lines): full outcome pipeline — `resolveMission()`, effect dispatchers for all effect types
  - `MissionStateManager`: active multi-turn tracking, mission log (30 entries/faction), revolt tracking
  - `ActiveMissionsPanel.jsx`: Staged/Active/Completed tabs, progress bars, cancel button
  - Counter-intelligence reduction (15%) wired into resolution
  - Character XP awards on completion
  
- **Mission Outcomes** `023` [spec](../specs/mission-system/023-mission-outcomes-spec.md) ✅ *Implemented*
  - Four outcome tiers: Critical Success / Success / Failure / Critical Failure
  - Effect types: loyalty_shift, facility_damage, intel_reveal, character_status, recruit_character, system_revolt, plant_false_intel, research_advance
  - Character capture risk on Failure/Critical Failure via `CharacterCaptureEngine`
  - Enemy detection notifications dispatched to both factions
  
---

### 7. Diplomacy & Planet Loyalty ✅  `specs: 024–027`

Systems can shift allegiance based on diplomatic efforts and military pressure.

#### Features:
- **Loyalty System** `024` [spec](../specs/diplomacy-planet-loyalty/024-loyalty-system-spec.md) ✅ *Implemented*
  - `LoyaltyStateManager` (655 lines): per-system per-faction loyalty 0–100
  - Passive drift: controller +2/turn, others -1/turn; occupation drift modifier
  - Defection trigger at loyalty < 30; player control threshold at 40
  - `PASSIVE_DRIFT_FLOOR = 10`; timed bonuses and diplomatic holds
  - Fires `galaxy:loyaltyUpdate` on changes
  
- **Diplomatic Actions** `025` [spec](../specs/diplomacy-planet-loyalty/025-diplomatic-actions-spec.md) ✅ *Implemented*
  - `DiplomacyEngine` (342 lines): **5 action types** — propaganda, tradeAgreement, resourceInvestment, allianceProposal, diplomaticHold
  - Union 10% diplomatic cost discount
  - Per-faction eligibility validation and de-dup tracking
  - SystemDetails.jsx "Diplomacy & Loyalty" tab: per-faction loyalty bars + action buttons with cost/effect previews
  
- **Loyalty Effects** `026` [spec](../specs/diplomacy-planet-loyalty/026-loyalty-effects-spec.md) ✅ *Implemented*
  - Loyalty directly modifies per-system resource production (via `ResourceEngine`)
  - Low-loyalty systems trigger defection (control change) on maintenance phase
  - Loyalty defense bonus in ground combat: `(loyalty/100) × 0.30`
  - Systems display loyalty trends and current faction breakdown in SystemDetails
  
- **System Capture** `027` [spec](../specs/diplomacy-planet-loyalty/027-system-capture-spec.md) ✅ *Implemented*
  - Military occupation after successful ground combat reduces occupying controlling loyalty
  - Diplomatic conversion via `DiplomacyEngine` actions
  - System capture event fires `galaxy:systemCaptured` with particle effect
  - Loyalty reset rules applied per `LoyaltyStateManager.captureSystem()`
  
---

### 8. Intelligence & Fog of War ✅  `specs: 042–044`

Information warfare is critical - knowing enemy positions and plans.

#### Features:
- **Intel System** `042` [spec](../specs/intelligence-fog-of-war/042-intel-system-spec.md) ✅ *Implemented*
  - `IntelStateManager`: 6 intel types, 50-item cap, turn-based expiry, serialize/deserialize
  - `IntelEngine`: patrol intel, outpost intel, recon intel, false intel, CI presence
  - Intel items persist in save data and expire correctly during Maintenance Phase
  - **Fog of war**: `System.applyFogState()` dims non-owned/no-intel nodes to near-invisible dark gray; `_updateFogOfWar()` in MainStage runs on init, intel update, and hot-seat player switch
  - **Intel indicator**: blue ◆ icon on map nodes with active intel (`System.setIntelIndicator()`)
  - **Fleet/Facility filter fog-gating**: overlays only show enemy data for intel-confirmed systems
  - **SystemDetails gating**: Overview tab hides loyalty %, Resources/Facilities tabs gate content behind intel; IntelTab fully implemented with item list, type labels, expiry display
  
- **Intelligence Reports** `043` [spec](../specs/intelligence-fog-of-war/043-intelligence-reports-spec.md) ✅ *Implemented*
  - `IntelReportsPanel.jsx` (337 lines): Threat Summary, filter by type (fleet/loyalty/facility/character/resource/event), sort by age/system, age color coding, expiry warnings, source badges
  - Opens via `I` keyboard shortcut and InfoNavHUD
  - Renders correctly with up to 50 items
  
- **Counter-Intelligence & Reconnaissance** `044` [spec](../specs/intelligence-fog-of-war/044-counter-intelligence-spec.md) ✅ *Implemented*
  - CI Duty character assignment with shield icon overlay in roster
  - CI presence stored in `system.ciPresence[factionId]` (0–10), decays 1/turn
  - Training Facility grants +2 passive CI presence
  - Enemy mission success reduced by 0.015 per CI point (max -0.15)
  - Spy detection on Failure/Critical Failure (doubles on CF); captured character + notifications
  - False Intel mission plants `"false": true` flagged items in enemy intel store
  - Reconnaissance mission generates all 5 intel types on Critical Success
  
---

### 9. Turn-Based Game Loop ✅  `specs: 028–031`

The game progresses in turns where players take actions sequentially or simultaneously.

#### Features:
- **Turn Structure** `028` [spec](../specs/turn-based-game-loop/028-turn-structure-spec.md) ✅ *Implemented February 18, 2026*
  - Three-phase state machine: ACTION → RESOLUTION → MAINTENANCE
  - `TurnStateManager` — phase transitions, pending action queue, turn summary accumulator
  - `TurnResolutionEngine` — synchronous resolution sequencer (tech, resources, victory)
  - Phase events via `galaxy:phaseStart` CustomEvent
  - `TurnSummaryHUD` — per-turn summary notification panel
  
- **Turn Order** `029` [spec](../specs/turn-based-game-loop/029-turn-order-spec.md) ✅ *Implemented February 18, 2026*
  - `InitiativeEngine` — seeded faction ordering with per-turn reroll
  - `InitiativeIndicator` HUD badge showing current faction initiative order
  - Initiative scores serialized and restored via DataBridge
  
- **Action Points/Limits** `030` [spec](../specs/turn-based-game-loop/030-action-points-limits-spec.md) ✅ *Implemented February 18, 2026*
  - Per-category action budget tracking (missions, fleets, construction)
  - `ActionLimitsHUD` — per-category action readiness summary panel
  - Budget validation in `submitActionPhase()` with conflict detection
  
- **Turn Timer** `031` [spec](../specs/turn-based-game-loop/031-turn-timer-spec.md) ✅ *Implemented February 18, 2026*
  - Turn counter tracked in `TurnStateManager`, increments end of Maintenance Phase
  - `TurnTimerHUD` — multiplayer action-phase countdown timer component
  - Victory condition evaluation runs each Maintenance Phase
  
---

### 10. AI Opponents ✅  `specs: 032–033`

Computer-controlled factions for single-player and incomplete multiplayer games.

#### Features:
- **AI Strategy** `032` [spec](../specs/ai-opponents/032-ai-strategy-spec.md) ✅ *Implemented*
  - `AIController` (952 lines): faction-specific personality weights
  - 3 difficulty levels: Easy (±30% score noise, re-eval every 5 turns), Medium (±5%, every 3), Hard (0%, every 1)
  - 6 macro goals: EXPAND, FORTIFY, SUPPRESS, STRIKE, RESEARCH, SURVIVE
  - Reactive strategy: adjusts goal weights based on galaxy power balance each evaluation
  
- **AI Actions** `033` [spec](../specs/ai-opponents/033-ai-actions-spec.md) ✅ *Implemented — with known gap: no facility construction*
  - Fleet orders: patrol, blockade, raid, escort
  - Missions: espionage, sabotage, diplomatic, recon, research-assist
  - Diplomatic actions targeting enemy/neutral systems
  - Tech research queue aligned to current macro goals
  - Ship production orders based on fleet power vs. threat level
  - Resource reserves respected (credits 200, materials 100, influence 50)
  - **Gap**: AI never queues facility builds — AI factions never develop system infrastructure
  
---

### 11. User Interface & Controls ✅  `specs: 034–036, 063`

Player interaction with all game systems.

#### Features:
- **Galaxy Map Filters** `034` [spec](../specs/user-interface-controls/034-galaxy-map-filters-spec.md) ✅ *Implemented February 18, 2026*
  - `MapFilterHUD` — overlay filter toolbar for loyalty, resources, and system state
  - Interactive sector and system display toggling
  - Zoom and pan controls via Phaser camera
  
- **Information Panels** `035` [spec](../specs/user-interface-controls/035-information-panels-spec.md) ✅ *Implemented February 18, 2026*
  - `SystemDetails` — full system detail side panel
  - `InfoNavHUD` — vertical nav buttons to open/close info panels
  - `InfoPanelFrame` — shared frame wrapper for all panel types
  - `FleetStatusPanel`, `CharacterRosterPanel`, `IntelReportsPanel` — panel stubs wired into nav
  - `ResearchQueue`, `TechDetailPanel`, `TechTree` — tech panels in the nav flow
  
- **Notifications & Alerts** `036` [spec](../specs/user-interface-controls/036-notifications-alerts-spec.md) ✅ *Implemented February 18, 2026*
  - `NotificationManager` — unified three-tier notification system (toast, banner, modal)
  - Listens to all `galaxy:*` CustomEvents for automatic alert routing
  - Turn summary, resource update, research complete, and victory alerts

- **Player Alerts** `063` [spec](../specs/user-interface-controls/063-player-alerts-spec.md) ✅ *Implemented*
  - `AlertContext.jsx` — `window.__alertState` sync bridge, `game:restoreAlertState` listener
  - `AlertBar.jsx` — persistent alert bar in TopBarHUD with scrolling single-line messages
  - `AlertHistoryPanel.jsx` — two-column alert history (list + outcome detail)
  - Six alert categories: Mission Report, Fleet Report, Combat Alert, Event Notification, System Capture, Intel Report
  - `galaxy:playerAlert` dispatched from `TurnResolutionEngine` + `CombatEngine`; save version bumped to 5
  
---

### 12. Game Setup & Configuration ✅  `specs: 037–039`

Initial game configuration and new game creation.

#### Features:
- **Game Mode Selection** `037` [spec](../specs/game-setup-configuration/037-game-mode-selection-spec.md) ✅ *Implemented February 18, 2026*
  - `GameSetupScreen` — combined game mode + difficulty selection screen
  - Single-player vs AI, 2-Player, 3-Player mode selection
  - Hot-seat mode; network multiplayer reserved for Phase 1D
  
- **Faction Selection** ✅
  - `FactionSelector` — faction picker with emblem, lore, bonuses, and victory condition preview
  - Integrated into the pre-game auth/setup flow in `App.jsx`
  
- **Difficulty Settings** `038` [spec](../specs/game-setup-configuration/038-difficulty-settings-spec.md) ✅ *Implemented February 18, 2026*
  - Difficulty options (Easy/Normal/Hard) in `GameSetupScreen`
  - Difficulty scalar applied to AI behavior and starting resources
  
- **Galaxy Setup** `039` [spec](../specs/game-setup-configuration/039-galaxy-setup-spec.md) ✅ *Implemented February 18, 2026*
  - `GalaxySetupScreen` — seed input, scenario picker, minimap preview
  - Random or fixed seed for reproducible galaxy generation
  - Galaxy size selection (small/medium/large)
  
---

### 13. Save/Load System 🚧  `specs: 040–041`

Persist game state between sessions.

#### Features:
- **Save Game** `040` [spec](../specs/save-load-system/040-save-game-spec.md) 🚧 *Partial — UI and core state complete; construction + mission state missing*
  - `SaveStateManager.createSnapshot()`: serializes galaxy (deep clone), resourceStates, techStates, characterStates, fleetState, turnState (with initiative), victoryStates, eventState, intelState, gameConfig, tutorialStep
  - Auto-save at turn end + 5 manual save slots + auto slot
  - `SaveLoadScreen.jsx`: editable slot names, overwrite confirmation, delete with confirm, timestamps, faction label, turn number
  - **Gap**: `constructionStateManager` is NOT serialized — building queues, facility HP, and ground troops are lost on reload
  - **Gap**: `missionStateManager` is NOT serialized — active mission queue, mission log, revolts, and stat penalties are lost on reload
  - **Gap**: `loyaltyStateManager` transient state (timed bonuses, diplomatic holds, action history) not serialized
  
- **Load Game** `041` [spec](../specs/save-load-system/041-load-game-spec.md) 🚧 *Partial — loads all serialized state; gaps mirror save gaps*
  - Load from any save slot with preview (faction name, turn number, save date)
  - Version validation (`validateVersion()`) with breaking-change detection
  - **Gap**: Hot-seat multiplayer games cannot be saved or resumed
  
---

### 14. Event System 🚧  `specs: 045`

Dynamic events that create narrative and strategic challenges.

#### Features:
- **Event System** `045` [spec](../specs/event-system/045-event-system-spec.md) ✅ *Implemented — engine + 43-event pool with faction-specific events*
  - `EventEngine` (586 lines): random + scripted event resolution each turn, 3-turn cooldown, `applyPlayerChoice()`, serialize/deserialize, event log
  - **12 events total**: 7 random + 5 scripted (includes choice-based events)
  - `EventChoiceModal.jsx`: queued event presentation with choice buttons, cost/reward/hint display
  - Wired into TurnResolutionEngine step 8; event log serialized in save data
  - All 8 effect types implemented: resource_delta, loyalty_delta, fleet_damage, facility_damage, spawn_fleet, character_lost, intel_item, notify
  - **Gap**: Only 12 events — pool too thin for replayability in long games; same events recur frequently
  - **Gap**: No faction-specific random events; no long-term consequence chains or follow-up events
  
---

### 15. Combat Resolution System ✅  `specs: 046–048`

Detailed automated combat between fleets and planetary defenses.

#### Features:
- **Combat Modes** `046` [spec](../specs/combat-resolution-system/046-combat-modes-spec.md) ✅ *Implemented*
  - Auto-resolve is the default and only mode in Phase 1
  - Tactical Combat option shown as "Coming Soon" (disabled) in Galaxy Setup
  - Combat Reports generated for every engagement, accessible from Turn Summary and System Detail
  - Winner/loser notifications dispatched with correct severity tiers
  
- **Combat Mechanics** `047` [spec](../specs/combat-resolution-system/047-combat-mechanics-spec.md) ✅ *Implemented*
  - Effective power formula: base × (1 + leadership + tech + facility + loyalty bonuses)
  - Round simulation: 10% damage/round, weakest ships removed first, max 10 rounds
  - Surrender threshold at ≤25% starting power; retreat success = 50% + 5% per Leadership (capped)
  - Successful retreat moves ships to nearest friendly system
  - Draw rule: defender wins at 10-round cap (overwhelming superiority override: ≥50% advantage for 5 consecutive rounds)
  - All randomness seeded from `turnNumber + systemId + attackerFactionId`
  - Active TechEffectApplier combat modifiers included in effective power calculation
  
- **Ground Combat** `048` [spec](../specs/combat-resolution-system/048-ground-combat-spec.md) ✅ *Implemented*
  - `GroundCombatEngine` (237 lines): round-based (max 15), attacker = `floor(fleet_power / 10)`
  - Defense Platform (+0.15), Ion Cannon (+0.10), Shield Generator (−20% attacker casualties)
  - Loyalty defense bonus: `(loyalty/100) × 0.30`
  - Invasion failure leaves attacker in blockade; system control unchanged
  - Ground Combat Report appended to space combat report
  - Wired into CombatEngine → TurnResolutionEngine pipeline
  - **Note**: Phase 1 auto-invades after space combat victory (no player Invade vs. Blockade choice)
  
---

### 16. Multiplayer & Networking ✅  `specs: 049–050`

Support for multiple human players over network or hot-seat.

#### Features:
- **Multiplayer Modes** `049` [spec](../specs/multiplayer-networking/049-multiplayer-modes-spec.md) ✅ *Implemented*
  - Hot-seat (local pass-and-play) with `PassDeviceInterstitial` full-screen obscuring overlay
  - Network multiplayer via Supabase Realtime (requires `.env.local` credentials)
  - `HotSeatManager`: getCurrentPlayer, advanceToNextPlayer, serialize/deserialize
  
- **Network Features** `050` [spec](../specs/multiplayer-networking/050-network-features-spec.md) ✅ *Implemented*
  - Join/host game (6-character game code, Supabase Realtime lobby)
  - Lobby: player list, faction assignments, ready status, chat
  - Turn submission and sync (host collects orders, resolves, broadcasts delta)
  - 120s disconnect grace period → AI conversion → host promotion
  - **Note**: Hot-seat games cannot be saved or resumed; network requires Supabase credentials
  
---

### 17. Audio & Visual Presentation 🚧  `specs: 051–052`

Graphics, sound, and UI polish.

#### Features:
- **Visual Style** `051` [spec](../specs/audio-visual-presentation/051-visual-style-spec.md) ✅ *Implemented — dark theme, fleet transit animation, combat result modal*
  - GitHub-inspired dark theme applied consistently; CSS design tokens in `src/styles/global.css`
  - Orbitron/Inter/JetBrains Mono fonts; faction-colored system nodes with loyalty-value opacity
  - Particle effects: combat flash (red), system capture (faction-color), tech completed (purple)
  - **Gap**: No animated fleet movement along hyperspace routes
  - **Gap**: No ship or character portrait artwork
  - **Gap**: No dedicated combat visual effects or invasion animations
  
- **Audio** `052` [spec](../specs/audio-visual-presentation/052-audio-spec.md) ✅ *Implemented*
  - `AudioManager` (437 lines): Web Audio API; 21 named procedurally-generated SFX keys
  - Ambient drone music (2-layer, browser autoplay policy handled via first-gesture listener)
  - `AudioSettingsPanel.jsx`: Master/Music/SFX sliders, Mute All toggle, localStorage persistence
  
---

### 18. Tutorial & Help System ✅  `specs: 053–054`

Onboard new players to complex strategy game.

#### Features:
- **Tutorial Campaign** `053` [spec](../specs/tutorial-help-system/053-tutorial-campaign-spec.md) ✅ *Implemented February 19, 2026*
  - Fixed 6-system tutorial galaxy (`core/tutorial-scenario.json`) — brandAuthority vs union, Easy AI
  - 14 step-by-step guided prompts (`core/tutorial-steps.json`) — covers galaxy map, resources, construction, fleet, missions, research, victory
  - `TutorialEngine` class — event-driven step progression, advance/skip/reset, auto-advance timer support
  - Non-blocking `TutorialOverlay` React component — bottom-left card with step counter, instruction, hint, action button
  - Tutorial entry point on main menu: prominent "Start Tutorial" button (first launch), secondary after completion
  - Completion modal with Start New Game / Replay / Return to Menu options
  - Tutorial complete state persisted in `localStorage` (`brandedGalaxy_tutorialComplete`)
  - Tutorial session save/resume supported via `tutorialStep` in save snapshot
  - `launchTutorial()` in `App.jsx` bypasses faction selection and setup screens
  
- **In-Game Help** `054` [spec](../specs/tutorial-help-system/054-in-game-help-spec.md) ✅ *Implemented February 19, 2026*
  - `HelpPanel` — full-screen modal with search bar, 15-category sidebar, article viewer, cross-reference links (`core/help-articles.json`, 25 articles + 12 glossary entries)
  - Opens via `?` / `F1` keyboard shortcut or `?` button in the HUD corner
  - `HelpTooltip` wrapper component — 400ms hover / 500ms long-press, viewport edge flip, max 280px; `core/help-definitions.json` (28 definitions)
  - Context-sensitive tips via `_checkContextSensitiveTips()` in MainStage: 3+ characters (CI Duty), 6+ ship fleet (Commander), loyalty < 40 (diplomatic actions), mission fail, research complete
  - Tip suppression: shown-tip IDs tracked in `MainStage.shownTips` Set; "Don't show tips" supported via toggle
  - All help content bundled as static JSON — no network requests
  
### 19. Hybrid Async/Sync Mode System �  `specs: 055–062`

Refactor the game from pure turn-based to a hybrid model supporting both async (turn-based) and sync (realtime tick-based) modes, switchable per session.

#### Features:
- **Simulation Determinism** `055` [spec](../specs/hybrid-async-sync-mode/055-simulation-determinism-spec.md) 📋
  - Eliminate `Math.random()` and `Date.now()` from all simulation paths
  - Extend `SeededRandom` with `getState()`/`setState()` for snapshot/restore
  - Deterministic ID generator utility (`deterministic-id.js`)
  - Prerequisite for lockstep sync mode

- **Game Session & Presence Foundation** `056` [spec](../specs/hybrid-async-sync-mode/056-game-session-presence-spec.md) ✅
  - Supabase schema: `games`, `turn_orders`, `game_state`, `game_snapshots` tables
  - `SessionPresenceManager` — tracks online/offline/spectator status via Supabase Presence
  - RLS policies for multi-tenant game isolation
  - `DataBridge.getClient()` accessor for direct Supabase access

- **Host Election & Ready System** `057` [spec](../specs/hybrid-async-sync-mode/057-host-election-ready-spec.md) ✅ *Implemented*
  - `electHost()` exported from `SessionPresenceManager` — deterministic lowest-userId election with automatic failover
  - Ready gating: all players must ready-up before sync mode entry
  - Solo mode: always host, always ready, direct toggle — no ceremony
  - Disconnect grace: 5s sync / 120s async before host migration and AI conversion
  - `NetworkSessionManager` tracks `syncHostId` separately from lobby host role

- **Sync Mode Tick Loop** `058` [spec](../specs/hybrid-async-sync-mode/058-sync-mode-tick-loop-spec.md) 📋
  - Deterministic lockstep tick loop: host `setInterval` scheduler at configurable Hz
  - Broadcast protocol: `tick_start`, `player_input`, `authoritative_input_bundle`, `speed_change`
  - Input collection with 80% timeout (late inputs queued to next tick)
  - Headless resolution (no blocking modals during sync ticks)
  - Solo mode tick loop: local-only, AI commands per tick
  - Depends on 061 for turn-boundary logic

- **Snapshots & State Reconciliation** `059` [spec](../specs/hybrid-async-sync-mode/059-snapshots-reconciliation-spec.md) 📋
  - Periodic state snapshots every `SNAPSHOT_INTERVAL` ticks (default 10)
  - Reconciliation for lagging/rejoining clients when gap > 5 ticks
  - Serialization normalization (3 managers return JSON strings → objects)
  - Shared serialization path with `SaveStateManager`

- **Async Flow & Mode Switching UI** `060` [spec](../specs/hybrid-async-sync-mode/060-async-flow-mode-switching-spec.md) 📋
  - `TurnManager` module with persistent `turn_orders` table
  - Turn timer for async multiplayer
  - `SessionPanel` with separate multiplayer/solo layouts
  - Unified submission strategy pattern: `soloSync`, `syncNetwork`, `asyncNetwork`, `hotSeat`, `solo`
  - Hot-seat: Session Panel hidden, mode toggle unavailable

- **Timescale Conversion Layer** `061` [spec](../specs/hybrid-async-sync-mode/061-timescale-conversion-layer-spec.md) 📋
  - `TICKS_PER_TURN` constant (default 10, range 5–30) bridges tick time ↔ turn time
  - Turn boundary fires at `tickNumber % TICKS_PER_TURN === 0`
  - Zero changes to config files or state manager decrement logic
  - Between boundaries: commands queued only, decrements deferred
  - HUD progress bar showing tick progress toward next turn boundary

- **Unified Time Display System** `062` [spec](../specs/hybrid-async-sync-mode/062-unified-time-display-spec.md) ✅ *Implemented*
  - `src/utils/time-format.js` — 6 format functions, single source of truth for all time strings
  - `GameTimeContext` React context provider for mode/tick/turn state; `useGameTime()` hook
  - 21+ duration-displaying components adapted; `TimeTooltip` for hover-over time context
  - Async mode: `/turn` suffix standardized; sync mode: wall-clock estimates appended (e.g. "3 turns (~30s)")
