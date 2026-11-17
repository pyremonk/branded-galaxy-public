# Information Panels

## Overview

Information Panels are the React UI overlays that provide detailed data for selected game objects — systems, fleets, characters, missions, construction queues, research, and intelligence reports. Panels are layered on top of the Phaser galaxy map and open contextually based on player selection or HUD navigation. Each panel is a distinct React component with read access to game state and action-dispatch capability back to the Phaser engine.

## Requirements

### FR-IP-001: System Detail Panel
- Opens when a system is clicked on the galaxy map
- Displays:
  - System name, sector, and population
  - Controlling faction and current loyalty values for all factions (with trend indicators)
  - Resource output per turn (credits, materials) at current loyalty tier
  - Special location types (research facility, trade hub, etc.)
  - List of all built facilities with HP bars and level badges
  - Ground troop count / max and generation rate
  - Hyperspace connections to adjacent systems
  - Available diplomatic actions tab (spec 025)
  - Construction queue tab (spec 018)
- Panel closes on ESC or clicking elsewhere on the map (outside the panel)
- Currently selected system remains highlighted on map while panel is open

### FR-IP-002: Fleet Status Panel
- Opens when a fleet icon is clicked on the galaxy map or from the Fleet Overview in the HUD
- Displays:
  - Fleet name (editable inline)
  - Current location or transit status with arrival turn
  - List of ships: type, class, combat power, hull HP bar
  - Aggregate fleet stats: total combat power, fleet speed, total maintenance/turn
  - Assigned commander (if any) with Leadership bonus displayed
  - Current command (Patrol/Escort/Raid/Blockade or None)
  - Quick-action buttons: Move, Assign Commander, Assign Command, Merge, Split, Scrap Fleet
- Scrap Fleet requires confirmation modal (irreversible)

### FR-IP-003: Character Roster Panel
- Accessible from the HUD "Characters" button
- Displays all characters for the player's faction grouped by status (Available / On Mission / In Fleet / Stationed / Captured)
- Each character card shows: portrait, name, level badge, status, location, stat summary (5 stat values as mini-bars)
- Clicking a character opens the Character Detail sub-panel (within the same panel):
  - Full stats with numeric values
  - Specialization tag badges
  - Background lore text
  - XP bar showing progress to next level
  - Current assignment description
  - Action buttons: Assign, Unassign (if currently assigned to fleet/facility)
- Captured characters show "CAPTURED" badge with holding system and "Initiate Rescue" button

### FR-IP-004: Mission Planning Panel
- Opens during mission planning flow (initiated from Roster or System panels)
- Multi-step wizard: mission type selection → target selection → character assignment → review
- Live success probability display updates on character swap
- See Mission Execution spec 022 for full planning flow

### FR-IP-005: Construction Queue Panel
- Embedded as a tab within the System Detail panel (spec FR-IP-001)
- Shows the active system's construction queue with progress bars
- Allows adding facility and ship items, reordering, and cancelling at 50% refund
- Also accessible from Command Overview (spec 019)

### FR-IP-006: Research Tree Panel
- Accessible from the HUD "Research" button
- Displays the full faction tech tree (see spec 007 for detail)
- Shows current active research with progress bar
- Shows queued next research
- Allows initiating new research on available techs

### FR-IP-007: Intel Reports Panel
- Accessible from the HUD "Intel" button
- Displays all current intel items for the player's faction:
  - Organized by type (Fleet Position, Facility, Mission Activity, etc.)
  - Each item shows: what was revealed, source (mission type or prisoner), system location, turns until expiry
  - Expired intel shown in grey with "EXPIRED" label
- Clicking an intel item navigates the map camera to the referenced system
- "Source: Prisoner" tag for intel from captured characters (spec 012)

### FR-IP-008: Panel Navigation and Layout
- All panels open in a consistent slide-in area on the right side of the screen
- Maximum one major panel open at a time; opening a new panel closes the current one
- Character Detail and Construction Queue sub-panels may co-exist within their parent panel
- All panels respond to viewport height: minimum 480px display height; scrollable content if needed
- Panels emit `galaxy:panelOpen` / `galaxy:panelClose` events for the Phaser layer to dim background

## Constraints

- Panels must render and become interactive in < 100ms after trigger
- Panels must receive game state via CustomEvents or shared state store, not by direct Phaser scene access
- All panels must be keyboard-navigable (Tab key cycles through interactive elements within panel)
- Panels must not block the Phaser game input processing (CSS pointer-events scoped to panel bounds)

## Acceptance Criteria

- [ ] System Detail Panel shows all data fields correctly for any selected system
- [ ] Fleet Status Panel shows all ship details with correct aggregate stats and active command
- [ ] Character Roster panel groups characters by status with correct card display
- [ ] Character Detail sub-panel shows full stats, XP bar, and action buttons
- [ ] Intel Reports panel shows all current items with correct expiry counts and source tags
- [ ] Clicking intel item navigates camera to referenced system
- [ ] Opening a new panel closes the previously open panel
- [ ] All panels slide in from the right within 100ms
- [ ] `galaxy:panelOpen` and `galaxy:panelClose` events fire on panel lifecycle changes
- [ ] All panels are keyboard-navigable with Tab key
