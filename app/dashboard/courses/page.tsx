'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { CourseTemplate } from '@/types/database'

export default function CoursesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<CourseTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<CourseTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profile?.club_id) {
        const { data } = await supabase
          .from('course_templates')
          .select('*')
          .eq('club_id', profile.club_id)
          .order('name')
        setTemplates((data as CourseTemplate[]) ?? [])
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = getBrowserClient()
    await supabase.from('course_template_legs').delete().eq('template_id', deleteTarget.id)
    await supabase.from('course_templates').delete().eq('id', deleteTarget.id)
    setTemplates(prev => prev.filter(t => t.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
          <p className="text-sm text-gray-500 mt-0.5">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/dashboard/courses/new">
          <Button size="sm">+ New course</Button>
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🗺️</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">No courses yet</h2>
          <p className="text-sm text-gray-400 mb-6">
            Build named course templates from your marks catalogue.
          </p>
          <Link href="/dashboard/courses/new">
            <Button>Build first course</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id} className="hover:border-blue-300 hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <Link href={`/dashboard/courses/${t.id}`} className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{t.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {t.laps != null ? (
                      <span>⟳ {t.laps} lap{t.laps !== 1 ? 's' : ''} (total)</span>
                    ) : (
                      <span>⟳ Variable laps (per lap)</span>
                    )}
                    {t.expected_wind_dir != null && (
                      <span>💨 {t.expected_wind_dir}°</span>
                    )}
                  </div>
                  {t.notes && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{t.notes}</p>
                  )}
                </Link>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <button
                    onClick={() => router.push(`/dashboard/courses/${t.id}`)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(t)}
                    className="text-xs font-medium text-red-400 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 mx-6 max-w-sm w-full">
            <h3 className="font-semibold text-gray-900 text-base mb-2">Delete course?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete <strong>{deleteTarget.name}</strong> and all its legs. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
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
