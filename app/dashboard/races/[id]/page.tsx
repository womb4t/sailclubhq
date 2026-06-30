'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { Race, CourseTemplate } from '@/types/database'

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  open: 'info',
  active: 'success',
  finished: 'warning',
}

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  active: 'Racing',
  finished: 'Finished',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function extractStartTime(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/^Start time: (\d{2}:\d{2})/)
  return match ? match[1] : null
}

interface CourseWithLegs extends CourseTemplate {
  legCount: number
}

export default function RaceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const id = params?.id as string

  const [race, setRace] = useState<Race | null>(null)
  const [course, setCourse] = useState<CourseWithLegs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id || !user) return
    async function fetchRace() {
      const supabase = getBrowserClient()
      const { data, error: fetchError } = await supabase
        .from('races')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError || !data) {
        setError('Race not found.')
        setLoading(false)
        return
      }

      setRace(data as Race)

      // Fetch course template if linked
      if (data.course_template_id) {
        const { data: tpl } = await supabase
          .from('course_templates')
          .select('*')
          .eq('id', data.course_template_id)
          .single()

        if (tpl) {
          const { count } = await supabase
            .from('course_template_legs')
            .select('*', { count: 'exact', head: true })
            .eq('template_id', tpl.id)
          setCourse({ ...tpl, legCount: count ?? 0 })
        }
      }

      setLoading(false)
    }
    fetchRace()
  }, [id, user])

  const entryLink = race
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${race.entry_token}`
    : ''

  function handleCopy() {
    if (!entryLink) return
    navigator.clipboard.writeText(entryLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleDelete() {
    if (!race) return
    setDeleting(true)
    const supabase = getBrowserClient()
    const { error: delError } = await supabase
      .from('races')
      .delete()
      .eq('id', race.id)

    if (delError) {
      setError(delError.message)
      setDeleting(false)
      setShowDeleteConfirm(false)
      return
    }
    router.push('/dashboard/races')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (error || !race) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-red-600 mb-4">{error || 'Race not found.'}</p>
        <Link href="/dashboard/races"><Button variant="secondary">Back to races</Button></Link>
      </div>
    )
  }

  const startTime = extractStartTime(race.notes)
  const notesWithoutTime = race.notes
    ? race.notes.replace(/^Start time: \d{2}:\d{2}\n?/, '').trim()
    : ''

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{race.name}</h1>
            {race.race_number && (
              <span className="text-sm text-gray-400">#{race.race_number}</span>
            )}
            <Badge variant={statusVariant[race.status] ?? 'default'}>
              {statusLabel[race.status] ?? race.status}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatDate(race.race_date)}
            {startTime && <span> at {startTime}</span>}
          </p>
          {race.series && (
            <p className="text-xs text-gray-400 mt-0.5">{race.series}</p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href={`/dashboard/races/${race.id}/edit`}>
            <Button variant="secondary" size="sm">Edit</Button>
          </Link>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Course info */}
      {course && (
        <Card>
          <CardHeader>
            <CardTitle>Course</CardTitle>
          </CardHeader>
          <div className="space-y-1">
            <p className="font-medium text-gray-900">{course.name}</p>
            <div className="flex gap-4 text-sm text-gray-500">
              {course.legCount > 0 && (
                <span>{course.legCount} leg{course.legCount !== 1 ? 's' : ''}</span>
              )}
              {course.laps && (
                <span>{course.laps} lap{course.laps !== 1 ? 's' : ''}</span>
              )}
            </div>
            {course.notes && (
              <p className="text-sm text-gray-500 mt-1">{course.notes}</p>
            )}
          </div>
        </Card>
      )}

      {!course && (
        <Card>
          <p className="text-sm text-gray-400">No course linked — to be set on the day.</p>
        </Card>
      )}

      {/* Competitor entry link */}
      <Card>
        <CardHeader>
          <CardTitle>Competitor entry link</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Share this link so competitors can enter the race</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 truncate">
              {entryLink}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              className="flex-shrink-0"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </Card>

      {/* On-the-water info */}
      <Card>
        <CardHeader>
          <CardTitle>On-the-water info</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          {race.vhf_channel && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">VHF Channel</p>
              <p className="text-sm text-gray-900 mt-0.5">📻 {race.vhf_channel}</p>
            </div>
          )}
          {race.safety_info && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Safety information</p>
              <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{race.safety_info}</p>
            </div>
          )}
          {notesWithoutTime && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</p>
              <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{notesWithoutTime}</p>
            </div>
          )}
          {!race.vhf_channel && !race.safety_info && !notesWithoutTime && (
            <p className="text-sm text-gray-400">No on-the-water info added.</p>
          )}
        </div>
      </Card>

      {/* Back link */}
      <div>
        <Link href="/dashboard/races">
          <Button variant="secondary" size="sm">← Back to races</Button>
        </Link>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Delete race?</h3>
            <p className="text-sm text-gray-500">
              This will permanently delete <strong>{race.name}</strong> and all its data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={deleting}
                onClick={handleDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
