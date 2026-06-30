'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import type { CourseTemplate, Race } from '@/types/database'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

interface CourseWithLegs extends CourseTemplate {
  legCount: number
}

export default function EditRacePage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const raceId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [raceNumber, setRaceNumber] = useState('')
  const [series, setSeries] = useState('')
  const [customSeries, setCustomSeries] = useState('')
  const [showCustomSeries, setShowCustomSeries] = useState(false)
  const [raceDate, setRaceDate] = useState('')
  const [startHour, setStartHour] = useState('')
  const [startMin, setStartMin] = useState('00')
  const [vhfChannel, setVhfChannel] = useState('')
  const [safetyInfo, setSafetyInfo] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState('')

  const [existingSeries, setExistingSeries] = useState<string[]>([])
  const [courseTemplates, setCourseTemplates] = useState<CourseWithLegs[]>([])
  const [clubId, setClubId] = useState<string | null>(null)

  // Load existing race data
  useEffect(() => {
    if (!raceId || !user) return

    async function fetchData() {
      const supabase = getBrowserClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', user!.id)
        .maybeSingle()

      if (!profile?.club_id) { setLoading(false); return }
      const cid = profile.club_id
      setClubId(cid)

      // Fetch the race
      const { data: race } = await supabase
        .from('races')
        .select('*')
        .eq('id', raceId)
        .single()

      if (!race) { setError('Race not found'); setLoading(false); return }

      // Populate form
      setName(race.name)
      setRaceNumber(race.race_number ? String(race.race_number) : '')
      setSeries(race.series ?? '')
      setRaceDate(race.race_date)
      setSelectedCourseId(race.course_template_id ?? '')
      setVhfChannel(race.vhf_channel ?? '')
      setSafetyInfo(race.safety_info ?? '')

      // Extract start time and clean notes
      const timeMatch = race.notes?.match(/^Start time: (\d{2}):(\d{2})/)
      if (timeMatch) {
        setStartHour(timeMatch[1])
        setStartMin(timeMatch[2])
        setNotes(race.notes?.replace(/^Start time: \d{2}:\d{2}\n?/, '') ?? '')
      } else {
        setNotes(race.notes ?? '')
      }

      // Fetch series
      const { data: seriesRows } = await supabase
        .from('race_series')
        .select('name')
        .eq('club_id', cid)
        .eq('is_active', true)
        .order('name')
      const { data: races } = await supabase
        .from('races')
        .select('series')
        .eq('club_id', cid)
        .limit(50)
      const seriesSet = new Set<string>()
      if (seriesRows) seriesRows.forEach(s => seriesSet.add(s.name))
      if (races) races.forEach(r => { if (r.series) seriesSet.add(r.series) })
      setExistingSeries(Array.from(seriesSet).sort())

      // Check if current series is custom
      if (race.series && !seriesSet.has(race.series)) {
        setShowCustomSeries(true)
        setCustomSeries(race.series)
        setSeries('__custom__')
      }

      // Fetch course templates
      const { data: templates } = await supabase
        .from('course_templates')
        .select('*')
        .eq('club_id', cid)
        .order('name')

      if (templates) {
        const withLegs = await Promise.all(
          templates.map(async (t) => {
            const { count } = await supabase
              .from('course_template_legs')
              .select('*', { count: 'exact', head: true })
              .eq('template_id', t.id)
            return { ...t, legCount: count ?? 0 } as CourseWithLegs
          })
        )
        setCourseTemplates(withLegs)
      }

      setLoading(false)
    }

    fetchData()
  }, [raceId, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !raceDate) return

    setError('')
    setSaving(true)

    const supabase = getBrowserClient()
    const effectiveSeries = series === '__custom__' ? customSeries.trim() : series

    // Build notes with start time prefix
    let finalNotes = notes.trim()
    if (startHour) {
      finalNotes = `Start time: ${startHour}:${startMin}` + (finalNotes ? `\n${finalNotes}` : '')
    }

    const { error: updateError } = await supabase
      .from('races')
      .update({
        name: name.trim(),
        race_number: raceNumber ? parseInt(raceNumber) : null,
        series: effectiveSeries || null,
        race_date: raceDate,
        vhf_channel: vhfChannel.trim() || null,
        safety_info: safetyInfo.trim() || null,
        notes: finalNotes || null,
        course_template_id: selectedCourseId || null,
      })
      .eq('id', raceId)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    router.push(`/dashboard/races/${raceId}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit race</h1>
        <p className="text-sm text-gray-500 mt-0.5">Update race details</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Date & Time */}
        <Card>
          <CardHeader>
            <CardTitle>📅 Date & time</CardTitle>
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
                    value={startHour}
                    onChange={(e) => setStartHour(e.target.value)}
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
                    value={startMin}
                    onChange={(e) => setStartMin(e.target.value)}
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

        {/* Race details */}
        <Card>
          <CardHeader>
            <CardTitle>Race details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Race name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Race number"
                type="number"
                value={raceNumber}
                onChange={(e) => setRaceNumber(e.target.value)}
                min={1}
              />
              <div>
                <label className="text-sm font-medium text-gray-700">Series</label>
                <select
                  value={series}
                  onChange={(e) => {
                    const v = e.target.value
                    setSeries(v)
                    if (v === '__custom__') {
                      setShowCustomSeries(true)
                    } else {
                      setShowCustomSeries(false)
                      setCustomSeries('')
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No series</option>
                  {existingSeries.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__custom__">＋ New series</option>
                </select>
                {showCustomSeries && (
                  <Input
                    value={customSeries}
                    onChange={(e) => setCustomSeries(e.target.value)}
                    placeholder="Enter series name"
                    className="mt-2"
                  />
                )}
              </div>
            </div>

            {/* Course selector */}
            <div>
              <label className="text-sm font-medium text-gray-700">Course</label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No course</option>
                {courseTemplates.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.legCount} legs{c.laps ? `, ${c.laps} laps` : ''})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* On-the-water info */}
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
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal race officer notes…"
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
            onClick={() => router.push(`/dashboard/races/${raceId}`)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving} className="flex-1" size="lg">
            Save changes
          </Button>
        </div>
      </form>
    </div>
  )
}
