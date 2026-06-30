'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import type { MarkType, RoundingSide } from '@/types/database'

interface ChangeLog {
  id: string
  changed_by: string
  changed_at: string
  reason: string
  field_name: string
  old_value: string | null
  new_value: string | null
  profile?: { full_name: string | null }
}

export default function EditMarkPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const markId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showReasonModal, setShowReasonModal] = useState(false)
  const [reason, setReason] = useState('')
  const [changes, setChanges] = useState<ChangeLog[]>([])

  // Current values (from DB)
  const [original, setOriginal] = useState<Record<string, string>>({})

  // Form values
  const [name, setName] = useState('')
  const [shortId, setShortId] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [markType, setMarkType] = useState<MarkType>('virtual')
  const [defaultRounding, setDefaultRounding] = useState<RoundingSide>('port')
  const [notes, setNotes] = useState('')
  const [createdByName, setCreatedByName] = useState('')

  useEffect(() => {
    if (!user || !markId) return

    async function fetchMark() {
      const supabase = getBrowserClient()

      const { data: mark } = await supabase
        .from('marks')
        .select('*')
        .eq('id', markId)
        .single()

      if (!mark) {
        router.push('/dashboard/marks')
        return
      }

      setName(mark.name)
      setShortId(mark.short_id)
      setLat(String(mark.lat || ''))
      setLon(String(mark.lon || ''))
      setMarkType(mark.type)
      setDefaultRounding(mark.default_rounding)
      setNotes(mark.notes || '')

      setOriginal({
        name: mark.name,
        short_id: mark.short_id,
        lat: String(mark.lat || ''),
        lon: String(mark.lon || ''),
        type: mark.type,
        default_rounding: mark.default_rounding,
        notes: mark.notes || '',
      })

      // Get creator name
      if (mark.created_by) {
        const { data: creator } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', mark.created_by)
          .maybeSingle()
        setCreatedByName(creator?.full_name || 'Unknown')
      }

      // Get change log
      const { data: logs } = await supabase
        .from('mark_changes')
        .select('*')
        .eq('mark_id', markId)
        .order('changed_at', { ascending: false })
        .limit(50)

      if (logs && logs.length > 0) {
        // Get profile names for all changers
        const userIds = [...new Set(logs.map(l => l.changed_by))]
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds)

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) ?? [])

        setChanges(logs.map(l => ({
          ...l,
          profile: { full_name: profileMap.get(l.changed_by) || null }
        })))
      }

      setLoading(false)
    }

    fetchMark()
  }, [user, markId, router])

  function getChangedFields(): { field: string; oldVal: string; newVal: string }[] {
    const diffs: { field: string; oldVal: string; newVal: string }[] = []
    const current: Record<string, string> = {
      name, short_id: shortId, lat, lon, type: markType, default_rounding: defaultRounding, notes,
    }

    for (const [key, val] of Object.entries(current)) {
      if (val !== (original[key] ?? '')) {
        diffs.push({ field: key, oldVal: original[key] ?? '', newVal: val })
      }
    }
    return diffs
  }

  function handleSaveClick(e: React.FormEvent) {
    e.preventDefault()
    const diffs = getChangedFields()
    if (diffs.length === 0) {
      router.push('/dashboard/marks')
      return
    }
    setShowReasonModal(true)
  }

  async function handleConfirmSave() {
    if (!reason.trim()) return

    setSaving(true)
    setError('')

    const supabase = getBrowserClient()
    if (!user) return

    const diffs = getChangedFields()

    // Update the mark
    const { error: updateErr } = await supabase
      .from('marks')
      .update({
        name: name.trim(),
        short_id: shortId.trim().toUpperCase(),
        lat: lat ? parseFloat(lat) : 0,
        lon: lon ? parseFloat(lon) : 0,
        type: markType,
        default_rounding: defaultRounding,
        notes: notes.trim() || null,
      })
      .eq('id', markId)

    if (updateErr) {
      setError(updateErr.message)
      setSaving(false)
      return
    }

    // Log each changed field
    const logEntries = diffs.map(d => ({
      mark_id: markId,
      changed_by: user.id,
      reason: reason.trim(),
      field_name: d.field,
      old_value: d.oldVal || null,
      new_value: d.newVal || null,
    }))

    await supabase.from('mark_changes').insert(logEntries)

    router.push('/dashboard/marks')
  }

  const fieldLabels: Record<string, string> = {
    name: 'Name',
    short_id: 'Short ID',
    lat: 'Latitude',
    lon: 'Longitude',
    type: 'Type',
    default_rounding: 'Default rounding',
    notes: 'Notes',
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit mark</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {createdByName && `Created by ${createdByName}`}
        </p>
      </div>

      <form onSubmit={handleSaveClick} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Mark details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input label="Short ID" value={shortId} onChange={(e) => setShortId(e.target.value)} required />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Type</label>
              <div className="flex gap-3 mt-1">
                <button type="button" onClick={() => setMarkType('virtual')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${markType === 'virtual' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-600'}`}>
                  📍 Virtual
                </button>
                <button type="button" onClick={() => setMarkType('physical')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${markType === 'physical' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-600'}`}>
                  🔶 Physical
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Default rounding</label>
              <div className="flex gap-3 mt-1">
                <button type="button" onClick={() => setDefaultRounding('port')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${defaultRounding === 'port' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-300 text-gray-600'}`}>
                  🔴 Port
                </button>
                <button type="button" onClick={() => setDefaultRounding('starboard')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${defaultRounding === 'starboard' ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-600'}`}>
                  🟢 Starboard
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Position</CardTitle></CardHeader>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
            <Input label="Longitude" type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} />
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </Card>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()} className="flex-1">Cancel</Button>
          <Button type="submit" className="flex-1" size="lg">Save changes</Button>
        </div>
      </form>

      {/* Reason modal */}
      {showReasonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Why are you making this change?</h2>
            <p className="text-sm text-gray-500">
              This will be recorded in the mark history so other members can see why it changed.
            </p>
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">Changes:</p>
              {getChangedFields().map((d) => (
                <p key={d.field} className="text-xs text-gray-600">
                  <strong>{fieldLabels[d.field] || d.field}:</strong>{' '}
                  <span className="text-red-500 line-through">{d.oldVal || '(empty)'}</span>{' '}
                  → <span className="text-green-600">{d.newVal || '(empty)'}</span>
                </p>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Mark relocated after harbour dredging"
              rows={2}
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => { setShowReasonModal(false); setReason('') }} className="flex-1">
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirmSave} loading={saving} disabled={!reason.trim()} className="flex-1" size="lg">
                Confirm & save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Change history */}
      {changes.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Change history</CardTitle></CardHeader>
          <div className="space-y-3">
            {changes.map((c) => (
              <div key={c.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-900">
                      <strong>{fieldLabels[c.field_name] || c.field_name}</strong>:{' '}
                      <span className="text-red-500 line-through text-xs">{c.old_value || '(empty)'}</span>{' '}
                      → <span className="text-green-600 text-xs">{c.new_value || '(empty)'}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 italic">&ldquo;{c.reason}&rdquo;</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">{c.profile?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-gray-300">{new Date(c.changed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
