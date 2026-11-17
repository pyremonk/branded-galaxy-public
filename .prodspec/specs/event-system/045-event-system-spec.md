# Event System

## Overview

The Event System introduces dynamic, unexpected occurrences that alter the strategic situation without player-initiated actions. Events may be entirely random (procedurally triggered), scripted (tied to specific game conditions), or choice-based (presenting the player with a branching decision). All three event sub-types share a unified event data model, trigger engine, and resolution pipeline.

## Requirements

### FR-ES-001: Event Data Model
- Each game event is defined as a JSON object structured as:
```json
{
  "id": "string (unique, e.g. 'EVT_PIRATE_RAID')",
  "type": "random | scripted",
  "title": "string",
  "description": "string (supports [faction_name], [system_name] template tokens)",
  "conditions": [],
  "weight": 1,
  "effects": [],
  "choices": []
}
```
- If `choices` is non-empty, the event is a **choice event** (player makes a decision before effects apply)
- Events are defined in `core/events.json` (to be created during implementation)

### FR-ES-002: Random Events
- Every turn, during the end of the Resolution Phase, each faction rolls for a random event
- Roll mechanic: `seededRandom(seed)` where seed = `turnNumber + factionId + "event"`
- Roll result compared against the cumulative weight of all eligible events for that faction
- An event is eligible if all entries in its `conditions` array evaluate to true for the current game state
- Maximum 1 random event per faction per turn
- Random events have a global cooldown: the same event ID may not fire for the same faction for 3 turns after it last fired

### FR-ES-003: Scripted Events
- Scripted events are triggered by specific game conditions, not by random roll
- Conditions are evaluated each turn (during Resolution Phase, after random event check)
- Scripted event conditions may reference:
  - Turn number thresholds (e.g. `{ "type": "turn_gte", "value": 10 }`)
  - Faction-owned system counts (e.g. `{ "type": "systems_owned_gte", "factionId": "brand_authority", "value": 5 }`)
  - Loyalty thresholds in specific systems (e.g. `{ "type": "loyalty_lte", "systemId": "coruscant", "factionId": "union", "value": 20 }`)
  - Character status (e.g. `{ "type": "character_captured", "characterId": "sen_kova" }`)
  - First occurrence only: `{ "type": "first_time" }` condition prevents re-triggering
- Each scripted event fires at most once per game by default (use `repeatable: true` to override)

### FR-ES-004: Choice Events
- Choice events pause the Action Phase for the affected faction with a modal dialog
- The dialog shows:
  - Event title and description
  - A flavor paragraph (lore/narrative context)
  - 2–4 labeled choices, each showing:
    - Choice label (e.g. "Accept the refugees")
    - Resource cost or reward preview (e.g. "+50 Influence, -100 Credits")
    - Brief consequence hint (e.g. "Increases loyalty in Caldus Minor")
- The player must make a selection before taking any other actions
- In hot-seat multiplayer, each faction's events are presented sequentially during their Action Phase
- In AI-controlled factions, the AI evaluates choices by selecting the option with the highest delta to its current macro goal score (spec 032)

### FR-ES-005: Event Effects
- After a choice is selected (or for non-choice events, immediately after trigger), effects are applied
- Supported effect types:
  - `resource_delta`: `{ "type": "resource_delta", "resource": "credits", "amount": -200 }`
  - `loyalty_delta`: `{ "type": "loyalty_delta", "systemId": "[target]", "factionId": "[faction]", "amount": 15 }`
  - `fleet_damage`: `{ "type": "fleet_damage", "systemId": "[target]", "amount": 2 }` (destroys ships of lowest tier)
  - `facility_damage`: `{ "type": "facility_damage", "systemId": "[target]", "facilityType": "any" }`
  - `spawn_fleet`: `{ "type": "spawn_fleet", "systemId": "[target]", "size": 3, "faction": "neutral" }`
  - `character_lost`: `{ "type": "character_lost", "characterId": "[target]" }` (temporary absence, 2 turns)
  - `intel_item`: generates an intel item of the specified type for the triggering faction
  - `notify`: fires a `galaxy:notify` event with a specified message

### FR-ES-006: Event Notifications
- Non-choice events fire a `galaxy:notify` event with severity `warning`
- The notification includes the event title and a one-sentence summary
- A "View Details" link in the notification toast opens a dedicated Event Detail panel showing full description and effects applied
- Events are logged in the Turn Summary (spec 036, FR-NA-004) for the turn they fired

### FR-ES-007: Event Log
- All events that fired during a game are appended to `gameState.eventLog[]` as:
```json
{
  "turnNumber": 5,
  "factionId": "string",
  "eventId": "string",
  "choiceIndex": 0,
  "effectsApplied": []
}
```
- The event log is serialized in save data and shown in the Post-Game Stats screen (section 19 of catalog)

## Constraints

- The seeded random roll for events must use the same `SeededRandom` utility as combat and missions (spec 011)
- Event definitions in `core/events.json` must be validated at game start; malformed entries are skipped with a console warning
- Choice events must block AI and human Action Phase actions until resolved; they are resolved before any orders are submitted

## Acceptance Criteria

- [x] Random event roll fires at most once per faction per turn
- [x] Same event cannot re-fire within 3 turns of its last occurrence for the same faction
- [x] Scripted event conditions are evaluated each turn and fire correctly on first match
- [x] `first_time`-conditioned scripted events fire at most once per game
- [x] Choice event modal displays with all choices, costs/rewards preview, and consequence hints
- [x] AI-controlled factions select choices aligned to their macro goal automatically
- [x] All 8 effect types apply correctly to game state
- [x] Non-choice events fire a `warning` notification with event title and summary
- [x] All triggered events are appended to `gameState.eventLog[]` with correct schema
- [x] Events are included in the Turn Summary at turn end

## Implementation Notes

- **EventEngine** (`core/event-engine.js`): seeded random roll (same `SeededRandom` utility as combat), condition evaluator, effect applier, serialization
- **Event pool** (`core/events.json`): 12 events — 8 random (2 choice-based), 4 scripted (2 choice-based)
- **EventChoiceModal** (`src/components/EventChoiceModal.jsx`): React overlay with full-screen scrim, queues multiple pending choice events
- **TurnResolutionEngine step 8** (`core/turn-resolution-engine.js`): fires after intel updates
- **Save data**: `eventState` field added to `SaveStateManager.createSnapshot()` snapshot
- **Player choice flow**: `galaxy:choiceEvent` (Phaser → React) / `galaxy:choiceEventResolved` (React → Phaser)
