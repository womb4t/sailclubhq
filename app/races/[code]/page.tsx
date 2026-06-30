import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import type { Metadata } from 'next'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type BadgeVariant = 'info' | 'success' | 'warning'

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  planned: 'info',
  confirmed: 'success',
  completed: 'warning',
}

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planned',
  confirmed: 'Confirmed',
  completed: 'Completed',
}

const BADGE_CLASSES: Record<BadgeVariant, string> = {
  info: 'bg-blue-100 text-blue-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function extractStartTime(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/Start time: (\d{2}:\d{2})/)
  return match ? match[1] : null
}

interface Race {
  id: string
  name: string
  race_number: number | null
  series: string | null
  race_date: string
  notes: string | null
  status: string
  entry_token: string
}

interface PageProps {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const supabase = getSupabase()
  const { data: club } = await supabase
    .from('clubs')
    .select('name')
    .eq('invite_code', code.toLowerCase())
    .maybeSingle()

  return {
    title: club ? `${club.name} Race Calendar` : 'Race Calendar',
  }
}

export default async function PublicRaceCalendarPage({ params }: PageProps) {
  const { code } = await params
  const supabase = getSupabase()

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name')
    .eq('invite_code', code.toLowerCase())
    .maybeSingle()

  if (!club) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-5xl mb-4">⚓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Club not found</h1>
          <p className="text-gray-500">That invite code doesn&apos;t match any club.</p>
        </div>
      </div>
    )
  }

  const { data: races } = await supabase
    .from('races')
    .select('id, name, race_number, series, race_date, notes, status, entry_token')
    .eq('club_id', club.id)
    .in('status', ['planned', 'confirmed', 'completed'])
    .order('race_date', { ascending: false })

  const allRaces = (races ?? []) as Race[]
  const today = new Date().toISOString().split('T')[0]

  const upcoming = allRaces.filter(
    (r) => (r.status === 'planned' || r.status === 'confirmed') && r.race_date >= today
  ).reverse() // ascending for upcoming

  const active = allRaces.filter(
    (r) => (r.status === 'planned' || r.status === 'confirmed') && r.race_date < today
  )

  const past = allRaces.filter((r) => r.status === 'completed')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⛵</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{club.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">Race Calendar</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-0">
        <Link href={`/club/${code}`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
          ← Back to club
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {allRaces.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🏁</div>
            <p className="text-gray-500">No races scheduled yet.</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Upcoming</h2>
                <div className="space-y-3">
                  {upcoming.map((race) => (
                    <RaceCard key={race.id} race={race} />
                  ))}
                </div>
              </section>
            )}

            {active.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">In Progress</h2>
                <div className="space-y-3">
                  {active.map((race) => (
                    <RaceCard key={race.id} race={race} />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Past Races</h2>
                <div className="space-y-3">
                  {past.map((race) => (
                    <RaceCard key={race.id} race={race} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function RaceCard({ race }: { race: Race }) {
  const startTime = extractStartTime(race.notes)
  const variant = STATUS_VARIANT[race.status] ?? 'info'
  const canEnter = race.status === 'planned' || race.status === 'confirmed'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{race.name}</span>
            {race.race_number && (
              <span className="text-xs text-gray-400">#{race.race_number}</span>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[variant]}`}
            >
              {STATUS_LABEL[race.status] ?? race.status}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {formatDate(race.race_date)}
            {startTime && <span className="text-gray-400 ml-1.5">· Start {startTime}</span>}
          </p>
          {race.series && (
            <p className="text-xs text-gray-400 mt-0.5">{race.series}</p>
          )}
        </div>
        {canEnter && (
          <Link
            href={`/race/join/${race.entry_token}`}
            className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 transition-colors"
          >
            Enter ↗
          </Link>
        )}
      </div>
    </div>
  )
}
