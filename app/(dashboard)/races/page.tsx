import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { RaceCard } from '@/components/races/RaceCard'
import { Button } from '@/components/ui/Button'
import type { Race } from '@/types/database'

export default async function RacesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('id', user!.id)
    .single()

  let races: Race[] = []
  if (profile?.club_id) {
    const { data } = await supabase
      .from('races')
      .select('*')
      .eq('club_id', profile.club_id)
      .order('race_date', { ascending: false })
    races = (data as Race[]) ?? []
  }

  const activeRaces = races.filter((r) => r.status === 'active')
  const upcomingRaces = races.filter((r) => r.status === 'open' || r.status === 'draft')
  const pastRaces = races.filter((r) => r.status === 'finished')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Races</h1>
          <p className="text-sm text-gray-500 mt-0.5">{races.length} race{races.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link href="/races/new">
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
          <Link href="/races/new">
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
