-- Migration 014: Live Racing Module
-- New race status: 'live'
alter table races drop constraint if exists races_status_check;
alter table races add constraint races_status_check check (status in ('draft', 'planned', 'confirmed', 'live', 'cancelled', 'completed', 'archived'));

-- Race control
alter table races add column if not exists race_controller_id uuid references auth.users(id);
alter table races add column if not exists race_started_at timestamptz;
alter table races add column if not exists race_finished_at timestamptz;

-- Entry tracking
alter table race_entries add column if not exists start_time timestamptz;
alter table race_entries add column if not exists finish_time timestamptz;
alter table race_entries add column if not exists elapsed_seconds numeric;
alter table race_entries add column if not exists laps_completed integer default 0;
alter table race_entries add column if not exists last_mark_index integer default 0;
alter table race_entries add column if not exists tracking_active boolean default false;

-- Handicap placeholders
alter table race_entries add column if not exists handicap_system text;
alter table race_entries add column if not exists handicap_value numeric;
alter table race_entries add column if not exists corrected_seconds numeric;

-- GPS positions
create table if not exists live_positions (
  id bigserial primary key,
  race_id uuid references races(id) on delete cascade,
  entry_id uuid references race_entries(id) on delete cascade,
  user_id uuid references auth.users(id),
  lat double precision not null,
  lon double precision not null,
  speed_kts numeric(6,2),
  heading_deg numeric(5,1),
  accuracy_m numeric(6,1),
  recorded_at timestamptz not null,
  synced_at timestamptz default now()
);
create index if not exists idx_live_positions_race on live_positions(race_id, recorded_at);
create index if not exists idx_live_positions_entry on live_positions(entry_id, recorded_at);

-- Environment cache
create table if not exists race_environment (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references races(id) on delete cascade,
  recorded_at timestamptz not null,
  wind_speed_kts numeric(5,1),
  wind_dir_deg numeric(5,1),
  tide_height_m numeric(5,2),
  tide_state text,
  current_speed_kts numeric(4,2),
  current_dir_deg numeric(5,1),
  hw_time timestamptz,
  lw_time timestamptz,
  source text
);

-- RLS for live_positions
alter table live_positions enable row level security;
create policy "Users can insert own positions" on live_positions for insert with check (auth.uid() = user_id);
create policy "Anyone can read race positions" on live_positions for select using (true);

-- RLS for race_environment
alter table race_environment enable row level security;
create policy "Anyone can read race environment" on race_environment for select using (true);


-- General recall support on start classes
alter table start_classes add column if not exists general_recall boolean default false;
alter table start_classes add column if not exists recalled_at timestamptz;
