'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { RaceCard } from '@/components/races/RaceCard'
import { Button } from '@/components/ui/Button'
import type { Race } from '@/types/database'

export default function RacesPage() {
  const [races, setRaces] = useState<Race[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profile?.club_id) {
        const { data } = await supabase
          .from('races')
          .select('*')
          .eq('club_id', profile.club_id)
          .order('race_date', { ascending: false })
        setRaces((data as Race[]) ?? [])
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  const activeRaces = races.filter((r) => r.status === 'active')
  const upcomingRaces = races.filter((r) => r.status === 'open' || r.status === 'draft')
  const pastRaces = races.filter((r) => r.status === 'finished')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Races</h1>
          <p className="text-sm text-gray-500 mt-0.5">{races.length} race{races.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link href="/dashboard/races/new">
          <Button size="sm">+ New race</Button>
        </Link>
      </div>

      {races.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏁</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">No races yet</h2>
          <p className="text-sm text-gray-400 mb-6">
            Create your first race to get started.
          </p>
          <Link href="/dashboard/races/new">
            <Button>Create first race</Button>
          </Link>
        </div>
      ) : (
        <>
          {activeRaces.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">🟢 Racing now</h2>
              <div className="space-y-2">
                {activeRaces.map((r) => <RaceCard key={r.id} race={r} />)}
              </div>
            </section>
          )}

          {upcomingRaces.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">📅 Upcoming</h2>
              <div className="space-y-2">
                {upcomingRaces.map((r) => <RaceCard key={r.id} race={r} />)}
              </div>
            </section>
          )}

          {pastRaces.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">✅ Finished</h2>
              <div className="space-y-2">
                {pastRaces.map((r) => <RaceCard key={r.id} race={r} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
