'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import type { Mark, RoundingSide } from '@/types/database'

interface CourseLeg {
  markId: string
  roundingSide: RoundingSide
}

export default function NewCoursePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [marks, setMarks] = useState<Mark[]>([])

  const [name, setName] = useState('')
  const [laps, setLaps] = useState('1')
  const [windDir, setWindDir] = useState('')
  const [notes, setNotes] = useState('')
  const [legs, setLegs] = useState<CourseLeg[]>([{ markId: '', roundingSide: 'port' }])

  useEffect(() => {
    if (!user) return
    async function fetchMarks() {
      const supabase = getBrowserClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', user!.id)
        .maybeSingle() as { data: { club_id: string } | null }

      if (profile?.club_id) {
        const { data } = await supabase
          .from('marks')
          .select('*')
          .eq('club_id', profile.club_id)
          .eq('source', 'catalogue')
          .order('short_id')
        setMarks((data as Mark[]) ?? [])
      }
    }
    fetchMarks()
  }, [user])

  function addLeg() {
    setLegs([...legs, { markId: '', roundingSide: 'port' }])
  }

  function removeLeg(index: number) {
    if (legs.length <= 1) return
    setLegs(legs.filter((_, i) => i !== index))
  }

  function updateLeg(index: number, field: keyof CourseLeg, value: string) {
    const updated = [...legs]
    if (field === 'markId') updated[index].markId = value
    if (field === 'roundingSide') updated[index].roundingSide = value as RoundingSide
    setLegs(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('club_id')
      .eq('id', user.id)
      .single() as { data: { club_id: string } | null; error: unknown }

    if (!profile?.club_id) {
      setError('You must be linked to a club before creating courses.')
      setLoading(false)
      return
    }

    // Create template
    const { data: template, error: templateErr } = await supabase
      .from('course_templates')
      .insert({
        club_id: profile.club_id,
        name: name.trim(),
        laps: laps ? parseInt(laps) : null,
        expected_wind_dir: windDir ? parseInt(windDir) : null,
        notes: notes.trim() || null,
      })
      .select()
      .single()

    if (templateErr) {
      setError(templateErr.message)
      setLoading(false)
      return
    }

    // Create legs (only those with a mark selected)
    const validLegs = legs.filter(l => l.markId)
    if (validLegs.length > 0) {
      const { error: legsErr } = await supabase
        .from('course_template_legs')
        .insert(
          validLegs.map((leg, i) => ({
            template_id: template.id,
            sequence_index: i,
            mark_id: leg.markId,
            rounding_side: leg.roundingSide,
          }))
        )

      if (legsErr) {
        setError(legsErr.message)
        setLoading(false)
        return
      }
    }

    router.push('/dashboard/courses')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New course</h1>
        <p className="text-sm text-gray-500 mt-0.5">Build a named course template from your marks</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Course details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Course name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Course A — Triangle"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Laps"
                type="number"
                value={laps}
                onChange={(e) => setLaps(e.target.value)}
                placeholder="1"
                min={1}
              />
              <Input
                label="Expected wind (°)"
                type="number"
                value={windDir}
                onChange={(e) => setWindDir(e.target.value)}
                placeholder="225"
                min={0}
                max={359}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Legs</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {marks.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400 mb-3">
                  Add marks to your catalogue first, then build courses from them.
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={() => router.push('/dashboard/marks/new')}>
                  + Add marks first
                </Button>
              </div>
            ) : (
              <>
                {legs.map((leg, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-6 text-right">{index + 1}.</span>
                    <select
                      value={leg.markId}
                      onChange={(e) => updateLeg(index, 'markId', e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select mark…</option>
                      {marks.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.short_id} — {m.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => updateLeg(index, 'roundingSide', leg.roundingSide === 'port' ? 'starboard' : 'port')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        leg.roundingSide === 'port'
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-green-50 border-green-300 text-green-700'
                      }`}
                      title={`Rounding: ${leg.roundingSide}`}
                    >
                      {leg.roundingSide === 'port' ? '🔴 P' : '🟢 S'}
                    </button>
                    {legs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLeg(index)}
                        className="text-gray-400 hover:text-red-500 text-sm px-1"
                        title="Remove leg"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addLeg}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium border border-dashed border-gray-300 rounded-lg hover:border-blue-300 transition-colors"
                >
                  + Add leg
                </button>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this course…"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Card>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading} className="flex-1" size="lg">
            Create course
          </Button>
        </div>
      </form>
    </div>
  )
}
