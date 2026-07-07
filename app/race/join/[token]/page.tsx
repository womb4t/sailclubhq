'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { MCNAMELESS_PREFIX, MCNAMELESS_LIKE } from '@/lib/entry-label'
import type { Profile, Boat } from '@/types/database'
import { WaypointFooter } from '@/components/WaypointFooter'

interface RaceInfo {
  id: string
  name: string
  race_date: string
  series: string | null
  status: string
  notes: string | null
  vhf_channel: string | null
  safety_info: string | null
  club: { id: string; name: string; invite_code: string } | null
}

interface StartClass {
  id: string
  name: string
  start_time: string
}

interface EnteredBoat {
  entry_id: string
  boat_id: string
  boat_name: string
  sail_number: string | null
  boatClass: string | null
  helm_name: string | null
}

type Step = 'loading' | 'profile-incomplete' | 'already-entered' | 'role' | 'anon-boat' | 'helm-boat' | 'crew-boat' | 'confirm' | 'done'
type EntryRole = 'helm' | 'crew'

const PARTICIPANT_KEY = 'scq-participant-id'

function getParticipantId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(PARTICIPANT_KEY)
  if (!id) {
    id =
      (crypto?.randomUUID?.() as string | undefined) ??
      `p-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(PARTICIPANT_KEY, id)
  }
  return id
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function extractStartTime(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/^Start time: (\d{2}:\d{2})/)
  return match ? match[1] : null
}

const SAFETY_NUDGE_KEY = 'scq-dismissed-safety-nudge'

// Gentle, dismissable reminder to add a safety/emergency contact. NEVER a gate.
// - Logged-in users with no emergency contact: prompt to add one.
// - Anonymous racers: lighter nudge to register + add safety details.
function SafetyNudge({ mode }: { mode: 'add-contact' | 'register' }) {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try { setDismissed(localStorage.getItem(SAFETY_NUDGE_KEY) === '1') } catch { setDismissed(false) }
  }, [])
  if (dismissed) return null
  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(SAFETY_NUDGE_KEY, '1') } catch { /* ignore */ }
  }
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-amber-800">
          <span className="font-medium">⚠️ Add a safety contact</span> — the race team can see this on the water.
        </p>
        <div className="mt-1.5">
          {mode === 'add-contact' ? (
            <Link href="/dashboard/profile" className="inline-block text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md px-2.5 py-1">
              Add now
            </Link>
          ) : (
            <span className="text-xs text-amber-700">Save your results below to add safety details.</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-amber-500 hover:text-amber-700 text-sm leading-none px-1"
      >
        ✕
      </button>
    </div>
  )
}

function EmergencyBanner({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
      <div className="text-xs text-green-700">
        <span className="font-medium">Emergency contact:</span>{' '}
        {profile.emergency_contact_name} ({profile.emergency_contact_phone})
      </div>
      <Link href="/dashboard/profile" className="text-xs text-green-600 underline ml-2 shrink-0">Update</Link>
    </div>
  )
}

export default function RaceJoinPage() {
  const params = useParams()
  const { user, loading: authLoading } = useAuth()
  const token = params.token as string

  const [race, setRace] = useState<RaceInfo | null>(null)
  const [startClasses, setStartClasses] = useState<StartClass[]>([])
  const [raceLoading, setRaceLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [userBoats, setUserBoats] = useState<Boat[]>([])
  const [enteredBoats, setEnteredBoats] = useState<EnteredBoat[]>([])

  const [step, setStep] = useState<Step>('loading')
  const [role, setRole] = useState<EntryRole>('helm')
  const [crewMode, setCrewMode] = useState<'existing' | 'new' | 'available'>('existing')

  const [selectedBoatId, setSelectedBoatId] = useState<string>('')
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [crewBoatId, setCrewBoatId] = useState<string>('')

  const [showAddBoat, setShowAddBoat] = useState(false)
  const [newBoatName, setNewBoatName] = useState('')
  const [newBoatClass, setNewBoatClass] = useState('')
  const [newBoatSail, setNewBoatSail] = useState('')
  const [addingBoat, setAddingBoat] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Anonymous (no-account) fast-path state
  const [anonBoatName, setAnonBoatName] = useState('')
  const [anonSailNumber, setAnonSailNumber] = useState('')
  const [anonHelmName, setAnonHelmName] = useState('')

  // Optional post-race registration ("reward") state
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regUsePassword, setRegUsePassword] = useState(false)
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')
  const [regDone, setRegDone] = useState(false)
  const [myEntry, setMyEntry] = useState<{ id: string; role: string; boat_name: string | null } | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [entryCount, setEntryCount] = useState<number | null>(null)
  const [successEntry, setSuccessEntry] = useState<{
    boat_name: string | null
    class_name: string | null
    role: EntryRole
  } | null>(null)

  useEffect(() => {
    async function lookupRace() {
      const supabase = getBrowserClient()
      const { data } = await supabase
        .from('races')
        .select('id, name, race_date, series, status, notes, vhf_channel, safety_info, club:clubs(id, name, invite_code)')
        .eq('entry_token', token)
        .maybeSingle()

      if (data) {
        const raceData: RaceInfo = {
          ...data,
          club: Array.isArray(data.club) ? data.club[0] : data.club,
        } as RaceInfo
        setRace(raceData)

        const { data: classes } = await supabase
          .from('start_classes')
          .select('id, name, start_time')
          .eq('race_id', data.id)
          .order('start_time', { ascending: true })

        if (classes && classes.length > 0) {
          setStartClasses(classes as StartClass[])
          if (classes.length === 1) setSelectedClassId(classes[0].id)
        }
      } else {
        setNotFound(true)
      }
      setRaceLoading(false)
    }
    lookupRace()
  }, [token])

  useEffect(() => {
    if (authLoading || raceLoading) return
    // Boat-name-first: instead of forcing /login, show the have-boat/need-boat
    // choice immediately. No email or account required to race.
    if (!user) {
      setStep('role')
    }
  }, [authLoading, raceLoading, user])

  useEffect(() => {
    if (!user || !race) return
    async function fetchUserData() {
      const supabase = getBrowserClient()
      // Invited via this race link: add to the race's club if not already in one.
      try { await supabase.rpc('join_club_via_race', { p_token: token }) } catch { /* best-effort */ }
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle()

      // Email-first funnel: do NOT block entry on a missing/incomplete profile.
      // Use whatever profile we have (may be null) and continue to the role step.
      setProfile((prof as Profile) ?? null)

      // Show ALL the user's boats (they own them); don't hard-filter by this
      // race's club_id — a boat added under a slightly different club state
      // should still be selectable. RLS still scopes to readable rows.
      const { data: boats } = await supabase
        .from('boats')
        .select('*')
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: true })

      if (boats) {
        setUserBoats(boats as Boat[])
        if (boats.length > 0) setSelectedBoatId(boats[0].id)
      }

      // Check whether this user already has an active entry
      const { data: mine } = await supabase
        .from('race_entries')
        .select('id, role, boats(boat_name)')
        .eq('race_id', race!.id)
        .eq('user_id', user!.id)
        .neq('status', 'withdrawn')
        .limit(1)

      if (mine && mine.length > 0) {
        const m = mine[0] as { id: string; role: string; boats: { boat_name?: string } | { boat_name?: string }[] | null }
        const boat = Array.isArray(m.boats) ? m.boats[0] : m.boats
        setMyEntry({ id: m.id, role: m.role, boat_name: boat?.boat_name ?? null })
        setStep('already-entered')
        return
      }

      // Entry count for display
      const { count: totalEntries } = await supabase
        .from('race_entries')
        .select('*', { count: 'exact', head: true })
        .eq('race_id', race!.id)
        .neq('status', 'withdrawn')
      setEntryCount(totalEntries ?? 0)

      const { data: entries } = await supabase
        .from('race_entries')
        .select('id, boat_id, helm_name, boats(boat_name, sail_number, class)')
        .eq('race_id', race!.id)
        .eq('role', 'helm')
        .neq('status', 'withdrawn')

      if (entries) {
        const mapped: EnteredBoat[] = (entries as Record<string, unknown>[]).map((e) => {
          const boatRaw = e.boats
          const boat = (Array.isArray(boatRaw) ? boatRaw[0] : boatRaw) as {
            boat_name?: string; sail_number?: string | null; class?: string | null
          } | null
          return {
            entry_id: String(e.id),
            boat_id: String(e.boat_id),
            boat_name: boat?.boat_name ?? 'Unknown boat',
            sail_number: boat?.sail_number ?? null,
            boatClass: boat?.class ?? null,
            helm_name: e.helm_name ? String(e.helm_name) : null,
          }
        })
        setEnteredBoats(mapped)
        if (mapped.length > 0) setCrewBoatId(mapped[0].boat_id)
      }
      setStep('role')
    }
    fetchUserData()
  }, [user, race])

  function raceRedirectUrl() {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/race/join/${token}`
  }

  // FAST PATH: anonymous, device-tracked entry. Nothing is required — a racer
  // with neither a boat name nor a sail number gets auto-named "Boaty McNameless N".
  async function handleAnonHaveBoat() {
    if (!race) return
    setError('')
    setSubmitting(true)
    const supabase = getBrowserClient()
    try {
      const participantId = getParticipantId()

      // Idempotent: reuse an existing entry for this device on this race.
      const { data: ex } = await supabase
        .from('race_entries')
        .select('id')
        .eq('race_id', race.id)
        .eq('participant_id', participantId)
        .limit(1)
        .maybeSingle()

      const trimmedName = anonBoatName.trim()
      const trimmedSail = anonSailNumber.trim()

      // Auto-label only when BOTH name and sail number are absent.
      // A sail number alone is a valid display label — don't McNameless those.
      let finalBoatName: string | null = trimmedName || null
      if (!trimmedName && !trimmedSail) {
        const { count } = await supabase
          .from('race_entries')
          .select('id', { count: 'exact', head: true })
          .eq('race_id', race.id)
          .like('boat_name', MCNAMELESS_LIKE)
        finalBoatName = `${MCNAMELESS_PREFIX} ${(count ?? 0) + 1}`
      }

      const rowBase = {
        boat_name: finalBoatName,
        sail_number: trimmedSail || null,
        helm_name: anonHelmName.trim() || null,
        status: 'entered' as const,
        role: 'helm',
      }

      if (ex?.id) {
        await supabase.from('race_entries').update(rowBase).eq('id', ex.id)
      } else {
        const { error: insErr } = await supabase.from('race_entries').insert({
          race_id: race.id,
          boat_id: null,
          class_id: null,
          participant_id: participantId,
          user_id: null,
          ...rowBase,
        })
        if (insErr) { setError(insErr.message); setSubmitting(false); return }
      }
      setSuccessEntry({ boat_name: rowBase.boat_name, class_name: null, role: 'helm' })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
    setSubmitting(false)
  }

  // FAST PATH: anonymous "need a boat" — register availability as crew.
  async function handleAnonNeedBoat() {
    if (!race) return
    setError('')
    setSubmitting(true)
    const supabase = getBrowserClient()
    try {
      const participantId = getParticipantId()
      const { data: ex } = await supabase
        .from('race_entries')
        .select('id')
        .eq('race_id', race.id)
        .eq('participant_id', participantId)
        .limit(1)
        .maybeSingle()

      const helm = (anonHelmName.trim() || 'Someone') + ' (available as crew)'
      if (ex?.id) {
        await supabase.from('race_entries').update({ boat_name: null, helm_name: helm, status: 'entered', role: 'crew' }).eq('id', ex.id)
      } else {
        const { data: inserted, error: insErr } = await supabase.from('race_entries').insert({
          race_id: race.id, boat_id: null, class_id: null,
          participant_id: participantId, user_id: null,
          boat_name: null, helm_name: helm, status: 'entered', role: 'crew',
        }).select('id').maybeSingle()
        if (insErr) { setError(insErr.message); setSubmitting(false); return }
        if (inserted?.id) {
          void fetch('/api/crew-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'crew-available', crewEntryId: inserted.id, raceToken: token }),
          }).catch(() => {})
        }
      }
      setSuccessEntry({ boat_name: null, class_name: null, role: 'crew' })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
    setSubmitting(false)
  }

  // OPTIONAL post-race reward: register/sign in to save results. Never a gate.
  async function handleRegisterMagic(e: React.FormEvent) {
    e.preventDefault()
    if (!regEmail.trim()) { setRegError('Enter your email address'); return }
    setRegError('')
    setRegLoading(true)
    const supabase = getBrowserClient()
    const { error: err } = await supabase.auth.signInWithOtp({
      email: regEmail.trim(),
      options: { emailRedirectTo: raceRedirectUrl() },
    })
    if (err) { setRegError(err.message); setRegLoading(false); return }
    setRegDone(true)
    setRegLoading(false)
  }

  async function handleRegisterPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!regEmail.trim() || !regPassword) { setRegError('Enter your email and a password'); return }
    setRegError('')
    setRegLoading(true)
    const supabase = getBrowserClient()
    const email = regEmail.trim()
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: regPassword })
    if (!signInErr && signInData.session) { setRegLoading(false); return }
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email, password: regPassword,
      options: { emailRedirectTo: raceRedirectUrl() },
    })
    if (signUpErr) {
      setRegError(
        /already registered|already exists/i.test(signUpErr.message)
          ? 'That email already has an account — check your password, or use a magic link instead.'
          : signUpErr.message
      )
      setRegLoading(false)
      return
    }
    if (!signUpData.session) setRegDone(true)
    setRegLoading(false)
  }

  async function handleAddBoat() {
    if (!newBoatName.trim() || !race?.club) return
    setAddingBoat(true)
    setError('')
    const supabase = getBrowserClient()
    const { data: boat, error: boatErr } = await supabase
      .from('boats')
      .insert({
        club_id: race.club.id,
        owner_id: user!.id,
        owner_name: profile?.full_name ?? '',
        boat_name: newBoatName.trim(),
        class: newBoatClass.trim() || null,
        sail_number: newBoatSail.trim() || null,
      })
      .select('*')
      .single()

    if (boatErr) { setError(boatErr.message); setAddingBoat(false); return }
    const newBoat = boat as Boat
    setUserBoats((prev) => [...prev, newBoat])
    setSelectedBoatId(newBoat.id)
    setNewBoatName(''); setNewBoatClass(''); setNewBoatSail('')
    setShowAddBoat(false); setAddingBoat(false)
  }

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    const supabase = getBrowserClient()
    try {
      if (role === 'helm') {
        if (selectedBoatId) {
          const { data: dup } = await supabase.from('race_entries').select('id').eq('race_id', race!.id).eq('boat_id', selectedBoatId).neq('status', 'withdrawn').limit(1)
          if (dup && dup.length > 0) { setError('This boat is already entered in this race.'); setSubmitting(false); return }
        }
        const helmBoat = userBoats.find((b) => b.id === selectedBoatId)
        const { error: entryErr } = await supabase.from('race_entries').insert({
          race_id: race!.id, boat_id: selectedBoatId || null, class_id: selectedClassId || null,
          helm_name: profile?.full_name ?? '', sail_number: helmBoat?.sail_number ?? null,
          phone: profile?.phone ?? null, status: 'entered', role: 'helm',
          user_id: user!.id,
        })
        if (entryErr) { setError(entryErr.message); setSubmitting(false); return }
        const cb = userBoats.find((b) => b.id === selectedBoatId)
        const cc = startClasses.find((c) => c.id === selectedClassId)
        setSuccessEntry({ boat_name: cb?.boat_name ?? null, class_name: cc?.name ?? null, role: 'helm' })
        setStep('done')
      } else {
        if (crewMode === 'existing' && crewBoatId) {
          const eb = enteredBoats.find((b) => b.boat_id === crewBoatId)
          const { error: entryErr } = await supabase.from('race_entries').insert({
            race_id: race!.id, boat_id: crewBoatId, class_id: null,
            helm_name: (profile?.full_name ?? 'Crew') + ' (crew on ' + (eb?.boat_name ?? 'boat') + ')',
            phone: profile?.phone ?? null, status: 'entered', role: 'crew',
            user_id: user!.id,
          })
          if (entryErr) { setError(entryErr.message); setSubmitting(false); return }
          setSuccessEntry({ boat_name: eb?.boat_name ?? null, class_name: null, role: 'crew' })
        } else if (crewMode === 'new' && selectedBoatId) {
          const cb = userBoats.find((b) => b.id === selectedBoatId)
          const { error: entryErr } = await supabase.from('race_entries').insert({
            race_id: race!.id, boat_id: selectedBoatId, class_id: selectedClassId || null,
            helm_name: profile?.full_name ?? '', phone: profile?.phone ?? null, status: 'entered', role: 'crew',
            user_id: user!.id,
          })
          if (entryErr) { setError(entryErr.message); setSubmitting(false); return }
          setSuccessEntry({ boat_name: cb?.boat_name ?? null, class_name: null, role: 'crew' })
        } else {
          const { data: inserted, error: entryErr } = await supabase.from('race_entries').insert({
            race_id: race!.id, boat_id: null, class_id: null,
            helm_name: (profile?.full_name ?? 'Crew') + ' (available as crew)',
            phone: profile?.phone ?? null, status: 'entered', role: 'crew',
            user_id: user!.id,
          }).select('id').maybeSingle()
          if (entryErr) { setError(entryErr.message); setSubmitting(false); return }
          // Fire-and-forget: notify entered boats' helms that crew is available.
          if (inserted?.id) {
            void fetch('/api/crew-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'crew-available', crewEntryId: inserted.id, raceToken: token }),
            }).catch(() => {})
          }
          setSuccessEntry({ boat_name: null, class_name: null, role: 'crew' })
        }
        setStep('done')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
    setSubmitting(false)
  }

  async function handleWithdraw() {
    if (!myEntry) return
    setWithdrawing(true)
    setError('')
    const supabase = getBrowserClient()
    const { error: err } = await supabase
      .from('race_entries')
      .update({ status: 'withdrawn' })
      .eq('id', myEntry.id)
    if (err) {
      setError(err.message)
    } else {
      setMyEntry(null)
      setStep('role')
    }
    setWithdrawing(false)
  }

  const startTime = race ? extractStartTime(race.notes) : null
  const isOpen = race?.status === 'planned' || race?.status === 'confirmed'
  // Variables used in JSX
  const selectedBoat = userBoats.find((b) => b.id === selectedBoatId)
  const selectedClass = startClasses.find((c) => c.id === selectedClassId)
  const selectedCrewedBoat = enteredBoats.find((b) => b.boat_id === crewBoatId)

  if (raceLoading || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-sm w-full text-center">
          <div className="text-4xl mb-3">🏁</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">Race not found</h2>
          <p className="text-sm text-gray-400 mb-4">This link does not match any active race.</p>
          <Link href="/"><Button variant="secondary" size="sm">Go to homepage</Button></Link>
        </Card>
      </div>
    )
  }

  if (!race) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">

        {race.club?.invite_code && (
          <Link href={`/club/${race.club.invite_code}`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
            Back to club
          </Link>
        )}

        <div className="text-center">
          {race.club && <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{race.club.name}</p>}
          <h1 className="text-2xl font-bold text-gray-900">{race.name}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {formatDate(race.race_date)}
          </p>
          {startTime && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg mt-1">
              🏁 Start Time: {startTime}
            </span>
          )}
          {race.series && (
            <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{race.series}</span>
          )}
          <div className="mt-2">
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
              race.status === 'confirmed' ? 'bg-green-100 text-green-700' :
              race.status === 'planned' ? 'bg-blue-100 text-blue-700' :
              race.status === 'completed' ? 'bg-amber-100 text-amber-700' :
              race.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {race.status === 'confirmed' ? 'Race Confirmed' : race.status === 'planned' ? 'Race Planned' :
               race.status === 'completed' ? 'Race Completed' : race.status === 'cancelled' ? 'Race Cancelled' : race.status}
            </span>
          </div>
        </div>

        {(race.vhf_channel || race.safety_info) && (
          <Card>
            <div className="space-y-2">
              {race.vhf_channel && <p className="text-sm text-gray-700">VHF Channel: <strong>{race.vhf_channel}</strong></p>}
              {race.safety_info && <p className="text-sm text-gray-600">{race.safety_info}</p>}
            </div>
          </Card>
        )}

        {!isOpen && (
          <Card>
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">
                {race.status === 'completed' ? 'This race has been completed.' :
                 race.status === 'cancelled' ? 'This race has been cancelled.' :
                 'This race is not currently accepting entries.'}
              </p>
            </div>
          </Card>
        )}

        {isOpen && (
          <div className="space-y-4">

            {step === 'loading' && (
              <Card><div className="text-center py-6 text-gray-400 text-sm">Loading your details...</div></Card>
            )}

            {step === 'already-entered' && myEntry && (
              <Card>
                <div className="text-center py-6 space-y-3">
                  <div className="text-5xl">⛵</div>
                  <h2 className="text-xl font-bold text-gray-900">You&apos;re already entered</h2>
                  <p className="text-sm text-gray-600">
                    {myEntry.role === 'helm' ? 'Entered as helm' : 'Entered as crew'}
                    {myEntry.boat_name && <span> on <strong>{myEntry.boat_name}</strong></span>}
                  </p>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex flex-col gap-2 pt-2">
                    <Button variant="danger" size="lg" className="w-full" loading={withdrawing} onClick={handleWithdraw}>
                      Withdraw entry
                    </Button>
                    {race?.club?.invite_code && (
                      <Link href={`/club/${race.club.invite_code}`}>
                        <Button variant="secondary" size="lg" className="w-full">Back to club</Button>
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {step === 'profile-incomplete' && (
              <Card>
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-sm font-semibold text-amber-800">Complete your profile before entering a race</p>
                    <p className="text-xs text-amber-700 mt-0.5">We need your emergency contact details before you can race.</p>
                  </div>
                  <Link href="/dashboard/profile"><Button className="w-full" size="lg">Complete profile</Button></Link>
                </div>
              </Card>
            )}

            {step === 'role' && (
              <div className="space-y-3">
                {profile && <EmergencyBanner profile={profile} />}
                {entryCount !== null && (
                  <p className="text-center text-xs text-gray-500">{entryCount} {entryCount === 1 ? 'entry' : 'entries'} so far</p>
                )}
                <Card>
                  <CardHeader><CardTitle>Do you have a boat, or need a boat?</CardTitle></CardHeader>
                  <div className="mt-2 space-y-3">
                    <button
                      onClick={() => { setRole('helm'); setStep(user ? 'helm-boat' : 'anon-boat') }}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 transition-colors text-left"
                    >
                      <span className="text-3xl">🚤</span>
                      <div>
                        <div className="font-semibold text-gray-900">I have a boat</div>
                        <div className="text-sm text-gray-500">Race your own boat — start tracking right away.</div>
                      </div>
                    </button>
                    <button
                      onClick={() => { setRole('crew'); if (user) { setCrewMode('available'); setStep('crew-boat') } else { void handleAnonNeedBoat() } }}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                    >
                      <span className="text-3xl">🙋</span>
                      <div>
                        <div className="font-semibold text-gray-900">I need a boat</div>
                        <div className="text-sm text-gray-500">Get matched to a boat that needs a hand.</div>
                      </div>
                    </button>
                  </div>
                  {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                  {!user && (
                    <p className="mt-3 text-center text-xs text-gray-400">
                      No account needed to race. You can save your results afterwards.
                    </p>
                  )}
                </Card>
              </div>
            )}

            {step === 'anon-boat' && (
              <div className="space-y-3">
                <Card>
                  <CardHeader><CardTitle>Your boat</CardTitle></CardHeader>
                  <div className="mt-2 space-y-3">
                    <Input
                      label="Boat name *"
                      value={anonBoatName}
                      onChange={(e) => setAnonBoatName(e.target.value)}
                      placeholder="e.g. Kestrel"
                      autoFocus
                    />
                    <Input
                      label="Sail number (optional)"
                      value={anonSailNumber}
                      onChange={(e) => setAnonSailNumber(e.target.value)}
                      placeholder="e.g. 1234"
                    />
                    <Input
                      label="Helm name (optional)"
                      value={anonHelmName}
                      onChange={(e) => setAnonHelmName(e.target.value)}
                      placeholder="Who&apos;s steering?"
                    />
                    <p className="text-xs text-gray-400">Leave it blank and we&apos;ll name your boat for you — you can fix it later.</p>
                  </div>
                </Card>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => { setError(''); setStep('role') }}>Back</Button>
                  <Button size="lg" className="flex-1" loading={submitting} onClick={handleAnonHaveBoat}>🏁 Go racing</Button>
                </div>
              </div>
            )}

            {step === 'helm-boat' && (
              <div className="space-y-3">
                {profile && <EmergencyBanner profile={profile} />}
                <Card>
                  <CardHeader><CardTitle>Select your boat</CardTitle></CardHeader>
                  {userBoats.length === 0 && !showAddBoat && (
                    <div className="mt-2 space-y-3">
                      <p className="text-sm text-gray-500">You do not have any boats registered yet.</p>
                      <Button variant="secondary" size="sm" onClick={() => setShowAddBoat(true)}>Add a boat</Button>
                    </div>
                  )}
                  {userBoats.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {userBoats.map((boat) => (
                        <button key={boat.id} onClick={() => setSelectedBoatId(boat.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${selectedBoatId === boat.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                        >
                          <span className="text-2xl">⛵</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{boat.boat_name}</div>
                            <div className="text-xs text-gray-500">{[boat.class, boat.sail_number ? '#' + boat.sail_number : null].filter(Boolean).join(' - ') || 'No class or sail number'}</div>
                          </div>
                          {selectedBoatId === boat.id && <span className="text-blue-500 text-lg shrink-0">✓</span>}
                        </button>
                      ))}
                      {!showAddBoat && <button onClick={() => setShowAddBoat(true)} className="mt-1 text-sm text-blue-600 hover:text-blue-700 font-medium">Use a different boat</button>}
                    </div>
                  )}
                  {showAddBoat && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                      <p className="text-sm font-medium text-gray-700">Add a new boat</p>
                      <input value={newBoatName} onChange={(e) => setNewBoatName(e.target.value)} placeholder="Boat name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <div className="grid grid-cols-2 gap-2">
                        <input value={newBoatClass} onChange={(e) => setNewBoatClass(e.target.value)} placeholder="Class e.g. Laser" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input value={newBoatSail} onChange={(e) => setNewBoatSail(e.target.value)} placeholder="Sail number" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      {error && <p className="text-xs text-red-600">{error}</p>}
                      <div className="flex gap-2">
                        <Button size="sm" loading={addingBoat} onClick={handleAddBoat} disabled={!newBoatName.trim()}>Add boat</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowAddBoat(false); setError('') }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </Card>
                {startClasses.length > 1 && (
                  <Card>
                    <CardHeader><CardTitle>Select your class</CardTitle></CardHeader>
                    <div className="mt-2 space-y-2">
                      {startClasses.map((cls) => (
                        <button key={cls.id} onClick={() => setSelectedClassId(cls.id)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-colors text-left ${selectedClassId === cls.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                        >
                          <span className="font-medium text-gray-900">{cls.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{cls.start_time}</span>
                            {selectedClassId === cls.id && <span className="text-blue-500">✓</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </Card>
                )}
                {startClasses.length === 1 && <div className="px-1 text-sm text-gray-500">Class: <strong>{startClasses[0].name}</strong></div>}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep('role')}>Back</Button>
                  <Button size="lg" className="flex-1" disabled={(userBoats.length > 0 && !selectedBoatId) || showAddBoat} onClick={() => { setRole('helm'); setStep('confirm') }}>Review entry</Button>
                </div>
              </div>
            )}

            {step === 'crew-boat' && (
              <div className="space-y-3">
                {profile && <EmergencyBanner profile={profile} />}
                <Card>
                  <CardHeader><CardTitle>How would you like to crew?</CardTitle></CardHeader>
                  <div className="mt-2 space-y-2">
                    {enteredBoats.length > 0 && (
                      <button onClick={() => setCrewMode('existing')} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${crewMode === 'existing' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                        <span className="text-2xl">⛵</span>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">Join a boat already entered</div>
                          <div className="text-xs text-gray-500">{enteredBoats.length} boat{enteredBoats.length !== 1 ? 's' : ''} in this race</div>
                        </div>
                        {crewMode === 'existing' && <span className="text-blue-500 shrink-0">✓</span>}
                      </button>
                    )}
                    <button onClick={() => setCrewMode('new')} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${crewMode === 'new' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <span className="text-2xl">➕</span>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Enter a boat not yet listed</div>
                        <div className="text-xs text-gray-500">Your boat or one not entered yet</div>
                      </div>
                      {crewMode === 'new' && <span className="text-blue-500 shrink-0">✓</span>}
                    </button>
                    <button onClick={() => setCrewMode('available')} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${crewMode === 'available' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <span className="text-2xl">🙋</span>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">I am available as crew</div>
                        <div className="text-xs text-gray-500">No specific boat - just register availability</div>
                      </div>
                      {crewMode === 'available' && <span className="text-blue-500 shrink-0">✓</span>}
                    </button>
                  </div>
                </Card>

                {crewMode === 'existing' && enteredBoats.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>Select a boat to crew on</CardTitle></CardHeader>
                    <div className="mt-2 space-y-2">
                      {enteredBoats.map((b) => (
                        <button key={b.entry_id} onClick={() => setCrewBoatId(b.boat_id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${crewBoatId === b.boat_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                        >
                          <span className="text-2xl">⛵</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{b.boat_name}</div>
                            <div className="text-xs text-gray-500">{[b.boatClass, b.sail_number ? '#' + b.sail_number : null, b.helm_name ? 'Helm: ' + b.helm_name : null].filter(Boolean).join(' - ')}</div>
                          </div>
                          {crewBoatId === b.boat_id && <span className="text-blue-500 shrink-0">✓</span>}
                        </button>
                      ))}
                    </div>
                  </Card>
                )}

                {crewMode === 'new' && (
                  <div className="space-y-3">
                    <Card>
                      <CardHeader><CardTitle>Select or add your boat</CardTitle></CardHeader>
                      {userBoats.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {userBoats.map((boat) => (
                            <button key={boat.id} onClick={() => setSelectedBoatId(boat.id)}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${selectedBoatId === boat.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                            >
                              <span className="text-2xl">⛵</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 truncate">{boat.boat_name}</div>
                                <div className="text-xs text-gray-500">{[boat.class, boat.sail_number ? '#' + boat.sail_number : null].filter(Boolean).join(' - ') || 'No class/sail number'}</div>
                              </div>
                              {selectedBoatId === boat.id && <span className="text-blue-500 shrink-0">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      {!showAddBoat && (
                        <button onClick={() => setShowAddBoat(true)} className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
                          {userBoats.length === 0 ? 'Add a boat' : 'Use a different boat'}
                        </button>
                      )}
                      {showAddBoat && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                          <p className="text-sm font-medium text-gray-700">Add a new boat</p>
                          <input value={newBoatName} onChange={(e) => setNewBoatName(e.target.value)} placeholder="Boat name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <div className="grid grid-cols-2 gap-2">
                            <input value={newBoatClass} onChange={(e) => setNewBoatClass(e.target.value)} placeholder="Class" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <input value={newBoatSail} onChange={(e) => setNewBoatSail(e.target.value)} placeholder="Sail number" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          {error && <p className="text-xs text-red-600">{error}</p>}
                          <div className="flex gap-2">
                            <Button size="sm" loading={addingBoat} onClick={handleAddBoat} disabled={!newBoatName.trim()}>Add boat</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setShowAddBoat(false); setError('') }}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep('role')}>Back</Button>
                  <Button size="lg" className="flex-1"
                    disabled={crewMode === 'existing' && !crewBoatId || crewMode === 'new' && !selectedBoatId && !showAddBoat}
                    onClick={() => { setRole('crew'); setStep('confirm') }}
                  >Review entry</Button>
                </div>
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-3">
                {profile && <EmergencyBanner profile={profile} />}
                <Card>
                  <CardHeader><CardTitle>Confirm your entry</CardTitle></CardHeader>
                  <div className="mt-2 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Role</span>
                      <span className="font-medium text-gray-900">{role === 'helm' ? '🚤 Helm' : '🤝 Crew'}</span>
                    </div>
                    {role === 'helm' && selectedBoat && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Boat</span>
                        <span className="font-medium text-gray-900">{selectedBoat.boat_name}</span>
                      </div>
                    )}
                    {role === 'crew' && crewMode === 'existing' && selectedCrewedBoat && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Crewing on</span>
                        <span className="font-medium text-gray-900">{selectedCrewedBoat.boat_name}</span>
                      </div>
                    )}
                    {selectedClass && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Class</span>
                        <span className="font-medium text-gray-900">{selectedClass.name}</span>
                      </div>
                    )}
                    {profile?.phone && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Phone</span>
                        <span className="font-medium text-gray-900">{profile.phone}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Race</span>
                      <span className="font-medium text-gray-900">{race?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Date</span>
                      <span className="font-medium text-gray-900">{race && formatDate(race.race_date)}</span>
                    </div>
                  </div>
                </Card>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep(role === 'helm' ? 'helm-boat' : 'crew-boat')}>Back</Button>
                  <Button size="lg" className="flex-1" loading={submitting} onClick={handleSubmit}>🏁 Enter Race</Button>
                </div>
              </div>
            )}

            {step === 'done' && successEntry && (
              <Card>
                {/* Safety reminder — never a gate. Only when a contact is missing. */}
                {user
                  ? (!profile?.emergency_contact_name && !profile?.emergency_contact_phone) && (
                      <div className="mb-3"><SafetyNudge mode="add-contact" /></div>
                    )
                  : <div className="mb-3"><SafetyNudge mode="register" /></div>}
                <div className="text-center py-6 space-y-3">
                  <div className="text-5xl">⛵</div>
                  <h2 className="text-xl font-bold text-gray-900">You are entered!</h2>
                  <p className="text-sm text-gray-600">
                    {successEntry.role === 'helm' ? 'Entered as helm' : 'Entered as crew'}
                    {successEntry.boat_name && <span> on <strong>{successEntry.boat_name}</strong></span>}
                    {successEntry.class_name && <span> in <strong>{successEntry.class_name}</strong></span>}
                  </p>
                  <p className="text-sm text-gray-500">
                    {race && formatDate(race.race_date)}
                    {startTime && <span className="ml-1 font-semibold text-blue-700">🏁 {startTime}</span>}
                  </p>
                  <div className="flex flex-col gap-2 pt-2">
                    {/* Primary: go to the Race Centre — the hub with countdown, course, nav & tracking. */}
                    <Link href={`/race/centre/${token}`}>
                      <Button size="lg" className="w-full">🎯 Go to Race Centre</Button>
                    </Link>
                    {successEntry.role === 'helm' && (
                      <Link href={`/race/live/${token}`}>
                        <Button variant="secondary" size="lg" className="w-full">📱 Start racing now</Button>
                      </Link>
                    )}
                    {race?.club?.invite_code && (
                      <Link href={`/club/${race.club.invite_code}`}>
                        <Button variant="secondary" size="lg" className="w-full">Back to club</Button>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Optional reward: only offered to anonymous racers, never a gate. */}
                {!user && (
                  regDone ? (
                    <div className="mt-2 border-t border-gray-100 pt-4 text-center">
                      <div className="text-2xl mb-1">📧</div>
                      <p className="text-sm text-gray-700 font-medium">Check your email</p>
                      <p className="text-xs text-gray-500 mt-1">
                        We&apos;ve sent a link to <strong>{regEmail}</strong> to finish setting up your account.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 border-t border-gray-100 pt-4">
                      <p className="text-sm font-medium text-gray-800 text-center">Want to save your results? 🏆</p>
                      <p className="text-xs text-gray-500 text-center mt-0.5 mb-3">
                        Add your email to keep your history, appear on the leaderboard, and race faster next time. Totally optional.
                      </p>
                      <form onSubmit={regUsePassword ? handleRegisterPassword : handleRegisterMagic} className="space-y-2 text-left">
                        <Input
                          label="Email"
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="you@example.com"
                          autoComplete="email"
                        />
                        {regUsePassword && (
                          <Input
                            label="Password"
                            type="password"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="Choose a password"
                            autoComplete="new-password"
                          />
                        )}
                        {regError && <p className="text-xs text-red-600">{regError}</p>}
                        <Button type="submit" size="lg" className="w-full" loading={regLoading}>
                          {regUsePassword ? 'Save my results' : '✉️ Email me a link'}
                        </Button>
                      </form>
                      <button
                        type="button"
                        onClick={() => { setRegUsePassword((v) => !v); setRegError('') }}
                        className="mt-2 w-full text-center text-xs text-blue-600 hover:underline"
                      >
                        {regUsePassword ? 'Use a magic link instead' : 'Use a password instead'}
                      </button>
                    </div>
                  )
                )}
              </Card>
            )}

          </div>
        )}

      </div>
      <WaypointFooter tone="light" />
    </div>
  )
}
