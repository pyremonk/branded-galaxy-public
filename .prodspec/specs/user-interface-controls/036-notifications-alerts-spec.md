# Notifications & Alerts

## Overview

Notifications and Alerts are the messaging system that surfaces game events to the player in a timely and visually appropriate way. Events range from notable informational updates (construction complete, mission outcome, loyalty shift) to high-priority critical alerts (character captured, system lost, combat result). All player-facing messaging is delivered through a calm, sequential presentation flow — no simultaneous toasts or overlapping modals. The system ensures players are never surprised by game-changing events and can navigate directly to affected locations from any notification entry.

## Requirements

### FR-NA-001: Notification Priority Tiers
- All notifications are classified into one of two priority tiers:
  - **Warning**: Notable events that the player should be aware of, aggregated into the Turn Summary at the start of each Action Phase
  - **Critical**: High-urgency events that interrupt with a modal dialog requiring player acknowledgement, presented before the Turn Summary

### FR-NA-002: Sequential Presentation Flow
- At the start of each Action Phase, all pending player messages are delivered in a strict sequential order. The player must dismiss each item before the next one appears. No two items are shown simultaneously.
- The sequence order is:
  1. **Critical alerts** — presented one at a time, each requiring explicit dismissal
  2. **Combat result notices** — presented one at a time after all critical alerts are cleared
  3. **Turn Summary** — presented last, after all criticals and combat notices are dismissed
- During the sequential flow, the HUD is paused (no game actions can be taken)
- If there are no critical alerts and no combat results, the Turn Summary appears directly

### FR-NA-003: Critical Alerts
- Displayed as a modal dialog that pauses the HUD and requires player acknowledgement
- Critical alerts are queued during the Resolution and Maintenance Phases and presented at the start of the next Action Phase as part of the sequential flow (FR-NA-002)
- Critical examples:
  - System captured: "[System] has been captured by [Faction]!"
  - Character captured: "[Character Name] has been captured and is being held at [System]"
  - Character executed: "[Character Name] has been executed by [Faction]"
  - Secret Base discovered (Union): "Your Secret Base at [System] has been discovered by the Brand Authority!"
  - Victory achieved: "[Faction] has fulfilled their victory conditions!"
  - Defeat: "Your faction has been eliminated"
- Each critical alert includes a brief summary of the event and optionally a "View Details" button
- A progress indicator (e.g. "Alert 2 of 3") is shown when multiple critical alerts are queued

### FR-NA-004: Combat Result Notices
- Space combat outcomes are presented as individual notices in the sequential flow, after critical alerts
- Each notice displays the combatants, outcome (victory/defeat/draw), and key losses
- A "View Details" button opens the full CombatResultModal for that engagement
- Multiple combat results from the same turn are presented one at a time; the player dismisses each to advance

### FR-NA-005: Turn Summary
- After all critical alerts and combat result notices are dismissed, a Turn Summary panel is presented
- The Turn Summary lists all Warning-tier events from the previous turn in a single scrollable panel
- Warning examples:
  - Construction complete at [System]
  - Research tech unlocked: [Tech Name]
  - Mission report: [Mission Type] at [System] — [Outcome]
  - Loyalty shift: [System] loyalty changed to [Value]
  - Character mission failed: [Character Name] at [System]
  - Low loyalty warning: [System] loyalty dropping below 40
  - System at risk of defection: loyalty < 30 at [System]
  - Intel item added: [Type] at [System]
  - Troop generation milestone at [System]
- Each entry shows an icon, summary text, and a "Goto" button where a location is relevant
- "Goto" centers the galaxy map on the referenced system/fleet and opens the appropriate panel
- The player dismisses the Turn Summary with a single "Continue" button to begin their Action Phase
- If there are no Warning events to report, the Turn Summary is skipped and the Action Phase begins immediately

### FR-NA-006: Turn History Log
- The turn number indicator in TopBarHUD is a clickable button
- Clicking it opens the Turn History Log panel, which displays a running record of all past Turn Summaries
- Summaries are listed newest-to-oldest; each entry is collapsible and shows the turn number as its header
- The log is available at any time during the Action Phase (not just at turn start)
- The Turn History Log does not include critical alerts or combat result notices — only Warning-tier Turn Summary content

### FR-NA-007: Navigation Integration
- Every notification entry that references a system, fleet, or character includes a "Goto" navigation trigger
- Activating "Goto" centers the galaxy map camera on the relevant location and opens the appropriate information panel
- Navigation works from Turn Summary entries and Turn History Log entries
- Navigation must work even if the referenced system is currently off-screen

### FR-NA-008: Custom Events Integration
- Notification content is driven by `window` CustomEvents fired by all game systems:
  - `galaxy:notify` — `{ tier: 'warning'|'critical', message, locationId, locationCategory }`
  - All game system events (construction, loyalty, mission outcomes, etc.) fire `galaxy:notify` in addition to their own domain events
  - The notification manager subscribes to `galaxy:notify` and routes to the appropriate tier queue
  - Critical alerts and combat results are held in a pending queue and released at Action Phase start
  - Warning events are accumulated into the current turn's summary entry

## Constraints

- Critical alerts and combat result notices must not appear mid-turn — always deferred to the start of the next Action Phase
- The sequential presentation flow (criticals → combat → summary) cannot be skipped or reordered
- The Turn Summary is skipped entirely if there are no Warning events for that turn
- Navigation from any notification entry must work even if the referenced location is off-screen
- The Turn History Log stores summaries for the full game session; no purge limit

## Acceptance Criteria

- [ ] Critical alerts appear sequentially at Action Phase start, one at a time, with a progress indicator when multiple are queued
- [ ] Combat result notices appear after all critical alerts are dismissed, one at a time
- [ ] Turn Summary appears after all critical alerts and combat notices are dismissed
- [ ] Turn Summary lists all Warning-tier events with icon, text, and "Goto" where applicable
- [ ] Turn Summary is skipped if no Warning events occurred that turn
- [ ] System capture and character capture both produce Critical alerts
- [ ] The turn number in TopBarHUD is a clickable button
- [ ] Clicking the turn number button opens the Turn History Log panel
- [ ] Turn History Log displays past Turn Summaries newest-to-oldest, each collapsible by turn number
- [ ] Navigation "Goto" correctly centers the map and opens the relevant panel for all entry types
- [ ] `galaxy:notify` correctly routes warning events to the Turn Summary queue and critical events to the critical alert queue
- [ ] No toast notifications, no persistent notification bell, and no notification badge exist in the UI
