'use client'

// ControlBanner — the sailor-facing broadcast banner for OOD Race Control.
//
// Shown on the Nav screen and the Tracker whenever the committee/OOD has
// broadcast a control state (delay start / abandon) via races.race_status.
// Both screens already subscribe to the races row realtime, so this updates
// LIVE with no reload — just pass the current race_status + start time down.
//
// Deliberately visually distinct from the mark-reached (blue/green flash) and
// finish (celebration) banners: amber for postponed, hard red for abandoned.

interface ControlBannerProps {
  /** Live control state broadcast by the OOD (races.race_status). */
  raceStatus: string | null | undefined
  /** Absolute (updated) start gun in epoch ms — used to show the new start time. */
  startMs: number | null
}

/** Format an epoch-ms start time to a local HH:MM the sailor recognises. */
function formatStart(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function ControlBanner({ raceStatus, startMs }: ControlBannerProps) {
  if (raceStatus === 'abandoned') {
    return (
      <div className="bg-red-600 text-white px-4 py-3 text-center font-bold shrink-0 z-30 shadow-lg animate-pulse">
        <span className="text-base">🛑 RACE ABANDONED</span>
        <span className="block text-xs font-medium opacity-90 mt-0.5">
          Return to shore / await instructions
        </span>
      </div>
    )
  }

  if (raceStatus === 'postponed') {
    return (
      <div className="bg-amber-500 text-slate-900 px-4 py-2.5 text-center font-bold shrink-0 z-30 shadow-lg">
        <span className="text-sm">
          ⏱️ Start delayed{startMs != null ? ` — new start ${formatStart(startMs)}` : ''}
        </span>
      </div>
    )
  }

  return null
}
