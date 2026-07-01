import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  // Allow framing — Next.js App Router handles X-Frame-Options via next.config
  title: 'Race Calendar',
  robots: 'noindex',
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
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

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planned',
  confirmed: 'Confirmed',
  completed: 'Completed',
}

const STATUS_CLASSES: Record<string, string> = {
  planned: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  completed: 'bg-amber-100 text-amber-800',
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

export default async function EmbedRaceCalendarPage({ params }: PageProps) {
  const { code } = await params
  const supabase = getSupabase()

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name')
    .eq('invite_code', code.toLowerCase())
    .maybeSingle()

  if (!club) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">Club not found.</div>
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
  ).reverse()

  const active = allRaces.filter(
    (r) => (r.status === 'planned' || r.status === 'confirmed') && r.race_date < today
  )

  const past = allRaces.filter((r) => r.status === 'completed')

  return (
    <div className="bg-white font-sans text-sm">
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide">{club.name} — Race Calendar</p>
      </div>

      {allRaces.length === 0 ? (
        <p className="p-4 text-gray-400 text-center text-xs">No races scheduled.</p>
      ) : (
        <div>
          {upcoming.length > 0 && (
            <EmbedSection label="Upcoming" races={upcoming} />
          )}
          {active.length > 0 && (
            <EmbedSection label="In Progress" races={active} />
          )}
          {past.length > 0 && (
            <EmbedSection label="Past" races={past} />
          )}
        </div>
      )}
    </div>
  )
}

function EmbedSection({ label, races }: { label: string; races: Race[] }) {
  return (
    <div>
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      {races.map((race) => {
        const startTime = extractStartTime(race.notes)
        const canEnter = race.status === 'planned' || race.status === 'confirmed'
        return (
          <div key={race.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-gray-900 text-sm">{race.name}</span>
                {race.race_number && <span className="text-xs text-gray-400">#{race.race_number}</span>}
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[race.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[race.status] ?? race.status}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {formatDate(race.race_date)}
                {startTime && <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">⏰ {startTime}</span>}
                {race.series && <span className="text-gray-400 ml-1">· {race.series}</span>}
              </div>
            </div>
            {canEnter && (
              <Link
                href={`/race/join/${race.entry_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 flex-shrink-0 inline-flex items-center rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2 py-1 transition-colors"
              >
                Enter
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}
