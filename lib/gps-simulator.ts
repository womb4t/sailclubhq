// lib/gps-simulator.ts
// Synthetic GPS engine for SailClubHQ Training Mode.
//
// Feeds fake positions into the Race Nav / Tracker UI so sailors can learn the
// interface (and staff can demo/QA) without going to sea. Two drive modes:
//   - 'auto'   : the boat sails the course itself (start line -> marks -> finish)
//   - 'manual' : the caller steers via setHeading()/nudge(); speed is user-set
// Plus a time/speed multiplier so a full lap takes seconds.
//
// This module is pure geometry + a ticker. It NEVER touches the database or the
// network — isolation from real tracking is the caller's contract, and this file
// has no imports that could write anywhere.

export interface SimMark {
  lat: number
  lon: number
  name: string
  roundingSide: 'port' | 'starboard'
  index: number
}

export interface SimCourse {
  laps: number
  marks: SimMark[]
  start_line_lat1: number | null
  start_line_lng1: number | null
  start_line_lat2: number | null
  start_line_lng2: number | null
  finish_line_lat1: number | null
  finish_line_lng1: number | null
  finish_line_lat2: number | null
  finish_line_lng2: number | null
  finish_at_start: boolean | null
}

/** Shape matches the GpsPosition the pages already consume. */
export interface SimPosition {
  lat: number
  lon: number
  heading: number // degrees, 0-360
  speed_kts: number
  accuracy_m: number
  recorded_at: string // ISO
}

export type DriveMode = 'auto' | 'manual'

export interface SimOptions {
  mode: DriveMode
  /** Wall-clock ms between emitted fixes (default 1000). */
  tickMs?: number
  /** Simulated time multiplier: distance covered per tick scales with this. */
  speedMultiplier?: number
  /** Cruising boat speed in knots for auto mode / manual default. */
  boatSpeedKts?: number
  /** Where to start the boat if no start line (defaults to first mark area). */
  startLat?: number
  startLon?: number
}

// ── Geometry helpers ────────────────────────────────────────────────────────

const R_NM = 3440.065
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Move a point `distanceNm` along `headingDeg`, returning new [lat, lon]. */
function project(lat: number, lon: number, headingDeg: number, distanceNm: number): [number, number] {
  const d = distanceNm / R_NM
  const brng = toRad(headingDeg)
  const lat1 = toRad(lat)
  const lon1 = toRad(lon)
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    )
  return [toDeg(lat2), toDeg(lon2)]
}

function midpoint(
  lat1: number | null,
  lon1: number | null,
  lat2: number | null,
  lon2: number | null,
): [number, number] | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null
  return [(lat1 + lat2) / 2, (lon1 + lon2) / 2]
}

// ── Simulator ─────────────────────────────────────────────────────────────────

export class GpsSimulator {
  private course: SimCourse
  private opts: Required<Pick<SimOptions, 'mode' | 'tickMs' | 'speedMultiplier' | 'boatSpeedKts'>>
  private timer: ReturnType<typeof setInterval> | null = null
  private onFix: (pos: SimPosition) => void

  private lat: number
  private lon: number
  private heading = 0
  private speedKts: number

  // Auto-mode waypoint plan (flattened: marks * laps, then finish).
  private plan: Array<[number, number]> = []
  private targetIndex = 0

  constructor(course: SimCourse, options: SimOptions, onFix: (pos: SimPosition) => void) {
    this.course = course
    this.onFix = onFix
    this.opts = {
      mode: options.mode,
      tickMs: options.tickMs ?? 1000,
      speedMultiplier: options.speedMultiplier ?? 1,
      boatSpeedKts: options.boatSpeedKts ?? 5,
    }
    this.speedKts = this.opts.boatSpeedKts

    // Starting position: a little behind the start line (pre-start side) if we
    // have one, else near the first mark, else the provided lat/lon.
    const startMid = midpoint(
      course.start_line_lat1,
      course.start_line_lng1,
      course.start_line_lat2,
      course.start_line_lng2,
    )
    if (startMid) {
      // Back off ~0.05nm from the line, roughly opposite the first mark.
      const firstMark = course.marks[0]
      const awayHeading = firstMark
        ? (bearingDeg(startMid[0], startMid[1], firstMark.lat, firstMark.lon) + 180) % 360
        : 180
      const [bLat, bLon] = project(startMid[0], startMid[1], awayHeading, 0.05)
      this.lat = bLat
      this.lon = bLon
      if (firstMark) this.heading = bearingDeg(bLat, bLon, firstMark.lat, firstMark.lon)
    } else if (course.marks[0]) {
      const [bLat, bLon] = project(course.marks[0].lat, course.marks[0].lon, 180, 0.1)
      this.lat = bLat
      this.lon = bLon
      this.heading = 0
    } else {
      this.lat = options.startLat ?? 51.5
      this.lon = options.startLon ?? -0.1
    }

    this.buildPlan()
  }

