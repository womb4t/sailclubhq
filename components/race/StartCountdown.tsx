'use client'

// components/race/StartCountdown.tsx
// Self-contained, synchronised start countdown display.
//
// Driven by an ABSOLUTE start timestamp so every device (committee boat, each
// sailor) shows the same numbers. Reuses the shared audio (start-audio) and the
// pure countdown maths (countdown) — same 5-4-3-2-1 beeps + tenths-under-10s +
// gun tone as the on-the-water Race Nav.
//
// Realtime is NOT this component's job: the parent owns the race row + realtime
// subscription and simply passes the current `startMs` down. When the controller
// changes the start time, the parent re-renders with a new `startMs` and the
// countdown re-syncs automatically.
//
// SIMULATOR: pass `speedMultiplier` > 1 (from the GPS sim context) and the
// displayed clock advances faster so testers watch the whole sequence in seconds.
// It works by tracking a simulated "now" that accrues real elapsed time * factor.

import { useEffect, useRef, useState } from 'react'
import {
  computeCountdown,
  countdownColor,
  countdownBg,
  phaseLabel,
  type CountdownState,
} from '@/lib/countdown'
import { playBeeps, playLongTone } from '@/lib/start-audio'

interface StartCountdownProps {
  /** Absolute start time (epoch ms). Null hides the countdown. */
  startMs: number | null
  /** Minutes before the gun the warning signal sounds. Default 5. */
  warningMins?: number
  /** >1 speeds the displayed clock (simulator). Default 1 (real time). */
  speedMultiplier?: number
  /** Fire audible beeps/gun. Default true. */
  audio?: boolean
  /** Compact card styling for the Race Control panel vs the full nav footer. */
  compact?: boolean
}

export function StartCountdown({
  startMs,
  warningMins = 5,
  speedMultiplier = 1,
  audio = true,
  compact = false,
}: StartCountdownProps) {
  const [state, setState] = useState<CountdownState | null>(null)
  const audioFired = useRef<Set<string>>(new Set())
  // Simulated clock bookkeeping: real wall time when this startMs began ticking.
  const simAnchorRef = useRef<{ realStart: number; simStart: number } | null>(null)

  useEffect(() => {
    if (startMs == null) {
      setState(null)
      return
    }
    // Reset audio + sim anchor whenever the target start time changes.
    audioFired.current = new Set()
    simAnchorRef.current = { realStart: Date.now(), simStart: Date.now() }

    const tick = () => {
      let nowMs = Date.now()
      if (speedMultiplier !== 1 && simAnchorRef.current) {
        const { realStart, simStart } = simAnchorRef.current
        nowMs = simStart + (Date.now() - realStart) * speedMultiplier
      }
      const s = computeCountdown(startMs, nowMs, warningMins)
      setState(s)

      if (!audio) return

      if (s.started) {
        if (!audioFired.current.has('go')) {
          audioFired.current.add('go')
          playLongTone(1200)
        }
        return
      }

      // 5-4-3-2-1 ticks under 10s.
      if (s.diffMs <= 10000) {
        const whole = Math.ceil(s.diffMs / 1000)
        const key = `cd${whole}`
        if (whole <= 5 && whole >= 1 && !audioFired.current.has(key)) {
          audioFired.current.add(key)
          playBeeps(1)
        }
        return
      }
      // Coarse signals.
      if (s.wholeSecs === 60 && !audioFired.current.has('1min')) {
        audioFired.current.add('1min')
        playBeeps(1)
      } else if (s.wholeSecs === 30 && !audioFired.current.has('30s')) {
        audioFired.current.add('30s')
        playBeeps(3, 100, 100)
      } else if (s.wholeSecs === warningMins * 60 && !audioFired.current.has('warning')) {
        audioFired.current.add('warning')
        playBeeps(1)
      }
    }

    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [startMs, warningMins, speedMultiplier, audio])

  if (startMs == null || !state) return null

  if (state.started) {
    return (
      <div className={`${compact ? 'rounded-xl py-6' : 'h-56'} bg-green-950 flex flex-col items-center justify-center text-center`}>
        <p className="text-green-300 text-sm font-semibold uppercase tracking-wide">Started</p>
        <p className="text-green-400 font-mono font-bold text-6xl animate-pulse">GO!</p>
      </div>
    )
  }

  return (
    <div
      className={`${compact ? 'rounded-xl py-6' : state.phase === 'start' ? 'h-56' : 'h-44'} ${countdownBg[state.phase]} flex flex-col items-center justify-center px-4 py-3 text-center transition-all duration-500`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-300 mb-1">
        {phaseLabel[state.phase]}
      </p>
      <div
        className={`font-mono font-bold tabular-nums tracking-tight ${countdownColor[state.phase]} ${
          state.phase === 'start' ? 'text-7xl animate-pulse' : 'text-6xl'
        }`}
      >
        {state.display}
      </div>
    </div>
  )
}
