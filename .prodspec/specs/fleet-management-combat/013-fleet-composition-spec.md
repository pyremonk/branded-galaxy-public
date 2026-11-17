# Fleet Composition

## Overview

Fleet Composition defines the ship types available to each faction, how ships are organized into fleets, the costs and facilities required to produce them, and the maintenance overhead they carry. Fleets are the primary military force projection tool in Branded Galaxy — the composition of a fleet directly determines its combat capability, upkeep burden, and strategic role (attack, defense, patrol, escort, blockade).

Each faction has access to a common base set of ship types plus faction-exclusive vessels unlocked through the tech tree. Ships are produced at Shipyards and assembled into named fleets that can be commanded by characters.

## Requirements

### FR-FC-001: Ship Type Definitions
- System shall define ship types in a configuration file (JSON)
- Each ship type shall include:
  - **ID**: Unique identifier
  - **Name**: Display name
  - **Faction**: Owning faction or `"all"` for universal types
  - **Class**: Fighter / Corvette / Cruiser / Capital
  - **Combat Power**: Base combat effectiveness (1–100)
  - **Hull Points**: Health in combat (1–10)
  - **Speed**: Movement points per turn (affects fleet speed)
  - **Maintenance Cost**: Credits per turn while active
  - **Production Cost**: Credits + Materials to build
  - **Production Time**: Turns required at Shipyard
  - **Requires Tech**: Optional tech ID that must be researched before this type is available for production
  - **Requires Facility**: Facility level required at Shipyard (1–3)

### FR-FC-002: Universal Ship Types (All Factions)
- **Fighter Squadron**: Fast, low power; cheap to produce and maintain
  - Combat: 5 · Hull: 1 · Speed: 4 · Maint: 10cr · Cost: 100cr+20mat · Build: 1 turn
- **Corvette**: Versatile escort; moderate power
  - Combat: 15 · Hull: 2 · Speed: 3 · Maint: 25cr · Cost: 250cr+50mat · Build: 2 turns
- **Cruiser**: Workhorse warship; high power, moderate cost
  - Combat: 35 · Hull: 4 · Speed: 2 · Maint: 60cr · Cost: 600cr+120mat · Build: 3 turns
- **Capital Ship**: Heavy hitter; very high power, expensive
  - Combat: 80 · Hull: 8 · Speed: 1 · Maint: 150cr · Cost: 1500cr+300mat · Build: 5 turns

### FR-FC-003: Faction-Exclusive Ship Types
- **Brand Authority**:
  - *Enforcer Dreadnought* (Tier-5 tech unlock): Combat 120 · Hull 12 · Capital class
  - *Blockade Runner* (Tier-3 tech unlock): +50% combat vs. stationary targets
- **The Union**:
  - *Stealth Corvette* (Tier-3 tech unlock): Evades enemy patrols; harder to detect in enemy territory
  - *Liberation Carrier* (Tier-5 tech unlock): Carries 4 Fighter Squadrons; Combat 90 · Hull 10
- **The Autoforge**:
  - *Droid Carrier* (Tier-3 tech unlock): Self-repairing hull (recovers 1 Hull per turn in friendly territory)
  - *Nexus Battleship* (Tier-5 tech unlock): Combat 110 · Hull 12; +20% vs. enemy capital ships

### FR-FC-004: Fleet Organization
- A fleet is a named group of 1–12 ships
- Fleets are created by the player and assigned a name
- Ships of any type may be combined in a single fleet
- A fleet's aggregate stats:
  - **Total Combat Power**: Sum of all ship Combat values + commander Leadership bonus
  - **Fleet Speed**: Minimum Speed value among all ships in the fleet
  - **Total Maintenance**: Sum of all ship Maintenance costs per turn
- Players may split fleets: select ships to form a new fleet at the same system
- Players may merge fleets: combine two fleets at the same system into one (cap 12 ships)

### FR-FC-005: Fleet Maintenance Costs
- All ships in all fleets consume their maintenance cost each turn during the Maintenance phase
- If a faction cannot pay full fleet maintenance (insufficient credits), each unpaid fleet suffers a -10% combat penalty until paid
- Maintenance is deducted proportionally if partial payment is possible
- Disbanded ships (removed from a fleet and scrapped) pay no further maintenance
- Scrapping a ship recovers 25% of its production cost in Materials

### FR-FC-006: Ship Production
- Ships are produced at Shipyard facilities
- Each Shipyard has one active production queue (one ship build per turn advance)
- Queuing multiple ships at one Shipyard lines them up sequentially
- Production output per turn is 1 ship completion (regardless of build time; time means turns waited)
- Brand Authority receives a faction bonus: -20% production time at all Shipyards (see Faction Identity spec 005)
- Completed ships are added to a staging area at the system; player assigns them to a fleet

### FR-FC-007: Fleet Persistence
- All fleets, their ship compositions, names, locations, and assigned commanders must be serialized in save state
- Fleet IDs are stable across turns (no renumbering)
- Ship production queue state must also persist across saves

## Constraints

- Maximum of 12 ships per fleet
- Ship type definitions must be external JSON to allow modding without code changes
- Faction-exclusive ships must be blocked from other factions at both production and UI level
- Maintenance cost deduction must be deterministic (order of fleets for partial payment is alphabetical by fleet name)

## Acceptance Criteria

- [x] All universal ship types load from config with correct stats
- [x] Faction ships are only available to their respective faction
- [x] Faction ship types are locked until the required tech is researched
- [x] Fleet total stats (combat, speed, maintenance) calculate correctly from ship components
- [x] Fleet split creates a valid second fleet at the same system with selected ships removed from original
- [x] Fleet merge at same system combines ships up to cap of 12
- [x] Maintenance is deducted each turn during Maintenance phase
- [x] -10% combat penalty applies when maintenance cannot be paid
- [x] Scrapping a ship removes it from the fleet and returns 25% cost in Materials
- [x] Ship production queue at Shipyard advances one turn per game turn
- [x] All fleet and production state survives a save-load cycle
