'use client'

// Race results table — persistent finishing order for a race.
//
// Public (no login). Shows final results once boats finish (position, boat,
// helm, elapsed time, finish time), plus any still-racing boats ranked by
// progress. Uses the same standings engine as the live viewer, but framed as a
// results table. This is the "...that then goes into a results table" piece.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useFleetPositions } from '@/lib/useFleetPositions'
import { computeStandings, formatElapsed } from '@/lib/race-standings'
import { WaypointFooter } from '@/components/WaypointFooter'

interface RaceInfo {
  id: string
  name: string
  status: string
  race_date: string
  course_template_id: string | null
}

interface MarkPt { lat: number; lon: number; index: number }

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function RaceResultsPage() {
  const params = useParams()
  const token = params.token as string

  const [race, setRace] = useState<RaceInfo | null>(null)
  const [marks, setMarks] = useState<MarkPt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { boats } = useFleetPositions(race?.id ?? null)

  useEffect(() => {
    if (!token) return
    async function load() {
      const supabase = getBrowserClient()
      const { data: r, error: rErr } = await supabase
        .from('races')
        .select('id, name, status, race_date, course_template_id')
        .eq('entry_token', token)
        .single()
      if (rErr || !r) {
        setError('Race not found.')
        setLoading(false)
        return
      }
      setRace(r as RaceInfo)

      if (r.course_template_id) {
        const { data: legs } = await supabase
          .from('course_template_legs')
          .select('sequence_index, mark_id')
          .eq('template_id', r.course_template_id)
          .order('sequence_index', { ascending: true })
        if (legs && legs.length > 0) {
          const ids = (legs as Array<{ mark_id: string }>).map((l) => l.mark_id)
          const { data: markData } = await supabase.from('marks').select('id, lat, lon').in('id', ids)
          const built: MarkPt[] = []
          ;(legs as Array<{ sequence_index: number; mark_id: string }>).forEach((leg, i) => {
            const m = (markData as Array<{ id: string; lat: number; lon: number }> | null)?.find((md) => md.id === leg.mark_id)
            if (m) built.push({ lat: m.lat, lon: m.lon, index: i })
          })
          setMarks(built)
        }
      }
      setLoading(false)
    }
    void load()
  }, [token])

  const standings = computeStandings(
    boats.map((b) => ({
      entryId: b.entryId,
      boatName: b.boatName,
      helmName: b.helmName,
      status: b.status,
      lapsCompleted: b.lapsCompleted,
      lastMarkIndex: b.lastMarkIndex,
      finishTime: b.finishTime,
      elapsedSeconds: b.elapsedSeconds,
      lat: b.lat,
      lon: b.lon,
      speedKts: b.speedKts,
    })),
    marks,
  )

  const finishers = standings.filter((s) => s.state === 'finished')
  const racing = standings.filter((s) => s.state === 'racing')

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading…</p></div>
  }
  if (error) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-700">{error}</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <div className="text-3xl">🏆</div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{race?.name}</h1>
          {race && <p className="text-sm text-gray-500">{formatDate(race.race_date)} · Results</p>}
        </div>

        {standings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No results yet.</p>
            <p className="text-sm text-gray-400 mt-1">Results appear here as boats finish.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 w-12">Pos</th>
                  <th className="text-left px-4 py-2.5">Boat</th>
                  <th className="text-right px-4 py-2.5">Elapsed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {finishers.map((s) => (
                  <tr key={s.entryId}>
                    <td className="px-4 py-3 font-bold text-gray-900">{s.rank}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{s.boatName}</p>
                      {s.helmName && <p className="text-xs text-gray-500">{s.helmName}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900">
                      {formatElapsed(s.elapsedSeconds)}
                    </td>
                  </tr>
                ))}
                {racing.length > 0 && (
                  <>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-4 py-1.5 text-xs uppercase tracking-wide text-gray-400">Still racing</td>
                    </tr>
                    {racing.map((s) => (
                      <tr key={s.entryId} className="text-gray-500">
                        <td className="px-4 py-3 font-bold">{s.rank}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{s.boatName}</p>
                          {s.helmName && <p className="text-xs">{s.helmName}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {s.distanceToNextNm != null ? `${s.distanceToNextNm.toFixed(2)} nm to mark` : 'racing'}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-center gap-4 mt-6 text-sm">
          <Link href={`/race/viewer/${token}`} className="text-blue-600 underline">Live viewer</Link>
          <Link href={`/race/centre/${token}`} className="text-blue-600 underline">Race Centre</Link>
        </div>
      </div>
      <WaypointFooter tone="light" />
    </div>
  )
}
