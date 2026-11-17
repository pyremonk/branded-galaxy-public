# Tutorial Campaign

## Overview

The Tutorial Campaign is a structured, guided introduction to Branded Galaxy. It walks a new player through all core systems step-by-step using a pre-built galaxy scenario. The tutorial is linear, non-replayable (per profile), and uses an overlay prompt system to direct player attention and gate progression.

## Requirements

### FR-TC-001: Tutorial Entry Point
- On first launch (no saved games present), the main menu prominently offers "Start Tutorial" as the primary CTA
- Tutorial may also be started manually from the main menu "Tutorial" option at any time
- Replaying the tutorial starts from the beginning (not resumable); player is warned that progress will reset

### FR-TC-002: Tutorial Scenario
- The tutorial uses a fixed pre-built galaxy (not procedurally generated):
  - 6 systems configured for progressive complexity
  - The player controls The Brand Authority (blue faction)
  - One AI opponent (The Union) at Easy difficulty
  - Starting resources: 500 Credits, 300 Materials, 100 Influence
- The scenario is defined in a static JSON file (`core/tutorial-scenario.json`, to be created)
- Seeded random is seeded with `"tutorial"` to ensure consistent outcomes

### FR-TC-003: Tutorial Step System
- The tutorial is divided into named steps, each defining:
  - A prompt overlay (title + instruction text)
  - A highlight target (system ID, panel ID, or HUD element ID)
  - A completion condition (what action the player must take to advance)
  - Optional: a "Skip Step" button (for players who already know the action)
- Step data is defined in `core/tutorial-steps.json` (to be created)
- Progress is tracked in `gameState.tutorialStep` (the index of the current step)

### FR-TC-004: Prompt Overlay UI
- When a step is active, a styled overlay box appears:
  - Anchored near the highlighted element (auto-positioned to avoid off-screen overflow)
  - Content: step title (H3) + instruction paragraph + optional secondary hint
  - Action button: "Got it" (advances when completion condition already met) or action-gated (grayed until condition triggers)
  - Optional: "Skip" link for experienced players
- All other UI is interactive (not blocked) unless the step explicitly requires a specific action first

### FR-TC-005: Tutorial Steps Content
Tutorial steps in order (approximate):
1. **Welcome** — Introduce the game concept; no action required; auto-advance after 3s
2. **The Galaxy Map** — Pan and zoom the map; complete when player has panned and zoomed once each
3. **Your Systems** — Click on your starting system to open System Detail; complete on panel open
4. **Resources** — Introduce the resource HUD; highlight Credits, Materials, Influence; no action required
5. **Building a Facility** — Open the Construction Queue for starting system; queue a Shipyard; complete on queue item added
6. **End Your Turn** — Click End Turn; complete on turn submission
7. **See the Results** — Resolution Phase runs; system shows turn summary; no action required
8. **Fleet Composition** — Open Fleet panel; introduce ship types; no action required
9. **Issue a Fleet Order** — Issue a Patrol order to a nearby system; complete on order submitted
10. **Characters** — Open Character Roster; introduce a character card; no action required
11. **Send a Mission** — Plan and submit a Reconnaissance mission; complete on mission submitted
12. **Research** — Open the Tech Tree; queue a technology; complete on research started
13. **Victory Conditions** — Open Victory HUD; introduce the win conditions; no action required
14. **Tutorial Complete** — Congratulations screen; offer to start a real game

### FR-TC-006: Tutorial Completion
- On completing the last step, a "Tutorial Complete!" modal is shown
- Options: "Start a New Game" (goes to Game Mode Selection), "Return to Menu", "Replay Tutorial"
- Tutorial completion state is stored in `localStorage` under `brandedGalaxy_tutorialComplete: true`
- The main menu no longer prominently features "Start Tutorial" after completion (moves to secondary menu position)

### FR-TC-007: Tutorial Pause and Resume
- The tutorial game session can be saved (manual save) and resumed from the Load screen normally
- Resuming a saved tutorial session restores `gameState.tutorialStep` and shows the correct step prompt

## Constraints

- Tutorial scenario must be a spec-compliant fixed game (not special-cased; use regular game engine)
- Prompt overlays must not interfere with screen readers (use `aria-live="polite"`)
- Tutorial must be completable without network access (offline mode only)

## Acceptance Criteria

- [ ] Tutorial entry point appears prominently on first launch
- [ ] Tutorial uses fixed scenario with correct starting state
- [ ] Step system displays correct prompt overlay for each step
- [ ] Completion condition for each step is correctly detected and auto-advances the prompt
- [ ] Highlight target is visually indicated (ring/glow around system or panel)
- [ ] Skip option is available on applicable steps
- [ ] Tutorial Complete modal appears after step 14 with correct navigation options
- [ ] Tutorial complete state persists in localStorage
- [ ] Tutorial can be saved and resumed with correct step restored
