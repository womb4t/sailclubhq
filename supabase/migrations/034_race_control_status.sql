-- 034_race_control_status.sql
-- OOD Race Control — Slice B: broadcast status (delay start / abandon).
--
-- Builds on 033 (start_scheduled_at + ood_set_start). Adds a LIVE race-control
-- state that the committee/OOD broadcasts to every boat via the existing races-row
-- realtime subscription (channel race:{id}). This is deliberately SEPARATE from
-- races.status (the lifecycle: draft/planned/confirmed/live/cancelled/completed/
-- archived) — that column gates the UI (raceIsOn) and must not be repurposed.
--
--   * race_status       — the on-water control state broadcast to sailors:
--                         'scheduled','postponed','racing','abandoned','finished'.
--   * control_message   — a short human note shown to sailors (nullable).
--   * control_message_at— when that note was set (drives "recent" display).
--
-- Both RPCs mirror ood_set_start's auth: caller must be the current controller
-- (races.ood_id) OR a club officer/admin. SECURITY DEFINER so a competitor who
-- has "taken control" via the existing ood_take flow can drive them despite the
-- restrictive races UPDATE RLS.

alter table races add column if not exists race_status text;
alter table races add column if not exists control_message text;
alter table races add column if not exists control_message_at timestamptz;

-- ── Delay the start by N minutes (default 5) ────────────────────────────────
-- Pushes start_scheduled_at forward by p_minutes if a start is set; otherwise
-- sets it to now()+p_minutes. Flags the race postponed + broadcasts a note.
-- Returns the new start time (ISO text).
create or replace function public.ood_delay_start(p_race uuid, p_minutes int default 5)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ood uuid;
  v_club uuid;
  v_cur timestamptz;
  v_new timestamptz;
  v_mins int := coalesce(p_minutes, 5);
begin
  select ood_id, club_id, start_scheduled_at into v_ood, v_club, v_cur from races where id = p_race;
  if v_club is null then return 'no-race'; end if;

  if v_ood is distinct from v_uid and not _is_club_officer(v_club) then
    return 'not-controller';
  end if;

  v_new := coalesce(v_cur, now()) + make_interval(mins => v_mins);

  update races
    set start_scheduled_at = v_new,
        race_status = 'postponed',
        control_message = 'Start delayed by ' || v_mins || ' min',
        control_message_at = now()
    where id = p_race;

  return v_new::text;
end; $$;

-- ── Abandon the race ────────────────────────────────────────────────────────
create or replace function public.ood_abandon_race(p_race uuid)
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

  if v_ood is distinct from v_uid and not _is_club_officer(v_club) then
    return 'not-controller';
  end if;

  update races
    set race_status = 'abandoned',
        control_message = 'Race abandoned',
        control_message_at = now()
    where id = p_race;

  return 'abandoned';
end; $$;

-- ── Clear the broadcast note (optional helper) ──────────────────────────────
create or replace function public.ood_clear_message(p_race uuid)
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

  if v_ood is distinct from v_uid and not _is_club_officer(v_club) then
    return 'not-controller';
  end if;

  update races
    set control_message = null,
        control_message_at = null
    where id = p_race;

  return 'cleared';
end; $$;

grant execute on function public.ood_delay_start(uuid, int) to authenticated;
grant execute on function public.ood_abandon_race(uuid) to authenticated;
grant execute on function public.ood_clear_message(uuid) to authenticated;
