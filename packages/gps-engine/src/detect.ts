/**
 * The detection engine. Three jobs: start, mark rounding, finish.
 *
 * Start uses the TWO-THRESHOLD model from STEP-0 spec + the racing rules:
 *   - More than confidentOcsM over the line at the gun  -> CONFIDENT OCS
 *     (outside the GPS error band, so we can be sure) -> Individual Recall.
 *   - Within tooCloseToCallM of the line at the gun     -> TOO CLOSE TO CALL
 *     (inside the error band) -> do not auto-penalise, hand to the OOD.
 *   - Otherwise                                         -> clean.
 *
 * v1 fully implements the P-flag rule (over AT the gun). I/U/Black flags
 * (over in the final minute) are scaffolded in types but NOT yet scored.
 */

import {
  applyBowOffset,
  distanceM,
  interpolateCrossingTime,
  projectionOnSegment,
  signedDistanceToLine,
} from "./geometry";
import type {
  BoatRaceResult,
  BoatTrack,
  Course,
  DetectionConfig,
  DetectionFlag,
  GeoPoint,
  Line,
  MarkRounding,
  StartClass,
  StartStatus,
  TrackPoint,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

function nearestPoint(points: TrackPoint[], t: number): TrackPoint | null {
  if (points.length === 0) return null;
  let best = points[0]!;
  let bestDt = Math.abs(best.t - t);
  for (const p of points) {
    const dt = Math.abs(p.t - t);
    if (dt < bestDt) {
      best = p;
      bestDt = dt;
    }
  }
  return best;
}

function bowPosition(
  p: TrackPoint,
  track: BoatTrack,
  cfg: DetectionConfig,
  ref: GeoPoint,
): GeoPoint {
  const fastEnough = (p.speed ?? 0) >= cfg.cogReliableMinSpeedMs;
  if (fastEnough && p.cog != null) {
    return applyBowOffset(p, track.phoneOffsetFromBowM, ref);
  }
  return { lat: p.lat, lon: p.lon };
}

function detectStart(
  track: BoatTrack,
  cls: StartClass,
  start: Line,
  cfg: DetectionConfig,
): { status: StartStatus; flags: DetectionFlag[]; overByM: number } {
  const ref = start.end1;
  const gun = cls.startTime;

  const anchor = nearestPoint(track.points, gun - 30_000);
  const atGun = nearestPoint(track.points, gun);
  if (!atGun) {
    return {
      status: "clean",
      flags: [{ kind: "no-start-detected", message: "No fix near the gun.", time: gun }],
      overByM: 0,
    };
  }

  const sign = anchor
    ? Math.sign(signedDistanceToLine({ lat: anchor.lat, lon: anchor.lon }, start)) || 1
    : 1;
  const bow = bowPosition(atGun, track, cfg, ref);
  const over = -sign * signedDistanceToLine(bow, start);

  const flags: DetectionFlag[] = [];
  let status: StartStatus = "clean";

  if (over > cfg.confidentOcsM) {
    status = "ocs-confident";
    flags.push({
      kind: "start-ocs-confident",
      message: `Over the line by ~${over.toFixed(0)} m at the gun (Individual Recall / OCS).`,
      time: gun,
    });
  } else if (over > -cfg.tooCloseToCallM) {
    status = "too-close-to-call";
    flags.push({
      kind: "start-too-close-to-call",
      message: `Within ~${cfg.tooCloseToCallM} m of the line at the gun \u2014 OOD to confirm.`,
      time: gun,
    });
  }

  return { status, flags, overByM: over };
}

function detectRounding(
  points: TrackPoint[],
  markPos: GeoPoint,
  afterT: number,
  cfg: DetectionConfig,
): MarkRounding | null {
  let best: { t: number; d: number } | null = null;
  for (const p of points) {
    if (p.t < afterT) continue;
    const d = distanceM({ lat: p.lat, lon: p.lon }, markPos);
    if (d <= cfg.roundingRadiusM && (best === null || d < best.d)) {
      best = { t: p.t, d };
    }
  }
  return best ? { markId: "", time: best.t, minDistanceM: best.d } : null;
}

function detectFinish(points: TrackPoint[], finish: Line, afterT: number): number | null {
  let prev: TrackPoint | null = null;
  let prevD = 0;
  for (const p of points) {
    if (p.t < afterT) {
      prev = p;
      prevD = signedDistanceToLine({ lat: p.lat, lon: p.lon }, finish);
      continue;
    }
    const d = signedDistanceToLine({ lat: p.lat, lon: p.lon }, finish);
    if (prev && Math.sign(d) !== Math.sign(prevD) && prevD !== 0) {
      const onSeg = projectionOnSegment({ lat: p.lat, lon: p.lon }, finish, 20);
      if (onSeg !== null) {
        return interpolateCrossingTime(prev, prevD, p, d);
      }
    }
    prev = p;
    prevD = d;
  }
  return null;
}

export function detectBoatRace(
  track: BoatTrack,
  cls: StartClass,
  course: Course,
  config: Partial<DetectionConfig> = {},
): BoatRaceResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const flags: DetectionFlag[] = [];

  const start = detectStart(track, cls, course.start, cfg);
  flags.push(...start.flags);
  const startTime = cls.startTime;

  const roundings: (MarkRounding | null)[] = [];
  let cursor = startTime;
  for (const cm of [...course.marks].sort((a, b) => a.order - b.order)) {
    const r = detectRounding(track.points, { lat: cm.mark.lat, lon: cm.mark.lon }, cursor, cfg);
    if (r) {
      r.markId = cm.mark.id;
      roundings.push(r);
      cursor = r.time;
    } else {
      roundings.push(null);
      flags.push({
        kind: "missed-rounding",
        message: `No rounding detected for mark "${cm.mark.name}".`,
      });
    }
  }

  const finishTime = detectFinish(track.points, course.finish, cursor);
  if (finishTime === null) {
    flags.push({ kind: "no-finish-detected", message: "No finish crossing found." });
  }

  const elapsedSeconds =
    finishTime != null ? Math.round((finishTime - startTime) / 1000) : null;

  return {
    boatId: track.boatId,
    classId: cls.id,
    startStatus: start.status,
    startTime,
    roundings,
    finishTime,
    elapsedSeconds,
    flags,
  };
}
