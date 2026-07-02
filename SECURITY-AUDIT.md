# Sail Club HQ — Security Audit

**Date:** 2 July 2026
**Auditor:** Tag (AI CEO, Global Cover Network Ltd)
**Scope:** Full codebase — RLS, auth, data exposure, tokens, privacy, headers

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 3 |
| 🟠 High | 4 |
| 🟡 Medium | 5 |
| 🔵 Low | 3 |

**Overall risk: HIGH.** Three critical issues need fixing before real users touch this. The good news: no service_role key exposure, no XSS, no SQL injection. The problems are RLS gaps and missing auth checks.

---

## 🔴 Critical Issues

### C1. `club_members` table doesn't exist — RLS policies broken

**Migration 009** references `club_members` in all its RLS policies for boats and race_entries. **This table was never created.** The app uses `profiles.club_id` for club membership, not a separate `club_members` table.

**Impact:** If migration 009 was applied, the policies would fail silently (always deny) because the subquery against a non-existent table returns nothing. If it wasn't applied, there are NO update/delete policies on race_entries and NO policies at all for the auth-scoped boat operations.

**Files:** `supabase/migrations/009_race_entries_rls.sql`

**Fix:** Rewrite migration 009 to use `profiles` instead of `club_members`:

```sql
-- Replace all occurrences of:
select club_id from club_members where user_id = auth.uid()
-- With:
select club_id from profiles where id = auth.uid()

-- And replace all occurrences of:
inner join club_members cm on cm.club_id = r.club_id and cm.user_id = auth.uid()
-- With:
inner join profiles p on p.club_id = r.club_id and p.id = auth.uid()
```

---

### C2. `gps_tracks` and `gps_track_points` — NO RLS policies

Both tables have RLS **enabled** (in migration 001) but **zero policies**. This means:
- Nobody can read, insert, update, or delete anything (default deny)
- Any future code that tries to use these tables will silently fail

**Impact:** Non-functional for now, but when results/track replay is built, this will block everything or (worse) someone might disable RLS as a "fix".

**Files:** `supabase/migrations/001_initial_schema.sql`

**Fix — new migration 015:**
```sql
-- GPS tracks: owner can write, club can read
create policy "Users can insert own tracks" on gps_tracks
  for insert with check (
    race_entry_id in (
      select id from race_entries where race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid()
        )
      )
    )
  );

create policy "Club members can read tracks" on gps_tracks
  for select using (
    race_entry_id in (
      select id from race_entries where race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid()
        )
      )
    )
  );

-- Track points: same scope
create policy "Users can insert track points" on gps_track_points
  for insert with check (
    track_id in (select id from gps_tracks where race_entry_id in (
      select id from race_entries where race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid()
        )
      )
    ))
  );

create policy "Club members can read track points" on gps_track_points
  for select using (
    track_id in (select id from gps_tracks where race_entry_id in (
      select id from race_entries where race_id in (
        select id from races where club_id in (
          select club_id from profiles where id = auth.uid()
        )
      )
    ))
  );
```

---

### C3. Live race entry query doesn't filter by user

In `app/race/live/[token]/page.tsx` (line ~345), the entry fetch is:
```typescript
.from('race_entries')
.select('id, helm_name, finish_time, laps_completed')
.eq('race_id', raceData.id)
.limit(1)
.maybeSingle()
```

**No `.eq('user_id', user.id)` filter.** This returns the first entry for the race, which could be **someone else's entry**. The user would then be tracking/recording GPS against another competitor's entry.

**Impact:** Wrong competitor gets position data, finish times, and status updates. Data integrity compromise.

**Fix:** Either add `user_id` to `race_entries` (needs a migration) or join through `boats.owner_id`:
```typescript
// Quick fix: filter through boat ownership (not perfect for crew)
.from('race_entries')
.select('id, helm_name, finish_time, laps_completed, boat:boats!inner(owner_id)')
.eq('race_id', raceData.id)
.eq('boats.owner_id', user.id)
.limit(1)
.maybeSingle()
```

**Better fix — add `user_id` to race_entries:**
```sql
alter table race_entries add column if not exists user_id uuid references auth.users(id);
```
Then filter: `.eq('user_id', user.id)`

---

## 🟠 High Issues

### H1. No middleware — all route protection is client-side only

There is no `middleware.ts`. All auth gating is via `AuthGuard` (a client component that redirects with `window.location.href`). This means:

- **SSR/server-rendered pages are unprotected** — a direct fetch to `/dashboard/*` returns the page HTML before JS runs
- A bot or scraper can read dashboard page source
- Not a data breach (data is fetched client-side via Supabase which enforces RLS), but the page scaffolding is exposed

