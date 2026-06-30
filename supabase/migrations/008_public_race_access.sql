-- Allow anonymous users to read clubs by invite_code (for public race calendar)
-- Note: clubs already has "Anyone can look up club by invite code" from migration 004.
-- This is a no-op if that policy already exists, but we add it defensively for anon role.

-- Allow anonymous read of races for public calendar (planned, confirmed, completed)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'races'
      and policyname = 'Public read of public races'
  ) then
    execute $policy$
      create policy "Public read of public races"
        on races for select
        to anon
        using (status in ('planned', 'confirmed', 'completed'))
    $policy$;
  end if;
end
$$;

-- Ensure anon role can select from clubs (in case the existing policy is authenticated-only)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'clubs'
      and policyname = 'Anon can look up club by invite code'
  ) then
    execute $policy$
      create policy "Anon can look up club by invite code"
        on clubs for select
        to anon
        using (true)
    $policy$;
  end if;
end
$$;
