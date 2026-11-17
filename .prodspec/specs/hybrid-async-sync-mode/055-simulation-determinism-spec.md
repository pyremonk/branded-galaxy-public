# 055 – Simulation Determinism Hardening

## Overview

Before any sync-mode multiplayer can work, every code path executed during turn resolution and game-state mutation must produce **identical results on every client given identical inputs**. This spec catalogs all known non-deterministic call sites, defines the remediation pattern, and establishes a determinism contract that all future game-logic code must follow.

This is a **prerequisite spec** — no other hybrid async/sync spec can ship without this work being complete.

## Background

The codebase already uses `SeededRandom` in most simulation paths (combat, events, missions, galaxy generation). However, an audit reveals **6 files that still call `Math.random()` or `Date.now()` in simulation code**, plus a gap in `SeededRandom` itself (no state serialization).

## Requirements

### FR-DET-001: Eliminate `Math.random()` from Simulation Paths

Every `Math.random()` call in game-logic code must be replaced with a `SeededRandom` instance seeded deterministically from turn state.

| File | Line(s) | Current Usage | Fix |
|---|---|---|---|
| `core/ai-controller.js` | 181 | AI scoring noise | Accept `rng` param; seed from `turn + factionId + 'ai'` |
| `core/mission-engine.js` | 209 | Counter-intel roll | Accept `rng` param; seed from `turn + missionId` |
| `core/character-capture-engine.js` | 207 | Fallback candidate pick | Enforce that `rng` param is always provided at call sites; remove fallback |
| `core/victory-progress-updater.js` | 181 | Secret base discovery roll | Accept `rng` param; seed from `turn + factionId + 'victory'` |
| `core/intel-engine.js` | 341–347 | Fake intel detail generation | Accept `rng` param; seed from `turn + systemId + 'intel'` |
| `core/network-session-manager.js` | 19 | Game code generation | **No fix needed** — not a simulation path |

### FR-DET-002: Eliminate `Date.now()` from Entity ID Generation

Entity IDs that diverge across clients break state comparison. Replace with a deterministic ID scheme.

| File | Line | Current Usage | Fix |
|---|---|---|---|
| `core/fleet-state-manager.js` | 794 | Production ID: `` `prod-${Date.now()}-${Math.random()}` `` | Use `prod-${gameId}-t${turn}-${factionId}-${sequenceCounter}` |
| `core/character-state-manager.js` | 478 | Recruit ID: `` `${factionId}-recruit-${Date.now()}-${...}` `` | Use `${factionId}-recruit-t${turn}-${sequenceCounter}` |
| `core/character-state-manager.js` | 558 | Exchange proposal ID: `` `exchange-${Date.now()}` `` | Use `exchange-t${turn}-${fromFaction}-${toFaction}` |

**Sequence counter**: Each state manager maintains an internal `_idSeq` integer that increments per entity created within a turn. The counter resets to 0 at the start of each turn. Since resolution applies in a deterministic order (spec 028/029), the counter produces the same IDs on every client.

### FR-DET-003: Deterministic ID Generator Utility

Create `core/deterministic-id.js` exporting:

```js
/**
 * @param {string} prefix  - Entity type prefix (e.g. 'prod', 'recruit', 'exchange')
 * @param {number} turn    - Current turn number
 * @param {string} context - Additional deterministic context (factionId, systemId, etc.)
 * @param {number} seq     - Per-turn sequence counter
 * @returns {string}       - e.g. 'prod-t5-faction_a-0'
 */
export function makeId(prefix, turn, context, seq) {
  return `${prefix}-t${turn}-${context}-${seq}`;
}
```

All entity ID generation in simulation code must use this function.

### FR-DET-004: `SeededRandom` State Serialization

Extend `core/seeded-random.js` with:

```js
getState()   → number   // returns internal seed state
setState(s)            // restores internal seed state from a previous getState()
```

This allows snapshot/restore of RNG state for reconciliation (spec 060). Currently each engine creates throwaway `SeededRandom` instances per-event using structured seeds, which is already deterministic — this requirement is a safety net for future use.

### FR-DET-005: Determinism Contract

All code executed during **Resolution Phase** and **Maintenance Phase** (per spec 028) must obey:

1. **No `Math.random()`** — use `SeededRandom` with a turn-derived seed.
2. **No `Date.now()` or `new Date()`** — use turn number for ordering; use `makeId()` for IDs.
3. **No `Object.keys()` iteration over unsorted maps** where order affects outcome — sort keys first or use `Map` with insertion-order guarantees.
4. **No floating-point-sensitive paths** — all game values are integers or use `Math.floor()`/`Math.round()` immediately after computation.
5. **All RNG instances are seeded from**: `turnNumber`, `systemId`, `factionId`, `missionId`, or other game-state identifiers — never wall-clock or user-specific values.

### FR-DET-006: `Date.now()` Allowlist

The following `Date.now()` usages are **not** in simulation paths and do not require changes:

| File | Line | Usage | Reason |
|---|---|---|---|
| `core/resource-engine.js` | 393 | Transaction log timestamp | Logging only, not affecting game state |
| `engine/main-stage.js` | 3388 | `_startTime` for game duration | UI metric only |
| `core/combat-engine.js` | 183 | Fallback seed when `rng` is null | Normal path always provides seed; add assertion to catch misuse |
| `src/components/NetworkLobby.jsx` | 64 | Chat message key | React list key, not simulation |

## Constraints

- No changes to the save file format — `SaveStateManager` must remain compatible with existing saves.
- `SeededRandom` API changes must be backward-compatible (existing constructor and `.next()` / `.nextInt()` / `.nextFloat()` remain unchanged).
- Each `Math.random()` replacement must use a **unique** seed derivation within the same turn to avoid correlated random sequences across different systems.

## Acceptance Criteria

- [ ] `grep -r "Math.random" core/ engine/ ui/` returns zero matches in simulation-path files (allowlist: `network-session-manager.js`).
- [ ] `grep -r "Date.now()" core/ engine/ ui/` returns zero matches in entity-ID generation code (allowlist per FR-DET-006).
- [ ] `deterministic-id.js` exists and is used by all entity ID generation in `fleet-state-manager.js`, `character-state-manager.js`.
- [ ] `SeededRandom` exposes `getState()` and `setState()` methods with a passing round-trip test.
- [ ] Two clients starting from the same game state and applying the same turn orders produce byte-identical serialized state after resolution.
- [ ] No existing tests or manual gameplay flows are broken.

## Files to Create / Modify

- `core/deterministic-id.js` — **new**
- `core/seeded-random.js` — extend with `getState()` / `setState()`
- `core/ai-controller.js` — replace `Math.random()` with seeded RNG
- `core/mission-engine.js` — replace `Math.random()` with seeded RNG
- `core/character-capture-engine.js` — enforce `rng` param at all call sites
- `core/victory-progress-updater.js` — replace `Math.random()` with seeded RNG
- `core/intel-engine.js` — replace `Math.random()` with seeded RNG
- `core/fleet-state-manager.js` — replace `Date.now()` ID with `makeId()`
- `core/character-state-manager.js` — replace `Date.now()` IDs with `makeId()`
- `core/combat-engine.js` — add assertion that `rng` param is non-null

## Relationship to Other Specs

- **Blocks**: 058 (Sync Mode Tick Loop) — sync mode is undefined without deterministic simulation.
- **Blocks**: 059 (Snapshots & Reconciliation) — snapshot comparison requires deterministic state.
- **Related**: 028 (Turn Structure) — defines the resolution order this spec depends on.
- **Related**: 029 (Turn Order) — defines command ordering guarantees.
