// lib/ocs.ts
// Pure, testable OCS (On Course Side) detection for automatic INDIVIDUAL RECALL.
//
// "OCS" = a boat that was on the COURSE side of the start line at the start gun.
// Those boats are subject to an individual recall and must return + restart.
//
// The core `isOnCourseSide` test is the SAME cross-product side test used by the
// Nav screen's client-local self-detection (app/race/live) — extracted here so
// the committee's authoritative auto-detection pass (Race Centre) and the sailor
// screen use ONE definition, and so it can be unit-tested with no React/DB.
//
// Geometry inputs:
//   - the start line as two endpoints (lat1/lng1, lat2/lng2)
//   - a reference point on the COURSE side (the first mark / windward mark)
//   - each boat's most-recent GPS fix at/just-before the gun
//
// A boat is OCS when it lies on the same side of the (infinite) start line as the
// first mark. This mirrors the existing on-water logic exactly.

export interface StartLine {
  lat1: number
  lng1: number
  lat2: number
  lng2: number
}

export interface CourseRef {
  /** A point known to be on the course side of the line — the first/windward mark. */
  lat: number
  lon: number
}

export interface BoatFix {
  entryId: string
  lat: number
  lon: number
  /** ISO time of the fix — callers pass the most-recent fix at/just-before the gun. */
  recordedAt?: string
}

/**
 * Signed side of point (px,py) relative to the directed line a→b.
 * >0 one side, <0 the other, ~0 on the line.
 */
function sideOfLine(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  // NB: coordinates are (lat, lon) here; we treat lon as x-ish and lat as y-ish
  // via the SAME arrangement the Nav screen uses so results are identical.
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax)
}

/**
 * True when the boat is on the same side of the start line as the course
 * reference point (i.e. on the course side → OCS at the gun).
 *
 * Argument order matches the original Nav-screen helper:
 *   (boatLat, boatLon, lineLat1, lineLon1, lineLat2, lineLon2, markLat, markLon)
 */
export function isOnCourseSide(
  boatLat: number, boatLon: number,
  lineLat1: number, lineLon1: number,
  lineLat2: number, lineLon2: number,
  markLat: number, markLon: number,
): boolean {
  const d1 = sideOfLine(boatLon, boatLat, lineLon1, lineLat1, lineLon2, lineLat2)
  const d2 = sideOfLine(markLon, markLat, lineLon1, lineLat1, lineLon2, lineLat2)
  if (d1 === 0) return false // exactly on the line = not (yet) OCS
  return (d1 > 0) === (d2 > 0)
}

/**
 * Detect which boats were OCS at the gun.
 *
 * Returns the entry ids that were on the course side of the start line, given the
 * start line, a course-side reference (first mark), and each boat's most-recent
 * fix. Pure + deterministic → unit-testable.
 *
 * Graceful degradation: if the start line or the course reference is missing/
 * incomplete, returns [] (no auto-flag) so callers fall back to the MANUAL path.
 */
export function detectOcs(
  startLine: StartLine | null | undefined,
  courseRef: CourseRef | null | undefined,
  fixes: BoatFix[],
): string[] {
  if (!startLine || !courseRef) return []
  const { lat1, lng1, lat2, lng2 } = startLine
  if (
    lat1 == null || lng1 == null || lat2 == null || lng2 == null ||
    courseRef.lat == null || courseRef.lon == null
  ) {
    return []
  }
  const out: string[] = []
  for (const f of fixes) {
    if (f.lat == null || f.lon == null) continue
    if (isOnCourseSide(f.lat, f.lon, lat1, lng1, lat2, lng2, courseRef.lat, courseRef.lon)) {
      out.push(f.entryId)
    }
  }
  return out
}
