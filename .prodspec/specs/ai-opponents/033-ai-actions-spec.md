# AI Actions

## Overview

AI Actions covers the concrete operations that AI-controlled factions execute each turn — how the AI translates its strategic priorities into specific mission assignments, fleet orders, construction decisions, and diplomatic actions. This spec focuses on the operational layer: which targets the AI selects, how it allocates its characters and fleets, and how it manages resources across competing needs.

## Requirements

### FR-AIA-001: Character and Mission Assignment
- The AI assigns Available characters to missions each turn based on priority-weighted scoring:
  - Espionage/Sabotage missions score highest when the AI has a Suppress macro goal active
  - Diplomatic missions score highest when the AI has an Expand macro goal active
  - Recruitment missions are triggered when the AI roster drops below 5 characters
  - Research Assist is submitted when active research is a current macro priority
- Character selection prioritizes the character with the best primary stat for the selected mission type
- The AI never leaves more than 50% of its characters unassigned unless all viable mission targets have been exhausted

### FR-AIA-002: Fleet Movement and Combat Decisions
- The AI evaluates fleet movement options each turn:
  - Fleets assigned to Strike macro goal move toward the highest-value reachable enemy system
  - Fleets assigned to Survive macro goal patrol near owned systems (Patrol command)
  - A fleet is considered eligible for combat if `fleet_power > 0.7 × estimated_enemy_power_at_target`
  - The AI does not send a fleet into combat if it estimates the fleet will be destroyed (enemy power ≥ 1.5× own fleet power)
- The AI merges nearby fleets if combined power would reach the combat eligibility threshold
- Fleets without a current order are assigned a Patrol route through nearby friendly systems

### FR-AIA-003: Construction Priorities
- The AI construction priority order (adjustable by macro goal):
  1. Shipyard (if the AI has ≥ 3 controlled systems but no Shipyard) — prerequisite for ship production
  2. Training Facility (if recruit income < 5/turn)
  3. Defense Platform (for high-value systems under threat — systems with loyalty drift toward enemy)
  4. Research Facility (if research macro goal is active)
  5. Resource Extractor (if AI credits income < 200/turn)
  6. Shipyard Level upgrade (if existing Shipyard at Level 1 and AI has > 8 ships total)
- The AI always leaves a minimum credit buffer of 200cr before committing to construction
- Construction is queued during the Action Phase for up to 3 systems per turn

### FR-AIA-004: Ship Production Decisions
- When a Shipyard is idle (no active build), the AI queues the next ship type based on:
  - If total fleet power < 150: queue a Cruiser
  - If total fleet power >= 150 and a fleet has > 8 ships: queue a Capital Ship
  - If total fleets < 2: queue a Corvette (to form a second fleet)
  - Otherwise: queue a Fighter Squadron (cheap, maintains fleet numbers)
- Faction-exclusive ships are queued when the required tech is researched and the faction is in a Strike phase

### FR-AIA-005: Diplomatic Action Decisions
- The AI uses diplomatic actions when:
  - A system has loyalty toward the AI faction in the 30–60 range (worth investing to push past 60)
  - Propaganda Campaigns are submitted first (cheapest, most flexible)
  - Trade Agreements are reserved for high-value systems (population ≥ 4)
  - Resource Investments are used when the AI has surplus materials (> 300 mat buffer)
- The AI never spends diplomatic actions on systems it does not intend to hold (at least 1 fleet nearby)
- Autoforge AI submits Alliance Proposals to any eligible neutral system with population ≥ 2

### FR-AIA-006: Resource Management
- The AI maintains soft spending thresholds to avoid bankruptcy:
  - Minimum credits reserve: 200cr
  - Minimum materials reserve: 100mat
  - Minimum influence reserve: 50inf
- If below any reserve threshold, the AI pauses all construction and diplomatic spending until the reserve is restored
- The AI prioritizes fleet maintenance over all other expenses (maintenance never voluntarily skipped)

### FR-AIA-007: Tech Research Decisions
- The AI evaluates tech priorities at the start of each turn if no research is active:
  - If research queue is empty, select the highest-priority unresearched tech in Tier 1, then Tier 2, etc.
  - Tech priority is determined by alignment with current macro goals:
    - Strike goal → military and fleet tech
    - Expand/Survive goal → diplomatic and mission tech
    - Fortify goal → production and defense tech
  - Hard AI cross-references tech tree paths (spec 007) to unlock faction-unique ships earlier

## Constraints

- AI may not queue actions it cannot afford at the time of staging (same resource validation as human players)
- All AI action selection must complete within the 500ms budget (spec 032)
- AI ship production decisions must not queue ships that require unresearched tech
- AI must not repeatedly assign the same mission to the same unavailable character (stale state bug prevention)

## Acceptance Criteria

- [x] AI assigns characters to mission types aligned with its active macro goal
- [x] AI leaves no more than 50% of characters unassigned if valid targets exist
- [x] AI fleet moves toward highest-value enemy system when Strike goal is active
- [x] AI does not initiate combat when estimated enemy power ≥ 1.5× own fleet power
- [x] AI queues Shipyard construction first when it lacks one
- [x] AI maintains minimum resource reserves before committing to construction
- [x] AI submits Propaganda Campaigns for systems in the 30–60 loyalty range
- [x] Autoforge AI submits Alliance Proposals to eligible neutral systems with population ≥ 2
- [x] AI pauses spending when below reserve thresholds and resumes on recovery
- [x] AI research selection aligns with active macro goals

## Implementation Notes (FR-AIA-003)

Construction candidates are executed via **direct `ConstructionEngine.queueFacilityBuild()` / `queueFacilityUpgrade()` calls** in `_executeCandidate()` — not through `turnStateManager.stageAction()`. The staged-action path is intentionally only for human actions subject to pre-resolution review; AI construction is immediate and must enter the engine queue during the Action Phase so `TurnResolutionEngine._resolveConstruction()` can tick it on the same turn. The `_runAITurns()` context in `main-stage.js` includes `constructionEngine`, `constructionStateManager`, and `resourceEngine` for this purpose.
