/**
 * Geometry helpers for race detection.
 *
 * Distances are small (metres to hundreds of metres) so we use a local
 * equirectangular projection centred on a reference point. This is far simpler
 * than full geodesics and more than accurate enough at sailing-course scale,
 * where the GPS error itself is metres.
 */

import type { GeoPoint, Line, TrackPoint } from "./types";

const EARTH_RADIUS_M = 6_371_000;
const DEG2RAD = Math.PI / 180;

/** A point in local metres-east / metres-north relative to a reference. */
export interface LocalXY {
  x: number; // east
  y: number; // north
}

/** Project a lat/lon to local metres relative to a reference point. */
export function toLocal(p: GeoPoint, ref: GeoPoint): LocalXY {
  const dLat = (p.lat - ref.lat) * DEG2RAD;
  const dLon = (p.lon - ref.lon) * DEG2RAD;
  const meanLat = ((p.lat + ref.lat) / 2) * DEG2RAD;
  return {
    x: dLon * Math.cos(meanLat) * EARTH_RADIUS_M,
    y: dLat * EARTH_RADIUS_M,
  };
}

/** Great-circle-ish distance in metres between two lat/lon points. */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const local = toLocal(b, a);
  return Math.hypot(local.x, local.y);
}

/**
 * Signed perpendicular distance (metres) from a point to the infinite line
 * through a Line's two ends. Sign flips depending which side you are on, which
 * is how we detect a crossing (sign change between consecutive fixes).
 */
export function signedDistanceToLine(p: GeoPoint, line: Line): number {
  const ref = line.end1;
  const a = toLocal(line.end1, ref);
  const b = toLocal(line.end2, ref);
  const pt = toLocal(p, ref);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(pt.x - a.x, pt.y - a.y);
  // Cross product of line direction and (point - a), normalised by length.
  return ((pt.x - a.x) * dy - (pt.y - a.y) * dx) / len;
}

/**
 * Whether the foot of the perpendicular from p falls between the two line ends
 * (i.e. the boat crossed the actual line segment, not its extension).
 * Returns the parametric position 0..1 along the segment, or null if outside
 * a small margin beyond the ends.
 */
export function projectionOnSegment(
  p: GeoPoint,
  line: Line,
  endMarginM = 0,
): number | null {
  const ref = line.end1;
  const a = toLocal(line.end1, ref);
  const b = toLocal(line.end2, ref);
  const pt = toLocal(p, ref);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  const tRaw = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
  const len = Math.sqrt(lenSq);
  const margin = endMarginM / len;
  if (tRaw < -margin || tRaw > 1 + margin) return null;
  return Math.min(1, Math.max(0, tRaw));
}

/** Linear interpolation of time at the zero-crossing between two fixes. */
export function interpolateCrossingTime(
  p1: TrackPoint,
  d1: number,
  p2: TrackPoint,
  d2: number,
): number {
  // d1 and d2 have opposite signs; find where the line hits zero.
  const frac = d1 / (d1 - d2);
  return Math.round(p1.t + frac * (p2.t - p1.t));
}

/**
 * Apply the antenna offset: shift a fix forward along its course-over-ground
 * by the phone-to-bow distance, so the reported position approximates the bow.
 * Returns the original point unchanged when COG is unreliable (caller decides
 * based on speed) — see STEP-0 spec §4.
 */
export function applyBowOffset(
  p: TrackPoint,
  offsetFromBowM: number,
  ref: GeoPoint,
): GeoPoint {
  if (p.cog == null || offsetFromBowM === 0) return { lat: p.lat, lon: p.lon };
  const headingRad = p.cog * DEG2RAD;
  // Move FORWARD toward the bow: bow is ahead of the phone by offsetFromBowM.
  const dEast = Math.sin(headingRad) * offsetFromBowM;
  const dNorth = Math.cos(headingRad) * offsetFromBowM;
  const local = toLocal({ lat: p.lat, lon: p.lon }, ref);
  const shifted: LocalXY = { x: local.x + dEast, y: local.y + dNorth };
  // Convert back to lat/lon.
  const meanLat = ref.lat * DEG2RAD;
  return {
    lat: ref.lat + (shifted.y / EARTH_RADIUS_M) / DEG2RAD,
    lon:
      ref.lon +
      (shifted.x / (EARTH_RADIUS_M * Math.cos(meanLat))) / DEG2RAD,
  };
}
