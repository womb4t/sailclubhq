// lib/useFleetPositions.ts
// Shared multi-boat live position layer.
//
// Reads the latest position for every boat in a race from live_positions and
// keeps them fresh via Supabase realtime (falling back to polling). Powers both
// the standalone Race Viewer and the "whole course" toggle on the sailing screen
// — one engine, two surfaces.

import { useEffect, useRef, useState, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'

export interface FleetBoat {
  entryId: string
  boatName: string
  helmName: string | null
  status: string
  lat: number
  lon: number
  speedKts: number | null
  headingDeg: number | null
  recordedAt: string
  // Progress (for standings)
  lapsCompleted: number
  lastMarkIndex: number
  finishTime: string | null
  elapsedSeconds: number | null
}

interface EntryRow {
  id: string
  boat_name: string | null
  helm_name: string | null
  status: string
  laps_completed: number | null
  last_mark_index: number | null
  finish_time: string | null
  elapsed_seconds: number | null
}

interface PositionRow {
  entry_id: string | null
  lat: number
  lon: number
  speed_kts: number | null
  heading_deg: number | null
  recorded_at: string
}

const POLL_MS = 10000

export function useFleetPositions(raceId: string | null) {
  const [boats, setBoats] = useState<FleetBoat[]>([])
  const [loaded, setLoaded] = useState(false)
  const loading = !loaded
  const entriesRef = useRef<Map<string, EntryRow>>(new Map())
  // Latest position per entry_id.
  const latestRef = useRef<Map<string, PositionRow>>(new Map())

  const rebuild = useCallback(() => {
    const out: FleetBoat[] = []
    for (const [entryId, entry] of entriesRef.current) {
      const pos = latestRef.current.get(entryId)
      if (!pos) continue // no position yet — not on the water
      out.push({
        entryId,
        boatName: entry.boat_name || 'Unnamed boat',
        helmName: entry.helm_name,
        status: entry.status,
        lat: pos.lat,
        lon: pos.lon,
        speedKts: pos.speed_kts,
        headingDeg: pos.heading_deg,
        recordedAt: pos.recorded_at,
        lapsCompleted: entry.laps_completed ?? 0,
        lastMarkIndex: entry.last_mark_index ?? 0,
        finishTime: entry.finish_time ?? null,
        elapsedSeconds: entry.elapsed_seconds ?? null,
      })
    }
    // Most recently updated first.
    out.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    setBoats(out)
  }, [])

  // Load entries + latest positions.
  const load = useCallback(async () => {
    if (!raceId) return
    const supabase = getBrowserClient()

    const { data: ents } = await supabase
      .from('race_entries')
      .select('id, boat_name, helm_name, status, laps_completed, last_mark_index, finish_time, elapsed_seconds')
      .eq('race_id', raceId)
    entriesRef.current = new Map((ents ?? []).map((e) => [e.id, e as EntryRow]))

    // Pull recent positions and keep the latest per entry. (For a club race the
    // volume is small; we take a generous recent window ordered newest-first.)
    const { data: pos } = await supabase
      .from('live_positions')
      .select('entry_id, lat, lon, speed_kts, heading_deg, recorded_at')
      .eq('race_id', raceId)
      .order('recorded_at', { ascending: false })
      .limit(2000)

    const latest = new Map<string, PositionRow>()
    for (const p of (pos ?? []) as PositionRow[]) {
      if (!p.entry_id) continue
      if (!latest.has(p.entry_id)) latest.set(p.entry_id, p) // first seen = newest
    }
    latestRef.current = latest
    rebuild()
    setLoaded(true)
  }, [raceId, rebuild])

  useEffect(() => {
    if (!raceId) return
    // load() is async: all setState calls run after awaited DB fetches, not
    // synchronously within the effect (linter false positive).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()

    const supabase = getBrowserClient()
    // Realtime: new positions update the latest map live.
    const channel = supabase
      .channel(`fleet:${raceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_positions', filter: `race_id=eq.${raceId}` },
        (payload) => {
          const p = payload.new as PositionRow
          if (!p.entry_id) return
          const prev = latestRef.current.get(p.entry_id)
          if (!prev || p.recorded_at >= prev.recorded_at) {
            latestRef.current.set(p.entry_id, p)
            rebuild()
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_entries', filter: `race_id=eq.${raceId}` },
        () => { void load() },
      )
      .subscribe()

    // Poll as a fallback (realtime may be unavailable / boats offline-batching).
    const poll = setInterval(() => { void load() }, POLL_MS)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [raceId, load, rebuild])

  return { boats, loading, refresh: load }
}
