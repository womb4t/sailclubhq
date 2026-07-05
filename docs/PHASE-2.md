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

## 4. Wind / tide data + true CTS ⚪
- Bottom-sheet conditions panel (à la Savvy Navvy): TWD, point-of-sail, cross-tide.
- Enables a real **CTS (Course To Steer)** vs the current honest **BTM (Bearing To
  Mark)**. Requires a marine forecast + tide data source (provider TBD).

---

## 5. Replayable intro / help centre ⚪
- The intro tutorial is replayable from Profile ("How it works"). Consider a
  fuller in-app help/FAQ surface for participants and officers.

---

## Notes
- Keep Phase 1 lean and launch-ready. Add to this doc as new "later" ideas surface.
- When starting a Phase 2 item, split it into its own branch/PR series like Phase 1.
