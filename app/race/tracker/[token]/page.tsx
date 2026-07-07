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
import { GpsSimulator, type SimCourse, SIM_SPEED_MULTIPLIER } from '@/lib/gps-simulator'
import { BoatIdentityNudge } from '@/components/BoatIdentityNudge'
import { StartCountdown } from '@/components/race/StartCountdown'
import { MarkReachedBanner } from '@/components/race/MarkReachedBanner'
import { FinishBanner } from '@/components/race/FinishBanner'
import { useRaceProgress, type ProgressCourse } from '@/lib/useRaceProgress'

// ── Types (mirrors the live page shapes) ───────────────────────────────────────
interface RaceData {
  id: string
  name: string
  entry_token: string
  status: string
  course_template_id: string | null
  start_scheduled_at: string | null
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

// Mark rounding + finish detection are provided by the shared useRaceProgress
// hook so this tracker behaves IDENTICALLY to the Nav screen (and the sim).

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

  // Refs for the GPS closure (avoid stale state)
  const courseRef = useRef<CourseData | null>(null)
  const entryRef = useRef<EntryData | null>(null)
  const raceRef = useRef<RaceData | null>(null)
  const userRef = useRef<{ id: string } | null>(null)
  const simModeRef = useRef(false)
  const startClassesRef = useRef<StartClass[]>([])

  useEffect(() => { courseRef.current = course }, [course])
  useEffect(() => { raceRef.current = race }, [race])
  useEffect(() => { userRef.current = user ? { id: user.id } : null }, [user])
  useEffect(() => { participantRef.current = participantId }, [participantId])
  useEffect(() => { simModeRef.current = isSim }, [isSim])
  useEffect(() => { entryRef.current = entry }, [entry])
  useEffect(() => { startClassesRef.current = startClasses }, [startClasses])

  // ── Synchronised start time + shared race progress ───────────────────────
  const startTimeIso = race?.start_scheduled_at ?? startClasses[0]?.start_time ?? null
  const startMs = startTimeIso ? new Date(startTimeIso).getTime() : null
  const warningMins = startClasses[0]?.sequence_warning_mins ?? 5

  const progressCourse: ProgressCourse | null = course
  const {
    markReached,
    finished,
    finishTime,
    elapsedSeconds,
    processFix: progressFix,
    setFinishedExternally,
  } = useRaceProgress(progressCourse, {
    startTimeIso,
    onMarkRounded: (nextMarkIndex, currentLap) => {
      // Persist progress for live standings (not in training mode).
      const e = entryRef.current
      if (e && !simModeRef.current && navigator.onLine) {
        const supabase = getBrowserClient()
        void supabase
          .from('race_entries')
          .update({ last_mark_index: nextMarkIndex, laps_completed: currentLap - 1 })
          .eq('id', e.id)
      }
    },
    onFinish: (ft, elapsed) => {
      const e = entryRef.current
      if (e && navigator.onLine && !simModeRef.current) {
        const supabase = getBrowserClient()
        void supabase
          .from('race_entries')
          .update({
            finish_time: ft,
            elapsed_seconds: elapsed,
            laps_completed: courseRef.current?.laps ?? 1,
          })
          .eq('id', e.id)
      }
    },
  })

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
      .select('id, name, entry_token, status, course_template_id, start_scheduled_at')
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
        setFinishedExternally((entryData as EntryData).finish_time!)
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
          setFinishedExternally(d.entry.finish_time)
        }
      }
      setLoading(false)
      return true
    } catch {
      return false
    }
  }

  // Mark rounding + finish detection now live in useRaceProgress (progressFix),
  // shared verbatim with the Nav screen. Persistence side-effects are wired via
  // the hook's onMarkRounded / onFinish callbacks above.

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

      progressFix(lat, lon, spd)
    },
    [isSim, progressFix],
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
        { mode: 'auto', tickMs: 1000, speedMultiplier: SIM_SPEED_MULTIPLIER, boatSpeedKts: 6 },
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

  // ── Realtime: watch THIS race row so the committee's synchronised start gun
  //    (races.start_scheduled_at, set from Race Control) appears live here ──────
  useEffect(() => {
    if (!race?.id) return
    const supabase = getBrowserClient()
    const channel = supabase
      .channel(`race:${race.id}:tracker`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'races', filter: `id=eq.${race.id}` },
        (payload) => {
          const n = payload.new as Partial<RaceData>
          setRace((r) => (r ? { ...r, ...n } : r))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [race?.id])

  // Whether the start gun has fired (sped up in the simulator so it's testable).
  const [raceStarted, setRaceStarted] = useState(false)
  useEffect(() => {
    if (startMs == null) { setRaceStarted(false); return }
    const speed = isSim ? SIM_SPEED_MULTIPLIER : 1
    const anchorReal = Date.now()
    const anchorSim = Date.now()
    const iv = setInterval(() => {
      const nowMs = speed === 1 ? Date.now() : anchorSim + (Date.now() - anchorReal) * speed
      if (startMs - nowMs <= 0) {
        setRaceStarted(true)
        clearInterval(iv)
      }
    }, 200)
    return () => clearInterval(iv)
  }, [startMs, isSim])

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

      {/* Boat identity nudge — compact so it doesn't cover instruments */}
      {!isSim && race && (
        <div className="px-3 pt-3">
          <BoatIdentityNudge raceId={race.id} userId={user?.id ?? null} participantId={participantId} compact />
        </div>
      )}

      {/* Mark-reached announcement — shared banner (identical on Nav / Sim) */}
      {!finished && <MarkReachedBanner markReached={markReached} variant="banner" />}

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
          <FinishBanner
            finishTime={finishTime}
            elapsedSeconds={elapsedSeconds}
            variant="inline"
            showRegisterNudge={!user}
            registerHref={`/register?race=${token}`}
          />
        ) : (
          <>
            <div className={`flex items-center gap-3 rounded-full ring-2 ${statusMeta.ring} px-5 py-3`}>
              <span className={`h-4 w-4 rounded-full ${statusMeta.dot}`} />
              <span className="text-lg font-semibold">{statusMeta.label}</span>
            </div>

            {!raceStarted && startMs != null && (
              <div className="w-full max-w-sm">
                <StartCountdown
                  startMs={startMs}
                  warningMins={warningMins}
                  speedMultiplier={isSim ? SIM_SPEED_MULTIPLIER : 1}
                  compact
                />
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
