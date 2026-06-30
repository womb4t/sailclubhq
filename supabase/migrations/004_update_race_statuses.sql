-- Update race status values to proper lifecycle
alter table races drop constraint if exists races_status_check;
alter table races add constraint races_status_check 
  check (status in ('draft', 'planned', 'confirmed', 'cancelled', 'completed', 'archived'));

-- Migrate existing data
update races set status = 'planned' where status = 'open';
update races set status = 'completed' where status = 'active';
update races set status = 'completed' where status = 'finished';
