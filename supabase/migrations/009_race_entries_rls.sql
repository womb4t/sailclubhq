-- RLS policies for boats and race_entries tables
-- Authenticated users can manage records for races/clubs they belong to

-- Enable RLS
alter table boats enable row level security;
alter table race_entries enable row level security;

-- ============================================================
-- BOATS policies
-- ============================================================

-- Authenticated users can read boats in their club
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'boats' and policyname = 'Auth users can read boats in their club'
  ) then
    execute $policy$
      create policy "Auth users can read boats in their club"
        on boats for select
        to authenticated
        using (
          club_id in (
            select club_id from club_members where user_id = auth.uid()
          )
        )
    $policy$;
  end if;
end $$;

-- Authenticated users can insert boats in their club
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'boats' and policyname = 'Auth users can insert boats in their club'
  ) then
    execute $policy$
      create policy "Auth users can insert boats in their club"
        on boats for insert
        to authenticated
        with check (
          club_id in (
            select club_id from club_members where user_id = auth.uid()
          )
        )
    $policy$;
  end if;
end $$;

-- Authenticated users can update boats in their club
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'boats' and policyname = 'Auth users can update boats in their club'
  ) then
    execute $policy$
      create policy "Auth users can update boats in their club"
        on boats for update
        to authenticated
        using (
          club_id in (
            select club_id from club_members where user_id = auth.uid()
          )
        )
    $policy$;
  end if;
end $$;

-- Authenticated users can delete boats in their club
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'boats' and policyname = 'Auth users can delete boats in their club'
  ) then
    execute $policy$
      create policy "Auth users can delete boats in their club"
        on boats for delete
        to authenticated
        using (
          club_id in (
            select club_id from club_members where user_id = auth.uid()
          )
        )
    $policy$;
  end if;
end $$;

-- ============================================================
-- RACE_ENTRIES policies
-- ============================================================

-- Authenticated users can read race_entries for races in their club
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'race_entries' and policyname = 'Auth users can read entries in their club'
  ) then
    execute $policy$
      create policy "Auth users can read entries in their club"
        on race_entries for select
        to authenticated
        using (
          race_id in (
            select r.id from races r
            inner join club_members cm on cm.club_id = r.club_id and cm.user_id = auth.uid()
          )
        )
    $policy$;
  end if;
end $$;

-- Authenticated users can insert race_entries for races in their club
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'race_entries' and policyname = 'Auth users can insert entries in their club'
  ) then
    execute $policy$
      create policy "Auth users can insert entries in their club"
        on race_entries for insert
        to authenticated
        with check (
          race_id in (
            select r.id from races r
            inner join club_members cm on cm.club_id = r.club_id and cm.user_id = auth.uid()
          )
        )
    $policy$;
  end if;
end $$;

-- Authenticated users can update race_entries for races in their club
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'race_entries' and policyname = 'Auth users can update entries in their club'
  ) then
    execute $policy$
      create policy "Auth users can update entries in their club"
        on race_entries for update
        to authenticated
        using (
          race_id in (
            select r.id from races r
            inner join club_members cm on cm.club_id = r.club_id and cm.user_id = auth.uid()
          )
        )
    $policy$;
  end if;
end $$;

-- Authenticated users can delete race_entries for races in their club
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'race_entries' and policyname = 'Auth users can delete entries in their club'
  ) then
    execute $policy$
      create policy "Auth users can delete entries in their club"
        on race_entries for delete
        to authenticated
        using (
          race_id in (
            select r.id from races r
            inner join club_members cm on cm.club_id = r.club_id and cm.user_id = auth.uid()
          )
        )
    $policy$;
  end if;
end $$;
