'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import type { CourseTemplate } from '@/types/database'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function getDayPart(time: string): string | null {
  if (!time) return null
  const [h] = time.split(':').map(Number)
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

function generateRaceName(date: string, time: string): string {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  const dayName = DAY_NAMES[d.getDay()]
  const dayNum = d.getDate()
  const monthName = MONTH_NAMES[d.getMonth()]
  const dayPart = getDayPart(time)
  if (dayPart) {
    return `${dayName} ${dayNum} ${monthName} ${dayPart} Race`
  }
  return `${dayName} ${dayNum} ${monthName} Race`
}

interface CourseWithLegs extends CourseTemplate {
  legCount: number
}

export default function NewRacePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clubId, setClubId] = useState<string | null>(null)
  const [clubDefaultVhf, setClubDefaultVhf] = useState('')

  // Form state
  const today = new Date().toISOString().split('T')[0]
  const [raceDate, setRaceDate] = useState(today)
  const [startTime, setStartTime] = useState('')
  const [name, setName] = useState(() => generateRaceName(today, ''))
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)
  const [raceNumber, setRaceNumber] = useState('')
  const [series, setSeries] = useState('')
  const [newSeriesName, setNewSeriesName] = useState('')
  const [existingSeries, setExistingSeries] = useState<string[]>([])
  const [courseTemplates, setCourseTemplates] = useState<CourseWithLegs[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [vhfChannel, setVhfChannel] = useState('')
  const [safetyInfo, setSafetyInfo] = useState('')
  const [notes, setNotes] = useState('')

  // Auto-generate name when date or time changes (unless manually edited)
  useEffect(() => {
    if (!nameManuallyEdited) {
      setName(generateRaceName(raceDate, startTime))
    }
  }, [raceDate, startTime, nameManuallyEdited])

  // Fetch club data
  useEffect(() => {
    if (!user) return
    async function fetchDefaults() {
      const supabase = getBrowserClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', user!.id)
        .maybeSingle()

      if (!profile?.club_id) return
      const cid = profile.club_id
      setClubId(cid)

      // Club VHF default
      const { data: club } = await supabase
        .from('clubs')
        .select('vhf_channel')
        .eq('id', cid)
        .single()
      if (club?.vhf_channel) {
        setClubDefaultVhf(club.vhf_channel)
        setVhfChannel(club.vhf_channel)
      }

      // Existing races for series + race number
      const { data: races } = await supabase
        .from('races')
        .select('race_number, series')
        .eq('club_id', cid)
        .order('race_date', { ascending: false })
        .limit(50)

      if (races) {
        const maxNum = Math.max(0, ...races.map(r => r.race_number ?? 0))
        setRaceNumber(String(maxNum + 1))

        // Pre-select most recent series
        const lastSeries = races.find(r => r.series)?.series
        if (lastSeries) setSeries(lastSeries)
      } else {
        setRaceNumber('1')
      }

      // Fetch series from race_series table + merge any from past races
      const { data: seriesRows } = await supabase
        .from('race_series')
        .select('name')
        .eq('club_id', cid)
        .eq('is_active', true)
        .order('name')
      const seriesSet = new Set<string>()
      if (seriesRows) seriesRows.forEach(s => seriesSet.add(s.name))
      if (races) races.forEach(r => { if (r.series) seriesSet.add(r.series) })
      setExistingSeries(Array.from(seriesSet).sort())

      // Course templates with leg counts
      const { data: templates } = await supabase
        .from('course_templates')
        .select('*')
        .eq('club_id', cid)
        .order('name')

      if (templates) {
        // Fetch leg counts
        const withLegs: CourseWithLegs[] = await Promise.all(
          templates.map(async (t) => {
            const { count } = await supabase
              .from('course_template_legs')
              .select('*', { count: 'exact', head: true })
              .eq('template_id', t.id)
            return { ...t, legCount: count ?? 0 }
          })
        )
        setCourseTemplates(withLegs)
      }
    }
    fetchDefaults()
  }, [user])

  const handleNameChange = useCallback((val: string) => {
    setName(val)
    setNameManuallyEdited(true)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !raceDate) return

    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    const resolvedClubId = clubId
    if (!resolvedClubId) {
      setError('You must be linked to a club before creating races.')
      setLoading(false)
      return
    }

    const resolvedSeries = series === '__new__'
      ? (newSeriesName.trim() || null)
      : (series.trim() || null)

    // Build notes: prepend start time if provided
    let finalNotes = notes.trim()
    if (startTime) {
      finalNotes = `Start time: ${startTime}` + (finalNotes ? `\n${finalNotes}` : '')
    }

    const { data: inserted, error: insertError } = await supabase
      .from('races')
      .insert({
        club_id: resolvedClubId,
        name: name.trim(),
        race_number: raceNumber ? parseInt(raceNumber) : null,
        series: resolvedSeries,
        race_date: raceDate,
        vhf_channel: vhfChannel.trim() || null,
        safety_info: safetyInfo.trim() || null,
        notes: finalNotes || null,
        status: 'draft',
        course_template_id: selectedCourseId || null,
      })
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push(`/dashboard/races/${inserted.id}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New race</h1>
        <p className="text-sm text-gray-500 mt-0.5">Set up race details — you can edit these later</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* DATE & TIME — first section */}
        <Card>
          <CardHeader>
            <CardTitle>Date &amp; time</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Race date"
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
                required
              />
              <div>
                <label className="text-sm font-medium text-gray-700">Start time</label>
                <div className="mt-1 flex gap-2">
                  <select
                    value={startTime ? startTime.split(':')[0] : ''}
                    onChange={(e) => {
                      const hr = e.target.value
                      const min = startTime ? startTime.split(':')[1] : '00'
                      setStartTime(hr ? `${hr}:${min || '00'}` : '')
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Hr</option>
                    {Array.from({ length: 24 }, (_, i) => {
                      const h = i.toString().padStart(2, '0')
                      return <option key={i} value={h}>{h}</option>
                    })}
                  </select>
                  <span className="self-center text-gray-400 font-bold">:</span>
                  <select
                    value={startTime ? startTime.split(':')[1] : ''}
                    onChange={(e) => {
                      const hr = startTime ? startTime.split(':')[0] : '09'
                      setStartTime(`${hr}:${e.target.value}`)
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="00">00</option>
                    <option value="15">15</option>
                    <option value="30">30</option>
                    <option value="45">45</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* RACE DETAILS */}
        <Card>
          <CardHeader>
            <CardTitle>Race details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Race name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Wednesday 2 July Evening Race"
              required
              hint={nameManuallyEdited ? 'Manually edited — auto-fill paused' : 'Auto-fills from date & time'}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Race number"
                type="number"
                value={raceNumber}
                onChange={(e) => setRaceNumber(e.target.value)}
                placeholder="—"
                min={1}
              />

              {/* Series */}
              <div>
                <label className="text-sm font-medium text-gray-700">Series</label>
                <select
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— No series —</option>
                  {existingSeries.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__new__">＋ New series</option>
                </select>
              </div>
            </div>

            {series === '__new__' && (
              <Input
                label="New series name"
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
                placeholder="e.g. Summer Series"
                autoFocus
              />
            )}
          </div>
        </Card>

        {/* COURSE SELECTION */}
        <Card>
          <CardHeader>
            <CardTitle>Course</CardTitle>
          </CardHeader>
          <div>
            <label className="text-sm font-medium text-gray-700">Course template</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— No course (set on the day) —</option>
              {courseTemplates.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.legCount ? ` · ${c.legCount} leg${c.legCount !== 1 ? 's' : ''}` : ''}{c.laps ? ` · ${c.laps} lap${c.laps !== 1 ? 's' : ''}` : ''}
                </option>
              ))}
            </select>
            {courseTemplates.length === 0 && (
              <p className="text-xs text-gray-400 mt-1.5">No course templates yet. You can add them in Courses.</p>
            )}
          </div>
        </Card>

        {/* ON-THE-WATER */}
        <Card>
          <CardHeader>
            <CardTitle>On-the-water info</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="VHF channel"
              value={vhfChannel}
              onChange={(e) => setVhfChannel(e.target.value)}
              placeholder="M2"
              hint={clubDefaultVhf ? `Club default: ${clubDefaultVhf}` : 'Displayed to competitors'}
            />
            <div>
              <label className="text-sm font-medium text-gray-700">Safety information</label>
              <textarea
                value={safetyInfo}
                onChange={(e) => setSafetyInfo(e.target.value)}
                placeholder="Safety boat on station. VHF M2. Emergency 999."
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Notes <span className="text-gray-400 font-normal">(internal)</span></label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Race officer notes…"
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </Card>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading} className="flex-1" size="lg">
            Create race
          </Button>
        </div>
      </form>
    </div>
  )
}
