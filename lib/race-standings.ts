// lib/race-standings.ts
// Pure race standings / results computation.
//
// Ranks the fleet for a live leaderboard and final results:
//   1. Finished boats, ordered by elapsed time (or finish time as a fallback)
//   2. Still-racing boats, ordered by progress: laps done -> marks rounded ->
//      distance to the next mark (closer = ahead)
//   3. Not-yet-started / no-position boats last
//
// No DB access — callers pass the fleet + entry progress + course marks.

export interface StandingsMark {
  lat: number
  lon: number
  index: number
}

export interface StandingsEntry {
  entryId: string
  boatName: string
  helmName: string | null
  status: string
  // Progress (from race_entries)
  lapsCompleted: number
  lastMarkIndex: number
  finishTime: string | null
  elapsedSeconds: number | null
  // Live position (from live_positions), if on the water
  lat: number | null
  lon: number | null
  speedKts: number | null
}

export interface Standing extends StandingsEntry {
  rank: number
  state: 'finished' | 'racing' | 'waiting'
  /** nm to the next mark (racing only), for display + tie-breaking. */
  distanceToNextNm: number | null
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Compute ranked standings. `marks` is the ordered course (single lap); we use
 * lastMarkIndex modulo marks.length combined with lapsCompleted for progress.
 */
export function computeStandings(entries: StandingsEntry[], marks: StandingsMark[]): Standing[] {
  const withMeta = entries.map((e) => {
    const finished = !!e.finishTime
    const onWater = e.lat != null && e.lon != null
    const state: Standing['state'] = finished ? 'finished' : onWater ? 'racing' : 'waiting'

    // Distance to the next mark (racing only).
    let distanceToNextNm: number | null = null
    if (state === 'racing' && marks.length > 0 && e.lat != null && e.lon != null) {
      const idx = Math.min(e.lastMarkIndex, marks.length - 1)
      const nextMark = marks[idx]
      if (nextMark) distanceToNextNm = haversineNm(e.lat, e.lon, nextMark.lat, nextMark.lon)
    }
    return { ...e, state, distanceToNextNm }
  })

  withMeta.sort((a, b) => {
    // 1. Finished before racing before waiting.
    const order = { finished: 0, racing: 1, waiting: 2 }
    if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state]

    if (a.state === 'finished' && b.state === 'finished') {
      // Fastest elapsed first (fall back to finish time).
      const ae = a.elapsedSeconds ?? Number.POSITIVE_INFINITY
      const be = b.elapsedSeconds ?? Number.POSITIVE_INFINITY
      if (ae !== be) return ae - be
      return (a.finishTime ?? '').localeCompare(b.finishTime ?? '')
    }

    if (a.state === 'racing' && b.state === 'racing') {
      // More laps -> further through marks -> closer to next mark.
      if (a.lapsCompleted !== b.lapsCompleted) return b.lapsCompleted - a.lapsCompleted
      if (a.lastMarkIndex !== b.lastMarkIndex) return b.lastMarkIndex - a.lastMarkIndex
      const ad = a.distanceToNextNm ?? Number.POSITIVE_INFINITY
      const bd = b.distanceToNextNm ?? Number.POSITIVE_INFINITY
      return ad - bd
    }

    // Waiting: stable by name.
    return a.boatName.localeCompare(b.boatName)
  })

  return withMeta.map((e, i) => ({ ...e, rank: i + 1 }))
}

/** Format elapsed seconds as H:MM:SS or MM:SS. */
export function formatElapsed(seconds: number | null): string {
  if (seconds == null) return '—'
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}
