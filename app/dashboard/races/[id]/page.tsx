'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { Race, CourseTemplate } from '@/types/database'

type EntryStatus = 'entered' | 'racing' | 'withdrawn' | 'DNF' | 'OCS' | 'protest'

interface RaceEntry {
  id: string
  race_id: string
  boat_id: string | null
  class_id: string | null
  status: EntryStatus
  helm_name: string | null
  phone: string | null
  created_at: string
  boat: { boat_name: string; sail_number: string | null } | null
  start_class: { name: string } | null
}

const entryStatusVariant: Record<EntryStatus, string> = {
  entered: 'bg-blue-100 text-blue-700',
  racing: 'bg-green-100 text-green-700',
  withdrawn: 'bg-gray-100 text-gray-500',
  DNF: 'bg-amber-100 text-amber-700',
  OCS: 'bg-red-100 text-red-700',
  protest: 'bg-purple-100 text-purple-700',
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  planned: 'info',
  confirmed: 'success',
  live: 'danger',
  cancelled: 'danger',
  completed: 'warning',
  archived: 'default',
}

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  planned: 'Planned',
  confirmed: 'Confirmed',
  live: 'Racing Live 🔴',
  cancelled: 'Cancelled',
  completed: 'Completed',
  archived: 'Archived',
}

