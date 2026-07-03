'use client'

// Tracker-only "phone as beacon" page.
//
// For sailors who navigate on their own instruments (chartplotter / Navionics /
// OpenCPN) but still want to appear on the club's live tracking. No map, no
// navigation UI — just a bold cockpit-readable status screen. GPS fixes are
// queued offline (IndexedDB) and synced when signal returns, exactly like the
// full Race Nav. Finish-line crossing is still detected in the background so
// results work, but nothing navigational is shown.

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import {
  savePosition,
  flushPositions,
  getUnsyncedCount,
  registerReconnectFlush,
  cacheRaceData,
  getCachedRaceByToken,
} from '@/lib/offline-gps'
import { GpsSimulator, type SimCourse } from '@/lib/gps-simulator'

// ── Types (mirrors the live page shapes) ───────────────────────────────────────
interface RaceData {
  id: string
  name: string
  entry_token: string
  status: string
  course_template_id: string | null
}
interface StartClass {
  id: string
  name: string
  start_time: string
  sequence_warning_mins: number
}
interface CourseMark {
  lat: number
  lon: number
  name: string
  roundingSide: 'port' | 'starboard'
  index: number
}
interface CourseData {
  id: string
  name: string
  laps: number
  start_line_lat1: number | null
  start_line_lng1: number | null
  start_line_lat2: number | null
  start_line_lng2: number | null
  finish_line_lat1: number | null
  finish_line_lng1: number | null
  finish_line_lat2: number | null
  finish_line_lng2: number | null
  finish_at_start: boolean | null
  marks: CourseMark[]
}
interface EntryData {
  id: string
  helm_name: string | null
  finish_time: string | null
  laps_completed: number
}

