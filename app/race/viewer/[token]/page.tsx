'use client'

// Live Race Viewer — whole-course tactical view showing every competitor.
//
// Public (no login): anyone with the link can watch the fleet on the course,
// with a live positions list. Good for OOD, spectators, or a sailor glancing at
// where everyone is. Uses the shared useFleetPositions layer + RaceMap fitAll.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useFleetPositions } from '@/lib/useFleetPositions'
import { computeStandings, formatElapsed } from '@/lib/race-standings'
import type { RaceMapProps, RaceMapMark } from '@/components/map/RaceMap'

const RaceMap = dynamic<RaceMapProps>(() => import('@/components/map/RaceMap'), { ssr: false })

interface RaceInfo {
  id: string
  name: string
  status: string
  entry_token: string
  course_template_id: string | null
}

export default function RaceViewerPage() {
  const params = useParams()
  const token = params.token as string

  const [race, setRace] = useState<RaceInfo | null>(null)
  const [marks, setMarks] = useState<RaceMapMark[]>([])
  const [startLine, setStartLine] = useState<RaceMapProps['startLine']>(null)
  const [finishLine, setFinishLine] = useState<RaceMapProps['finishLine']>(null)
  const [finishAtStart, setFinishAtStart] = useState(false)
  const [center, setCenter] = useState<[number, number]>([51.5, -0.1])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { boats } = useFleetPositions(race?.id ?? null)

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
    marks.map((m) => ({ lat: m.lat, lon: m.lon, index: m.index })),
  )

  useEffect(() => {
    if (!token) return
    async function load() {
    const supabase = getBrowserClient()
    const { data: r, error: rErr } = await supabase
      .from('races')
      .select('id, name, status, entry_token, course_template_id')
      .eq('entry_token', token)
      .single()
    if (rErr || !r) {
      setError('Race not found.')
      setLoading(false)
      return
    }
    setRace(r as RaceInfo)

    if (r.course_template_id) {
      const { data: tpl } = await supabase
        .from('course_templates')
        .select('*')
        .eq('id', r.course_template_id)
        .single()
      if (tpl) {
        if (tpl.start_line_lat1 != null) {
          setStartLine({ lat1: tpl.start_line_lat1, lng1: tpl.start_line_lng1, lat2: tpl.start_line_lat2, lng2: tpl.start_line_lng2 })
        }
        if (tpl.finish_line_lat1 != null) {
          setFinishLine({ lat1: tpl.finish_line_lat1, lng1: tpl.finish_line_lng1, lat2: tpl.finish_line_lat2, lng2: tpl.finish_line_lng2 })
        }
        setFinishAtStart(!!tpl.finish_at_start)

        const { data: legs } = await supabase
          .from('course_template_legs')
          .select('sequence_index, rounding_side, mark_id')
          .eq('template_id', tpl.id)
          .order('sequence_index', { ascending: true })
        const built: RaceMapMark[] = []
        if (legs && legs.length > 0) {
          const ids = (legs as Array<{ mark_id: string }>).map((l) => l.mark_id)
          const { data: markData } = await supabase.from('marks').select('id, name, lat, lon').in('id', ids)
          if (markData) {
            ;(legs as Array<{ sequence_index: number; rounding_side: 'port' | 'starboard'; mark_id: string }>).forEach((leg, i) => {
              const m = (markData as Array<{ id: string; name: string; lat: number; lon: number }>).find((md) => md.id === leg.mark_id)
              if (m) built.push({ lat: m.lat, lon: m.lon, name: m.name, roundingSide: leg.rounding_side, index: i })
            })
          }
        }
        setMarks(built)
        if (built.length > 0) setCenter([built[0].lat, built[0].lon])
      }
    }
    setLoading(false)
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white"><p className="opacity-70">Loading…</p></div>
  }
  if (error) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white"><p>{error}</p></div>
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-base font-bold truncate">{race?.name}</h1>
          <p className="text-xs opacity-60">Live Race Viewer · {boats.length} on the water</p>
        </div>
        <span className="text-xs uppercase tracking-wide px-2 py-1 rounded bg-white/10">{race?.status}</span>
      </div>

      {/* Map */}
      <div className="relative" style={{ height: '55vh' }}>
        <RaceMap
          center={center}
          courseMarks={marks}
          startLine={startLine}
          finishLine={finishLine}
          finishAtStart={finishAtStart}
          currentPosition={null}
          nextMarkIndex={0}
          courseUp={false}
          laps={1}
          currentLap={1}
          fleet={boats.map((b) => ({ entryId: b.entryId, lat: b.lat, lon: b.lon, headingDeg: b.headingDeg, boatName: b.boatName }))}
          fitAll
        />
      </div>

      {/* Positions list */}
      <div className="flex-1 overflow-y-auto">
        {standings.length === 0 ? (
          <p className="text-center text-sm opacity-60 py-8">No boats tracking yet. They’ll appear here once they start.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {standings.map((s) => (
              <li key={s.entryId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 text-center text-sm font-bold opacity-60">{s.rank}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.boatName}
                    {s.state === 'finished' && <span className="ml-1.5 text-[10px] text-green-400">🏁 FIN</span>}
                  </p>
                  {s.helmName && <p className="text-xs opacity-60 truncate">{s.helmName}</p>}
                </div>
                <div className="text-right">
                  {s.state === 'finished' ? (
                    <p className="text-sm tabular-nums text-green-400">{formatElapsed(s.elapsedSeconds)}</p>
                  ) : s.state === 'racing' ? (
                    <>
                      <p className="text-sm tabular-nums">{s.speedKts != null ? `${s.speedKts.toFixed(1)} kn` : '—'}</p>
                      <p className="text-[10px] opacity-50 tabular-nums">
                        {s.distanceToNextNm != null ? `${s.distanceToNextNm.toFixed(2)} nm to mark` : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs opacity-50">waiting</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-800 text-center">
        <Link href={`/race/centre/${token}`} className="text-xs underline opacity-70">Race Centre</Link>
      </div>
    </div>
  )
}
