-- Migration 012: Extend profiles and boats tables for competitor management

-- Extend profiles
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists emergency_contact_name text;
alter table profiles add column if not exists emergency_contact_phone text;
alter table profiles add column if not exists emergency_contact_relation text;
alter table profiles add column if not exists medical_notes text;
alter table profiles add column if not exists rya_number text;
alter table profiles add column if not exists experience_level text; -- novice/intermediate/experienced/instructor
alter table profiles add column if not exists profile_complete boolean default false;

-- Extend boats
alter table boats add column if not exists owner_id uuid references auth.users(id);
alter table boats add column if not exists class text;
alter table boats add column if not exists hull_colour text;
alter table boats add column if not exists py_handicap integer;
alter table boats add column if not exists status text default 'active'; -- active/laid_up/for_sale
-- Make owner_name nullable for unclaimed boats
alter table boats alter column owner_name drop not null;
