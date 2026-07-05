'use client'

// No-login race join — "get the link, put in your boat, start tracking".
//
// The smarts are in the LINK: /race/go/[token]?boat=&sail=&helm=&crew= pre-fills
// the form (all editable). The organiser distributes the link (that's the safety
// gate). Anyone can enter without an account; logged-in members get a proper
// member entry, everyone else gets an anonymous device-scoped participant entry.

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

interface RaceInfo {
  id: string
  name: string
  race_date: string
  status: string
  club_id: string | null
}
interface BoatSuggestion {
  id: string
  boat_name: string
  sail_number: string | null
  class: string | null
  owner_id: string | null
}

const PARTICIPANT_KEY = 'scq-participant-id'

function getParticipantId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(PARTICIPANT_KEY)
  if (!id) {
    id =
      (crypto?.randomUUID?.() as string | undefined) ??
      `p-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(PARTICIPANT_KEY, id)
  }
  return id
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function RaceGoPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = params.token as string
  const { user } = useAuth()

  const [race, setRace] = useState<RaceInfo | null>(null)
  const [boats, setBoats] = useState<BoatSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // First-time intro (shown once per device).
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem('scq-seen-race-intro')
  })
  function dismissIntro() {
    if (typeof window !== 'undefined') localStorage.setItem('scq-seen-race-intro', '1')
    setShowIntro(false)
  }

  // Form pre-filled from the URL — the "smarts in the link". Seed lazily from
  // query params so there's no synchronous setState in an effect.
  const [boatName, setBoatName] = useState(() => searchParams.get('boat') ?? '')
  const [sailNumber, setSailNumber] = useState(() => searchParams.get('sail') ?? '')
  const [helmName, setHelmName] = useState(() => searchParams.get('helm') ?? '')
  const [crewName, setCrewName] = useState(() => searchParams.get('crew') ?? '')

  useEffect(() => {
    if (!token) return
    async function load() {
    const supabase = getBrowserClient()
    const { data: r, error: rErr } = await supabase
      .from('races')
      .select('id, name, race_date, status, club_id')
      .eq('entry_token', token)
      .single()
    if (rErr || !r) {
      setError('Race not found. Check your link with the organiser.')
      setLoading(false)
      return
    }
    setRace(r as RaceInfo)

    // Boat suggestions for the club (own boats first when logged in).
    if (r.club_id) {
      const { data: b } = await supabase
        .from('boats')
        .select('id, boat_name, sail_number, class, owner_id')
        .eq('club_id', r.club_id)
        .order('boat_name', { ascending: true })
      if (b) setBoats(b as BoatSuggestion[])
    }
    setLoading(false)
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const suggestions = useMemo(() => {
    if (!boats.length) return []
    // Put the logged-in user's own boats at the top.
    const mine = user ? boats.filter((b) => b.owner_id === user.id) : []
    const rest = boats.filter((b) => !mine.includes(b))
    return [...mine, ...rest]
  }, [boats, user])

  function pickBoat(b: BoatSuggestion) {
    setBoatName(b.boat_name)
    setSailNumber(b.sail_number ?? '')
  }

  async function startTracking() {
    if (!race || !boatName.trim()) {
      setError('Please enter your boat name.')
      return
    }
    setSubmitting(true)
    setError('')
    const supabase = getBrowserClient()

    // Match an existing club boat by name (best-effort) to link boat_id.
    const matched = boats.find(
      (b) => b.boat_name.trim().toLowerCase() === boatName.trim().toLowerCase(),
    )

    const participantId = user ? null : getParticipantId()

    // If this device already has an entry on this race, reuse it (idempotent).
    let existingId: string | null = null
    if (participantId) {
      const { data: ex } = await supabase
        .from('race_entries')
        .select('id')
        .eq('race_id', race.id)
        .eq('participant_id', participantId)
        .limit(1)
        .maybeSingle()
      existingId = ex?.id ?? null
    } else if (user) {
      const { data: ex } = await supabase
        .from('race_entries')
        .select('id')
        .eq('race_id', race.id)
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      existingId = ex?.id ?? null
    }

    // Combine helm + crew into the display name (schema has helm_name, not crew).
    const displayName =
      helmName.trim() && crewName.trim()
        ? `${helmName.trim()} / ${crewName.trim()}`
        : helmName.trim() || crewName.trim() || null

    const row = {
      race_id: race.id,
      boat_id: matched?.id ?? null,
      boat_name: boatName.trim(),
      helm_name: displayName,
      status: 'entered' as const,
      user_id: user?.id ?? null,
      participant_id: participantId,
    }

    let entryId = existingId
    if (existingId) {
      await supabase
        .from('race_entries')
        .update({
          boat_id: row.boat_id,
          boat_name: row.boat_name,
          helm_name: row.helm_name,
          status: 'entered',
        })
        .eq('id', existingId)
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('race_entries')
        .insert(row)
        .select('id')
        .single()
      if (insErr || !ins) {
        setError('Could not join the race. Please try again.')
        setSubmitting(false)
        return
      }
      entryId = ins.id
    }

    // Remember our name for future opens on this device.
    if (typeof window !== 'undefined' && entryId) {
      localStorage.setItem(`scq-entry-${race.id}`, entryId)
    }

    // Hand off to the tracker.
    router.push(`/race/tracker/${token}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <p className="opacity-70">Loading…</p>
      </div>
    )
  }
  if (error && !race) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-6 text-center">
        <p>{error}</p>
      </div>
    )
  }

  const joinable = race && ['planned', 'confirmed', 'live'].includes(race.status)

  if (showIntro) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center text-white">
          <div className="text-5xl mb-4">📱</div>
          <h1 className="text-2xl font-bold">You’re about to go racing</h1>
          <p className="text-blue-100 mt-2">Here’s how it works — takes 10 seconds.</p>
          <div className="mt-6 space-y-3 text-left">
            {[
              ['⛵', 'Enter your boat', 'Type your boat + name on the next screen.'],
              ['🛰️', 'Your phone tracks you', 'Keep it on board — it records your position through the race.'],
              ['📡', 'Works offline', 'No signal at sea? It saves your track and syncs when you’re back.'],
              ['🏁', 'Auto finish', 'Cross the line and it logs your finish time automatically.'],
            ].map(([icon, title, body]) => (
              <div key={title} className="flex items-start gap-3 bg-white/10 rounded-xl px-4 py-3">
                <span className="text-2xl">{icon}</span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-blue-100">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={dismissIntro}
            className="mt-7 w-full rounded-xl bg-white text-blue-700 font-semibold py-3 text-base hover:bg-blue-50 transition-colors"
          >
            Let’s go →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-1">⛵</div>
          <h1 className="text-xl font-bold text-gray-900">{race?.name}</h1>
          {race && <p className="text-sm text-gray-500">{formatDate(race.race_date)}</p>}
        </div>

        {!joinable ? (
          <Card padding="lg" className="text-center">
            <p className="text-gray-600">This race isn’t open for tracking yet.</p>
            <p className="text-sm text-gray-400 mt-1">Check back nearer the start, or ask the organiser.</p>
          </Card>
        ) : (
          <Card padding="lg" className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              Enter your boat to start tracking. No account needed.
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Boat name *</label>
              <Input
                value={boatName}
                onChange={(e) => setBoatName(e.target.value)}
                placeholder="e.g. Kestrel"
                list="boat-suggestions"
              />
              <datalist id="boat-suggestions">
                {suggestions.map((b) => (
                  <option key={b.id} value={b.boat_name}>
                    {b.sail_number ? `${b.sail_number} · ${b.class ?? ''}` : b.class ?? ''}
                  </option>
                ))}
              </datalist>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {suggestions.slice(0, 6).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => pickBoat(b)}
                      className="text-xs rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1"
                    >
                      {b.boat_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sail number</label>
              <Input value={sailNumber} onChange={(e) => setSailNumber(e.target.value)} placeholder="e.g. 1234" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Helm name</label>
              <Input value={helmName} onChange={(e) => setHelmName(e.target.value)} placeholder="Who’s steering?" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Crew (optional)</label>
              <Input value={crewName} onChange={(e) => setCrewName(e.target.value)} placeholder="Crew name(s)" />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button onClick={startTracking} disabled={submitting} size="lg" className="w-full">
              {submitting ? 'Starting…' : '📡 Start Tracking'}
            </Button>

            <p className="text-xs text-gray-400 text-center">
              💡 Add to your home screen for offline use at sea.
            </p>
            {!user && (
              <p className="text-xs text-gray-500 text-center">
                Racing without an account is fine — but{' '}
                <a href={`/register?race=${token}`} className="text-blue-600 underline">register</a>{' '}
                to keep detailed results &amp; history.
              </p>
            )}
          </Card>
        )}

        <p className="text-center text-xs text-gray-400">
          <Link href={`/race/centre/${token}`} className="underline">
            Race Centre
          </Link>
        </p>
      </div>
    </div>
  )
}
