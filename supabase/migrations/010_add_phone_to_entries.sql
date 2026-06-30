-- Add helm_name and phone to race_entries
-- helm_name is needed because the boat owner may not be the helm on race day
-- phone is per-entry as it may change race to race

alter table race_entries add column if not exists helm_name text;
alter table race_entries add column if not exists phone text;
