'use client'

// lib/useRaceProgress.ts
// Shared mark-rounding + finish detection for the sailor race screens.
//
// The geometry / detection logic here is lifted VERBATIM from the original
// app/race/live nav screen so every screen (Nav, Tracker, and the Simulator
// context that drives them) rounds marks and detects the finish IDENTICALLY.
// It owns only the *race progress* concern:
//   - advancing through the mark list (with laps)
//   - the transient "mark reached" announcement (which mark + what's next)
//   - finish-line crossing detection + finish time / elapsed
//
// It deliberately does NOT own: GPS acquisition, position persistence, OCS, or
// the start countdown. Callers feed it fixes via `processFix` and render the
// returned `markReached` / `finished` state (see MarkReachedBanner / FinishBanner).

import { useCallback, useEffect, useRef, useState } from 'react'

// Mark-rounding zone: ~25 m wide (a 12.5 m radius circle around the mark).
// 1 nautical mile = 1852 m, so 12.5 m = 0.00675 nm.
export const MARK_ROUNDING_NM = 12.5 / 1852

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export function linesIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean {
  const d = (p4[1] - p3[1]) * (p2[0] - p1[0]) - (p4[0] - p3[0]) * (p2[1] - p1[1])
  if (Math.abs(d) < 1e-10) return false
  const ua = ((p4[0] - p3[0]) * (p1[1] - p3[1]) - (p4[1] - p3[1]) * (p1[0] - p3[0])) / d
  const ub = ((p2[0] - p1[0]) * (p1[1] - p3[1]) - (p2[1] - p1[1]) * (p1[0] - p3[0])) / d
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
}

export interface ProgressMark {
  lat: number
  lon: number
  name: string
  roundingSide: 'port' | 'starboard'
  index: number
}

export interface ProgressCourse {
  laps: number
  marks: ProgressMark[]
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

export interface MarkReached {
  reached: string
  next: string | null
}

export interface UseRaceProgressOptions {
  /** How long the mark-reached banner stays up (ms). Default 6000. */
  announceMs?: number
  /** Called when the finish line is crossed, with ISO finish time + elapsed secs. */
  onFinish?: (finishTime: string, elapsedSeconds: number | null) => void
  /** Called each time a mark is rounded, with the new (post-rounding) index + lap. */
  onMarkRounded?: (nextMarkIndex: number, currentLap: number) => void
  /** Absolute start time (ISO) used to compute elapsed at finish. */
  startTimeIso?: string | null
}

export interface UseRaceProgressResult {
  nextMarkIndex: number
  currentLap: number
  markReached: MarkReached | null
  finished: boolean
  finishTime: string | null
  elapsedSeconds: number | null
  /** Feed a GPS fix. speedKts is used for the finish-crossing guard (>0.5kt). */
  processFix: (lat: number, lon: number, speedKts: number) => void
  /** Force-finish (e.g. rehydrating an already-finished entry). */
  setFinishedExternally: (finishTime: string) => void
}

/**
 * Shared race-progress engine. Identical mark-rounding + finish geometry to the
 * original Nav screen — callers just pipe fixes in and render the state out.
 */
export function useRaceProgress(
  course: ProgressCourse | null,
  opts: UseRaceProgressOptions = {},
): UseRaceProgressResult {
  const { announceMs = 6000, onFinish, onMarkRounded, startTimeIso } = opts

  const [nextMarkIndex, setNextMarkIndex] = useState(0)
  const [currentLap, setCurrentLap] = useState(1)
  const [markReached, setMarkReached] = useState<MarkReached | null>(null)
  const [finished, setFinished] = useState(false)
  const [finishTime, setFinishTime] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null)

  const courseRef = useRef<ProgressCourse | null>(course)
  const nextMarkIndexRef = useRef(0)
  const currentLapRef = useRef(1)
  const finishedRef = useRef(false)
  const prevPosRef = useRef<{ lat: number; lon: number } | null>(null)
  const markReachedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onFinishRef = useRef(onFinish)
  const onMarkRoundedRef = useRef(onMarkRounded)
  const startTimeRef = useRef<string | null | undefined>(startTimeIso)

