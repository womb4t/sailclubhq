'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'

export default function NewRacePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [raceNumber, setRaceNumber] = useState('')
  const [series, setSeries] = useState('')
  const [raceDate, setRaceDate] = useState(new Date().toISOString().split('T')[0])
  const [vhfChannel, setVhfChannel] = useState('')
  const [safetyInfo, setSafetyInfo] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !raceDate) return

    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
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

    const { data: race, error: insertError } = await supabase
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
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push(`/races/${race.id}`)
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
            <Input
              label="Race date"
              type="date"
              value={raceDate}
              onChange={(e) => setRaceDate(e.target.value)}
              required
            />
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
              hint="Displayed to competitors"
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