// ── Geometry (self-contained; nm distance + segment intersection) ──────────────
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065 // nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function linesIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean {
  const d = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  )
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function TrackerPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = params.token as string
  const isSim = searchParams.get('sim') === '1'
  const { user, loading: authLoading } = useAuth()
  const simRef = useRef<GpsSimulator | null>(null)

  // Anonymous participant id (set by /race/go for no-login trackers).
  const [participantId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('scq-participant-id')
  })
  // We can track if we're logged in OR this device has joined anonymously.
  const hasIdentity = !!user || !!participantId
  const participantRef = useRef<string | null>(null)

  const [race, setRace] = useState<RaceData | null>(null)
  const [course, setCourse] = useState<CourseData | null>(null)
  const [startClasses, setStartClasses] = useState<StartClass[]>([])
  const [entry, setEntry] = useState<EntryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [gpsStatus, setGpsStatus] = useState<'waiting' | 'active' | 'error'>('waiting')
  const [speedKts, setSpeedKts] = useState(0)
  const [headingDeg, setHeadingDeg] = useState<number | null>(null)
  const [accuracyM, setAccuracyM] = useState<number | null>(null)
  const [recordedCount, setRecordedCount] = useState(0)
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [finished, setFinished] = useState(false)
  const [finishTime, setFinishTime] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<string | null>(null)

  // Refs for the GPS closure (avoid stale state)
  const courseRef = useRef<CourseData | null>(null)
  const entryRef = useRef<EntryData | null>(null)
  const raceRef = useRef<RaceData | null>(null)
  const userRef = useRef<{ id: string } | null>(null)
  const simModeRef = useRef(false)
  const startClassesRef = useRef<StartClass[]>([])
  const prevPosRef = useRef<{ lat: number; lon: number } | null>(null)
  const nextMarkIndexRef = useRef(0)
  const currentLapRef = useRef(1)
  const finishedRef = useRef(false)

  useEffect(() => { courseRef.current = course }, [course])
  useEffect(() => { raceRef.current = race }, [race])
  useEffect(() => { userRef.current = user ? { id: user.id } : null }, [user])
  useEffect(() => { participantRef.current = participantId }, [participantId])
  useEffect(() => { simModeRef.current = isSim }, [isSim])
  useEffect(() => { entryRef.current = entry }, [entry])
  useEffect(() => { startClassesRef.current = startClasses }, [startClasses])
  useEffect(() => { finishedRef.current = finished }, [finished])

  // ── Identity gate ──────────────────────────────────────────────────────────
  // Logged-in members are fine. Anonymous devices need a participant id (set by
  // the /race/go join flow). No identity at all -> send them to /race/go to join.
  useEffect(() => {
    if (authLoading) return
    if (!user && !participantId) {
      router.replace(`/race/go/${token}`)
    }
  }, [authLoading, user, participantId, token, router])

  // ── Online/offline listeners + reconnect flush ────────────────────────────────
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const unregister = registerReconnectFlush(() => {
      void getUnsyncedCount().then(setUnsyncedCount)
    })
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      unregister()
    }
  }, [])

  // ── Load race data (online, with offline cache fallback) ──────────────────────
  useEffect(() => {
    if (!hasIdentity || !token) return
    void loadRaceData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIdentity, token])

  async function loadRaceData() {
    const supabase = getBrowserClient()
    const { data: raceData, error: raceErr } = await supabase
      .from('races')
      .select('id, name, entry_token, status, course_template_id')
      .eq('entry_token', token)
      .single()

    if (raceErr || !raceData) {
      const restored = await loadFromCache()
      if (!restored) {
        setError('Race not found. Check your link.')
        setLoading(false)
      }
      return
    }

    const r = raceData as RaceData
    setRace(r)
    let loadedCourse: CourseData | null = null
    let loadedEntry: EntryData | null = null

    const { data: classes } = await supabase
      .from('start_classes')
      .select('id, name, start_time, sequence_warning_mins')
      .eq('race_id', r.id)
      .order('start_time', { ascending: true })
    if (classes) setStartClasses(classes as StartClass[])

    if (r.course_template_id) {
      const { data: tpl } = await supabase
        .from('course_templates')
        .select('*')
        .eq('id', r.course_template_id)
        .single()
      if (tpl) {
        const { data: legs } = await supabase
          .from('course_template_legs')
          .select('sequence_index, rounding_side, mark_id')
          .eq('template_id', tpl.id)
          .order('sequence_index', { ascending: true })

        const marks: CourseMark[] = []
        if (legs && legs.length > 0) {
          const markIds = (legs as Array<{ mark_id: string }>).map((l) => l.mark_id)
          const { data: markData } = await supabase
            .from('marks')
            .select('id, name, lat, lon')
            .in('id', markIds)
          if (markData) {
            ;(legs as Array<{ sequence_index: number; rounding_side: 'port' | 'starboard'; mark_id: string }>).forEach(
              (leg, i) => {
                const m = (markData as Array<{ id: string; name: string; lat: number; lon: number }>).find(
                  (md) => md.id === leg.mark_id,
                )
                if (m) marks.push({ lat: m.lat, lon: m.lon, name: m.name, roundingSide: leg.rounding_side, index: i })
              },
            )
          }
        }

        const courseData: CourseData = {
          id: tpl.id,
          name: tpl.name,
          laps: (tpl.laps as number | null) ?? 1,
          start_line_lat1: tpl.start_line_lat1 as number | null,
          start_line_lng1: tpl.start_line_lng1 as number | null,
          start_line_lat2: tpl.start_line_lat2 as number | null,
          start_line_lng2: tpl.start_line_lng2 as number | null,
          finish_line_lat1: tpl.finish_line_lat1 as number | null,
          finish_line_lng1: tpl.finish_line_lng1 as number | null,
          finish_line_lat2: tpl.finish_line_lat2 as number | null,
          finish_line_lng2: tpl.finish_line_lng2 as number | null,
          finish_at_start: tpl.finish_at_start as boolean | null,
          marks,
        }
        setCourse(courseData)
        loadedCourse = courseData
      }
    }

    // Find this device/member's entry (by user_id if logged in, else participant_id).
    let entryQuery = supabase
      .from('race_entries')
      .select('id, helm_name, finish_time, laps_completed')
      .eq('race_id', r.id)
      .limit(1)
    entryQuery = user
      ? entryQuery.eq('user_id', user.id)
      : entryQuery.eq('participant_id', participantId!)
    const { data: entryData } = await entryQuery.maybeSingle()
    if (entryData) {
      setEntry(entryData as EntryData)
      loadedEntry = entryData as EntryData
      if ((entryData as EntryData).finish_time) {
        setFinished(true)
        setFinishTime((entryData as EntryData).finish_time)
      }
    }

    try {
      await cacheRaceData(r.id, token, {
        race: r,
        classes: classes ?? null,
        course: loadedCourse,
        entry: loadedEntry,
      })
    } catch {
      /* best-effort */
    }

    setLoading(false)
  }

  async function loadFromCache(): Promise<boolean> {
    try {
      const cached = await getCachedRaceByToken<{
        race: RaceData
        classes: StartClass[] | null
        course: CourseData | null
        entry: EntryData | null
      }>(token)
      if (!cached) return false
      const d = cached.data
      setRace(d.race)
      if (d.classes) setStartClasses(d.classes)
      if (d.course) setCourse(d.course)
      if (d.entry) {
        setEntry(d.entry)
        if (d.entry.finish_time) {
          setFinished(true)
          setFinishTime(d.entry.finish_time)
        }
      }
      setLoading(false)
      return true
    } catch {
      return false
    }
  }

  // ── Background finish detection (no UI, results only) ──────────────────────────
  const handleGpsBackground = useCallback((lat: number, lon: number, speed: number) => {
    const c = courseRef.current
    if (!c || finishedRef.current) return
    const marks = c.marks
    const nmi = nextMarkIndexRef.current
    const lap = currentLapRef.current

    // Advance through marks silently (buzz on rounding).
    if (nmi < marks.length) {
      const nextMark = marks[nmi]
      const dist = haversineNm(lat, lon, nextMark.lat, nextMark.lon)
      if (dist < 0.016) {
        if (typeof navigator.vibrate === 'function') navigator.vibrate([100, 50, 100])
        const isLast = nmi === marks.length - 1
        if (isLast && lap < c.laps) {
          currentLapRef.current = lap + 1
          nextMarkIndexRef.current = 0
        } else if (isLast && lap >= c.laps) {
          nextMarkIndexRef.current = marks.length
        } else {
          nextMarkIndexRef.current = nmi + 1
        }
      }
    }

    // Finish-line crossing once all marks rounded.
    if (prevPosRef.current && nextMarkIndexRef.current >= marks.length) {
      const finish = c.finish_at_start
        ? c.start_line_lat1 != null
          ? { lat1: c.start_line_lat1, lng1: c.start_line_lng1!, lat2: c.start_line_lat2!, lng2: c.start_line_lng2! }
          : null
        : c.finish_line_lat1 != null
          ? { lat1: c.finish_line_lat1, lng1: c.finish_line_lng1!, lat2: c.finish_line_lat2!, lng2: c.finish_line_lng2! }
          : null
      if (finish && speed > 0.5) {
        const crossed = linesIntersect(
          [prevPosRef.current.lat, prevPosRef.current.lon],
          [lat, lon],
          [finish.lat1, finish.lng1],
          [finish.lat2, finish.lng2],
        )
        if (crossed) {
          const ft = new Date().toISOString()
          setFinished(true)
          setFinishTime(ft)
          if (typeof navigator.vibrate === 'function') navigator.vibrate([200, 100, 200, 100, 500])
          const e = entryRef.current
          // TRAINING MODE: never write a finish time to the real DB.
          if (e && navigator.onLine && !simModeRef.current) {
            const supabase = getBrowserClient()
            const startedAt = startClassesRef.current[0]?.start_time ?? null
            void supabase
              .from('race_entries')
              .update({
                finish_time: ft,
                elapsed_seconds: startedAt ? (Date.now() - new Date(startedAt).getTime()) / 1000 : null,
                laps_completed: c.laps,
              })
              .eq('id', e.id)
          }
        }
      }
    }
  }, [])

  // Shared fix handler: update UI, queue (unless simulating), run bg detection.
  const processFix = useCallback(
    (lat: number, lon: number, spd: number, hdg: number | null, acc: number, recordedAt: string) => {
      setGpsStatus('active')
      setSpeedKts(spd)
      setHeadingDeg(hdg)
      setAccuracyM(acc)

      // TRAINING MODE: never write to the DB — pure client-side simulation.
      if (!isSim && raceRef.current && (userRef.current || participantRef.current)) {
        void savePosition({
          raceId: raceRef.current.id,
          userId: userRef.current?.id ?? null,
          participantId: userRef.current ? null : participantRef.current,
          entryId: entryRef.current?.id ?? null,
          lat,
          lon,
          speedKts: spd,
          headingDeg: hdg,
          accuracyM: acc,
          recordedAt,
        }).then(() => {
          setRecordedCount((n) => n + 1)
          void getUnsyncedCount().then(setUnsyncedCount)
        })
      } else if (isSim) {
        setRecordedCount((n) => n + 1)
      }

      handleGpsBackground(lat, lon, spd)
      prevPosRef.current = { lat, lon }
    },
    [isSim, handleGpsBackground],
  )

  // ── GPS watch (real) OR simulator (training) + offline queue ─────────────────────
  useEffect(() => {
    if (!race || !hasIdentity) return

    // TRAINING MODE: drive the UI from the synthetic engine, no real GPS/DB.
    if (isSim && course) {
      const simCourse: SimCourse = {
        laps: course.laps,
        marks: course.marks,
        start_line_lat1: course.start_line_lat1,
        start_line_lng1: course.start_line_lng1,
        start_line_lat2: course.start_line_lat2,
        start_line_lng2: course.start_line_lng2,
        finish_line_lat1: course.finish_line_lat1,
        finish_line_lng1: course.finish_line_lng1,
        finish_line_lat2: course.finish_line_lat2,
        finish_line_lng2: course.finish_line_lng2,
        finish_at_start: course.finish_at_start,
      }
      const sim = new GpsSimulator(
        simCourse,
        { mode: 'auto', tickMs: 1000, speedMultiplier: 8, boatSpeedKts: 6 },
        (p) => processFix(p.lat, p.lon, p.speed_kts, Math.round(p.heading), p.accuracy_m, p.recorded_at),
      )
      simRef.current = sim
      sim.start()
      return () => {
        sim.stop()
        simRef.current = null
      }
    }

    if (!navigator.geolocation) {
      const t = setTimeout(() => setGpsStatus('error'), 0)
      return () => clearTimeout(t)
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const hdg = pos.coords.heading
        processFix(
          pos.coords.latitude,
          pos.coords.longitude,
          (pos.coords.speed ?? 0) * 1.94384,
          hdg != null && !Number.isNaN(hdg) ? hdg : null,
          pos.coords.accuracy,
          new Date(pos.timestamp).toISOString(),
        )
      },
      (err) => {
        console.error('GPS error:', err)
        setGpsStatus('error')
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    )

    // Periodic flush to server (real mode only).
    const flushInterval = setInterval(() => {
      if (isSim) return
      void flushPositions().then(() => getUnsyncedCount().then(setUnsyncedCount))
    }, 30000)

    return () => {
      navigator.geolocation.clearWatch(watchId)
      clearInterval(flushInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race, hasIdentity, isSim, course, processFix])

  // ── Wake lock (keep screen/GPS alive) ──────────────────────────────────────────
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null
    let released = false
    async function request() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch {
        /* wake lock not critical */
      }
    }
    void request()
    const onVis = () => {
      if (document.visibilityState === 'visible' && !released) void request()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVis)
      void wakeLock?.release().catch(() => {})
    }
  }, [])

  // ── Countdown to first start ────────────────────────────────────────────────────
  useEffect(() => {
    if (startClasses.length === 0) return
    const startTime = new Date(startClasses[0].start_time).getTime()
    const tick = () => {
      const diff = startTime - Date.now()
      if (diff <= 0) {
        setCountdown(null)
        return
      }
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setCountdown(`${mins}:${String(secs).padStart(2, '0')}`)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [startClasses])

  async function stopTracking() {
    // One final flush attempt before leaving.
    if (!isSim) await flushPositions().catch(() => {})
    router.push(`/race/centre/${token}`)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (authLoading || (loading && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <p className="text-lg opacity-70">Loading tracker…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-4 p-6 text-center">
        <p className="text-lg">{error}</p>
        <Link href="/dashboard" className="underline opacity-80">Back to dashboard</Link>
      </div>
    )
  }

  const statusMeta = !isOnline
    ? { dot: 'bg-slate-400', label: 'Offline — positions queued', ring: 'ring-slate-400' }
    : gpsStatus === 'active'
      ? { dot: 'bg-green-400 animate-pulse', label: 'Tracking Active', ring: 'ring-green-400' }
      : gpsStatus === 'error'
        ? { dot: 'bg-red-500', label: 'GPS Error', ring: 'ring-red-500' }
        : { dot: 'bg-amber-400', label: 'Waiting for GPS…', ring: 'ring-amber-400' }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Training-mode banner */}
      {isSim && (
        <div className="bg-indigo-500 text-white text-center text-sm font-semibold py-2 px-3">
          🎓 Training Mode — simulated GPS, nothing is recorded
        </div>
      )}

      {/* Offline banner */}
      {!isSim && !isOnline && (
        <div className="bg-amber-500 text-slate-900 text-center text-sm font-semibold py-2 px-3">
          📡 Offline — {unsyncedCount} position{unsyncedCount === 1 ? '' : 's'} queued, will sync when connected
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold truncate">{race?.name}</h1>
          <span className="text-xs uppercase tracking-wide px-2 py-1 rounded bg-white/10">{race?.status}</span>
        </div>
        <p className="text-xs opacity-60 mt-1">Tracker mode · phone as beacon</p>
      </div>

      {/* Big status */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        {finished ? (
          <div className="text-center">
            <div className="text-6xl mb-3">🏁</div>
            <div className="text-3xl font-bold text-green-400">FINISHED</div>
            {finishTime && (
              <div className="text-sm opacity-70 mt-2">
                {new Date(finishTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className={`flex items-center gap-3 rounded-full ring-2 ${statusMeta.ring} px-5 py-3`}>
              <span className={`h-4 w-4 rounded-full ${statusMeta.dot}`} />
              <span className="text-lg font-semibold">{statusMeta.label}</span>
            </div>

            {countdown && (
              <div className="text-center">
                <div className="text-xs uppercase tracking-widest opacity-60">Start in</div>
                <div className="text-5xl font-mono font-bold tabular-nums">{countdown}</div>
              </div>
            )}

            {/* Instruments */}
            <div className="grid grid-cols-2 gap-6 w-full max-w-sm">
              <div className="text-center">
                <div className="text-xs uppercase tracking-widest opacity-60">Speed</div>
                <div className="text-5xl font-bold tabular-nums">{speedKts.toFixed(1)}</div>
                <div className="text-xs opacity-60">knots</div>
              </div>
              <div className="text-center">
                <div className="text-xs uppercase tracking-widest opacity-60">Heading</div>
                <div className="text-5xl font-bold tabular-nums">
                  {headingDeg != null ? `${Math.round(headingDeg)}°` : '—'}
                </div>
                <div className="text-xs opacity-60">degrees</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer stats + stop */}
      <div className="px-5 pb-6 pt-3 space-y-3">
        <div className="flex justify-between text-xs opacity-70">
          <span>{recordedCount} recorded</span>
          <span>{accuracyM != null ? `±${Math.round(accuracyM)}m` : 'accuracy —'}</span>
          <span>{unsyncedCount} queued</span>
        </div>
        <button
          onClick={stopTracking}
          className="w-full rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-lg font-semibold py-4 transition-colors"
        >
          ⏹ Stop Tracking
        </button>
      </div>
    </div>
  )
}
