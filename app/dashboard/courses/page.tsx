'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { CourseTemplate } from '@/types/database'

export default function CoursesPage() {
  const [templates, setTemplates] = useState<CourseTemplate[]>([])
  const [loading, setLoading] = useState(true)

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
            <Link key={t.id} href={`/dashboard/courses/${t.id}`}>
              <Card className="hover:border-blue-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div>
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
                  </div>
                  <span className="text-gray-300 text-lg">›</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
