-- ============================================================
-- COMPLETE MIGRATIONS 002-007 (run after initial schema + select fix)
-- Safe to run on a clean DB — uses IF NOT EXISTS / DROP IF EXISTS
-- ============================================================

-- 002: Add start_time to races
ALTER TABLE races ADD COLUMN IF NOT EXISTS start_time time;

-- 002: RLS — insert policies
DROP POLICY IF EXISTS "Users can insert clubs" ON clubs;
CREATE POLICY "Users can insert clubs" ON clubs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own club" ON clubs;
CREATE POLICY "Users can update own club" ON clubs FOR UPDATE USING (
  id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- Marks CRUD
DROP POLICY IF EXISTS "Club members can read marks" ON marks;
CREATE POLICY "Club members can read marks" ON marks FOR SELECT USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Club members can insert marks" ON marks;
CREATE POLICY "Club members can insert marks" ON marks FOR INSERT WITH CHECK (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Club members can update marks" ON marks;
CREATE POLICY "Club members can update marks" ON marks FOR UPDATE USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Club members can delete marks" ON marks;
CREATE POLICY "Club members can delete marks" ON marks FOR DELETE USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);

-- Course templates CRUD
DROP POLICY IF EXISTS "Club members can read course templates" ON course_templates;
CREATE POLICY "Club members can read course templates" ON course_templates FOR SELECT USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Club members can insert course templates" ON course_templates;
CREATE POLICY "Club members can insert course templates" ON course_templates FOR INSERT WITH CHECK (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Club members can update course templates" ON course_templates;
CREATE POLICY "Club members can update course templates" ON course_templates FOR UPDATE USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Club members can delete course templates" ON course_templates;
CREATE POLICY "Club members can delete course templates" ON course_templates FOR DELETE USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);

-- Course template legs CRUD
DROP POLICY IF EXISTS "Club members can read course legs" ON course_template_legs;
CREATE POLICY "Club members can read course legs" ON course_template_legs FOR SELECT USING (
  template_id IN (SELECT id FROM course_templates WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
DROP POLICY IF EXISTS "Club members can insert course legs" ON course_template_legs;
CREATE POLICY "Club members can insert course legs" ON course_template_legs FOR INSERT WITH CHECK (
  template_id IN (SELECT id FROM course_templates WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
DROP POLICY IF EXISTS "Club members can update course legs" ON course_template_legs;
CREATE POLICY "Club members can update course legs" ON course_template_legs FOR UPDATE USING (
  template_id IN (SELECT id FROM course_templates WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
DROP POLICY IF EXISTS "Club members can delete course legs" ON course_template_legs;
CREATE POLICY "Club members can delete course legs" ON course_template_legs FOR DELETE USING (
  template_id IN (SELECT id FROM course_templates WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);

-- Races CRUD
DROP POLICY IF EXISTS "Club members can read races" ON races;
CREATE POLICY "Club members can read races" ON races FOR SELECT USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Club members can insert races" ON races;
CREATE POLICY "Club members can insert races" ON races FOR INSERT WITH CHECK (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);

-- Boats CRUD
DROP POLICY IF EXISTS "Club members can read boats" ON boats;
CREATE POLICY "Club members can read boats" ON boats FOR SELECT USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Club members can insert boats" ON boats;
CREATE POLICY "Club members can insert boats" ON boats FOR INSERT WITH CHECK (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Club members can update boats" ON boats;
CREATE POLICY "Club members can update boats" ON boats FOR UPDATE USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
);

-- Start classes
DROP POLICY IF EXISTS "Club members can read start classes" ON start_classes;
CREATE POLICY "Club members can read start classes" ON start_classes FOR SELECT USING (
  race_id IN (SELECT id FROM races WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
DROP POLICY IF EXISTS "Club members can insert start classes" ON start_classes;
CREATE POLICY "Club members can insert start classes" ON start_classes FOR INSERT WITH CHECK (
  race_id IN (SELECT id FROM races WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
DROP POLICY IF EXISTS "Club members can update start classes" ON start_classes;
CREATE POLICY "Club members can update start classes" ON start_classes FOR UPDATE USING (
  race_id IN (SELECT id FROM races WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
DROP POLICY IF EXISTS "Club members can delete start classes" ON start_classes;
CREATE POLICY "Club members can delete start classes" ON start_classes FOR DELETE USING (
  race_id IN (SELECT id FROM races WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);

-- Race entries
DROP POLICY IF EXISTS "Club members can read race entries" ON race_entries;
CREATE POLICY "Club members can read race entries" ON race_entries FOR SELECT USING (
  race_id IN (SELECT id FROM races WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
DROP POLICY IF EXISTS "Club members can insert race entries" ON race_entries;
CREATE POLICY "Club members can insert race entries" ON race_entries FOR INSERT WITH CHECK (
  race_id IN (SELECT id FROM races WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);

-- Race results
DROP POLICY IF EXISTS "Club members can read race results" ON race_results;
CREATE POLICY "Club members can read race results" ON race_results FOR SELECT USING (
  race_entry_id IN (SELECT id FROM race_entries WHERE race_id IN (SELECT id FROM races WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())))
);

-- ============================================================
-- 003: Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'admin');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 004: Club invite codes
-- ============================================================
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS invite_code text UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex');
CREATE INDEX IF NOT EXISTS clubs_invite_code_idx ON clubs(invite_code);

-- ============================================================
-- 005: Unique club names (case-insensitive)
-- ============================================================
DELETE FROM clubs a USING clubs b WHERE a.id > b.id AND lower(a.name) = lower(b.name);
CREATE UNIQUE INDEX IF NOT EXISTS clubs_name_unique ON clubs (lower(name));

-- ============================================================
-- 006: Race ownership (created_by)
-- ============================================================
ALTER TABLE races ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Club members can update races" ON races;
DROP POLICY IF EXISTS "Club members can delete races" ON races;

CREATE POLICY "Race creator or admin can update" ON races FOR UPDATE USING (
  created_by = auth.uid()
  OR club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Race creator or admin can delete" ON races FOR DELETE USING (
  created_by = auth.uid()
  OR club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================
-- 007: Mark audit trail + race snapshots
-- ============================================================
ALTER TABLE marks ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS mark_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mark_id uuid REFERENCES marks(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  reason text NOT NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text
);

ALTER TABLE mark_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club members can read mark changes" ON mark_changes;
CREATE POLICY "Club members can read mark changes" ON mark_changes FOR SELECT USING (
  mark_id IN (SELECT id FROM marks WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
DROP POLICY IF EXISTS "Club members can insert mark changes" ON mark_changes;
CREATE POLICY "Club members can insert mark changes" ON mark_changes FOR INSERT WITH CHECK (
  mark_id IN (SELECT id FROM marks WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
CREATE INDEX IF NOT EXISTS mark_changes_mark_id_idx ON mark_changes(mark_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS race_mark_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid REFERENCES races(id) ON DELETE CASCADE,
  mark_id uuid REFERENCES marks(id) ON DELETE SET NULL,
  name text NOT NULL,
  short_id text NOT NULL,
  lat numeric(10,7) NOT NULL,
  lon numeric(10,7) NOT NULL,
  type text NOT NULL,
  default_rounding text NOT NULL,
  snapped_at timestamptz DEFAULT now()
);

ALTER TABLE race_mark_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club members can read race mark snapshots" ON race_mark_snapshots;
CREATE POLICY "Club members can read race mark snapshots" ON race_mark_snapshots FOR SELECT USING (
  race_id IN (SELECT id FROM races WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
DROP POLICY IF EXISTS "Club members can insert race mark snapshots" ON race_mark_snapshots;
CREATE POLICY "Club members can insert race mark snapshots" ON race_mark_snapshots FOR INSERT WITH CHECK (
  race_id IN (SELECT id FROM races WHERE club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);
CREATE INDEX IF NOT EXISTS race_mark_snapshots_race_idx ON race_mark_snapshots(race_id);
