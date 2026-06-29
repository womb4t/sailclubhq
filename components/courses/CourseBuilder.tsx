'use client'

import { useState } from 'react'
import { CourseTemplate, CourseTemplateLeg, Mark, RoundingSide } from '@/types/database'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { RoundingBadge } from '@/components/ui/Badge'

interface Leg {
  sequence_index: number
  mark: Mark
  rounding_side: RoundingSide
}

interface CourseBuilderProps {
  template?: CourseTemplate
  availableMarks: Mark[]
  initialLegs?: (CourseTemplateLeg & { mark: Mark })[]
  onSave: (template: Partial<CourseTemplate>, legs: Omit<CourseTemplateLeg, 'id' | 'template_id'>[]) => Promise<void>
}

export function CourseBuilder({ template, availableMarks, initialLegs = [], onSave }: CourseBuilderProps) {
  const [name, setName] = useState(template?.name ?? '')
  const [laps, setLaps] = useState<string>(template?.laps?.toString() ?? '')
  const [windDir, setWindDir] = useState<string>(template?.expected_wind_dir?.toString() ?? '')
  const [notes, setNotes] = useState(template?.notes ?? '')
  const [legs, setLegs] = useState<Leg[]>(
    initialLegs.map((l) => ({
      sequence_index: l.sequence_index,
      mark: l.mark,
      rounding_side: l.rounding_side,
    }))
  )
  const [saving, setSaving] = useState(false)

  function addMark(mark: Mark) {
    setLegs((prev) => [
      ...prev,
      {
        sequence_index: prev.length,
        mark,
        rounding_side: mark.default_rounding,
      },
    ])
  }

  function removeLeg(index: number) {
    setLegs((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((l, i) => ({ ...l, sequence_index: i }))
    )
  }

  function toggleRounding(index: number) {
    setLegs((prev) =>
      prev.map((l, i) =>
        i === index
          ? { ...l, rounding_side: l.rounding_side === 'port' ? 'starboard' : 'port' }
          : l
      )
    )
  }

  function moveLeg(index: number, direction: 'up' | 'down') {
    setLegs((prev) => {
      const next = [...prev]
      const swap = direction === 'up' ? index - 1 : index + 1
      if (swap < 0 || swap >= next.length) return prev
      ;[next[index], next[swap]] = [next[swap]!, next[index]!]
      return next.map((l, i) => ({ ...l, sequence_index: i }))
    })
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave(
        {
          name: name.trim(),
          laps: laps ? parseInt(laps) : null,
          expected_wind_dir: windDir ? parseInt(windDir) : null,
          notes: notes.trim() || null,
        },
        legs.map((l) => ({
          sequence_index: l.sequence_index,
          mark_id: l.mark.id,
          rounding_side: l.rounding_side,
        }))
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Template details */}
      <Card>
        <CardHeader>
          <CardTitle>Course Details</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Course A"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Laps <span className="text-gray-400 font-normal">(blank = avg)</span>
              </label>
              <input
                type="number"
                value={laps}
                onChange={(e) => setLaps(e.target.value)}
                placeholder="—"
                min={1}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Wind Dir (°)</label>
              <input
                type="number"
                value={windDir}
                onChange={(e) => setWindDir(e.target.value)}
                placeholder="—"
                min={0}
                max={359}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </Card>

      {/* Course legs */}
      <Card>
        <CardHeader>
          <CardTitle>Course Legs ({legs.length})</CardTitle>
          {laps ? (
            <span className="text-xs text-gray-500">{laps} lap{parseInt(laps) !== 1 ? 's' : ''} fixed</span>
          ) : (
            <span className="text-xs text-gray-500">avg laps (per lap)</span>
          )}
        </CardHeader>

        {legs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No marks added yet. Pick from below.</p>
        ) : (
          <ol className="space-y-2">
            {legs.map((leg, i) => (
              <li key={`${leg.mark.id}-${i}`} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
                <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="font-bold text-blue-900 text-sm w-6">{leg.mark.short_id}</span>
                  <span className="text-sm text-gray-700 flex-1">{leg.mark.name}</span>
                  <button
                    onClick={() => toggleRounding(i)}
                    title="Toggle rounding side"
                  >
                    <RoundingBadge side={leg.rounding_side} />
                  </button>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveLeg(i, 'up')}
                    disabled={i === 0}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    aria-label="Move up"
                  >↑</button>
                  <button
                    onClick={() => moveLeg(i, 'down')}
                    disabled={i === legs.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    aria-label="Move down"
                  >↓</button>
                  <button
                    onClick={() => removeLeg(i)}
                    className="p-1 text-red-400 hover:text-red-600"
                    aria-label="Remove"
                  >×</button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Available marks */}
      <Card>
        <CardHeader>
          <CardTitle>Available Marks</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {availableMarks.map((mark) => (
            <button
              key={mark.id}
              onClick={() => addMark(mark)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <span className="font-bold text-blue-900 text-xs">{mark.short_id}</span>
              <span className="text-gray-700">{mark.name}</span>
            </button>
          ))}
          {availableMarks.length === 0 && (
            <p className="text-sm text-gray-400">No marks in catalogue. Add marks first.</p>
          )}
        </div>
      </Card>

      <Button onClick={handleSave} loading={saving} disabled={!name.trim()} className="w-full" size="lg">
        Save Course
      </Button>
    </div>
  )
}
