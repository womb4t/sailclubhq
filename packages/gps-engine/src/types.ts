/**
 * Core domain types for the Sail Club HQ race-detection engine.
 *
 * Framework-free: no Next.js, Supabase, HTTP or storage. Plain data in,
 * plain data out, so it can be unit-tested by replaying recorded GPX tracks.
 *
 * Source of truth for tolerances: STEP-0-gps-accuracy-spec.md
 */

/* ------------------------------------------------------------------ */
/* Geography & marks                                                   */
/* ------------------------------------------------------------------ */

/** A fixed point on the water. Decimal degrees is the internal source of truth. */
export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Where a mark's definition lives. */
export type MarkSource = "catalogue" | "race";

/**
 * A mark. Position (decimal degrees) always travels with it, so every
 * representation (map, GPX, printed sheet) can show it. A single course may
 * freely mix catalogue and race-scoped marks (weather/hazard adaptation).
 */
export interface Mark {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: "virtual" | "physical";
  /** Catalogue = standing club mark; race = laid/created for one race. */
  source: MarkSource;
  /** Optional, mainly for physical marks so crews recognise the buoy. */
  photoUrl?: string;
  notes?: string;
}

/** Which side a mark is left when rounding. */
export type Rounding = "port" | "starboard";

/**
 * A mark AS USED IN A COURSE. Rounding direction lives here, not on the Mark,
 * because the same physical mark can be rounded differently on different
 * courses or legs.
 */
export interface CourseMark {
  /** 1-based position in the rounding order. */
  order: number;
  mark: Mark;
  rounding: Rounding;
}

/** A start or finish line defined by two ends. */
export interface Line {
  /** Committee-boat end. */
  end1: GeoPoint;
  /** Pin end. */
  end2: GeoPoint;
}

/** A full course: start line, ordered marks, finish line. Source-agnostic. */
export interface Course {
  start: Line;
  /** Names so the printed sheet can describe the line ends. */
  startEnd1Name?: string;
  startEnd2Name?: string;
  marks: CourseMark[];
  finish: Line;
  finishEnd1Name?: string;
  finishEnd2Name?: string;
}

/* ------------------------------------------------------------------ */
/* Start sequence & classes                                            */
/* ------------------------------------------------------------------ */

/** Preparatory flag — determines what being over the line means. */
export type PrepFlag = "P" | "I" | "U" | "Black";

/** One cue in a start sequence, offset in seconds BEFORE the gun (gun = 0). */
export interface SequenceSignal {
  /** Seconds before the start gun. 300 = 5:00, 0 = Go. */
  secondsBeforeStart: number;
  /** Number of sound signals at this point. */
  sounds: number;
  /** Short flag/action label, e.g. "Class flag up", "Prep flag down". */
  action: string;
  /** True for the long sound (the 1:00 signal). */
  longSound?: boolean;
}

/** A configurable start sequence. Default = standard 5-4-1-Go under P. */
export interface StartSequence {
  prepFlag: PrepFlag;
  signals: SequenceSignal[];
}

/**
 * One starting class. Multiple classes stagger off a shared race clock
 * (the cruiser variation: A at 11:00, B at 11:05, ...). Each boat is scored
 * against ITS class gun, never a single race gun.
 */
export interface StartClass {
  id: string;
  name: string;
  classFlag: string;
  sequence: StartSequence;
  /** Absolute start-gun time for this class (Unix ms). */
  startTime: number;
  boatIds: string[];
}

/* ------------------------------------------------------------------ */
/* Tracks                                                              */
/* ------------------------------------------------------------------ */

/** A single GPS fix from a phone, normalised from GPX. */
export interface TrackPoint {
  /** Unix epoch milliseconds. */
  t: number;
  lat: number;
  lon: number;
  /** Speed over ground, m/s, if available. */
  speed?: number;
  /** Course over ground, degrees 0–360, if available. Unreliable when slow. */
  cog?: number;
  /** Reported horizontal accuracy, metres, if available. */
  accuracy?: number;
}

/** A competitor's recorded track for one race. */
export interface BoatTrack {
  boatId: string;
  /** Boat length overall, metres. Sets the per-boat "too close to call" scale. */
  boatLengthM: number;
  /** Phone position aft of the bow, metres, along the centreline. */
  phoneOffsetFromBowM: number;
  points: TrackPoint[];
}

/* ------------------------------------------------------------------ */
/* Detection config                                                    */
/* ------------------------------------------------------------------ */

/** Tunable tolerances. Defaults from STEP-0-gps-accuracy-spec.md §3. */
export interface DetectionConfig {
  /** Working horizontal GPS error to design against (m). Spec: ~6 m. */
  workingErrorM: number;
  /** Radius around a mark that counts as a rounding (m). Spec: 15–20 m. */
  roundingRadiusM: number;
  /** Slop on the finish line crossing test (m). */
  finishToleranceM: number;
  /**
   * Beyond this distance over the line at the gun, an OCS call is CONFIDENT
   * (outside the error band). Spec: ~10 m. Triggers Individual Recall.
   */
  confidentOcsM: number;
  /**
   * Within this distance of the line at the gun, the call is TOO CLOSE TO CALL:
   * do not auto-penalise; surface to the OOD. Spec: ~ working error (~6 m).
   */
  tooCloseToCallM: number;
  /** Below this speed (m/s), COG is unreliable; don't apply the bow offset. */
  cogReliableMinSpeedMs: number;
}

export const DEFAULT_CONFIG: DetectionConfig = {
  workingErrorM: 6,
  roundingRadiusM: 18,
  finishToleranceM: 18,
  confidentOcsM: 10,
  tooCloseToCallM: 6,
  cogReliableMinSpeedMs: 1.0,
};

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

/** Over-the-line status at the start. */
export type StartStatus =
  | "clean"
  | "ocs-confident" // clearly over (> confidentOcsM): Individual Recall / OCS
  | "too-close-to-call"; // within error band: OOD decides

export interface MarkRounding {
  markId: string;
  /** Time of closest approach inside the rounding zone. */
  time: number;
  minDistanceM: number;
}

export interface DetectionFlag {
  kind:
    | "start-too-close-to-call"
    | "start-ocs-confident"
    | "missed-rounding"
    | "no-start-detected"
    | "no-finish-detected"
    | "gps-dropout";
  message: string;
  relatedBoatId?: string;
  time?: number;
}

export interface BoatRaceResult {
  boatId: string;
  classId: string;
  startStatus: StartStatus;
  startTime: number | null;
  roundings: (MarkRounding | null)[];
  finishTime: number | null;
  /** Elapsed seconds, gun to finish. Null if either end missing. */
  elapsedSeconds: number | null;
  flags: DetectionFlag[];
}

/** Scratch result row for the ranked finish-order table / CSV. */
export interface RankedResult {
  rank: number | null; // null if DNF/OCS
  boatId: string;
  classId: string;
  finishTime: number | null;
  elapsedSeconds: number | null;
  status: "finished" | "OCS" | "DNF" | "protest";
}
