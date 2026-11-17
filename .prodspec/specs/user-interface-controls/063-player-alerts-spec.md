# Player Alerts

## Overview

Player Alerts is a unified messaging system that informs players of game-state changes through a persistent alert bar embedded in the TopBarHUD and a two-column Alert History panel. Each alert has two parts: a **message** (a single-line summary displayed in the alert bar) and an **outcome** (expanded detail shown in the history panel). This spec supplements spec 036 (Notifications & Alerts): in async mode, alerts are queued and delivered at the start of the Action Phase; in sync mode, alerts appear in real time as events occur. Choice events (spec 045, EventChoiceModal) remain separate — they are not routed through the alert bar.

### Alert Categories

| Category | Source |
|---|---|
| Mission Report | Mission resolution (spec 023) |
| Fleet Report | Fleet arrival at destination (spec 014) |
| Combat Alert | Space or ground combat resolution (specs 015, 048) |
| Event Notification | Random or scripted game events (spec 045) |
| System Capture | System control changes (spec 027) |
| Intel Report | Intel revealed or counter-intelligence success (spec 042) |

---

## Requirements

### FR-PA-001: Alert Data Model
- Each alert is a structured object:
  ```json
  {
    "id": "string (unique, e.g. deterministic-id)",
    "category": "mission | fleet | combat | event | capture | intel",
    "factionId": "string (owning faction)",
    "message": "string (single-line summary for the alert bar)",
    "outcome": {
      "summary": "string (restatement of message for header)",
      "details": [],
      "systemId": "string | null",
      "systemName": "string | null"
    },
    "turn": "number",
    "timestamp": "number (Date.now() at creation)"
  }
  ```
- `outcome.details` is an array of key-value objects describing the concrete effects (loyalty shifted, XP awarded, ships lost, etc.)
- Alerts are created by the subsystem that produces the event (mission engine, fleet state manager, combat engine, event engine, loyalty state manager, intel engine) and dispatched via `galaxy:playerAlert` CustomEvent
- Alerts must never contain data the faction has not earned — all values are filtered through the fog-of-war check before being included

### FR-PA-002: Alert Message Templates
- Each category has a human-readable message template. Template tokens are resolved to display names (never raw IDs):

**Mission Report**
- Success / Failure: `"{characterName} has {successfully completed / continued / failed} {missionType} at {systemName}"`
- Foiled enemy mission: `"{enemyFactionName}'s {missionType} at {systemName} has been foiled by {factionName} forces"`

**Fleet Report**
- Arrival: `"{fleetName} has arrived at {systemName}"`

**Combat Alert**
- Result: `"{fleetName} {attacked / defended against} {enemyFleetName} at {systemName} and was {victorious / defeated}"`

**Event Notification**
- Uses the event's `title` and first-sentence `description` from the event definition (spec 045, FR-ES-001)

**System Capture**
- `"{systemName} is now under {factionName} control"`

**Intel Report**
- Generic: `"Intel has been collected about {systemName}"`
- Specific: `"Intel has been collected about {enemyFactionName}'s {targetType} at {systemName}"`
  - `{targetType}` is one of: fleet, facility, operative
- Counter-intel: `"Counter-intelligence has thwarted {enemyFactionName}'s intelligence operations at {systemName}"`

### FR-PA-003: Alert Outcome Content
- Each category produces structured outcome data for the history panel's detail column:

**Mission Report outcome**
- Restates the alert message as a header
- Lists all effects applied from the mission resolution (spec 023, FR-MO-007): loyalty shifted, resources gained, facility damaged, characters' XP awarded, etc.
- Shows outcome tier badge: Critical Success / Success / Failure / Critical Failure

**Fleet Report outcome**
- Restates the alert message as a header
- Shows travel duration: `"Travel time: {turns} turns"`
- Shows travel mode: Lane / Direct

**Combat Alert outcome**
- Restates combatants and outcome
- Shows ships lost per side, fleet status after combat, and any commander casualties
- Links to the full CombatResultModal for detailed round-by-round replay

**Event Notification outcome**
- Restates the event description
- If the event was a choice event, displays all choices with the player's selection highlighted
- Lists all effects applied

**System Capture outcome**
- States which faction gained control and which lost it
- Shows the loyalty values that triggered the capture

**Intel Report outcome**
- Lists the intel items revealed (type, system, expiry)
- For counter-intel, names the operation that was thwarted

**"Go to" button**
- If the alert's `outcome.systemId` is non-null, the outcome panel displays a "Go to {systemName}" button that centers the galaxy map camera on that system and opens the System Detail panel

