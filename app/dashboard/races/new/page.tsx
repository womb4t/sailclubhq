'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function NewRacePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clubDefaults, setClubDefaults] = useState<{ vhf_channel: string | null }>({ vhf_channel: null })

  const today = new Date()
  const dayName = DAY_NAMES[today.getDay()]

  const [name, setName] = useState('')
  const [raceNumber, setRaceNumber] = useState('')
  const [series, setSeries] = useState('')
  const [raceDate, setRaceDate] = useState(today.toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('')
  const [vhfChannel, setVhfChannel] = useState('')
  const [safetyInfo, setSafetyInfo] = useState('')
  const [notes, setNotes] = useState('')

  // Auto-generate name and race number from existing races
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

      // Get club defaults (VHF channel)
      const { data: club } = await supabase
        .from('clubs')
        .select('vhf_channel')
        .eq('id', profile.club_id)
        .single()

      if (club?.vhf_channel) {
        setClubDefaults({ vhf_channel: club.vhf_channel })
        setVhfChannel(club.vhf_channel)
      }

      // Count existing races for this day-of-week pattern to auto-generate
      const { data: races } = await supabase
        .from('races')
        .select('name, race_number, series')
        .eq('club_id', profile.club_id)
        .order('race_date', { ascending: false })
        .limit(20)

      if (races && races.length > 0) {
        // Find the highest race number and increment
        const maxNum = Math.max(0, ...races.map(r => r.race_number ?? 0))
        setRaceNumber(String(maxNum + 1))

        // Check if there's a common series name (most recent)
        const lastSeries = races.find(r => r.series)?.series
        if (lastSeries) setSeries(lastSeries)

        // Auto-generate name: "Wednesday Evening Race 4"
        setName(`${dayName} Race ${maxNum + 1}`)
      } else {
        setRaceNumber('1')
        setName(`${dayName} Race 1`)
      }
    }

    fetchDefaults()
  }, [user, dayName])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !raceDate) return

    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('club_id')
      .eq('id', user.id)
      .single()

    if (!profile?.club_id) {
      setError('You must be linked to a club before creating races.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase
      .from('races')
      .insert({
        club_id: profile.club_id,
        name: name.trim(),
        race_number: raceNumber ? parseInt(raceNumber) : null,
        series: series.trim() || null,
        race_date: raceDate,
        vhf_channel: vhfChannel.trim() || null,
        safety_info: safetyInfo.trim() || null,
        notes: notes.trim() || null,
        status: 'draft',
      })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard/races')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New race</h1>
        <p className="text-sm text-gray-500 mt-0.5">Set up race details — you can edit these later</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Race details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Race name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wednesday Evening Race 1"
              required
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
              <Input
                label="Series"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder="Summer Series"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Race date"
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
                required
              />
              <Input
                label="Start time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="18:30"
              />
            </div>
          </div>
        </Card>

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
              hint={clubDefaults.vhf_channel ? `Club default: ${clubDefaults.vhf_channel}` : 'Displayed to competitors'}
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
