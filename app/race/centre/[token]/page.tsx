'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge, RoundingBadge } from '@/components/ui/Badge'

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
  course_template_id: string | null
  start_time: string | null
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
        .select('id, name, race_number, series, race_date, notes, safety_info, vhf_channel, status, entry_token, course_template_id, start_time')
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

      setLoading(false)
    }

    load()
  }, [token, authLoading, user])

  // ── Derived ─────────────────────────────────────────────────────────────────

  const firstClass = startClasses[0] ?? null
  const warningTime = firstClass
    ? addMinutes(formatTime(firstClass.start_time), -firstClass.sequence_warning_mins)
    : null
  const cleanNotes = stripStartTimeLine(race?.notes ?? null)
  const raceIsOn = race?.status === 'live' || race?.status === 'confirmed'

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
      '<gpx version="1.1" creator="SailClubHQ" xmlns="http://www.topografix.com/GPX/1/1">',
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

        {/* Race Nav */}
        <Card padding="lg" className="text-center">
          {raceIsOn ? (
            <Link
              href={`/race/live/${race.entry_token}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold px-8 py-3 text-base transition-colors w-full sm:w-auto"
            >
              📱 Open Race Nav
            </Link>
          ) : (
            <>
              <Button size="lg" disabled className="w-full sm:w-auto">
                📱 Open Race Nav
              </Button>
              <p className="text-sm text-gray-500 mt-2">Race Nav opens when racing starts.</p>
            </>
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
    </div>
  )
}