  /** Build the ordered list of waypoints the auto-helm chases. */
  private buildPlan() {
    this.plan = []
    const { marks, laps } = this.course
    const startMid = midpoint(
      this.course.start_line_lat1,
      this.course.start_line_lng1,
      this.course.start_line_lat2,
      this.course.start_line_lng2,
    )
    // Cross the start line first.
    if (startMid) this.plan.push(startMid)
    // Sail the marks for each lap.
    for (let lap = 0; lap < Math.max(1, laps); lap++) {
      for (const m of marks) this.plan.push([m.lat, m.lon])
    }
    // Finish line (or start line if finish_at_start).
    const finishMid = this.course.finish_at_start
      ? startMid
      : midpoint(
          this.course.finish_line_lat1,
          this.course.finish_line_lng1,
          this.course.finish_line_lat2,
          this.course.finish_line_lng2,
        )
    if (finishMid) this.plan.push(finishMid)
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  start() {
    if (this.timer) return
    this.emit() // fire one immediately
    this.timer = setInterval(() => this.tick(), this.opts.tickMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  isRunning(): boolean {
    return this.timer != null
  }

  setSpeedMultiplier(m: number) {
    this.opts.speedMultiplier = Math.max(0, m)
  }

  setBoatSpeed(kts: number) {
    this.speedKts = Math.max(0, kts)
  }

  /** Manual steering. */
  setHeading(deg: number) {
    this.heading = ((deg % 360) + 360) % 360
  }

  nudge(deltaDeg: number) {
    this.setHeading(this.heading + deltaDeg)
  }

  /** Teleport (e.g. drag boat on the map in manual mode). */
  setPosition(lat: number, lon: number) {
    this.lat = lat
    this.lon = lon
  }

  getState() {
    return {
      lat: this.lat,
      lon: this.lon,
      heading: this.heading,
      speedKts: this.speedKts,
      mode: this.opts.mode,
      targetIndex: this.targetIndex,
      totalTargets: this.plan.length,
    }
  }

  // ── Simulation step ─────────────────────────────────────────────────────────

  private tick() {
    if (this.opts.mode === 'auto') this.steerAuto()

    // Distance this tick: speed (nm/hr) * (tickMs/3600000) * multiplier.
    const hours = this.opts.tickMs / 3_600_000
    const distNm = this.speedKts * hours * this.opts.speedMultiplier
    if (distNm > 0) {
      const [nLat, nLon] = project(this.lat, this.lon, this.heading, distNm)
      this.lat = nLat
      this.lon = nLon
    }
    this.emit()
  }

  /** Auto-helm: point at the current target waypoint; advance when reached. */
  private steerAuto() {
    if (this.targetIndex >= this.plan.length) {
      this.speedKts = 0 // course complete — drift to a stop
      return
    }
    const [tLat, tLon] = this.plan[this.targetIndex]
    const dist = haversineNm(this.lat, this.lon, tLat, tLon)
    if (dist < 0.02) {
      this.targetIndex++
      if (this.targetIndex >= this.plan.length) {
        this.speedKts = 0
        return
      }
    }
    const [ntLat, ntLon] = this.plan[Math.min(this.targetIndex, this.plan.length - 1)]
    this.heading = bearingDeg(this.lat, this.lon, ntLat, ntLon)
    this.speedKts = this.opts.boatSpeedKts
  }

  private emit() {
    this.onFix({
      lat: this.lat,
      lon: this.lon,
      heading: this.heading,
      speed_kts: this.speedKts,
      accuracy_m: 5, // pretend a good fix
      recorded_at: new Date().toISOString(),
    })
  }
}

// ── Built-in demo course (Nieuwpoort-ish square, for the standalone simulator) ──
// Small windward/leeward course so the standalone page works with no real race.
export const DEMO_COURSE: SimCourse = {
  laps: 2,
  start_line_lat1: 51.155,
  start_line_lng1: 2.72,
  start_line_lat2: 51.155,
  start_line_lng2: 2.723,
  finish_line_lat1: null,
  finish_line_lng1: null,
  finish_line_lat2: null,
  finish_line_lng2: null,
  finish_at_start: true,
  marks: [
    { lat: 51.162, lon: 2.7215, name: 'Windward', roundingSide: 'port', index: 0 },
    { lat: 51.1585, lon: 2.726, name: 'Wing', roundingSide: 'starboard', index: 1 },
    { lat: 51.155, lon: 2.7215, name: 'Leeward', roundingSide: 'port', index: 2 },
  ],
}
