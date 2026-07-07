'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import {
  cacheRaceData,
  getCachedRaceByToken,
  savePosition,
  flushPositions,
  getUnsyncedCount,
  registerReconnectFlush,
} from '@/lib/offline-gps'
import { GpsSimulator, type SimCourse, SIM_SPEED_MULTIPLIER } from '@/lib/gps-simulator'
import { useFleetPositions } from '@/lib/useFleetPositions'
import { BoatIdentityNudge } from '@/components/BoatIdentityNudge'
import type { RaceMapProps, RaceMapMark } from '@/components/map/RaceMap'
import { StartCountdown } from '@/components/race/StartCountdown'
import { MarkReachedBanner } from '@/components/race/MarkReachedBanner'
import { FinishBanner } from '@/components/race/FinishBanner'
import { useRaceProgress, type ProgressCourse } from '@/lib/useRaceProgress'

// Dynamically import to avoid SSR issues with Leaflet
const RaceMap = dynamic(() => import('@/components/map/RaceMap'), { ssr: false })

// ── Geo maths ─────────────────────────────────────────────────────────────────

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
  const x =
    Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

function isOnCourseSide(
  boatLat: number, boatLon: number,
  lineLat1: number, lineLon1: number,
  lineLat2: number, lineLon2: number,
  markLat: number, markLon: number,
): boolean {
  const d1 = (lineLon2 - lineLon1) * (boatLat - lineLat1) - (lineLat2 - lineLat1) * (boatLon - lineLon1)
  const d2 = (lineLon2 - lineLon1) * (markLat - lineLat1) - (lineLat2 - lineLat1) * (markLon - lineLon1)
  return (d1 > 0) === (d2 > 0)
}

function linesIntersect(
  p1: [number, number], p2: [number, number],
  p3: [number, number], p4: [number, number],
): boolean {
  const d = (p4[1] - p3[1]) * (p2[0] - p1[0]) - (p4[0] - p3[0]) * (p2[1] - p1[1])
  if (Math.abs(d) < 1e-10) return false
  const ua = ((p4[0] - p3[0]) * (p1[1] - p3[1]) - (p4[1] - p3[1]) * (p1[0] - p3[0])) / d
  const ub = ((p2[0] - p1[0]) * (p1[1] - p3[1]) - (p2[1] - p1[1]) * (p1[0] - p3[0])) / d
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
}

function compassPoint(deg: number): string {
  const pts = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return pts[Math.round(deg / 45) % 8]
}

function formatNm(nm: number): string {
  if (nm < 0.1) return `${Math.round(nm * 1852)}m`
  return `${nm.toFixed(2)}nm`
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

type AudioContextType = typeof AudioContext
declare global {
  interface Window {
    webkitAudioContext?: AudioContextType
  }
}

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    return new Ctx()
  } catch {
    return null
  }
}

function playBeeps(count: number, durationMs = 200, gapMs = 150) {
  const ctx = getAudioContext()
  if (!ctx) return
  for (let i = 0; i < count; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.4
    const start = ctx.currentTime + i * (durationMs + gapMs) / 1000
    osc.start(start)
    osc.stop(start + durationMs / 1000)
  }
}

function playLongTone(durationMs = 1000) {
  const ctx = getAudioContext()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = 660
  gain.gain.value = 0.5
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + durationMs / 1000)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface GpsPosition {
  lat: number
  lon: number
  heading: number
  speed_kts: number
  accuracy_m: number
  recorded_at: string
}

interface StartClass {
  id: string
  name: string
  start_time: string
  sequence_warning_mins: number
  general_recall: boolean
  recalled_at: string | null
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
  marks: RaceMapMark[]
}

interface RaceData {
  id: string
  name: string
  entry_token: string
  status: string
  start_scheduled_at: string | null
}

interface EntryData {
  id: string
  helm_name: string | null
  finish_time: string | null
  laps_completed: number
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveRacePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const isSim = searchParams.get('sim') === '1'
  const isSimRef = useRef(false)
  const simRef = useRef<GpsSimulator | null>(null)
  const token = params?.token as string
  const { user } = useAuth()

