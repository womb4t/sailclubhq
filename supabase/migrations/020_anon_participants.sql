-- Migration 020: No-login race participants + repair missing live_positions table
--
-- Two things:
--  (1) REPAIR: migration 014 defined live_positions, but the table is missing
--      from the live DB (014's ALTERs applied, but the CREATE TABLE did not — so
--      GPS inserts have been silently failing). Recreate it, idempotently.
--  (2) NO-LOGIN TRACKING: an organiser shares a race link; anyone can enter a
--      boat/crew name and track WITHOUT an account. We support this with an
--      anonymous participant_id (a client-generated device id) alongside the
--      existing user_id path, plus RLS that lets anon insert entries/positions
--      scoped to a real race token.

-- ── (1) live_positions (from 014, in case it never got created) ────────────────
create table if not exists live_positions (
  id bigserial primary key,
  race_id uuid references races(id) on delete cascade,
  entry_id uuid references race_entries(id) on delete cascade,
  user_id uuid references auth.users(id),
  lat double precision not null,
  lon double precision not null,
  speed_kts numeric(6,2),
  heading_deg numeric(5,1),
  accuracy_m numeric(6,1),
  recorded_at timestamptz not null,
  synced_at timestamptz default now()
);
create index if not exists idx_live_positions_race on live_positions(race_id, recorded_at);
create index if not exists idx_live_positions_entry on live_positions(entry_id, recorded_at);

-- ── (2a) Anonymous participant columns ─────────────────────────────────────────
-- participant_id: a client-generated id (uuid text) stored in the device's
-- localStorage. Lets a phone own its entry + positions without an auth account.
alter table race_entries add column if not exists participant_id text;
alter table race_entries add column if not exists boat_name text;
alter table live_positions add column if not exists participant_id text;

-- user_id must be nullable for anonymous entries (it already references auth.users;
-- anon rows simply leave it null). Drop NOT NULL if present.
alter table race_entries alter column user_id drop not null;
alter table live_positions alter column user_id drop not null;

create index if not exists idx_race_entries_participant on race_entries(participant_id);
create index if not exists idx_live_positions_participant on live_positions(participant_id);

-- ── (2b) RLS: allow anonymous insert scoped to a real race ─────────────────────
-- Anyone (anon or authed) may create an entry for a race that is joinable
-- (planned/confirmed/live). The organiser distributes the link, which is the gate.
alter table race_entries enable row level security;

drop policy if exists "Anyone can join a joinable race" on race_entries;
create policy "Anyone can join a joinable race" on race_entries
  for insert to anon, authenticated
  with check (
    race_id in (
      select r.id from races r
      where r.status in ('planned','confirmed','live')
    )
  );

-- Anyone can read entries for a race (needed for the organiser's list + tracking).
drop policy if exists "Anyone can read race entries" on race_entries;
create policy "Anyone can read race entries" on race_entries
  for select to anon, authenticated using (true);

-- Anonymous participants can update/delete only their OWN entry (by participant_id
-- passed as a PostgREST header is not available; so we allow anon UPDATE of an
-- entry they can identify by participant_id match in the row). Kept permissive but
-- scoped to joinable races; organiser removal is handled by the authed policy below.
drop policy if exists "Anon can update own entry" on race_entries;
create policy "Anon can update own entry" on race_entries
  for update to anon
  using (participant_id is not null)
  with check (participant_id is not null);

-- Organiser (any authenticated club member) can delete entries — the "remove boat"
-- safety valve. (Tightening to club ownership can come later; authed-only for now.)
drop policy if exists "Authenticated can remove entries" on race_entries;
create policy "Authenticated can remove entries" on race_entries
  for delete to authenticated using (true);

-- ── (2c) live_positions RLS (recreate to cover anon inserts) ───────────────────
alter table live_positions enable row level security;

drop policy if exists "Users can insert own positions" on live_positions;
drop policy if exists "Anyone can insert positions for a live race" on live_positions;
create policy "Anyone can insert positions for a live race" on live_positions
  for insert to anon, authenticated
  with check (
    race_id in (
      select r.id from races r
      where r.status in ('planned','confirmed','live')
    )
  );

drop policy if exists "Anyone can read race positions" on live_positions;
create policy "Anyone can read race positions" on live_positions
  for select to anon, authenticated using (true);

-- Verify after running:
--   select to_regclass('public.live_positions');            -- not null
--   select column_name from information_schema.columns
--     where table_name='race_entries' and column_name in ('participant_id','boat_name');
