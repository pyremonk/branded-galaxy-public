-- Branded Galaxy — full Supabase schema.
-- Run once in the Supabase SQL editor for a fresh project. Safe to re-run
-- (uses "if not exists" / "drop policy if exists"); the realtime publication
-- lines will error harmlessly if the table is already published.
--
-- NOTE: mixed-case columns (e.g. "resource_state_brandAuthority") are quoted
-- on purpose so Postgres preserves the casing the JS client expects.

-- ── commander_profiles ────────────────────────────────────────────────────────
-- Created on signUp; stores display name and aggregate stats.
create table if not exists commander_profiles (
  id                uuid references auth.users primary key,
  alias             text not null,
  territories_held  int default 0,
  total_influence   int default 0,
  session_timestamp timestamptz default now()
);

alter table commander_profiles enable row level security;
drop policy if exists "profiles_all" on commander_profiles;
create policy "profiles_all" on commander_profiles
  for all using (auth.uid() = id);

-- ── galaxy_snapshots ──────────────────────────────────────────────────────────
-- One row per user. Each state manager writes its own column via upsert.
-- Column names must match the factionId casing used in data-bridge.js:
--   brandAuthority  |  union  |  autoforge
create table if not exists galaxy_snapshots (
  commander_id          uuid references auth.users primary key,
  -- Legacy progress fields (storeProgress / fetchProgress)
  territories           jsonb default '[]'::jsonb,
  influence             int   default 100,
  snapshot_timestamp    timestamptz default now(),
  -- Faction state (FactionStateManager)
  faction_state         jsonb,
  -- Per-faction resource state (ResourceStateManager)
  "resource_state_brandAuthority" jsonb,
  resource_state_union            jsonb,
  resource_state_autoforge        jsonb,
  -- Per-faction character state (CharacterStateManager)
  "character_state_brandAuthority" jsonb,
  character_state_union            jsonb,
  character_state_autoforge        jsonb,
  -- Per-faction tech state (TechStateManager)
  "tech_state_brandAuthority" jsonb,
  tech_state_union            jsonb,
  tech_state_autoforge        jsonb,
  -- Per-faction victory progress (VictoryStateManager)
  "victory_state_brandAuthority" jsonb,
  victory_state_union            jsonb,
  victory_state_autoforge        jsonb,
  -- Global fleet state (FleetStateManager — all factions in one blob)
  fleet_state  jsonb,
  -- Turn/phase state (TurnStateManager)
  turn_state   jsonb
);

alter table galaxy_snapshots enable row level security;
drop policy if exists "snapshots_all" on galaxy_snapshots;
create policy "snapshots_all" on galaxy_snapshots
  for all using (auth.uid() = commander_id);

-- ── game_saves ────────────────────────────────────────────────────────────────
-- Unified save-slot system (SaveStateManager). Slots: 'auto', '1'–'5'.
create table if not exists game_saves (
  user_id    uuid references auth.users not null,
  slot_id    text not null,
  save_data  jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, slot_id)
);

alter table game_saves enable row level security;
drop policy if exists "saves_all" on game_saves;
create policy "saves_all" on game_saves
  for all using (auth.uid() = user_id);

-- ── network_sessions ─────────────────────────────────────────────────────────
-- Multiplayer lobby sessions.
create table if not exists network_sessions (
  id                   uuid primary key default gen_random_uuid(),
  game_code            text not null unique,
  game_config          jsonb not null default '{}'::jsonb,
  status               text not null default 'lobby',  -- lobby | active | completed | abandoned
  players              jsonb not null default '[]'::jsonb,
  game_state_delta     jsonb,
  last_resolution_at   timestamptz,
  created_at           timestamptz default now(),
  expires_at           timestamptz not null
);

alter table network_sessions enable row level security;
drop policy if exists "sessions_select" on network_sessions;
create policy "sessions_select" on network_sessions
  for select using (auth.role() = 'authenticated');
drop policy if exists "sessions_insert" on network_sessions;
create policy "sessions_insert" on network_sessions
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "sessions_update" on network_sessions;
create policy "sessions_update" on network_sessions
  for update using (auth.role() = 'authenticated');

-- Enable Realtime so clients receive live lobby/turn updates
-- (harmless error if already added)
alter publication supabase_realtime add table network_sessions;

