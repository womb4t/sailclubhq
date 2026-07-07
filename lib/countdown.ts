// lib/countdown.ts
// Pure helpers for the synchronised race start countdown.
//
// The countdown is driven by an ABSOLUTE start timestamp (ISO / epoch ms) that
// lives on the race row. Because every device computes `startMs - now`, all
// boats + the committee see the same numbers — no server tick needed.
//
// This module is pure (no React, no DOM, no audio) so it can be unit-reasoned
// and shared between the on-the-water Race Nav and the OOD Race Control tab.

export type CountdownPhase = 'pre-warning' | 'warning' | 'prep' | 'start'

export interface CountdownState {
  /** ms until the gun (negative once started). */
  diffMs: number
  /** true once diffMs <= 0. */
  started: boolean
  /** Display string: "GO!", tenths ("5.3") under 10s, else "M:SS" / "MM:SS". */
  display: string
  phase: CountdownPhase
  /** Whole seconds remaining (ceil), floored at 0. */
  wholeSecs: number
}

/**
 * Compute the countdown state for a given absolute start time.
 * @param startMs  epoch ms of the start gun
 * @param nowMs    epoch ms "now" (pass a simulated clock to speed it up)
 * @param warningMins  minutes before the gun the warning signal sounds (default 5)
 */
export function computeCountdown(startMs: number, nowMs: number, warningMins = 5): CountdownState {
  const diffMs = startMs - nowMs

  if (diffMs <= 0) {
    return { diffMs, started: true, display: 'GO!', phase: 'start', wholeSecs: 0 }
  }

  const totalSecs = Math.ceil(diffMs / 1000)
  const warnSecs = warningMins * 60

  let phase: CountdownPhase
  if (totalSecs > warnSecs) phase = 'pre-warning'
  else if (totalSecs > warnSecs - 60) phase = 'warning'
  else if (totalSecs > 60) phase = 'prep'
  else phase = 'start'

  let display: string
  if (diffMs <= 10000) {
    // Crisp tenths for the final approach (e.g. 5.3).
    display = (diffMs / 1000).toFixed(1)
    phase = 'start'
  } else {
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    display = `${mins}:${String(secs).padStart(2, '0')}`
  }

  return { diffMs, started: false, display, phase, wholeSecs: totalSecs }
}

/** Tailwind text colour for each phase (dark-panel palette, matches Race Nav). */
export const countdownColor: Record<CountdownPhase, string> = {
  'pre-warning': 'text-white',
  warning: 'text-amber-400',
  prep: 'text-amber-300',
  start: 'text-green-400',
}

/** Tailwind background for each phase (dark-panel palette, matches Race Nav). */
export const countdownBg: Record<CountdownPhase, string> = {
  'pre-warning': 'bg-gray-950',
  warning: 'bg-amber-950',
  prep: 'bg-amber-900',
  start: 'bg-green-950',
}

export const phaseLabel: Record<CountdownPhase, string> = {
  'pre-warning': 'Race starts in',
  warning: '⚑ Warning Signal',
  prep: '⚑ Prep Signal',
  start: '🏁 Start imminent',
}
