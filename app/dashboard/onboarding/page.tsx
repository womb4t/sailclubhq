'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { WaypointMark } from '@/components/WaypointMark'

interface ClubResult {
  id: string
  name: string
}

type Step = 'welcome' | 'find-club'

// Intro/tutorial slides shown to every new user before club selection.
const TOUR_SLIDES: { icon: string; title: string; body: string }[] = [
  {
    icon: '🗺️',
    title: 'Waypoint Racing, in a nutshell',
    body: 'A live GPS race platform for your sailing club. Set courses from marks, run the start sequence, race with your phone as the instrument, and get automatic results — no stopwatch, no paperwork.',
  },
  {
    icon: '📍',
    title: 'Marks & courses',
    body: 'Save your club’s marks once (real buoys or virtual GPS points). Then build a course in seconds — tap marks in order, set rounding side and laps. Windward-leeward, triangles, sausages, all of it.',
  },
  {
    icon: '⏱️',
    title: 'A proper start sequence',
    body: 'The OOD runs a synced countdown with warning, prep and start signals — beeps and all. Cross early and it flags you OCS, so everyone starts fair.',
  },
  {
    icon: '🧭',
    title: 'Your phone is the nav',
    body: 'Live map with your position, heading and trail. A clear header shows Bearing To Mark, speed, distance and time to go. It tells you the moment you’ve reached a mark so you can turn for the next — and it works offline.',
  },
  {
    icon: '🏁',
    title: 'Finish & results',
    body: 'Sail through the finish line and you’re timed automatically. Results build themselves into a live table — your club, and spectators ashore, can follow the whole fleet in real time.',
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()

  const [step, setStep] = useState<Step>('welcome')
  const [slide, setSlide] = useState(0)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClubResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [vhfChannel, setVhfChannel] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteClub, setInviteClub] = useState<ClubResult | null>(null)
  const [inviteError, setInviteError] = useState('')

  // After joining/creating, we land here to pick role


  // Debounced search
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setSearched(false)
      setShowCreate(false)
      return
    }

    setSearching(true)
    setError('')

    const supabase = getBrowserClient()
    const { data, error: err } = await supabase
      .from('clubs')
      .select('id, name')
      .ilike('name', `%${q.trim()}%`)
      .limit(5)

    if (err) {
      setError(err.message)
    } else {
      setResults(data ?? [])
    }
    setSearching(false)
    setSearched(true)
    setShowCreate(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300)
    return () => clearTimeout(timer)
  }, [query, search])

  async function handleJoin(clubId: string) {
    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    // Joiners are always members (admin is only the club creator; OOD is per-race).
    const { error: err } = await supabase
      .from('profiles')
      .update({
        club_id: clubId,
        role: 'member',
      })
      .eq('id', user.id)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    sessionStorage.setItem('schq_onboarded', '1')
    window.location.href = '/dashboard'
  }

  async function handleCreate() {
    if (!query.trim()) return

    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    const { data: club, error: clubErr } = await supabase
      .from('clubs')
      .insert({
        name: query.trim(),
        vhf_channel: vhfChannel.trim() || null,
      })
      .select()
      .single()

    if (clubErr) {
      if (clubErr.message.includes('unique') || clubErr.message.includes('duplicate')) {
        setError('A club with that name already exists — try searching for it above.')
      } else {
        setError(clubErr.message)
      }
      setLoading(false)
      return
    }

    // Creator gets admin role directly
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ club_id: club.id, role: 'admin' })
      .eq('id', user.id)

    if (profileErr) {
      setError(profileErr.message)
      setLoading(false)
      return
    }

    sessionStorage.setItem('schq_onboarded', '1'); window.location.href = '/dashboard'
  }

  async function lookupInvite() {
    if (!inviteCode.trim()) return

    setInviteError('')
    setInviteClub(null)

    const supabase = getBrowserClient()
    const { data, error: err } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('invite_code', inviteCode.trim().toLowerCase())
      .maybeSingle()

    if (err || !data) {
      setInviteError('No club found with that code.')
      return
    }

    setInviteClub(data)
  }

  const exactMatch = results.some(r => r.name.toLowerCase() === query.trim().toLowerCase())

  // ===== STEP 0: Welcome / tutorial =====
  if (step === 'welcome') {
    const s = TOUR_SLIDES[slide]
    const isFirst = slide === 0
    const isLast = slide === TOUR_SLIDES.length - 1
    const next = () => (isLast ? setStep('find-club') : setSlide((n) => n + 1))
    const back = () => setSlide((n) => Math.max(0, n - 1))

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-slate-900 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md text-center text-white flex flex-col" style={{ minHeight: 520 }}>
          <div className="flex items-center justify-center gap-2 mb-6">
            <WaypointMark className="h-7 w-7 text-white" />
            <span className="font-bold tracking-wide">WAYPOINT RACING</span>
          </div>

          {/* Slide */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-6xl mb-5">{s.icon}</div>
            <h1 className="text-2xl font-bold">{s.title}</h1>
            <p className="text-blue-100 mt-3 text-base leading-relaxed max-w-sm">{s.body}</p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {TOUR_SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${i === slide ? 'w-6 bg-white' : 'w-2 bg-white/30'}`}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="mt-6 flex items-center gap-3">
            {!isFirst ? (
              <button
                onClick={back}
                className="rounded-xl border border-white/30 text-white/90 font-medium py-3 px-5 hover:bg-white/10 transition-colors"
              >
                Back
              </button>
            ) : (
              <button
                onClick={() => setStep('find-club')}
                className="rounded-xl text-white/70 font-medium py-3 px-4 hover:text-white transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={next}
              className="flex-1 rounded-xl bg-white text-blue-700 font-semibold py-3 text-base hover:bg-blue-50 transition-colors"
            >
              {isLast ? 'Get started →' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== STEP 1: Find / create club =====
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-4xl">⛵</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Join or create your sailing club</h1>
          <p className="text-sm text-gray-500 mt-1">
            Start typing your club name to search
          </p>
        </div>

        <Card className="p-5">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Club name</label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Medway Yacht Club"
                autoFocus
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searching && (
                <p className="text-xs text-gray-400 mt-1">Searching...</p>
              )}
            </div>

            {/* Search results */}
            {searched && results.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Existing clubs</p>
                {results.map((club) => (
                  <button
                    key={club.id}
                    onClick={() => handleJoin(club.id)}
                    disabled={loading}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{club.name}</p>
                      <p className="text-xs text-gray-400">Tap to join</p>
                    </div>
                    <span className="text-blue-600 text-sm font-medium">Join →</span>
                  </button>
                ))}
              </div>
            )}

            {/* Create new option */}
            {searched && query.trim().length >= 2 && !exactMatch && (
              <div className="border-t border-gray-100 pt-3">
                {!showCreate ? (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg border border-dashed border-gray-300 hover:border-blue-300 hover:bg-blue-50 transition-all"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Create &ldquo;{query.trim()}&rdquo;
                      </p>
                      <p className="text-xs text-gray-400">
                        {results.length === 0 ? 'No clubs found — create yours' : 'Not listed? Create a new club'}
                      </p>
                    </div>
                    <span className="text-green-600 text-sm font-medium">+ New</span>
                  </button>
                ) : (
                  <div className="space-y-3 bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-green-800">
                      Create &ldquo;{query.trim()}&rdquo;
                    </p>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Default VHF channel (optional)</label>
                      <input
                        type="text"
                        value={vhfChannel}
                        onChange={(e) => setVhfChannel(e.target.value)}
                        placeholder="M2"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <Button
                      onClick={handleCreate}
                      loading={loading}
                      className="w-full"
                      size="lg"
                    >
                      Create club
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!searched && query.trim().length > 0 && query.trim().length < 2 && (
              <p className="text-xs text-gray-400 text-center">Keep typing to search...</p>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
            )}
          </div>
        </Card>

        {/* Invite code section */}
        <Card className="p-4 mt-4">
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Have an invite code?</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => { setInviteCode(e.target.value); setInviteClub(null); setInviteError('') }}
                placeholder="Paste code here"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={lookupInvite}
                disabled={!inviteCode.trim() || loading}
              >
                Look up
              </Button>
            </div>
            {inviteError && (
              <p className="text-xs text-red-600">{inviteError}</p>
            )}
            {inviteClub && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-800">✅ {inviteClub.name}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleJoin(inviteClub.id)}
                  loading={loading}
                >
                  Join
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
