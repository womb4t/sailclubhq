# Sail Club HQ — Competitor Experience & Race Module Plan

## 1. Club Registration & Onboarding

### 1.1 Sign-Up Flow
- Visitor lands on **club homepage** (`/club/{code}`)
- Clicks **Register** → `/register?join={code}`
- Creates account (email + password)
- Automatically joins the club via invite code
- Redirected to **profile setup** (mandatory before entering any race)

### 1.2 Profile Setup (`/dashboard/profile`)
**Personal details:**
- Full name
- Email (pre-filled from auth)
- Phone number (emergency contact)
- Date of birth (optional — some clubs need for junior/youth categories)
- RYA membership number (optional)
- Sailing experience level (dropdown: Novice / Intermediate / Experienced / Instructor)

**Emergency contact:**
- Contact name
- Contact phone
- Relationship (e.g. spouse, parent)
- Medical notes (optional, e.g. allergies, conditions — stored encrypted/private)

**Profile photo** (optional — useful for race officer recognition)

### 1.3 Data Model
Extend `profiles` table:
```sql
alter table profiles add column phone text;
alter table profiles add column date_of_birth date;
alter table profiles add column rya_number text;
alter table profiles add column experience_level text; -- novice/intermediate/experienced/instructor
alter table profiles add column emergency_contact_name text;
alter table profiles add column emergency_contact_phone text;
alter table profiles add column emergency_contact_relation text;
alter table profiles add column medical_notes text; -- encrypted at rest
alter table profiles add column profile_photo_url text;
alter table profiles add column profile_complete boolean default false;
```

---

## 2. Boat Profiles

### 2.1 My Boats (`/dashboard/boats`)
Each member can register one or more boats. Boat records are club-scoped (shared if co-owned).

