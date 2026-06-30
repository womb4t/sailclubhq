'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { Race } from '@/types/database'

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  planned: 'info',
  confirmed: 'success',
  cancelled: 'danger',
  completed: 'warning',
  archived: 'default',
}

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  planned: 'Planned',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  archived: 'Archived',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function extractStartTime(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/^Start time: (\d{2}:\d{2})/)
  return match ? match[1] : null
}

export default function RacesPage() {
  const [races, setRaces] = useState<Race[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Race | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [showShare, setShowShare] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  async function fetchRaces() {
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
        .from('races')
        .select('*')
        .eq('club_id', profile.club_id)
        .order('race_date', { ascending: false })
      setRaces((data as Race[]) ?? [])

      const { data: club } = await supabase
        .from('clubs')
        .select('invite_code')
        .eq('id', profile.club_id)
        .maybeSingle()
      setInviteCode((club as { invite_code: string } | null)?.invite_code ?? null)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchRaces()
  }, [])

  // Close share panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShowShare(false)
      }
    }
    if (showShare) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showShare])

  function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    async function copy() {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
    return (
      <button
        onClick={copy}
        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors flex-shrink-0"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    )
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = getBrowserClient()
    await supabase.from('races').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    setDeleting(false)
    fetchRaces()
  }

  const activeRaces = races.filter((r) => r.status === 'confirmed')
  const upcomingRaces = races.filter((r) => r.status === 'planned' || r.status === 'draft')
  const pastRaces = races.filter((r) => r.status === 'completed' || r.status === 'cancelled' || r.status === 'archived')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  function RaceRow({ race }: { race: Race }) {
    const startTime = extractStartTime(race.notes)
    return (
      <Card className="hover:border-blue-200 transition-all">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/dashboard/races/${race.id}`} className="flex-1 min-w-0 block">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{race.name}</span>
              {race.race_number && (
                <span className="text-xs text-gray-400">#{race.race_number}</span>
              )}
              <Badge variant={statusVariant[race.status] ?? 'default'}>
                {statusLabel[race.status] ?? race.status}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {formatDate(race.race_date)}
              {startTime && <span className="ml-1 text-gray-400">at {startTime}</span>}
            </p>
            {race.series && (
              <p className="text-xs text-gray-400 mt-0.5">{race.series}</p>
            )}
          </Link>
          <div className="flex gap-1.5 flex-shrink-0">
            <Link href={`/dashboard/races/${race.id}/edit`}>
              <Button variant="ghost" size="sm">Edit</Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(race)}
              className="text-red-500 hover:text-red-700"
            >
              Delete
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Races</h1>
          <p className="text-sm text-gray-500 mt-0.5">{races.length} race{races.length !== 1 ? 's' : ''} total</p>
        </div>
        <div className="flex items-center gap-2">
          {inviteCode && (
            <div className="relative" ref={shareRef}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowShare((v) => !v)}
                title="Publish Your Race Calendar"
              >
                📡 Public Calendar
              </Button>
              {showShare && (
                <div className="absolute right-0 top-full mt-2 z-40 w-80 bg-white rounded-xl border border-gray-200 shadow-xl p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">Share Race Calendar</h3>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-600">🔗 Public link</p>
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-200">
                      <span className="flex-1 text-xs text-gray-700 truncate font-mono">
                        {typeof window !== 'undefined' ? `${window.location.origin}/races/${inviteCode}` : `/races/${inviteCode}`}
                      </span>
                      <CopyButton text={typeof window !== 'undefined' ? `${window.location.origin}/races/${inviteCode}` : `/races/${inviteCode}`} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-600">📋 Embed code</p>
                    <div className="flex items-start gap-2 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-200">
                      <span className="flex-1 text-xs text-gray-700 break-all font-mono">
                        {`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/races/${inviteCode}/embed" width="100%" height="600" frameborder="0"></iframe>`}
                      </span>
                      <CopyButton text={`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/races/${inviteCode}/embed" width="100%" height="600" frameborder="0"></iframe>`} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-600">📡 RSS feed</p>
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-200">
                      <span className="flex-1 text-xs text-gray-700 truncate font-mono">
                        {typeof window !== 'undefined' ? `${window.location.origin}/races/${inviteCode}/feed` : `/races/${inviteCode}/feed`}
                      </span>
                      <CopyButton text={typeof window !== 'undefined' ? `${window.location.origin}/races/${inviteCode}/feed` : `/races/${inviteCode}/feed`} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <Link href="/dashboard/races/new">
            <Button size="sm">+ New race</Button>
          </Link>
        </div>
      </div>

      {races.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏁</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">No races yet</h2>
          <p className="text-sm text-gray-400 mb-6">
            Create your first race to get started.
          </p>
          <Link href="/dashboard/races/new">
            <Button>Create first race</Button>
          </Link>
        </div>
      ) : (
        <>
          {activeRaces.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">🟢 Racing now</h2>
              <div className="space-y-2">
                {activeRaces.map((r) => <RaceRow key={r.id} race={r} />)}
              </div>
            </section>
          )}

          {upcomingRaces.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">📅 Upcoming</h2>
              <div className="space-y-2">
                {upcomingRaces.map((r) => <RaceRow key={r.id} race={r} />)}
              </div>
            </section>
          )}

          {pastRaces.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">✅ Finished</h2>
              <div className="space-y-2">
                {pastRaces.map((r) => <RaceRow key={r.id} race={r} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Delete race?</h3>
            <p className="text-sm text-gray-500">
              This will permanently delete <strong>{deleteTarget.name}</strong>. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setDeleteTarget(null)}
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
