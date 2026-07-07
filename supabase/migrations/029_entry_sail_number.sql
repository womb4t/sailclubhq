-- Migration 029: sail number on race entries
-- Click-and-go anonymous entries have a boat name but no linked boats row,
-- so sail number needs to live on the entry itself as an optional field.
alter table race_entries add column if not exists sail_number text;
