# Character Roster

## Overview

The Character Roster system manages named leaders and heroes for each faction. Characters are the agents through which players execute missions, command fleets, and generate bonuses at facilities. Each faction maintains a roster of characters with distinct identities, stats, and skill specializations. Characters persist across turns, gain experience, and can be permanently lost through combat or failed missions.

The three factions each have a unique cast of characters reflecting their identity:
- **The Brand Authority** — Corporate executives, military admirals, and intelligence directors
- **The Union** — Resistance commanders, diplomats, and covert operatives
- **The Autoforge** — AI Cores, autonomous drones, and network architects

## Requirements

### FR-CR-001: Character Definition Format
- Each character shall be defined with:
  - **ID**: Unique identifier (string)
  - **Name**: Display name (unique within faction)
  - **Faction**: Owning faction ID
  - **Portrait**: Visual representation (SVG icon or emoji fallback)
  - **Background**: Short lore narrative (1-3 sentences)
  - **Level**: Current experience level (1–10)
  - **Experience Points**: Progress toward next level
  - **Status**: Available / On Mission / In Fleet / Captured / Dead
  - **Location**: Current system ID or null if in transit
  - **Stats**: Object containing all base stat values
  - **Specializations**: Array of skill tags that modify stat calculations

### FR-CR-002: Character Stats
- Each character shall have five base stats, each ranging 1–10:
  - **Combat**: Effectiveness in fleet battle, resists capture, ground assault skill
  - **Espionage**: Success rate on covert missions (sabotage, abduction, infiltration)
  - **Diplomacy**: Success rate on civilian missions (loyalty, recruitment, negotiation)
  - **Leadership**: Bonus applied when commanding a fleet (+% to fleet combat power)
  - **Research**: Contribution to tech research speed when stationed at a research facility
- Stats are fixed at character creation (determined by character definition)
- Stats increase through level-up events (experience milestones)

### FR-CR-003: Character Specializations
- Each character may have 0–3 skill specialization tags
- Specialization tags provide a flat +2 effective stat bonus when performing a relevant action
- Defined specialization tags:
  - `covert-ops` → +2 Espionage on sabotage/infiltration missions
  - `negotiator` → +2 Diplomacy on loyalty-increase and negotiation missions
  - `fleet-commander` → +2 Leadership when assigned as fleet commander
  - `researcher` → +2 Research when stationed at a research facility
  - `recruiter` → +2 Diplomacy on recruitment missions
  - `assassin` → +2 Espionage on assassination and abduction missions
  - `guerrilla` → +2 Combat for Union characters in enemy-controlled systems
  - `droid-interface` → +2 Espionage/Leadership for Autoforge characters interfacing with droid networks
- Additional tags may be added via configuration without code changes

### FR-CR-004: Starting Rosters
- Each faction shall start with a defined set of named characters
- **Brand Authority**: 4 starting characters
  - 1 military admiral (high Combat, Leadership)
  - 1 intelligence director (high Espionage)
  - 1 economic minister (high Diplomacy, Research)
  - 1 field agent (balanced stats)
- **The Union**: 4 starting characters
  - 1 resistance commander (high Combat, Leadership)
  - 1 covert operative (high Espionage)
  - 1 diplomat (high Diplomacy)
  - 1 saboteur (high Espionage, Combat)
- **The Autoforge**: 3 starting characters
  - 1 primary AI Core (high Research, Leadership)
  - 1 tactical drone cluster (high Combat, Espionage)
  - 1 diplomatic interface (high Diplomacy)
- Starting character definitions shall be stored in faction definition JSON config

### FR-CR-005: Experience and Leveling
- Characters gain experience points (XP) from successful mission outcomes
- XP thresholds per level: 100 × level (Level 1→2: 100 XP, Level 4→5: 400 XP, etc.)
- On level-up, one stat chosen by the system increases by 1 (based on most-used stat)
- Maximum level is 10; experience beyond max level is discarded
- Level-up notification shall be surfaced as a game event/alert
- Characters that are captured do not gain XP during captivity

### FR-CR-006: Character Status Management
- Valid statuses and allowed transitions:
  - **Available** → On Mission, In Fleet, Captured
  - **On Mission** → Available (mission complete), Captured (mission failure)
  - **In Fleet** → Available (fleet disbanded/reassigned), Captured (fleet destroyed)
  - **Captured** → Available (successful rescue), Dead (execution event)
  - **Dead** → (terminal; no transitions)
- Dead characters are removed from the active roster permanently
- A faction with 0 available characters cannot initiate new missions or assign fleet commanders
- Status transitions shall emit a game event for UI notification

### FR-CR-007: Character Recruitment
- New characters may be acquired via the Recruitment mission type
- Recruited characters are generated procedurally:
  - Randomly generated name from a faction-appropriate name pool
  - Stats are randomly rolled within a tier determined by recruiting character's Diplomacy
  - Low Diplomacy (1-3): Tier-1 stat ranges (1-4 per stat)
  - Mid Diplomacy (4-7): Tier-2 stat ranges (3-6 per stat)
  - High Diplomacy (8-10): Tier-3 stat ranges (5-8 per stat)
- Recruited characters start at Level 1 with 0 XP
- Maximum faction roster size is 12 characters; recruitment fails if roster is full

### FR-CR-008: Character Data Persistence
- Full roster state shall be serialized to JSON for save/load operations
- Persisted fields: ID, name, faction, level, XP, status, location, stats, specializations
- DataBridge shall expose `saveCharacterState(factionId, rosterData)` and `loadCharacterState(factionId)`
- Roster state shall be included in the full game save payload

### FR-CR-009: Character Roster UI
- A Character Roster panel shall be accessible from the main HUD
- Panel shall display all faction characters with:
  - Portrait, name, level badge
  - Current status (color-coded)
  - Current location (system name or "In Transit")
  - Stat bars or numeric stat summary
  - Specialization tag badges
- Clicking a character opens a detail view with full stats, background, XP progress, and action options
- Dead characters shall not appear in the active roster view (accessible via archive toggle)

## Constraints

- Character definitions must be externalized in JSON config (not hardcoded in JS)
- Procedural name generation must not duplicate existing roster names
- Stat values must remain integers in range [1, 10] at all times
- Character system must function without fleet/mission systems present (graceful degradation)
- UI must be accessible on screen widths ≥ 768px without horizontal scroll

## Acceptance Criteria

- [x] Each faction loads its starting roster from config on game start
- [x] All 5 stats display correctly for every character
- [x] Specialization tags apply the correct +2 bonus in relevant stat checks
- [x] Experience accumulates and triggers level-up at correct thresholds
- [x] Characters correctly transition between all valid statuses
- [x] Roster panel renders with all characters and their current state
- [x] Character detail view shows full info including XP bar and background
- [x] Recruited character stats fall within the tier range for the recruiting character's Diplomacy
- [x] Dead characters are removed from active roster and do not block gameplay
- [x] Roster state serializes and deserializes without data loss
