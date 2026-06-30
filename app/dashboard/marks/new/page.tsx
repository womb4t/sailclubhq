'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import type { MarkType, RoundingSide } from '@/types/database'

export default function NewMarkPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [shortId, setShortId] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [markType, setMarkType] = useState<MarkType>('virtual')
  const [defaultRounding, setDefaultRounding] = useState<RoundingSide>('port')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !shortId.trim()) return

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
      setError('You must be linked to a club before adding marks.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase
      .from('marks')
      .insert({
        club_id: profile.club_id,
        created_by: user.id,
        name: name.trim(),
        short_id: shortId.trim().toUpperCase(),
        lat: lat ? parseFloat(lat) : 0,
        lon: lon ? parseFloat(lon) : 0,
        type: markType,
        source: 'catalogue' as const,
        default_rounding: defaultRounding,
        notes: notes.trim() || null,
      })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard/marks')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add mark</h1>
        <p className="text-sm text-gray-500 mt-0.5">Add a mark to your club catalogue</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Mark details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Outer Distance"
                required
              />
              <Input
                label="Short ID"
                value={shortId}
                onChange={(e) => setShortId(e.target.value)}
                placeholder="OD"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Type</label>
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setMarkType('virtual')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    markType === 'virtual'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  📍 Virtual
                </button>
                <button
                  type="button"
                  onClick={() => setMarkType('physical')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    markType === 'physical'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  🔶 Physical
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Default rounding</label>
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setDefaultRounding('port')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    defaultRounding === 'port'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  🔴 Port
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultRounding('starboard')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    defaultRounding === 'starboard'
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  🟢 Starboard
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Position</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Latitude"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="51.3456"
              />
              <Input
                label="Longitude"
                type="number"
                step="any"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                placeholder="0.1234"
              />
            </div>
            <p className="text-xs text-gray-400">
              Leave blank for now — you can set coordinates later from the map or by GPS.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this mark…"
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
            Add mark
          </Button>
        </div>
      </form>
    </div>
  )
}
