-- Prevent duplicate club names (case-insensitive)
-- First, clean up any existing duplicates by keeping the oldest
DELETE FROM clubs a USING clubs b
WHERE a.id > b.id AND lower(a.name) = lower(b.name);

-- Add unique constraint
CREATE UNIQUE INDEX clubs_name_unique ON clubs (lower(name));
