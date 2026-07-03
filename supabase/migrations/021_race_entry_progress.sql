-- Migration 021: Restore race-progress / results columns on race_entries
--
-- Migration 014 defined these columns, but (like live_positions) they never made
-- it into the live DB — so finish times, lap counts and mark progress written by
-- the tracker / race nav have been silently discarded. This adds them back,
-- idempotently, so tracking results actually persist and can be scored.

alter table race_entries add column if not exists start_time timestamptz;
alter table race_entries add column if not exists finish_time timestamptz;
alter table race_entries add column if not exists elapsed_seconds numeric;
alter table race_entries add column if not exists laps_completed integer default 0;
alter table race_entries add column if not exists last_mark_index integer default 0;
alter table race_entries add column if not exists tracking_active boolean default false;

-- Handicap placeholders (for corrected-time results later).
alter table race_entries add column if not exists handicap_system text;
alter table race_entries add column if not exists handicap_value numeric;
alter table race_entries add column if not exists corrected_seconds numeric;

-- Allow anon/participant trackers to update their own progress (finish, laps,
-- mark index) — migration 020 added the anon-update policy scoped to entries
-- with a participant_id; authenticated members already update their own via
-- existing policies. No new policy needed here.

-- Verify:
--   select column_name from information_schema.columns
--   where table_name='race_entries'
--     and column_name in ('finish_time','elapsed_seconds','laps_completed','last_mark_index');
