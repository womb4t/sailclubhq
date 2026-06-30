import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { Race } from '@/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile — may be null for brand new users
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, clubs(*)')
    .eq('id', user!.id)
    .maybeSingle()

  // Fetch recent races
  const { data: recentRaces } = await supabase
    .from('races')
    .select('*')
    .order('race_date', { ascending: false })
    .limit(3) as { data: Race[] | null }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Morning, {firstName} 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          {profile?.clubs ? (profile.clubs as { name: string }).name : 'No club linked yet'}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/races/new">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">🏁</div>
            <div className="text-sm font-medium text-gray-700">New race</div>
          </Card>
        </Link>
        <Link href="/marks">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">📍</div>
            <div className="text-sm font-medium text-gray-700">Marks</div>
          </Card>
        </Link>
        <Link href="/courses">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">🗺️</div>
            <div className="text-sm font-medium text-gray-700">Courses</div>
          </Card>
        </Link>
        <Link href="/races">
          <Card className="text-center py-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
            <div className="text-2xl mb-1">📋</div>
            <div className="text-sm font-medium text-gray-700">All races</div>
          </Card>
        </Link>
      </div>

      {/* Recent races */}
      {recentRaces && recentRaces.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent races</h2>
            <Link href="/races" className="text-xs text-blue-600 hover:underline">View all</Link>
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
                    race.status === 'active' ? 'bg-green-100 text-green-800' :
                    race.status === 'open' ? 'bg-blue-100 text-blue-800' :
                    race.status === 'finished' ? 'bg-gray-100 text-gray-600' :
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

      {(!recentRaces || recentRaces.length === 0) && (
        <Card className="text-center py-10">
          <p className="text-gray-400 text-sm mb-4">No races yet. Ready to run your first one?</p>
          <Link href="/races/new">
            <Button>Create your first race</Button>
          </Link>
        </Card>
      )}
    </div>
  )
}
