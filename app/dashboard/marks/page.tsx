'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { MarkCard } from '@/components/marks/MarkCard'
import { Button } from '@/components/ui/Button'
import type { Mark } from '@/types/database'

export default function MarksPage() {
  const [marks, setMarks] = useState<Mark[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profile?.club_id) {
        const { data } = await supabase
          .from('marks')
          .select('*')
          .eq('club_id', profile.club_id)
          .eq('source', 'catalogue')
          .order('short_id')
        setMarks((data as Mark[]) ?? [])
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
          <h1 className="text-2xl font-bold text-gray-900">Marks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{marks.length} mark{marks.length !== 1 ? 's' : ''} in catalogue</p>
        </div>
        <Link href="/dashboard/marks/new">
          <Button size="sm">+ Add mark</Button>
        </Link>
      </div>

      {/* Port/starboard legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-600 inline-block" /> Port (default)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-600 inline-block" /> Starboard
        </span>
      </div>

      {marks.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📍</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">No marks yet</h2>
          <p className="text-sm text-gray-400 mb-6">
            Add your club&apos;s virtual and physical marks to build your catalogue.
          </p>
          <Link href="/dashboard/marks/new">
            <Button>Add first mark</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {marks.map((mark) => (
            <MarkCard
              key={mark.id}
              mark={mark}
              showCoords
            />
          ))}
        </div>
      )}
    </div>
  )
}
