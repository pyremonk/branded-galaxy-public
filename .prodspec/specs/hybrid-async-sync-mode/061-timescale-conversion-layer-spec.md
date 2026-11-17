# 061 – Timescale Conversion Layer

## Overview

Define how existing turn-based durations map to the tick-based timescale used in sync mode. This spec adopts the **turn-equivalent model**: all game durations remain internally expressed in "turns"; a constant `TICKS_PER_TURN` converts between ticks and turns during sync mode. No config files or duration fields are modified — the conversion happens at the orchestration layer.

## Depends On

- 058 (Sync Mode Tick Loop) — defines the tick loop that consumes this conversion.
- 055 (Simulation Determinism) — all conversion math must be deterministic.

## Background

### The Problem

Every game system uses "turns" as its time unit — construction takes N turns, fleets arrive in N turns, research completes in N turns, loyalty drifts +2 per turn, etc. The sync mode tick loop (spec 058) introduces a second time unit: **ticks**. Without a conversion layer, there are two bad options:

1. **1 tick = 1 turn**: Sync mode runs at the same granularity as async — no benefit to realtime play; feels identical to rapidly clicking End Turn.
2. **Rewrite all durations**: Touch every config file are and state manager to use abstract time units — massive scope, high regression risk.

### The Solution: Turn-Equivalent Model

Define `TICKS_PER_TURN` (default: 10). In sync mode, the game accumulates ticks. When the tick counter reaches a turn boundary (`tickNumber % TICKS_PER_TURN === 0`), all per-turn systems fire exactly as they do today. Between turn boundaries, players issue commands (fleet orders, mission assignments, etc.) that take effect at the next turn boundary.

This gives sync mode a meaningful realtime feel — players see a countdown to the next turn resolution, can issue commands in real time, and watch the galaxy evolve — without changing any existing duration values.

## Requirements

### FR-TCL-001: `TICKS_PER_TURN` Constant

```js
// core/timescale-config.js
export const TICKS_PER_TURN = 10;
```

- Configurable at game setup (range: 5–30, default: 10).
- Stored in the `games` table (add column `ticks_per_turn`, integer, default 10).
- Once a game starts, `TICKS_PER_TURN` is fixed for that game (no mid-game changes).
- At 1 Hz tick rate and `TICKS_PER_TURN = 10`, one game turn = 10 seconds wall-clock.

### FR-TCL-002: Tick Accumulator

`SyncTickManager` (spec 058) maintains a tick counter. The timescale layer adds:

```js
// Returns the current turn number derived from ticks
getCurrentTurnFromTicks(tickNumber, ticksPerTurn) {
  return Math.floor(tickNumber / ticksPerTurn) + baseTurn;
}

// Returns true on the tick that completes a turn boundary
isTurnBoundary(tickNumber, ticksPerTurn) {
  return tickNumber > 0 && tickNumber % ticksPerTurn === 0;
}

// Returns ticks remaining until next turn boundary
ticksUntilNextTurn(tickNumber, ticksPerTurn) {
  return ticksPerTurn - (tickNumber % ticksPerTurn);
}
```

`baseTurn` is the `games.current_turn` value when sync mode started — ensures turn numbering is continuous across async/sync transitions.

### FR-TCL-003: Turn Boundary Resolution

When `isTurnBoundary(tickNumber, ticksPerTurn)` returns `true`, the host triggers the full turn resolution pipeline:

1. Run `TurnResolutionEngine.runPreInvasionPhase()` — fleet arrivals, space combat.
2. Handle invasion decisions (collected as commands during the preceding ticks).
3. Run `TurnResolutionEngine.runPostInvasionPhase()` — missions, construction, intel, events.
4. Run maintenance phase — loyalty drift, resource production, tech research, fleet production, victory checks.
5. Increment `games.current_turn`.

**Between turn boundaries**: only player commands are collected and queued. No resolution or maintenance runs. The game state is "frozen" from a simulation perspective — only the command queue grows.

### FR-TCL-004: Systems That Fire Per-Turn (No Changes Needed)

These systems already count down in turns. They fire once at each turn boundary, using the exact same code paths as async mode:

