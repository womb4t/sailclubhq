-- Migration 022: Role model — admin/member, per-race OOD, admin handover
--
-- Model (agreed):
--  * Club roles are just 'admin' and 'member'. The club creator is admin.
--    Everyone else is a member. OOD is NOT a permanent role.
--  * OOD (Officer of the Day) is per-race: assigned at setup, or left open for a
--    volunteer, or assigned later. Stored on the race, not the profile.
--  * Exactly one admin per club. An admin may nominate a member as the new admin;
--    the nominee must accept, then it's a full handover (old admin -> member).

-- ── 1. Normalise profile roles to admin | member ──────────────────────────────
-- Existing 'competitor' and 'race_officer' become 'member' (OOD is per-race now).
update profiles set role = 'member' where role in ('competitor', 'race_officer');

-- Constrain to the two valid roles going forward.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'member'));
alter table profiles alter column role set default 'member';

-- ── 2. Per-race OOD ────────────────────────────────────────────────────────────
-- ood_id: the assigned Officer of the Day (a profile/user), null if none yet.
-- ood_open_for_volunteer: when true, any joiner may volunteer to take OOD.
alter table races add column if not exists ood_id uuid references auth.users(id);
alter table races add column if not exists ood_open_for_volunteer boolean default false;

-- ── 3. Admin handover (nomination + approval) ──────────────────────────────────
-- A pending nomination lives on the club: who is nominated + who nominated them.
-- On accept, an app action promotes the nominee to admin and demotes the old
-- admin to member (enforced in app logic; single admin invariant).
alter table clubs add column if not exists pending_admin_nominee uuid references auth.users(id);
alter table clubs add column if not exists pending_admin_nominated_by uuid references auth.users(id);
alter table clubs add column if not exists pending_admin_nominated_at timestamptz;

-- Verify:
--   select role, count(*) from profiles group by role;   -- only admin/member
--   select column_name from information_schema.columns
--     where table_name='races' and column_name in ('ood_id','ood_open_for_volunteer');
