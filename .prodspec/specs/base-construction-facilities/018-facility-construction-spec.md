# Facility Construction

## Overview

Facility Construction enables factions to build specialized buildings at systems they control. Facilities expand a faction's military, economic, and research capabilities. Each facility type has defined construction costs, build time, and the bonuses it provides once operational. Construction is managed through a per-system queue and integrated with the Turn-Based Game Loop's Resolution Phase.

## Requirements

### FR-FC2-001: Facility Types
- System shall support the following facility types (defined in JSON config):

  | ID | Name | Effect | Cost | Build Time |
  |----|------|--------|------|------------|
  | `shipyard` | Shipyard | Enables ship production; required for fleet construction | 400cr + 150mat | 3 turns |
  | `training` | Training Facility | +20% recruit generation at system | 300cr + 100mat | 2 turns |
  | `research` | Research Facility | -10% tech research cost; +Research bonus for stationed characters | 500cr + 200mat | 3 turns |
  | `defense` | Defense Platform | +10% combat defense bonus for friendly fleets at system | 350cr + 150mat | 2 turns |
  | `shield` | Shield Generator | +5% additional combat defense; reduces raid damage by 20% | 600cr + 250mat | 4 turns |
  | `extractor` | Resource Extractor | +15% credits and materials from system per turn | 400cr + 100mat | 2 turns |
  | `ion_cannon` | Ion Cannon | First combat round: reduces enemy fleet's effective combat power by 15% | 500cr + 200mat | 3 turns |

- Facility definitions must be externalized in JSON config

### FR-FC2-002: Construction Queue
- Each system has one independent construction queue
- Queue can hold up to 3 pending items (any combination of facilities and ships at Shipyard)
- Only one item is built per turn per system queue
- Items in queue are processed in order; player may reorder queued items before turn submission
- Construction cost is deducted when the item is placed in the queue (upfront payment)
- If the faction cannot afford the cost, the item is not accepted into the queue

### FR-FC2-003: Construction Prerequisites
- Some facilities require other facilities to exist at the system first:
  - Shield Generator requires Defense Platform
  - Ion Cannon requires Defense Platform
  - Shipyard has no prerequisite
- Attempting to queue a facility without its prerequisite produces a clear error message
- If the prerequisite is destroyed after a dependent facility is built, the dependent facility still functions (no cascading removal)

### FR-FC2-004: Construction Completion
- When the construction timer reaches 0, on that turn's Resolution Phase the facility becomes **operational**
- The player receives a notification: "Construction complete: [Facility] at [System]"
- Facility bonuses are applied immediately from that turn's Maintenance Phase onward

### FR-FC2-005: Facility Upgrades
- Shipyards, Training Facilities, and Research Facilities support upgrades to Level 2 and Level 3
- Upgrading costs 50% of the original build cost and takes 2 turns
- Level bonuses:
  - Shipyard Lvl 2: +1 concurrent ship build slot (2 ships simultaneously); Lvl 3: +1 more slot (3 ships)
  - Training Facility Lvl 2: +15% additional recruit generation; Lvl 3: +15% more
  - Research Facility Lvl 2: -5% additional research cost reduction; Lvl 3: -5% more
- Each facility starts at Level 1; upgrade is a separate queue entry

### FR-FC2-006: Facility Demolition
- Player may demolish a facility during the Action Phase
- Demolition takes 1 turn and returns 25% of the original build cost in Materials
- Demolition is irreversible; the facility must be rebuilt from scratch if needed
- Dependent facilities (e.g. Shield Generator if Defense Platform is demolished) must also be demolished first

### FR-FC2-007: Faction Construction Bonuses
- Brand Authority: -10% construction cost for Defense Platform, Shield Generator, Ion Cannon
- The Union: -15% construction cost for all facilities (guerrilla engineering efficiency)
- The Autoforge: -20% construction cost for Outposts (covered in Base Types spec 017); standard cost for all other facilities
- Cost bonuses apply at the time of queue addition; they do not retroactively change queued items

### FR-FC2-008: Construction UI
- A **Facilities** tab in the System Detail panel shall list:
  - All currently built facilities at the system and their level
  - HP indicator for each facility (shows damage from raids/combat)
  - An **Add to Queue** button per available unbuilt facility type
  - The current construction queue with progress bars and remaining turns
  - Reorder buttons for queued items
- Hovering a facility shows its bonuses and upgrade requirements

## Constraints

- Construction payment is upfront and non-refundable if a queue item is cancelled
- All facility definitions must reside in config JSON (no hardcoded facility logic)
- A system may have at most one instance of each facility type (no duplicate facilities per system)
- Cancelling a queued item before it starts returns 50% of the cost; once started, it is non-refundable

## Acceptance Criteria

- [x] All 7 facility types are available to construct in qualifying systems
- [x] Construction queue accepts up to 3 items and deducts cost on addition
- [x] Queue processes one item per turn and completes on the correct turn
- [x] Shield Generator and Ion Cannon cannot be queued without a Defense Platform
- [x] Facility bonuses (defense, production, research) apply correctly from completion turn
- [x] Shipyard Level 2 enables 2 concurrent ship build slots (queue max increases via `_getQueueSlots()`)
- [x] Brand Authority defense facility cost discount and Union general discount apply correctly
- [x] Demolition takes 1 turn and returns 25% of cost in Materials
- [x] Facilities panel shows current facilities, HP, queue, and add-to-queue options
- [ ] Full construction state persists through save-load cycle (serialization API implemented; persistence integration deferred)

## Implementation Notes

- **Config**: `core/construction-config.json` — all 7 facility types with costs, build times, prerequisites, levelEffects
- **State**: `core/construction-state-manager.js` — `enqueue()`, `dequeue()`, `advanceAllQueues()`, `addFacility()`, `reorderQueue()`
- **Engine**: `core/construction-engine.js` — `queueFacilityBuild()`, `queueFacilityUpgrade()`, `queueFacilityRepair()`, `queueFacilityDemolish()`, `cancelQueueItem()`, `getEffectiveCost()` (with faction modifiers), `resolveCompletions()`
- **Integration**: `_resolveConstruction()` in `core/turn-resolution-engine.js` calls engine each turn; wired in `engine/main-stage.js`
- **UI**: `FacilitiesTab` in `src/components/SystemDetails.jsx` replaced with full implementation; `galaxy:queueFacilityBuild` / `galaxy:cancelQueueItem` events bridge React to Phaser
