'use client'

import { useState, useEffect, useCallback, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import type { Mark, RoundingSide } from '@/types/database'
import type { BuilderMode, CourseLeg, LinePoint } from '@/components/map/CourseBuilderMap'
import { haversineNm } from '@/components/map/CourseBuilderMap'

// Dynamic import — Leaflet requires browser
const CourseBuilderMap = dynamic(() => import('@/components/map/CourseBuilderMap'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Loading map…</p>
    </div>
  ),
})

// ─── Mode metadata ────────────────────────────────────────────────────────────
const MODES: { id: BuilderMode; label: string; icon: string; hint: string }[] = [
  { id: 'setStart', label: 'Start Line', icon: '⚓', hint: 'Tap 2 points on the map to set the start line' },
  { id: 'addLegs', label: 'Add Legs', icon: '🔵', hint: 'Tap a mark to add it, or tap open water for a temp mark' },
  { id: 'setFinish', label: 'Finish Line', icon: '🏁', hint: 'Tap 2 points for a separate finish line' },
  { id: 'review', label: 'Review', icon: '📋', hint: 'Review and save your course' },
]

// ─── Coordinate formatter ─────────────────────────────────────────────────────
function fmtCoord(lat: number, lng: number) {
  const latDir = lat >= 0 ? 'N' : 'S'
  const lonDir = lng >= 0 ? 'E' : 'W'
  const aLat = Math.abs(lat)
  const aLon = Math.abs(lng)
  const latD = Math.floor(aLat)
  const lonD = Math.floor(aLon)
  const latM = ((aLat - latD) * 60).toFixed(3)
  const lonM = ((aLon - lonD) * 60).toFixed(3)
  return `${latDir}${String(latD).padStart(2, '0')}°${String(latM).padStart(6, '0')}' ${lonDir}${String(lonD).padStart(3, '0')}°${String(lonM).padStart(6, '0')}'`
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NewCoursePage() {
  const router = useRouter()
  const { user } = useAuth()
  const uniqueId = useId()

  // Data
  const [clubId, setClubId] = useState<string | null>(null)
  const [catalogueMarks, setCatalogueMarks] = useState<Mark[]>([])
  const [loadingMarks, setLoadingMarks] = useState(true)

  // Builder state
  const [mode, setMode] = useState<BuilderMode>('setStart')
  const [startLineMode, setStartLineMode] = useState<'tap' | 'mark' | 'committee'>('tap') // how we're setting start line points
  const [startLine, setStartLine] = useState<LinePoint[]>([])
  const [startLineLabels, setStartLineLabels] = useState<string[]>([]) // e.g. ['Pin End', 'Committee Boat']
  const [finishLine, setFinishLine] = useState<LinePoint[] | null>(null)
  const [finishAtStart, setFinishAtStart] = useState<boolean | null>(null) // null = not yet decided
  const [showFinishPrompt, setShowFinishPrompt] = useState(false)
  const [legs, setLegs] = useState<CourseLeg[]>([])
  const [tempMarkCount, setTempMarkCount] = useState(0)

  // Details panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [laps, setLaps] = useState('1')
  const [windDir, setWindDir] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Coord display
  const [cursorCoord, setCursorCoord] = useState<string>('')
  const mapCenterRef = useRef<[number, number]>([51.35, 0.73])

  // Help panel
  const [helpOpen, setHelpOpen] = useState(true)

  // Undo history — stores actions that can be reversed
  type UndoAction =
    | { type: 'addLeg' }
    | { type: 'startPoint' }
    | { type: 'finishPoint' }
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])

  function pushUndo(action: UndoAction) {
    setUndoStack(prev => [...prev, action])
  }

  function handleUndo() {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))

    switch (last.type) {
      case 'addLeg': {
        const removed = legs[legs.length - 1]
        if (removed?.isTemp) setTempMarkCount(prev => Math.max(0, prev - 1))
        setLegs(prev => prev.slice(0, -1))
        break
      }
      case 'startPoint': {
        setStartLine(prev => prev.slice(0, -1))
        setStartLineLabels(prev => prev.slice(0, -1))
        if (mode === 'addLegs' && startLine.length <= 2) {
          setMode('setStart')
          setFinishAtStart(null) // reset finish decision
        }
        break
      }
      case 'finishPoint': {
        setFinishLine(prev => {
          if (!prev) return null
          const next = prev.slice(0, -1)
          return next.length === 0 ? null : next
        })
        if (mode === 'review') setMode('setFinish')
        break
      }
    }
  }

  // ─── Load club + marks ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    async function load() {
      setLoadingMarks(true)
      const supabase = getBrowserClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', user!.id)
        .maybeSingle() as { data: { club_id: string } | null }

      if (profile?.club_id) {
        setClubId(profile.club_id)
        const { data } = await supabase
          .from('marks')
          .select('*')
          .eq('club_id', profile.club_id)
          .eq('source', 'catalogue')
          .order('short_id')
        setCatalogueMarks((data as Mark[]) ?? [])
      }
      setLoadingMarks(false)
    }
    load()
  }, [user])

  // ─── Map interaction handlers ────────────────────────────────────────────
  const handleMapClick = useCallback((lat: number, lng: number) => {
    setCursorCoord(fmtCoord(lat, lng))

    if (mode === 'setStart') {
      setStartLine(prev => {
        if (prev.length >= 2) return [{ lat, lng }]
        return [...prev, { lat, lng }]
      })
      // Label based on current sub-mode
      const label = startLineMode === 'committee' ? 'Committee Boat' : `Point ${startLine.length + 1}`
      setStartLineLabels(prev => {
        if (prev.length >= 2) return [label]
        return [...prev, label]
      })
      pushUndo({ type: 'startPoint' })
    } else if (mode === 'setFinish') {
      setFinishLine(prev => {
        if (!prev || prev.length >= 2) return [{ lat, lng }]
        return [...prev, { lat, lng }]
      })
      pushUndo({ type: 'finishPoint' })
    } else if (mode === 'addLegs') {
      // Drop a temp mark on open water
      const count = tempMarkCount + 1
      setTempMarkCount(count)
      const newLeg: CourseLeg = {
        id: `temp-${uniqueId}-${count}`,
        markId: `temp-${uniqueId}-${count}`,
        markName: `TM${count}`,
        lat,
        lng,
        roundingSide: 'port',
        isTemp: true,
      }
      setLegs(prev => [...prev, newLeg])
      pushUndo({ type: 'addLeg' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tempMarkCount, uniqueId])

  // When start line is complete, ask about finish line
  useEffect(() => {
    if (startLine.length === 2 && mode === 'setStart') {
      // Show the finish line prompt instead of auto-advancing
      const t = setTimeout(() => setShowFinishPrompt(true), 400)
      return () => clearTimeout(t)
    }
  }, [startLine, mode])

  // Auto-advance to review when finish line is complete
  useEffect(() => {
    if (finishLine && finishLine.length === 2 && mode === 'setFinish') {
      const t = setTimeout(() => setMode('review'), 300)
      return () => clearTimeout(t)
    }
  }, [finishLine, mode])

  const handleCatalogueMarkClick = useCallback((mark: Mark) => {
    // In setStart mode, allow using a catalogue mark as a start line point
    if (mode === 'setStart') {
      if (startLine.length >= 2) return // already complete
      setStartLine(prev => [...prev, { lat: mark.lat, lng: mark.lon }])
      setStartLineLabels(prev => [...prev, mark.name])
      pushUndo({ type: 'startPoint' })
      return
    }
    if (mode !== 'addLegs') return
    const newLeg: CourseLeg = {
      id: mark.id,
      markId: mark.id,
      markName: mark.name,
      lat: mark.lat,
      lng: mark.lon,
      roundingSide: mark.default_rounding,
      isTemp: false,
    }
    setLegs(prev => [...prev, newLeg])
    pushUndo({ type: 'addLeg' })
  }, [mode, startLine])

  const handleLegClick = useCallback((index: number) => {
    // Toggle rounding side when tapping a leg marker on the map
    if (mode === 'addLegs' || mode === 'review') {
      setLegs(prev => prev.map((l, i) => i === index
        ? { ...l, roundingSide: l.roundingSide === 'port' ? 'starboard' : 'port' }
        : l
      ))
    }
  }, [mode])

  // ─── Leg panel controls ──────────────────────────────────────────────────
  function toggleLegRounding(index: number) {
    setLegs(prev => prev.map((l, i) => i === index
      ? { ...l, roundingSide: l.roundingSide === 'port' ? 'starboard' : 'port' }
      : l
    ))
  }

  function removeLeg(index: number) {
    setLegs(prev => prev.filter((_, i) => i !== index))
  }

  function moveLegUp(index: number) {
    if (index === 0) return
    setLegs(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveLegDown(index: number) {
    setLegs(prev => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  // ─── Save ────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!courseName.trim()) { setSaveError('Course name is required'); return }
    if (!clubId) { setSaveError('No club found'); return }

    // Default to finish-at-start if not explicitly decided
    if (finishAtStart === null) {
      setFinishAtStart(true)
    }

    setSaveError('')
    setSaving(true)

    try {
      const supabase = getBrowserClient()

      // 1. Insert temp marks first
      const tempLegs = legs.filter(l => l.isTemp)
      const tempIdMap: Record<string, string> = {}

      for (const tl of tempLegs) {
        const { data: inserted, error: mErr } = await supabase
          .from('marks')
          .insert({
            club_id: clubId,
            name: tl.markName,
            short_id: tl.markName,
            lat: tl.lat,
            lon: tl.lng,
            type: 'virtual',
            source: 'race',
            default_rounding: tl.roundingSide,
          })
          .select()
          .single()

        if (mErr || !inserted) throw new Error(mErr?.message ?? 'Failed to save temp mark')
        tempIdMap[tl.markId] = inserted.id
      }

      // 2. Create course template
      const { data: template, error: tErr } = await supabase
        .from('course_templates')
        .insert({
          club_id: clubId,
          name: courseName.trim(),
          laps: laps ? parseInt(laps) : null,
          expected_wind_dir: windDir ? parseInt(windDir) : null,
          notes: notes.trim() || null,
        })
        .select()
        .single()

      if (tErr || !template) throw new Error(tErr?.message ?? 'Failed to create course')

      // 3. Create legs
      if (legs.length > 0) {
        const legRows = legs.map((l, i) => ({
          template_id: template.id,
          sequence_index: i,
          mark_id: l.isTemp ? tempIdMap[l.markId] : l.markId,
          rounding_side: l.roundingSide,
        }))

        const { error: lErr } = await supabase.from('course_template_legs').insert(legRows)
        if (lErr) throw new Error(lErr.message)
      }

      router.push('/dashboard/courses')
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  // ─── Derived state ────────────────────────────────────────────────────────
  const currentModeInfo = MODES.find(m => m.id === mode)!
  const startDone = startLine.length === 2
  const hasLegs = legs.length > 0
  const canSave = hasLegs
  const [nameWarning, setNameWarning] = useState(false)

  // Calculate total course distance in nautical miles
  const courseDistanceNm = (() => {
    let total = 0
    // Start line midpoint to first leg
    if (startLine.length === 2 && legs.length > 0) {
      const smLat = (startLine[0].lat + startLine[1].lat) / 2
      const smLng = (startLine[0].lng + startLine[1].lng) / 2
      total += haversineNm(smLat, smLng, legs[0].lat, legs[0].lng)
    }
    // Between legs
    for (let i = 0; i < legs.length - 1; i++) {
      total += haversineNm(legs[i].lat, legs[i].lng, legs[i + 1].lat, legs[i + 1].lng)
    }
    // Last leg to finish
    if (legs.length > 0) {
      const effectiveFinish = finishAtStart === true
        ? (startLine.length === 2 ? startLine : null)
        : (finishLine && finishLine.length === 2 ? finishLine : null)
      if (effectiveFinish) {
        const fmLat = (effectiveFinish[0].lat + effectiveFinish[1].lat) / 2
        const fmLng = (effectiveFinish[0].lng + effectiveFinish[1].lng) / 2
        total += haversineNm(legs[legs.length - 1].lat, legs[legs.length - 1].lng, fmLat, fmLng)
      }
    }
    // Multiply by laps
    const lapCount = laps ? parseInt(laps) : 1
    return total * (lapCount > 0 ? lapCount : 1)
  })()

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    // Full-viewport layout — override dashboard's max-w-3xl container
    <div
      className="fixed inset-0 bg-gray-900 flex flex-col"
      style={{ zIndex: 40 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-950 text-white shrink-0 z-50">
        <button
          onClick={() => router.back()}
          className="text-blue-300 hover:text-white text-sm font-medium"
        >
          ← Back
        </button>
        <h1 className="font-bold text-sm">Visual Course Builder</h1>
        <button
          onClick={() => { setPanelOpen(true); setMode('review') }}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
        >
          ⚙ Settings
        </button>
      </div>

      {/* Map – fills remaining space */}
      <div className="flex-1 relative">
        <CourseBuilderMap
          mode={mode}
          catalogueMarks={catalogueMarks}
          legs={legs}
          startLine={startLine}
          startLineLabels={startLineLabels}
          finishLine={finishLine}
          finishAtStart={finishAtStart}
          onMapClick={handleMapClick}
          onCatalogueMarkClick={handleCatalogueMarkClick}
          onLegClick={handleLegClick}
        />

        {/* Loading overlay */}
        {loadingMarks && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-50">
            <span className="text-gray-500 text-sm">Loading marks…</span>
          </div>
        )}

        {/* Coordinate display */}
        {cursorCoord && (
          <div className="absolute top-3 left-20 z-[1000] bg-blue-950/90 text-white text-xs font-mono px-3 py-1.5 rounded-lg pointer-events-none">
            {cursorCoord}
          </div>
        )}

        {/* Help panel */}
        <div className={`absolute top-3 right-14 z-[1000] transition-all ${
          helpOpen ? 'w-72' : 'w-auto'
        }`}>
          {helpOpen ? (
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-100">
                <span className="text-xs font-semibold text-blue-800">📖 How to build a course</span>
                <button
                  onClick={() => setHelpOpen(false)}
                  className="text-blue-400 hover:text-blue-600 text-sm leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="px-3 py-2.5 space-y-2 text-xs text-gray-600 leading-relaxed">
                <div className="flex gap-2">
                  <span className="text-base leading-none mt-0.5">1️⃣</span>
                  <div><strong className="text-gray-800">Set the start line</strong> — tap two points on the map, or tap existing marks to use them as ends. Use the Committee Boat button for the RC boat end.</div>
                </div>
                <div className="flex gap-2">
                  <span className="text-base leading-none mt-0.5">2️⃣</span>
                  <div><strong className="text-gray-800">Choose finish line</strong> — you&apos;ll be asked if the start line is also the finish. Most club races use the same line.</div>
                </div>
                <div className="flex gap-2">
                  <span className="text-base leading-none mt-0.5">3️⃣</span>
                  <div><strong className="text-gray-800">Add legs</strong> — tap marks on the map to add them to the course in order. Tap open water to drop a temporary mark (TM1, TM2…).</div>
                </div>
                <div className="flex gap-2">
                  <span className="text-base leading-none mt-0.5">4️⃣</span>
                  <div><strong className="text-gray-800">Set rounding</strong> — tap any mark in the course to toggle port <span className="text-red-600">🔴</span> / starboard <span className="text-green-600">🟢</span>.</div>
                </div>
                <div className="flex gap-2">
                  <span className="text-base leading-none mt-0.5">5️⃣</span>
                  <div><strong className="text-gray-800">Send to finish</strong> — hit the 🏁 button when done adding legs, then review and save.</div>
                </div>
                <div className="border-t border-gray-100 pt-2 mt-1 text-gray-400">
                  <strong>Tips:</strong> Use ↩ Undo to step back. Reorder legs in the details panel. Temp marks only exist in this course.
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setHelpOpen(true)}
              className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
            >
              📖 Help
            </button>
          )}
        </div>

        {/* Mode hint banner */}
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] bg-black/70 text-white text-xs px-4 py-2 rounded-full pointer-events-none max-w-xs text-center">
          {mode === 'setStart' && startLine.length === 0 && (
            <span>⚓ Tap a point, mark, or use buttons below to set the start line</span>
          )}
          {mode === 'setStart' && startLine.length === 1 && (
            <span>⚓ Now set the 2nd end — <span className="text-yellow-300">tap map, mark, or use Committee Boat</span></span>
          )}
          {mode === 'addLegs' && (
            <span>🔵 Tap marks to build the course, or tap open water for a temp mark</span>
          )}
          {mode === 'setFinish' && (
            <span>🏁 Tap 2 points for the finish line{finishLine && finishLine.length === 1 ? <span className="text-yellow-300"> (tap 2nd point)</span> : ''}</span>
          )}
          {mode === 'review' && (
            <span>📋 Review your course and save</span>
          )}
        </div>

        {/* Start line helper buttons — visible in setStart mode */}
        {mode === 'setStart' && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[1000] flex gap-2">
            <button
              onClick={() => {
                // Drop committee boat at map center
                if (!mapCenterRef.current || startLine.length >= 2) return
                // We'll use the last clicked coord or map interaction
                setStartLineMode('committee')
              }}
              className={`px-3 py-2 rounded-xl text-xs font-medium shadow-lg transition-all ${
                startLineMode === 'committee'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              🚢 Committee Boat
            </button>
            <button
              onClick={() => setStartLineMode('mark')}
              className={`px-3 py-2 rounded-xl text-xs font-medium shadow-lg transition-all ${
                startLineMode === 'mark'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              📍 Use a Mark
            </button>
            <button
              onClick={() => setStartLineMode('tap')}
              className={`px-3 py-2 rounded-xl text-xs font-medium shadow-lg transition-all ${
                startLineMode === 'tap'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              👆 Tap Point
            </button>
          </div>
        )}

        {/* Finish line prompt — appears after start line is set */}
        {showFinishPrompt && (
          <div className="absolute inset-0 z-[1100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-2xl shadow-2xl p-5 mx-6 max-w-sm w-full">
              <h3 className="font-semibold text-gray-900 text-base mb-2">Finish line</h3>
              <p className="text-sm text-gray-600 mb-4">Do you want the start line to also be the finish line?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setFinishAtStart(true)
                    setShowFinishPrompt(false)
                    setMode('addLegs')
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                >
                  ✅ Yes — Start / Finish
                </button>
                <button
                  onClick={() => {
                    setFinishAtStart(false)
                    setShowFinishPrompt(false)
                    setMode('addLegs')
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  No — set separately
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Info panel — fixed at bottom of map */}
        {(hasLegs || startDone) && (
          <div className="absolute bottom-32 left-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Course name + save row */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
              <input
                value={courseName}
                onChange={(e) => { setCourseName(e.target.value); setNameWarning(false) }}
                placeholder="Enter course name…"
                className={`flex-1 text-sm font-medium text-gray-900 bg-transparent outline-none placeholder:text-gray-400 border-b-2 pb-0.5 transition-colors ${
                  nameWarning ? 'border-red-400 placeholder:text-red-400' : 'border-transparent'
                }`}
              />
              <button
                onClick={() => setPanelOpen(true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0"
              >
                More ›
              </button>
              <button
                onClick={() => {
                  if (!courseName.trim()) {
                    setNameWarning(true)
                    setSaveError('Please name your course before saving')
                    return
                  }
                  handleSave()
                }}
                disabled={!canSave || saving}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0 transition-colors ${
                  canSave && !saving
                    ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                {saving ? 'Saving…' : '🏁 Finish & Save'}
              </button>
            </div>
            {/* Name warning */}
            {nameWarning && (
              <div className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium border-b border-red-100 flex items-center gap-1.5">
                ⚠️ Please enter a course name above
              </div>
            )}

            {/* Stats row */}
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              {/* Legs count */}
              <div className="text-center">
                <div className="text-lg font-bold text-gray-800">{legs.length}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Legs</div>
              </div>

              {/* Distance */}
              {courseDistanceNm > 0 && (
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-700">{courseDistanceNm.toFixed(2)}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">nm{laps && parseInt(laps) > 1 ? ` (${laps} laps)` : ''}</div>
                </div>
              )}

              {/* Estimated times */}
              {courseDistanceNm > 0 && (
                <div className="flex flex-col items-center gap-0.5" title="Estimated Time to Complete (NOT tide adjusted)">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">Est. Time</div>
                  <div className="flex gap-2">
                    {[3, 5, 8].map(speed => {
                      const hrs = courseDistanceNm / speed
                      const h = Math.floor(hrs)
                      const m = Math.round((hrs - h) * 60)
                      return (
                        <div key={speed} className="text-center">
                          <div className="text-sm font-semibold text-gray-800">
                            {h > 0 ? `${h}h${m > 0 ? `${m}` : ''}` : `${m}m`}
                          </div>
                          <div className="text-[10px] font-medium text-gray-600">{speed}kt</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Finish status */}
              <div className="text-center">
                {finishAtStart === true && startDone ? (
                  <div className="text-xs font-medium text-purple-600">✓ S/F</div>
                ) : finishAtStart === false && finishLine && finishLine.length === 2 ? (
                  <div className="text-xs font-medium text-blue-600">✓ Finish</div>
                ) : (
                  <div className="text-xs font-medium text-gray-400">–</div>
                )}
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Finish</div>
              </div>
            </div>

            {/* Save error */}
            {saveError && (
              <div className="px-3 py-1.5 bg-red-50 text-red-600 text-xs border-t border-red-100">
                {saveError}
              </div>
            )}
          </div>
        )}

        {/* Undo + Send to Finish — secondary action row */}
        <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-2 px-4 z-[1000]">
          {/* Undo button */}
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium shadow-lg bg-white/90 text-gray-700 hover:bg-white transition-all backdrop-blur-sm"
            >
              ↩ Undo
            </button>
          )}

          {/* Send to Finish button — visible in addLegs mode when we have at least 1 leg */}
          {mode === 'addLegs' && legs.length >= 1 && startLine.length === 2 && (
            <button
              onClick={() => {
                if (finishAtStart === null) {
                  // Haven't decided yet — ask
                  setShowFinishPrompt(true)
                } else if (finishAtStart) {
                  // Finish is at start — go straight to review
                  setMode('review')
                  setPanelOpen(true)
                } else {
                  // Separate finish — switch to set finish mode
                  setMode('setFinish')
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium shadow-lg bg-amber-500 text-white hover:bg-amber-600 transition-all"
            >
              🏁 Send to Finish
            </button>
          )}
        </div>

        {/* Mode buttons — bottom floating */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 px-4 z-[1000]">
          {MODES.map(m => {
            // Hide setFinish from FABs — accessible from panel
            if (m.id === 'setFinish') return null
            const isActive = mode === m.id
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-blue-600/40'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            )
          })}

          {/* Open panel button */}
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg bg-white text-gray-700 hover:bg-gray-50 transition-all"
          >
            <span>📋</span>
            <span>{legs.length > 0 ? `${legs.length} legs` : 'Details'}</span>
          </button>
        </div>

        {/* Status pills */}
        <div className="absolute top-[50%] -translate-y-1/2 right-3 z-[1000] flex flex-col gap-1">
          <div className={`text-xs px-2 py-1 rounded-md font-medium ${startDone ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {startDone ? '✓ Start' : '○ Start'}
          </div>
          <div className={`text-xs px-2 py-1 rounded-md font-medium ${hasLegs ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {hasLegs ? `✓ ${legs.length} legs` : '○ Legs'}
          </div>
          {courseDistanceNm > 0 && (
            <div className="text-xs px-2 py-1 rounded-md font-medium bg-blue-600 text-white">
              📏 {courseDistanceNm.toFixed(2)} nm
            </div>
          )}
          <div className={`text-xs px-2 py-1 rounded-md font-medium ${(finishAtStart === true && startDone) || (finishLine && finishLine.length === 2) ? 'bg-green-600 text-white' : finishAtStart === null ? 'bg-amber-200 text-amber-700' : 'bg-gray-200 text-gray-500'}`}>
            {(finishAtStart === true && startDone) || (finishLine && finishLine.length === 2)
              ? (finishAtStart === true ? '✓ Start / Finish' : '✓ Finish')
              : finishAtStart === null ? '? Finish' : '○ Finish'}
          </div>
        </div>
      </div>

      {/* ─── Bottom sheet / panel ──────────────────────────────────────────── */}
      {panelOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => setPanelOpen(false)}
          />

          {/* Panel */}
          <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col">
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
              <h2 className="font-semibold text-gray-900">Course Details</h2>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {/* Course name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Course name <span className="text-red-500">*</span>
                </label>
                <input
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g. Triangle A"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Laps + wind */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Laps</label>
                  <input
                    type="number"
                    value={laps}
                    onChange={(e) => setLaps(e.target.value)}
                    min={1}
                    placeholder="1"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wind (°)</label>
                  <input
                    type="number"
                    value={windDir}
                    onChange={(e) => setWindDir(e.target.value)}
                    min={0}
                    max={359}
                    placeholder="225"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Distance + estimated times */}
              {courseDistanceNm > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Total distance</span>
                    <div className="text-right">
                      <span className="text-lg font-bold text-blue-700">{courseDistanceNm.toFixed(2)}</span>
                      <span className="text-sm text-gray-500 ml-1">nm</span>
                      {laps && parseInt(laps) > 1 && (
                        <div className="text-xs text-gray-400">
                          {(courseDistanceNm / (parseInt(laps) || 1)).toFixed(2)} nm per lap × {laps}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-2">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">⏱ Estimated race time</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[3, 5, 8].map(speed => {
                        const hrs = courseDistanceNm / speed
                        const h = Math.floor(hrs)
                        const m = Math.round((hrs - h) * 60)
                        return (
                          <div key={speed} className="bg-white rounded-lg py-1.5 px-1 border border-gray-100">
                            <div className="text-xs text-gray-400">{speed} kts</div>
                            <div className="text-sm font-semibold text-gray-800">
                              {h > 0 ? `${h}h ${m}m` : `${m}m`}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Finish line options */}
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-sm font-medium text-gray-700 mb-2">Finish Line</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={finishAtStart ?? false}
                    onChange={(e) => {
                      setFinishAtStart(e.target.checked)
                      if (!e.target.checked) {
                        setMode('setFinish')
                        setPanelOpen(false)
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Finish at start line</span>
                </label>
                {!finishAtStart && (
                  <button
                    onClick={() => { setMode('setFinish'); setPanelOpen(false) }}
                    className="mt-2 w-full text-sm text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-100 transition-colors"
                  >
                    🏁 Set separate finish line on map
                    {finishLine && finishLine.length === 2 ? ' ✓' : ''}
                  </button>
                )}
              </div>

              {/* Legs list */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Legs ({legs.length})
                  {mode !== 'review' && (
                    <button
                      onClick={() => { setPanelOpen(false); setMode('addLegs') }}
                      className="ml-2 text-xs text-blue-600 font-normal"
                    >
                      + add on map
                    </button>
                  )}
                </p>
                {legs.length === 0 ? (
                  <div className="text-center py-4 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
                    No legs added yet. Close panel and tap marks on the map.
                  </div>
                ) : (
                  <ol className="space-y-2">
                    {legs.map((leg, i) => (
                      <li key={leg.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                        <span className="text-xs text-gray-400 w-5 text-right font-medium">{i + 1}</span>
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-800">{leg.markName}</span>
                          {leg.isTemp && (
                            <span className="ml-1.5 text-xs text-orange-500 font-medium">temp</span>
                          )}
                        </div>
                        {/* Rounding toggle */}
                        <button
                          onClick={() => toggleLegRounding(i)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            leg.roundingSide === 'port'
                              ? 'bg-red-50 border-red-300 text-red-700'
                              : 'bg-green-50 border-green-300 text-green-700'
                          }`}
                        >
                          {leg.roundingSide === 'port' ? '🔴 P' : '🟢 S'}
                        </button>
                        {/* Move up/down */}
                        <div className="flex flex-col">
                          <button
                            onClick={() => moveLegUp(i)}
                            disabled={i === 0}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-tight"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveLegDown(i)}
                            disabled={i === legs.length - 1}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-tight"
                          >
                            ▼
                          </button>
                        </div>
                        {/* Remove */}
                        <button
                          onClick={() => removeLeg(i)}
                          className="text-gray-300 hover:text-red-500 text-base leading-none"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional course notes…"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Error */}
              {saveError && (
                <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
                  {saveError}
                </div>
              )}
            </div>

            {/* Fixed footer with save button */}
            <div className="px-4 py-4 border-t border-gray-100 shrink-0">
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className={`w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-colors ${
                  canSave && !saving
                    ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                {saving ? 'Saving…' : `Save Course${legs.length > 0 ? ` (${legs.length} legs)` : ''}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
