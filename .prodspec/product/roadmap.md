# Branded Galaxy - Planned Work

> Unimplemented features and known gaps. For the full feature record see [feature-catalog.md](feature-catalog.md).

**Last Updated**: March 10, 2026

---

## Planned Features

### Hybrid Async/Sync Mode System  `specs: 055, 058–061`

Refactor from pure turn-based to a hybrid model supporting both async (turn-based) and sync (realtime tick-based) modes, switchable per session.

| Spec | Feature | Link | Notes |
|------|---------|------|-------|
| 055 | Simulation Determinism | [spec](../specs/hybrid-async-sync-mode/055-simulation-determinism-spec.md) | Prerequisite for lockstep sync mode — eliminate `Math.random()` / `Date.now()` from all simulation paths |
| 058 | Sync Mode Tick Loop | [spec](../specs/hybrid-async-sync-mode/058-sync-mode-tick-loop-spec.md) | Depends on 055 + 061; deterministic lockstep host `setInterval` scheduler |
| 059 | Snapshots & State Reconciliation | [spec](../specs/hybrid-async-sync-mode/059-snapshots-reconciliation-spec.md) | Depends on 056 (done) + 058 |
| 060 | Async Flow & Mode Switching UI | [spec](../specs/hybrid-async-sync-mode/060-async-flow-mode-switching-spec.md) | Depends on 057 (done) + 058 |
| 061 | Timescale Conversion Layer | [spec](../specs/hybrid-async-sync-mode/061-timescale-conversion-layer-spec.md) | `TICKS_PER_TURN` bridge; prerequisite for 058 and 060 |

---

## Known Gaps

Incomplete acceptance criteria in otherwise-implemented features.

| Feature | Spec | Gap |
|---------|------|-----|
| AI Actions `033` | [spec](../specs/ai-opponents/033-ai-actions-spec.md) | AI never queues facility builds — AI factions never develop system infrastructure |
| Save Game `040` | [spec](../specs/save-load-system/040-save-game-spec.md) | `constructionStateManager` not serialized — building queues, facility HP, and ground troops lost on reload |
| Save Game `040` | [spec](../specs/save-load-system/040-save-game-spec.md) | `missionStateManager` not serialized — active mission queue, mission log, revolts, and stat penalties lost on reload |
| Save Game `040` | [spec](../specs/save-load-system/040-save-game-spec.md) | `loyaltyStateManager` transient state (timed bonuses, diplomatic holds, action history) not serialized |
| Event System `045` | [spec](../specs/event-system/045-event-system-spec.md) | Event pool too thin — 12 events recur frequently in long games; no faction-specific random events |
| Visual Style `051` | [spec](../specs/audio-visual-presentation/051-visual-style-spec.md) | No animated fleet movement along hyperspace routes; no dedicated combat or invasion animations |
