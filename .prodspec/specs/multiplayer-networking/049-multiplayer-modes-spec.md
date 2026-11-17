# Multiplayer Modes

## Overview

Branded Galaxy supports three multiplayer formats: **Hot-Seat** (multiple players sharing one device, taking turns), **Local Network** (players on separate devices on the same LAN), and **Online Async** (players submitting turns independently over the internet). Phase 1 ships Hot-Seat only; Local Network and Online Async are Phase 2+. This spec covers the design of all three modes and the Phase 1 implementation scope.

## Requirements

### FR-MP-001: Mode Selection at Game Setup
- Multiplayer mode is selected on the Game Mode Selection screen (spec 037, FR-GMS-001)
- Available options:
  - **Solo vs AI**: 1 human + 1–2 AI opponents (Phase 1 live)
  - **Hot-Seat**: 2–3 human players on one device (Phase 1 live)
  - **Local Network**: 2–3 players on separate devices, same LAN (Coming Soon)
  - **Online Async**: 2–3 players with async turn submission (Coming Soon)
- Local Network and Online Async show "Coming Soon" labels; selection is blocked

### FR-MP-002: Hot-Seat Mode
- In Hot-Seat, each human player takes their Action Phase turn sequentially on the same device
- At the start of each player's Action Phase turn:
  - An interstitial "Pass Device" screen is shown: "[Player Name]'s Turn — Pass the device"
  - The screen obscures all game state (blank or logo-only screen) to prevent the outgoing player from seeing the incoming player's position
  - A "I'm Ready" button on the interstitial dismisses it and begins the player's Action Phase
- After the last human player's Action Phase, AI factions resolve simultaneously, then the Resolution and Maintenance Phases run normally
- Each human player submits their orders before passing to the next player; orders are queued and resolved simultaneously at the end of the turn (simultaneous resolution per spec 029)

### FR-MP-003: Hot-Seat Player Identity
- Each player selects their faction during Game Setup (spec 039)
- Player names may be set in Game Setup (optional; default "Player 1", "Player 2", etc.)
- Player names are shown on the Pass Device interstitial and in all Turn Summary references

### FR-MP-004: Local Network Mode (Phase 2 — Out of Scope)
- Each player connects via a host/join lobby on the same LAN
- State is synchronized through the host device
- Turn submission is simultaneous; the host resolves and broadcasts the updated state
- Full spec is deferred to Phase 2 (spec 050 covers Network Features)

### FR-MP-005: Online Async Mode (Phase 2 — Out of Scope)
- Players submit their Action Phase orders independently; the server resolves when all players have submitted
- Players are notified (email or push) when it is their turn to submit
- Full spec is deferred to Phase 2 (spec 050 covers Network Features)

### FR-MP-006: AI Fill-In
- In Hot-Seat with 2 human players and 3 factions, the third faction is AI-controlled
- AI faction acts after all human Action Phases, using the AI strategy engine (spec 032)
- AI faction does not require a Pass Device interstitial

## Constraints

- Hot-Seat interstitial must fully hide game state; no game UI elements should be visible behind it
- The "Pass Device" interstitial is shown at the beginning of each human player's Action Phase, not the end
- Hot-Seat must support 2-player and 3-player configurations

## Acceptance Criteria

- [x] Game Mode Selection screen shows Hot-Seat as a live option
- [x] Local Network and Online Async show "Coming Soon" and cannot be selected
- [x] Hot-Seat mode sequences human players through Action Phase in turn order
- [x] Pass Device interstitial fully obscures game state until dismissed
- [x] "I'm Ready" button correctly starts the next player's Action Phase
- [x] Player names appear on the interstitial and in Turn Summary references
- [x] AI faction acts correctly after all human Action Phases in Hot-Seat
- [x] Simultaneous order resolution applies to all human orders as if submitted together
