-- Migration 025: Crew invites
-- Lets a helm invite an "available as crew" sailor to join their boat.
-- When the crew accepts, their entry is attached to the helm's boat, which
-- (because it now has a boat) removes them from the "crew available" list.
--
-- Flow:
--   1. Helm taps "Invite to my boat" on a crew-available entry ->
--      crew_invited_by = helm's race_entries.id, crew_invite_status = 'pending',
--      crew_invited_boat_name = the boat's display name (for the crew to see).
--   2. Crew sees the pending invite on their own view and Accepts or Declines.
--   3. Accept -> boat_id + boat_name copied to the crew entry, status 'accepted'.
--      Decline -> invite fields cleared, sailor stays available.

alter table race_entries add column if not exists crew_invited_by uuid references race_entries(id) on delete set null;
alter table race_entries add column if not exists crew_invite_status text check (crew_invite_status in ('pending', 'accepted', 'declined'));
alter table race_entries add column if not exists crew_invited_boat_name text;

create index if not exists idx_race_entries_crew_invited_by on race_entries(crew_invited_by);