-- ── network_orders ────────────────────────────────────────────────────────────
-- Per-player turn orders submitted during a network game session.
create table if not exists network_orders (
  session_id   uuid references network_sessions not null,
  player_id    text not null,
  orders       jsonb not null,
  submitted_at timestamptz default now(),
  primary key (session_id, player_id)
);

alter table network_orders enable row level security;
drop policy if exists "orders_all" on network_orders;
create policy "orders_all" on network_orders
  for all using (auth.role() = 'authenticated');

-- ── Hybrid Async/Sync Session Schema (spec 056) ─────────────────────────────
-- Helper function: returns TRUE when auth.uid() is a participant of the game.
create or replace function is_game_participant(p_game_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from games g
    join network_sessions ns on ns.id = g.session_id
    where g.id = p_game_id
      and ns.players @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
  );
$$;

-- games — per-session pacing metadata (async vs sync)
create table if not exists games (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid references network_sessions not null,
  status           text not null default 'async' check (status in ('async','sync')),
  current_turn     integer not null default 1,
  current_tick     integer,
  ticks_per_second numeric not null default 1.0,
  time_per_tick    numeric not null default 1.0,
  host_user_id     uuid,
  created_at       timestamptz not null default now()
);
alter table games enable row level security;
drop policy if exists "games_select" on games;
create policy "games_select" on games for select using (is_game_participant(id));
drop policy if exists "games_insert" on games;
create policy "games_insert" on games for insert with check (auth.role() = 'authenticated');
drop policy if exists "games_update" on games;
create policy "games_update" on games for update using (is_game_participant(id));
alter publication supabase_realtime add table games;

-- turn_orders — persisted per-player orders
create table if not exists turn_orders (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid references games not null,
  turn_number  integer not null,
  player_id    uuid references auth.users not null,
  orders       jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (game_id, turn_number, player_id)
);
alter table turn_orders enable row level security;
drop policy if exists "turn_orders_insert" on turn_orders;
create policy "turn_orders_insert" on turn_orders
  for insert with check (auth.uid() = player_id and is_game_participant(game_id));
drop policy if exists "turn_orders_select" on turn_orders;
create policy "turn_orders_select" on turn_orders
  for select using (is_game_participant(game_id));

-- game_state — authoritative state per turn/tick
create table if not exists game_state (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid references games not null,
  turn_number integer not null,
  tick_number integer,
  state       jsonb not null,
  created_at  timestamptz not null default now()
);
alter table game_state enable row level security;
drop policy if exists "game_state_select" on game_state;
create policy "game_state_select" on game_state for select using (is_game_participant(game_id));
drop policy if exists "game_state_insert" on game_state;
create policy "game_state_insert" on game_state for insert with check (
  is_game_participant(game_id) and exists (
    select 1 from games where games.id = game_id and games.host_user_id = auth.uid()));
drop policy if exists "game_state_update" on game_state;
create policy "game_state_update" on game_state for update using (
  is_game_participant(game_id) and exists (
    select 1 from games where games.id = game_id and games.host_user_id = auth.uid()));

-- game_snapshots — periodic host-written snapshots for reconciliation
create table if not exists game_snapshots (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid references games not null,
  tick_number integer not null,
  turn_number integer not null,
  state       jsonb not null,
  version     integer not null default 1,
  created_at  timestamptz not null default now()
);
alter table game_snapshots enable row level security;
drop policy if exists "game_snapshots_select" on game_snapshots;
create policy "game_snapshots_select" on game_snapshots for select using (is_game_participant(game_id));
drop policy if exists "game_snapshots_insert" on game_snapshots;
create policy "game_snapshots_insert" on game_snapshots for insert with check (
  is_game_participant(game_id) and exists (
    select 1 from games where games.id = game_id and games.host_user_id = auth.uid()));
alter publication supabase_realtime add table game_snapshots;

-- ── Incremental columns (mirrors supabase/migrations/20260228*) ─────────────
alter table games
  add column if not exists turn_timer_minutes    integer     not null default 0,
  add column if not exists turn_timer_started_at timestamptz default null,
  add column if not exists ticks_per_turn        integer     not null default 120
    check (ticks_per_turn between 30 and 240);
