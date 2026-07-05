-- 023_hide_intro.sql
-- Per-user flag: the intro/tutorial shows to everyone until they hide it.
alter table public.profiles
  add column if not exists hide_intro boolean not null default false;
