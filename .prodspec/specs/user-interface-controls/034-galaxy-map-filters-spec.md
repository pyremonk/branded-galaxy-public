# Galaxy Map Filters

## Overview

Galaxy Map Filters provide overlay modes on the Phaser galaxy map that change how systems are colored and scaled — switching from the default faction-ownership view to specialist overlays for faction focus, loyalty, resource output, fleet positions, facilities, threats, and missions. Sub-filters allow further refinement within several modes. The minimap reflects the active filter at all times. Filters help players make strategic assessments without drilling into individual system panels.

## Requirements

### FR-GMF-001: Filter Modes
The system shall support the following mutually exclusive overlay filters, toggled from a filter HUD:
- **Default (no filter active)**: Systems displayed in controlling faction color based on last known intel
- **Faction**: Player faction systems shown in faction color; all others greyed out; sub-filter available for other factions and neutral
- **Loyalty**: Player faction systems scaled by loyalty; non-controlled systems show loyalty-to-player-faction in transparent white; sub-filter available for other factions
- **Resources**: All systems shown in faction color, circle scaled by resource production
- **Fleets**: Systems with stationed fleets shown in faction color; en-route fleet destinations highlighted; no scaling
- **Facilities**: Systems with facilities shown in faction color; sub-filter available by facility type
- **Threat**: Systems shown in faction color; red border on enemy systems 1–2 hops from player systems that have fleets stationed; minimap shows threat systems as red dots
- **Missions**: Systems with known missions shown in faction control color; sub-filter available by faction

Only one filter is active at a time; switching is instant.

### FR-GMF-002: Default State and General Filtering Rules
- When no filter is active, every system is rendered in its controlling faction's theme color
- The color used reflects the **player's most recent known information** for systems the player does not currently control (fog-of-war / intel)
- When a filter is active, a **Clear Filter** control is available in the HUD that deactivates the filter and returns the map to the default state
- **Clicking an already-active filter button** in the filter HUD also deactivates the filter and returns the map to the default state (toggle-off behavior)
- The **minimap** reflects the currently active filter at all times using the same color/scaling rules as the main map
- For systems the player does not control, all filter rendering is based on the **player's last known information**; unknown systems render as neutral/unknown

### FR-GMF-003: Faction Filter
- Player's own faction systems are shown in full faction color
- All other systems (enemy factions and neutral) are rendered in a **greyed-out** style (desaturated, reduced opacity) to de-emphasise them
- A **sub-filter** is available that replaces the player faction focus with any other faction or neutral systems:
  - Selecting a specific faction highlights that faction's systems in their faction color and greys out all others
  - Selecting "Neutral" highlights only neutral systems and greys out faction-controlled ones

### FR-GMF-004: Loyalty Filter
- Player faction-**controlled** systems are shown scaled by their loyalty score to the player's faction:
  - Higher loyalty → larger circle; lower loyalty → smaller circle
  - Circle color uses the player's faction theme color
- Systems **not controlled** by the player's faction are shown in **transparent white**, also scaled by their loyalty value toward the player's faction (regardless of which faction controls them)
- A **sub-filter** allows the player to view loyalty for other factions or neutral:
  - Selecting a different faction shows that faction's controlled systems in that faction's theme color scaled by their loyalty, and shows non-controlled systems in transparent white scaled by loyalty to the selected faction
- Hovering a system shows its exact loyalty value as a tooltip

### FR-GMF-005: Resource Filter
- All systems are shown in their **controlling faction's theme color** (using last known intel for uncontrolled systems)
- Each system's circle is **scaled by its total resource production** relative to the galaxy average:
  - Below average: Smaller circle
  - Average: Standard size
  - Above average: Larger circle (up to 1.5× normal)
- No additional labels required beyond standard system name

### FR-GMF-006: Fleet Positions Filter
- Systems that have **fleets currently stationed** at them are shown in their controlling faction's theme color
- Systems with **no fleets stationed** are not highlighted; they render in a neutral/greyed style to focus attention on fleet locations
- If a fleet is **en-route** (in transit), the **destination system** is highlighted (distinct color or border treatment to indicate incoming fleet)
- Enemy fleet positions are only shown if the player's intel includes that fleet and it has not expired
- **No circle scaling** is applied in this filter mode

### FR-GMF-007: Facilities Filter
- Systems that have **at least one constructed facility** are shown in their controlling faction's theme color
- Systems without facilities are greyed out / not highlighted
- Only facilities known to the player are shown (own systems: always visible; enemy systems: only if intel reveals them)
- A **sub-filter** is available to narrow to a specific facility type (e.g. Shipyard, Defense/Shield, Research); selecting a type shows only systems with that facility type

### FR-GMF-008: Threat Filter
- All systems are shown in their **controlling faction's theme color**
- A **red border** is applied to enemy systems that meet both conditions:
  - Within **1–2 hyperspace routes** of any player-controlled system
  - Have **fleets currently stationed** at them
- The **minimap** displays these threat systems as **red dots** instead of their normal faction color dot
- Systems that do not meet the threat criteria render in faction color with no border

### FR-GMF-009: Missions Filter *(new)*
- All systems that have **known missions** associated with them (for any faction, visible to the player) are shown in their **controlling faction's theme color**
- Systems with no known missions are greyed out / not highlighted
- A **sub-filter** is available to narrow by faction: selecting a faction shows only systems with missions belonging to that faction
- Mission visibility follows the same intel/fog-of-war rules as other overlays; only missions the player has discovered are shown

