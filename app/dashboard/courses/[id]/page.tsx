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

  // Calculate distance (including start→first and last→finish)
  const totalDistanceNm = (() => {
    if (legs.length === 0) return 0
    let total = 0

    // Start line midpoint to first leg
    if (course?.start_line_lat1 != null && course?.start_line_lat2 != null && legs.length > 0) {
      const smLat = (course.start_line_lat1 + course.start_line_lat2) / 2
      const smLng = (course.start_line_lng1! + course.start_line_lng2!) / 2
      total += haversineNm(smLat, smLng, legs[0].mark.lat, legs[0].mark.lon)
    }

    // Between legs
    for (let i = 0; i < legs.length - 1; i++) {
      total += haversineNm(legs[i].mark.lat, legs[i].mark.lon, legs[i + 1].mark.lat, legs[i + 1].mark.lon)
    }

    // Last leg to finish line midpoint
    if (legs.length > 0 && course) {
      let fLat1: number | null = null, fLng1: number | null = null, fLat2: number | null = null, fLng2: number | null = null
      if (course.finish_at_start && course.start_line_lat1 != null) {
        fLat1 = course.start_line_lat1; fLng1 = course.start_line_lng1
        fLat2 = course.start_line_lat2; fLng2 = course.start_line_lng2
      } else if (course.finish_line_lat1 != null) {
        fLat1 = course.finish_line_lat1; fLng1 = course.finish_line_lng1
        fLat2 = course.finish_line_lat2; fLng2 = course.finish_line_lng2
      }
      if (fLat1 != null && fLat2 != null && fLng1 != null && fLng2 != null) {
        const fmLat = (fLat1 + fLat2) / 2
        const fmLng = (fLng1 + fLng2) / 2
        total += haversineNm(legs[legs.length - 1].mark.lat, legs[legs.length - 1].mark.lon, fmLat, fmLng)
      }
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

      {/* Distance + estimated times */}
      {totalDistanceNm > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Distance &amp; timing</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total distance</span>
              <div className="text-right">
                <span className="text-lg font-bold text-blue-700">{totalDistanceNm.toFixed(2)}</span>
                <span className="text-sm text-gray-500 ml-1">nm</span>
                {course.laps && course.laps > 1 && (
                  <div className="text-xs text-gray-400">
                    {(totalDistanceNm / course.laps).toFixed(2)} nm per lap × {course.laps}
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">⏱ Estimated race time</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[3, 5, 8].map(speed => {
                  const hrs = totalDistanceNm / speed
                  const h = Math.floor(hrs)
                  const m = Math.round((hrs - h) * 60)
                  return (
                    <div key={speed} className="bg-gray-50 rounded-lg py-2 px-1 border border-gray-100">
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
