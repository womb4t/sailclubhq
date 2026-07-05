-- 029_race_officer_requests.sql
-- Members can REQUEST to become a race officer; an admin approves or declines.
-- (Direct admin grant already exists via set_race_officer.)

create table if not exists public.race_officer_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

-- One live (pending) request per user per club.
create unique index if not exists race_officer_requests_one_pending
  on public.race_officer_requests (club_id, user_id)
  where status = 'pending';

alter table public.race_officer_requests enable row level security;

-- The requester can see their own requests; club admins can see their club's.
drop policy if exists "read own or admin ro requests" on race_officer_requests;
create policy "read own or admin ro requests" on race_officer_requests
  for select using (
    user_id = auth.uid()
    or club_id in (select club_id from profiles where id = auth.uid() and role = 'admin')
  );

-- ── request_race_officer(): the caller requests RO for their own club ──────────
create or replace function public.request_race_officer()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_role text;
begin
  select club_id, role into v_club, v_role from profiles where id = auth.uid();
  if v_club is null then return 'no-club'; end if;
  if v_role in ('admin','race_officer') then return 'already-officer'; end if;

  if exists (select 1 from race_officer_requests
             where club_id = v_club and user_id = auth.uid() and status = 'pending') then
    return 'already-requested';
  end if;

  insert into race_officer_requests (club_id, user_id) values (v_club, auth.uid());
  return 'requested';
end;
$$;

grant execute on function public.request_race_officer() to authenticated;

-- ── decide_race_officer_request(request_id, approve): admin only ───────────────
create or replace function public.decide_race_officer_request(p_request uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_club uuid;
  v_admin_role text;
  v_req_club uuid;
  v_req_user uuid;
  v_req_status text;
begin
  select club_id, role into v_admin_club, v_admin_role from profiles where id = auth.uid();
  if v_admin_role <> 'admin' then return 'not-admin'; end if;

  select club_id, user_id, status into v_req_club, v_req_user, v_req_status
  from race_officer_requests where id = p_request;

  if v_req_club is null then return 'no-request'; end if;
  if v_req_club <> v_admin_club then return 'not-same-club'; end if;
  if v_req_status <> 'pending' then return 'already-decided'; end if;

  update race_officer_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decided_at = now(), decided_by = auth.uid()
  where id = p_request;

  if p_approve then
    update profiles set role = 'race_officer'
    where id = v_req_user and role = 'member';  -- never touch an admin
  end if;

  return case when p_approve then 'approved' else 'declined' end;
end;
$$;

grant execute on function public.decide_race_officer_request(uuid, boolean) to authenticated;
