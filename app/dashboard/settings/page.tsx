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
  archive_after_months: number | null
  pending_admin_nominee: string | null
  pending_admin_nominated_by: string | null
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
  const [myRole, setMyRole] = useState<string>('member')
  const [nominateBusy, setNominateBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [clubName, setClubName] = useState('')
  const [vhfChannel, setVhfChannel] = useState('')
  const [archiveMonths, setArchiveMonths] = useState('12')

  // Series management
  const [seriesList, setSeriesList] = useState<SeriesData[]>([])
  const [newSeriesName, setNewSeriesName] = useState('')
  const [newSeriesDesc, setNewSeriesDesc] = useState('')
  const [addingSeries, setAddingSeries] = useState(false)
  const [editingSeries, setEditingSeries] = useState<string | null>(null)
  const [editSeriesName, setEditSeriesName] = useState('')
  const [editSeriesDesc, setEditSeriesDesc] = useState('')

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
      setMyRole(profile.role ?? 'member')

      const [{ data: clubData }, { data: memberData }] = await Promise.all([
        supabase
          .from('clubs')
          .select('id, name, vhf_channel, invite_code, archive_after_months, pending_admin_nominee, pending_admin_nominated_by')
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
        setArchiveMonths(String(clubData.archive_after_months ?? 12))
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

  // ── Admin handover (single admin; nominee must accept) ────────────────────────
  async function nominateAdmin(memberId: string) {
    if (!club || !user) return
    if (!confirm('Nominate this member as the new club admin? They must accept, and you will become a member.')) return
    setNominateBusy(true)
    const supabase = getBrowserClient()
    const { error: e } = await supabase
      .from('clubs')
      .update({
        pending_admin_nominee: memberId,
        pending_admin_nominated_by: user.id,
        pending_admin_nominated_at: new Date().toISOString(),
      })
      .eq('id', club.id)
    if (!e) setClub({ ...club, pending_admin_nominee: memberId, pending_admin_nominated_by: user.id })
    setNominateBusy(false)
  }

  async function cancelNomination() {
    if (!club) return
    setNominateBusy(true)
    const supabase = getBrowserClient()
    await supabase
      .from('clubs')
      .update({ pending_admin_nominee: null, pending_admin_nominated_by: null, pending_admin_nominated_at: null })
      .eq('id', club.id)
    setClub({ ...club, pending_admin_nominee: null, pending_admin_nominated_by: null })
    setNominateBusy(false)
  }

  async function respondToNomination(accept: boolean) {
    if (!club || !user) return
    setNominateBusy(true)
    const supabase = getBrowserClient()
    if (accept && club.pending_admin_nominated_by) {
      // Full handover: nominee -> admin, previous admin -> member. Single admin.
      await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id)
      await supabase.from('profiles').update({ role: 'member' }).eq('id', club.pending_admin_nominated_by)
    }
    await supabase
      .from('clubs')
      .update({ pending_admin_nominee: null, pending_admin_nominated_by: null, pending_admin_nominated_at: null })
      .eq('id', club.id)
    setNominateBusy(false)
    window.location.reload()
  }

  // ── Race officer grant / revoke (admin only) ──────────────────────────────
  async function setRaceOfficer(memberId: string, makeOfficer: boolean) {
    setNominateBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('set_race_officer', { target: memberId, make_officer: makeOfficer })
    setNominateBusy(false)
    if (e) { alert('Could not update role: ' + e.message); return }
    if (data === 'granted' || data === 'revoked') {
      setMembers((ms) => ms.map((m) => (m.id === memberId ? { ...m, role: makeOfficer ? 'race_officer' : 'member' } : m)))
    } else {
      alert('Could not update role (' + data + ').')
    }
  }

  // ── Leave club (sole admin must hand over first) ──────────────────────────────
  async function leaveClub() {
    if (!confirm('Leave this club? You’ll lose access to its races and results until you rejoin.')) return
    setNominateBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('leave_club')
    setNominateBusy(false)
    if (e) { alert('Could not leave the club: ' + e.message); return }
    if (data === 'needs-successor') {
      alert('You’re the only admin. Nominate a new admin below and have them accept before you can leave — a club must always keep an admin.')
      return
    }
    window.location.href = '/dashboard/onboarding'
  }

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

      })
      .select()
      .single()
    if (err) {
      setSeriesError(err.message.includes('unique') ? 'A series with that name already exists' : err.message)
    } else if (data) {
      setSeriesList(prev => [...prev, data as SeriesData].sort((a, b) => a.name.localeCompare(b.name)))
      setNewSeriesName('')
      setNewSeriesDesc('')
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
      })
      .eq('id', id)
    if (err) {
      setSeriesError(err.message)
    } else {
      setSeriesList(prev => prev.map(s => s.id === id ? { ...s, name: editSeriesName.trim(), description: editSeriesDesc.trim() || null } : s))
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
        archive_after_months: parseInt(archiveMonths) || 12,
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
    race_officer: '🏳️ Race Officer',
    member: '⛵ Member',
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
            <div>
              <label className="text-sm font-medium text-gray-700">Archive completed races after</label>
              <select
                value={archiveMonths}
                onChange={(e) => setArchiveMonths(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
                <option value="18">18 months</option>
                <option value="24">24 months</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">Completed races move to archive after this period</p>
            </div>
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

                      </div>
                      <div className="flex items-center gap-1.5 ml-3 shrink-0">
                        <button
                          onClick={() => { setEditingSeries(s.id); setEditSeriesName(s.name); setEditSeriesDesc(s.description ?? '') }}
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

      {/* Pending admin nomination — shown to the nominee */}
      {club?.pending_admin_nominee === user?.id && (
        <Card className="border-2 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">👑 You&apos;ve been nominated as club admin</p>
          <p className="text-xs text-amber-800 mt-1">
            If you accept, you become the club admin and the current admin becomes a member.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => respondToNomination(true)}
              disabled={nominateBusy}
              className="rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => respondToNomination(false)}
              disabled={nominateBusy}
              className="rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        {myRole === 'admin' && club?.pending_admin_nominee && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-xs text-amber-800">
              Admin nomination pending: {members.find((m) => m.id === club.pending_admin_nominee)?.full_name ?? 'a member'} must accept.
            </p>
            <button
              onClick={cancelNomination}
              disabled={nominateBusy}
              className="text-xs rounded-lg bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-2.5 py-1 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900">{m.full_name ?? 'Unnamed'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{roleLabels[m.role] ?? m.role}</span>
                {myRole === 'admin' && m.id !== user?.id && m.role !== 'admin' && (
                  m.role === 'race_officer' ? (
                    <button
                      onClick={() => setRaceOfficer(m.id, false)}
                      disabled={nominateBusy}
                      className="text-xs rounded-lg bg-red-50 hover:bg-red-100 text-red-700 px-2.5 py-1 font-medium disabled:opacity-50"
                    >
                      Remove officer
                    </button>
                  ) : (
                    <button
                      onClick={() => setRaceOfficer(m.id, true)}
                      disabled={nominateBusy}
                      className="text-xs rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1 font-medium disabled:opacity-50"
                    >
                      Make officer
                    </button>
                  )
                )}
                {myRole === 'admin' && m.id !== user?.id && m.role !== 'admin' && !club?.pending_admin_nominee && (
                  <button
                    onClick={() => nominateAdmin(m.id)}
                    disabled={nominateBusy}
                    className="text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 font-medium disabled:opacity-50"
                  >
                    Make admin
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Leave club */}
      <Card className="border border-red-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Leave this club</p>
            {myRole === 'admin' && members.filter((m) => m.role === 'admin').length <= 1 ? (
              <p className="text-xs text-amber-700 mt-0.5">
                You’re the only admin — nominate a new admin above and have them accept before you can leave.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5">You’ll lose access to this club’s races and results until you rejoin.</p>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={leaveClub}
            disabled={nominateBusy}
            className="shrink-0 border-red-300 text-red-700 hover:bg-red-50"
          >
            Leave club
          </Button>
        </div>
      </Card>
    </div>
  )
}
