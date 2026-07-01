# Sail Club HQ — Live Racing Module Plan

## Overview
Real-time GPS tracking, navigation, race control, and spectator view for dinghy/yacht racing. Phone/tablet GPS, offline-first, auto-detect finishes, live spectator map, OOD race control from the water.

---

## Architecture

### Data Flow
```
Phone GPS (watchPosition)
  → Local buffer (IndexedDB)
  → Supabase Realtime broadcast (when connected)
  → Spectator view + OOD view consume broadcasts
  → Track history saved to DB (batch inserts)
```

### Key Technologies
- **GPS**: Browser Geolocation API (`watchPosition`, high accuracy)
- **Offline buffer**: IndexedDB via `idb` — stores positions when offline, flushes when reconnected
- **Live broadcast**: Supabase Realtime Broadcast (no DB write per position — ephemeral channel)
- **Track persistence**: Batch insert GPS points every 30s or on reconnect
- **Maps**: Leaflet + Canvas renderer for spectator (handles 30+ markers)
- **Finish detection**: Geometry — line-crossing algorithm (GPS track crosses finish line segment)
- **Start sequence**: Client-side countdown timer synced to start_classes times, audio signals
- **Environmental data**: Open-Meteo API (wind), Admiralty Tidal API or WorldTides (tides/currents)

---

## Database Schema Extensions

### Migration 014: Live Racing
```sql
-- Race session state
alter table races add column if not exists race_controller_id uuid references auth.users(id);
alter table races add column if not exists race_started_at timestamptz;
alter table races add column if not exists race_finished_at timestamptz;

-- Entry tracking state
alter table race_entries add column if not exists start_time timestamptz;
alter table race_entries add column if not exists finish_time timestamptz;
alter table race_entries add column if not exists elapsed_seconds numeric;
alter table race_entries add column if not exists laps_completed integer default 0;
alter table race_entries add column if not exists last_mark_index integer default 0;
alter table race_entries add column if not exists tracking_active boolean default false;

-- GPS track points (batch inserts, not realtime)
-- Already exists as gps_tracks + gps_track_points, but let's add a simpler flat table
create table if not exists live_positions (
  id bigserial primary key,
  race_id uuid references races(id) on delete cascade,
  entry_id uuid references race_entries(id) on delete cascade,
  user_id uuid references auth.users(id),
  lat double precision not null,
  lon double precision not null,
  speed_kts numeric(6,2),
  heading_deg numeric(5,1),
  accuracy_m numeric(6,1),
  recorded_at timestamptz not null,
  synced_at timestamptz default now()
);

create index if not exists idx_live_positions_race on live_positions(race_id, recorded_at);
create index if not exists idx_live_positions_entry on live_positions(entry_id, recorded_at);

-- Handicap placeholder columns (for later)
alter table race_entries add column if not exists handicap_system text; -- PY, IRC, NHC, etc.
alter table race_entries add column if not exists handicap_value numeric;
alter table race_entries add column if not exists corrected_seconds numeric;

-- Environmental data cache
create table if not exists race_environment (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references races(id) on delete cascade,
  recorded_at timestamptz not null,
  wind_speed_kts numeric(5,1),
  wind_dir_deg numeric(5,1),
  tide_height_m numeric(5,2),
  tide_state text, -- flooding, ebbing, slack
  current_speed_kts numeric(4,2),
  current_dir_deg numeric(5,1),
  hw_time timestamptz,
  lw_time timestamptz,
  source text -- 'open-meteo', 'admiralty', 'manual'
);
```

---

## Pages & Components

### 1. Competitor Navigation View — `/race/live/[token]`
**The primary racing screen. Full-screen, mobile-optimised.**

#### Display:
- **Course-up map** (default) with toggle to north-up
  - Course line drawn: current position → next mark → remaining marks → finish
  - Your position: large blue dot with heading arrow
  - Course marks: numbered, with rounding side indicators (port red / starboard green)
  - Start/finish lines: drawn on map
- **Instrument panel** (bottom overlay):
  - **Speed**: current SOG in knots (large font)
  - **Heading**: current COG in degrees + compass
  - **Dist to mark**: distance to next mark in nm/cables
  - **Dist to finish**: total remaining course distance in nm
  - **Bearing to mark**: compass bearing to next mark
  - **Lap**: current lap / total laps
- **Start countdown** (pre-race):
  - Visual countdown timer synced to class start time
  - Audio signals: warning (5 min / custom), prep (4 min / custom), start (gun sound)
  - Colour-coded: amber during prep, green at go
- **Mark rounding detection**:
  - Auto-advance to next mark when within ~30m of current target
  - Haptic feedback on mark rounding
- **Finish detection**:
  - GPS track crosses finish line segment → auto-record finish time
  - Visual: "🏁 FINISHED!" overlay with elapsed time
  - Audio: horn sound

#### Controls:
- North-up / Course-up toggle
- Zoom +/−
- Mark info tap (shows mark name, rounding side)
- "I'm in trouble" safety button (broadcasts position + alert to OOD)

#### Offline behaviour:
- GPS tracking continues regardless of connectivity
- Map tiles cached (service worker pre-cache course area)
- Positions buffered in IndexedDB
- Connectivity indicator: green dot = live, amber = buffering, red = no GPS

### 2. Spectator View — `/race/watch/[token]`
**Public, no auth required. Works on phone or big screen.**

