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

const statusStyle: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800',
  planned: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-50 text-gray-400',
}

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  planned: 'Planned',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  archived: 'Archived',
}

function extractStartTime(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/^Start time: (\d{2}:\d{2})/)
  return match ? match[1] : null
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<ProfileWithClub | null>(null)
  const [races, setRaces] = useState<Race[]>([])
  const [loading, setLoading] = useState(true)
  const [seriesFilter, setSeriesFilter] = useState<string>('all')

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
          .order('race_date', { ascending: true }),
      ])

      setProfile(profileData as ProfileWithClub | null)
      setRaces((racesData as Race[]) ?? [])
      setLoading(false)
    }

    fetchData()
  }, [user])

  const firstName = profile?.full_name?.split(' ')[0] ?? user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  // Get unique series for filter
  const allSeries = Array.from(new Set(races.filter(r => r.series).map(r => r.series!))).sort()

  // Filter by series
  const filteredRaces = seriesFilter === 'all'
    ? races
    : races.filter(r => r.series === seriesFilter)

  // Split into upcoming and past
  const today = new Date().toISOString().split('T')[0]
  const upcomingRaces = filteredRaces
    .filter(r => r.race_date >= today && r.status !== 'completed' && r.status !== 'cancelled' && r.status !== 'archived')
    .sort((a, b) => a.race_date.localeCompare(b.race_date))
  const pastRaces = filteredRaces
    .filter(r => r.race_date < today || r.status === 'completed' || r.status === 'cancelled' || r.status === 'archived')
    .sort((a, b) => b.race_date.localeCompare(a.race_date))
    .slice(0, 5)

  // Time-aware greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'

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
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {firstName} 👋</h1>
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
        <Link href="/dashboard/profile">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">👤</div>
            <div className="text-sm font-medium text-gray-700">Profile</div>
          </Card>
        </Link>
        <Link href="/dashboard/boats">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">⛵</div>
            <div className="text-sm font-medium text-gray-700">My Boats</div>
          </Card>
        </Link>
      </div>

      {/* Series filter */}
      {allSeries.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSeriesFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              seriesFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Series
          </button>
          {allSeries.map(s => (
            <button
              key={s}
              onClick={() => setSeriesFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                seriesFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Upcoming races */}
      {upcomingRaces.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">📅 Upcoming</h2>
            <span className="text-xs text-gray-400">{upcomingRaces.length} race{upcomingRaces.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2">
            {upcomingRaces.map((race) => {
              const startTime = extractStartTime(race.notes)
              const raceDate = new Date(race.race_date + 'T00:00:00')
              const dayName = raceDate.toLocaleDateString('en-GB', { weekday: 'short' })
              const dateStr = raceDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

              return (
                <Link key={race.id} href={`/dashboard/races/${race.id}`}>
                  <Card className="hover:border-blue-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-center shrink-0 w-12">
                          <div className="text-[10px] text-gray-400 uppercase">{dayName}</div>
                          <div className="text-sm font-bold text-gray-900">{dateStr}</div>
                          {startTime && <div className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded mt-0.5">⏰ {startTime}</div>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{race.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {race.series && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{race.series}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusStyle[race.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusLabel[race.status] ?? race.status}
                      </span>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Past races */}
      {pastRaces.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">🏁 Recent results</h2>
            <Link href="/dashboard/races" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {pastRaces.map((race) => {
              const raceDate = new Date(race.race_date + 'T00:00:00')
              const dateStr = raceDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

              return (
                <Link key={race.id} href={`/dashboard/races/${race.id}`}>
                  <Card className="hover:border-gray-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{race.name}</p>
                        <p className="text-xs text-gray-400">{dateStr}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusStyle[race.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusLabel[race.status] ?? race.status}
                      </span>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {races.length === 0 && !loading && (
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
