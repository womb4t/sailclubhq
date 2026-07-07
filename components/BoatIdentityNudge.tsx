'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { entryDisplayLabel, isMcNameless } from '@/lib/entry-label'

type MyEntry = {
  id: string
  boat_name: string | null
  sail_number: string | null
}

/**
 * Persistent, non-dismissable prompt shown on a sailor's own screens when their
 * entry has no real boat name (empty or an auto "Boaty McNameless" label).
 * Tapping opens an inline edit to set boat name / sail number. Purely optional:
 * it never blocks anything. Kept separate from the safety-contact + register nudges.
 */
export function BoatIdentityNudge({
  raceId,
  participantId,
  userId,
  compact = false,
}: {
  raceId: string | null | undefined
  participantId?: string | null
  userId?: string | null
  compact?: boolean
}) {
  const [entry, setEntry] = useState<MyEntry | null>(null)
  const [open, setOpen] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [sailInput, setSailInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!raceId || (!participantId && !userId)) return
    const supabase = getBrowserClient()
    let q = supabase
      .from('race_entries')
      .select('id, boat_name, sail_number')
      .eq('race_id', raceId)
      .neq('status', 'withdrawn')
      .limit(1)
    q = userId ? q.eq('user_id', userId) : q.eq('participant_id', participantId!)
    const { data } = await q.maybeSingle()
    if (data) setEntry(data as MyEntry)
  }, [raceId, participantId, userId])

  useEffect(() => {
    load()
  }, [load])

  if (!entry) return null
  // Only nudge when there's no real boat name AND no sail number to fall back on.
  const needsName = isMcNameless(entry.boat_name) && !entry.sail_number?.trim()
  if (!needsName && !open) return null

  async function save() {
    if (!entry) return
    const name = nameInput.trim()
    const sail = sailInput.trim()
    if (!name && !sail) {
      setError('Add a boat name or sail number.')
      return
    }
    setSaving(true)
    setError('')
    const supabase = getBrowserClient()
    const { error: upErr } = await supabase
      .from('race_entries')
      .update({ boat_name: name || null, sail_number: sail || null })
      .eq('id', entry.id)
    setSaving(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    setEntry({ ...entry, boat_name: name || null, sail_number: sail || null })
    setOpen(false)
  }

  const label = entryDisplayLabel(entry)

  if (open) {
    return (
      <div
        className={`rounded-xl border border-indigo-200 bg-indigo-50 ${compact ? 'p-3' : 'p-4'} space-y-3`}
      >
        <p className="text-sm font-medium text-indigo-900">🚤 Name your boat</p>
        <Input
          label="Boat name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="e.g. Kestrel"
          autoFocus
        />
        <Input
          label="Sail number"
          value={sailInput}
          onChange={(e) => setSailInput(e.target.value)}
          placeholder="e.g. 1234"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => {
              setOpen(false)
              setError('')
            }}
          >
            Cancel
          </Button>
          <Button size="sm" className="flex-1" loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setNameInput(isMcNameless(entry.boat_name) ? '' : entry.boat_name ?? '')
        setSailInput(entry.sail_number ?? '')
        setError('')
        setOpen(true)
      }}
      className={`flex w-full items-center gap-2 rounded-full border border-amber-300 bg-amber-50 text-left text-amber-900 hover:bg-amber-100 ${
        compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
      }`}
    >
      <span className="shrink-0">🚤</span>
      <span className="truncate">
        You&apos;re <strong>&lsquo;{label}&rsquo;</strong> — tap to add your boat name or sail number
      </span>
    </button>
  )
}
