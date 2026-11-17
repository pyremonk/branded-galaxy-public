# Intelligence Reports

## Overview

The Intelligence Reports panel is the player-facing UI surface for reviewing gathered intel. It aggregates active intel items, organizes them by system and type, and provides contextual warnings about threats. This spec covers the panel layout, filtering, threat assessment display, and alerts generated from intel.

## Requirements

### FR-IR-001: Reports Panel Access
- The Intelligence Reports panel opens via:
  - Clicking a system's intel indicator icon on the galaxy map
  - Pressing the dedicated Intel shortcut key (default: `I`)
  - Opening via the Information Panels menu (spec 035)
- Opening the panel follows the standard panel open/close pattern (`galaxy:panelOpen` event)

### FR-IR-002: Panel Layout
- The panel has two sections:
  - **Threat Summary** (top): a compact list of systems with enemy fleets or high threat levels
  - **Intel Browser** (bottom): the full sortable/filterable list of all active intel items
- Each intel item row displays:
  - System name
  - Intel type (human-readable label, e.g. "Fleet Composition", "System Loyalty")
  - Summary of data (e.g. "3 ships", "Loyalty: 72", "Shield Generator Lvl 2")
  - Turns until expiry (e.g. "Expires in 2 turns")
  - Source indicator (Patrol, Spy Mission, Outpost, Event)

### FR-IR-003: Filtering and Sorting
- Filters:
  - By intel type (checkbox group: Fleet / Loyalty / Facility / Character / Resource / Event)
  - By system (dropdown of systems with at least one intel item)
  - Show only "Expiring Soon" (expires next turn)
- Sort options:
  - Expiry (ascending default)
  - System name (alphabetical)
  - Intel type

### FR-IR-004: Threat Summary
- The Threat Summary auto-generates from active intel items as follows:
  - Any system with a `fleet_composition` item where enemy fleet power > own fleet power in that system → high threat
  - Any system with loyalty < 40 for own faction → loyalty warning
  - Any `event_warning` item → flagged in threat summary
- Threat level icons: Red (imminent/high), Yellow (moderate), Blue (event warning)
- Clicking a system in the Threat Summary focuses the galaxy map on that system and opens System Detail

### FR-IR-005: Expiry Alerts
- When an intel item has 1 turn remaining before expiry, the Intel indicator icon on the map node pulses
- The Threat Summary row also shows a "(Expiring)" tag in this case
- Expired items are never shown in the panel; they are silently removed at the start of Maintenance Phase

### FR-IR-006: Intel Age Indicator
- Each intel item row displays how many turns ago the intel was gathered (e.g. "Gathered 2 turns ago")
- Calculated as `currentTurn - revealedOnTurn`
- Color coding: 0–1 turns ago → green (fresh), 2 turns ago → yellow (aging), 3+ turns ago → orange (stale)

### FR-IR-007: Empty State
- When no intel items exist, the panel shows a centered message: "No intelligence gathered yet. Use fleet patrols or spy missions to collect intel."

## Constraints

- The panel must render in under 100ms for up to 50 intel items
- Intel items must never display data from expired intel (always filter by `expiresOnTurn > currentTurn`)
- The panel is read-only; no actions can be initiated directly from this panel (actions are in mission planning and fleet order panels)

## Acceptance Criteria

- [x] Panel opens from map icon, keyboard shortcut, and Information Panels menu
- [x] All active (non-expired) intel items appear with correct type, summary, and expiry countdown
- [x] Threat Summary correctly identifies high-threat systems from fleet and loyalty intel
- [x] Expiry alerts (icon pulse and "(Expiring)" tag) appear for items with 1 turn remaining
- [x] Filtering by type, system, and "expiring soon" correctly narrows the displayed items
- [x] Sort by expiry, system name, and type all function correctly
- [x] Age indicator colors match the defined thresholds
- [x] Empty state message shows when no intel items exist
- [x] Panel renders in under 100ms with the full 50-item cap
