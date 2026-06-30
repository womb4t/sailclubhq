-- Migration 007: Add update and delete RLS policies for start_classes
-- Select and insert policies already exist in 002_fix_rls_and_start_time.sql

create policy "Club members can update start classes" on start_classes for update using (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);

create policy "Club members can delete start classes" on start_classes for delete using (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);
