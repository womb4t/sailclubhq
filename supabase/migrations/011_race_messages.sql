-- Race messages / announcements
create table if not exists race_messages (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references races(id) on delete cascade,
  author_id uuid references auth.users(id),
  message text not null,
  is_headline boolean default false,
  created_at timestamptz default now()
);

alter table race_messages enable row level security;

-- Authenticated users can read messages for races in their club
create policy "Users can read race messages" on race_messages for select using (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);
create policy "Users can insert race messages" on race_messages for insert with check (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);
create policy "Users can delete race messages" on race_messages for delete using (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);

-- Anon can read messages for public races (shown on club homepage / public calendar)
create policy "Anon can read public race messages" on race_messages for select to anon using (
  race_id in (select id from races where status in ('planned', 'confirmed', 'completed'))
);

create index on race_messages(race_id, created_at desc);
