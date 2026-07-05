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

type Step = 'choose' | 'welcome' | 'find-club'
type Intent = 'competitor' | 'admin'

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()

  const [step, setStep] = useState<Step>('choose')
  const [intent, setIntent] = useState<Intent>('competitor')
  const [hasBoat, setHasBoat] = useState(false)
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

  // Does the user already own a boat? (drives the 'add your boat' bullet)
  useEffect(() => {
    if (!user) return
    ;(async () => {
      const supabase = getBrowserClient()
      const { count } = await supabase
        .from('boats')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id)
      setHasBoat((count ?? 0) > 0)
    })()
  }, [user])

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

  // ===== STEP 0: Choose how you'll use it (competitor vs race admin) =====
  if (step === 'choose') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-slate-900 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md text-center text-white">
          <div className="flex items-center justify-center mb-4">
            <WaypointMark className="h-14 w-14 text-white" />
          </div>
          <h1 className="text-3xl font-bold">Welcome to Waypoint Racing</h1>
          <p className="text-blue-100 mt-3">How will you use it?</p>

          <div className="mt-8 space-y-3">
            <button
              onClick={() => { setIntent('competitor'); setStep('welcome') }}
              className="w-full text-left rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-5 py-4 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">🏁</span>
                <div>
                  <p className="font-semibold">I want to race</p>
                  <p className="text-sm text-blue-100">Join your club, enter races and sail with your phone as the instrument.</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => { setIntent('admin'); setStep('welcome') }}
              className="w-full text-left rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-5 py-4 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎛️</span>
                <div>
                  <p className="font-semibold">I run racing for my club</p>
                  <p className="text-sm text-blue-100">Set up your club, build courses and run races as an admin.</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== STEP 1: Role-aware welcome. Full 'what this does' tutorial is the
  // separate IntroTour dashboard overlay shown until hidden. =====
  if (step === 'welcome') {
    const competitorBullets: [string, string, string][] = [
      ['🏁', 'Join your club', 'Find your club and you’re in — everything’s organised around it.'],
      ...(!hasBoat ? [['⛵', 'Add your boat', 'So your results and tracks are yours.'] as [string, string, string]] : []),
      ['📱', 'Enter & race', 'Enter in advance, then live nav, offline tracking and an auto-timed finish.'],
    ]
    const adminBullets: [string, string, string][] = [
      ['🎢', 'Create your club', 'You’ll be the club admin — invite members and race officers.'],
      ['📍', 'Marks & courses', 'Save your marks once, then build courses in seconds.'],
      ['🏁', 'Run races', 'Start sequence, live standings, results — and you can race too.'],
    ]
    const bullets = intent === 'admin' ? adminBullets : competitorBullets
    const heading = intent === 'admin' ? 'Set up racing for your club' : 'Get racing'
    const cta = intent === 'admin' ? 'Create my club →' : 'Find my club →'

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-slate-900 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md text-center text-white">
          <div className="flex items-center justify-center mb-4">
            <WaypointMark className="h-14 w-14 text-white" />
          </div>
          <h1 className="text-3xl font-bold">{heading}</h1>
          <p className="text-blue-100 mt-3">
            {intent === 'admin'
              ? 'A few steps and your club is racing.'
              : 'A couple of steps and you’re on the water.'}
          </p>

          <div className="mt-8 space-y-3 text-left">
            {bullets.map(([icon, title, body]) => (
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
            onClick={() => setStep('find-club')}
            className="mt-8 w-full rounded-xl bg-white text-blue-700 font-semibold py-3 text-base hover:bg-blue-50 transition-colors"
          >
            {cta}
          </button>
          <button
            onClick={() => setStep('choose')}
            className="mt-3 text-sm text-white/60 hover:text-white transition-colors"
          >
            ← Back
          </button>
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
          <h1 className="text-2xl font-bold text-gray-900 mt-3">
            {intent === 'admin' ? 'Create your sailing club' : 'Find your sailing club'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {intent === 'admin'
              ? 'Type your club name — if it doesn’t exist yet, create it.'
              : 'Start typing your club name to search, or use an invite code below.'}
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