**Fix:** Add `middleware.ts` at project root:
```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('sb-lbmwshvhbraoajjbqgwe-auth-token')
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = { matcher: ['/dashboard/:path*'] }
```

---

### H2. `race_results` has no INSERT/UPDATE/DELETE policies

`race_results` has RLS enabled and a SELECT policy, but no write policies. When results calculation is built, writes will silently fail unless this is fixed.

**Fix:** Add write policies scoped to club admin/race_officer roles.

---

### H3. `profiles` table — medical notes readable by the user only, but no restriction from admins in same club

The current RLS is: `"Users can read own profile" using (id = auth.uid())`. This correctly limits reads to the owner. **BUT** there's no policy allowing race officers or admins to read emergency contacts during a race.

**In a real emergency, the OOD needs to see emergency_contact_name, emergency_contact_phone, and medical_notes.**

**Fix — add a restricted read policy for admins/OOD:**
```sql
create policy "Admins can read club member profiles" on profiles
  for select using (
    club_id in (
      select club_id from profiles
      where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
    )
  );
```

Consider also creating a `profiles_safe` view that strips `medical_notes` for general use.

---

### H4. No role-based authorization — any club member can do everything

The `role` column on profiles (`admin`, `race_officer`, `ood`, `competitor`) is stored but **never enforced**. Any authenticated club member can:
- Create, edit, delete races
- Delete other people's race entries
- Post/delete race messages
- Manage start classes
- Create/edit/delete course templates and marks
- Change club settings

**Impact:** A competitor could delete someone else's race entry, edit race details, or post fake announcements.

**Fix (phased):**
1. **Immediate:** Add RLS checks for write operations:
```sql
-- Example: only admin/race_officer/ood can create races
drop policy if exists "Club members can insert races" on races;
create policy "Officers can insert races" on races for insert with check (
  club_id in (
    select club_id from profiles
    where id = auth.uid() and role in ('admin', 'race_officer', 'ood')
  )
);
```
2. **Later:** Apply same pattern to race updates, start classes, course templates, marks

---

## 🟡 Medium Issues

### M1. Entry token is guessable within constraints

Entry tokens are `encode(gen_random_bytes(16), 'hex')` — 32 hex chars, 128 bits of entropy. **This is fine.** However:

- Tokens are exposed in URLs shared publicly (club homepage, embed)
- Anyone with the token can view the race and (if authenticated) enter it
- There's no rate limiting on token lookups

**Impact:** Low risk for guessing. Medium risk for token leakage via URL sharing, browser history, referrer headers.

**Recommendation:** Add `Referrer-Policy: no-referrer` header. Consider making entry require both token + club membership.

---

### M2. `live_positions` readable by everyone (including anon)

The RLS policy is: `"Anyone can read race positions" on live_positions for select using (true)`

This means unauthenticated users can query GPS positions for any race. While spectator tracking is intentional, this exposes real-time location data for all competitors to the entire internet.

**Privacy concern:** Competitor GPS tracks contain precise personal location data. In some jurisdictions (GDPR), this is personal data requiring consent.

**Fix:** Either:
1. Scope to authenticated users in the same club
2. Add a `public_tracking` boolean on races — only expose positions for races where the organiser opted in
3. At minimum, document this as a privacy consideration and get user consent during race entry

---

### M3. Embed iframe allows framing from any origin

`X-Frame-Options: ALLOWALL` and `frame-ancestors *` on `/races/*/embed` means any website can embed the race calendar. This is likely intentional but carries clickjacking risk.

**Recommendation:** Consider allowing clubs to specify allowed embedding domains, or at minimum document this as a deliberate choice.

---

### M4. No CSRF protection beyond Supabase auth tokens

All mutations go through the Supabase client using the auth JWT. Supabase handles this via the Authorization header (not cookies for mutations), so CSRF is largely mitigated. However, `supabase.auth.getSession()` reads from cookies.

**Risk:** Low — Supabase's architecture handles this reasonably well.

---

### M5. Boat deletion has no cascade protection

Any club member can delete any boat in the club (via the `Club members can delete boats` policy from migration 002). If a boat has race entries, this could cascade-fail or orphan entries.

**Fix:** Either prevent deletion of boats with existing entries, or restrict deletion to the boat owner.

---

## 🔵 Low Issues

### L1. Duplicate/conflicting migrations

