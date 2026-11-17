# Loyalty System

## Overview

The Loyalty System tracks each star system's political allegiance on a 0–100 scale for each faction. Loyalty determines resource output from systems, faction control, system defection behavior, and eligibility for diplomatic missions. Loyalty values change through diplomatic missions, military actions, resource spending, and random events. The system drives the ebb and flow of political control across the galaxy.

## Requirements

### FR-LS-001: Loyalty Model
- Every system has a loyalty value (0–100) for each faction stored as a map: `{ factionId: value }`
- Loyalty values across factions for a single system are independent (a system may have 70 BA loyalty and 40 Union loyalty simultaneously)
- **Controlling faction** is the faction with the highest loyalty value, provided it is ≥ 40
- If no faction has loyalty ≥ 40, the system is **Neutral**
- Loyalty values are stored per-system in galaxy state and persisted in save data

### FR-LS-002: Base Loyalty Generation
- Each controlled system has a **passive loyalty drift** applied each turn in the Maintenance Phase:
  - +2 loyalty toward controlling faction per turn (population inertia)
  - -1 loyalty toward all non-controlling factions per turn (erosion)
- Systems under military occupation (any enemy fleet present) instead: -3 loyalty toward controlling faction; +1 toward the occupying faction
- Loyalty drifts are capped so values remain in [0, 100]; no drift can exceed the cap

### FR-LS-003: Loyalty Effects on Resource Production
- Resource production at a system scales with controlling faction's loyalty:
  - Loyalty 80–100: 100% production
  - Loyalty 60–79: 85% production
  - Loyalty 40–59: 70% production
  - Loyalty < 40 (Neutral): 50% production; production goes to no faction
- Production scaling applies to both Credits and Materials generated per turn
- Influence generation is not affected by system loyalty (it is a per-faction aggregate)

### FR-LS-004: Loyalty-Driven Defection
- If a controlled system's loyalty falls below 30, a defection check fires at end of Maintenance Phase:
  - Roll: seeded random [1, 100]
  - If roll ≤ `(30 - current_loyalty) × 3`, the system defects
  - Defection: system control transfers to Neutral; all controlling faction's facilities at the system take 1 HP damage
- Defection notification is sent to the losing faction: "[System] has defected!"
- After defection, the system starts at Neutral; any faction may re-establish control through loyalty-building

### FR-LS-005: Loyalty Floor and Ceiling
- Loyalty for the controlling faction cannot be reduced below 10 by passive drift alone (military actions can still reduce it below 10)
- Loyalty for any faction is always clamped to [0, 100]
- Loyalty of 100 means absolute allegiance; no defection risk, maximum production, and provides +1 troop generation per turn

### FR-LS-006: Loyalty Visualization
- The galaxy map shall optionally display a loyalty overlay (see UI & Controls spec 034)
- In the loyalty overlay, system colors shade from neutral grey to faction color based on loyalty value
- The System Detail panel always shows loyalty values for all factions with labeled bars
- Loyalty trend (🔼 increasing / 🔽 decreasing / ➡ stable) is shown next to each loyalty bar

### FR-LS-007: Loyalty Persistence
- All per-system loyalty values are serialized in the game save payload
- Loyalty values must be integers in [0, 100]; floating values are truncated on save

## Constraints

- Passive loyalty drift must apply before resource production is calculated in the Maintenance Phase
- Defection check must use the same SeededRandom utility as other probability rolls
- Loyalty calculation must support up to 3 simultaneous factions without code changes

## Acceptance Criteria

- [x] Controlling faction is correctly determined as the faction with loyalty ≥ 40 and the highest value
- [x] Passive loyalty drift of +2 / -1 applies correctly each turn
- [x] Military occupation correctly applies -3 / +1 drift instead of normal drift
- [x] Resource production scales correctly per loyalty tier (100%, 85%, 70%, 50%)
- [x] Defection check triggers at loyalty < 30 and fires correctly based on seeded roll
- [x] System transfers to Neutral and facilities take 1 HP on defection
- [x] Loyalty floor of 10 prevents passive drift from reducing below 10 (military actions exempt)
- [x] Loyalty overlay on galaxy map shades correctly by faction color intensity
- [x] System Detail panel shows loyalty bars with trend indicators for all factions
- [x] Loyalty state survives save-load cycle without data loss or truncation issues
