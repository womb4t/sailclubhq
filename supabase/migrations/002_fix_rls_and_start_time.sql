-- Add start_time to races
alter table races add column if not exists start_time time;

-- ============================================================
-- RLS POLICIES — allow CRUD for club members
-- ============================================================

-- CLUBS: allow insert (user creates their own club on first use)
create policy "Users can insert clubs" on clubs for insert with check (true);
create policy "Users can update own club" on clubs for update using (
  id in (select club_id from profiles where id = auth.uid())
);

-- PROFILES: allow insert (new user creates profile)
create policy "Users can insert own profile" on profiles for insert with check (id = auth.uid());

-- MARKS: full CRUD for club members
alter table marks enable row level security;
create policy "Club members can read marks" on marks for select using (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can insert marks" on marks for insert with check (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can update marks" on marks for update using (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can delete marks" on marks for delete using (
  club_id in (select club_id from profiles where id = auth.uid())
);

-- COURSE TEMPLATES: full CRUD for club members
alter table course_templates enable row level security;
create policy "Club members can read course templates" on course_templates for select using (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can insert course templates" on course_templates for insert with check (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can update course templates" on course_templates for update using (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can delete course templates" on course_templates for delete using (
  club_id in (select club_id from profiles where id = auth.uid())
);

-- COURSE TEMPLATE LEGS: full CRUD for club members
alter table course_template_legs enable row level security;
create policy "Club members can read course legs" on course_template_legs for select using (
  template_id in (select id from course_templates where club_id in (select club_id from profiles where id = auth.uid()))
);
create policy "Club members can insert course legs" on course_template_legs for insert with check (
  template_id in (select id from course_templates where club_id in (select club_id from profiles where id = auth.uid()))
);
create policy "Club members can update course legs" on course_template_legs for update using (
  template_id in (select id from course_templates where club_id in (select club_id from profiles where id = auth.uid()))
);
create policy "Club members can delete course legs" on course_template_legs for delete using (
  template_id in (select id from course_templates where club_id in (select club_id from profiles where id = auth.uid()))
);

-- RACES: full CRUD for club members
create policy "Club members can read races" on races for select using (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can insert races" on races for insert with check (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can update races" on races for update using (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can delete races" on races for delete using (
  club_id in (select club_id from profiles where id = auth.uid())
);

-- BOATS: full CRUD for club members
alter table boats enable row level security;
create policy "Club members can read boats" on boats for select using (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can insert boats" on boats for insert with check (
  club_id in (select club_id from profiles where id = auth.uid())
);
create policy "Club members can update boats" on boats for update using (
  club_id in (select club_id from profiles where id = auth.uid())
);

-- START CLASSES: CRUD via race -> club
create policy "Club members can read start classes" on start_classes for select using (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);
create policy "Club members can insert start classes" on start_classes for insert with check (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);

-- RACE ENTRIES: CRUD via race -> club
create policy "Club members can read race entries" on race_entries for select using (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);
create policy "Club members can insert race entries" on race_entries for insert with check (
  race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid()))
);

-- RACE RESULTS: read via race -> club
create policy "Club members can read race results" on race_results for select using (
  race_entry_id in (select id from race_entries where race_id in (select id from races where club_id in (select club_id from profiles where id = auth.uid())))
);
