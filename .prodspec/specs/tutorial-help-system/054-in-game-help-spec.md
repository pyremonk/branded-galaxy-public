# In-Game Help

## Overview

The In-Game Help system provides contextual assistance to players during play without requiring them to leave the game or consult external documentation. It encompasses tooltips on interactive elements, a searchable Help Panel with full game reference, and context-sensitive tips that surface proactively based on player activity.

## Requirements

### FR-IH-001: Tooltips
- All interactive UI elements with non-obvious behavior must have a tooltip
- Tooltip trigger: 400ms hover delay on desktop; long-press (500ms) on touch
- Tooltip content:
  - **Name** (bold heading): the element's display name
  - **Description**: 1–3 sentences explaining what it is / does
  - **Shortcut** (if applicable): displayed as a keyboard shortcut badge (e.g. `[E]`)
  - **Resource cost** (if applicable): shown with colored resource icons
- Tooltips must not obscure the element being hovered; auto-flip to opposite side if near viewport edge
- Tooltip max width: 280px

### FR-IH-002: Tooltip Definitions Source
- All tooltip text is defined in `core/help-definitions.json` (to be created)
- Each entry:
```json
{
  "id": "string (matches data-help-id attribute on the element)",
  "name": "string",
  "description": "string",
  "shortcut": "optional string",
  "resourceCost": "optional string"
}
```
- React components render tooltips by looking up `data-help-id` from the definitions file
- Undefined IDs show no tooltip (fail silently)

### FR-IH-003: Help Panel
- The Help Panel is opened by:
  - Pressing `?` or `F1` keyboard shortcut
  - Clicking the `?` icon in the HUD toolbar
- The Help Panel is a full-screen modal overlay (not a slide-in panel)
- Structure:
  - **Search bar** (auto-focused on open): filters all articles by keyword
  - **Category list** (left sidebar): categories mirror feature sections (Galaxy, Factions, Characters, Fleets, Bases, Missions, Diplomacy, Combat, Research, Victory)
  - **Article viewer** (main area): displays the full help article for the selected topic
- Keyboard navigation: `↑`/`↓` in category list, `Enter` to select, `Esc` to close

### FR-IH-004: Help Articles
- Help articles are defined in `core/help-articles.json` (to be created)
- Each article:
```json
{
  "id": "string",
  "categoryId": "string",
  "title": "string",
  "body": "markdown string (rendered as HTML)"
}
```
- Articles may include cross-reference links (`[Fleet Orders](fleet-orders)`) that navigate to the linked article in the panel
- Minimum article set (one per major spec): Galaxy Map, Factions, Characters, Missions, Fleets, Bases, Research, Diplomacy, Combat, Game Loop, Victory Conditions, Intel, Events, Save & Load

### FR-IH-005: Context-Sensitive Tips
- On the first occurrence of certain game events, a tip toast appears automatically:
  - First time player has ≥ 3 characters: tip about assigning characters to CI Duty
  - First time player has a fleet with 6+ ships: tip about commander assignment
  - First time player's loyalty drops below 40 in any system: tip about diplomatic actions
  - First time a mission fails: tip about character stat matching
  - First time research completes: tip about chaining tech prerequisites
- Tips use the `Info`-tier notification (spec 036)
- Tips are shown at most once per game session; shown-tip IDs are tracked in `gameState.shownTips[]`
- A "Don't show tips" toggle in the pause menu options suppresses all future tips

### FR-IH-006: Glossary
- The Help Panel's search also searches a Glossary section containing definitions for all game terms
- Glossary terms are defined inline in `help-articles.json` under category `"glossary"`
- Minimum glossary entries: Credits, Materials, Influence, Loyalty, Turn, Phase, Fleet Power, Base Power, Initiative, Sector, System, Hyperspace Lane

## Constraints

- The Help Panel must not require a network request; all content is bundled in `help-articles.json` as a static asset
- Tooltips must render in < 50ms after the hover delay threshold
- The Help Panel search must return results within 100ms for any query against the full article set

## Acceptance Criteria

- [ ] Hovering interactive elements for 400ms displays the correct tooltip with name, description, and optional fields
- [ ] Tooltips auto-flip when near viewport edge; max width 280px
- [ ] `?` and `F1` open the Help Panel; `Esc` closes it
- [ ] Search bar filters articles and glossary entries in real time
- [ ] Category sidebar navigates to the correct article section
- [ ] Cross-reference links within articles navigate to the linked article
- [ ] Context-sensitive tips appear on first occurrence of each trigger condition
- [ ] "Don't show tips" toggle suppresses all context tips permanently for the session
- [ ] Glossary minimum entries are present and searchable
- [ ] All help content loads from bundled static file without network requests
