-- 030_ood_lifecycle.sql
-- OOD (Officer of the Day) lifecycle:
--  * Anyone can take OOD when the position is empty (self-take = accepted).
--  * A race officer / admin can PRE-ASSIGN an OOD, but that person must ACCEPT.
--    Until accepted the assignment is PROVISIONAL (covers a no-show).
--  * An ACCEPTED OOD is PROTECTED: only replaced if THEY nominate a successor.
--  * A PROVISIONAL (assigned, not-yet-accepted) OOD can be overridden by anyone
--    — the UI shows an "X was assigned, are you sure?" confirm; the DB allows it.

alter table races add column if not exists ood_accepted boolean not null default false;
alter table races add column if not exists ood_assigned_by uuid references auth.users(id);

-- Existing rows: if an ood_id is already set, treat it as accepted (legacy).
update races set ood_accepted = true where ood_id is not null and ood_accepted = false;

-- Helper: caller must be admin/race_officer of the race's club.
create or replace function public._is_club_officer(p_club uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and club_id = p_club and role in ('admin','race_officer')
  );
$$;

-- ── ood_assign(race, target): race officer pre-assigns an OOD (provisional) ────
create or replace function public.ood_assign(p_race uuid, p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_club uuid; begin
  select club_id into v_club from races where id = p_race;
  if v_club is null then return 'no-race'; end if;
  if not _is_club_officer(v_club) then return 'not-officer'; end if;

  update races
  set ood_id = p_target,
      ood_accepted = false,          -- must accept
      ood_assigned_by = auth.uid(),
      ood_open_for_volunteer = false
  where id = p_race;
  return 'assigned';
end; $$;
grant execute on function public.ood_assign(uuid, uuid) to authenticated;

-- ── ood_take(race, override): caller takes OOD for themselves ──────────────────
-- returns 'taken' on success; 'blocked-accepted' if an ACCEPTED OOD holds it and
-- the caller wasn't nominated by them; 'needs-confirm' is handled in the UI (the
-- UI passes p_override=true after the "are you sure" prompt for a provisional OOD).
create or replace function public.ood_take(p_race uuid, p_override boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_uid uuid := auth.uid();
  v_cur uuid;
  v_accepted boolean;
begin
  select club_id, ood_id, ood_accepted into v_club, v_cur, v_accepted
  from races where id = p_race;
  if v_club is null then return 'no-race'; end if;

  -- Must belong to the club.
  if not exists (select 1 from profiles where id = v_uid and club_id = v_club) then
    return 'not-in-club';
  end if;

  -- Already me and accepted → nothing to do.
  if v_cur = v_uid and v_accepted then return 'already-you'; end if;

  -- Position empty → take it (accepted).
  if v_cur is null then
    update races set ood_id = v_uid, ood_accepted = true, ood_assigned_by = null where id = p_race;
    return 'taken';
  end if;

  -- I was pre-assigned this (provisional) → accepting it.
  if v_cur = v_uid and not v_accepted then
    update races set ood_accepted = true where id = p_race;
    return 'accepted';
  end if;

  -- Someone else holds it and it's ACCEPTED → protected.
  if v_accepted then
    return 'blocked-accepted';
  end if;

  -- Someone else was pre-assigned but has NOT accepted (provisional).
  -- Allow override only when the UI confirms.
  if not p_override then
    return 'needs-confirm';
  end if;

  update races set ood_id = v_uid, ood_accepted = true, ood_assigned_by = null where id = p_race;
  return 'taken-override';
end; $$;
grant execute on function public.ood_take(uuid, boolean) to authenticated;

-- ── ood_accept(race): the assigned person accepts a provisional assignment ─────
create or replace function public.ood_accept(p_race uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_cur uuid; begin
  select ood_id into v_cur from races where id = p_race;
  if v_cur is null then return 'no-ood'; end if;
  if v_cur <> auth.uid() then return 'not-you'; end if;
  update races set ood_accepted = true where id = p_race;
  return 'accepted';
end; $$;
grant execute on function public.ood_accept(uuid) to authenticated;

-- ── ood_nominate(race, target): current OOD hands over to a successor ──────────
-- The nominee becomes the new (provisional) OOD and must accept.
create or replace function public.ood_nominate(p_race uuid, p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_club uuid; v_cur uuid; begin
  select club_id, ood_id into v_club, v_cur from races where id = p_race;
  if v_club is null then return 'no-race'; end if;
  if v_cur <> auth.uid() then return 'not-current-ood'; end if;
  if not exists (select 1 from profiles where id = p_target and club_id = v_club) then
    return 'target-not-in-club';
  end if;
  update races
  set ood_id = p_target, ood_accepted = false, ood_assigned_by = auth.uid()
  where id = p_race;
  return 'nominated';
end; $$;
grant execute on function public.ood_nominate(uuid, uuid) to authenticated;

-- ── ood_stand_down(race): current OOD (or an officer) clears the position ──────
create or replace function public.ood_stand_down(p_race uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_club uuid; v_cur uuid; begin
  select club_id, ood_id into v_club, v_cur from races where id = p_race;
  if v_club is null then return 'no-race'; end if;
  if v_cur <> auth.uid() and not _is_club_officer(v_club) then return 'not-allowed'; end if;
  update races set ood_id = null, ood_accepted = false, ood_assigned_by = null where id = p_race;
  return 'cleared';
end; $$;
grant execute on function public.ood_stand_down(uuid) to authenticated;
