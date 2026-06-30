-- Race series management table
create table race_series (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  constraint unique_series_name unique(club_id, name)
);

alter table race_series enable row level security;

create policy "Users can read their club series" on race_series for select using (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Users can insert their club series" on race_series for insert with check (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Users can update their club series" on race_series for update using (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Users can delete their club series" on race_series for delete using (
  club_id in (select club_id from profiles where id = auth.uid())
);

create index on race_series(club_id);