### FR-PA-004: Alert Bar
- The alert bar is a fixed-width region in the TopBarHUD, positioned between the resource strip and the right-side control buttons (audio, session, menu)
- It displays the **message** text of the most recent alert as a single line, truncated with ellipsis if it overflows
- **Scroll animation**: When a new alert arrives, the current message scrolls upward and out of the bar while the new message scrolls upward into view from below
- **Queue pacing**: A newly queued alert waits 3 seconds after the previous alert was displayed before taking its place. If multiple alerts queue up, they cycle through in FIFO order with 3-second spacing
- When the bar is empty (no alerts yet this session), it displays placeholder text: `"No alerts"` in muted color
- Clicking the alert bar opens the Alert History panel (FR-PA-005)
- The alert bar has `cursor: pointer` and a subtle hover highlight to indicate interactivity

### FR-PA-005: Alert History Panel
- The Alert History panel is a modal overlay using the same sizing as the Help panel: `width: 90vw; max-width: 1000px; height: 80vh; max-height: 700px`
- **Header**: Panel title ("Alert History") with a dismiss/close button (× icon)
- **Two-column layout** below the header:
  - **Left column** (≈40% width): Scrollable list of all alerts in descending chronological order (newest first). Each entry shows category icon, message text, and turn number
  - **Right column** (≈60% width): Displays the full outcome of the currently selected alert from the left column
- **Default selection**: When the panel opens, the most recent alert is pre-selected and its outcome is displayed in the right column
- Selecting a different alert in the left column updates the right column immediately
- The left column uses category-specific icons (see FR-PA-006)
- The panel is dismissed by clicking the close button, pressing Escape, or clicking the backdrop scrim
- The panel backdrop uses the same scrim style as the Help panel: `rgba(13, 17, 23, 0.88)`

### FR-PA-006: Alert Category Icons
- Each alert category is represented by a Unicode text glyph icon defined in `src/icons.js` under a new `ALERT_ICONS` export:
  - Mission Report: `◎` (`\u25CE`) — reuse of `UI_ICONS.missions`
  - Fleet Report: `▶` (`\u25B6`) — reuse of `UI_ICONS.inTransit`
  - Combat Alert: `⚔` (`\u2694`) — reuse of `FACILITY_ICONS.training`
  - Event Notification: `⚠` (`\u26A0`) — reuse of `UI_ICONS.warning`
  - System Capture: `⬡` (`\u{2B21}`) — reuse of `UI_ICONS.hyperspaceLane`
  - Intel Report: `◈` (`\u25C8`) — reuse of `SPECIAL_TYPE_ICONS.secretBase`

