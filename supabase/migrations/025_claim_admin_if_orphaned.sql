-- 025_claim_admin_if_orphaned.sql
-- Self-heal: a club must always have at least one admin. If a club is left with
-- zero admins (e.g. all members cleared but the club kept), the calling user —
-- if they belong to that club — is promoted to admin.
--
-- SECURITY DEFINER so the promotion logic is server-enforced: a member CANNOT
-- use this to self-promote while an admin still exists; it only fires when the
-- club has no admin at all.

create or replace function public.claim_admin_if_orphaned()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_admin_count int;
begin
  -- Which club does the caller belong to?
  select club_id into v_club
  from profiles
  where id = auth.uid();

  if v_club is null then
    return 'no-club';
  end if;

  -- Does this club already have an admin?
  select count(*) into v_admin_count
  from profiles
  where club_id = v_club and role = 'admin';

  if v_admin_count > 0 then
    return 'has-admin';
  end if;

  -- Orphaned club: promote the caller.
  update profiles
  set role = 'admin'
  where id = auth.uid();

  return 'promoted';
end;
$$;

grant execute on function public.claim_admin_if_orphaned() to authenticated;
