-- Sail Club HQ — Initial Schema
-- Migration 001

-- Clubs
create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vhf_channel text,
  created_at timestamptz default now()
);

-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  club_id uuid references clubs(id),
  role text check (role in ('admin', 'race_officer', 'ood', 'competitor')) default 'competitor',
  created_at timestamptz default now()
);

-- Boats
create table boats (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  owner_name text not null,
  boat_name text not null,
  length_m numeric(5,2),
  sail_number text,
  created_at timestamptz default now(),
  unique(club_id, boat_name, owner_name)
);

-- Marks catalogue
create table marks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  race_id uuid, -- null = catalogue mark
  name text not null,
  short_id text not null, -- single letter/number for course board display
  lat numeric(10,7) not null,
  lon numeric(10,7) not null,
  type text check (type in ('virtual', 'physical')) default 'virtual',
  source text check (source in ('catalogue', 'race')) default 'catalogue',
  default_rounding text check (default_rounding in ('port', 'starboard')) default 'port',
  photo_url text,
  notes text,
  created_at timestamptz default now()
);

-- Course templates (named, reusable)
create table course_templates (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  name text not null, -- e.g. "Course A", "Course B"
  laps integer, -- null = average laps
  expected_wind_dir integer, -- degrees, for RYA code derivation
  notes text,
  created_at timestamptz default now()
);

-- Course template legs (ordered marks with rounding side on the LEG not the mark)
create table course_template_legs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references course_templates(id) on delete cascade,
  sequence_index integer not null,
  mark_id uuid references marks(id),
  rounding_side text check (rounding_side in ('port', 'starboard')) default 'port',
  -- rounding_side lives HERE (on the leg), not on the mark
  constraint unique_leg_order unique(template_id, sequence_index)
);

-- Races
create table races (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  name text not null,
  race_number integer,
  series text,
  race_date date not null,
  notes text,
  safety_info text,
  vhf_channel text,
  status text check (status in ('draft', 'open', 'active', 'finished')) default 'draft',
  entry_token text unique default encode(gen_random_bytes(16), 'hex'),
  course_template_id uuid references course_templates(id),
  created_at timestamptz default now()
);

-- Start classes (multiple classes per race with staggered guns)
create table start_classes (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references races(id) on delete cascade,
  name text not null,
  class_flag text,
  prep_flag text check (prep_flag in ('P', 'I', 'U', 'Black')) default 'P',
  start_time timestamptz not null,
  sequence_warning_mins integer default 5
);

-- Race entries
create table race_entries (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references races(id) on delete cascade,
  boat_id uuid references boats(id),
  class_id uuid references start_classes(id),
  phone_offset_from_bow_m numeric(4,2) default 4.0,
  status text check (status in ('entered', 'racing', 'withdrawn', 'DNF', 'OCS', 'protest')) default 'entered',
  created_at timestamptz default now()
);

-- GPS tracks
create table gps_tracks (
  id uuid primary key default gen_random_uuid(),
  race_entry_id uuid references race_entries(id) on delete cascade,
  uploaded_at timestamptz default now()
);

create table gps_track_points (
  id bigserial primary key,
  track_id uuid references gps_tracks(id) on delete cascade,
  t timestamptz not null,
  lat numeric(10,7) not null,
  lon numeric(10,7) not null,
  speed_ms numeric(6,3),
  cog_deg numeric(6,2),
  accuracy_m numeric(6,2)
);

-- Race results
create table race_results (
  id uuid primary key default gen_random_uuid(),
  race_entry_id uuid references race_entries(id) on delete cascade,
  start_status text check (start_status in ('clean', 'ocs-confident', 'too-close-to-call')),
  start_time timestamptz,
  finish_time timestamptz,
  elapsed_seconds numeric(10,3),
  rank integer,
  status text check (status in ('finished', 'OCS', 'DNF', 'protest')) default 'finished',
  is_provisional boolean default true,
  protest boolean default false,
  detection_flags jsonb,
  created_at timestamptz default now()
);

-- Row level security
alter table clubs enable row level security;
alter table profiles enable row level security;
alter table boats enable row level security;
alter table marks enable row level security;
alter table course_templates enable row level security;
alter table course_template_legs enable row level security;
alter table races enable row level security;
alter table start_classes enable row level security;
alter table race_entries enable row level security;
alter table race_results enable row level security;

-- Basic RLS policies (permissive for MVP, tighten later)
create policy "Users can read their club data" on clubs for select using (
  id in (select club_id from profiles where id = auth.uid())
);
create policy "Users can read own profile" on profiles for select using (id = auth.uid());
create policy "Users can update own profile" on profiles for update using (id = auth.uid());

-- Indexes for common queries
create index on marks(club_id);
create index on races(club_id, race_date desc);
create index on race_entries(race_id);
create index on gps_track_points(track_id, t);
