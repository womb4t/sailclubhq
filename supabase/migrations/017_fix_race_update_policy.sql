-- Migration 017: Fix race update policy
-- Problem: only creator (created_by) or admin can update races
-- But created_by is NULL for races created before migration 006
-- And race_officer/ood roles were excluded

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Race creator or admin can update" ON races;
DROP POLICY IF EXISTS "Race creator or admin can delete" ON races;

-- Replace with role-based policy: admin, race_officer, ood can update any club race
-- Plus the original creator can always update their own
CREATE POLICY "Officers can update races" ON races FOR UPDATE USING (
  created_by = auth.uid()
  OR club_id IN (
    SELECT club_id FROM public.get_user_club_and_role()
    WHERE role IN ('admin', 'race_officer', 'ood')
  )
);

CREATE POLICY "Officers can delete races" ON races FOR DELETE USING (
  created_by = auth.uid()
  OR club_id IN (
    SELECT club_id FROM public.get_user_club_and_role()
    WHERE role IN ('admin', 'race_officer', 'ood')
  )
);

-- Also backfill created_by for existing races where it's NULL
-- Set to the first admin of the club
UPDATE races r
SET created_by = (
  SELECT p.id FROM profiles p
  WHERE p.club_id = r.club_id AND p.role = 'admin'
  LIMIT 1
)
WHERE r.created_by IS NULL;
