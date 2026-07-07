// lib/start-audio.ts
// Shared Web Audio helpers for the race start sequence (beeps + gun tone).
//
// Extracted so the on-the-water Race Nav and the OOD Race Control surface fire
// IDENTICAL start signals. Pure browser audio; no DB / network. Safe to call on
// the client only — every function no-ops if AudioContext is unavailable (SSR).

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    const Ctx = window.AudioContext || (window as WebkitWindow).webkitAudioContext
    if (!Ctx) return null
    return new Ctx()
  } catch {
    return null
  }
}

/** Short high beeps — used for warning / prep / 5-4-3-2-1 ticks. */
export function playBeeps(count: number, durationMs = 200, gapMs = 150) {
  const ctx = getAudioContext()
  if (!ctx) return
  for (let i = 0; i < count; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.4
    const start = ctx.currentTime + (i * (durationMs + gapMs)) / 1000
    osc.start(start)
    osc.stop(start + durationMs / 1000)
  }
}

/** Long lower tone — the start / finish "gun". */
export function playLongTone(durationMs = 1000) {
  const ctx = getAudioContext()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = 660
  gain.gain.value = 0.5
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + durationMs / 1000)
}
