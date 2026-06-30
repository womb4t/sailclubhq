'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'

type Mode = 'choose' | 'create' | 'join'

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [mode, setMode] = useState<Mode>('choose')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Create club
  const [clubName, setClubName] = useState('')
  const [vhfChannel, setVhfChannel] = useState('')

  // Join club
  const [inviteCode, setInviteCode] = useState('')
  const [foundClub, setFoundClub] = useState<{ id: string; name: string } | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!clubName.trim()) return

    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    const { data: club, error: clubErr } = await supabase
      .from('clubs')
      .insert({
        name: clubName.trim(),
        vhf_channel: vhfChannel.trim() || null,
      })
      .select()
      .single()

    if (clubErr) {
      setError(clubErr.message)
      setLoading(false)
      return
    }

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

  async function lookupClub() {
    if (!inviteCode.trim()) return

    setError('')
    setFoundClub(null)

    const supabase = getBrowserClient()
    const { data: club, error: err } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('invite_code', inviteCode.trim().toLowerCase())
      .maybeSingle()

    if (err || !club) {
      setError('No club found with that invite code. Check with your club admin.')
      return
    }

    setFoundClub(club)
  }

  async function handleJoin() {
    if (!foundClub) return

    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ club_id: foundClub.id, role: 'competitor' })
      .eq('id', user.id)

    if (profileErr) {
      setError(profileErr.message)
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  if (mode === 'choose') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="text-4xl">⛵</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-3">Welcome to Sail Club HQ</h1>
            <p className="text-sm text-gray-500 mt-1">How would you like to get started?</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full text-left"
            >
              <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start gap-4">
                  <span className="text-2xl">🏗️</span>
                  <div>
                    <h2 className="font-semibold text-gray-900">Create a new club</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Set up your sailing club and invite members
                    </p>
                  </div>
                </div>
              </Card>
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full text-left"
            >
              <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start gap-4">
                  <span className="text-2xl">🔗</span>
                  <div>
                    <h2 className="font-semibold text-gray-900">Join an existing club</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Enter your club&apos;s invite code to join
                    </p>
                  </div>
                </div>
              </Card>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'join') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="text-4xl">🔗</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-3">Join your club</h1>
            <p className="text-sm text-gray-500 mt-1">
              Enter the invite code from your club admin
            </p>
          </div>

          <Card>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  label="Invite code"
                  value={inviteCode}
                  onChange={(e) => { setInviteCode(e.target.value); setFoundClub(null); setError('') }}
                  placeholder="abc123def456"
                  className="flex-1"
                />
                <div className="flex items-end">
                  <Button type="button" variant="secondary" onClick={lookupClub} size="sm">
                    Look up
                  </Button>
                </div>
              </div>

              {foundClub && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-800">
                    ✅ Found: <strong>{foundClub.name}</strong>
                  </p>
                  <Button
                    type="button"
                    onClick={handleJoin}
                    loading={loading}
                    className="w-full mt-3"
                    size="lg"
                  >
                    Join {foundClub.name}
                  </Button>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
              )}
            </div>
          </Card>

          <button
            onClick={() => { setMode('choose'); setError(''); setFoundClub(null) }}
            className="w-full text-center text-sm text-gray-500 mt-4 hover:text-gray-700"
          >
            ← Back
          </button>
        </div>
      </div>
    )
  }

  // mode === 'create'
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-4xl">🏗️</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Create your club</h1>
          <p className="text-sm text-gray-500 mt-1">
            Set up your sailing club to start managing races
          </p>
        </div>

        <form onSubmit={handleCreate}>
          <Card>
            <CardHeader>
              <CardTitle>Club details</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              <Input
                label="Club name"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="Chiddingstone Sailing Club"
                required
              />
              <Input
                label="Default VHF channel"
                value={vhfChannel}
                onChange={(e) => setVhfChannel(e.target.value)}
                placeholder="M2"
                hint="Optional — pre-fills on new races"
              />
            </div>
          </Card>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mt-4">{error}</p>
          )}

          <Button type="submit" loading={loading} className="w-full mt-4" size="lg">
            Create club
          </Button>
        </form>

        <button
          onClick={() => { setMode('choose'); setError('') }}
          className="w-full text-center text-sm text-gray-500 mt-4 hover:text-gray-700"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}
