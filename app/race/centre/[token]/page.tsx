'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge, RoundingBadge } from '@/components/ui/Badge'
import { WaypointFooter } from '@/components/WaypointFooter'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** Format a timestamptz to HH:MM */
function formatTime(ts: string): string {
  const d = new Date(ts)
  return d.toISOString().slice(11, 16)
}

/** Add minutes to a HH:MM string */
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = ((h * 60 + m + mins) % (24 * 60) + 24 * 60) % (24 * 60)
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Strip a leading "Start time: HH:MM" line from notes (matches extractStartTime pattern) */
function stripStartTimeLine(notes: string | null): string {
  if (!notes) return ''
  return notes.replace(/^Start time: \d{2}:\d{2}\n?/, '').trim()
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'race'
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  planned: 'info',
  confirmed: 'success',
  live: 'danger',
  cancelled: 'danger',
  completed: 'warning',
  archived: 'default',
}

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  planned: 'Planned',
  confirmed: 'Confirmed',
  live: 'Racing Live 🔴',
  cancelled: 'Cancelled',
  completed: 'Completed',
  archived: 'Archived',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RaceData {
  id: string
  name: string
  race_number: number | null
  series: string | null
  race_date: string
  notes: string | null
  safety_info: string | null
  vhf_channel: string | null
  status: string
  entry_token: string
  club_id: string | null
  course_template_id: string | null
  start_time: string | null
  ood_id: string | null
  ood_open_for_volunteer: boolean | null
  ood_accepted: boolean | null
  ood_assigned_by: string | null
}

interface StartClass {
  id: string
  name: string
  class_flag: string | null
  prep_flag: string
  start_time: string
  sequence_warning_mins: number
}

interface CourseMark {
  name: string
  lat: number
  lon: number
  roundingSide: 'port' | 'starboard'
}

