# Character Capture & Rescue

## Overview

The Character Capture & Rescue system handles the lifecycle of captured characters — from the moment a character is taken prisoner through to their rescue or execution. Capture adds high-stakes tension to mission and fleet decisions: losing a key character can cripple a faction's operational capacity, while successful rescues reward bold plays.

Captured characters may also leak intelligence over time, giving their captors partial visibility into the opposing faction's plans. The rescue mission provides a dedicated path to recover captured characters, balancing the risk-reward of committing another character to a dangerous extraction.

## Requirements

### FR-CCR-001: Capture Trigger Conditions
- A character may be captured in three circumstances:
  1. **Critical Failure on a Mission**: Capture risk rolls individually for each character assigned to a critically failed mission (see Mission Success Calculation spec 011, FR-MSC-005)
  2. **Fleet Destruction**: When a fleet is destroyed in combat, the assigned fleet commander rolls for capture
  3. **System Invasion**: Characters stationed at a facility in a system that is successfully invaded roll for capture
- Capture roll is independent per character; multiple characters may be captured in the same event

### FR-CCR-002: Capture Probability
- For each character facing a capture roll, the base capture probability is:
  - **Critical Mission Failure**: 50% base chance
  - **Fleet Destruction**: 30% base chance (higher combat chars have a chance to escape)
  - **System Invasion**: 40% base chance
- Modifiers applied to capture probability:
  - `-5%` per point of Combat stat above 5 (evasion capability)
  - `+10%` if the opposing faction has an active spy network in the involved system
  - `-10%` if the character has the `covert-ops`, `guerrilla`, or `assassin` specialization
- Final probability clamped to [0.05, 0.90]
- If the capture roll fails (character escapes), they return to **Available** at the nearest friendly system

### FR-CCR-003: Captured Character State
- Captured characters transition to **Captured** status
- Captured characters have their `locationSystemId` set to the capturing faction's system where they are held
- A captured character cannot be assigned to any mission, fleet, or facility
- Captured characters do not gain XP
- The capturing faction receives a notification: `"[Character Name] captured by [Faction]"`
- The owning faction receives a notification: `"[Character Name] has been captured and is being held at [System Name]"`

### FR-CCR-004: Intelligence Leakage
- Captured characters leak intelligence to their captors each turn they remain captured
- Intel leak type is based on the captured character's highest stat:
  - **Combat or Leadership** → Reveals one random fleet position belonging to the character's faction
  - **Espionage** → Reveals one active or recently completed mission type and target
  - **Diplomacy** → Reveals one system with pending loyalty-change operations
  - **Research** → Reveals the faction's currently active research technology name
- Intel leaks fire once per turn at turn resolution
- All leaked intelligence is added to the capturing faction's intel report log
- Intelligence revealed this way is treated as confirmed intel (not rumor-grade)

### FR-CCR-005: Interrogation (Accelerated Leakage)
- Once per turn, the capturing faction may activate **Interrogation** on a held character
- Interrogation must be approved by the player (an active choice, not automatic)
- Interrogation immediately triggers an additional intel leak of 2 random items (instead of the normal 1 per turn)
- After a successful interrogation, the character's **Espionage** stat (as held by the captor's calculation) is treated as exhausted for the rest of the turn (no further bonus to captor operations)
- Interrogation does not directly cause character death (see FR-CCR-007)

### FR-CCR-006: Rescue Mission
- A Rescue mission is available whenever the player's faction has at least one captured character
- Rescue mission parameters:
  - **Target**: The system where the captured character is held
  - **Assigned Character**: One character from the rescuing faction (must be Available)
  - **Duration**: 1 turn
- Rescue success is calculated by the Mission Success Calculation system (spec 011) with:
  - Mission type: `Rescue`
  - Primary stat: Combat (of rescuing character)
  - Secondary stat: Espionage (of rescuing character)
  - Opposition resistance: System resistance + 2 (heightened security for prisoners)
- **Rescue success**: Captured character immediately returns to **Available** at the rescue system; both characters receive +20 XP
- **Rescue failure**: Rescue operation fails; rescuing character has a normal capture probability roll (not critical)
- **Rescue critical failure**: Rescuing character is captured; both characters now held at that system

### FR-CCR-007: Character Execution
- The capturing faction may execute a held character as a deliberate action
- Execution requires confirmation (irreversible action)
- Upon execution:
  - Character status transitions to **Dead** permanently
  - Character is removed from the active roster
  - The owning faction receives a high-severity notification: `"[Character Name] has been executed by [Faction]"`
  - The owning faction receives a morale/influence penalty: -50 influence
- Execution of a high-stat character (average stat ≥ 7) provides the capturing faction: +20 influence (show of strength)
- AI opponents weigh execution against potential for continued intel leakage

### FR-CCR-008: Prisoner Exchange (Diplomatic Option)
- If two factions both hold prisoners, either faction may propose a prisoner exchange
- Exchange proposal: "Release [Character A] in exchange for [Character B]"
- Both characters must currently be Captured by the respective opposing faction
- If the exchange is accepted, both characters transition to **Available** simultaneously
- Prisoner exchanges are a diplomatic action (no character assignment required)
- Exchange proposals remain open for 1 turn; if not accepted, they expire

### FR-CCR-009: Capture & Rescue UI
- The Character Roster panel shall visually distinguish captured characters:
  - Red border or "CAPTURED" badge on character portrait
  - Tooltip shows holding faction and system name
- A dedicated **Prisoners** section appears in the panel when any characters are captured
- Each captured character entry shows:
  - Character name and portrait
  - Holding system
  - Turns captured (counter)
  - "Initiate Rescue" button → opens mission planning pre-filled with Rescue mission type and character
- Intel leaks from captured characters are surfaced in the Intel Report log with a "Source: Prisoner" tag

### FR-CCR-010: Data Persistence
- Capture state (captured characters, holding faction, holding system, turns captured) must be serialized in the game save
- Prisoner exchange proposals in flight must also be included in save state
- Character death from execution must persist; dead characters must not resurrect on load

## Constraints

- Capture probability must always be in [0.05, 0.90]; a character is never guaranteed captured or guaranteed to escape
- Interrogation is an active choice; it must never trigger automatically without player input
- Execution is irreversible; the UI must require explicit two-step confirmation
- The system must handle the edge case where both rescuer and target are captured (both remain Captured)
- Capture, rescue, and execution events must fire CustomEvents for UI notification consistency

## Acceptance Criteria

- [x] Critical mission failure triggers an independent capture roll for each assigned character
- [x] Character transitions correctly to Captured status with locationSystemId set to enemy system
- [x] Intel leaks fire once per turn and surface in the capturing faction's intel log
- [x] Interrogation triggers 2 intel items and is only available once per character per turn
- [x] Rescue mission uses Combat (primary) + Espionage (secondary) for probability calculation
- [x] Successful rescue returns character to Available with +20 XP for both characters
- [x] Critical rescue failure captures the rescuing character as well
- [x] Execution transitions character to Dead permanently and fires a high-severity notification
- [x] Execution of a high-stat character grants +20 influence to the capturing faction
- [ ] Prisoner exchange correctly swaps both characters to Available simultaneously when accepted
- [x] Roster panel shows CAPTURED badge and "Initiate Rescue" button for each captured character
- [x] All capture/rescue/execution state survives a save-load cycle without data loss
