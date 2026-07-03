# SailClubHQ — Project Review (July 2026)

**Reviewer:** Tag subagent · **Date:** 3 July 2026 · **Scope:** full repo at commit `956856d` + racing/sign-up work in this pass

---

## Architecture Summary

- **Stack:** Next.js (App Router) + Supabase (Postgres, Auth, Realtime), Tailwind, Leaflet for maps. Client-heavy: nearly all pages are `'use client'` components fetching directly via the Supabase browser client; RLS is the effective security boundary.
- **Domain model:** `clubs` → `profiles` (membership via `profiles.club_id`, roles: admin/race_officer/ood/member) → `races` → `start_classes`, `race_entries`, `race_messages`, `course_templates`/`marks`/`course_template_legs`, `race_results`, live tables (`live_positions`, `race_environment`, `gps_tracks`).
- **Public surface:** club homepage `/club/[code]`, public calendar `/races/[code]` (+ `/embed`, `/feed` RSS), token-based race entry `/race/join/[token]`, live nav `/race/live/[token]`.
- **Migrations:** 001–018 in `supabase/migrations/` (numbered, some duplicate numbers e.g. two 002s/003s/etc. — applied manually, no migration runner).

## What Works

- Full race lifecycle: draft → planned → confirmed → live → completed → archived, with role-gated transitions (RLS, migrations 015/017).
- Race creation/edit, start classes with start sequence, course builder with marks/legs and map preview.
- Race entry flow (helm/crew, boat selection/creation, emergency-contact gating) via entry token.
- Live racing Phase 1: GPS watch, course-up map, instruments, start countdown with audio, auto finish/OCS detection, position batching to `live_positions`, realtime general-recall subscription.
- Public calendar, embed and RSS feed. Magic-link + password auth.
- `npx tsc --noEmit` clean; production build passes.

## What Was Broken / Incomplete (fixed in this pass)

1. **Public calendar hid live races** — `/races/[code]` filtered `status in (planned, confirmed, completed)`, so a live race vanished from the public page (despite RLS allowing it since migration 016). Fixed: `live` included, "Racing Now" section, red badge, "📱 Race Nav" link.
2. **Dead links on race detail** — `/race/watch/[token]` and `/race/control/[token]` linked but routes don't exist (404). Replaced with disabled "coming soon" placeholders.
3. **Stale `components/races/RaceCard.tsx`** — used obsolete statuses (`open/active/finished`) removed in migration 004; any race rendered with fallback styling. Updated to current lifecycle.
4. **No re-entry protection / no withdraw** — a user could enter the same race repeatedly; withdrawn boats still blocked the boat-duplicate check and appeared in the crew list. Fixed (see sign-up section).
5. **Duplicate-boat check counted withdrawn entries** (`.maybeSingle()` would also throw on >1 rows). Fixed with `.neq('status','withdrawn').limit(1)`.
6. Pre-existing lint error (unescaped apostrophe) in join page — fixed.

## Race Sign-up (implemented/extended this pass)

The join flow already existed at `/race/join/[token]`. Added:
- **Already-entered detection:** on load, checks for the user's active (non-withdrawn) entry; shows an "You're already entered" card instead of the entry wizard.
- **One-click withdraw:** sets `status='withdrawn'` on own entry (allowed by RLS "Users can update own entries" from migration 015); user can then re-enter.
- **Entry counts:** shown on the join page and on club homepage upcoming-race cards (excludes withdrawn).
- **Migration `018_race_signup.sql`:** partial unique indexes — one active entry per (race, user, role), and one active helm entry per (race, boat). **Needs applying to the live DB** (as do 015–017 if not already applied).

No new table needed — `race_entries` already had `user_id` (migration 015) and per-user RLS.

## Security Concerns

SECURITY-AUDIT.md (2 Jul) found 3 critical / 4 high. Status:
- ✅ C1 (broken `club_members` policies), C2 (gps tables no policies), C3 (live entry not filtered by user), H2 (race_results write policies), H3 (officer profile reads via security-definer fn), H4 (role-gated writes) — addressed in migrations 015–017. **Verify they're applied in production.**
- ⚠️ Still open / notable:
  - Migration 016 grants `authenticated` **SELECT on all races** (`using (true)`) — cross-club race visibility. Low sensitivity but broader than needed; could scope to entry-token-holders.
  - `live_positions` and `race_environment` are world-readable (`using (true)`), and `live_positions` has no update/delete policies — acceptable for spectator features, but positions include user_id.
  - Entry tokens are the sole gate for join/live URLs — anyone with the link can act; fine for club use, document it.
  - H1 middleware: middleware exists but the dashboard redirect was intentionally disabled (commit 7bce8ad) — protection is client-side `AuthGuard` only; data is still RLS-protected.
  - `profiles.medical_notes` readable by officers via H3 policy — consider a stripped view.

## Code Quality Issues

- **Very large client components:** race detail (1050+ lines), live page (~1000), join page (~700). Extract hooks/subcomponents.
- **Start time stored in `notes` as text** (`"Start time: HH:MM"` regex-parsed in 6+ files). Should be a real column; `extractStartTime` is copy-pasted with inconsistent regexes (`^`-anchored in some files, not others).
- **Status label/variant maps duplicated** across ~5 files — centralise.
- **Duplicate migration numbers** (002/003/004/005/006/007) and a drifting `ALL_MIGRATIONS_COMBINED.sql`; no automated migration application — high risk of prod/schema drift.
- Lint: ~20 pre-existing errors (mostly `react-hooks/refs` in map components, unescaped entities) — not build-blocking but should be burned down.
- No tests at all.

## Prioritised Recommendations

1. **Apply migrations 015–018 to production** and verify with a quick RLS smoke test (highest risk is thinking security fixes shipped when they didn't).
2. Adopt Supabase CLI migrations (or at least a single ordered, deduplicated migration folder) to kill schema drift.
3. Move start time out of `notes` into a `start_time` column; delete the regex hack.
4. Narrow migration 016's blanket authenticated read on races.
5. Add basic tests (entry flow, status transitions) + fix the react-hooks lint errors in map components.
6. Build the missing `/race/watch` (spectator) and `/race/control` (OOD) pages — the live module's value is limited without race control.
7. Refactor the three giant page components into hooks + presentational pieces before they grow further.
