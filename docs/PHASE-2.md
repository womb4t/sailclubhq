# Waypoint Racing — Phase 2 Features

Backlog of features intentionally deferred beyond the initial launch. Phase 1 is
the single-club racing platform (marks, courses, races, live nav/tracker,
results, roles/OOD governance, onboarding). Phase 2 items are recorded here so we
design toward them without bolting them on prematurely.

Status legend: 🔵 planned · 🟡 needs design · ⚪ idea

---

## 1. Multi-club membership 🟡
**A user can belong to more than one club.**

Today: one user → one club (`profiles.club_id` single value; `profiles.role`
single value).

Target:
- New join table `club_memberships (user_id, club_id, role, created_at)`.
- Role becomes **per-club** (admin at one club, member at another).
- "Active club" concept + a **club switcher** in the UI.
- Scope all club-bound screens by active club: races list, marks, courses,
  entries, settings, standings.
- Governance built in Phase 1 (admin / race_officer / OOD, self-heal, leave-club,
  RO requests) migrates from **per-profile** to **per-membership**.

Already aligned: **boats are person-owned** (`owner_id`), not club-owned — so a
boat works across all a user's clubs. (Shipped in Phase 1.)

Impact: touches almost every query + all role logic. Do it as its own project.

---

## 2. Corrected time / handicap results 🔵
- Compute results on corrected time using PY (Portsmouth Yardstick) handicap.
- `boats.py_handicap` already exists as a field.
- Standings currently order by marks/distance + elapsed; add a corrected-time
  view alongside scratch results.

---

## 3. Series scoring 🔵
- Aggregate results across a series (discards, points systems e.g. low-point).
- `race_series` table + per-race results already exist; add scoring rules and a
  series standings page.

---

## 4. Weather & tides 🟡
**Live/forecast weather and tide data across the app.**

Uses:
- **Race planning** — forecast wind, gusts, and tide times/heights for a race’s
  date + venue (on Race Centre, race setup, public calendar).
- **High/low water** — next HW/LW times + heights for the venue, and current tidal
  state (rising/falling, height now) shown for the race day.
- **On-the-water nav** — bottom-sheet conditions panel (à la Savvy Navvy): TWD,
  point-of-sail, cross-tide, tidal set.
- **True CTS** — enables a real **CTS (Course To Steer)** with tide/leeway
  correction, vs the current honest **BTM (Bearing To Mark)**.
- Tidal gates / stream awareness near marks (later).

Needs: a marine weather forecast source + a tide data source (provider TBD; e.g.
Open-Meteo marine, Admiralty/UKHO tides, StormGlass). Cache per venue/day.
Consider cost + rate limits before wiring.

---

## 5. Course depths / shallow-water awareness 🟡
**Depth data on marks and courses — safety + tactics.**

- Optional **depth (charted/at-datum)** per mark, and/or a course depth profile.
- Combined with tide height (#4) → **actual depth now** at a mark (“1.2 m of water
  over datum right now”), so shallow-draft boats know where they can/can’t go.
- Shallow-water / grounding warnings near marks below a boat’s draft.
- Sources: charted depths (survey/manual entry per mark), or user-recorded depth
  soundings; combine with live tide height for real-time under-keel figures.

---

## 6. Standardised courses + inter-club competition 🟡
**Shared, standardised courses so clubs can compete against each other.**

Today: courses are club-owned (marks + legs scoped to one club).

Target:
- **Standardised course templates** — canonical course definitions (shape, leg
  ratios, mark layout) that any club can adopt, independent of their local GPS
  marks. Think "Olympic triangle", "windward-leeward 2 laps", or a named
  class/association standard.
- A club instantiates a standard course against **their own marks/water**, but
  results are comparable because the course *shape/standard* is the same.
- **Cross-club leaderboards** — compare performance on the same standardised
  course across clubs (by class, by corrected time, by fleet).
- Governance/ownership of standards: a global/curated library vs club-published
  standards; versioning so a standard can’t silently change under a result set.
- Ties into corrected-time (#2) and series scoring (#3) for fair comparison.

Why it matters: inter-club competition is a network-effect lever — gives clubs a
reason to pull each other onto the platform.

Open questions: how to normalise for local conditions (wind/tide differ by venue)
when comparing across clubs; whether comparison is "same course shape" only, or
true handicap-normalised ranking.

---

## 7. Replayable intro / help centre ⚪
- The intro tutorial is replayable from Profile ("How it works"). Consider a
  fuller in-app help/FAQ surface for participants and officers.

---

## Notes
- Keep Phase 1 lean and launch-ready. Add to this doc as new "later" ideas surface.
- When starting a Phase 2 item, split it into its own branch/PR series like Phase 1.
