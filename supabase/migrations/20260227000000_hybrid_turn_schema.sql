-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Hybrid Async/Sync Turn Schema
-- Spec: 056-game-session-presence-spec.md
-- Date: 2026-02-27
--
-- Creates four new tables for hybrid async/sync game sessions:
--   games           – per-session pacing metadata (async vs sync)
--   turn_orders     – persisted per-player turn orders
--   game_state      – authoritative state per turn/tick
--   game_snapshots  – periodic host-written snapshots for reconciliation
--
-- Also creates a helper function is_game_participant(uuid) used by RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Helper: participant check ────────────────────────────────────────────────
-- Returns TRUE when the calling user is listed in the network_sessions.players
-- JSONB array for the session that owns the given game row.
create or replace function is_game_participant(p_game_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from games g
    join network_sessions ns on ns.id = g.session_id
    where g.id = p_game_id
      and ns.players @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
  );
$$;

-- ── games ─────────────────────────────────────────────────────────────────────
-- One row per game session. Tracks pacing mode, current turn/tick, and host.
create table if not exists games (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid references network_sessions not null,
  status           text not null default 'async'
                     check (status in ('async', 'sync')),
  current_turn     integer not null default 1,
  current_tick     integer,                                  -- null in async mode
  ticks_per_second numeric not null default 1.0,
  time_per_tick    numeric not null default 1.0,
  host_user_id     uuid,                                     -- null until sync mode starts
  created_at       timestamptz not null default now()
);

alter table games enable row level security;

create policy "games_select" on games
  for select using (is_game_participant(id));

create policy "games_insert" on games
  for insert with check (auth.role() = 'authenticated');

create policy "games_update" on games
  for update using (is_game_participant(id));

-- Enable Realtime so SessionPresenceManager receives postgres_changes
alter publication supabase_realtime add table games;

-- ── turn_orders ──────────────────────────────────────────────────────────────
-- Persisted per-player orders. Survives browser close (async mode).
create table if not exists turn_orders (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid references games not null,
  turn_number   integer not null,
  player_id     uuid references auth.users not null,
  orders        jsonb not null,
  submitted_at  timestamptz not null default now(),

  unique (game_id, turn_number, player_id)
);

alter table turn_orders enable row level security;

-- Players can only insert their own orders
create policy "turn_orders_insert" on turn_orders
  for insert with check (
    auth.uid() = player_id
    and is_game_participant(game_id)
  );

-- Any participant can read orders for their game
create policy "turn_orders_select" on turn_orders
  for select using (is_game_participant(game_id));

-- ── game_state ───────────────────────────────────────────────────────────────
-- Authoritative serialised state written by host or via RPC after resolution.
create table if not exists game_state (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid references games not null,
  turn_number   integer not null,
  tick_number   integer,                                     -- null in async mode
  state         jsonb not null,
  created_at    timestamptz not null default now()
);

alter table game_state enable row level security;

-- Any participant can read
create policy "game_state_select" on game_state
  for select using (is_game_participant(game_id));

-- Only the current host can write
create policy "game_state_insert" on game_state
  for insert with check (
    is_game_participant(game_id)
    and exists (
      select 1 from games
      where games.id = game_id
        and games.host_user_id = auth.uid()
    )
  );

create policy "game_state_update" on game_state
  for update using (
    is_game_participant(game_id)
    and exists (
      select 1 from games
      where games.id = game_id
        and games.host_user_id = auth.uid()
    )
  );

-- ── game_snapshots ───────────────────────────────────────────────────────────
-- Periodic snapshots for client reconciliation (spec 059).
create table if not exists game_snapshots (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid references games not null,
  tick_number   integer not null,
  turn_number   integer not null,
  state         jsonb not null,
  version       integer not null default 1,                  -- schema version for forward compat
  created_at    timestamptz not null default now()
);

alter table game_snapshots enable row level security;

-- Any participant can read
create policy "game_snapshots_select" on game_snapshots
  for select using (is_game_participant(game_id));

-- Only the current host can insert
create policy "game_snapshots_insert" on game_snapshots
  for insert with check (
    is_game_participant(game_id)
    and exists (
      select 1 from games
      where games.id = game_id
        and games.host_user_id = auth.uid()
    )
  );

-- Enable Realtime for snapshot availability notifications
alter publication supabase_realtime add table game_snapshots;
