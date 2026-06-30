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
      setLoading(false)
    }

    fetchData()
  }, [user])

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