#### Display:
- Full course map (north-up default, course-up optional)
- All tracked boats shown as coloured dots with sail number labels
- Course marks, start/finish lines
- Boat info on tap: name, helm, speed, position in race
- Leaderboard panel (slide-up on mobile, sidebar on desktop):
  - Physical order (who's ahead on the water)
  - Lap count
  - Status (racing, finished, DNF, OCS)
- Start countdown (same visual as competitor view)
- Environmental data: wind arrow, tide state indicator

#### Data source:
- Supabase Realtime Broadcast subscription
- Positions update every 2-5 seconds per boat
- Graceful degradation: if a boat goes offline, last known position shown faded

### 3. OOD Race Control — `/race/control/[token]`
**Race officer dashboard. Works on phone/tablet on the water.**

#### Features:
- **Take Control** button → sets `race_controller_id` to current user
  - Warning: "Once you take control, you'll manage this race until you release it"
  - Lock icon shows who has control
  - **Release Control** button to hand back
- **Start sequence control**:
  - Manual override: delay/bring forward start times
  - General recall button
  - Individual recall (OCS boats)
  - Postpone / abandon race
- **Live race view** (same map as spectator but with extra controls):
  - Tap a boat → see details, mark as OCS, DNF, protest
  - Adjust class start time mid-sequence
- **Finish confirmation**:
  - Auto-detected finishes shown for confirmation
  - Manual override: tap boat → record finish time
  - "Shorten course" option (finish at current mark)
- **Safety**:
  - See any "I'm in trouble" alerts immediately
  - Boat positions for rescue coordination

### 4. Race Start Button — from Race Detail Page
**Transition from race management to live racing.**

On the race detail page, when status is `confirmed`:
- New button: "🏁 Go Live" → changes status to a new `live` status
- Shows links: competitor join, spectator view, OOD control
- QR codes for easy sharing at the club

---

## Start Sequence Engine

### Client-side timer
- Syncs to server time (Supabase `now()` call on page load to calculate offset)
- Counts down based on `start_classes[].start_time` and `sequence_warning_mins`
- Audio cues via Web Audio API:
  - Warning signal: single horn blast
  - Prep signal: single horn blast
  - Start: single horn blast
  - 1 minute: single horn blast
  - 30 seconds: rapid beeps
  - Go: long horn blast
- Visual: large countdown timer, background colour changes (white → amber → green)
- Works offline once loaded (client-side only after initial time sync)

### OOD overrides (via Supabase Realtime)
- OOD delays start → broadcasts new time → all clients update
- General recall → broadcasts recall signal → timer resets
- These flow through Supabase Realtime Broadcast, not DB writes (speed)

---

## Finish Line Crossing Detection

### Algorithm
```
For each new GPS point:
  1. Form line segment: previous_position → current_position
  2. Check intersection with finish_line segment (two lat/lon points from course_template)
  3. If intersection found:
     a. Verify direction (approaching from correct side)
     b. Verify lap count (must have rounded all marks)
     c. Record finish_time = interpolated time at crossing point
     d. Mark entry as finished
```

### Edge cases:
- Boat drifts across line before start → ignore (check race started)
- GPS jitter near line → require minimum speed (>0.5 kts) to count
- Multiple crossings → only count first valid one per lap
- Finish at start → use start line coords when `finish_at_start = true`

---

## Mark Rounding Detection

### Algorithm
```
For each new GPS point:
  1. Calculate distance to next target mark
  2. If distance < 30m (configurable):
     a. Record mark rounding
     b. Advance to next mark in sequence
     c. If last mark and lap < total_laps: reset to first mark, increment lap
     d. If last mark and final lap: target becomes finish line
  3. Haptic feedback + audio chime on advance
```

---

## Environmental Data

### Wind (Open-Meteo API — free, no key needed)
```
GET https://api.open-meteo.com/v1/forecast?
  latitude={lat}&longitude={lon}&
  current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&
  hourly=wind_speed_10m,wind_direction_10m&
  forecast_hours=6
```
- Poll every 10 minutes during live race
- Show wind arrow on map + speed in panel

### Tides (Admiralty API or WorldTides)
- **UK waters**: Admiralty Tidal API (UKHO) — free tier available
  - HW/LW times for nearest port
  - Tidal stream data
- **Fallback**: WorldTides API
- Show: HW/LW times, current tide state (flooding/ebbing/slack), height
- Visual: tide arrow on map showing current direction + strength

---

## Phased Build

### Phase 1 — Core GPS + Navigation (build first)
- [ ] Migration 014
- [ ] Competitor nav view: GPS tracking, course-up map, instrument panel
- [ ] Offline GPS buffering (IndexedDB)
- [ ] Mark rounding detection
- [ ] Finish line crossing detection
- [ ] "Go Live" button on race detail

### Phase 2 — Spectator + Broadcast
- [ ] Supabase Realtime Broadcast setup
- [ ] Position broadcasting from competitor view
- [ ] Spectator view: live map, boat dots, leaderboard
- [ ] Start countdown with audio

### Phase 3 — OOD Control
- [ ] Take/release control
- [ ] Start time adjustments
- [ ] General/individual recall
- [ ] Manual finish override
- [ ] Shorten course

### Phase 4 — Environmental Data
- [ ] Wind data integration (Open-Meteo)
- [ ] Tide data integration (Admiralty/WorldTides)
- [ ] Display on nav + spectator views

### Phase 5 — Polish
- [ ] Battery optimization (GPS polling interval adjustment)
- [ ] Service worker for offline map tiles
- [ ] Safety alert system
- [ ] QR code generation for race links
- [ ] Sound customization

---

## RLS Notes
- `live_positions`: insert own (user_id = auth.uid()), select where race_id in user's club OR race is public
- `race_environment`: insert for own club races, select publicly for live races
- Race controller: only controller can update race state (or admin)
- Spectator view: anon select allowed on races with status = 'live'

---

## Status Flow Update
Current: draft → planned → confirmed → completed → archived (+ cancelled)
New: draft → planned → confirmed → **live** → completed → archived (+ cancelled)

`live` = race is actively being sailed, GPS tracking active, spectator view open.