**Boat details:**
- Boat name
- Boat class (dropdown from club's registered classes + custom)
- Sail number
- Hull colour (helps race officers identify boats)
- Length (metres, optional)
- PY/handicap number (club can set default per class, owner can override)
- Photo (optional)
- Status: Active / Laid up / For sale

### 2.2 Data Model
Extend existing `boats` table:
```sql
alter table boats add column class text;
alter table boats add column hull_colour text;
alter table boats add column py_handicap integer;
alter table boats add column photo_url text;
alter table boats add column status text default 'active'; -- active/laid_up/for_sale
alter table boats add column owner_id uuid references auth.users(id);
```

### 2.3 Boat Classes (club-managed)
New table for club-defined boat classes with default handicaps:
```sql
create table boat_classes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  name text not null, -- e.g. "Laser", "RS200", "Topper", "Cruiser"
  default_py integer, -- Portsmouth Yardstick
  is_dinghy boolean default true, -- vs keelboat/cruiser
  is_active boolean default true,
  constraint unique_class_name unique(club_id, name)
);
```

---

## 3. Crew System

### 3.1 Crew Sign-Up (per race)
When entering a race, the helm can:
- **Add crew** by name (manual entry)
- **Invite crew** from club members (type-ahead search)
- **Request crew** from the crew pool (see below)

Each race entry stores:
```sql
create table race_entry_crew (
  id uuid primary key default gen_random_uuid(),
  race_entry_id uuid references race_entries(id) on delete cascade,
  member_id uuid references auth.users(id), -- null if external/non-member crew
  crew_name text not null,
  role text default 'crew', -- helm/crew/bowman/trimmer/tactician
  weight_kg numeric(5,1), -- optional, relevant for some classes
  confirmed boolean default false, -- true once the crew member accepts
  created_at timestamptz default now()
);
```

### 3.2 Crew Pool (`/dashboard/crew-pool`)
A club-wide "looking for crew / looking for a boat" board.

**Posting options:**
- **"I need crew"** — helm posts their boat, race/date, positions needed
- **"I'm available"** — crew member posts their availability, experience, preferred positions

**Each posting:**
```sql
create table crew_pool (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  member_id uuid references auth.users(id),
  type text check (type in ('need_crew', 'available')),
  race_id uuid references races(id), -- optional, can be general availability
  boat_id uuid references boats(id), -- for 'need_crew' posts
  positions_needed integer default 1,
  preferred_role text, -- for 'available' posts
  notes text,
  date_available date, -- for general availability
  is_active boolean default true,
  created_at timestamptz default now()
);
```

**Matching:** Show "Available crew" alongside "Needs crew" posts. Members can message each other (or a simple "I'm interested" button that notifies the poster).

### 3.3 Crew Pool UX
- Dashboard card: "🤝 Crew Pool — 3 boats looking for crew, 5 sailors available"
- Filter by date, boat class, experience level
- One-tap "I'm interested" → notifies the poster
- Auto-expires after the race date passes

---

## 4. Race Module (Full Lifecycle)

### 4.1 Pre-Race

**Race Setup** (race officer / admin) — *already built*:
- Date, time, name, series, course
- Start classes with timing sequence
- Race messages / announcements

**Race Entry** — *partially built, enhance*:
- Competitor enters via club homepage or direct link
- Selects boat from "My Boats" (or adds new)
- Selects start class (if multiple)
- Adds crew (from members or manual)
- Emergency contact shown/confirmed
- Entry fee collection (future — Stripe integration)
- Entry confirmation with QR code (for check-in at the club)

**Pre-Race Dashboard** (race officer view):
- Entry list with all boats, helms, crew
- Print-ready entry list (for pinning in the clubhouse)
- Export to CSV
- Start sequence timing sheet
- Weather briefing (auto-pulled from wttr.in for club location)
- Safety checklist

### 4.2 Race Day

**Check-In:**
- QR code scanning at the club (future)
- Manual check-in toggle per entry
- Late entries on the day
- Withdrawals

**On-The-Water:**
- Start sequence timer (countdown display for race officers)
- OCS tracking (mark boats over the line)
- Live status updates via race messages (visible on public page)

**Finish Recording:**
- Record finish times per boat (manual entry)
- Record DNF, OCS, DNS, protest flags
- Simple interface: tap boat name → timestamp recorded

```sql
create table race_results (
  id uuid primary key default gen_random_uuid(),
  race_entry_id uuid references race_entries(id) on delete cascade,
  finish_time timestamptz,
  elapsed_seconds integer, -- calculated from class start to finish
  corrected_seconds integer, -- after PY/handicap correction
  position integer, -- final position after corrections
  status text default 'finished', -- finished/DNF/DNS/OCS/DSQ/RET
  protest_flag boolean default false,
  notes text,
  created_at timestamptz default now()
);
```

### 4.3 Post-Race

**Results Calculation:**
- Elapsed time = finish time - class start time
- Corrected time = elapsed × (1000 / PY handicap)
- Auto-rank by corrected time
- Handle DNF/DNS/OCS scoring (RYA Appendix A):
  - DNF/DNS/OCS = entries + 1
  - DSQ = entries + 1
  - RET (retired) = entries + 1

**Results Display:**
- Results table: position, boat, helm, class, elapsed, corrected, points
- Published to public race page
- Shareable link

**Series Standings:**
- Aggregate results across races in a series
- Discard worst N results (configurable per series)
- Series leaderboard with running totals
- Season champion tracking

```sql
-- Series configuration
alter table race_series add column discard_count integer default 0;
alter table race_series add column scoring_system text default 'low_point'; -- low_point/high_point/bonus

-- Series standings (calculated, could be a view or materialised)
create table series_standings (
  id uuid primary key default gen_random_uuid(),
  series_name text not null,
  club_id uuid references clubs(id) on delete cascade,
  boat_id uuid references boats(id),
  helm_name text,
  total_points numeric(8,1),
  races_sailed integer,
  races_discarded integer,
  position integer,
  season text, -- e.g. "2026"
  updated_at timestamptz default now()
);
```

### 4.4 Results Page (`/dashboard/races/{id}/results`)
- Editable results table
- Auto-calculate corrected times from PY handicaps
- Auto-rank
- Publish button → makes results visible on public page
- Export to CSV / PDF

### 4.5 Series Leaderboard (`/dashboard/series/{name}`)
- Running standings across all races in the series
- Per-race breakdown with discards struck through
- Season selector
- Public view at `/club/{code}/series/{name}`

---

## 5. Implementation Priority

### Phase 1 — Core (next session)
1. ✅ Race entry form saves to DB
2. ✅ Competitors list on race detail
3. ✅ Race messages
4. Profile page with personal + emergency contact
5. My Boats page (CRUD)
6. Race entry: select from "My Boats" instead of free text

### Phase 2 — Race Day
7. Finish time recording
8. Results calculation (elapsed → corrected → ranking)
9. Results page with publish
10. Boat classes with default PY handicaps

### Phase 3 — Series & Standings
11. Series scoring configuration (discards, scoring system)
12. Series leaderboard (auto-calculated standings)
13. Season archive with historical standings

### Phase 4 — Crew & Social
14. Crew sign-up per race entry
15. Crew pool board
16. Crew matching / notifications

### Phase 5 — Polish & Advanced
17. Entry fee collection (Stripe)
18. QR code check-in
19. Print-ready race documents
20. Weather integration on race day
21. Start sequence countdown timer
22. Push notifications for race updates
23. Club noticeboard / announcements

---

## 6. Key Design Principles

- **Mobile-first** — race officers and competitors both use phones
- **Minimal clicks** — entering a race should be 3 taps from the club homepage
- **Nautical conventions** — PY handicaps, RYA scoring, proper sailing terminology
- **Progressive disclosure** — simple by default, powerful when needed
- **Works offline** — race day internet can be spotty (PWA consideration for later)
- **Club autonomy** — each club configures their own classes, series, scoring rules
