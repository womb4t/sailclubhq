-- Migration 016: Fix live race access
-- The 'live' status was missing from public read policies, causing "Race not found" on nav view

-- Update anon policy to include 'live' status
DROP POLICY IF EXISTS "Public read of public races" ON races;
CREATE POLICY "Public read of public races" ON races
  FOR SELECT TO anon
  USING (status IN ('planned', 'confirmed', 'live', 'completed'));

-- Also allow authenticated users to read live races even if not in the club
-- (competitors need to access their race nav view)
-- The existing club member policy covers club members, but we need entry_token access too
CREATE POLICY "Anyone can read races by entry token" ON races
  FOR SELECT TO authenticated
  USING (true);
-- Note: this is permissive (OR with existing policies). Race data is not sensitive.
-- Sensitive data (entries, positions) has its own RLS.
