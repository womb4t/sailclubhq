-- Migration 015: Security Fixes
-- Addresses findings from SECURITY-AUDIT.md (2 July 2026)

-- ============================================================
-- C1: Fix broken migration 009 policies (club_members → profiles)
-- Migration 009 referenced non-existent club_members table
-- ============================================================

-- Drop broken boat policies from 009 (they reference club_members which doesn't exist)
drop policy if exists "Auth users can read boats in their club" on boats;
drop policy if exists "Auth users can insert boats in their club" on boats;
drop policy if exists "Auth users can update boats in their club" on boats;
drop policy if exists "Auth users can delete boats in their club" on boats;

-- Drop broken race_entries policies from 009
drop policy if exists "Auth users can read entries in their club" on race_entries;
drop policy if exists "Auth users can insert entries in their club" on race_entries;
drop policy if exists "Auth users can update entries in their club" on race_entries;
drop policy if exists "Auth users can delete entries in their club" on race_entries;

-- Recreate boat policies using profiles (which actually exists)
-- Note: migration 002 already created "Club members can read/insert/update boats" policies
-- We add delete and ensure the others exist
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'boats' and policyname = 'Club members can delete boats') then
    create policy "Club members can delete boats" on boats for delete using (
      club_id in (select club_id from profiles where id = auth.uid())
    );
  end if;
end $$;

-- Recreate race_entries policies using profiles
-- Note: migration 002 already created select/insert policies for race_entries
-- We need update and delete

-- Update: users can update their own entries OR admins/officers can update any
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'race_entries' and policyname = 'Users can update own entries') then
    create policy "Users can update own entries" on race_entries for update using (
      user_id = auth.uid()
      OR race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
        )
      )
    );
  end if;
end $$;

-- Delete: users can delete own entries OR admins/officers can delete any
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'race_entries' and policyname = 'Users can delete own entries') then
    create policy "Users can delete own entries" on race_entries for delete using (
      user_id = auth.uid()
      OR race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
        )
      )
    );
  end if;
end $$;

-- ============================================================
-- C2: Add RLS policies for gps_tracks and gps_track_points
-- (RLS was enabled in 001 but zero policies existed)
-- ============================================================

create policy "Club members can read tracks" on gps_tracks
  for select using (
    race_entry_id in (
      select id from race_entries where race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid()
        )
      )
    )
  );

create policy "Users can insert own tracks" on gps_tracks
  for insert with check (
    race_entry_id in (
      select id from race_entries where race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid()
        )
      )
    )
  );

create policy "Club members can read track points" on gps_track_points
  for select using (
    track_id in (
      select id from gps_tracks where race_entry_id in (
        select id from race_entries where race_id in (
          select id from races where club_id in (
            select club_id from profiles where id = auth.uid()
          )
        )
      )
    )
  );

create policy "Users can insert track points" on gps_track_points
  for insert with check (
    track_id in (
      select id from gps_tracks where race_entry_id in (
        select id from race_entries where race_id in (
          select id from races where club_id in (
            select club_id from profiles where id = auth.uid()
          )
        )
      )
    )
  );

-- ============================================================
-- C3: Add user_id to race_entries for proper ownership tracking
-- ============================================================

alter table race_entries add column if not exists user_id uuid references auth.users(id);

-- Index for fast lookups
create index if not exists idx_race_entries_user on race_entries(user_id);

-- ============================================================
-- H2: Add write policies for race_results
-- ============================================================

-- Officers/admins can insert results
create policy "Officers can insert race results" on race_results
  for insert with check (
    race_entry_id in (
      select id from race_entries where race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
        )
      )
    )
  );

-- Officers/admins can update results
create policy "Officers can update race results" on race_results
  for update using (
    race_entry_id in (
      select id from race_entries where race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
        )
      )
    )
  );

-- Officers/admins can delete results
create policy "Officers can delete race results" on race_results
  for delete using (
    race_entry_id in (
      select id from race_entries where race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
        )
      )
    )
  );

-- ============================================================
-- H3: Allow admins/officers to read club member profiles (emergency contacts)
-- ============================================================

create policy "Officers can read club member profiles" on profiles
  for select using (
    club_id in (
      select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
    )
  );

-- ============================================================
-- H4: Role-based write restrictions on key tables
-- Only admin/race_officer/ood can create/edit/delete races
-- ============================================================

-- Replace permissive race insert with role-checked version
drop policy if exists "Club members can insert races" on races;
create policy "Officers can insert races" on races
  for insert with check (
    club_id in (
      select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
    )
  );

-- Start classes: only officers can write
drop policy if exists "Club members can insert start classes" on start_classes;
create policy "Officers can insert start classes" on start_classes
  for insert with check (
    race_id in (
      select id from races where club_id in (
        select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
      )
    )
  );

drop policy if exists "Club members can update start classes" on start_classes;
create policy "Officers can update start classes" on start_classes
  for update using (
    race_id in (
      select id from races where club_id in (
        select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
      )
    )
  );

drop policy if exists "Club members can delete start classes" on start_classes;
create policy "Officers can delete start classes" on start_classes
  for delete using (
    race_id in (
      select id from races where club_id in (
        select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
      )
    )
  );

-- Race messages: only officers can post/delete
drop policy if exists "Users can insert race messages" on race_messages;
create policy "Officers can insert race messages" on race_messages
  for insert with check (
    race_id in (
      select id from races where club_id in (
        select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
      )
    )
  );

drop policy if exists "Users can delete race messages" on race_messages;
create policy "Officers can delete race messages" on race_messages
  for delete using (
    race_id in (
      select id from races where club_id in (
        select club_id from profiles where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
      )
    )
  );