| System | Duration Fields | Tick At | Code Entry Point |
|---|---|---|---|
| **Construction** | `turnsRemaining` (build/upgrade/repair/demolish) | Turn boundary | `ConstructionStateManager.advanceAllQueues()` |
| **Fleet Production** | `turnsRemaining` per queue item | Turn boundary | `FleetStateManager.advanceProduction()` |
| **Fleet Movement** | `turnsRemaining` (direct), waypoint hop (lane) | Turn boundary | `FleetStateManager.resolveFleetArrivals()` |
| **Tech Research** | `turnsRemaining` per active project | Turn boundary | `TechResearchEngine.advanceResearch()` |
| **Missions** | `turnsRemaining` per active mission | Turn boundary | `MissionStateManager.advanceTurn()` |
| **Revolts** | `turnsRemaining` per revolt | Turn boundary | `MissionStateManager.advanceRevolts()` |
| **Stat Penalties** | `expiresOnTurn` | Turn boundary | `MissionStateManager.clearExpiredPenalties()` |
| **Loyalty Drift** | +2/−1/−3/+1 per turn | Turn boundary | `LoyaltyStateManager.applyPassiveDrift()` |
| **Timed Bonuses** | `turnsLeft` per bonus | Turn boundary | `LoyaltyStateManager.advanceTimedBonuses()` |
| **Diplomatic Holds** | `expiryTurn` | Turn boundary | `LoyaltyStateManager.processDiplomaticConversions()` |
| **Resource Production** | Per-turn income formulas | Turn boundary | `ResourceEngine.calculateSystemProduction()` |
| **Fleet Maintenance** | Per-ship credits/turn | Turn boundary | `FleetStateManager.deductMaintenance()` |
| **Ground Troops** | `troopsPerTurn` | Turn boundary | `MainStage._runMaintenancePhase()` step 1b |
| **Intel Expiry** | `expiresOnTurn` | Turn boundary | `IntelStateManager.purgeExpired()` |
| **Event Cooldowns** | `EVENT_COOLDOWN_TURNS` (3 turns) | Turn boundary | `EventEngine` cooldown comparison |
| **Victory: Survival** | Turn counter comparison | Turn boundary | `VictoryProgressUpdater` |
| **Victory: Non-Aggression** | Consecutive turn counter | Turn boundary | `VictoryProgressUpdater.updatePeacefulVictory()` |
| **Victory: Discovery** | Per-turn probability roll | Turn boundary | `VictoryProgressUpdater` |
| **Captured Characters** | `turnsInCaptivity++`, exchange `turnsRemaining--` | Turn boundary | `CharacterStateManager.tickCapturedCounters()` |

**Key insight**: Because every per-turn system fires at the turn boundary and uses the same decrement patterns as today, **zero changes** are needed in any state manager, engine, or config file.

### FR-TCL-005: Command Queuing Between Boundaries

During the ticks between turn boundaries, players (and AI) issue commands that are **queued** for the next turn boundary:

| Command Type | When Issued | When Applied |
|---|---|---|
| Fleet movement order | Any tick | Next turn boundary (resolution step 1) |
| Mission assignment | Any tick | Next turn boundary (resolution step 4) |
| Construction queue add | Any tick | Next turn boundary (immediate queue addition, first build tick at following boundary) |
| Diplomatic action | Any tick | Next turn boundary (resolution step 6) |
| Tech research start | Any tick | Next turn boundary (first research tick at following boundary) |
| Invasion decision | Between pre/post invasion | Same turn boundary (within resolution sequence) |

Commands are stored in the per-tick `AuthoritativeInputBundle` and accumulated in a `pendingTurnOrders` list until the turn boundary fires.

### FR-TCL-006: HUD Turn Progress Indicator

During sync mode, the HUD shows:

```
Turn 14 — Next turn in 7 ticks (7s)
[======----] 30%
```

- A progress bar from 0% to 100% filling across `TICKS_PER_TURN` ticks.
- Numeric countdown: "Next turn in N ticks" (and wall-clock seconds at current tick rate).
- At 100% the bar resets and the turn number increments.

This gives the player a clear sense of game pacing during realtime play.

### FR-TCL-007: Async Mode — No Conversion

In async mode, there is no tick counter and no conversion layer. One "End Turn" click = one full turn cycle. The timescale layer is only active during sync mode.

### FR-TCL-008: Mode Transition Continuity

When switching modes mid-game:

**Async → Sync**:
- `baseTurn = games.current_turn` (the last completed turn).
- Tick counter starts at 0.
- First turn boundary at tick `TICKS_PER_TURN`.
- Any in-progress turn orders from the async Action Phase are carried forward as pending commands.

