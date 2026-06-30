'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'

interface ClubData {
  id: string
  name: string
  vhf_channel: string | null
  invite_code: string | null
}

interface MemberData {
  id: string
  full_name: string | null
  role: string
}

interface SeriesData {
  id: string
  name: string
  description: string | null
  is_active: boolean
  archive_after_days: number | null
}

export default function SettingsPage() {
  const { user } = useAuth()
  const [club, setClub] = useState<ClubData | null>(null)
  const [members, setMembers] = useState<MemberData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [clubName, setClubName] = useState('')
  const [vhfChannel, setVhfChannel] = useState('')

  // Series management
  const [seriesList, setSeriesList] = useState<SeriesData[]>([])
  const [newSeriesName, setNewSeriesName] = useState('')
  const [newSeriesDesc, setNewSeriesDesc] = useState('')
  const [addingSeries, setAddingSeries] = useState(false)
  const [editingSeries, setEditingSeries] = useState<string | null>(null)
  const [editSeriesName, setEditSeriesName] = useState('')
  const [editSeriesDesc, setEditSeriesDesc] = useState('')
  const [editSeriesArchiveDays, setEditSeriesArchiveDays] = useState('30')
  const [newSeriesArchiveDays, setNewSeriesArchiveDays] = useState('365')
  const [deleteSeries, setDeleteSeries] = useState<SeriesData | null>(null)
  const [seriesError, setSeriesError] = useState('')

  useEffect(() => {
    if (!user) return

    async function fetchData() {
      const supabase = getBrowserClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id, role')
        .eq('id', user!.id)
        .maybeSingle()

      if (!profile?.club_id) { setLoading(false); return }

      const [{ data: clubData }, { data: memberData }] = await Promise.all([
        supabase
          .from('clubs')
          .select('id, name, vhf_channel, invite_code')
          .eq('id', profile.club_id)
          .single(),
        supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('club_id', profile.club_id)
          .order('role'),
      ])

      if (clubData) {
        setClub(clubData)
        setClubName(clubData.name)
        setVhfChannel(clubData.vhf_channel ?? '')
      }
      setMembers(memberData ?? [])

      // Fetch series
      const { data: seriesData } = await supabase
        .from('race_series')
        .select('*')
        .eq('club_id', profile.club_id)
        .order('name')
      setSeriesList((seriesData as SeriesData[]) ?? [])

      setLoading(false)
    }

    fetchData()
  }, [user])

  async function handleAddSeries() {
    if (!club || !newSeriesName.trim()) return
    setSeriesError('')
    setAddingSeries(true)
    const supabase = getBrowserClient()
    const { data, error: err } = await supabase
      .from('race_series')
      .insert({
        club_id: club.id,
        name: newSeriesName.trim(),
        description: newSeriesDesc.trim() || null,
        archive_after_days: parseInt(newSeriesArchiveDays) || 365,
      })
      .select()
      .single()
    if (err) {
      setSeriesError(err.message.includes('unique') ? 'A series with that name already exists' : err.message)
    } else if (data) {
      setSeriesList(prev => [...prev, data as SeriesData].sort((a, b) => a.name.localeCompare(b.name)))
      setNewSeriesName('')
      setNewSeriesDesc('')
      setNewSeriesArchiveDays('30')
    }
    setAddingSeries(false)
  }

  async function handleUpdateSeries(id: string) {
    if (!editSeriesName.trim()) return
    const supabase = getBrowserClient()
    const { error: err } = await supabase
      .from('race_series')
      .update({
        name: editSeriesName.trim(),
        description: editSeriesDesc.trim() || null,
        archive_after_days: parseInt(editSeriesArchiveDays) || 365,
      })
      .eq('id', id)
    if (err) {
      setSeriesError(err.message)
    } else {
      setSeriesList(prev => prev.map(s => s.id === id ? { ...s, name: editSeriesName.trim(), description: editSeriesDesc.trim() || null, archive_after_days: parseInt(editSeriesArchiveDays) || 365 } : s))
      setEditingSeries(null)
    }
  }

  async function handleDeleteSeries() {
    if (!deleteSeries) return
    const supabase = getBrowserClient()
    await supabase.from('race_series').delete().eq('id', deleteSeries.id)
    setSeriesList(prev => prev.filter(s => s.id !== deleteSeries.id))
    setDeleteSeries(null)
  }

  async function handleToggleSeries(id: string, active: boolean) {
    const supabase = getBrowserClient()
    await supabase.from('race_series').update({ is_active: active }).eq('id', id)
    setSeriesList(prev => prev.map(s => s.id === id ? { ...s, is_active: active } : s))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!club) return

    setError('')
    setSuccess('')
    setSaving(true)

    const supabase = getBrowserClient()
    const { error: err } = await supabase
      .from('clubs')
      .update({
        name: clubName.trim(),
        vhf_channel: vhfChannel.trim() || null,
      })
      .eq('id', club.id)

    if (err) {
      setError(err.message)
    } else {
      setSuccess('Saved')
      setTimeout(() => setSuccess(''), 2000)
    }
    setSaving(false)
  }

  function getInviteUrl() {
    if (!club?.invite_code) return ''
    return `${window.location.origin}/join/${club.invite_code}`
  }

  async function copyInviteLink() {
    const url = getInviteUrl()
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const roleLabels: Record<string, string> = {
    admin: '👑 Admin',
    race_officer: '🏁 Race Officer',
    ood: '📋 OOD',
    competitor: '⛵ Competitor',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (!club) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">No club linked.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Club settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">{club.name}</p>
      </div>

      {/* Invite link */}
      <Card>
        <CardHeader>
          <CardTitle>Invite members</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Share this link with club members so they can sign up and join your club automatically.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={getInviteUrl()}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700 font-mono"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button type="button" variant="secondary" size="sm" onClick={copyInviteLink}>
              {copied ? '✅ Copied' : '📋 Copy'}
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            Invite code: <code className="bg-gray-100 px-1 rounded">{club.invite_code}</code>
          </p>
        </div>
      </Card>

      {/* Club details */}
      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle>Club details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Club name"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              required
            />
            <Input
              label="Default VHF channel"
              value={vhfChannel}
              onChange={(e) => setVhfChannel(e.target.value)}
              placeholder="M2"
              hint="Pre-fills on new races"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
            <Button type="submit" loading={saving} size="sm">Save changes</Button>
          </div>
        </Card>
      </form>

      {/* Race Series */}
      <Card>
        <CardHeader>
          <CardTitle>Race Series</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Manage the race series your club runs. These appear in the dropdown when creating new races.
          </p>

          {/* Existing series */}
          {seriesList.length > 0 ? (
            <div className="space-y-2">
              {seriesList.map(s => (
                <div key={s.id} className={`flex items-center justify-between py-2.5 px-3 rounded-lg border ${s.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                  {editingSeries === s.id ? (
                    <div className="flex-1 space-y-2">
                      <input
                        value={editSeriesName}
                        onChange={e => setEditSeriesName(e.target.value)}
                        className="w-full text-sm font-medium rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <input
                        value={editSeriesDesc}
                        onChange={e => setEditSeriesDesc(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full text-xs rounded-md border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Archive after</span>
                        <select
                          value={editSeriesArchiveDays}
                          onChange={e => setEditSeriesArchiveDays(e.target.value)}
                          className="text-xs rounded-md border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                          <option value="180">6 months</option>
                          <option value="365">12 months</option>
                          <option value="-1">Manual only</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleUpdateSeries(s.id)} className="text-xs font-medium text-blue-600 hover:text-blue-700">Save</button>
                        <button onClick={() => setEditingSeries(null)} className="text-xs font-medium text-gray-400 hover:text-gray-600">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{s.name}</span>
                          {!s.is_active && <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Inactive</span>}
                        </div>
                        {s.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{s.description}</p>}
                        <p className="text-[10px] text-gray-400 mt-0.5">Archive: {s.archive_after_days === -1 ? 'Manual only' : s.archive_after_days === 365 ? '12 months' : s.archive_after_days === 180 ? '6 months' : s.archive_after_days === 90 ? '90 days' : s.archive_after_days === 30 ? '30 days' : `${s.archive_after_days ?? 365} days`}</p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-3 shrink-0">
                        <button
                          onClick={() => { setEditingSeries(s.id); setEditSeriesName(s.name); setEditSeriesDesc(s.description ?? ''); setEditSeriesArchiveDays(String(s.archive_after_days ?? 365)) }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 px-1.5 py-1 rounded hover:bg-blue-50"
                        >Edit</button>
                        <button
                          onClick={() => handleToggleSeries(s.id, !s.is_active)}
                          className={`text-xs font-medium px-1.5 py-1 rounded ${s.is_active ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                        >{s.is_active ? 'Deactivate' : 'Activate'}</button>
                        <button
                          onClick={() => setDeleteSeries(s)}
                          className="text-xs font-medium text-red-400 hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50"
                        >Delete</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No series yet. Add one below.</p>
          )}

          {/* Add new series */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Add new series</p>
            <Input
              value={newSeriesName}
              onChange={e => setNewSeriesName(e.target.value)}
              placeholder="e.g. Summer Evening Series"
            />
            <input
              value={newSeriesDesc}
              onChange={e => setNewSeriesDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Archive completed races after</span>
              <select
                value={newSeriesArchiveDays}
                onChange={e => setNewSeriesArchiveDays(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">6 months</option>
                <option value="365">12 months</option>
                <option value="-1">Manual only</option>
              </select>
            </div>
            {seriesError && <p className="text-xs text-red-600">{seriesError}</p>}
            <Button
              type="button"
              size="sm"
              onClick={handleAddSeries}
              loading={addingSeries}
              disabled={!newSeriesName.trim()}
            >
              + Add series
            </Button>
          </div>
        </div>
      </Card>

      {/* Delete series confirmation */}
      {deleteSeries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteSeries(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 mx-6 max-w-sm w-full">
            <h3 className="font-semibold text-gray-900 text-base mb-2">Delete series?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Delete <strong>{deleteSeries.name}</strong>? Existing races using this series won&apos;t be affected, but it will no longer appear in the dropdown.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteSeries(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
              <button onClick={handleDeleteSeries} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900">{m.full_name ?? 'Unnamed'}</p>
              </div>
              <span className="text-xs text-gray-500">{roleLabels[m.role] ?? m.role}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