interface CourseData {
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

// ── Main component ────────────────────────────────────────────────────────────

export default function RaceCentrePage() {
  const router = useRouter()
  const params = useParams()
  const token = params?.token as string
  const { user, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [race, setRace] = useState<RaceData | null>(null)
  const [startClasses, setStartClasses] = useState<StartClass[]>([])
  const [course, setCourse] = useState<CourseData | null>(null)
  const [showText, setShowText] = useState(false)
  const [copied, setCopied] = useState(false)
  // Member's own details, to build a pre-filled no-login tracking link.
  const [myBoat, setMyBoat] = useState<{ boat_name: string; sail_number: string | null } | null>(null)
  const [myName, setMyName] = useState<string>('')
  // Fleet (entries) + organiser remove.
  const [entries, setEntries] = useState<Array<{ id: string; boat_name: string | null; helm_name: string | null; status: string }>>([])
  const [crewAvailable, setCrewAvailable] = useState<Array<{ id: string; helm_name: string | null; phone: string | null }>>([])
  const [myEntry, setMyEntry] = useState<{ id: string; boat_name: string | null; status: string } | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  // Roles + OOD
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOfficer, setIsOfficer] = useState(false)
  const [oodName, setOodName] = useState<string | null>(null)
  const [oodBusy, setOodBusy] = useState(false)
  const [clubMembers, setClubMembers] = useState<Array<{ id: string; full_name: string | null }>>([])
  const [pickTarget, setPickTarget] = useState('')

  // Auth gate: redirect to login if not signed in
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/race/centre/${token}`)}`)
    }
  }, [authLoading, user, router, token])

  // Load race data
  useEffect(() => {
    if (!token || authLoading || !user) return

    async function load() {
      const supabase = getBrowserClient()

      const { data: raceData, error: raceErr } = await supabase
        .from('races')
        .select('id, name, race_number, series, race_date, notes, safety_info, vhf_channel, status, entry_token, club_id, course_template_id, start_time, ood_id, ood_open_for_volunteer, ood_accepted, ood_assigned_by')
        .eq('entry_token', token)
        .single()

      if (raceErr || !raceData) {
        setError('Race not found. Check your link.')
        setLoading(false)
        return
      }

      setRace(raceData as RaceData)

      // Start classes
      const { data: classes } = await supabase
        .from('start_classes')
        .select('id, name, class_flag, prep_flag, start_time, sequence_warning_mins')
        .eq('race_id', raceData.id)
        .order('start_time', { ascending: true })

      if (classes) setStartClasses(classes as StartClass[])

      // Course template + legs + marks
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

          const marks: CourseMark[] = []
          if (legs && legs.length > 0) {
            const markIds = (legs as Array<{ mark_id: string }>).map(l => l.mark_id)
            const { data: markData } = await supabase
              .from('marks')
              .select('id, name, lat, lon')
              .in('id', markIds)

            if (markData) {
              ;(legs as Array<{ sequence_index: number; rounding_side: 'port' | 'starboard'; mark_id: string }>).forEach(leg => {
                const m = (markData as Array<{ id: string; name: string; lat: number; lon: number }>)
                  .find(md => md.id === leg.mark_id)
                if (m) {
                  marks.push({ name: m.name, lat: m.lat, lon: m.lon, roundingSide: leg.rounding_side })
                }
              })
            }
          }

          setCourse({
            name: tpl.name as string,
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
          })
        }
      }

      // Member's own boat + name -> pre-filled tracking link (smarts in the link).
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .maybeSingle()
        if (prof?.full_name) setMyName(prof.full_name)
        if ((prof as { role?: string } | null)?.role === 'admin') setIsAdmin(true)
        const rl = (prof as { role?: string } | null)?.role
        if (rl === 'admin' || rl === 'race_officer') setIsOfficer(true)
        const { data: boat } = await supabase
          .from('boats')
          .select('boat_name, sail_number')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (boat) setMyBoat(boat as { boat_name: string; sail_number: string | null })
      }

      // Fleet: everyone entered in this race.
      const { data: ents } = await supabase
        .from('race_entries')
        .select('id, boat_name, helm_name, phone, status, role, boat_id')
        .eq('race_id', raceData.id)
        .neq('status', 'withdrawn')
        .order('created_at', { ascending: true })
      if (ents) {
        const rows = ents as Array<{ id: string; boat_name: string | null; helm_name: string | null; phone: string | null; status: string; role: string | null; boat_id: string | null }>
        // Crew available = entered as crew with no boat.
        const crew = rows.filter((r) => r.role === 'crew' && !r.boat_id)
        const boats = rows.filter((r) => !(r.role === 'crew' && !r.boat_id))
        setEntries(boats.map((r) => ({ id: r.id, boat_name: r.boat_name, helm_name: r.helm_name, status: r.status })))
        setCrewAvailable(crew.map((r) => ({ id: r.id, helm_name: (r.helm_name ?? '').replace(/\s*\(available as crew\)\s*/i, '').trim() || 'A sailor', phone: r.phone })))
      }

      // Am I entered? (drives the advance-entry card)
      if (user) {
        const { data: mine } = await supabase
          .from('race_entries')
          .select('id, boat_name, status')
          .eq('race_id', raceData.id)
          .eq('user_id', user.id)
          .neq('status', 'withdrawn')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        setMyEntry((mine as { id: string; boat_name: string | null; status: string } | null) ?? null)
      }

      // OOD name (if assigned).
      if ((raceData as RaceData).ood_id) {
        const { data: oodProf } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', (raceData as RaceData).ood_id)
          .maybeSingle()
        setOodName(oodProf?.full_name ?? 'Assigned')
      }

      // Club members (for nominate / pre-assign pickers).
      const memberClubId = (raceData as RaceData).club_id
      if (memberClubId) {
        const { data: mem } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('club_id', memberClubId)
          .order('full_name', { ascending: true })
        if (mem) setClubMembers(mem as Array<{ id: string; full_name: string | null }>)
      }

      setLoading(false)
    }

    load()
  }, [token, authLoading, user])

  async function removeEntry(id: string) {
    if (!confirm('Remove this boat from the race?')) return
    setRemovingId(id)
    const supabase = getBrowserClient()
    const { error: delErr } = await supabase.from('race_entries').delete().eq('id', id)
    if (!delErr) setEntries((prev) => prev.filter((e) => e.id !== id))
    setRemovingId(null)
  }

  // ── OOD (per-race) ────────────────────────────────────────────────────────
  // Reload just the OOD fields + name after a lifecycle action.
  async function refreshOod() {
    if (!race) return
    const supabase = getBrowserClient()
    const { data } = await supabase
      .from('races')
      .select('ood_id, ood_accepted, ood_assigned_by')
      .eq('id', race.id)
      .maybeSingle()
    if (!data) return
    setRace((r) => (r ? { ...r, ood_id: data.ood_id, ood_accepted: data.ood_accepted, ood_assigned_by: data.ood_assigned_by } : r))
    if (data.ood_id) {
      if (data.ood_id === user?.id) setOodName(myName || 'You')
      else {
        const { data: p } = await supabase.from('profiles').select('full_name').eq('id', data.ood_id).maybeSingle()
        setOodName(p?.full_name ?? 'Assigned')
      }
    } else setOodName(null)
  }

  async function takeOod(override = false) {
    if (!race) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_take', { p_race: race.id, p_override: override })
    setOodBusy(false)
    if (e) { alert('Could not take OOD: ' + e.message); return }
    if (data === 'needs-confirm') {
      const who = oodName ?? 'Someone'
      if (confirm(`${who} was assigned as OOD but hasn’t accepted yet. Are you sure you want to take it?`)) {
        await takeOod(true)
      }
      return
    }
    if (data === 'blocked-accepted') {
      alert(`${oodName ?? 'Someone'} is already the accepted Officer of the Day. Only they can nominate a replacement.`)
      return
    }
    await refreshOod()
  }

  async function acceptOod() {
    if (!race) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    await supabase.rpc('ood_accept', { p_race: race.id })
    setOodBusy(false)
    await refreshOod()
  }

  async function standDownOod() {
    if (!race) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    await supabase.rpc('ood_stand_down', { p_race: race.id })
    setOodBusy(false)
    await refreshOod()
  }

  async function nominateOod(target: string) {
    if (!race || !target) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_nominate', { p_race: race.id, p_target: target })
    setOodBusy(false)
    if (e) { alert('Could not nominate: ' + e.message); return }
    if (data !== 'nominated') { alert('Could not nominate (' + data + ').'); return }
    setPickTarget('')
    await refreshOod()
  }

  async function assignOod(target: string) {
    if (!race || !target) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_assign', { p_race: race.id, p_target: target })
    setOodBusy(false)
    if (e) { alert('Could not assign: ' + e.message); return }
    if (data !== 'assigned') { alert('Could not assign (' + data + ').'); return }
    setPickTarget('')
    await refreshOod()
  }

  const iAmOod = !!race && race.ood_id === user?.id

  // ── Derived ─────────────────────────────────────────────────────────────────

  const firstClass = startClasses[0] ?? null
  const warningTime = firstClass
    ? addMinutes(formatTime(firstClass.start_time), -firstClass.sequence_warning_mins)
    : null
  const cleanNotes = stripStartTimeLine(race?.notes ?? null)
  const raceIsOn = race?.status === 'live' || race?.status === 'confirmed'

  // Pre-filled no-login tracking link carrying the member's details in the URL.
  const goLink = (() => {
    if (!race) return `/race/go/${token}`
    const qs = new URLSearchParams()
    if (myBoat?.boat_name) qs.set('boat', myBoat.boat_name)
    if (myBoat?.sail_number) qs.set('sail', myBoat.sail_number)
    if (myName) qs.set('helm', myName)
    const q = qs.toString()
    return `/race/go/${race.entry_token}${q ? `?${q}` : ''}`
  })()

  // ── Text instructions ──────────────────────────────────────────────────────

  function buildTextInstructions(): string {
    if (!race) return ''
    const lines: string[] = []
    lines.push(`SAILING INSTRUCTIONS — ${race.name}`)
    if (race.series) lines.push(`Series: ${race.series}${race.race_number ? ` (Race ${race.race_number})` : ''}`)
    lines.push(`Date: ${formatDate(race.race_date)}`)
    lines.push('')
    if (startClasses.length > 0) {
      lines.push('START SEQUENCE')
      if (warningTime) lines.push(`First warning signal: ${warningTime}`)
      startClasses.forEach(cls => {
        const st = formatTime(cls.start_time)
        const flags = [cls.class_flag ? `Class flag: ${cls.class_flag}` : null, `Prep flag: ${cls.prep_flag}`]
          .filter(Boolean).join(', ')
        lines.push(`  ${cls.name} — Start ${st} (warning ${addMinutes(st, -cls.sequence_warning_mins)}; ${flags})`)
      })
      lines.push('')
    }
    if (course) {
      lines.push(`COURSE: ${course.name} — ${course.laps} lap${course.laps === 1 ? '' : 's'}`)
      course.marks.forEach((m, i) => {
        lines.push(`  ${i + 1}. ${m.name} — leave to ${m.roundingSide.toUpperCase()}`)
      })
      if (course.finish_at_start) lines.push('  Finish: at the start line')
      lines.push('')
    }
    if (race.vhf_channel) {
      lines.push(`VHF CHANNEL: ${race.vhf_channel}`)
      lines.push('')
    }
    if (race.safety_info) {
      lines.push('SAFETY INFORMATION')
      lines.push(race.safety_info)
      lines.push('')
    }
    if (cleanNotes) {
      lines.push('NOTES')
      lines.push(cleanNotes)
      lines.push('')
    }
    return lines.join('\n')
  }

  function handleCopyText() {
    navigator.clipboard.writeText(buildTextInstructions()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleDownloadText() {
    if (!race) return
    downloadBlob(buildTextInstructions(), `${slugify(race.name)}-instructions.txt`, 'text/plain;charset=utf-8')
  }

  // ── GPX download ───────────────────────────────────────────────────────────

  function handleDownloadGpx() {
    if (!race || !course || course.marks.length === 0) return

    const wpts: string[] = []
    const rtepts: string[] = []

    const addPoint = (lat: number, lon: number, name: string, asWpt: boolean) => {
      const pt = `lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"`
      if (asWpt) wpts.push(`  <wpt ${pt}>\n    <name>${escapeXml(name)}</name>\n  </wpt>`)
      rtepts.push(`    <rtept ${pt}>\n      <name>${escapeXml(name)}</name>\n    </rtept>`)
    }

    // Start line midpoint first (if defined)
    const hasStart =
      course.start_line_lat1 != null && course.start_line_lng1 != null &&
      course.start_line_lat2 != null && course.start_line_lng2 != null
    if (hasStart) {
      addPoint(
        (course.start_line_lat1! + course.start_line_lat2!) / 2,
        (course.start_line_lng1! + course.start_line_lng2!) / 2,
        'Start Line',
        true,
      )
    }

    course.marks.forEach((m, i) => {
      addPoint(m.lat, m.lon, `${i + 1}. ${m.name} (${m.roundingSide === 'port' ? 'P' : 'S'})`, true)
    })

    // Finish line midpoint last (dedicated line, or back at the start)
    const hasFinish =
      course.finish_line_lat1 != null && course.finish_line_lng1 != null &&
      course.finish_line_lat2 != null && course.finish_line_lng2 != null
    if (hasFinish) {
      addPoint(
        (course.finish_line_lat1! + course.finish_line_lat2!) / 2,
        (course.finish_line_lng1! + course.finish_line_lng2!) / 2,
        'Finish Line',
        true,
      )
    } else if (course.finish_at_start && hasStart) {
      addPoint(
        (course.start_line_lat1! + course.start_line_lat2!) / 2,
        (course.start_line_lng1! + course.start_line_lng2!) / 2,
        'Finish (Start Line)',
        false,
      )
    }

    const gpx = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Waypoint Racing" xmlns="http://www.topografix.com/GPX/1/1">',
      `  <metadata>\n    <name>${escapeXml(race.name)}</name>\n  </metadata>`,
      ...wpts,
      '  <rte>',
      `    <name>${escapeXml(`${race.name} — ${course.name}`)}</name>`,
      ...rtepts,
      '  </rte>',
      '</gpx>',
      '',
    ].join('\n')

    downloadBlob(gpx, `${slugify(race.name)}.gpx`, 'application/gpx+xml')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading race centre…</p>
      </div>
    )
  }

  if (error || !race) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card padding="lg" className="max-w-md w-full text-center">
          <p className="text-red-600 font-medium">{error || 'Race not found.'}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{race.name}</h1>
            <Badge variant={statusVariant[race.status] ?? 'default'}>
              {statusLabel[race.status] ?? race.status}
            </Badge>
          </div>
          <p className="text-gray-600 mt-1">
            {formatDate(race.race_date)}
            {race.series && <> · {race.series}{race.race_number ? ` — Race ${race.race_number}` : ''}</>}
          </p>
        </div>

        {/* Advance entry — declare you're racing before the day */}
        {race.status !== 'completed' && (
          <Card padding="lg">
            {myEntry ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">✅ You’re entered</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {myEntry.boat_name ? `Boat: ${myEntry.boat_name}` : 'Entry confirmed'} · you can change or withdraw any time before the start.
                  </p>
                </div>
                <Link
                  href={`/race/join/${race.entry_token}`}
                  className="shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 text-sm"
                >
                  Manage entry
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Racing this one?</p>
                  <p className="text-xs text-gray-500 mt-0.5">Enter now so the club knows you’re coming — you can withdraw later.</p>
                </div>
                <Link
                  href={`/race/join/${race.entry_token}`}
                  className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 text-sm"
                >
                  Enter this race →
                </Link>
              </div>
            )}
          </Card>
        )}

        {/* Race Nav + Tracker */}
        <Card padding="lg">
          {raceIsOn ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <Link
                href={`/race/live/${race.entry_token}`}
                className="inline-flex flex-col items-center justify-center gap-1 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold px-6 py-4 text-base transition-colors"
              >
                <span>📱 Full Race Nav</span>
                <span className="text-xs font-normal opacity-80">Map, marks, countdown &amp; instruments</span>
              </Link>
              <Link
                href={goLink}
                className="inline-flex flex-col items-center justify-center gap-1 rounded-lg bg-slate-700 hover:bg-slate-800 active:bg-slate-900 text-white font-semibold px-6 py-4 text-base transition-colors"
              >
                <span>📡 Tracker Only</span>
                <span className="text-xs font-normal opacity-80">Beacon mode — details pre-filled</span>
              </Link>
            </div>
          ) : (
            <div className="text-center">
              <div className="grid sm:grid-cols-2 gap-3">
                <Button size="lg" disabled className="w-full">📱 Full Race Nav</Button>
                <Button size="lg" disabled className="w-full">📡 Tracker Only</Button>
              </div>
              <p className="text-sm text-gray-500 mt-2">Race Nav &amp; Tracker open when racing starts.</p>
            </div>
          )}
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            <Link
              href={`/race/viewer/${race.entry_token}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2.5 text-sm transition-colors"
            >
              👁️ Live Viewer
            </Link>
            <Link
              href={`/race/results/${race.entry_token}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2.5 text-sm transition-colors"
            >
              🏆 Results
            </Link>
          </div>

          <p className="text-xs text-gray-400 mt-3 text-center">
            💡 Tip: add this to your home screen (Share &rarr; Add to Home Screen) to use it offline at sea.
          </p>

          {/* Training mode */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2 text-center">🎓 Never used it before? Practise first — nothing is recorded.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <Link
                href={`/race/live/${race.entry_token}?sim=1`}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium px-4 py-2 text-sm transition-colors"
              >
                Try Race Nav
              </Link>
              <Link
                href={`/race/tracker/${race.entry_token}?sim=1`}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium px-4 py-2 text-sm transition-colors"
              >
                Try Tracker
              </Link>
            </div>
          </div>
        </Card>

        {/* OOD / Race Official */}
        <Card>
          <CardHeader>
            <CardTitle>Officer of the Day</CardTitle>
          </CardHeader>
          {race?.ood_id ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-900">
                    🏳️ {oodName}{iAmOod && ' (you)'}
                  </p>
                  <p className="text-xs mt-0.5">
                    {race.ood_accepted
                      ? <span className="text-emerald-600 font-medium">✅ Accepted</span>
                      : <span className="text-amber-600 font-medium">⏳ Assigned — not yet accepted</span>}
                  </p>
                </div>
                {(isOfficer || iAmOod) && (
                  <button
                    onClick={standDownOod}
                    disabled={oodBusy}
                    className="shrink-0 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 font-medium disabled:opacity-50"
                  >
                    Stand down
                  </button>
                )}
              </div>

              {/* I'm the provisional assignee — accept it */}
              {iAmOod && !race.ood_accepted && (
                <button
                  onClick={acceptOod}
                  disabled={oodBusy}
                  className="w-full text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 font-semibold disabled:opacity-50"
                >
                  ✅ Accept OOD role
                </button>
              )}

              {/* Provisional (assigned, not accepted) and not me — anyone can take over (with confirm) */}
              {!race.ood_accepted && !iAmOod && (
                <button
                  onClick={() => takeOod(false)}
                  disabled={oodBusy}
                  className="w-full text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 font-medium disabled:opacity-50"
                >
                  Take OOD instead
                </button>
              )}

              {/* Current OOD can nominate a successor */}
              {iAmOod && clubMembers.length > 1 && (
                <div className="flex gap-2 pt-1">
                  <select
                    value={pickTarget}
                    onChange={(e) => setPickTarget(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="">Nominate a successor…</option>
                    {clubMembers.filter((mm) => mm.id !== user?.id).map((mm) => (
                      <option key={mm.id} value={mm.id}>{mm.full_name ?? 'Unnamed'}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => nominateOod(pickTarget)}
                    disabled={oodBusy || !pickTarget}
                    className="shrink-0 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 font-medium disabled:opacity-50"
                  >
                    Nominate
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">No Officer of the Day yet — anyone can take it.</p>
              <button
                onClick={() => takeOod(false)}
                disabled={oodBusy}
                className="text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 font-medium disabled:opacity-50"
              >
                🙋 Take OOD
              </button>

              {/* Officer can pre-assign someone (they must accept) */}
              {isOfficer && clubMembers.length > 0 && (
                <div className="flex gap-2 pt-1 border-t border-gray-100">
                  <select
                    value={pickTarget}
                    onChange={(e) => setPickTarget(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="">Pre-assign an OOD…</option>
                    {clubMembers.map((mm) => (
                      <option key={mm.id} value={mm.id}>{mm.full_name ?? 'Unnamed'}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => assignOod(pickTarget)}
                    disabled={oodBusy || !pickTarget}
                    className="shrink-0 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 font-medium disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Crew available — people who volunteered to crew (no boat) */}
        {crewAvailable.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>🙋 Crew available ({crewAvailable.length})</CardTitle>
            </CardHeader>
            <p className="text-sm text-gray-500 mb-3">These sailors are looking for a boat — helms, grab a hand.</p>
            <ul className="divide-y divide-gray-100">
              {crewAvailable.map((cr) => (
                <li key={cr.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm font-medium text-gray-900">{cr.helm_name}</span>
                  {cr.phone ? (
                    <a href={`tel:${cr.phone}`} className="shrink-0 text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 font-medium">
                      📞 {cr.phone}
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-400">No contact given</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Fleet + organiser remove */}
        <Card>
          <CardHeader>
            <CardTitle>Fleet ({entries.length})</CardTitle>
          </CardHeader>
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500">No boats entered yet. Share the tracking link to get people on the water.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{e.boat_name || 'Unnamed boat'}</p>
                    {e.helm_name && <p className="text-xs text-gray-500 truncate">{e.helm_name}</p>}
                  </div>
                  <button
                    onClick={() => removeEntry(e.id)}
                    disabled={removingId === e.id}
                    className="shrink-0 text-xs rounded-lg bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 font-medium disabled:opacity-50"
                  >
                    {removingId === e.id ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Start sequence */}
        <Card>
          <CardHeader>
            <CardTitle>Start Sequence</CardTitle>
          </CardHeader>
          {startClasses.length === 0 ? (
            <p className="text-sm text-gray-500">No start classes have been set yet.</p>
          ) : (
            <div className="space-y-3">
              {warningTime && (
                <p className="text-sm text-gray-700">
                  First warning signal: <span className="font-semibold">{warningTime}</span>
                </p>
              )}
              <div className="divide-y divide-gray-100">
                {startClasses.map(cls => {
                  const st = formatTime(cls.start_time)
                  return (
                    <div key={cls.id} className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{cls.name}</p>
                        <p className="text-xs text-gray-500">
                          Warning {addMinutes(st, -cls.sequence_warning_mins)}
                          {cls.class_flag ? ` · Class flag ${cls.class_flag}` : ''}
                          {` · Prep flag ${cls.prep_flag}`}
                        </p>
                      </div>
                      <span className="text-lg font-semibold text-gray-900 tabular-nums">{st}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Course */}
        <Card>
          <CardHeader>
            <CardTitle>Course</CardTitle>
            {course && (
              <span className="text-sm text-gray-500">
                {course.laps} lap{course.laps === 1 ? '' : 's'}
              </span>
            )}
          </CardHeader>
          {!course ? (
            <p className="text-sm text-gray-500">No course has been assigned yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">{course.name}</p>
              {course.marks.length === 0 ? (
                <p className="text-sm text-gray-500">No marks defined for this course.</p>
              ) : (
                <ol className="space-y-1.5">
                  {course.marks.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-900">
                        <span className="text-gray-400 mr-2">{i + 1}.</span>
                        {m.name}
                      </span>
                      <RoundingBadge side={m.roundingSide} />
                    </li>
                  ))}
                </ol>
              )}
              {course.finish_at_start && (
                <p className="text-xs text-gray-500">Finish at the start line.</p>
              )}
            </div>
          )}
        </Card>

        {/* Safety & comms */}
        {(race.safety_info || race.vhf_channel || cleanNotes) && (
          <Card>
            <CardHeader>
              <CardTitle>Safety & Information</CardTitle>
            </CardHeader>
            <div className="space-y-3 text-sm">
              {race.vhf_channel && (
                <p className="text-gray-900">
                  <span className="font-medium">VHF Channel:</span> {race.vhf_channel}
                </p>
              )}
              {race.safety_info && (
                <div>
                  <p className="font-medium text-gray-900 mb-1">Safety</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{race.safety_info}</p>
                </div>
              )}
              {cleanNotes && (
                <div>
                  <p className="font-medium text-gray-900 mb-1">Notes</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{cleanNotes}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Downloads & text instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Instructions & Downloads</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowText(v => !v)}>
              📄 Text Instructions
            </Button>
            <Button
              variant="secondary"
              onClick={handleDownloadGpx}
              disabled={!course || course.marks.length === 0}
            >
              ⬇️ Download GPX
            </Button>
          </div>
          {showText && (
            <div className="mt-4 space-y-2">
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-800 whitespace-pre-wrap overflow-x-auto">
                {buildTextInstructions()}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleCopyText}>
                  {copied ? '✓ Copied' : 'Copy to clipboard'}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleDownloadText}>
                  Download .txt
                </Button>
              </div>
            </div>
          )}
          {(!course || course.marks.length === 0) && (
            <p className="text-xs text-gray-400 mt-2">GPX download is available once a course with marks is assigned.</p>
          )}
        </Card>
      </div>
      <WaypointFooter tone="light" />
    </div>
  )
}
