'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { WaypointFooter } from '@/components/WaypointFooter'

export default function JoinClubPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const code = params.code as string

  const [club, setClub] = useState<{ id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [alreadyMember, setAlreadyMember] = useState(false)

  useEffect(() => {
    async function lookupClub() {
      const supabase = getBrowserClient()
      const { data } = await supabase
        .from('clubs')
        .select('id, name')
        .eq('invite_code', code.toLowerCase())
        .maybeSingle()

      if (data) {
        setClub(data)

        // Check if logged-in user is already a member
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('club_id')
            .eq('id', user.id)
            .maybeSingle()

          if (profile?.club_id === data.id) {
            setAlreadyMember(true)
          }
        }
      }
      setLoading(false)
    }

    if (code) lookupClub()
  }, [code, user])

  async function handleJoin() {
    if (!club || !user) return

    setError('')
    setJoining(true)

    const supabase = getBrowserClient()

    // Check if user already has a profile
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, club_id')
      .eq('id', user.id)
      .maybeSingle()

    if (existingProfile?.club_id && existingProfile.club_id !== club.id) {
      setError('You are already a member of another club. Contact your admin to switch clubs.')
      setJoining(false)
      return
    }

    if (!existingProfile) {
      // Create profile
      const { error: insertErr } = await supabase
        .from('profiles')
        .insert({ id: user.id, club_id: club.id, role: 'competitor' })

      if (insertErr) {
        setError(insertErr.message)
        setJoining(false)
        return
      }
    } else {
      // Update profile
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ club_id: club.id })
        .eq('id', user.id)

      if (updateErr) {
        setError(updateErr.message)
        setJoining(false)
        return
      }
    }

    sessionStorage.setItem('schq_onboarded', '1'); window.location.href = '/dashboard'
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center">
        <div className="text-blue-200 text-sm">Loading...</div>
      </div>
    )
  }

  if (!club) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center px-4">
        <div className="text-center">
          <span className="text-4xl">❌</span>
          <h1 className="text-2xl font-bold text-white mt-4">Invalid invite link</h1>
          <p className="text-blue-200 mt-2 text-sm">This invite code doesn&apos;t match any club.</p>
          <Link href="/" className="inline-block mt-6 text-sm text-blue-300 hover:text-white underline">
            Go to homepage
          </Link>
        </div>
      </div>
    )
  }

  if (alreadyMember) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center px-4">
        <div className="text-center">
          <span className="text-4xl">✅</span>
          <h1 className="text-2xl font-bold text-white mt-4">You&apos;re already a member</h1>
          <p className="text-blue-200 mt-2 text-sm">You&apos;re in <strong>{club.name}</strong>.</p>
          <Link href="/dashboard" className="inline-block mt-6 bg-white text-blue-900 font-semibold py-3 px-6 rounded-xl hover:bg-blue-50 transition-colors">
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-4xl">⛵</span>
          <h1 className="text-2xl font-bold text-white mt-3">Join {club.name}</h1>
          <p className="text-blue-200 mt-1 text-sm">You&apos;ve been invited to join this sailing club</p>
        </div>

        <Card className="p-6">
          {user ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-700 text-center">
                Signed in as <strong>{user.email}</strong>
              </p>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <Button onClick={handleJoin} loading={joining} className="w-full" size="lg">
                Join {club.name}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Create an account or sign in to join <strong>{club.name}</strong>.
              </p>
              <div className="flex flex-col gap-2">
                <Link href={`/register?join=${code}`}>
                  <Button className="w-full" size="lg">Create account</Button>
                </Link>
                <Link href={`/login?join=${code}`}>
                  <Button variant="secondary" className="w-full" size="lg">Sign in</Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
      <WaypointFooter tone="light" />
    </div>
  )
}
