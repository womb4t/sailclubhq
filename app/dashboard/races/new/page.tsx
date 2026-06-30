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

/** Add `mins` minutes to a HH:MM string, returns HH:MM */
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

interface StartClass {
  id: string // local only (not DB id)
  name: string
  class_flag: string
  prep_flag: 'P' | 'I' | 'U' | 'Black'
  start_time: string // HH:MM
  sequence_warning_mins: number
}

function makeDefaultClass(startTime: string): StartClass {
  return {
    id: crypto.randomUUID(),
    name: 'Fleet',
    class_flag: '',
    prep_flag: 'P',
    start_time: startTime || '10:00',
    sequence_warning_mins: 5,
  }
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

  // Start classes state
  const [startClasses, setStartClasses] = useState<StartClass[]>([])

  // Auto-generate name when date or time changes (unless manually edited)
  useEffect(() => {
    if (!nameManuallyEdited) {
      setName(generateRaceName(raceDate, startTime))
    }
  }, [raceDate, startTime, nameManuallyEdited])

  // Initialise start classes once we have a start time
  useEffect(() => {
    if (startTime && startClasses.length === 0) {
      setStartClasses([makeDefaultClass(startTime)])
    }
  }, [startTime]) // eslint-disable-line react-hooks/exhaustive-deps

  // When start time changes, recalculate all class start times maintaining intervals
  useEffect(() => {
    if (!startTime || startClasses.length === 0) return
    setStartClasses(prev => {
      if (prev.length === 0) return prev
      const newClasses = [...prev]
      newClasses[0] = { ...newClasses[0], start_time: startTime }
      for (let i = 1; i < newClasses.length; i++) {
        const prevTime = newClasses[i - 1].start_time
        // Calculate interval: how many mins after previous class
        const interval = 5 // default RYA 5 min intervals
        newClasses[i] = { ...newClasses[i], start_time: addMinutes(prevTime, interval) }
      }
      return newClasses
    })
  }, [startTime]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function addStartClass() {
    setStartClasses(prev => {
      const lastTime = prev.length > 0 ? prev[prev.length - 1].start_time : (startTime || '10:00')
      const newTime = addMinutes(lastTime, 5)
      return [...prev, {
        id: crypto.randomUUID(),
        name: '',
        class_flag: '',
        prep_flag: 'P',
        start_time: newTime,
        sequence_warning_mins: 5,
      }]
    })
  }

  function updateStartClass(id: string, updates: Partial<StartClass>) {
    setStartClasses(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  function removeStartClass(id: string) {
    setStartClasses(prev => prev.filter(c => c.id !== id))
  }

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

    // Insert start classes
    if (startClasses.length > 0 && inserted.id) {
      const classRows = startClasses
        .filter(c => c.name.trim())
        .map(c => ({
          race_id: inserted.id,
          name: c.name.trim(),
          class_flag: c.class_flag.trim() || null,
          prep_flag: c.prep_flag,
          start_time: `${raceDate}T${c.start_time}:00Z`,
          sequence_warning_mins: c.sequence_warning_mins,
        }))

      if (classRows.length > 0) {
        const { error: classError } = await supabase
          .from('start_classes')
          .insert(classRows)
        if (classError) {
          console.error('Failed to save start classes:', classError.message)
          // Don't block navigation — race was created, classes can be added later
        }
      }
    }

    router.push(`/dashboard/races/${inserted.id}`)
  }

  // Warning signal time = start_time - warning_mins
  function warningTime(classStartTime: string, warnMins: number): string {
    return addMinutes(classStartTime, -warnMins)
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

        {/* START CLASSES */}
        <Card>
          <CardHeader>
            <CardTitle>⏱ Start classes</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addStartClass}>
              + Add class
            </Button>
          </CardHeader>

          {startClasses.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400">
                {startTime
                  ? 'No start classes yet. Click "+ Add class" to add one.'
                  : 'Set a start time above, then add classes here.'}
              </p>
              {!startTime && (
                <p className="text-xs text-gray-300 mt-1">Start classes use the race start time as the base.</p>
              )}
            </div>
          )}

          {startClasses.length > 0 && (
            <div className="space-y-3">
              {/* Preview: first warning signal */}
              {startClasses[0] && (
                <div className="text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                  <span className="font-medium text-blue-700">First warning signal:</span>{' '}
                  {warningTime(startClasses[0].start_time, startClasses[0].sequence_warning_mins)}
                  {' '}({startClasses[0].sequence_warning_mins} min before {startClasses[0].start_time})
                </div>
              )}

              {startClasses.map((cls, idx) => (
                <div key={cls.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Class {idx + 1}
                    </span>
                    {startClasses.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStartClass(cls.id)}
                        className="text-gray-400 hover:text-red-500 text-lg leading-none transition-colors"
                        aria-label="Remove class"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Class name"
                      value={cls.name}
                      onChange={(e) => updateStartClass(cls.id, { name: e.target.value })}
                      placeholder="e.g. Fast Handicap"
                    />
                    <Input
                      label="Class flag"
                      value={cls.class_flag}
                      onChange={(e) => updateStartClass(cls.id, { class_flag: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Prep flag</label>
                      <select
                        value={cls.prep_flag}
                        onChange={(e) => updateStartClass(cls.id, { prep_flag: e.target.value as StartClass['prep_flag'] })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="P">P</option>
                        <option value="I">I</option>
                        <option value="U">U</option>
                        <option value="Black">Black</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Start time</label>
                      <input
                        type="time"
                        value={cls.start_time}
                        onChange={(e) => updateStartClass(cls.id, { start_time: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Warning</label>
                      <select
                        value={cls.sequence_warning_mins}
                        onChange={(e) => updateStartClass(cls.id, { sequence_warning_mins: parseInt(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={3}>3 min</option>
                        <option value={4}>4 min</option>
                        <option value={5}>5 min</option>
                        <option value={10}>10 min</option>
                      </select>
                    </div>
                  </div>

                  {/* Mini sequence preview for this class */}
                  <div className="text-xs text-gray-500 pt-1 border-t border-gray-200 space-y-0.5">
                    <div>
                      <span className="font-mono">{warningTime(cls.start_time, cls.sequence_warning_mins)}</span>
                      {' '}Warning signal
                    </div>
                    <div>
                      <span className="font-mono">{addMinutes(warningTime(cls.start_time, cls.sequence_warning_mins), 1)}</span>
                      {' '}Prep signal
                    </div>
                    <div className="font-medium text-gray-700">
                      <span className="font-mono">{cls.start_time}</span>
                      {' '}🚩 Start{cls.name ? ` — ${cls.name}` : ''}
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addStartClass}
                className="w-full text-sm text-blue-600 hover:text-blue-700 py-2 border-2 border-dashed border-blue-200 hover:border-blue-300 rounded-lg transition-colors"
              >
                + Add another class
              </button>
            </div>
          )}
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
