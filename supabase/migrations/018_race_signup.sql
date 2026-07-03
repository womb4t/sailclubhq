-- Migration 018: Race sign-up hardening
-- 1. Prevent duplicate active entries: one active entry per user per role per race
-- 2. Backfill nothing needed — index is partial and ignores withdrawn entries

-- A user may enter once as helm and once as crew, but not twice in the same role.
-- Withdrawn entries are excluded so users can withdraw and re-enter.
create unique index if not exists uniq_race_entry_user_role
  on race_entries(race_id, user_id, role)
  where user_id is not null and status <> 'withdrawn';

-- Prevent the same boat being entered twice as an active helm entry
create unique index if not exists uniq_race_entry_boat_helm
  on race_entries(race_id, boat_id)
  where boat_id is not null and role = 'helm' and status <> 'withdrawn';