  const [participantId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('scq-participant-id')
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [race, setRace] = useState<RaceData | null>(null)
  const [course, setCourse] = useState<CourseData | null>(null)
  const [entry, setEntry] = useState<EntryData | null>(null)
  const [startClasses, setStartClasses] = useState<StartClass[]>([])

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<'waiting' | 'active' | 'error'>('waiting')
  const [currentPos, setCurrentPos] = useState<GpsPosition | null>(null)
  const prevPosRef = useRef<GpsPosition | null>(null)

  // Internal refs for GPS callback (avoid stale closures)
  const courseRef = useRef<CourseData | null>(null)
  const entryRef = useRef<EntryData | null>(null)
  const startClassesRef = useRef<StartClass[]>([])
  const raceRef = useRef<RaceData | null>(null)
  const userRef = useRef<{ id: string } | null>(null)
  const participantRef = useRef<string | null>(null)

  // Offline / sync state
  const [isOnline, setIsOnline] = useState(true)
  const [unsyncedCount, setUnsyncedCount] = useState(0)

  // Race progress (mark rounding + finish) is owned by the shared hook so Nav,
  // Tracker and the Simulator context all behave identically. See wiring below.

  // OCS (On Course Side) detection
  const [ocs, setOcs] = useState(false)
  const ocsRef = useRef(false)

  // General recall state
  const [generalRecall, setGeneralRecall] = useState(false)
  const [multipleOcsWarning, setMultipleOcsWarning] = useState(false)
  const [ocsCount, setOcsCount] = useState(0)

  // UI state
  const [courseUp, setCourseUp] = useState(true)
  const [showHeadingLine, setShowHeadingLine] = useState(false)
  const [trail, setTrail] = useState<[number, number][]>([])
  const [wholeCourse, setWholeCourse] = useState(false)
  const [batteryDismissed, setBatteryDismissed] = useState(false)
  const [mapCenter, setMapCenter] = useState<[number, number]>([51.5, -0.1])

  // Countdown — driven by the shared synchronised start time (races.start_scheduled_at,
  // falling back to the first start class). The StartCountdown component owns the
  // display + audio; this page only needs to know whether the gun has fired.
  const [raceStarted, setRaceStarted] = useState(false)
  const raceStartedRef = useRef(false)
  const audioFiredRef = useRef<Set<string>>(new Set())

  // Sync refs with state
  useEffect(() => { courseRef.current = course }, [course])
  useEffect(() => { ocsRef.current = ocs }, [ocs])
  useEffect(() => { raceStartedRef.current = raceStarted }, [raceStarted])

  // Reflect general_recall from already-loaded start class data
  useEffect(() => {
    if (startClasses.length === 0) return
    const cls = startClasses[0]
    if (cls.general_recall) {
      setGeneralRecall(true)
      setOcs(false)
      setRaceStarted(false)
    }
  }, [startClasses])
  useEffect(() => { entryRef.current = entry }, [entry])
  useEffect(() => { startClassesRef.current = startClasses }, [startClasses])
  useEffect(() => { raceRef.current = race }, [race])
  useEffect(() => { userRef.current = user ? { id: user.id } : null }, [user])
  useEffect(() => { participantRef.current = participantId }, [participantId])
  useEffect(() => { isSimRef.current = isSim }, [isSim])

  // Fleet positions — only subscribe while the whole-course view is open.
  const { boats: fleet } = useFleetPositions(wholeCourse && race ? race.id : null)

  // Append a point to the boat's track (breadcrumb). Called from GPS handlers
  // (event callbacks, not effects), skipping near-duplicates and capping length.
  const appendTrail = useCallback((lat: number, lon: number) => {
    setTrail((prev) => {
      const last = prev[prev.length - 1]
      if (last && Math.abs(last[0] - lat) < 1e-5 && Math.abs(last[1] - lon) < 1e-5) return prev
      const next: [number, number][] = [...prev, [lat, lon]]
      return next.length > 2000 ? next.slice(next.length - 2000) : next
    })
  }, [])

  // ── Synchronised start time ──────────────────────────────────────────────────
  // Prefer the absolute committee start gun (races.start_scheduled_at, set from
  // Race Control + pushed via realtime), falling back to the first start class.
  const startTimeIso = race?.start_scheduled_at ?? startClasses[0]?.start_time ?? null
  const startMs = startTimeIso ? new Date(startTimeIso).getTime() : null
  const warningMins = startClasses[0]?.sequence_warning_mins ?? 5

  // ── Shared race progress (mark rounding + finish) ────────────────────────────
  const progressCourse: ProgressCourse | null = course
  const {
    nextMarkIndex,
    currentLap,
    markReached,
    finished,
    finishTime,
    elapsedSeconds,
    processFix: progressFix,
    setFinishedExternally,
  } = useRaceProgress(progressCourse, {
    startTimeIso,
    onFinish: (ft, elapsed) => {
      playLongTone(1500)
      if (entryRef.current && !isSimRef.current) {
        const supabase = getBrowserClient()
        supabase.from('race_entries').update({
          finish_time: ft,
          elapsed_seconds: elapsed,
          laps_completed: courseRef.current?.laps ?? 1,
        }).eq('id', entryRef.current.id)
      }
    },
  })
  void setFinishedExternally

  // ── Load race data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    loadRaceData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function loadRaceData() {
    const supabase = getBrowserClient()

    const { data: raceData, error: raceErr } = await supabase
      .from('races')
      .select('id, name, entry_token, status, course_template_id, start_scheduled_at')
      .eq('entry_token', token)
      .single()

    if (raceErr || !raceData) {
      // Likely offline (or genuinely missing) — try the cached snapshot so a
      // sailor who loaded the race while ashore still sees marks at sea.
      const restored = await loadFromCache()
      if (!restored) {
        setError('Race not found. Check your link.')
        setLoading(false)
      }
      return
    }

    setRace(raceData as RaceData)
    let loadedCourse: CourseData | null = null
    let loadedEntry: EntryData | null = null

    // Fetch start classes
    const { data: classes } = await supabase
      .from('start_classes')
      .select('id, name, start_time, sequence_warning_mins, general_recall, recalled_at')
      .eq('race_id', raceData.id)
      .order('start_time', { ascending: true })

    if (classes) setStartClasses(classes as StartClass[])

    // Fetch course template + legs + marks
    if (raceData.course_template_id) {
      const { data: tpl } = await supabase
        .from('course_templates')
        .select('*')
        .eq('id', raceData.course_template_id)
        .single()

      if (tpl) {
        const { data: legs } = await supabase
          .from('course_template_legs')
          .select('sequence_index, rounding_side, mark_id')
          .eq('template_id', tpl.id)
          .order('sequence_index', { ascending: true })

        const marks: RaceMapMark[] = []
        if (legs && legs.length > 0) {
          const markIds = (legs as Array<{ mark_id: string }>).map(l => l.mark_id)
          const { data: markData } = await supabase
            .from('marks')
            .select('id, name, lat, lon')
            .in('id', markIds)

          if (markData) {
            ;(legs as Array<{ sequence_index: number; rounding_side: 'port' | 'starboard'; mark_id: string }>).forEach((leg, i) => {
              const m = (markData as Array<{ id: string; name: string; lat: number; lon: number }>)
                .find(md => md.id === leg.mark_id)
              if (m) {
                marks.push({
                  lat: m.lat,
                  lon: m.lon,
                  name: m.name,
                  roundingSide: leg.rounding_side,
                  index: i,
                })
              }
            })

            if (marks.length > 0) {
              setMapCenter([marks[0].lat, marks[0].lon])
            }
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

    // Fetch this racer's entry — by user_id if logged in, else by the anonymous
    // device participant_id. Both are fully supported on this canonical screen.
    if (user || participantId) {
      let entryQuery = supabase
        .from('race_entries')
        .select('id, helm_name, finish_time, laps_completed')
        .eq('race_id', raceData.id)
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
    }

    // Cache the full race snapshot for offline use (marks, lines, classes).
    // We re-read the freshly-set state via the local vars gathered above.
    try {
      await cacheRaceData(raceData.id, token as string, {
        race: raceData,
        classes: classes ?? null,
        course: loadedCourse,
        entry: loadedEntry,
      })
    } catch {
      /* caching is best-effort; never block the page on it */
    }

    setLoading(false)
  }

  /**
   * Offline fallback: rebuild race/course/classes state from the IndexedDB
   * snapshot so virtual marks and the course still render with no signal.
   */
  async function loadFromCache(): Promise<boolean> {
    try {
      const cached = await getCachedRaceByToken<{
        race: RaceData
        classes: StartClass[] | null
        course: CourseData | null
        entry: EntryData | null
      }>(token as string)
      if (!cached) return false
      const d = cached.data
      setRace(d.race)
      if (d.classes) setStartClasses(d.classes)
      if (d.course) {
        setCourse(d.course)
        if (d.course.marks.length > 0) {
          setMapCenter([d.course.marks[0].lat, d.course.marks[0].lon])
        }
      }
      if (d.entry) setEntry(d.entry)
      setLoading(false)
      return true
    } catch {
      return false
    }
  }

  // ── Realtime subscription: watch start_classes for general_recall changes ───────────
  useEffect(() => {
    if (!race) return
    const supabase = getBrowserClient()

    const channel = supabase
      .channel(`start_classes:${race.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'start_classes',
          filter: `race_id=eq.${race.id}`,
        },
        (payload) => {
          const updated = payload.new as StartClass
          setStartClasses(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))

          if (updated.general_recall) {
            // General recall triggered by OOD (Phase 3) or detected here
            setGeneralRecall(true)
            setOcs(false)
            setOcsCount(0)
            setMultipleOcsWarning(false)
            setRaceStarted(false)
            // Reset audio so start signals fire again
            audioFiredRef.current = new Set()
            playBeeps(2, 400, 200)
            if (typeof navigator.vibrate === 'function') navigator.vibrate([400, 200, 400])
          } else if (!updated.general_recall && generalRecall) {
            // Recall cleared — new start set
            setGeneralRecall(false)
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race])

  // ── Realtime: watch THIS race row so the committee's synchronised start gun
  //    (races.start_scheduled_at, set from Race Control) appears live here ──────
  useEffect(() => {
    if (!race?.id) return
    const supabase = getBrowserClient()
    const channel = supabase
      .channel(`race:${race.id}:live`)
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

  // ── GPS tracking (real) OR simulator (training) ─────────────────────────────
  useEffect(() => {
    // TRAINING MODE: drive the full nav UI from the synthetic engine, no DB.
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
        (p) => {
          const gpsPos: GpsPosition = {
            lat: p.lat,
            lon: p.lon,
            heading: p.heading,
            speed_kts: p.speed_kts,
            accuracy_m: p.accuracy_m,
            recorded_at: p.recorded_at,
          }
          setGpsStatus('active')
          setCurrentPos(gpsPos)
          setMapCenter([gpsPos.lat, gpsPos.lon])
          appendTrail(gpsPos.lat, gpsPos.lon)
          handleGpsUpdate(gpsPos)
          progressFix(gpsPos.lat, gpsPos.lon, gpsPos.speed_kts)
          prevPosRef.current = gpsPos
        },
      )
      simRef.current = sim
      sim.start()
      return () => {
        sim.stop()
        simRef.current = null
      }
    }

    if (!navigator.geolocation) {
      setGpsStatus('error')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const gpsPos: GpsPosition = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          heading: pos.coords.heading ?? 0,
          speed_kts: (pos.coords.speed ?? 0) * 1.94384,
          accuracy_m: pos.coords.accuracy,
          recorded_at: new Date(pos.timestamp).toISOString(),
        }

        setGpsStatus('active')
        setCurrentPos(gpsPos)
        setMapCenter([gpsPos.lat, gpsPos.lon])
        appendTrail(gpsPos.lat, gpsPos.lon)

        // Offline-first: queue every fix to IndexedDB (survives signal loss).
        // Works for BOTH logged-in members (user_id) and anonymous click-and-go
        // racers (participant_id) — identical on-water experience either way.
        if (raceRef.current && (userRef.current || participantRef.current)) {
          void savePosition({
            raceId: raceRef.current.id,
            userId: userRef.current?.id ?? null,
            participantId: userRef.current ? null : participantRef.current,
            entryId: entryRef.current?.id ?? null,
            lat: gpsPos.lat,
            lon: gpsPos.lon,
            speedKts: gpsPos.speed_kts,
            headingDeg: gpsPos.heading,
            accuracyM: gpsPos.accuracy_m,
            recordedAt: gpsPos.recorded_at,
          }).then(() => getUnsyncedCount().then(setUnsyncedCount))
        }

        handleGpsUpdate(gpsPos)
        progressFix(gpsPos.lat, gpsPos.lon, gpsPos.speed_kts)
        prevPosRef.current = gpsPos
      },
      (err) => {
        console.error('GPS error:', err)
        setGpsStatus('error')
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSim, course])

  // ── GPS batch flush (offline-first via IndexedDB queue) ──────────────────────
  useEffect(() => {
    if (!race || (!user && !participantId) || isSim) return
    const interval = setInterval(() => {
      void flushPositions().then(() => getUnsyncedCount().then(setUnsyncedCount))
    }, 30000)
    const unregister = registerReconnectFlush(() => {
      void getUnsyncedCount().then(setUnsyncedCount)
    })
    return () => {
      clearInterval(interval)
      unregister()
    }
  }, [race, user, participantId, isSim])

  // ── Online/offline indicator ────────────────────────────────────────────────
  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine)
    const t = setTimeout(sync, 0) // defer initial set out of effect body
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      clearTimeout(t)
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  // Keep a ref of the finished flag (owned by the shared progress hook) so the
  // OCS callback below can early-out without re-subscribing.
  const finishedRef = useRef(false)
  useEffect(() => { finishedRef.current = finished }, [finished])

  // ── OCS handler (mark-rounding + finish now live in useRaceProgress) ──────
  // OCS (On Course Side) detection is page-specific to the Nav screen and stays
  // here; the shared hook handles rounding + finish identically for all screens.
  const handleGpsUpdate = useCallback((pos: GpsPosition) => {
    const c = courseRef.current
    if (!c || finishedRef.current) return

    // OCS recovery — boat re-crosses start line from pre-start side after being OCS
    if (ocsRef.current && prevPosRef.current && c.start_line_lat1 != null) {
      const crossed = linesIntersect(
        [prevPosRef.current.lat, prevPosRef.current.lon],
        [pos.lat, pos.lon],
        [c.start_line_lat1!, c.start_line_lng1!],
        [c.start_line_lat2!, c.start_line_lng2!],
      )
      if (crossed) {
        // Verify boat is now on the pre-start side
        const firstMark = c.marks[0]
        if (firstMark) {
          const stillOnCourse = isOnCourseSide(
            pos.lat, pos.lon,
            c.start_line_lat1!, c.start_line_lng1!,
            c.start_line_lat2!, c.start_line_lng2!,
            firstMark.lat, firstMark.lon,
          )
          if (!stillOnCourse) {
            // Cleared! Came back correctly
            setOcs(false)
            if (typeof navigator.vibrate === 'function') navigator.vibrate([100, 50, 100, 50, 100])
            if (entryRef.current && !isSimRef.current) {
              const supabase = getBrowserClient()
              supabase.from('race_entries').update({ status: 'racing' }).eq('id', entryRef.current.id)
            }
          }
        }
      }
    }
  }, [])

  // ── Start gun → raceStarted + OCS-at-start ──────────────────────────────────
  // Display + audio are owned by <StartCountdown> (shared, synchronised). Here we
  // only detect the moment the gun fires to flip into racing mode + run the OCS
  // check. In the simulator the gun fires on the sped-up clock so the whole
  // sequence + OCS behaviour is testable in seconds.
  useEffect(() => {
    if (startMs == null) return
    const speed = isSim ? SIM_SPEED_MULTIPLIER : 1
    const anchorReal = Date.now()
    const anchorSim = Date.now()

    const interval = setInterval(() => {
      const nowMs = speed === 1 ? Date.now() : anchorSim + (Date.now() - anchorReal) * speed
      const diff = startMs - nowMs
      if (diff > 0) return

      setRaceStarted(true)
      if (!audioFiredRef.current.has('go')) {
        audioFiredRef.current.add('go')
        // OCS check at start time
        const c = courseRef.current
        const pos = prevPosRef.current
        if (c && pos && c.start_line_lat1 != null && c.marks.length > 0) {
          const firstMark = c.marks[0]
          const onCourse = isOnCourseSide(
            pos.lat, pos.lon,
            c.start_line_lat1!, c.start_line_lng1!,
            c.start_line_lat2!, c.start_line_lng2!,
            firstMark.lat, firstMark.lon,
          )
          if (onCourse) {
            setOcs(true)
            if (typeof navigator.vibrate === 'function') navigator.vibrate([300, 100, 300, 100, 300])
            if (entryRef.current && !isSimRef.current) {
              const supabase = getBrowserClient()
              supabase.from('race_entries').update({ status: 'OCS' }).eq('id', entryRef.current.id)
            }
            if (!isSimRef.current) checkOcsCount(startClassesRef.current[0]?.id ?? '')
          }
        }
      }
      clearInterval(interval)
    }, 100)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, isSim])

  // ── OCS count check (query DB to see how many boats are OCS for this class) ─────
  async function checkOcsCount(classId: string) {
    if (!race) return
    const supabase = getBrowserClient()
    // Count entries with OCS status for this race
    const { count } = await supabase
      .from('race_entries')
      .select('*', { count: 'exact', head: true })
      .eq('race_id', race.id)
      .eq('status', 'OCS')

    const n = count ?? 0
    setOcsCount(n)

    if (n >= 3) {
      setMultipleOcsWarning(true)
      // Phase 1: surface warning. Phase 3: OOD will set general_recall on start_classes.
      // We don't auto-trigger the recall here — that’s OOD’s call.
    }
  }

  // ── Derived instrument values ──────────────────────────────────────────────
  const marks = course?.marks ?? []
  const totalLaps = course?.laps ?? 1
  const nextMark = nextMarkIndex < marks.length ? marks[nextMarkIndex] : null

  const distToMark = currentPos && nextMark
    ? haversineNm(currentPos.lat, currentPos.lon, nextMark.lat, nextMark.lon)
    : null

  const bearingToMark = currentPos && nextMark
    ? bearingDeg(currentPos.lat, currentPos.lon, nextMark.lat, nextMark.lon)
    : null

  // Bearing To Mark (BTM) = straight-line bearing to next mark. We deliberately
  // do NOT call this CTS (Course To Steer) — we have no tide/wind data to correct for.
  const btmDeg = bearingToMark

  // Time to mark at current SOG (rough ETA; straight-line, no tide/leeway).
  const secsToMark =
    distToMark != null && currentPos && currentPos.speed_kts > 0.3
      ? (distToMark / currentPos.speed_kts) * 3600
      : null
  const timeToMarkLabel =
    secsToMark == null
      ? '—'
      : secsToMark < 60
        ? `${Math.round(secsToMark)}s`
        : secsToMark < 3600
          ? `${Math.round(secsToMark / 60)} min`
          : `${(secsToMark / 3600).toFixed(1)} h`

  function getEffectiveFinishMidpoint(): [number, number] | null {
    if (!course) return null
    if (course.finish_at_start) {
      if (course.start_line_lat1 == null) return null
      return [
        (course.start_line_lat1! + course.start_line_lat2!) / 2,
        (course.start_line_lng1! + course.start_line_lng2!) / 2,
      ]
    }
    if (course.finish_line_lat1 == null) return null
    return [
      (course.finish_line_lat1! + course.finish_line_lat2!) / 2,
      (course.finish_line_lng1! + course.finish_line_lng2!) / 2,
    ]
  }

  const distToFinish = (() => {
    if (!currentPos) return null
    let total = 0

    if (nextMark) {
      total += haversineNm(currentPos.lat, currentPos.lon, nextMark.lat, nextMark.lon)
      for (let i = nextMarkIndex + 1; i < marks.length; i++) {
        total += haversineNm(marks[i - 1].lat, marks[i - 1].lon, marks[i].lat, marks[i].lon)
      }
      const effFinish = getEffectiveFinishMidpoint()
      if (effFinish && marks.length > 0) {
        const lastMark = marks[marks.length - 1]
        total += haversineNm(lastMark.lat, lastMark.lon, effFinish[0], effFinish[1])
      }
    } else if (nextMarkIndex >= marks.length) {
      const effFinish = getEffectiveFinishMidpoint()
      if (effFinish) {
        total += haversineNm(currentPos.lat, currentPos.lon, effFinish[0], effFinish[1])
      }
    }

    return total
  })()

  // ── Map props ──────────────────────────────────────────────────────────────
  const startLineProps: RaceMapProps['startLine'] = course?.start_line_lat1 != null ? {
    lat1: course.start_line_lat1!,
    lng1: course.start_line_lng1!,
    lat2: course.start_line_lat2!,
    lng2: course.start_line_lng2!,
  } : null

  const finishLineProps: RaceMapProps['finishLine'] = course?.finish_line_lat1 != null ? {
    lat1: course.finish_line_lat1!,
    lng1: course.finish_line_lng1!,
    lat2: course.finish_line_lat2!,
    lng2: course.finish_line_lng2!,
  } : null

  // ── Status colours ─────────────────────────────────────────────────────────
  const gpsColor = { waiting: 'bg-amber-400', active: 'bg-green-400', error: 'bg-red-500' }[gpsStatus]
  const gpsLabel = { waiting: 'Waiting for GPS…', active: 'GPS Active', error: 'GPS Error' }[gpsStatus]
  // Show the synchronised countdown until the gun fires (StartCountdown owns it).
  const showCountdown = !raceStarted && startMs != null && !finished
  const isRacing = raceStarted

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-5xl">⛵</div>
          <p className="text-gray-400 text-sm">Loading race…</p>
        </div>
      </div>
    )
  }

  if (error || !race) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error || 'Race not found'}</p>
          <Link href="/dashboard/races" className="text-blue-400 underline text-sm">Back to races</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-900">

      {/* Training-mode banner */}
      {isSim && (
        <div className="bg-indigo-500 text-white px-3 py-2 text-center text-xs font-semibold shrink-0 z-20">
          🎓 Training Mode — simulated GPS, nothing is recorded
        </div>
      )}

      {/* Offline banner */}
      {!isSim && !isOnline && (
        <div className="bg-amber-500 text-slate-900 px-3 py-2 text-center text-xs font-semibold shrink-0 z-20">
          📡 Offline — {unsyncedCount} position{unsyncedCount === 1 ? '' : 's'} queued, will sync when reconnected
        </div>
      )}

      {/* Boat identity nudge — compact so it doesn't cover instruments */}
      {!isSim && race && (
        <div className="px-2 pt-2 shrink-0 z-20">
          <BoatIdentityNudge raceId={race.id} userId={user?.id ?? null} participantId={participantId} compact />
        </div>
      )}

      {/* Battery warning banner */}
      {!batteryDismissed && (
        <div className="bg-amber-900/80 border-b border-amber-700 px-3 py-2 flex items-center justify-between gap-2 shrink-0 z-20">
          <p className="text-xs text-amber-200 flex-1">
            ⚡ GPS tracking uses significant battery. We recommend plugging in a charger or battery pack.
          </p>
          <button
            onClick={() => setBatteryDismissed(true)}
            className="text-amber-400 hover:text-amber-200 text-xl leading-none shrink-0 px-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Status bar */}
      <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2 shrink-0 z-10">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-2.5 h-2.5 rounded-full ${gpsColor}`} title={gpsLabel} />
          <span className="text-xs text-gray-400 hidden sm:inline">{gpsLabel}</span>
        </div>
        <span className="text-sm font-semibold text-white truncate flex-1 text-center">{race.name}</span>
        {isRacing && !finished && (
          <span className="text-xs text-gray-300 shrink-0 font-mono">
            Lap {currentLap}/{totalLaps}
          </span>
        )}
        <Link href="/dashboard/races" className="text-xs text-gray-500 hover:text-gray-300 shrink-0 ml-1">
          ✕
        </Link>
      </div>

      {/* BTM instruction header (Savvy-Navvy style). BTM = Bearing To Mark (straight-line);
          NOT CTS — we have no tide/wind data to correct for. */}
      {isRacing && !finished && (
        <div className="bg-rose-500 text-white shrink-0 px-4 py-2.5 flex items-center gap-3 shadow-md z-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg shrink-0">
            ⤴️
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 flex-1 min-w-0">
            <div className="leading-tight">
              <span className="text-[11px] uppercase tracking-wide opacity-80">BTM </span>
              <span className="text-lg font-bold tabular-nums">
                {btmDeg != null ? `${Math.round(btmDeg)}°` : '—'}
              </span>
              {btmDeg != null && (
                <span className="text-[11px] opacity-80 ml-1">{compassPoint(btmDeg)}</span>
              )}
            </div>
            <div className="leading-tight text-right">
              <span className="text-[11px] uppercase tracking-wide opacity-80">Speed </span>
              <span className="text-lg font-bold tabular-nums">
                {currentPos ? currentPos.speed_kts.toFixed(1) : '—'}
              </span>
              <span className="text-[11px] opacity-80 ml-0.5">kts</span>
            </div>
            <div className="leading-tight">
              <span className="text-[11px] uppercase tracking-wide opacity-80">For </span>
              <span className="text-base font-semibold tabular-nums">{timeToMarkLabel}</span>
            </div>
            <div className="leading-tight text-right">
              <span className="text-[11px] uppercase tracking-wide opacity-80">To mark </span>
              <span className="text-base font-semibold tabular-nums">
                {distToMark != null ? formatNm(distToMark) : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Secondary strip: next-mark hint (“Then head for …”) */}
      {isRacing && !finished && nextMark && (
        <div className="bg-rose-600 text-white shrink-0 px-4 py-1.5 text-sm font-medium z-10">
          {nextMarkIndex >= marks.length
            ? '→ Head for the finish line'
            : <>→ Head for <span className="font-bold">{nextMark.name || `Mark ${nextMarkIndex + 1}`}</span>
                <span className={`ml-2 text-xs ${nextMark.roundingSide === 'port' ? 'text-red-200' : 'text-green-200'}`}>
                  {nextMark.roundingSide === 'port' ? '● leave to port' : '● leave to starboard'}
                </span></>}
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative overflow-hidden">
        <RaceMap
          center={mapCenter}
          courseMarks={marks}
          startLine={startLineProps}
          finishLine={finishLineProps}
          finishAtStart={course?.finish_at_start ?? false}
          currentPosition={currentPos ? { lat: currentPos.lat, lon: currentPos.lon, heading: currentPos.heading } : null}
          nextMarkIndex={nextMarkIndex}
          courseUp={courseUp && !wholeCourse}
          laps={totalLaps}
          currentLap={currentLap}
          trail={trail}
          showHeadingLine={showHeadingLine}
          fleet={wholeCourse ? fleet.map(b => ({ entryId: b.entryId, lat: b.lat, lon: b.lon, headingDeg: b.headingDeg, boatName: b.boatName })) : []}
          fitAll={wholeCourse}
        />

        {/* Map toggles */}
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 items-end">
          <button
            onClick={() => setWholeCourse(v => !v)}
            className={`border rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-lg ${wholeCourse ? 'bg-blue-500 border-blue-400 text-white' : 'bg-gray-900/90 border-gray-700 text-white'}`}
          >
            {wholeCourse ? '🏁 Whole Course' : '📍 My View'}
          </button>
          {!wholeCourse && (
            <button
              onClick={() => setCourseUp(v => !v)}
              className="bg-gray-900/90 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-medium shadow-lg"
            >
              {courseUp ? '🧭 Course Up' : '⬆️ North Up'}
            </button>
          )}
          <button
            onClick={() => setShowHeadingLine(v => !v)}
            className={`border rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-lg ${showHeadingLine ? 'bg-amber-500 border-amber-400 text-slate-900' : 'bg-gray-900/90 border-gray-700 text-white'}`}
          >
            {showHeadingLine ? '— Heading On' : '— Heading Off'}
          </button>
        </div>

        {/* Next-mark detail now lives in the coral BTM header/strip above the map. */}

        {/* Mark-reached flash — shared banner (identical on Nav / Tracker / Sim) */}
        {!finished && <MarkReachedBanner markReached={markReached} variant="floating" />}

        {/* General Recall overlay — shown when OOD triggers recall (Phase 3 sets via Realtime) */}
        {generalRecall && !finished && (
          <div className="absolute inset-0 z-[1600] flex items-center justify-center bg-orange-950/85">
            <div className="text-center space-y-4 px-8 py-8 bg-orange-950 rounded-2xl border-2 border-orange-400 shadow-2xl max-w-xs mx-4">
              <div className="text-5xl">↩️</div>
              <h2 className="text-2xl font-bold text-white">GENERAL RECALL</h2>
              <p className="text-orange-200 font-semibold">Return to pre-start area</p>
              <p className="text-sm text-orange-300">Wait for the race committee’s new start signal</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                <span className="text-xs text-orange-400">Awaiting new start time…</span>
              </div>
            </div>
          </div>
        )}

        {/* OCS overlay (individual) — only shown when NOT in general recall */}
        {ocs && !generalRecall && !finished && (
          <div className="absolute inset-0 z-[1500] flex items-center justify-center bg-red-950/80">
            <div className="text-center space-y-4 px-8 py-8 bg-red-950 rounded-2xl border-2 border-red-500 shadow-2xl max-w-xs mx-4">
              <div className="text-5xl">⚠️</div>
              <h2 className="text-2xl font-bold text-white">OCS</h2>
              <p className="text-red-300 font-semibold">On Course Side</p>
              <p className="text-sm text-red-200">Return behind the start line to restart</p>
              {multipleOcsWarning && (
                <p className="text-xs text-amber-300 bg-amber-900/50 rounded-lg px-3 py-1.5 mt-1">
                  ⚠️ {ocsCount} boats OCS — awaiting race committee decision
                </p>
              )}
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs text-red-400">Monitoring your position…</span>
              </div>
            </div>
          </div>
        )}

        {/* Finished overlay — shared banner (identical on Nav / Tracker / Sim) */}
        {finished && (
          <FinishBanner
            finishTime={finishTime}
            elapsedSeconds={elapsedSeconds}
            token={token}
            variant="overlay"
          />
        )}
      </div>

      {/* Bottom panel: synchronised countdown (shared) or instruments */}
      {showCountdown ? (
        <div className="border-t border-gray-800 shrink-0">
          <StartCountdown
            startMs={startMs}
            warningMins={warningMins}
            speedMultiplier={isSim ? SIM_SPEED_MULTIPLIER : 1}
          />
          {startClasses.length > 0 && (
            <p className="text-xs text-gray-500 py-1.5 text-center bg-gray-950">
              {startClasses[0].name} — {new Date(startTimeIso ?? startClasses[0].start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      ) : (
        <div className="h-44 bg-gray-950 border-t border-gray-800 shrink-0 px-4 py-3">
          {/* Row 1: Speed / Heading / Dist to mark */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-white tabular-nums">
                {currentPos ? currentPos.speed_kts.toFixed(1) : '—'}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mt-0.5">kts</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-white tabular-nums">
                {currentPos ? Math.round(currentPos.heading) : '—'}°
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mt-0.5">HDG</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-green-400 tabular-nums">
                {distToMark != null ? formatNm(distToMark) : '—'}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mt-0.5">To Mark</div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-800 mb-2" />

          {/* Row 2: dist to finish / lap / bearing */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-gray-500">To finish: </span>
              <span className="text-sm font-semibold text-white font-mono">
                {distToFinish != null ? formatNm(distToFinish) : '—'}
              </span>
              <span className="text-xs text-gray-500 ml-3">Lap </span>
              <span className="text-sm font-semibold text-white font-mono">{currentLap}/{totalLaps}</span>
            </div>
            <div className="text-right">
              {bearingToMark != null && nextMark ? (
                <span className="text-xs text-gray-400">
                  {Math.round(bearingToMark)}° ({compassPoint(bearingToMark)}) → {nextMark.name}
                </span>
              ) : nextMarkIndex >= marks.length ? (
                <span className="text-xs text-green-400">→ Finish line</span>
              ) : (
                <span className="text-xs text-gray-600">No bearing</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
