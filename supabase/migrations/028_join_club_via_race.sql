-- 028_join_club_via_race.sql
-- When someone signs up / enters from a race link, add them to that race's club
-- automatically (as a member) if they aren't already in a club. This is how a
-- participant is "invited into the club they join" — no admin action needed.
--
-- SECURITY DEFINER: the caller can only ever join the club that owns the race
-- token they were given; they cannot pick an arbitrary club or change roles.

create or replace function public.join_club_via_race(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
  v_current_club uuid;
begin
  if v_uid is null then
    return 'not-authenticated';
  end if;

  select club_id into v_club
  from races
  where entry_token = p_token;

  if v_club is null then
    return 'no-race';
  end if;

  select club_id into v_current_club
  from profiles
  where id = v_uid;

  -- Already in a club? Leave membership untouched (don't move existing members).
  if v_current_club is not null then
    return 'already-in-club';
  end if;

  update profiles
  set club_id = v_club,
      role = 'member'
  where id = v_uid;

  return 'joined';
end;
$$;

grant execute on function public.join_club_via_race(text) to authenticated;
