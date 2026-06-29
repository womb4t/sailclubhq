import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MarkCard } from '@/components/marks/MarkCard'
import { Button } from '@/components/ui/Button'
import type { Mark } from '@/types/database'

export default async function MarksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('id', user!.id)
    .single()

  let marks: Mark[] = []
  if (profile?.club_id) {
    const { data } = await supabase
      .from('marks')
      .select('*')
      .eq('club_id', profile.club_id)
      .eq('source', 'catalogue')
      .order('short_id')
    marks = (data as Mark[]) ?? []
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{marks.length} mark{marks.length !== 1 ? 's' : ''} in catalogue</p>
        </div>
        <Link href="/marks/new">
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
          <Link href="/marks/new">
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
