'use client'

// RecallBanner — the sailor-facing INDIVIDUAL RECALL / OCS broadcast.
//
// Shown on the Nav (/race/live) and Tracker (/race/tracker) screens. It is driven
// by the COMMITTEE-authoritative flags (not the boat's own client-local guess):
//   - `iAmOcs`  = this boat's race_entries.ocs is true (set by the OOD / auto pass)
//   - `recallActive` = races.individual_recall is true for the fleet
//
// Both arrive LIVE via the screens' existing races-row realtime subscription
// (individual_recall) plus a lightweight own-entry realtime subscription (ocs) —
// no reload needed.
//
// Priority: if THIS boat is OCS, show the hard, unmissable red recall banner. If a
// recall is in effect for the fleet but this boat is NOT OCS, show only a subtle
// note (must NOT tell a clear boat to restart). Deliberately a slim TOP banner so
// it never covers the instruments/map below.

interface RecallBannerProps {
  /** This boat's committee-set OCS flag (race_entries.ocs). */
  iAmOcs: boolean
  /** Whether an individual recall is in effect for the fleet (races.individual_recall). */
  recallActive: boolean
}

export function RecallBanner({ iAmOcs, recallActive }: RecallBannerProps) {
  if (iAmOcs) {
    return (
      <div
        role="alert"
        className="bg-red-600 text-white px-4 py-3 text-center font-bold shrink-0 z-40 shadow-lg animate-pulse"
      >
        <span className="text-base">🚩 INDIVIDUAL RECALL — YOU ARE OCS</span>
        <span className="block text-xs font-medium opacity-95 mt-0.5">
          Return behind the start line and restart
        </span>
      </div>
    )
  }

  if (recallActive) {
    return (
      <div className="bg-slate-800 text-amber-200 px-4 py-1.5 text-center text-xs font-medium shrink-0 z-40 border-b border-amber-500/40">
        🚩 Individual recall in effect — you are clear
      </div>
    )
  }

  return null
}
