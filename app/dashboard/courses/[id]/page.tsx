'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import type { CourseTemplate, CourseTemplateLeg, Mark } from '@/types/database'
import { haversineNm } from '@/components/map/CourseBuilderMap'

const SeaMap = dynamic(() => import('@/components/map/SeaMap'), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-gray-100 rounded-xl flex items-center justify-center">
      <p className="text-gray-400 text-sm">Loading map…</p>
    </div>
  ),
})

interface LegWithMark extends CourseTemplateLeg {
  mark: Mark
}

export default function CourseDetailPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.id as string
  const { user } = useAuth()

  const [course, setCourse] = useState<CourseTemplate | null>(null)
  const [legs, setLegs] = useState<LegWithMark[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (!user || !courseId) return
    async function load() {
      const supabase = getBrowserClient()

      // Fetch course template
      const { data: tmpl } = await supabase
        .from('course_templates')
        .select('*')
        .eq('id', courseId)
        .single()

      if (!tmpl) { setLoading(false); return }
      setCourse(tmpl as CourseTemplate)

      // Fetch legs with marks
      const { data: legData } = await supabase
        .from('course_template_legs')
        .select('*, mark:marks(*)')
        .eq('template_id', courseId)
        .order('sequence_index')

      if (legData) {
        setLegs(legData as unknown as LegWithMark[])
      }

      setLoading(false)
    }
    load()
  }, [user, courseId])

  async function handleDelete() {
    if (!courseId) return
    setDeleting(true)
    const supabase = getBrowserClient()

    // Delete legs first, then template
    await supabase.from('course_template_legs').delete().eq('template_id', courseId)
    await supabase.from('course_templates').delete().eq('id', courseId)

    router.push('/dashboard/courses')
  }

  // Calculate distance
  const totalDistanceNm = (() => {
    if (legs.length < 2) return 0
    let total = 0
    for (let i = 0; i < legs.length - 1; i++) {
      total += haversineNm(legs[i].mark.lat, legs[i].mark.lon, legs[i + 1].mark.lat, legs[i + 1].mark.lon)
    }
    const lapCount = course?.laps ?? 1
    return total * (lapCount > 0 ? lapCount : 1)
  })()

  // Map markers from legs
  const mapMarkers = legs.map(l => ({
    id: l.mark.id,
    lat: l.mark.lat,
    lon: l.mark.lon,
    name: l.mark.name,
    label: l.mark.short_id,
    type: l.mark.type as 'physical' | 'virtual',
    rounding: l.rounding_side as 'port' | 'starboard',
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="text-center py-20">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Course not found</h2>
        <Link href="/dashboard/courses">
          <Button variant="secondary">← Back to courses</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.back()} className="text-sm text-blue-600 hover:text-blue-700 mb-1">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            {course.laps != null && (
              <span>⟳ {course.laps} lap{course.laps !== 1 ? 's' : ''}</span>
            )}
            {course.expected_wind_dir != null && (
              <span>💨 {course.expected_wind_dir}°</span>
            )}
            {totalDistanceNm > 0 && (
              <span>📏 {totalDistanceNm.toFixed(2)} nm</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-red-400 hover:text-red-600 text-sm"
        >
          Delete
        </button>
      </div>

      {/* Map preview */}
      {legs.length > 0 && (
        <Card>
          <div className="h-64 rounded-xl overflow-hidden">
            <SeaMap markers={mapMarkers} />
          </div>
        </Card>
      )}

      {/* Course info */}
      <Card>
        <CardHeader>
          <CardTitle>Course legs</CardTitle>
        </CardHeader>
        {legs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No legs defined</p>
        ) : (
          <ol className="space-y-2">
            {legs.map((leg, i) => (
              <li key={leg.id} className="flex items-center gap-3 px-1 py-1.5">
                <span className="text-xs text-gray-400 w-5 text-right font-medium">{i + 1}.</span>
                <div
                  className={`w-3 h-3 rounded-full ${
                    leg.rounding_side === 'port' ? 'bg-red-500' : 'bg-green-500'
                  }`}
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-800">{leg.mark.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{leg.mark.short_id}</span>
                  {leg.mark.source === 'race' && (
                    <span className="ml-1.5 text-xs text-orange-500 font-medium">temp</span>
                  )}
                </div>
                <span className={`text-xs font-medium ${
                  leg.rounding_side === 'port' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {leg.rounding_side === 'port' ? 'Port' : 'Starboard'}
                </span>
                {i < legs.length - 1 && (
                  <span className="text-xs text-gray-300">
                    {haversineNm(leg.mark.lat, leg.mark.lon, legs[i + 1].mark.lat, legs[i + 1].mark.lon).toFixed(2)} nm
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Notes */}
      {course.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <p className="text-sm text-gray-600">{course.notes}</p>
        </Card>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 mx-6 max-w-sm w-full">
            <h3 className="font-semibold text-gray-900 text-base mb-2">Delete course?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete <strong>{course.name}</strong> and all its legs. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
