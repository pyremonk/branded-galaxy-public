-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Turn Timer Columns
-- Spec: 060-async-flow-mode-switching-spec.md (FR-ATF-004)
-- Date: 2026-02-28
--
-- Adds optional turn timer configuration to the games table:
--   turn_timer_minutes    – 0 = disabled (default), or positive integer (5/10/30/60/1440)
--   turn_timer_started_at – set when the first player submits orders for a turn
-- ═══════════════════════════════════════════════════════════════════════════════

alter table games
  add column if not exists turn_timer_minutes    integer     not null default 0,
  add column if not exists turn_timer_started_at timestamptz default null;

comment on column games.turn_timer_minutes    is 'Per-turn timer in minutes. 0 = disabled.';
comment on column games.turn_timer_started_at is 'UTC timestamp when the turn timer started (first order submitted). NULL when timer inactive.';
