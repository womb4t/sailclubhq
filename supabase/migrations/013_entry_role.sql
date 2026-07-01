-- Migration 013: Add role column to race_entries
alter table race_entries add column if not exists role text default 'helm' check (role in ('helm', 'crew'));
-- Add helm_name and phone columns if not already present
alter table race_entries add column if not exists helm_name text;
alter table race_entries add column if not exists phone text;
