-- Add archive_after_days to race_series (for existing tables)
alter table race_series add column if not exists archive_after_days integer default 365;
