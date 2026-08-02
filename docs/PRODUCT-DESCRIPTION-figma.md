# Waypoint Racing — Product Description (for Figma documentation)

*Two connected experiences: the **Race Officer back end** (Race Control) and the **Race Nav** (the on-the-water sailor app). One runs the race; the other sails it. They talk to each other live.*

---

## The one-line pitch

**Frictionless racing.** A sailor taps a link, types a boat name, and is racing — no login, no app install. Behind them, whoever's running the race gets a simple set of committee controls on their phone. Everything syncs live between the committee boat and every boat on the water.

---

## Part 1 — The Race Officer Back End ("Race Control")

**Who it's for:** the Officer of the Day (OOD), a club officer, or — when there's no official OOD — a competitor who "takes control" for the day. Same tools either way.

**Where it lives:** the Race Centre screen for a race. The Race Control panel only appears for whoever currently holds control.

**What it does — the core job is starting and managing the race:**

### 1. Take control
- If a race has an official OOD, they hold the controls.
- If not (competitor-run racing), any entered sailor can tap **"Take race control"** — one person holds it at a time, so there's a single source of truth and no two people firing different countdowns.

### 2. Run the start (synchronised countdown)
- The controller sets or adjusts the **start time**. One-tap presets (5 / 3 / 1 minute) or an exact time.
- The start is stored as an **absolute timestamp**, so *every* boat and the committee see the *identical* countdown — perfectly in sync, wherever they are.
- Proper start sequence: 5-4-3-2-1 audio beeps, tenths of a second under 10s, and a start "gun" tone.
- **Simulator mode** runs the whole sequence sped up (8×) so it can be demoed or trained on in seconds.

### 3. Delay the start (+5 minutes)
- One tap pushes the start forward five minutes. Repeatable.
- Every boat instantly sees an amber **"Start delayed — new start HH:MM"** banner.
- The controller is reminded to **announce it on the radio too** ("📻 Start delayed 5 minutes") — the app supports the officer, it doesn't replace good race-management practice.

### 4. Abandon the race
- Two-tap confirm (so an accidental tap can never abandon a race).
- Every boat immediately sees a hard red **"RACE ABANDONED — return to shore"** banner, and their countdown stops.
- Radio-announcement reminder shown to the controller.

### 5. Individual recall (boats over the line early / OCS)
- **Automatic:** at the start gun, the system checks each tracked boat's GPS position against the start line and the direction to the first mark, and flags any boat that was on the course side early (OCS).
- **Manual override:** the controller gets a tap-to-toggle list of boats to add or clear flags — because GPS alone is never the final word; the committee stays authoritative.
- **Graceful:** if the start line or first mark isn't set, nothing is auto-flagged and the controller is told to flag manually.
- Flagged boats — and only those boats — get a hard recall banner on the water (see Race Nav below).

**Design principles for this surface:**
- Big, glanceable, one-handed controls (used on a pitching committee boat, in sunlight).
- The controller always stays in charge; the app assists, it doesn't automate away judgement.
- Every action broadcasts to the fleet **in-app, live** — with a radio-announce reminder as the human backstop.

---

## Part 2 — The Race Nav (the sailor's on-the-water app)

**Who it's for:** every competitor. Identical experience whether they've registered an account or entered anonymously — registration only decides whether results get *saved*, never what they see on the water.

**Where it lives:** the sailor's phone, in the browser. No install. It's a live map + instrument display for the race.

**What it does:**

### 1. Gets you racing with zero friction
- Tap the race link → choose "I have a boat" → type a **boat name** (sail number optional) → you're in and being tracked.
- No login, no account, no forms. (Enter with nothing and you're cheekily labelled "Boaty McNameless 3" with a tap-to-fix nudge — nobody wants to finish under that name.)
- An account is offered *afterwards* as a reward, to save your results.

### 2. Shows the start countdown
- The same synchronised countdown as the committee — 5-4-3-2-1 beeps and gun — driven by Race Control's start time, updating live if the OOD sets or delays it.

### 3. Points you at the mark ("nav")
- Live GPS: your **speed** and **heading**.
- **Bearing and distance to the next mark** — honestly labelled "point at the mark" (course-to-mark), not a fabricated tactical course-to-steer (no tide/wind guesswork).
- A live map showing your position, your track (breadcrumb), the course marks, and the start/finish lines.

### 4. Calls your marks and your finish
- As you round each mark, a transient **"mark reached — next mark is X"** announcement so you always know where to head next (with lap counting).
- Automatic **finish** detection when you cross the line, with a finish tone and time.

### 5. Receives everything Race Control broadcasts, live
- **Start delayed** → amber banner with the new time.
- **Race abandoned** → red banner, return to shore.
- **You are OCS** → hard red pulsing **"INDIVIDUAL RECALL — return and restart"** (shown *only* to boats that are actually over; clear boats get a subtle "recall in effect — you're clear" note, never told to restart).

### 6. Works when the signal doesn't
- GPS positions are cached and flushed when connection returns, so tracking survives patchy coverage on the water.

### Two flavours of the same screen
- **Nav (map view):** full chart, marks, track, instruments — the default.
- **Tracker (beacon mode):** map-less, for sailors navigating on their own chartplotter who just want the countdown, mark calls, finish, and to be tracked. Same features, lighter screen.

---

## How the two halves connect

```
   RACE OFFICER (Race Control)              THE FLEET (Race Nav)
   ─────────────────────────                ────────────────────
   Set / adjust start   ──────►  live  ──►  Synchronised countdown
   Delay start +5 min   ──────►  live  ──►  Amber "delayed" banner
   Abandon race         ──────►  live  ──►  Red "abandoned" banner
   Flag OCS boats       ──────►  live  ──►  "Individual recall" (OCS boats only)
                        ◄──── GPS positions ────  Every tracked boat
```

- One **shared, synchronised clock** (absolute start time) means everyone counts down together.
- Every committee action **broadcasts to the fleet in real time**, in-app, with no reload — backed by a radio-announce reminder for the officer.
- Sailors' GPS flows the other way, feeding the map, the mark/finish calls, and the automatic OCS detection.

---

## What this is (and isn't), for the doc

- **Is:** a lightweight, install-free, frictionless racing tool that existing clubs can bolt onto their established racing today — magical for the sailor, simple for the officer.
- **Isn't (yet):** full officer-grade compliance tooling. General recall, OCS scoring penalties, shorten-course, handicap (PY) results, declarations, sailing instructions and series scoring are deliberately Phase 2 — the first job is to make racing effortless.
