-- 024_fix_races_insert_policy.sql
-- Migration 022 normalised roles to just ('admin','member'), removing
-- 'race_officer' and 'ood'. But the races INSERT policy still referenced those
-- dead roles, so only 'admin' could ever match — and any club with its owner on
-- role 'member' got "new row violates row-level security policy for table races".
--
-- Fix: a club admin can create races for their club. (OOD is a per-race duty via
-- races.ood_id, not a profile role, so it is not an insert gate.)

DROP POLICY IF EXISTS "Officers can insert races" ON races;
DROP POLICY IF EXISTS "Club members can insert races" ON races;

CREATE POLICY "Club admins can insert races" ON races
  FOR INSERT
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Align UPDATE / DELETE to the same current role model (drop dead-role refs).
DROP POLICY IF EXISTS "Officers can update races" ON races;
DROP POLICY IF EXISTS "Officers can delete races" ON races;

CREATE POLICY "Club admins can update races" ON races
  FOR UPDATE USING (
    created_by = auth.uid()
    OR club_id IN (
      SELECT club_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Club admins can delete races" ON races
  FOR DELETE USING (
    created_by = auth.uid()
    OR club_id IN (
      SELECT club_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