### FR-GMF-010: Sub-filter UX
- Sub-filters appear as a **secondary row of buttons** directly below the active filter button in the filter HUD
- Sub-filter options are populated dynamically based on the active filter mode (e.g. faction list for Faction/Loyalty/Missions; facility type list for Facilities)
- Selecting a sub-filter option replaces the previous sub-filter selection; it does not stack
- Deactivating the parent filter also clears the active sub-filter
- "All" / no sub-filter is the default state when a filter is first activated

### FR-GMF-011: Filter Toolbar UI
- A compact horizontal filter toolbar is rendered on the Phaser HUD layer above the map
- Each filter mode has an icon button; the active mode button is visually highlighted
- Clicking an active filter button deactivates it (see FR-GMF-002 toggle-off behavior)
- A **Clear Filter** button is visible whenever a filter is active; it returns the map to the default state
- Keyboard shortcuts: F1–F7 correspond to the 7 filter modes (configurable in settings)

## Deprecated Behaviour

The following behaviour from the previous version of this spec is superseded by the requirements above. Implementing agents must **remove or replace** this logic when executing this spec.

| # | Deprecated Behaviour | Replaced By |
|---|---|---|
| D-01 | Loyalty-scaled opacity formula on the default/faction view (`opacity = 0.4 + (loyalty / 100) × 0.6`) | Default view uses flat faction color; no opacity scaling on the default state |
| D-02 | Loyalty Overlay color tiers (0–29 dark grey, 30–49 amber, 50–74 light green, 75–100 faction color) | Loyalty filter uses **circle size scaling**, not color tiers; faction-controlled systems use faction color, non-controlled use transparent white |
| D-03 | Loyalty Overlay legend panel at bottom-left | Removed; tooltip on hover covers the detail need |
| D-04 | Fleet Positions: opacity reduction (≈50% or 25%) for systems without fleets, with hover restore | Systems without fleets are greyed out in style consistent with other filters; no hover-restore opacity logic |
| D-05 | Fleet Positions: directional arrow from origin toward destination for in-transit fleets | En-route fleets highlight the **destination system** instead; no in-transit arrow rendered |
| D-06 | Fleet Positions: ship count number badge on fleet icons | Removed; not specified in revised filter rules |
| D-07 | Threat Overlay: yellow border for contested systems (loyalty < 50 for controlling faction) | Removed; threat border is red only, conditioned on enemy fleets within 1–2 hops |
| D-08 | Threat Overlay: green border for well-defended player systems (≥ 80 loyalty + defense facility) | Removed; well-defended systems have no special border in the revised threat filter |
| D-09 | Threat Overlay: 1-hop-only adjacency for enemy systems | Extended to **1–2 hyperspace routes** from any player-controlled system |
| D-10 | Facility Overlay: hover tooltip listing facility HP status | Removed; HP status not part of the revised facility filter |
| D-11 | Faction Control Overlay as a distinct named overlay mode | "Faction" is now a **filter mode** that greys out non-player systems; the unfiltered default is a separate baseline state, not a named filter |
| D-12 | Filter selection persisting within a session | Filters have no persistence requirement; session/new-game reset behavior is unspecified and should not be assumed |
| D-13 | F1–F6 keyboard shortcuts for 6 filter modes | Updated to F1–F7 for 7 filter modes |

## Constraints

- Filter switches must complete within one frame (no async operations)
- Filters must be composable with other HUD elements (system selection, tooltips still work in all filter modes)
- Enemy fleet and facility data in Fleet Positions and Facility filters must strictly respect fog-of-war / intel rules
- Sub-filter population must be derived from live game state (faction list, facility types present in the current game)

## Acceptance Criteria

- [ ] Default (no filter) renders all systems in their controlling faction color using last-known intel
- [ ] Clicking an active filter button deactivates it and returns the map to the default state
- [ ] A Clear Filter control is visible whenever a filter is active and functions correctly
- [ ] The minimap reflects the active filter's color/highlight rules at all times
- [ ] Faction filter greys out non-player systems; sub-filter correctly highlights a selected faction or neutral
- [ ] Loyalty filter scales circle size by loyalty score; non-controlled systems show in transparent white; sub-filter switches loyalty focus to another faction
- [ ] Resource filter renders all systems in faction color with circles scaled by production output
- [ ] Fleet filter shows only systems with stationed fleets in faction color; en-route fleets highlight their destination
- [ ] Fleet filter: enemy fleet positions are only shown when valid intel exists
- [ ] Facilities filter shows only systems with facilities; sub-filter correctly limits to a selected facility type
- [ ] Threat filter applies red border to enemy systems 1–2 hops from player systems with stationed fleets; minimap shows those as red dots
- [ ] Missions filter shows systems with known missions in faction color; sub-filter limits by faction
- [ ] All deprecated opacity formulas, color tiers, directional arrows, ship-count badges, yellow/green borders, and legend panels are absent from the implementation
- [ ] Only one filter active at a time; switching and clearing are instant with no frame drops
- [ ] Filter toolbar renders on the Phaser HUD layer above the map with icon buttons, active state highlight, and keyboard shortcuts F1–F7
