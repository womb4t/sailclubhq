'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface ClubResult {
  id: string
  name: string
}

type Step = 'find-club' | 'pick-role'

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()

  const [step, setStep] = useState<Step>('find-club')
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
  const [joinedClubId, setJoinedClubId] = useState<string | null>(null)
  const [joinedClubName, setJoinedClubName] = useState('')

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

  async function handleJoin(clubId: string, clubName: string, role?: string) {
    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    const { error: err } = await supabase
      .from('profiles')
      .update({
        club_id: clubId,
        role: role ?? 'competitor',
      })
      .eq('id', user.id)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    if (!role) {
      // Go to role selection
      setJoinedClubId(clubId)
      setJoinedClubName(clubName)
      setStep('pick-role')
      setLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
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

    window.location.href = '/dashboard'
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

  async function selectRole(role: string) {
    if (!joinedClubId || !user) return

    setLoading(true)
    setError('')

    const supabase = getBrowserClient()
    const { error: err } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', user.id)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  const exactMatch = results.some(r => r.name.toLowerCase() === query.trim().toLowerCase())

  // ===== STEP 2: Pick role =====
  if (step === 'pick-role') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="text-4xl">⛵</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-3">Welcome to {joinedClubName}</h1>
            <p className="text-sm text-gray-500 mt-1">What&apos;s your role?</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => selectRole('competitor')}
              disabled={loading}
              className="w-full text-left"
            >
              <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer p-5">
                <div className="flex items-start gap-4">
                  <span className="text-2xl">🏁</span>
                  <div>
                    <h2 className="font-semibold text-gray-900">Competitor</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      I&apos;m here to race — enter races, upload tracks, view results
                    </p>
                  </div>
                </div>
              </Card>
            </button>

            <button
              onClick={() => selectRole('race_officer')}
              disabled={loading}
              className="w-full text-left"
            >
              <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer p-5">
                <div className="flex items-start gap-4">
                  <span className="text-2xl">📋</span>
                  <div>
                    <h2 className="font-semibold text-gray-900">Race Officer / OOD</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      I manage races — set courses, run starts, record results
                    </p>
                  </div>
                </div>
              </Card>
            </button>

            <button
              onClick={() => selectRole('admin')}
              disabled={loading}
              className="w-full text-left"
            >
              <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer p-5">
                <div className="flex items-start gap-4">
                  <span className="text-2xl">👑</span>
                  <div>
                    <h2 className="font-semibold text-gray-900">Club Admin</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      I manage the club — members, settings, everything
                    </p>
                  </div>
                </div>
              </Card>
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mt-4">{error}</p>
          )}
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
                    onClick={() => handleJoin(club.id, club.name)}
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
                  onClick={() => handleJoin(inviteClub.id, inviteClub.name)}
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
