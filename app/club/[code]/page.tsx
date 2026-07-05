'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/Button'
import { WaypointFooter } from '@/components/WaypointFooter'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Club {
  id: string
  name: string
  invite_code: string
}

interface Race {
  id: string
  name: string
  race_date: string
  series: string | null
  status: string
  notes: string | null
  entry_token: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function extractStartTime(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/Start time: (\d{2}:\d{2})/)
  return match ? match[1] : null
}

type BadgeVariant = 'blue' | 'green' | 'amber'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  planned: 'blue',
  confirmed: 'green',
  completed: 'amber',
}

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planned',
  confirmed: 'Confirmed',
  completed: 'Completed',
}

const BADGE_CLASSES: Record<BadgeVariant, string> = {
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_BADGE[status] ?? 'blue'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[variant]}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function UpcomingRaceCard({ race, clubCode, isLoggedIn, entryCount }: { race: Race; clubCode: string; isLoggedIn: boolean; entryCount?: number }) {
  const startTime = extractStartTime(race.notes)
  const enterHref = isLoggedIn
    ? `/race/join/${race.entry_token}`
    : `/login?join=${clubCode}&race=${race.entry_token}`
  const buttonLabel = isLoggedIn ? 'Enter Race ↗' : 'Sign in to Enter'
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900">{race.name}</span>
            <StatusBadge status={race.status} />
            {race.series && (
              <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
                {race.series}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">
            {formatDate(race.race_date)}
            {startTime && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">🏁 Start: {startTime}</span>
            )}
          </p>
          {entryCount !== undefined && entryCount > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">⛵ {entryCount} {entryCount === 1 ? 'entry' : 'entries'}</p>
          )}
        </div>
        <Link
          href={enterHref}
          className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium px-4 py-2.5 transition-colors min-w-[110px] justify-center"
        >
          {buttonLabel}
        </Link>
      </div>
    </div>
  )
}

function ResultCard({ race }: { race: Race }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="font-medium text-gray-900">{race.name}</span>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(race.race_date)}</p>
        </div>
        <StatusBadge status="completed" />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClubHomePage() {
  const params = useParams()
  const code = (params.code as string).toLowerCase()

  const [club, setClub] = useState<Club | null>(null)
  const [upcoming, setUpcoming] = useState<Race[]>([])
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({})
  const [results, setResults] = useState<Race[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [isMember, setIsMember] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = getBrowserClient()

      // 1. Fetch club
      const { data: clubData } = await supabase
        .from('clubs')
        .select('id, name, invite_code')
        .eq('invite_code', code)
        .maybeSingle()

      if (!clubData) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setClub(clubData as Club)

      // 2. Check auth + membership
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setIsLoggedIn(true)
        const { data: profile } = await supabase
          .from('profiles')
          .select('club_id')
          .eq('id', session.user.id)
          .maybeSingle()
        if (profile?.club_id === clubData.id) {
          setIsMember(true)
        }
      }

      // 3. Fetch races
      const today = new Date().toISOString().split('T')[0]

      const { data: upcomingRaces } = await supabase
        .from('races')
        .select('id, name, race_date, series, status, notes, entry_token')
        .eq('club_id', clubData.id)
        .in('status', ['planned', 'confirmed'])
        .gte('race_date', today)
        .order('race_date', { ascending: true })
        .limit(5)

      const { data: completedRaces } = await supabase
        .from('races')
        .select('id, name, race_date, series, status, notes, entry_token')
        .eq('club_id', clubData.id)
        .eq('status', 'completed')
        .order('race_date', { ascending: false })
        .limit(3)

      setUpcoming((upcomingRaces ?? []) as Race[])
      setResults((completedRaces ?? []) as Race[])

      // Entry counts for upcoming races (excludes withdrawn)
      const upcomingIds = (upcomingRaces ?? []).map((r) => r.id)
      if (upcomingIds.length > 0) {
        const { data: entryRows } = await supabase
          .from('race_entries')
          .select('race_id')
          .in('race_id', upcomingIds)
          .neq('status', 'withdrawn')
        if (entryRows) {
          const counts: Record<string, number> = {}
          for (const row of entryRows as { race_id: string }[]) {
            counts[row.race_id] = (counts[row.race_id] ?? 0) + 1
          }
          setEntryCounts(counts)
        }
      }

      setLoading(false)
    }

    load()
  }, [code])

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  // ── Not found ──────────────────────────────────────────────────────────────

  if (notFound || !club) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⚓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Club not found</h1>
          <p className="text-gray-500 mb-6">That invite code doesn&apos;t match any club.</p>
          <Link href="/">
            <Button variant="secondary" size="sm">Go to homepage</Button>
          </Link>
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex flex-col items-center text-center gap-3">
            {/* Club name hero */}
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
              {club.name}
            </h1>
            {/* Subtle branding */}
            <p className="text-sm text-gray-400">⛵ Waypoint Racing</p>

            {/* CTA buttons */}
            <div className="flex gap-3 mt-2 flex-wrap justify-center">
              {isMember ? (
                <Link href="/dashboard">
                  <Button size="md">Go to Dashboard →</Button>
                </Link>
              ) : (
                <>
                  <Link href={`/login?join=${code}`}>
                    <Button variant="secondary" size="md">Sign In</Button>
                  </Link>
                  <Link href={`/register?join=${code}`}>
                    <Button size="md">Register</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">

        {/* ── Upcoming Races ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Races</h2>
            <Link
              href={`/races/${code}`}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all races →
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <div className="text-3xl mb-2">🏁</div>
              <p className="text-gray-500 text-sm">No upcoming races scheduled.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((race) => (
                <UpcomingRaceCard key={race.id} race={race} clubCode={code} isLoggedIn={isLoggedIn} entryCount={entryCounts[race.id]} />
              ))}
            </div>
          )}
        </section>

        {/* ── Recent Results ─────────────────────────────────────────────── */}
        {results.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Results</h2>
              <Link
                href={`/races/${code}`}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View all →
              </Link>
            </div>
            <div className="space-y-3">
              {results.map((race) => (
                <ResultCard key={race.id} race={race} />
              ))}
            </div>
          </section>
        )}

        {/* ── Club Info / Join Footer ─────────────────────────────────────── */}
        <section>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
            <p className="text-base font-medium text-gray-800 mb-1">
              Want to join {club.name}?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Create a free account — you&apos;ll be added to this club automatically.
            </p>
            <Link href={`/register?join=${code}`}>
              <Button size="lg" className="w-full sm:w-auto">
                Join the Club
              </Button>
            </Link>
            <p className="text-xs text-gray-400 mt-3">
              Invite code: <span className="font-mono font-medium text-gray-600">{code}</span>
            </p>
          </div>
        </section>

      </div>
      <WaypointFooter tone="light" />
    </div>
  )
}
