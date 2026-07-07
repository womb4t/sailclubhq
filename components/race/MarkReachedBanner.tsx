'use client'

// components/race/MarkReachedBanner.tsx
// Transient "mark reached" announcement, shared by every sailor screen so the
// wording + look is identical on Nav, Tracker and the Simulator context.
//
// Two variants:
//   - `floating` (default): overlays the map (used by the Nav screen)
//   - `banner`: a full-width strip (used by the map-less Tracker screen)

import type { MarkReached } from '@/lib/useRaceProgress'

interface MarkReachedBannerProps {
  markReached: MarkReached | null
  variant?: 'floating' | 'banner'
}

export function MarkReachedBanner({ markReached, variant = 'floating' }: MarkReachedBannerProps) {
  if (!markReached) return null

  if (variant === 'banner') {
    return (
      <div className="bg-green-500 text-slate-900 text-center py-3 px-3 shadow-lg">
        <div className="text-base font-extrabold uppercase tracking-wide">✅ Reached {markReached.reached}</div>
        {markReached.next && (
          <div className="text-sm font-semibold mt-0.5">→ Now head for {markReached.next}</div>
        )}
      </div>
    )
  }

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1500] pointer-events-none">
      <div className="bg-green-500 text-slate-900 rounded-xl px-4 py-2.5 shadow-2xl text-center border-2 border-green-300">
        <div className="text-sm font-extrabold uppercase tracking-wide">✅ Reached {markReached.reached}</div>
        {markReached.next && (
          <div className="text-xs font-semibold mt-0.5">→ Now head for {markReached.next}</div>
        )}
      </div>
    </div>
  )
}
