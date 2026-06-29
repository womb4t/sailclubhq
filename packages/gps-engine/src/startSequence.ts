/**
 * Start-sequence helpers.
 *
 * The standard UK / World Sailing sequence is 5-4-1-Go. This is the default;
 * the OOD can edit intervals and prep flag, and stagger multiple classes off a
 * shared clock (the cruiser variation).
 */

import type { PrepFlag, SequenceSignal, StartClass, StartSequence } from "./types";

/** The standard 5-4-1-Go sequence under a given prep flag (default P). */
export function standardSequence(prepFlag: PrepFlag = "P"): StartSequence {
  const signals: SequenceSignal[] = [
    { secondsBeforeStart: 300, sounds: 1, action: "Class flag up (Warning)" },
    { secondsBeforeStart: 240, sounds: 1, action: `Prep flag up (${prepFlag})` },
    { secondsBeforeStart: 60, sounds: 1, action: "Prep flag down", longSound: true },
    { secondsBeforeStart: 0, sounds: 1, action: "Class flag down (Start)" },
  ];
  return { prepFlag, signals };
}

/**
 * Build a list of staggered classes off a shared first-gun time.
 * e.g. classes ["A","B","C"] starting every 5 min from 11:00.
 */
export function staggeredClasses(
  firstGunMs: number,
  intervalSeconds: number,
  classes: { id: string; name: string; classFlag: string; boatIds: string[] }[],
  prepFlag: PrepFlag = "P",
): StartClass[] {
  return classes.map((c, i) => ({
    ...c,
    sequence: standardSequence(prepFlag),
    startTime: firstGunMs + i * intervalSeconds * 1000,
  }));
}

/** Absolute timestamp (ms) for a given signal in a class's sequence. */
export function signalTime(cls: StartClass, signal: SequenceSignal): number {
  return cls.startTime - signal.secondsBeforeStart * 1000;
}
