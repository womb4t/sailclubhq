-- 032_boats_owner_insert.sql
-- Boats belong to a PERSON, not a club. The old INSERT policy required
-- club_id to match the user's club, which blocked adding a boat when clubless
-- (and forced a club link that shouldn't exist). Replace it: a user may insert
-- a boat they own. (031 already handles owner read/update/delete.)

drop policy if exists "Club members can insert boats" on boats;
drop policy if exists "Owner can insert own boats" on boats;
create policy "Owner can insert own boats" on boats
  for insert with check (owner_id = auth.uid());
