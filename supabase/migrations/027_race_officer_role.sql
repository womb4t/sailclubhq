-- 027_race_officer_role.sql
-- Reintroduce a 'race_officer' role: admins own the club, but any number of
-- race officers can create/run races. Members cannot.
--
-- Self-serve claim: if a club has NO race officer yet, a member can claim the
-- role ("Are you the club race officer?"). If officers already exist, only an
-- admin can grant it. Admin can revoke ("kick out") officers at any time.

-- ── 1. Allow the new role value ────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['admin'::text, 'race_officer'::text, 'member'::text]));

-- ── 2. Races policies: admin OR race_officer can create/manage ─────────────────
drop policy if exists "Club admins can insert races" on races;
drop policy if exists "Club admins can update races" on races;
drop policy if exists "Club admins can delete races" on races;
drop policy if exists "Officers can insert races" on races;
drop policy if exists "Officers can update races" on races;
drop policy if exists "Officers can delete races" on races;

create policy "Officers can insert races" on races
  for insert with check (
    club_id in (
      select club_id from profiles
      where id = auth.uid() and role in ('admin', 'race_officer')
    )
  );

create policy "Officers can update races" on races
  for update using (
    created_by = auth.uid()
    or club_id in (
      select club_id from profiles
      where id = auth.uid() and role in ('admin', 'race_officer')
    )
  );

create policy "Officers can delete races" on races
  for delete using (
    created_by = auth.uid()
    or club_id in (
      select club_id from profiles
      where id = auth.uid() and role in ('admin', 'race_officer')
    )
  );

-- ── 3. Self-serve claim when the club has no race officer ──────────────────────
-- SECURITY DEFINER: only succeeds if the caller's club currently has zero race
-- officers, so a member cannot self-promote once officers exist.
create or replace function public.claim_race_officer_if_none()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_role text;
  v_officer_count int;
begin
  select club_id, role into v_club, v_role
  from profiles where id = auth.uid();

  if v_club is null then
    return 'no-club';
  end if;

  if v_role in ('admin', 'race_officer') then
    return 'already-officer';
  end if;

  select count(*) into v_officer_count
  from profiles
  where club_id = v_club and role = 'race_officer';

  if v_officer_count > 0 then
    return 'officers-exist';  -- must be granted by an admin
  end if;

  update profiles set role = 'race_officer' where id = auth.uid();
  return 'claimed';
end;
$$;

grant execute on function public.claim_race_officer_if_none() to authenticated;

-- ── 4. Admin grants / revokes race officer ─────────────────────────────────────
-- SECURITY DEFINER, but only an admin of the same club may act.
create or replace function public.set_race_officer(target uuid, make_officer boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_role text;
  v_target_club uuid;
  v_target_role text;
begin
  select club_id, role into v_club, v_role
  from profiles where id = auth.uid();

  if v_role <> 'admin' then
    return 'not-admin';
  end if;

  select club_id, role into v_target_club, v_target_role
  from profiles where id = target;

  if v_target_club is null or v_target_club <> v_club then
    return 'not-same-club';
  end if;

  if v_target_role = 'admin' then
    return 'is-admin';  -- never change the admin via this path
  end if;

  update profiles
  set role = case when make_officer then 'race_officer' else 'member' end
  where id = target;

  return case when make_officer then 'granted' else 'revoked' end;
end;
$$;

grant execute on function public.set_race_officer(uuid, boolean) to authenticated;
