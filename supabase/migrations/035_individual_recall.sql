-- 035_individual_recall.sql
-- OOD Race Control — Slice C: AUTOMATIC INDIVIDUAL RECALL (OCS).
--
-- Individual recall = the boats that were on the COURSE SIDE of the start line
-- at the start gun. They must return and restart. This slice makes the OCS state
-- COMMITTEE-AUTHORITATIVE (driven by whoever holds Race Control) and broadcasts
-- it to every sailor via the existing races-row + own-entry realtime.
--
-- NOTE: the /race/live Nav screen already has a *client-local* self-detection of
-- OCS (each boat evaluates its own position at the gun and writes
-- race_entries.status='OCS'). That stays — it's the sailor's own heads-up. THIS
-- adds the authoritative, controller-owned flag the whole fleet trusts:
--
--   * race_entries.ocs     (boolean) — this boat is flagged OCS / individual recall.
--   * race_entries.ocs_at  (timestamptz) — when it was flagged.
--   * races.individual_recall (boolean) — an individual recall is in effect for the
--                             fleet (drives the sailor broadcast; piggybacks on the
--                             existing races-row realtime subscription so no new
--                             channel is needed).
--
-- RPCs mirror ood_set_start's auth EXACTLY: caller must be the current controller
-- (races.ood_id) OR a club officer/admin. SECURITY DEFINER so a competitor who has
-- "taken control" can drive them despite the restrictive race_entries/races RLS.

alter table race_entries add column if not exists ocs boolean not null default false;
alter table race_entries add column if not exists ocs_at timestamptz;
alter table races add column if not exists individual_recall boolean not null default false;

-- ── Flag the EXACT set of OCS boats for a race ──────────────────────────────
-- Sets ocs=true (+ ocs_at=now) for every entry id in p_entry_ids that belongs to
-- p_race, and ocs=false for all OTHER entries in the race. This "set the whole
-- list" semantics makes it the single source of truth for both the auto-detection
-- pass and the manual controller override (add/remove boats). Returns the number
-- of boats currently flagged OCS after the write.
create or replace function public.ood_flag_ocs(p_race uuid, p_entry_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ood uuid;
  v_club uuid;
  v_ids uuid[] := coalesce(p_entry_ids, '{}'::uuid[]);
  v_count int;
begin
  select ood_id, club_id into v_ood, v_club from races where id = p_race;
  if v_club is null then return -1; end if;

  if v_ood is distinct from v_uid and not _is_club_officer(v_club) then
    return -2; -- not-controller
  end if;

  -- Flag the listed boats.
  update race_entries
    set ocs = true,
        ocs_at = coalesce(ocs_at, now())
    where race_id = p_race and id = any(v_ids);

  -- Clear any boat no longer in the list.
  update race_entries
    set ocs = false,
        ocs_at = null
    where race_id = p_race and ocs = true and not (id = any(v_ids));

  select count(*) into v_count from race_entries where race_id = p_race and ocs = true;
  return v_count;
end; $$;

-- ── Broadcast that an individual recall is (not) in effect ──────────────────
-- Flips races.individual_recall. When turning it OFF we also clear every OCS flag
-- for the race (the recall is over / a fresh start is being set).
create or replace function public.ood_set_individual_recall(p_race uuid, p_active boolean)
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

  update races set individual_recall = coalesce(p_active, false) where id = p_race;

  if not coalesce(p_active, false) then
    update race_entries set ocs = false, ocs_at = null where race_id = p_race and ocs = true;
  end if;

  return case when coalesce(p_active, false) then 'active' else 'cleared' end;
end; $$;

grant execute on function public.ood_flag_ocs(uuid, uuid[]) to authenticated;
grant execute on function public.ood_set_individual_recall(uuid, boolean) to authenticated;

-- Let sailors READ their own entry's ocs flag + the fleet flag. race_entries is
-- already selectable in this app (the fleet list + own-entry lookups run under
-- the anon/auth client), and races is publicly selectable by token, so no new
-- SELECT policy is required — the new columns are just extra fields on rows the
-- client already reads.
