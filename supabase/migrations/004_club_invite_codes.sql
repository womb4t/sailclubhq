-- Add invite code to clubs for member signup
alter table clubs add column if not exists invite_code text unique default encode(gen_random_bytes(6), 'hex');

-- Create index for invite code lookups
create index if not exists clubs_invite_code_idx on clubs(invite_code);

-- Allow anyone authenticated to look up a club by invite code (for joining)
create policy "Anyone can look up club by invite code" on clubs for select using (true);
