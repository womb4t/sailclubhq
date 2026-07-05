-- 031_boats_owner_read.sql
-- A user should always be able to see (and manage) their own boats, even if the
-- boat's club_id doesn't match their current club (e.g. after club changes) or
-- is null. Previously boats were only visible via club membership, so a user's
-- own boat could vanish from the race-entry picker.

drop policy if exists "Owner can read own boats" on boats;
create policy "Owner can read own boats" on boats
  for select using (owner_id = auth.uid());

drop policy if exists "Owner can update own boats" on boats;
create policy "Owner can update own boats" on boats
  for update using (owner_id = auth.uid());

drop policy if exists "Owner can delete own boats" on boats;
create policy "Owner can delete own boats" on boats
  for delete using (owner_id = auth.uid());
