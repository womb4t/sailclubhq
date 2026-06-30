-- Track who created a mark
alter table marks add column if not exists created_by uuid references auth.users(id);

-- Mark change log — audit trail
create table if not exists mark_changes (
  id uuid primary key default gen_random_uuid(),
  mark_id uuid references marks(id) on delete cascade,
  changed_by uuid references auth.users(id),
  changed_at timestamptz default now(),
  reason text not null,
  field_name text not null,
  old_value text,
  new_value text
);

alter table mark_changes enable row level security;

create policy "Club members can read mark changes" on mark_changes for select using (
  mark_id in (select id from marks where club_id in (select club_id from profiles where id = auth.uid()))
);

create policy "Club members can insert mark changes" on mark_changes for insert with check (
  mark_id in (select id from marks where club_id in (select club_id from profiles where id = auth.uid()))
);

create index mark_changes_mark_id_idx on mark_changes(mark_id, changed_at desc);

-- Race mark snapshots — captures mark state when race is created
-- Historical races always show the mark as it was at race time
create table if not exists race_mark_snapshots (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references races(id) on delete cascade,
  mark_id uuid references marks(id) on delete set null,
  name text not null,
  short_id text not null,
  lat numeric(10,7) not null,
  lon numeric(10,7) not null,
  type text not null,
  default_rounding text not null,
  snapped_at timestamptz default now()
);

alter table race_mark_snapshots enable row level security;

create policy "Club members can read race mark snapshots" on race_mark_snapshots for select using (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);

create policy "Club members can insert race mark snapshots" on race_mark_snapshots for insert with check (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);

create index race_mark_snapshots_race_idx on race_mark_snapshots(race_id);
