'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { Race, Profile, Club } from '@/types/database'

interface ProfileWithClub extends Profile {
  clubs: Club | null
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<ProfileWithClub | null>(null)
  const [recentRaces, setRecentRaces] = useState<Race[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    async function fetchData() {
      const supabase = getBrowserClient()

      const [{ data: profileData }, { data: racesData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('*, clubs(*)')
          .eq('id', user!.id)
          .maybeSingle(),
        supabase
          .from('races')
          .select('*')
          .order('race_date', { ascending: false })
          .limit(3),
      ])

      setProfile(profileData as ProfileWithClub | null)
      setRecentRaces((racesData as Race[]) ?? [])
      setLoading(false)
    }

    fetchData()
  }, [user])

  const firstName = profile?.full_name?.split(' ')[0] ?? user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  if (loading && user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Morning, {firstName} 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          {profile?.clubs ? (profile.clubs as Club).name : 'No club linked yet'}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/dashboard/races/new">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">🏁</div>
            <div className="text-sm font-medium text-gray-700">New race</div>
          </Card>
        </Link>
        <Link href="/dashboard/marks">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">📍</div>
            <div className="text-sm font-medium text-gray-700">Marks</div>
          </Card>
        </Link>
        <Link href="/dashboard/courses">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">🗺️</div>
            <div className="text-sm font-medium text-gray-700">Courses</div>
          </Card>
        </Link>
        <Link href="/dashboard/races">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">📋</div>
            <div className="text-sm font-medium text-gray-700">All races</div>
          </Card>
        </Link>
      </div>

      {/* Recent races */}
      {recentRaces.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent races</h2>
            <Link href="/dashboard/races" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {recentRaces.map((race) => (
              <Link key={race.id} href={`/races/${race.id}`}>
                <Card className="flex items-center justify-between hover:border-blue-300 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{race.name}</p>
                    <p className="text-xs text-gray-500">{new Date(race.race_date).toLocaleDateString('en-GB')}</p>
                  </div>
                  <span className={[
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    race.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                    race.status === 'planned' ? 'bg-blue-100 text-blue-800' :
                    race.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                    race.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                    race.status === 'archived' ? 'bg-gray-50 text-gray-400' :
                    'bg-amber-100 text-amber-800'
                  ].join(' ')}>
                    {race.status}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentRaces.length === 0 && !loading && (
        <Card className="text-center py-10">
          <p className="text-gray-400 text-sm mb-4">No races yet. Ready to run your first one?</p>
          <Link href="/dashboard/races/new">
            <Button>Create your first race</Button>
          </Link>
        </Card>
      )}
    </div>
  )
}
