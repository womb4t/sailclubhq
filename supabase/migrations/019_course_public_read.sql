-- Migration 019: Public/competitor read access to course data
-- Problem: marks, course_templates, course_template_legs had no policy allowing
-- anon or cross-club authenticated users to read them. The live race nav page
-- (reachable by entry token) therefore showed no course for anyone who isn't a
-- member of the owning club — the race loaded but the course/marks were empty.
--
-- Fix:
--  * Authenticated users can read all course data (logged-in competitors need the
--    course for any race they've been given a token to; course geometry is not
--    sensitive). Mirrors migration 016's "authenticated can read all races".
--  * Anon can read course data belonging to a course_template that is referenced
--    by a publicly-visible race (planned/confirmed/live/completed) — so the public
--    calendar + token nav view render the course without a login.

-- ── marks ────────────────────────────────────────────────────────────────────
drop policy if exists "Authenticated can read marks" on marks;
create policy "Authenticated can read marks" on marks
  for select to authenticated using (true);

drop policy if exists "Public can read marks of public-race courses" on marks;
create policy "Public can read marks of public-race courses" on marks
  for select to anon using (
    id in (
      select l.mark_id from course_template_legs l
      where l.template_id in (
        select r.course_template_id from races r
        where r.course_template_id is not null
          and r.status in ('planned','confirmed','live','completed')
      )
    )
  );

-- ── course_templates ─────────────────────────────────────────────────────────
drop policy if exists "Authenticated can read course templates" on course_templates;
create policy "Authenticated can read course templates" on course_templates
  for select to authenticated using (true);

drop policy if exists "Public can read course templates of public races" on course_templates;
create policy "Public can read course templates of public races" on course_templates
  for select to anon using (
    id in (
      select r.course_template_id from races r
      where r.course_template_id is not null
        and r.status in ('planned','confirmed','live','completed')
    )
  );

-- ── course_template_legs ─────────────────────────────────────────────────────
drop policy if exists "Authenticated can read course legs" on course_template_legs;
create policy "Authenticated can read course legs" on course_template_legs
  for select to authenticated using (true);

drop policy if exists "Public can read legs of public-race courses" on course_template_legs;
create policy "Public can read legs of public-race courses" on course_template_legs
  for select to anon using (
    template_id in (
      select r.course_template_id from races r
      where r.course_template_id is not null
        and r.status in ('planned','confirmed','live','completed')
    )
  );

-- Verify after running:
--   set role anon; select count(*) from marks;  -- should now return course marks
