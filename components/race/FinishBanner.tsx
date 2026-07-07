'use client'

// components/race/FinishBanner.tsx
// Shared finish announcement so Nav, Tracker and the Simulator context all show
// the same celebratory "FINISHED!" state + elapsed time when the line is crossed.
//
// Two variants:
//   - `overlay` (default): full-screen modal over the map (Nav screen)
//   - `inline`: centred block for the map-less Tracker screen

import Link from 'next/link'

/** Format elapsed seconds as H:MM:SS or MM:SS. */
export function formatElapsedTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

interface FinishBannerProps {
  finishTime: string | null
  elapsedSeconds?: number | null
  /** token for the results link (overlay variant). */
  token?: string
  variant?: 'overlay' | 'inline'
  /** Show the "register to keep results" nudge (anonymous racers). */
  showRegisterNudge?: boolean
  registerHref?: string
}

export function FinishBanner({
  finishTime,
  elapsedSeconds,
  token,
  variant = 'overlay',
  showRegisterNudge = false,
  registerHref,
}: FinishBannerProps) {
  const crossedLabel = finishTime
    ? new Date(finishTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  if (variant === 'inline') {
    return (
      <div className="text-center">
        <div className="text-6xl mb-3">🏁</div>
        <div className="text-3xl font-bold text-green-400">FINISHED</div>
        {elapsedSeconds != null && (
          <div className="mt-2">
            <div className="text-xs uppercase tracking-widest opacity-60">Elapsed</div>
            <div className="text-4xl font-mono font-bold tabular-nums">{formatElapsedTime(elapsedSeconds)}</div>
          </div>
        )}
        {crossedLabel && <div className="text-sm opacity-70 mt-2">{crossedLabel}</div>}
        {showRegisterNudge && (
          <div className="mt-6 rounded-xl bg-white/10 px-5 py-4 max-w-xs mx-auto">
            <p className="text-sm font-semibold">Want to keep your results?</p>
            <p className="text-xs opacity-70 mt-1">Register with your boat to get detailed results, your track, and race history.</p>
            {registerHref && (
              <a
                href={registerHref}
                className="inline-block mt-3 rounded-lg bg-white text-slate-900 font-semibold px-4 py-2 text-sm"
              >
                Register &amp; save my results
              </a>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/80 px-6">
      <div className="text-center space-y-3 px-8 py-10 bg-gray-900/95 rounded-2xl border border-green-600 shadow-2xl w-full max-w-sm">
        <div className="text-7xl animate-bounce">🏁</div>
        <h2 className="text-5xl font-black text-green-400 tracking-tight">FINISHED!</h2>
        {elapsedSeconds != null && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Elapsed</p>
            <p className="text-4xl font-mono font-bold text-white tabular-nums">{formatElapsedTime(elapsedSeconds)}</p>
          </div>
        )}
        {crossedLabel && <p className="text-gray-400 text-sm">Crossed at {crossedLabel}</p>}
        <p className="text-xs text-green-500">✓ Result submitted</p>
        <div className="flex flex-col gap-2 mt-4">
          {token && (
            <Link
              href={`/race/results/${token}`}
              className="block px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm"
            >
              🏆 View results
            </Link>
          )}
          <Link href="/dashboard/races" className="block px-6 py-2 text-gray-400 hover:text-white text-sm">
            Back to races
          </Link>
        </div>
      </div>
    </div>
  )
}
