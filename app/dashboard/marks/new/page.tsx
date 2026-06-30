'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import SeaMap from '@/components/map/DynamicSeaMap'
import { decimalToDDM } from '@/lib/coordinates'
import type { Mark, MarkType, RoundingSide } from '@/types/database'

export default function NewMarkPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existingMarks, setExistingMarks] = useState<Mark[]>([])

  const [name, setName] = useState('')
  const [shortId, setShortId] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [markType, setMarkType] = useState<MarkType>('virtual')
  const [defaultRounding, setDefaultRounding] = useState<RoundingSide>('port')
  const [notes, setNotes] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Filter existing marks for name suggestions
  const nameSuggestions = existingMarks.filter(m =>
    name.length >= 1 &&
    m.name.toLowerCase().includes(name.toLowerCase()) &&
    m.name.toLowerCase() !== name.toLowerCase()
  ).slice(0, 5)

  // Load existing marks to show on map
  useEffect(() => {
    if (!user) return

    async function fetchMarks() {
      const supabase = getBrowserClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', user!.id)
        .maybeSingle()

      if (profile?.club_id) {
        const { data } = await supabase
          .from('marks')
          .select('*')
          .eq('club_id', profile.club_id)
          .eq('source', 'catalogue')
        setExistingMarks((data as Mark[]) ?? [])
      }
    }
    fetchMarks()
  }, [user])

  function handleMapClick(clickLat: number, clickLon: number) {
    setLat(clickLat.toFixed(7))
    setLon(clickLon.toFixed(7))
  }

  function handleMarkerDrag(dragLat: number, dragLon: number) {
    setLat(dragLat.toFixed(7))
    setLon(dragLon.toFixed(7))
  }

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

  // Map center: use existing marks centroid, or default to Thames Estuary
  const mapCenter: [number, number] = existingMarks.length > 0
    ? [
        existingMarks.reduce((sum, m) => sum + Number(m.lat), 0) / existingMarks.length,
        existingMarks.reduce((sum, m) => sum + Number(m.lon), 0) / existingMarks.length,
      ]
    : [51.35, 0.73]

  const selectedPosition = lat && lon ? { lat: parseFloat(lat), lon: parseFloat(lon) } : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add mark</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tap the map to place your mark, or enter coordinates manually</p>
      </div>

      {/* Map */}
      <Card className="overflow-hidden p-0">
        <SeaMap
          center={mapCenter}
          zoom={existingMarks.length > 0 ? 14 : 13}
          markers={existingMarks.map(m => ({
            lat: Number(m.lat),
            lon: Number(m.lon),
            label: m.short_id,
            name: m.name,
            type: m.type,
            rounding: m.default_rounding,
            id: m.id,
          }))}
          onMapClick={handleMapClick}
          onMarkerDrag={handleMarkerDrag}
          selectedPosition={selectedPosition}
          draggableMarker
          height="350px"
        />
        {selectedPosition && (
          <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between">
            <p className="text-sm font-mono text-blue-700 font-medium">
              {decimalToDDM(parseFloat(lat), parseFloat(lon)).full}
            </p>
            <button
              type="button"
              onClick={() => { setLat(''); setLon('') }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear position
            </button>
          </div>
        )}
      </Card>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Mark details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <Input
                  label="Name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Outer Distance"
                  required
                  autoComplete="off"
                />
                {showSuggestions && name.length >= 1 && nameSuggestions.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {nameSuggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setName(s.name)
                          setShortId(s.short_id)
                          setShowSuggestions(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                      >
                        <span className="text-gray-900">{s.name}</span>
                        <span className="text-xs text-gray-400 font-mono">{s.short_id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
            <CardTitle>Position (manual entry)</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Latitude"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="51.345678"
              />
              <Input
                label="Longitude"
                type="number"
                step="any"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                placeholder="0.123456"
              />
            </div>
            <p className="text-xs text-gray-400">
              Or tap the map above to set the position. Drag the marker to fine-tune.
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