// Valid status transitions
const statusTransitions: Record<string, { label: string; to: string; style: string }[]> = {
  draft: [
    { label: 'Publish Race', to: 'planned', style: 'bg-blue-600 hover:bg-blue-700 text-white' },
  ],
  planned: [
    { label: 'Confirm Race', to: 'confirmed', style: 'bg-green-600 hover:bg-green-700 text-white' },
    { label: 'Cancel Race', to: 'cancelled', style: 'bg-red-100 hover:bg-red-200 text-red-700' },
    { label: 'Back to Draft', to: 'draft', style: 'bg-gray-100 hover:bg-gray-200 text-gray-700' },
  ],
  confirmed: [
    { label: '🏁 Go Live', to: 'live', style: 'bg-green-600 hover:bg-green-700 text-white' },
    { label: 'Cancel Race', to: 'cancelled', style: 'bg-red-100 hover:bg-red-200 text-red-700' },
  ],
  live: [
    { label: 'Complete Race', to: 'completed', style: 'bg-amber-600 hover:bg-amber-700 text-white' },
    { label: 'Cancel Race', to: 'cancelled', style: 'bg-red-100 hover:bg-red-200 text-red-700' },
  ],
  cancelled: [
    { label: 'Reopen Race', to: 'planned', style: 'bg-blue-100 hover:bg-blue-200 text-blue-700' },
  ],
  completed: [
    { label: 'Archive Race', to: 'archived', style: 'bg-gray-100 hover:bg-gray-200 text-gray-700' },
  ],
  archived: [],
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

/** Format a timestamptz to HH:MM */
function formatTime(ts: string): string {
  const d = new Date(ts)
  return d.toISOString().slice(11, 16)
}

/** Add minutes to a HH:MM string */
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

interface StartClass {
  id: string
  race_id: string
  name: string
  class_flag: string | null
  prep_flag: 'P' | 'I' | 'U' | 'Black'
  start_time: string // timestamptz from DB
  sequence_warning_mins: number
}

interface EditingClass {
  id: string | null // null = new
  name: string
  class_flag: string
  prep_flag: 'P' | 'I' | 'U' | 'Black'
  start_time_hhmm: string
  sequence_warning_mins: number
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
  const [changingStatus, setChangingStatus] = useState(false)

  // Start classes
  const [startClasses, setStartClasses] = useState<StartClass[]>([])
  const [editingClass, setEditingClass] = useState<EditingClass | null>(null)

  // Entries
  const [entries, setEntries] = useState<RaceEntry[]>([])
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null)
  const [deletingEntry, setDeletingEntry] = useState(false)
  const [updatingEntryStatus, setUpdatingEntryStatus] = useState<string | null>(null)

  // Messages
  const [messages, setMessages] = useState<{ id: string; message: string; is_headline: boolean; created_at: string }[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isHeadline, setIsHeadline] = useState(false)
  const [postingMessage, setPostingMessage] = useState(false)
  const [savingClass, setSavingClass] = useState(false)
  const [classError, setClassError] = useState('')

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

      // Fetch start classes
      const { data: classes } = await supabase
        .from('start_classes')
        .select('*')
        .eq('race_id', id)
        .order('start_time', { ascending: true })

      if (classes) setStartClasses(classes as StartClass[])

      // Fetch race entries
      const { data: entriesData } = await supabase
        .from('race_entries')
        .select('*, boat:boats(boat_name, sail_number), start_class:start_classes(name)')
        .eq('race_id', id)
        .order('created_at', { ascending: true })
      if (entriesData) setEntries(entriesData as RaceEntry[])

      // Fetch messages
      const { data: msgs } = await supabase
        .from('race_messages')
        .select('id, message, is_headline, created_at')
        .eq('race_id', id)
        .order('created_at', { ascending: false })
      if (msgs) setMessages(msgs)

      setLoading(false)
    }
    fetchRace()
  }, [id, user])

  const entryLink = race
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/race/join/${race.entry_token}`
    : ''

  function handleCopy() {
    if (!entryLink) return
    navigator.clipboard.writeText(entryLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleEntryStatusChange(entryId: string, newStatus: EntryStatus) {
    setUpdatingEntryStatus(entryId)
    const supabase = getBrowserClient()
    const { error: err } = await supabase
      .from('race_entries')
      .update({ status: newStatus })
      .eq('id', entryId)
    if (!err) {
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: newStatus } : e))
    }
    setUpdatingEntryStatus(null)
  }

  async function handleDeleteEntry(entryId: string) {
    setDeletingEntry(true)
    const supabase = getBrowserClient()
    const { error: err } = await supabase
      .from('race_entries')
      .delete()
      .eq('id', entryId)
    if (!err) {
      setEntries(prev => prev.filter(e => e.id !== entryId))
    }
    setDeletingEntry(false)
    setEntryToDelete(null)
  }

  async function handlePostMessage() {
    if (!race || !newMessage.trim()) return
    setPostingMessage(true)
    const supabase = getBrowserClient()
    const { data, error: err } = await supabase
      .from('race_messages')
      .insert({ race_id: race.id, author_id: user?.id, message: newMessage.trim(), is_headline: isHeadline })
      .select('id, message, is_headline, created_at')
      .single()
    if (!err && data) {
      setMessages(prev => [data, ...prev])
      setNewMessage('')
      setIsHeadline(false)
    }
    setPostingMessage(false)
  }

  async function handleDeleteMessage(msgId: string) {
    const supabase = getBrowserClient()
    await supabase.from('race_messages').delete().eq('id', msgId)
    setMessages(prev => prev.filter(m => m.id !== msgId))
  }

  async function handleStatusChange(newStatus: string) {
    if (!race) return
    setChangingStatus(true)
    const supabase = getBrowserClient()
    const { error: err } = await supabase
      .from('races')
      .update({ status: newStatus })
      .eq('id', race.id)
    if (err) {
      setError(err.message)
    } else {
      setRace({ ...race, status: newStatus as Race['status'] })
    }
    setChangingStatus(false)
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

  // Start class editing
  function openAddClass() {
    if (!race) return
    const raceStartTime = extractStartTime(race.notes)
    const lastClass = startClasses[startClasses.length - 1]
    const defaultTime = lastClass
      ? addMinutes(formatTime(lastClass.start_time), 5)
      : (raceStartTime || '10:00')

    setEditingClass({
      id: null,
      name: '',
      class_flag: '',
      prep_flag: 'P',
      start_time_hhmm: defaultTime,
      sequence_warning_mins: 5,
    })
    setClassError('')
  }

  function openEditClass(cls: StartClass) {
    setEditingClass({
      id: cls.id,
      name: cls.name,
      class_flag: cls.class_flag || '',
      prep_flag: cls.prep_flag,
      start_time_hhmm: formatTime(cls.start_time),
      sequence_warning_mins: cls.sequence_warning_mins,
    })
    setClassError('')
  }

  async function saveClass() {
    if (!editingClass || !race) return
    if (!editingClass.name.trim()) {
      setClassError('Class name is required')
      return
    }

    setSavingClass(true)
    setClassError('')
    const supabase = getBrowserClient()

    const raceDate = race.race_date
    const startTimestamptz = `${raceDate}T${editingClass.start_time_hhmm}:00Z`

    if (editingClass.id) {
      // Update existing
      const { error: err } = await supabase
        .from('start_classes')
        .update({
          name: editingClass.name.trim(),
          class_flag: editingClass.class_flag.trim() || null,
          prep_flag: editingClass.prep_flag,
          start_time: startTimestamptz,
          sequence_warning_mins: editingClass.sequence_warning_mins,
        })
        .eq('id', editingClass.id)

      if (err) {
        setClassError(err.message)
        setSavingClass(false)
        return
      }

      setStartClasses(prev => prev.map(c =>
        c.id === editingClass.id
          ? {
            ...c,
            name: editingClass.name.trim(),
            class_flag: editingClass.class_flag.trim() || null,
            prep_flag: editingClass.prep_flag,
            start_time: startTimestamptz,
            sequence_warning_mins: editingClass.sequence_warning_mins,
          }
          : c
      ).sort((a, b) => a.start_time.localeCompare(b.start_time)))
    } else {
      // Insert new
      const { data: newClass, error: err } = await supabase
        .from('start_classes')
        .insert({
          race_id: race.id,
          name: editingClass.name.trim(),
          class_flag: editingClass.class_flag.trim() || null,
          prep_flag: editingClass.prep_flag,
          start_time: startTimestamptz,
          sequence_warning_mins: editingClass.sequence_warning_mins,
        })
        .select()
        .single()

      if (err) {
        setClassError(err.message)
        setSavingClass(false)
        return
      }

      if (newClass) {
        setStartClasses(prev =>
          [...prev, newClass as StartClass].sort((a, b) => a.start_time.localeCompare(b.start_time))
        )
      }
    }

    setSavingClass(false)
    setEditingClass(null)
  }

  async function deleteClass(classId: string) {
    const supabase = getBrowserClient()
    const { error: err } = await supabase
      .from('start_classes')
      .delete()
      .eq('id', classId)

    if (!err) {
      setStartClasses(prev => prev.filter(c => c.id !== classId))
    }
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

  // Calculate sequence start time from first class warning signal
  const sequenceStartTime = startClasses.length > 0
    ? addMinutes(formatTime(startClasses[0].start_time), -startClasses[0].sequence_warning_mins)
    : null

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
          <p className="text-sm text-gray-500 mt-1">
            {formatDate(race.race_date)}
          </p>
          {/* Time badges */}
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {startTime && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                🏁 Start Time: {startTime}
              </span>
            )}
            {sequenceStartTime && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                🚩 Sequence starts: {sequenceStartTime}
              </span>
            )}
          </div>
          {race.series && (
            <p className="text-xs text-gray-400 mt-1">{race.series}</p>
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

      {/* Officers race too: jump to the participant hub to enter & sail this race */}
      <Link
        href={`/race/centre/${race.entry_token}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 hover:bg-blue-100 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-blue-900">🏁 Enter &amp; race this yourself</p>
          <p className="text-xs text-blue-700/80 mt-0.5">Open the participant Race Centre — enter in advance, then nav/track on the day.</p>
        </div>
        <span className="shrink-0 text-blue-700 font-medium text-sm">Race Centre →</span>
      </Link>

      {/* Status actions */}
      {(statusTransitions[race.status] ?? []).length > 0 && (
        <Card>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500 mr-1">Status:</span>
            {(statusTransitions[race.status] ?? []).map(t => (
              <button
                key={t.to}
                onClick={() => handleStatusChange(t.to)}
                disabled={changingStatus}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${t.style} ${changingStatus ? 'opacity-50' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Race Messages */}
      <Card>
        <CardHeader>
          <CardTitle>📢 Race Messages</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          {/* Headline messages at top */}
          {messages.filter(m => m.is_headline).map(m => (
            <div key={m.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">📌 Headline</span>
                <p className="text-sm font-medium text-gray-900 mt-0.5">{m.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">{new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <button onClick={() => handleDeleteMessage(m.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">×</button>
            </div>
          ))}

          {/* Regular messages */}
          {messages.filter(m => !m.is_headline).map(m => (
            <div key={m.id} className="border border-gray-100 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-gray-800">{m.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">{new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <button onClick={() => handleDeleteMessage(m.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">×</button>
            </div>
          ))}

          {messages.length === 0 && (
            <p className="text-sm text-gray-400 italic">No messages yet</p>
          )}

          {/* Post new message */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Post a message to competitors…"
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={isHeadline}
                  onChange={(e) => setIsHeadline(e.target.checked)}
                  className="rounded border-gray-300"
                />
                📌 Headline message
              </label>
              <Button
                type="button"
                size="sm"
                onClick={handlePostMessage}
                loading={postingMessage}
                disabled={!newMessage.trim()}
              >
                Post
              </Button>
            </div>
          </div>
        </div>
      </Card>

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

      {/* START SEQUENCE */}
      <Card>
        <CardHeader>
          <CardTitle>⏱ Start sequence</CardTitle>
          <Button type="button" variant="secondary" size="sm" onClick={openAddClass}>
            + Add class
          </Button>
        </CardHeader>

        {startClasses.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">No start classes defined yet.</p>
            <button
              type="button"
              onClick={openAddClass}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 py-2 px-4 border-2 border-dashed border-blue-200 hover:border-blue-300 rounded-lg transition-colors w-full"
            >
              + Add first class
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {startClasses.map((cls, idx) => {
              const clsTime = formatTime(cls.start_time)
              const warnTime = addMinutes(clsTime, -cls.sequence_warning_mins)
              const prepTime = addMinutes(warnTime, 1)
              const isFirst = idx === 0

              return (
                <div key={cls.id} className="rounded-lg border border-gray-200 overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{cls.name}</span>
                      {cls.class_flag && (
                        <span className="text-xs text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5">
                          🏴 {cls.class_flag}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5">
                        Prep: {cls.prep_flag}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditClass(cls)}
                        className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteClass(cls.id)}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="px-3 py-2 space-y-1">
                    {isFirst && (
                      <div className="text-xs text-amber-600 font-semibold mb-1.5">
                        🚩 First warning at {warnTime}
                      </div>
                    )}
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-sm font-medium text-gray-700 w-12 flex-shrink-0">{warnTime}</span>
                      <span className="text-xs text-gray-500">🚩 Warning signal</span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-sm font-medium text-gray-700 w-12 flex-shrink-0">{prepTime}</span>
                      <span className="text-xs text-gray-500">⚑ Prep signal</span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-sm font-semibold text-gray-900 w-12 flex-shrink-0">{clsTime}</span>
                      <span className="text-xs font-medium text-gray-700">🏁 Start</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Entries / Competitors */}
      <Card>
        <CardHeader>
          <CardTitle>⛵ Competitors ({entries.length})</CardTitle>
        </CardHeader>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400">No entries yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {entry.helm_name || '—'}
                    </span>
                    {entry.boat && (
                      <span className="text-sm text-gray-500">
                        {entry.boat.boat_name}
                        {entry.boat.sail_number && (
                          <span className="ml-1 text-gray-400">#{entry.boat.sail_number}</span>
                        )}
                      </span>
                    )}
                    {entry.start_class && (
                      <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                        {entry.start_class.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entryStatusVariant[entry.status]}`}>
                    {entry.status}
                  </span>
                  <select
                    value={entry.status}
                    onChange={(e) => handleEntryStatusChange(entry.id, e.target.value as EntryStatus)}
                    disabled={updatingEntryStatus === entry.id}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="entered">entered</option>
                    <option value="racing">racing</option>
                    <option value="withdrawn">withdrawn</option>
                    <option value="DNF">DNF</option>
                    <option value="OCS">OCS</option>
                    <option value="protest">protest</option>
                  </select>
                  <button
                    onClick={() => setEntryToDelete(entry.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50 transition-colors"
                    title="Remove entry"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Live Race Links - shown when race is live */}
      {race.status === 'live' && (
        <Card>
          <CardHeader>
            <CardTitle>🔴 Race is Live</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Share these links with competitors and spectators:</p>
            <div className="flex flex-col gap-2">
              <Link
                href={`/race/live/${race.entry_token}`}
                className="flex items-center gap-2 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                📱 Race Navigation
              </Link>
              <span className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed">
                👁 Spectator View <span className="text-xs text-gray-400">(coming soon)</span>
              </span>
              <span className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed">
                🎛 Race Control <span className="text-xs text-gray-400">(coming soon)</span>
              </span>
            </div>
          </div>
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

      {/* Delete entry confirmation */}
      {entryToDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Remove entry?</h3>
            <p className="text-sm text-gray-500">
              This will remove the competitor from <strong>{race.name}</strong>.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setEntryToDelete(null)}
                disabled={deletingEntry}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={deletingEntry}
                onClick={() => handleDeleteEntry(entryToDelete)}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {/* Add/Edit class modal */}
      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingClass.id ? 'Edit class' : 'Add class'}
            </h3>

            <div className="space-y-3">
              <Input
                label="Class name"
                value={editingClass.name}
                onChange={(e) => setEditingClass(prev => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="e.g. Fast Handicap"
                autoFocus
              />

              <Input
                label="Class flag (optional)"
                value={editingClass.class_flag}
                onChange={(e) => setEditingClass(prev => prev ? { ...prev, class_flag: e.target.value } : null)}
                placeholder="e.g. Class 1"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Prep flag</label>
                  <select
                    value={editingClass.prep_flag}
                    onChange={(e) => setEditingClass(prev => prev ? {
                      ...prev,
                      prep_flag: e.target.value as 'P' | 'I' | 'U' | 'Black'
                    } : null)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="P">P</option>
                    <option value="I">I</option>
                    <option value="U">U</option>
                    <option value="Black">Black</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Warning</label>
                  <select
                    value={editingClass.sequence_warning_mins}
                    onChange={(e) => setEditingClass(prev => prev ? {
                      ...prev,
                      sequence_warning_mins: parseInt(e.target.value)
                    } : null)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={3}>3 min</option>
                    <option value={4}>4 min</option>
                    <option value={5}>5 min</option>
                    <option value={10}>10 min</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Start time</label>
                <input
                  type="time"
                  value={editingClass.start_time_hhmm}
                  onChange={(e) => setEditingClass(prev => prev ? { ...prev, start_time_hhmm: e.target.value } : null)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Mini preview */}
              {editingClass.start_time_hhmm && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5 border border-gray-200">
                  <div>
                    <span className="font-mono">{addMinutes(editingClass.start_time_hhmm, -editingClass.sequence_warning_mins)}</span>
                    {' '}Warning signal
                  </div>
                  <div>
                    <span className="font-mono">{addMinutes(editingClass.start_time_hhmm, -editingClass.sequence_warning_mins + 1)}</span>
                    {' '}Prep signal
                  </div>
                  <div className="font-medium text-gray-700">
                    <span className="font-mono">{editingClass.start_time_hhmm}</span>
                    {' '}🏁 Start
                  </div>
                </div>
              )}
            </div>

            {classError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{classError}</p>
            )}

            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { setEditingClass(null); setClassError('') }}
                disabled={savingClass}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                loading={savingClass}
                onClick={saveClass}
              >
                {editingClass.id ? 'Save changes' : 'Add class'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
