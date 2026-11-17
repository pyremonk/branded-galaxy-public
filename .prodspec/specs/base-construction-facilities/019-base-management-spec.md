# Base Management

## Overview

Base Management covers the ongoing operational aspects of a faction's constructed facilities and headquarters bases — monitoring asset health, managing construction queues across systems, repairing damaged facilities, and administering upgrades. While Facility Construction (spec 018) defines how facilities are built, Base Management defines how they are maintained and kept operational over the course of a game.

## Requirements

### FR-BM-001: Facility Health and Damage
- Every facility has a current HP and a maximum HP
- Facility HP values by type:
  - Defense Platform, Shield Generator, Ion Cannon: 6 HP
  - Shipyard, Research Facility: 5 HP
  - Training Facility, Resource Extractor: 4 HP
  - Outpost (Autoforge): 3 HP
  - Sector HQ (Brand Authority): 8 HP
  - Secret Base (Union): 5 HP
- Damage sources: Raid command (spec 016), sabotage missions (spec 021), ground combat during invasion (spec 020)
- A facility at 0 HP is destroyed and its bonuses immediately stop applying
- Partial damage reduces facility efficiency: a facility below 50% HP operates at 50% of its bonus values

### FR-BM-002: Facility Repair
- Players may queue facility repairs in the same system construction queue
- Repair cost:
  - Each HP restored costs: `base_build_cost / max_HP × 0.5` (50% of per-HP construction cost)
  - Remainder fraction rounds up to nearest 10 credits/materials
- Repair is performed 1 HP per turn (same queue as construction)
- Alternatively, a stationed character with Research stat ≥ 6 at a Shipyard can perform **emergency repairs**: costs 2× normal but completes in 1 turn regardless of HP lost
- Fully destroyed facilities cannot be repaired — they must be rebuilt (see spec 018)

### FR-BM-003: Multi-System Overview Panel
- A **Command Overview** panel (accessible from the main HUD) shall aggregate all facilities across all systems controlled by the faction:
  - Grouped by system
  - Each facility shown with: name, level, current HP / max HP, active bonus, queue status
  - Damaged facilities highlighted (yellow border for < 50% HP; red for < 25% HP)
  - Systems with active construction shown with progress indicators
- The overview panel supports sorting by: system name, queue activity, damage status
- Clicking a system row navigates the galaxy map camera to that system and opens the System Detail panel

### FR-BM-004: Construction Queue Management Across Systems
- Players may view and modify construction queues for any controlled system from the Command Overview panel (not just the System Detail panel)
- Queue reordering and cancellation is available from both entry points
- Adding items to a queue from the Command Overview auto-deducts resources and validates prerequisites

### FR-BM-005: Facility Upgrade Management
- The Command Overview shall provide a quick-upgrade view: for each upgradeable facility at or above the 50% HP threshold, an **Upgrade** button is shown
- Upgrades may be initiated from the overview without navigating to each system individually
- Queued upgrades appear in the system's construction queue like any other item

### FR-BM-006: Facility Status Events
- System shall emit game events for key facility lifecycle moments:
  - `galaxy:facilityComplete` — facility or upgrade finishes construction
  - `galaxy:facilityDamaged` — facility takes damage (includes new HP value)
  - `galaxy:facilityDestroyed` — facility reaches 0 HP
  - `galaxy:facilityRepaired` — facility HP restored to full
- These events surface as notifications in the alerts panel

### FR-BM-007: Autoforge Network Recalculation
- Because Autoforge Outpost bonuses stack per-network-size, the network bonus must recalculate any time an Outpost is built, damaged below 50% HP, or destroyed
- Recalculation fires during the Maintenance Phase after facility damage/completion is processed
- The updated network bonus is reflected immediately in all production calculations for the same turn

## Constraints

- Facilities at 0 HP must not apply any bonuses (including partial) and must not count toward Autoforge Network bonus
- Repair queue must share the same single-queue slot as construction (no parallel repair + build at same system by default; Shipyard Lvl 2+ adds a second slot)
- Command Overview must not require opening individual system panels to manage basic queues

## Acceptance Criteria

- [x] Facility above 50% HP applies full bonus; below 50% HP applies 50% of bonus
- [x] Facility at 0 HP is destroyed and applies no bonuses
- [x] Repair queues correctly restore HP at the calculated cost per HP
- [ ] Emergency repair via stationed character costs 2× but completes in 1 turn (character integration deferred)
- [x] Command Overview panel shows all facilities across all systems with correct HP and queue status
- [x] Damaged facilities receive correct visual highlights in the overview panel
- [x] Upgrading from Command Overview adds item to correct system queue and deducts resources
- [x] All four facility lifecycle events fire at the correct moments (`galaxy:facilityComplete`, `galaxy:facilityDamaged`, `galaxy:facilityDestroyed`, `galaxy:facilityRepaired`)
- [x] Autoforge network bonus recalculates when Outpost HP crosses 50% or is destroyed
- [x] Clicking a system row in Command Overview navigates camera to that system

## Implementation Notes

- **Module**: `src/components/CommandOverviewPanel.jsx` + `CommandOverviewPanel.css` — multi-system overview, sort by name/queue/damage, navigate-to button
- **State**: `core/construction-state-manager.js` — `getSystemBonuses()` applies 50% efficiency for partial HP; `damageFacility()`, `repairFacility()`
- **Events**: `galaxy:constructionUpdate` emitted after every queue/damage/repair operation; React components subscribe to stay in sync