**Sync → Async**:
- If mid-turn (not at a boundary): pending commands are **discarded** OR auto-submitted as the player's async turn orders (configurable).
- `games.current_turn` is set to the last completed turn boundary's number.
- No partial turn state leaks into async mode.

### FR-TCL-009: Speed × Timescale Interaction

The `ticksPerSecond` (1–4 Hz) and `TICKS_PER_TURN` (5–30) interact to determine wall-clock time per turn:

| ticksPerSecond | TICKS_PER_TURN | Seconds per Turn |
|---|---|---|
| 1 Hz | 10 | 10s |
| 2 Hz | 10 | 5s |
| 4 Hz | 10 | 2.5s |
| 1 Hz | 20 | 20s |
| 1 Hz | 5 | 5s |

The Session Panel (spec 060) should display "~Ns per turn" calculated from these values so players understand the pacing.

### FR-TCL-010: `timePerTick` Redefinition

The `games.time_per_tick` field (defined in spec 056) is **repurposed**: it is no longer an abstract "game time units" value. Instead, it is derived:

```js
timePerTick = 1 / TICKS_PER_TURN  // fraction of a turn per tick
```

This ensures `timePerTick * TICKS_PER_TURN === 1 turn`, keeping the conversion exact. The field remains in the schema for future use if continuous time is ever adopted (approach 2), but for now it is a derived value.

## Config Constants

New file: `core/timescale-config.js`

```js
export const DEFAULT_TICKS_PER_TURN = 10;
export const MIN_TICKS_PER_TURN = 5;
export const MAX_TICKS_PER_TURN = 30;
```

## Constraints

- **No config file changes**: All existing `buildTime`, `productionTime`, `cost.turns`, `duration`, drift constants, maintenance costs, etc. remain unchanged.
- **No state manager changes**: All `turnsRemaining--` and `expiresOnTurn` comparisons remain in existing code. The conversion layer is purely at the orchestration level (tick loop deciding when to trigger the turn pipeline).
- **Integer arithmetic only**: `tickNumber % TICKS_PER_TURN` is integer modulo — no floating-point conversion issues.
- **`TICKS_PER_TURN` is fixed per game**: Changing it mid-game would desynchronize in-progress durations. It can only be set at game creation.

## Acceptance Criteria

- [ ] `TICKS_PER_TURN` defaults to 10 and is configurable at game setup (5–30 range).
- [ ] During sync mode, full turn resolution fires exactly once every `TICKS_PER_TURN` ticks.
- [ ] Construction, research, fleet movement, missions, loyalty, and all other per-turn systems advance correctly at turn boundaries — same behavior as async mode.
- [ ] Between turn boundaries, player commands are queued and do not trigger resolution.
- [ ] HUD progress bar counts down to next turn boundary accurately.
- [ ] Async → sync transition starts tick counter at 0 with correct `baseTurn`.
- [ ] Sync → async transition preserves the correct turn number with no partial-turn leakage.
- [ ] `ticksPerSecond` and `TICKS_PER_TURN` combine to produce the expected wall-clock turn duration.
- [ ] No existing config files or state manager code is modified.
- [ ] No changes to save file format.

## Files to Create / Modify

- `core/timescale-config.js` — **new** (constants and utility functions)
- `core/sync-tick-manager.js` — integrate turn boundary detection and resolution trigger
- `engine/main-stage.js` — wire turn boundary events to existing resolution/maintenance pipeline
- `src/components/SyncTickHUD.jsx` — add turn progress bar and countdown
- `src/components/SessionPanel.jsx` — display "~Ns per turn" pacing info
- `supabase/migrations/{timestamp}_ticks_per_turn_column.sql` — add `ticks_per_turn` to `games` table

## Relationship to Other Specs

- **Depends on**: 058 (Sync Tick Loop), 055 (Determinism)
- **Related**: 028 (Turn Structure) — defines the 3-phase turn pipeline this spec triggers at boundaries
- **Related**: 060 (Mode Switching UI) — HUD elements and game setup configuration
- **Related**: 056 (Schema) — adds column to `games` table
- **Future**: If continuous time (approach 2) is ever adopted, this spec would be superseded — all duration fields would be converted to abstract time units and `TICKS_PER_TURN` would be replaced with a continuous accumulator.
