'use client'
import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'
import { WaypointMark } from './WaypointMark'

// Intro/tutorial slides — what Waypoint Racing does. Shown to every user each
// visit until they choose "Don't show this again" (persists profiles.hide_intro).
const TOUR_SLIDES: { icon: string; title: string; body: string }[] = [
  {
    icon: '🗺️',
    title: 'Waypoint Racing, in a nutshell',
    body: 'A live GPS race platform for your sailing club. Set courses from marks, run the start sequence, race with your phone as the instrument, and get automatic results — no stopwatch, no paperwork.',
  },
  {
    icon: '📍',
    title: 'Marks & courses',
    body: 'Save your club’s marks once (real buoys or virtual GPS points). Then build a course in seconds — tap marks in order, set rounding side and laps. Windward-leeward, triangles, sausages, all of it.',
  },
  {
    icon: '⏱️',
    title: 'A proper start sequence',
    body: 'The OOD runs a synced countdown with warning, prep and start signals — beeps and all. Cross early and it flags you OCS, so everyone starts fair.',
  },
  {
    icon: '🧭',
    title: 'Your phone is the nav',
    body: 'Live map with your position, heading and trail. A clear header shows Bearing To Mark, speed, distance and time to go. It tells you the moment you’ve reached a mark so you can turn for the next — and it works offline.',
  },
  {
    icon: '🏁',
    title: 'Finish & results',
    body: 'Sail through the finish line and you’re timed automatically. Results build themselves into a live table — your club, and spectators ashore, can follow the whole fleet in real time.',
  },
]

export function IntroTour({
  userId,
  onClose,
}: {
  userId: string
  onClose: () => void
}) {
  const [slide, setSlide] = useState(0)
  const [saving, setSaving] = useState(false)

  const s = TOUR_SLIDES[slide]
  const isFirst = slide === 0
  const isLast = slide === TOUR_SLIDES.length - 1

  const next = () => (isLast ? onClose() : setSlide((n) => n + 1))
  const back = () => setSlide((n) => Math.max(0, n - 1))

  async function hideForever() {
    setSaving(true)
    try {
      const supabase = getBrowserClient()
      await supabase.from('profiles').update({ hide_intro: true }).eq('id', userId)
    } catch {
      // Non-fatal — worst case they see it again next time.
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center px-4 bg-gradient-to-b from-blue-600 to-slate-900">
      <div className="w-full max-w-md text-center text-white flex flex-col" style={{ minHeight: 520 }}>
        <div className="flex items-center justify-center gap-2 mb-6">
          <WaypointMark className="h-7 w-7 text-white" />
          <span className="font-bold tracking-wide">WAYPOINT RACING</span>
        </div>

        {/* Slide */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-6xl mb-5">{s.icon}</div>
          <h1 className="text-2xl font-bold">{s.title}</h1>
          <p className="text-blue-100 mt-3 text-base leading-relaxed max-w-sm">{s.body}</p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {TOUR_SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${i === slide ? 'w-6 bg-white' : 'w-2 bg-white/30'}`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center gap-3">
          {!isFirst ? (
            <button
              onClick={back}
              className="rounded-xl border border-white/30 text-white/90 font-medium py-3 px-5 hover:bg-white/10 transition-colors"
            >
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-xl text-white/70 font-medium py-3 px-4 hover:text-white transition-colors"
            >
              Close
            </button>
          )}
          <button
            onClick={next}
            className="flex-1 rounded-xl bg-white text-blue-700 font-semibold py-3 text-base hover:bg-blue-50 transition-colors"
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>

        {/* Hide forever */}
        <button
          onClick={hideForever}
          disabled={saving}
          className="mt-4 text-sm text-white/60 hover:text-white/90 transition-colors disabled:opacity-50"
        >
          Don’t show this again
        </button>
      </div>
    </div>
  )
}
