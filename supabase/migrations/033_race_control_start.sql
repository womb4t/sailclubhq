-- 033_race_control_start.sql
-- OOD Race Control — Slice A: synchronised start.
--
-- 1. races.start_scheduled_at (timestamptz): the ABSOLUTE start-gun time the
--    controller sets. Absolute (not a wall-clock `time`) so every device computes
--    the same `start - now` countdown = synchronised across all boats + committee.
--    (races.start_time stays as-is — it's the planned wall-clock time used for
--    display / instructions; start_scheduled_at is the live, controllable gun.)
--
-- 2. ood_set_start(race, start): the CURRENT controller (races.ood_id) sets/adjusts
--    the gun time. SECURITY DEFINER so a competitor who has "taken control" via the
--    existing ood_take flow can drive the start even though the races UPDATE RLS is
--    restricted to club admins/officers. Pass NULL to clear a scheduled start.
--    This is the reusable, control-gated write later slices build on.

alter table races add column if not exists start_scheduled_at timestamptz;

create or replace function public.ood_set_start(p_race uuid, p_start timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ood uuid;
  v_club uuid;
begin
  select ood_id, club_id into v_ood, v_club from races where id = p_race;
  if v_club is null then return 'no-race'; end if;

  -- Only whoever holds race control may set the start:
  --   * the current OOD (self-taken competitor OR assigned+accepted official), OR
  --   * a club officer/admin (fallback so officials can always drive it).
  if v_ood is distinct from v_uid and not _is_club_officer(v_club) then
    return 'not-controller';
  end if;

  update races set start_scheduled_at = p_start where id = p_race;
  return 'set';
end; $$;

grant execute on function public.ood_set_start(uuid, timestamptz) to authenticated;