Several migration files share the same number prefix:
- Two `002_` files
- Two `003_` files
- Two `004_` files
- Two `005_` files
- Two `006_` files
- Two `007_` files

While this works when applied manually in order, it's confusing and error-prone.

**Fix:** Renumber to sequential unique numbers.

---

### L2. `service_role` key in `.env.local`

The Supabase service_role key is in `.env.local`. It's correctly `.gitignore`'d and never used in client code. No current code references it.

**Risk:** Minimal — it exists for future server-side operations. Just ensure it's never imported in any `'use client'` file.

---

### L3. No security headers beyond embed

`next.config.ts` only sets headers for the embed route. Missing:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Strict-Transport-Security` (Vercel handles this, but explicit is better)

**Fix:** Add global headers in `next.config.ts`:
```typescript
{
  source: '/(.*)',
  headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  ],
},
```

---

## RLS Audit Table

| Table | RLS Enabled? | SELECT | INSERT | UPDATE | DELETE | Risk |
|---|---|---|---|---|---|---|
| clubs | ✅ | ✅ (own club + anon) | ✅ (any auth) | ✅ (own club) | ❌ | 🟡 Any auth user can create clubs |
| profiles | ✅ | ✅ (own only) | ✅ (own only) | ✅ (own only) | ❌ | 🟠 Admins can't see emergency contacts |
| boats | ✅ | ✅ (club) | ✅ (club) | ✅ (club) | ✅ (club) | 🟡 Any member can edit/delete any boat |
| marks | ✅ | ✅ (club) | ✅ (club) | ✅ (club) | ✅ (club) | ✅ OK |
| course_templates | ✅ | ✅ (club) | ✅ (club) | ✅ (club) | ✅ (club) | ✅ OK |
| course_template_legs | ✅ | ✅ (club) | ✅ (club) | ✅ (club) | ✅ (club) | ✅ OK |
| races | ✅ | ✅ (club + anon for public) | ✅ (club) | ✅ (creator/admin) | ✅ (creator/admin) | ✅ OK |
| start_classes | ✅ | ✅ (club) | ✅ (club) | ✅ (club) | ✅ (club) | 🟡 No role check |
| race_entries | ✅ | ✅ (club) | ✅ (club) | ⚠️ 009 broken | ⚠️ 009 broken | 🔴 Broken policies |
| race_results | ✅ | ✅ (club) | ❌ | ❌ | ❌ | 🟠 No write policies |
| race_series | ✅ | ✅ (club) | ✅ (club) | ✅ (club) | ✅ (club) | ✅ OK |
| race_messages | ✅ | ✅ (club + anon) | ✅ (club) | ❌ | ✅ (club) | 🟡 Any member can delete |
| mark_changes | ✅ | ✅ (club) | ✅ (club) | ❌ | ❌ | ✅ OK (audit log) |
| race_mark_snapshots | ✅ | ✅ (club) | ✅ (club) | ❌ | ❌ | ✅ OK |
| gps_tracks | ✅ | ❌ | ❌ | ❌ | ❌ | 🔴 No policies at all |
| gps_track_points | ✅ | ❌ | ❌ | ❌ | ❌ | 🔴 No policies at all |
| live_positions | ✅ | ✅ (anyone) | ✅ (own) | ❌ | ❌ | 🟡 Public GPS data |
| race_environment | ✅ | ✅ (anyone) | ❌ | ❌ | ❌ | ✅ OK (read-only cache) |

---

## Positive Findings

1. ✅ **No XSS** — zero use of `dangerouslySetInnerHTML` or raw HTML injection
2. ✅ **No SQL injection** — all queries via Supabase JS client (parameterized)
3. ✅ **Service role key not in client code** — only anon key used browser-side
4. ✅ **`.env.local` gitignored** — secrets not in repo
5. ✅ **Entry tokens are cryptographically strong** — 128-bit random
6. ✅ **AuthGuard protects dashboard routes** — client-side but functional
7. ✅ **Race entry requires authentication** — properly gated
8. ✅ **Profile update restricted to own profile** — can't edit others

---

## Priority Fix Order

1. **C1** — Fix migration 009 (`club_members` → `profiles`) — **blocks real use**
2. **C3** — Add `user_id` to race_entries, fix live race entry query — **data integrity**
3. **C2** — Add RLS to gps_tracks/gps_track_points — **before results feature**
4. **H4** — Role-based write restrictions — **before multi-user clubs**
5. **H1** — Add middleware.ts — **quick win**
6. **H3** — Emergency contact visibility for admins — **safety critical**
7. **M2** — GPS privacy consent/controls — **before GDPR-scope users**
