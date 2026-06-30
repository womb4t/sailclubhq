-- Club-level archive setting (months after completion)
alter table clubs add column if not exists archive_after_months integer default 12;
