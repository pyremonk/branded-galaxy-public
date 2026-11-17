# Combat Modes

## Overview

Branded Galaxy supports two modes for resolving fleet engagements: **Auto-Resolve** (Phase 1 default) and **Tactical Combat** (Phase 2 optional). This spec defines how each mode is selected, the player experience for each, and the constraints for the Phase 1 rollout where Tactical Combat is locked behind a "Coming Soon" gate.

## Requirements

### FR-CM-001: Mode Selection
- Combat mode is a global game configuration setting, chosen during Galaxy Setup (spec 039) before game start
- Available options:
  - **Auto-Resolve** (default): All fleet engagements are calculated instantly using the auto-resolve formula (spec 015)
  - **Tactical Combat** (Coming Soon – Phase 2): Replaces auto-resolve with an interactive tactical layer
- In Phase 1, Tactical Combat appears in the settings UI as a grayed-out option with a "Coming Soon" label; selecting it is not permitted
- The setting is locked after game start (cannot be changed mid-game)

### FR-CM-002: Auto-Resolve Mode
- When two opposing fleets occupy the same system at the end of the Fleet Arrivals step in the Resolution Phase (spec 028):
  - Combat is resolved automatically using the formula in spec 015
  - A Combat Report is generated (see FR-CM-004)
  - The Resolution Phase continues without interruption
- No player interaction is required during combat in Auto-Resolve mode

### FR-CM-003: Tactical Combat Mode (Phase 2 — Out of Scope for Phase 1)
- When two opposing fleets meet, the game pauses and opens the Tactical Combat interface
- Each player (or AI for AI-controlled factions) issues orders for their ships
- Orders are submitted simultaneously; the round resolves; repeat until one side is eliminated or retreats
- Full spec for Tactical Combat mechanics is in specs 047 and 048
- **This mode is not implemented in Phase 1**

### FR-CM-004: Combat Report
- Regardless of mode, every fleet engagement generates a Combat Report object stored in `gameState.combatLog[]`:
```json
{
  "turnNumber": 5,
  "systemId": "string",
  "attackerFactionId": "string",
  "defenderFactionId": "string",
  "attackerPower": 120,
  "defenderPower": 80,
  "rounds": 4,
  "outcome": "attacker_wins | defender_wins | draw",
  "attackerLosses": 2,
  "defenderLosses": 3,
  "mode": "auto_resolve | tactical"
}
```
- The Combat Report is accessible in the Turn Summary (spec 036) and the System Detail panel for the system where combat occurred

### FR-CM-005: Combat Notifications
- After combat resolves, affected factions receive notifications:
  - Winner: a `warning`-tier notification "Victory at [system]: [outcome summary]"
  - Loser: a `critical`-tier notification "Defeat at [system]: [outcome summary]"
- The notification includes a "View Report" link opening the Combat Report detail view

## Constraints

- Auto-Resolve must always be available; Tactical Combat is strictly Phase 2
- Combat mode must be locked after game start (not editable via pause menu)
- Combat Reports must be serialized in save data

## Acceptance Criteria

- [x] Auto-Resolve is available and selected by default in Galaxy Setup
- [x] Tactical Combat option is visible but disabled with a "Coming Soon" label
- [x] Auto-Resolve processes fleet engagements without player interaction
- [x] Combat Report is generated for every engagement with all required fields
- [x] Combat Reports are accessible from Turn Summary and System Detail panel
- [x] Winner and Loser notifications fire with correct severity tiers after combat
- [x] Combat mode setting is locked after game start
