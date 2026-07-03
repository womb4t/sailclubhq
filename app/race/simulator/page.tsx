'use client'

// Standalone Nav Simulator / Training playground.
//
// Works with a built-in demo course so anyone can learn the interface without a
// real race. Pure client-side: the GpsSimulator drives a boat around the map and
// nothing is ever written anywhere. Auto-sail or manual steering, with a time
// multiplier so a full lap takes seconds.

import { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { GpsSimulator, DEMO_COURSE, type SimPosition } from '@/lib/gps-simulator'
import type { RaceMapProps } from '@/components/map/RaceMap'

const RaceMap = dynamic<RaceMapProps>(() => import('@/components/map/RaceMap'), { ssr: false })

type Mode = 'auto' | 'manual'

export default function SimulatorPage() {
  const simRef = useRef<GpsSimulator | null>(null)
  const [mode, setMode] = useState<Mode>('auto')
  const [running, setRunning] = useState(false)
  const [multiplier, setMultiplier] = useState(8)
  const [boatSpeed, setBoatSpeed] = useState(6)
  const [pos, setPos] = useState<SimPosition | null>(null)
  const [nextMarkIndex, setNextMarkIndex] = useState(0)
  const [fixCount, setFixCount] = useState(0)

  const course = DEMO_COURSE
  const startMark = course.marks[0]
  const [center] = useState<[number, number]>([startMark.lat, startMark.lon])

  const onFix = useCallback((p: SimPosition) => {
    setPos(p)
    setFixCount((n) => n + 1)
    if (simRef.current) setNextMarkIndex(simRef.current.getState().targetIndex)
  }, [])

  // (Re)create the simulator when the mode changes.
  useEffect(() => {
    simRef.current?.stop()
    const sim = new GpsSimulator(
      course,
      { mode, tickMs: 1000, speedMultiplier: multiplier, boatSpeedKts: boatSpeed },
      onFix,
    )
    simRef.current = sim
    // Defer resets out of the effect body (avoid cascading-render lint).
    const t = setTimeout(() => {
      setRunning(false)
      setFixCount(0)
      setNextMarkIndex(0)
    }, 0)
    return () => {
      clearTimeout(t)
      sim.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Keep live controls in sync without rebuilding.
  useEffect(() => { simRef.current?.setSpeedMultiplier(multiplier) }, [multiplier])
  useEffect(() => { simRef.current?.setBoatSpeed(boatSpeed) }, [boatSpeed])

  function toggleRun() {
    const sim = simRef.current
    if (!sim) return
    if (sim.isRunning()) {
      sim.stop()
      setRunning(false)
    } else {
      sim.start()
      setRunning(true)
    }
  }

  function reset() {
    simRef.current?.stop()
    const sim = new GpsSimulator(
      course,
      { mode, tickMs: 1000, speedMultiplier: multiplier, boatSpeedKts: boatSpeed },
      onFix,
    )
    simRef.current = sim
    setRunning(false)
    setFixCount(0)
    setNextMarkIndex(0)
    setPos(null)
  }

  const startLine =
    course.start_line_lat1 != null
      ? { lat1: course.start_line_lat1, lng1: course.start_line_lng1!, lat2: course.start_line_lat2!, lng2: course.start_line_lng2! }
      : null

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="bg-indigo-500 text-white text-center text-sm font-semibold py-2 px-3">
        🎓 Nav Simulator — demo course, nothing is recorded
      </div>

      {/* Map */}
      <div className="relative flex-1 min-h-[50vh]">
        <RaceMap
          center={center}
          courseMarks={course.marks}
          startLine={startLine}
          finishLine={null}
          finishAtStart={course.finish_at_start ?? false}
          currentPosition={pos ? { lat: pos.lat, lon: pos.lon, heading: pos.heading } : null}
          nextMarkIndex={nextMarkIndex}
          courseUp={false}
          laps={course.laps}
          currentLap={1}
        />
      </div>

      {/* Instruments */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3 text-center border-t border-slate-700">
        <div>
          <div className="text-xs uppercase opacity-60">Speed</div>
          <div className="text-2xl font-bold tabular-nums">{(pos?.speed_kts ?? 0).toFixed(1)}</div>
          <div className="text-[10px] opacity-50">kn</div>
        </div>
        <div>
          <div className="text-xs uppercase opacity-60">Heading</div>
          <div className="text-2xl font-bold tabular-nums">{pos ? `${Math.round(pos.heading)}°` : '—'}</div>
        </div>
        <div>
          <div className="text-xs uppercase opacity-60">Fixes</div>
          <div className="text-2xl font-bold tabular-nums">{fixCount}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 pb-6 pt-2 space-y-4 border-t border-slate-700">
        {/* Mode */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('auto')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === 'auto' ? 'bg-indigo-600' : 'bg-slate-700'}`}
          >
            🤖 Auto-sail
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === 'manual' ? 'bg-indigo-600' : 'bg-slate-700'}`}
          >
            🕹 Manual
          </button>
        </div>

        {/* Speed multiplier */}
        <div>
          <div className="flex justify-between text-xs opacity-70 mb-1">
            <span>Time speed</span>
            <span>{multiplier}×</span>
          </div>
          <input
            type="range" min={1} max={20} step={1}
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Boat speed */}
        <div>
          <div className="flex justify-between text-xs opacity-70 mb-1">
            <span>Boat speed</span>
            <span>{boatSpeed} kn</span>
          </div>
          <input
            type="range" min={0} max={15} step={1}
            value={boatSpeed}
            onChange={(e) => setBoatSpeed(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Manual steering */}
        {mode === 'manual' && (
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => simRef.current?.nudge(-15)} className="rounded-lg bg-slate-700 px-5 py-3 text-xl">⬅ Port</button>
            <button onClick={() => simRef.current?.nudge(15)} className="rounded-lg bg-slate-700 px-5 py-3 text-xl">Stbd ➡</button>
          </div>
        )}

        {/* Run / reset */}
        <div className="flex gap-2">
          <button
            onClick={toggleRun}
            className={`flex-1 rounded-lg py-3 text-base font-semibold ${running ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {running ? '⏸ Pause' : '▶ Start'}
          </button>
          <button onClick={reset} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-5 py-3 text-base font-semibold">
            ↺ Reset
          </button>
        </div>

        <p className="text-center text-xs opacity-50">
          Learn the race interface safely. <Link href="/dashboard" className="underline">Back to dashboard</Link>
        </p>
      </div>
    </div>
  )
}
