'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clubName, setClubName] = useState('')
  const [vhfChannel, setVhfChannel] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!clubName.trim()) return

    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    // Create club
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

    // Link user profile to club
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ club_id: club.id, role: 'admin' })
      .eq('id', user.id)

    if (profileErr) {
      setError(profileErr.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-4xl">⛵</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Set up your club</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create your sailing club to start managing races.
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
      </div>
    </div>
  )
}
