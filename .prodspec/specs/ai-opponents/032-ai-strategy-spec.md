# AI Strategy

## Overview

AI Strategy defines the decision-making framework for computer-controlled factions. Each AI faction selects strategic priorities, adapts macro-level goals to game state, and employs difficulty-scaled reasoning to create a challenging but fair opponent. The AI operates within the same rules as human players — it has the same action limits, resource constraints, and information visibility (with no fog-of-war cheating).

## Requirements

### FR-AIS-001: Faction-Appropriate Strategic Identity
- Each AI faction has a default strategic personality aligned with its lore and mechanics:
  - **Brand Authority AI**: Economic expansion, defensive military, intelligence suppression
  - **The Union AI**: Covert operations, loyalty disruption, guerrilla survival
  - **The Autoforge AI**: Infrastructure proliferation, Outpost expansion, diplomatic alignment
- Strategic identity is defined in faction config JSON as a map of priority weights
- Priority weights influence the AI's turn-by-turn decision scoring (see FR-AIS-003)

### FR-AIS-002: Difficulty Levels
- Three difficulty settings affect AI behavior:
  - **Easy**: AI uses simplified heuristics; makes an average of 1 strategic mistake per 5 turns; does not exploit optimal windows
  - **Medium**: AI uses the full strategy engine; evaluates all options; occasional sub-optimal choices for variety
  - **Hard**: AI uses full strategy engine; prioritizes high-value targets; proactively counters player strategy (detects player victory progress and applies counter-pressure)
- Difficulty does not grant the AI extra resources, hidden information, or rule exceptions
- Difficulty is set at game setup and does not change mid-game

### FR-AIS-003: Priority-Weighted Decision Scoring
- The AI evaluates each possible action each turn and assigns a score based on:
  - **Strategic Value**: How well the action advances the AI's victory condition
  - **Urgency**: How much the game state pressures this action now vs. deferring
  - **Risk**: Probability of failure or counter-response
  - **Opportunity Cost**: What is lost by taking this action instead of another
- Scores are weighted by the faction's strategic identity priorities
- The AI selects the top-N actions (by score) where N is constrained by action limits (spec 030)
- For Easy difficulty, the scoring noise factor adds ±30% random variance to all scores

### FR-AIS-004: Strategic Macro Goals
- The AI maintains a list of current strategic macro goals (up to 3 simultaneous):
  - **Expand**: Target systems with low loyalty toward AI faction and run diplomatic missions
  - **Fortify**: Build production facilities and defensive structures in high-value systems
  - **Suppress**: Target enemy high-loyalty or strategic systems with sabotage and espionage
  - **Strike**: Assemble and move a fleet toward a high-value target
  - **Research**: Prioritize specific tech trees that support the active macro goals
  - **Survive**: (Union priority) Protect the Secret Base; avoid exposure; rebuild after losses
- Macro goals are re-evaluated every 3 turns based on game state
- Hard AI re-evaluates every turn

### FR-AIS-005: Reactive Strategy Adjustments
- The AI monitors enemy victory progress and adjusts strategy when a threat threshold is reached:
  - If Brand Authority loyalty control > 40% of systems: Union/Autoforge increase Suppress and Strike priorities
  - If Union Secret Base is near discovery (< 2 clues remaining until revealed): Union increases Survive priority to maximum, pauses expansion
  - If Autoforge Outpost count > 12: Brand Authority increases Sabotage missions against Autoforge systems
- Reactive adjustments override standard macro goal weighting for up to 5 turns

### FR-AIS-006: AI Information Constraints
- AI factions follow the same fog-of-war rules as human players
- AI may not access exact resource levels or tech research progress of other factions unless obtained through missions
- AI uses best-estimate models for unknown enemy data (extrapolated from past intel)
- Hard AI runs additional Espionage and Reconnaissance missions to build intel models

### FR-AIS-007: AI Faction Personality Persistence
- AI strategic state (current macro goals, goal weights, intel model) persists in save state
- Restoring from save does not reset the AI's strategy or cause it to "restart" its planning

## Constraints

- AI must operate within all the same action limits as human players (specs 028–030)
- AI turn computation must complete within 500ms (see Turn Order spec 029)
- AI must not make null moves (zero-action turns) unless it genuinely has no valid actions available
- Difficulty settings must not grant information advantages — all difficulty scaling must be behavioral

## Acceptance Criteria

- [x] Brand Authority AI primarily expands territory and builds defensive structures
- [x] Union AI runs more covert missions and prioritizes Secret Base protection
- [x] Autoforge AI builds Outposts aggressively and submits Alliance Proposals in neutral systems
- [x] Easy AI introduces ±30% scoring noise degrading decision quality
- [x] Hard AI counter-pressure activates when enemy victory progress crosses detection thresholds
- [x] AI obeys action limits (spec 030); does not submit more missions than available characters
- [x] AI turn computation completes in under 500ms at all difficulty levels
- [x] AI macro goals are re-evaluated every 3 turns (Medium) or every turn (Hard)
- [x] AI strategy state persists through save-load cycle
- [x] AI does not access fog-of-war-hidden information
