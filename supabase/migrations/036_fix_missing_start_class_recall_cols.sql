-- Migration 036: repair missing start_classes recall columns
-- These were declared in 014_live_racing.sql but were NOT actually present in
-- the live prod schema (014 partially applied). The canonical Nav screen
-- (app/race/live) selects general_recall + recalled_at, which would error at
-- runtime without these columns. Re-applying idempotently to guarantee prod parity.
alter table start_classes add column if not exists general_recall boolean default false;
alter table start_classes add column if not exists recalled_at timestamptz;