### FR-PA-007: Alert Delivery Timing
- **Async mode**: Alerts generated during the Resolution and Maintenance Phases are queued and delivered at the start of the next Action Phase. The alert bar scrolls through the queued alerts with 3-second pacing (FR-PA-004). The existing spec 036 sequential flow (critical modals → combat notices → turn summary) still applies; queued alerts are released into the alert bar after the sequential flow completes.
- **Sync mode**: Alerts are delivered to the alert bar immediately when the underlying event fires. No deferral. The alert bar scrolls through incoming alerts in real time.
- In both modes, alert data is appended to the history immediately (available in the history panel even if the bar hasn't cycled to it yet)

### FR-PA-008: Alert Persistence and Limits
- Alerts are stored in React state and persist for the duration of the game session
- A maximum of **100** alerts are retained in the history. When the limit is reached, the oldest alert is purged as each new alert arrives
- Alerts are included in save data so the history survives save/load cycles
- On load, the alert bar displays the most recent alert from the loaded save

### FR-PA-009: CustomEvent Interface
- Alert producers dispatch:
  ```js
  window.dispatchEvent(new CustomEvent('galaxy:playerAlert', {
    detail: {
      category: 'mission',
      factionId: 'brand_authority',
      message: 'Operative Kova has successfully completed Sabotage at Pinnacle Station',
      outcome: {
        summary: 'Sabotage Mission — Success',
        details: [
          { label: 'Facility damaged', value: 'Shipyard — 15 HP' },
          { label: 'XP awarded', value: '+15 to Operative Kova' }
        ],
        systemId: 'sys_pinnacle_station',
        systemName: 'Pinnacle Station'
      },
      turn: 5
    }
  }));
  ```
- The alert manager component subscribes to `galaxy:playerAlert`, assigns a unique `id` and `timestamp`, filters by the active player's `factionId`, and appends to the alert store
- Alerts for other factions are silently discarded (no fog-of-war leak)

### FR-PA-010: Integration with Existing Systems
- **Spec 036 (Notifications & Alerts)**: The spec 036 sequential presentation flow (FR-NA-002) remains the authoritative flow for async mode turn transitions. Player Alerts supplements this by providing a persistent alert bar and history that survive beyond the turn summary dismissal. In sync mode, the alert bar replaces the need for a turn summary modal — all events flow through the alert bar in real time.
- **Spec 045 (Event System)**: Non-choice events produce an alert via `galaxy:playerAlert`. Choice events continue to use EventChoiceModal and are **not** routed through the alert bar. After a choice event is resolved, a summary alert is emitted to record the decision in the history.
- **Spec 023 (Mission Outcomes)**: The mission engine emits a `galaxy:playerAlert` for each resolved mission report (FR-MO-007).
- **Spec 014 (Fleet Movement)**: The fleet state manager emits a `galaxy:playerAlert` when a fleet arrives at its destination (FR-FM-004).
- **Spec 015/048 (Combat)**: The combat engine emits a `galaxy:playerAlert` for each combat resolution.
- **Spec 027 (System Capture)**: The loyalty state manager emits a `galaxy:playerAlert` when system control changes.
- **Spec 042 (Intelligence)**: The intel engine emits a `galaxy:playerAlert` for intel reveals and counter-intelligence events.

---

## Constraints

- Alert messages must use display names resolved from state managers — never raw IDs (per UI Display Rules in copilot-instructions)
- All icons must be pure Unicode text glyphs defined in `src/icons.js` — no emoji (per UI Display Rules)
- The alert bar must not block or interfere with TopBarHUD click targets (resource breakdown button, turn button, etc.)
- The Alert History panel must not conflict with InfoPanelFrame panels — it is a modal overlay (higher z-index), not a side panel
- Alert generation must be fog-of-war safe: a faction's alert must not contain information the faction hasn't earned through intel or direct observation
- The 3-second pacing timer resets if the player opens the Alert History panel; on close, the next queued alert displays immediately

---

## Acceptance Criteria

- [ ] `galaxy:playerAlert` CustomEvent is dispatched by mission, fleet, combat, event, capture, and intel subsystems
- [ ] Alert bar in TopBarHUD displays the most recent alert message as a single truncated line
- [ ] New alerts scroll into the alert bar with upward slide animation; previous message scrolls out
- [ ] Queued alerts cycle with 3-second spacing between each display
- [ ] Clicking the alert bar opens the Alert History panel
- [ ] Alert History panel matches Help panel dimensions (90vw × 80vh, max 1000px × 700px)
- [ ] Left column lists all alerts newest-first with category icon, message, and turn number
- [ ] Right column shows the full outcome of the selected alert, including all detail rows
- [ ] Most recent alert is pre-selected when the history panel opens
- [ ] "Go to {systemName}" button in the outcome column centers the map and opens System Detail
- [ ] Async mode: alerts queue during Resolution/Maintenance and deliver after the spec 036 sequential flow completes
- [ ] Sync mode: alerts appear in the alert bar immediately as events fire
- [ ] Alert history retains up to 100 alerts; oldest are purged on overflow
- [ ] Alerts are serialized in save data and restored on load
- [ ] No raw IDs appear in any alert message or outcome text
- [ ] Escape key and backdrop click dismiss the Alert History panel
- [ ] ALERT_ICONS exported from `src/icons.js` using Unicode text glyphs, no emoji

## Implementation Notes

- **AlertBar component** (`src/components/AlertBar.jsx`): Embedded inside `TopBarHUD` between the resource strip and the right-side controls. Manages the scroll animation and queue pacing timer.
- **AlertHistoryPanel component** (`src/components/AlertHistoryPanel.jsx`): Modal overlay with two-column layout. Uses the same backdrop/sizing pattern as `HelpPanel`.
- **Alert state**: Managed via React context (`src/contexts/AlertContext.jsx`) so both AlertBar (in TopBarHUD) and AlertHistoryPanel can share the alert store.
- **Save integration**: `SaveStateManager.createSnapshot()` includes the alert store array; `loadGame()` restores it into AlertContext.
- **Producer integration**: Each engine (`mission-engine.js`, `fleet-state-manager.js`, `combat-engine.js`, `event-engine.js`, `loyalty-state-manager.js`, `intel-engine.js`) dispatches `galaxy:playerAlert` at the point where it currently fires `galaxy:notify`.
- **Icon additions**: Add `ALERT_ICONS` to `src/icons.js` mapping each category to its Unicode glyph.
