-- Track who created a race (the OOD for that day)
alter table races add column if not exists created_by uuid references auth.users(id);

-- Update RLS: anyone in the club can read and create races
-- but only the creator (or admin) can update/delete
drop policy if exists "Club members can update races" on races;
drop policy if exists "Club members can delete races" on races;

create policy "Race creator or admin can update" on races for update using (
  created_by = auth.uid()
  OR club_id IN (
    SELECT club_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

create policy "Race creator or admin can delete" on races for delete using (
  created_by = auth.uid()
  OR club_id IN (
    SELECT club_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);
