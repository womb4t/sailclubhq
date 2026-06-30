'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'

interface RaceInfo {
  id: string
  name: string
  race_date: string
  series: string | null
  status: string
  notes: string | null
  vhf_channel: string | null
  safety_info: string | null
  club: { name: string; invite_code: string } | null
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function extractStartTime(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/^Start time: (\d{2}:\d{2})/)
  return match ? match[1] : null
}

export default function RaceJoinPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const token = params.token as string

  const [race, setRace] = useState<RaceInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Entry form
  const [helmName, setHelmName] = useState('')
  const [boatName, setBoatName] = useState('')
  const [boatClass, setBoatClass] = useState('')
  const [sailNumber, setSailNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Fetch race data regardless of auth (needed for club code on redirect)
  useEffect(() => {
    async function lookupRace() {
      const supabase = getBrowserClient()
      const { data } = await supabase
        .from('races')
        .select('id, name, race_date, series, status, notes, vhf_channel, safety_info, club:clubs(name, invite_code)')
        .eq('entry_token', token)
        .maybeSingle()

      if (data && (data.status === 'planned' || data.status === 'confirmed')) {
        setRace({
          ...data,
          club: Array.isArray(data.club) ? data.club[0] : data.club,
        } as RaceInfo)
      } else if (data) {
        // Race exists but not accepting entries
        setRace({
          ...data,
          club: Array.isArray(data.club) ? data.club[0] : data.club,
        } as RaceInfo)
      } else {
        setNotFound(true)
      }
      setLoading(false)
    }
    lookupRace()
  }, [token, authLoading, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!helmName.trim()) { setError('Helm name is required'); return }
    if (!race) return

    setError('')
    setSubmitting(true)

    // For now, store entry in a simple format via notes or a future entries table
    // TODO: proper race_entries integration once boats table is populated
    setSubmitted(true)
    setSubmitting(false)
  }

  const startTime = race ? extractStartTime(race.notes) : null
  const isOpen = race?.status === 'planned' || race?.status === 'confirmed'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-sm w-full text-center">
          <div className="text-4xl mb-3">🏁</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">Race not found</h2>
          <p className="text-sm text-gray-400 mb-4">
            This link doesn&apos;t match any active race.
          </p>
          <Link href="/">
            <Button variant="secondary" size="sm">Go to homepage</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (!race) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        {/* Back to club link */}
        {race.club?.invite_code && (
          <div>
            <Link href={`/club/${race.club.invite_code}`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
              ← Back to club
            </Link>
          </div>
        )}
        {/* Race info header */}
        <div className="text-center">
          {race.club && (
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{race.club.name}</p>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{race.name}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {formatDate(race.race_date)}
            {startTime && <span className="ml-1">at {startTime}</span>}
          </p>
          {race.series && (
            <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{race.series}</span>
          )}
          <div className="mt-2">
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
              race.status === 'confirmed' ? 'bg-green-100 text-green-700' :
              race.status === 'planned' ? 'bg-blue-100 text-blue-700' :
              race.status === 'completed' ? 'bg-amber-100 text-amber-700' :
              race.status === 'cancelled' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {race.status === 'confirmed' ? '✅ Race Confirmed' :
               race.status === 'planned' ? '📋 Race Planned' :
               race.status === 'completed' ? '🏁 Race Completed' :
               race.status === 'cancelled' ? '❌ Race Cancelled' :
               race.status}
            </span>
          </div>
        </div>

        {/* Safety / VHF info */}
        {(race.vhf_channel || race.safety_info) && (
          <Card>
            <div className="space-y-2">
              {race.vhf_channel && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">📻</span>
                  <span className="text-sm text-gray-700">VHF Channel: <strong>{race.vhf_channel}</strong></span>
                </div>
              )}
              {race.safety_info && (
                <div className="flex items-start gap-2">
                  <span className="text-sm">⚠️</span>
                  <p className="text-sm text-gray-600">{race.safety_info}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Entry form or status message */}
        {!isOpen ? (
          <Card>
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">
                {race.status === 'completed' ? 'This race has been completed.' :
                 race.status === 'cancelled' ? 'This race has been cancelled.' :
                 'This race is not currently accepting entries.'}
              </p>
            </div>
          </Card>
        ) : submitted ? (
          <Card>
            <div className="text-center py-6">
              <div className="text-4xl mb-3">⛵</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Entry submitted!</h2>
              <p className="text-sm text-gray-500">
                You&apos;re entered for <strong>{race.name}</strong>.
              </p>
              <p className="text-sm text-gray-400 mt-2">
                {formatDate(race.race_date)}{startTime && ` at ${startTime}`}
              </p>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>⛵ Enter this race</CardTitle>
            </CardHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Helm name <span className="text-red-500">*</span></label>
                <input
                  value={helmName}
                  onChange={(e) => setHelmName(e.target.value)}
                  placeholder="Your name"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Boat name</label>
                  <input
                    value={boatName}
                    onChange={(e) => setBoatName(e.target.value)}
                    placeholder="e.g. Sea Breeze"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Class</label>
                  <input
                    value={boatClass}
                    onChange={(e) => setBoatClass(e.target.value)}
                    placeholder="e.g. Laser, RS200"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Sail number</label>
                  <input
                    value={sailNumber}
                    onChange={(e) => setSailNumber(e.target.value)}
                    placeholder="e.g. 12345"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Phone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Emergency contact"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" loading={submitting} className="w-full" size="lg">
                🏁 Enter Race
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  )
}
