-- 026_leave_club.sql
-- "Leave club" with governance: the sole admin cannot abandon a club.
-- If the admin wants to leave, they must first hand over admin (nominate a
-- member who accepts) so the club always keeps at least one admin.
--
-- SECURITY DEFINER so the rule is server-enforced and cannot be bypassed by a
-- direct profiles update from the client.

create or replace function public.leave_club()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_role text;
  v_other_admins int;
begin
  select club_id, role into v_club, v_role
  from profiles
  where id = auth.uid();

  if v_club is null then
    return 'no-club';
  end if;

  if v_role = 'admin' then
    select count(*) into v_other_admins
    from profiles
    where club_id = v_club and role = 'admin' and id <> auth.uid();

    if v_other_admins = 0 then
      -- Blocked: they are the only admin. They must hand over first.
      return 'needs-successor';
    end if;
  end if;

  -- Clear this user's membership (also drop any stale nomination they made).
  update profiles
  set club_id = null, role = 'member'
  where id = auth.uid();

  update clubs
  set pending_admin_nominated_by = null,
      pending_admin_nominee = case when pending_admin_nominated_by = auth.uid() then null else pending_admin_nominee end,
      pending_admin_nominated_at = case when pending_admin_nominated_by = auth.uid() then null else pending_admin_nominated_at end
  where id = v_club and pending_admin_nominated_by = auth.uid();

  return 'left';
end;
$$;

grant execute on function public.leave_club() to authenticated;
