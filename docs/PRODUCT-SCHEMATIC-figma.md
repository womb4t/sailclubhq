# Waypoint Racing — Product Schematic (Figma layout brief)

*A schematic a designer or Figma AI can draw directly. Boxes = screens/components. Arrows = data or user flow. Zones = who's using it.*

---

## OVERALL LAYOUT (three horizontal bands, left → right flow)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  BAND A — ENTRY (public, no login)                                           │
│                                                                              │
│   [Club Page]  ──►  [Join / Enter Race]  ──►  ┐                              │
│   race list        boat name only             │                              │
│                                               ▼                              │
├───────────────────────────────────────────────┼──────────────────────────────┤
│  BAND B — ON THE WATER (the sailor)            │                             │
│                                                ▼                             │
│                                        [ RACE NAV ]  ⇄  [ Tracker / Beacon ] │
│                                        map+instruments   map-less variant     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────── │
│  BAND C — RACE CONTROL (the officer)                                         │
│                                                                              │
│                                        [ RACE CONTROL PANEL ]                │
│                                        countdown/delay/abandon/recall         │
└────────────────────────────────────────────────────────────────────────────┘
        BAND B and BAND C are linked by a LIVE SYNC SPINE (see below)
```

---

## THE NODES (draw each as a card / frame)

### Band A — Entry (colour: light blue / "public")
1. **Club Page** — `/club/[code]`
   - Sub-items to show inside the card: "Upcoming Races list", "Enter Race ↗ button (no login)".
2. **Join / Enter Race** — `/race/join/[token]`
   - Sub-items: "I have a boat 🚤 / I need a boat 🙋", "Boat name (required)", "Sail number (optional)", "→ Go racing", "(optional) save results later".

### Band B — On the water / Sailor (colour: teal / "sailor")
3. **Race Nav** — `/race/live` (the hero screen)
   - Sub-items: "Live map + track", "Speed / Heading", "Bearing + distance to next mark (point at the mark)", "Start countdown (5-4-3-2-1)", "Mark-reached call", "Finish detection", "Offline-safe GPS".
4. **Tracker / Beacon** — `/race/live?mode=tracker`
   - Sub-items: "Map-less", "Same countdown / mark calls / finish", "For sailors using own chartplotter".
   - Draw a double-arrow ⇄ between Nav and Tracker labelled "same features, two views".

### Band C — Officer / Race Control (colour: amber/orange / "committee")
5. **Race Control Panel** — inside `/race/centre` (only visible to controller)
   - Sub-items (draw as 5 buttons/rows):
     - "Take control (OOD or competitor)"
     - "⏱️ Set / adjust start"
     - "⏱️ Delay start +5 min"
     - "🛑 Abandon race (2-tap)"
     - "🚩 Individual recall / OCS (auto + manual)"

---

## THE LIVE SYNC SPINE (the most important part of the schematic)

Draw a central vertical **"Live Sync" bar** between Band C (officer) and Band B (fleet), with arrows:

**Downward arrows (Officer → Fleet), labelled "live, in-app, no reload":**
- Set start ─────────►  Synchronised countdown on every boat
- Delay +5 min ──────►  Amber "Start delayed — new time" banner
- Abandon ───────────►  Red "RACE ABANDONED — return to shore" banner
- Flag OCS ──────────►  "🚩 Individual recall" (only to flagged boats)

**Upward arrows (Fleet → Officer/System), labelled "GPS":**
- Every tracked boat ──►  positions feed the map, mark/finish calls, and auto-OCS detection

**Centre of the spine — label it:**
> **ONE SHARED CLOCK** (absolute start time) → everyone counts down together

---

## KEY CALLOUTS (annotation bubbles to place on the board)

- 🟦 **"No login to race"** — pin on Band A between Club Page and Join.
- 🟩 **"Anon = registered"** — pin on Race Nav: "identical experience; account only saves results."
- 🟧 **"Officer stays in charge"** — pin on Race Control: "app broadcasts + reminds to announce on radio; never automates judgement away."
- ⚙️ **"Simulator (8× speed)"** — small tag on the countdown, spanning Nav + Race Control.

---

## PHASE 2 (draw as a greyed-out / dashed "future" box, off to the side)

Dashed box labelled **"Phase 2 — officer-grade compliance (not built yet)"**:
- General recall · OCS scoring penalties · Shorten course · PY handicap results · Declarations / sign-on · Sailing Instructions · Series scoring

---

## SUGGESTED FIGMA FRAME ORDER (if drawing the actual UI screens, not just the schematic)

1. Club Page (race list)
2. Join — "have a boat / need a boat"
3. Join — boat name entry
4. Race Nav — pre-start (countdown running)
5. Race Nav — racing (map + bearing to mark)
6. Race Nav — mark reached
7. Race Nav — finish
8. Race Nav — receiving a broadcast (delayed / abandoned / recall banner)
9. Race Control Panel — the five controls
10. Tracker / beacon variant

---

## COLOUR / STYLE KEY (for the schematic)
- Public/entry = light blue
- Sailor/on-water = teal
- Officer/committee = amber
- Live sync arrows = green (down = broadcast), grey (up = GPS)
- Phase 2 = dashed grey