  useEffect(() => { courseRef.current = course }, [course])
  useEffect(() => { nextMarkIndexRef.current = nextMarkIndex }, [nextMarkIndex])
  useEffect(() => { currentLapRef.current = currentLap }, [currentLap])
  useEffect(() => { finishedRef.current = finished }, [finished])
  useEffect(() => { onFinishRef.current = onFinish }, [onFinish])
  useEffect(() => { onMarkRoundedRef.current = onMarkRounded }, [onMarkRounded])
  useEffect(() => { startTimeRef.current = startTimeIso }, [startTimeIso])
  useEffect(() => () => { if (markReachedTimerRef.current) clearTimeout(markReachedTimerRef.current) }, [])

  const setFinishedExternally = useCallback((ft: string) => {
    setFinished(true)
    setFinishTime(ft)
  }, [])

  const processFix = useCallback((lat: number, lon: number, speedKts: number) => {
    const c = courseRef.current
    if (!c || finishedRef.current) return

    const marks = c.marks
    const totalLaps = c.laps
    const nmi = nextMarkIndexRef.current
    const lap = currentLapRef.current

    // Mark rounding detection (identical to original Nav logic).
    if (nmi < marks.length) {
      const nextMark = marks[nmi]
      const dist = haversineNm(lat, lon, nextMark.lat, nextMark.lon)

      if (dist < MARK_ROUNDING_NM) {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate([100, 50, 100])
        }

        const isLastMark = nmi === marks.length - 1
        let newIndex: number

        if (isLastMark && lap < totalLaps) {
          currentLapRef.current = lap + 1
          setCurrentLap((prev) => prev + 1)
          newIndex = 0
          nextMarkIndexRef.current = 0
          setNextMarkIndex(0)
        } else if (isLastMark && lap >= totalLaps) {
          newIndex = marks.length // targeting finish
          nextMarkIndexRef.current = marks.length
          setNextMarkIndex(marks.length)
        } else {
          newIndex = nmi + 1
          nextMarkIndexRef.current = nmi + 1
          setNextMarkIndex((prev) => prev + 1)
        }

        // Announce: which mark was reached + the next one to aim for.
        const reachedName = nextMark.name || `Mark ${nmi + 1}`
        const upcoming =
          newIndex < marks.length ? marks[newIndex].name || `Mark ${newIndex + 1}` : 'Finish'
        setMarkReached({ reached: reachedName, next: upcoming })
        if (markReachedTimerRef.current) clearTimeout(markReachedTimerRef.current)
        markReachedTimerRef.current = setTimeout(() => setMarkReached(null), announceMs)

        onMarkRoundedRef.current?.(nextMarkIndexRef.current, currentLapRef.current)
      }
    }

    // Finish line crossing (only once all marks done) — identical to Nav.
    if (prevPosRef.current && nextMarkIndexRef.current >= marks.length) {
      const finish = c.finish_at_start
        ? c.start_line_lat1 != null
          ? { lat1: c.start_line_lat1, lng1: c.start_line_lng1!, lat2: c.start_line_lat2!, lng2: c.start_line_lng2! }
          : null
        : c.finish_line_lat1 != null
          ? { lat1: c.finish_line_lat1, lng1: c.finish_line_lng1!, lat2: c.finish_line_lat2!, lng2: c.finish_line_lng2! }
          : null

      if (finish && speedKts > 0.5) {
        const crossed = linesIntersect(
          [prevPosRef.current.lat, prevPosRef.current.lon],
          [lat, lon],
          [finish.lat1, finish.lng1],
          [finish.lat2, finish.lng2],
        )

        if (crossed) {
          const ft = new Date().toISOString()
          const startedAt = startTimeRef.current ?? null
          const elapsed = startedAt ? (Date.now() - new Date(startedAt).getTime()) / 1000 : null
          finishedRef.current = true
          setFinished(true)
          setFinishTime(ft)
          setElapsedSeconds(elapsed)
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate([200, 100, 200, 100, 500])
          }
          onFinishRef.current?.(ft, elapsed)
        }
      }
    }

    prevPosRef.current = { lat, lon }
  }, [announceMs])

  return {
    nextMarkIndex,
    currentLap,
    markReached,
    finished,
    finishTime,
    elapsedSeconds,
    processFix,
    setFinishedExternally,
  }
}
