'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import type { Mark, RoundingSide } from '@/types/database'
import type { BuilderMode, CourseLeg, LinePoint } from '@/components/map/CourseBuilderMap'

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
  const [startLine, setStartLine] = useState<LinePoint[]>([])
  const [finishLine, setFinishLine] = useState<LinePoint[] | null>(null)
  const [finishAtStart, setFinishAtStart] = useState(true)
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
      // Auto-advance to addLegs when both points set
      setStartLine(prev => {
        if (prev.length === 1) {
          // Will be 2 after this render — handled via effect below
        }
        return prev
      })
    } else if (mode === 'setFinish') {
      setFinishLine(prev => {
        if (!prev || prev.length >= 2) return [{ lat, lng }]
        return [...prev, { lat, lng }]
      })
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tempMarkCount, uniqueId])

  // Auto-advance mode when start line is complete
  useEffect(() => {
    if (startLine.length === 2 && mode === 'setStart') {
      // Small delay so user sees the line drawn
      const t = setTimeout(() => setMode('addLegs'), 300)
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
  }, [mode])

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
  const canSave = courseName.trim().length > 0 && hasLegs

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
          Details
        </button>
      </div>

      {/* Map – fills remaining space */}
      <div className="flex-1 relative">
        <CourseBuilderMap
          mode={mode}
          catalogueMarks={catalogueMarks}
          legs={legs}
          startLine={startLine}
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
          <div className="absolute top-3 left-3 z-[1000] bg-blue-950/90 text-white text-xs font-mono px-3 py-1.5 rounded-lg pointer-events-none">
            {cursorCoord}
          </div>
        )}

        {/* Mode hint banner */}
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] bg-black/70 text-white text-xs px-4 py-2 rounded-full pointer-events-none max-w-xs text-center whitespace-nowrap">
          {currentModeInfo.icon} {currentModeInfo.hint}
          {mode === 'setStart' && startLine.length === 1 && (
            <span className="ml-1 text-yellow-300">(tap 2nd point)</span>
          )}
          {mode === 'setFinish' && finishLine && finishLine.length === 1 && (
            <span className="ml-1 text-yellow-300">(tap 2nd point)</span>
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
        <div className="absolute top-14 right-3 z-[1000] flex flex-col gap-1">
          <div className={`text-xs px-2 py-1 rounded-md font-medium ${startDone ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {startDone ? '✓ Start' : '○ Start'}
          </div>
          <div className={`text-xs px-2 py-1 rounded-md font-medium ${hasLegs ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {hasLegs ? `✓ ${legs.length} legs` : '○ Legs'}
          </div>
          <div className={`text-xs px-2 py-1 rounded-md font-medium ${(finishAtStart && startDone) || (finishLine && finishLine.length === 2) ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {(finishAtStart && startDone) || (finishLine && finishLine.length === 2) ? '✓ Finish' : '○ Finish'}
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

              {/* Finish line options */}
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-sm font-medium text-gray-700 mb-2">Finish Line</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={finishAtStart}
                    onChange={(e) => {
                      setFinishAtStart(e.target.checked)
                      if (!e.target.checked) {
                        setMode('setFinish')
                        setPanelOpen(false)
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Finish at start line (default)</span>
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
