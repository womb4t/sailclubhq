'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge, RoundingBadge } from '@/components/ui/Badge'
import { WaypointFooter } from '@/components/WaypointFooter'
import { BoatIdentityNudge } from '@/components/BoatIdentityNudge'
import { StartCountdown } from '@/components/race/StartCountdown'
import { entryDisplayLabel } from '@/lib/entry-label'
import { detectOcs, type BoatFix, type StartLine, type CourseRef } from '@/lib/ocs'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** Format a timestamptz to HH:MM */
function formatTime(ts: string): string {
  const d = new Date(ts)
  return d.toISOString().slice(11, 16)
}

/** Add minutes to a HH:MM string */
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = ((h * 60 + m + mins) % (24 * 60) + 24 * 60) % (24 * 60)
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Strip a leading "Start time: HH:MM" line from notes (matches extractStartTime pattern) */
function stripStartTimeLine(notes: string | null): string {
  if (!notes) return ''
  return notes.replace(/^Start time: \d{2}:\d{2}\n?/, '').trim()
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'race'
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface RaceData {
  id: string
  name: string
  race_number: number | null
  series: string | null
  race_date: string
  notes: string | null
  safety_info: string | null
  vhf_channel: string | null
  status: string
  entry_token: string
  club_id: string | null
  course_template_id: string | null
  start_time: string | null
  start_scheduled_at: string | null
  race_status: string | null
  control_message: string | null
  control_message_at: string | null
  individual_recall: boolean | null
  ood_id: string | null
  ood_open_for_volunteer: boolean | null
  ood_accepted: boolean | null
  ood_assigned_by: string | null
}

interface StartClass {
  id: string
  name: string
  class_flag: string | null
  prep_flag: string
  start_time: string
  sequence_warning_mins: number
}

interface CourseMark {
  name: string
  lat: number
  lon: number
  roundingSide: 'port' | 'starboard'
}

interface CourseData {
  name: string
  laps: number
  start_line_lat1: number | null
  start_line_lng1: number | null
  start_line_lat2: number | null
  start_line_lng2: number | null
  finish_line_lat1: number | null
  finish_line_lng1: number | null
  finish_line_lat2: number | null
  finish_line_lng2: number | null
  finish_at_start: boolean | null
  marks: CourseMark[]
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RaceCentrePage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const token = params?.token as string
  // Training/sim mode: speed the displayed countdown so testers see the whole
  // start sequence in seconds (matches the Race Nav sim multiplier of 8x).
  const SIM_SPEED = 8
  const simActive = searchParams?.get('sim') === '1'
  const { user, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [race, setRace] = useState<RaceData | null>(null)
  const [startClasses, setStartClasses] = useState<StartClass[]>([])
  const [course, setCourse] = useState<CourseData | null>(null)
  const [showText, setShowText] = useState(false)
  const [copied, setCopied] = useState(false)
  // Member's own details, to build a pre-filled no-login tracking link.
  const [myBoat, setMyBoat] = useState<{ boat_name: string; sail_number: string | null } | null>(null)
  const [myName, setMyName] = useState<string>('')
  // Whether the signed-in user is missing an emergency contact (drives a gentle nudge).
  const [needsSafetyContact, setNeedsSafetyContact] = useState(false)
  const [safetyNudgeDismissed, setSafetyNudgeDismissed] = useState(true)
  // Fleet (entries) + organiser remove.
  const [entries, setEntries] = useState<Array<{ id: string; boat_name: string | null; sail_number: string | null; helm_name: string | null; status: string; ocs?: boolean | null }>>([])
  const [crewAvailable, setCrewAvailable] = useState<Array<{ id: string; helm_name: string | null; phone: string | null; crew_invited_by: string | null; crew_invite_status: string | null }>>([])
  const [myEntry, setMyEntry] = useState<{ id: string; boat_name: string | null; status: string } | null>(null)
  // My own crew-available entry (if I entered as crew looking for a boat) + any invite on it.
  const [myCrewEntry, setMyCrewEntry] = useState<{ id: string; crew_invited_by: string | null; crew_invite_status: string | null; crew_invited_boat_name: string | null } | null>(null)
  // My boat entry in this race (if any) — lets me, as a helm, invite crew.
  const [myBoatEntry, setMyBoatEntry] = useState<{ id: string; boat_name: string | null; boat_id: string | null } | null>(null)
  const [crewBusyId, setCrewBusyId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  // Roles + OOD
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOfficer, setIsOfficer] = useState(false)
  const [oodName, setOodName] = useState<string | null>(null)
  const [oodBusy, setOodBusy] = useState(false)
  const [clubMembers, setClubMembers] = useState<Array<{ id: string; full_name: string | null }>>([])
  const [pickTarget, setPickTarget] = useState('')
  // Race Control (OOD): live synchronised start.
  const [startBusy, setStartBusy] = useState(false)
  // Race Control broadcast actions (delay / abandon).
  const [controlBusy, setControlBusy] = useState(false)
  // Persistent radio-announcement reminder after a broadcast action.
  const [radioNote, setRadioNote] = useState<string | null>(null)
  // Two-tap guard so an accidental single tap can't abandon the race.
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  // Individual recall (OCS) — committee-authoritative flagging + broadcast.
  const [ocsBusy, setOcsBusy] = useState(false)
  const [autoRan, setAutoRan] = useState(false)

  // Auth gate: redirect to login if not signed in
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/race/centre/${token}`)}`)
    }
  }, [authLoading, user, router, token])

  // Load race data
  useEffect(() => {
    if (!token || authLoading || !user) return

    async function load() {
      const supabase = getBrowserClient()

      const { data: raceData, error: raceErr } = await supabase
        .from('races')
        .select('id, name, race_number, series, race_date, notes, safety_info, vhf_channel, status, entry_token, club_id, course_template_id, start_time, start_scheduled_at, race_status, control_message, control_message_at, individual_recall, ood_id, ood_open_for_volunteer, ood_accepted, ood_assigned_by')
        .eq('entry_token', token)
        .single()

      if (raceErr || !raceData) {
        setError('Race not found. Check your link.')
        setLoading(false)
        return
      }

      setRace(raceData as RaceData)

      // Start classes
      const { data: classes } = await supabase
        .from('start_classes')
        .select('id, name, class_flag, prep_flag, start_time, sequence_warning_mins')
        .eq('race_id', raceData.id)
        .order('start_time', { ascending: true })

      if (classes) setStartClasses(classes as StartClass[])

      // Course template + legs + marks
      if (raceData.course_template_id) {
        const { data: tpl } = await supabase
          .from('course_templates')
          .select('*')
          .eq('id', raceData.course_template_id)
          .single()

        if (tpl) {
          const { data: legs } = await supabase
            .from('course_template_legs')
            .select('sequence_index, rounding_side, mark_id')
            .eq('template_id', tpl.id)
            .order('sequence_index', { ascending: true })

          const marks: CourseMark[] = []
          if (legs && legs.length > 0) {
            const markIds = (legs as Array<{ mark_id: string }>).map(l => l.mark_id)
            const { data: markData } = await supabase
              .from('marks')
              .select('id, name, lat, lon')
              .in('id', markIds)

            if (markData) {
              ;(legs as Array<{ sequence_index: number; rounding_side: 'port' | 'starboard'; mark_id: string }>).forEach(leg => {
                const m = (markData as Array<{ id: string; name: string; lat: number; lon: number }>)
                  .find(md => md.id === leg.mark_id)
                if (m) {
                  marks.push({ name: m.name, lat: m.lat, lon: m.lon, roundingSide: leg.rounding_side })
                }
              })
            }
          }

          setCourse({
            name: tpl.name as string,
            laps: (tpl.laps as number | null) ?? 1,
            start_line_lat1: tpl.start_line_lat1 as number | null,
            start_line_lng1: tpl.start_line_lng1 as number | null,
            start_line_lat2: tpl.start_line_lat2 as number | null,
            start_line_lng2: tpl.start_line_lng2 as number | null,
            finish_line_lat1: tpl.finish_line_lat1 as number | null,
            finish_line_lng1: tpl.finish_line_lng1 as number | null,
            finish_line_lat2: tpl.finish_line_lat2 as number | null,
            finish_line_lng2: tpl.finish_line_lng2 as number | null,
            finish_at_start: tpl.finish_at_start as boolean | null,
            marks,
          })
        }
      }

      // Member's own boat + name -> pre-filled tracking link (smarts in the link).
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, role, emergency_contact_name, emergency_contact_phone')
          .eq('id', user.id)
          .maybeSingle()
        if (prof?.full_name) setMyName(prof.full_name)
        const ec = prof as { emergency_contact_name?: string | null; emergency_contact_phone?: string | null } | null
        setNeedsSafetyContact(!ec?.emergency_contact_name && !ec?.emergency_contact_phone)
        if ((prof as { role?: string } | null)?.role === 'admin') setIsAdmin(true)
        const rl = (prof as { role?: string } | null)?.role
        if (rl === 'admin' || rl === 'race_officer') setIsOfficer(true)
        const { data: boat } = await supabase
          .from('boats')
          .select('boat_name, sail_number')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (boat) setMyBoat(boat as { boat_name: string; sail_number: string | null })
      }

      // Fleet: everyone entered in this race.
      const { data: ents } = await supabase
        .from('race_entries')
        .select('id, boat_name, sail_number, helm_name, phone, status, role, boat_id, user_id, participant_id, crew_invited_by, crew_invite_status, crew_invited_boat_name, ocs')
        .eq('race_id', raceData.id)
        .neq('status', 'withdrawn')
        .order('created_at', { ascending: true })
      const myParticipantId = typeof window !== 'undefined' ? window.localStorage.getItem('scq-participant-id') : null
      if (ents) {
        const rows = ents as Array<{ id: string; boat_name: string | null; sail_number: string | null; helm_name: string | null; phone: string | null; status: string; role: string | null; boat_id: string | null; user_id: string | null; participant_id: string | null; crew_invited_by: string | null; crew_invite_status: string | null; crew_invited_boat_name: string | null; ocs: boolean | null }>
        // Crew available = entered as crew with no boat AND not yet accepted onto one.
        const crew = rows.filter((r) => r.role === 'crew' && !r.boat_id && r.crew_invite_status !== 'accepted')
        const boats = rows.filter((r) => !(r.role === 'crew' && !r.boat_id && r.crew_invite_status !== 'accepted'))
        setEntries(boats.map((r) => ({ id: r.id, boat_name: r.boat_name, sail_number: r.sail_number, helm_name: r.helm_name, status: r.status, ocs: r.ocs })))
        setCrewAvailable(crew.map((r) => ({ id: r.id, helm_name: (r.helm_name ?? '').replace(/\s*\(available as crew\)\s*/i, '').trim() || 'A sailor', phone: r.phone, crew_invited_by: r.crew_invited_by, crew_invite_status: r.crew_invite_status })))
        // Is one of these crew rows MINE? (by user_id or this device's participant_id)
        const mineCrew = rows.find((r) => r.role === 'crew' && !r.boat_id && ((user && r.user_id === user.id) || (myParticipantId && r.participant_id === myParticipantId)))
        setMyCrewEntry(mineCrew ? { id: mineCrew.id, crew_invited_by: mineCrew.crew_invited_by, crew_invite_status: mineCrew.crew_invite_status, crew_invited_boat_name: mineCrew.crew_invited_boat_name } : null)
        // Do I have a BOAT entry here? (lets me invite crew)
        const mineBoat = rows.find((r) => r.boat_id && ((user && r.user_id === user.id) || (myParticipantId && r.participant_id === myParticipantId)))
        setMyBoatEntry(mineBoat ? { id: mineBoat.id, boat_name: mineBoat.boat_name, boat_id: mineBoat.boat_id } : null)
      }

      // Am I entered? (drives the advance-entry card)
      if (user) {
        const { data: mine } = await supabase
          .from('race_entries')
          .select('id, boat_name, status')
          .eq('race_id', raceData.id)
          .eq('user_id', user.id)
          .neq('status', 'withdrawn')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        setMyEntry((mine as { id: string; boat_name: string | null; status: string } | null) ?? null)
      }

      // OOD name (if assigned).
      if ((raceData as RaceData).ood_id) {
        const { data: oodProf } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', (raceData as RaceData).ood_id)
          .maybeSingle()
        setOodName(oodProf?.full_name ?? 'Assigned')
      }

      // Club members (for nominate / pre-assign pickers).
      const memberClubId = (raceData as RaceData).club_id
      if (memberClubId) {
        const { data: mem } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('club_id', memberClubId)
          .order('full_name', { ascending: true })
        if (mem) setClubMembers(mem as Array<{ id: string; full_name: string | null }>)
      }

      setLoading(false)
    }

    load()
  }, [token, authLoading, user])

  async function removeEntry(id: string) {
    if (!confirm('Remove this boat from the race?')) return
    setRemovingId(id)
    const supabase = getBrowserClient()
    const { error: delErr } = await supabase.from('race_entries').delete().eq('id', id)
    if (!delErr) setEntries((prev) => prev.filter((e) => e.id !== id))
    setRemovingId(null)
  }

  // ── Crew invites ──────────────────────────────────────────────────────────────
  // Reload the entry lists (crew + fleet + my entries) after an invite action.
  async function reloadEntries() {
    if (!race) return
    const supabase = getBrowserClient()
    const { data: ents } = await supabase
      .from('race_entries')
      .select('id, boat_name, sail_number, helm_name, phone, status, role, boat_id, user_id, participant_id, crew_invited_by, crew_invite_status, crew_invited_boat_name, ocs')
      .eq('race_id', race.id)
      .neq('status', 'withdrawn')
      .order('created_at', { ascending: true })
    if (!ents) return
    const rows = ents as Array<{ id: string; boat_name: string | null; sail_number: string | null; helm_name: string | null; phone: string | null; status: string; role: string | null; boat_id: string | null; user_id: string | null; participant_id: string | null; crew_invited_by: string | null; crew_invite_status: string | null; crew_invited_boat_name: string | null; ocs: boolean | null }>
    const myParticipantId = typeof window !== 'undefined' ? window.localStorage.getItem('scq-participant-id') : null
    const crew = rows.filter((r) => r.role === 'crew' && !r.boat_id && r.crew_invite_status !== 'accepted')
    const boats = rows.filter((r) => !(r.role === 'crew' && !r.boat_id && r.crew_invite_status !== 'accepted'))
    setEntries(boats.map((r) => ({ id: r.id, boat_name: r.boat_name, sail_number: r.sail_number, helm_name: r.helm_name, status: r.status, ocs: r.ocs })))
    setCrewAvailable(crew.map((r) => ({ id: r.id, helm_name: (r.helm_name ?? '').replace(/\s*\(available as crew\)\s*/i, '').trim() || 'A sailor', phone: r.phone, crew_invited_by: r.crew_invited_by, crew_invite_status: r.crew_invite_status })))
    const mineCrew = rows.find((r) => r.role === 'crew' && !r.boat_id && ((user && r.user_id === user.id) || (myParticipantId && r.participant_id === myParticipantId)))
    setMyCrewEntry(mineCrew ? { id: mineCrew.id, crew_invited_by: mineCrew.crew_invited_by, crew_invite_status: mineCrew.crew_invite_status, crew_invited_boat_name: mineCrew.crew_invited_boat_name } : null)
    const mineBoat = rows.find((r) => r.boat_id && ((user && r.user_id === user.id) || (myParticipantId && r.participant_id === myParticipantId)))
    setMyBoatEntry(mineBoat ? { id: mineBoat.id, boat_name: mineBoat.boat_name, boat_id: mineBoat.boat_id } : null)
  }

  // Helm invites a crew-available sailor to their boat.
  async function inviteCrew(crewEntryId: string) {
    if (!myBoatEntry) return
    setCrewBusyId(crewEntryId)
    const supabase = getBrowserClient()
    const { error } = await supabase
      .from('race_entries')
      .update({ crew_invited_by: myBoatEntry.id, crew_invite_status: 'pending', crew_invited_boat_name: myBoatEntry.boat_name })
      .eq('id', crewEntryId)
    setCrewBusyId(null)
    if (error) { alert('Could not send invite: ' + error.message); return }
    // Fire-and-forget: email/SMS the invited crew member.
    void fetch('/api/crew-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'crew-invited', crewEntryId, raceToken: token }),
    }).catch(() => {})
    await reloadEntries()
  }

  // Helm cancels a pending invite they sent.
  async function cancelCrewInvite(crewEntryId: string) {
    setCrewBusyId(crewEntryId)
    const supabase = getBrowserClient()
    const { error } = await supabase
      .from('race_entries')
      .update({ crew_invited_by: null, crew_invite_status: null, crew_invited_boat_name: null })
      .eq('id', crewEntryId)
    setCrewBusyId(null)
    if (error) { alert('Could not cancel invite: ' + error.message); return }
    await reloadEntries()
  }

  // Crew accepts the invite → attach to the helm's boat (drops off available list).
  async function acceptCrewInvite() {
    if (!myCrewEntry?.crew_invited_by) return
    setCrewBusyId(myCrewEntry.id)
    const supabase = getBrowserClient()
    // Look up the inviting boat entry to copy its boat.
    const { data: helm } = await supabase
      .from('race_entries')
      .select('boat_id, boat_name')
      .eq('id', myCrewEntry.crew_invited_by)
      .maybeSingle()
    const { error } = await supabase
      .from('race_entries')
      .update({
        crew_invite_status: 'accepted',
        boat_id: (helm as { boat_id: string | null } | null)?.boat_id ?? null,
        boat_name: (helm as { boat_name: string | null } | null)?.boat_name ?? myCrewEntry.crew_invited_boat_name,
      })
      .eq('id', myCrewEntry.id)
    setCrewBusyId(null)
    if (error) { alert('Could not accept: ' + error.message); return }
    await reloadEntries()
  }

  // Crew declines the invite → stays available.
  async function declineCrewInvite() {
    if (!myCrewEntry) return
    setCrewBusyId(myCrewEntry.id)
    const supabase = getBrowserClient()
    const { error } = await supabase
      .from('race_entries')
      .update({ crew_invited_by: null, crew_invite_status: 'declined', crew_invited_boat_name: null })
      .eq('id', myCrewEntry.id)
    setCrewBusyId(null)
    if (error) { alert('Could not decline: ' + error.message); return }
    await reloadEntries()
  }

  // ── OOD (per-race) ────────────────────────────────────────────────────────
  // Reload just the OOD fields + name after a lifecycle action.
  async function refreshOod() {
    if (!race) return
    const supabase = getBrowserClient()
    const { data } = await supabase
      .from('races')
      .select('ood_id, ood_accepted, ood_assigned_by')
      .eq('id', race.id)
      .maybeSingle()
    if (!data) return
    setRace((r) => (r ? { ...r, ood_id: data.ood_id, ood_accepted: data.ood_accepted, ood_assigned_by: data.ood_assigned_by } : r))
    if (data.ood_id) {
      if (data.ood_id === user?.id) setOodName(myName || 'You')
      else {
        const { data: p } = await supabase.from('profiles').select('full_name').eq('id', data.ood_id).maybeSingle()
        setOodName(p?.full_name ?? 'Assigned')
      }
    } else setOodName(null)
  }

  async function takeOod(override = false) {
    if (!race) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_take', { p_race: race.id, p_override: override })
    setOodBusy(false)
    if (e) { alert('Could not take OOD: ' + e.message); return }
    if (data === 'needs-confirm') {
      const who = oodName ?? 'Someone'
      if (confirm(`${who} was assigned as OOD but hasn’t accepted yet. Are you sure you want to take it?`)) {
        await takeOod(true)
      }
      return
    }
    if (data === 'blocked-accepted') {
      alert(`${oodName ?? 'Someone'} is already the accepted Officer of the Day. Only they can nominate a replacement.`)
      return
    }
    await refreshOod()
  }

  async function acceptOod() {
    if (!race) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    await supabase.rpc('ood_accept', { p_race: race.id })
    setOodBusy(false)
    await refreshOod()
  }

  async function standDownOod() {
    if (!race) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    await supabase.rpc('ood_stand_down', { p_race: race.id })
    setOodBusy(false)
    await refreshOod()
  }

  async function nominateOod(target: string) {
    if (!race || !target) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_nominate', { p_race: race.id, p_target: target })
    setOodBusy(false)
    if (e) { alert('Could not nominate: ' + e.message); return }
    if (data !== 'nominated') { alert('Could not nominate (' + data + ').'); return }
    setPickTarget('')
    await refreshOod()
  }

  async function assignOod(target: string) {
    if (!race || !target) return
    setOodBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_assign', { p_race: race.id, p_target: target })
    setOodBusy(false)
    if (e) { alert('Could not assign: ' + e.message); return }
    if (data !== 'assigned') { alert('Could not assign (' + data + ').'); return }
    setPickTarget('')
    await refreshOod()
  }

  const iAmOod = !!race && race.ood_id === user?.id
  // Whoever holds race control: the current OOD (self-taken competitor or
  // assigned+accepted official) or a club officer/admin acting as controller.
  const iAmController = iAmOod || (isOfficer && !!race)
  // Absolute start time the controller has set (epoch ms), synchronised across boats.
  const scheduledStartMs = race?.start_scheduled_at ? new Date(race.start_scheduled_at).getTime() : null
  // Warning-signal lead time from the first start class (fallback 5 min).
  const warningMins = startClasses[0]?.sequence_warning_mins ?? 5

  // ── Race Control: set/adjust the synchronised start gun ─────────────────────
  // Reuses the control-gated ood_set_start RPC (SECURITY DEFINER) so a competitor
  // who has taken control can drive the start despite races UPDATE RLS.
  async function setStartAt(iso: string | null) {
    if (!race) return
    setStartBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_set_start', { p_race: race.id, p_start: iso })
    setStartBusy(false)
    if (e) { alert('Could not set start: ' + e.message); return }
    if (data !== 'set') { alert('Could not set start (' + data + ').'); return }
    // Optimistic local update; realtime will also confirm for everyone.
    setRace((r) => (r ? { ...r, start_scheduled_at: iso } : r))
  }

  // Schedule the gun a number of minutes from now (big one-tap controls).
  function scheduleInMinutes(mins: number) {
    setStartAt(new Date(Date.now() + mins * 60_000).toISOString())
  }

  // ── Race Control: DELAY START ───────────────────────────────────────────────
  // Pushes the gun forward via the control-gated ood_delay_start RPC. Every boat
  // gets the amber banner live; the OOD still announces verbally (radio note).
  async function delayStart(mins = 5) {
    if (!race) return
    setControlBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_delay_start', { p_race: race.id, p_minutes: mins })
    setControlBusy(false)
    if (e) { alert('Could not delay start: ' + e.message); return }
    if (data === 'not-controller' || data === 'no-race') { alert('Could not delay start (' + data + ').'); return }
    // data is the new start time (ISO). Optimistic local update; realtime confirms for all.
    setRace((r) => (r ? { ...r, start_scheduled_at: data as string, race_status: 'postponed', control_message: `Start delayed by ${mins} min`, control_message_at: new Date().toISOString() } : r))
    setRadioNote("📻 Announce on the radio: 'Start delayed 5 minutes.'")
  }

  // ── Race Control: ABANDON RACE (two-tap confirm) ─────────────────────────────
  async function abandonRace() {
    if (!race) return
    setControlBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_abandon_race', { p_race: race.id })
    setControlBusy(false)
    setConfirmAbandon(false)
    if (e) { alert('Could not abandon race: ' + e.message); return }
    if (data !== 'abandoned') { alert('Could not abandon race (' + data + ').'); return }
    setRace((r) => (r ? { ...r, race_status: 'abandoned', control_message: 'Race abandoned', control_message_at: new Date().toISOString() } : r))
    setRadioNote("📻 Announce on the radio: 'Race abandoned.'")
  }

  // ── Race Control: INDIVIDUAL RECALL (OCS) ───────────────────────────────
  // Persist the EXACT set of OCS entry ids via the control-gated ood_flag_ocs RPC
  // (SECURITY DEFINER, same auth as ood_set_start), then broadcast the recall
  // (races.individual_recall) so every boat's screen updates live. Optimistic
  // local update mirrors the confirmed state.
  async function applyOcs(ocsIds: string[], opts: { broadcast?: boolean } = {}) {
    if (!race) return
    setOcsBusy(true)
    const supabase = getBrowserClient()
    const { data, error: e } = await supabase.rpc('ood_flag_ocs', { p_race: race.id, p_entry_ids: ocsIds })
    if (e) { setOcsBusy(false); alert('Could not flag OCS: ' + e.message); return }
    if (typeof data === 'number' && data < 0) {
      setOcsBusy(false)
      alert(data === -2 ? 'Only whoever holds race control can flag OCS.' : 'Could not flag OCS.')
      return
    }
    // Broadcast (or clear) the fleet-wide recall flag. Active whenever ≥1 boat is OCS.
    const active = opts.broadcast ?? ocsIds.length > 0
    const { error: e2 } = await supabase.rpc('ood_set_individual_recall', { p_race: race.id, p_active: active })
    setOcsBusy(false)
    if (e2) { alert('Flagged OCS but could not broadcast recall: ' + e2.message); }
    // Optimistic local state; realtime confirms for everyone.
    const set = new Set(ocsIds)
    setEntries((prev) => prev.map((en) => ({ ...en, ocs: set.has(en.id) })))
    setRace((r) => (r ? { ...r, individual_recall: active } : r))
  }

  // Toggle a single boat's OCS flag (manual controller override). Recomputes the
  // full set and re-applies it (ood_flag_ocs takes the whole list).
  function toggleOcs(entryId: string) {
    const current = entries.filter((en) => en.ocs).map((en) => en.id)
    const next = current.includes(entryId)
      ? current.filter((id) => id !== entryId)
      : [...current, entryId]
    void applyOcs(next)
  }

  // Clear the whole individual recall (all boats + fleet flag). Turning the flag
  // OFF also clears every OCS flag server-side (see migration 035).
  async function clearRecall() {
    if (!race) return
    setOcsBusy(true)
    const supabase = getBrowserClient()
    const { error: e } = await supabase.rpc('ood_set_individual_recall', { p_race: race.id, p_active: false })
    setOcsBusy(false)
    if (e) { alert('Could not clear recall: ' + e.message); return }
    setEntries((prev) => prev.map((en) => ({ ...en, ocs: false })))
    setRace((r) => (r ? { ...r, individual_recall: false } : r))
  }

  // AUTO-DETECTION at the gun: read each entry's most-recent live_positions fix
  // at/just-before the start, run the pure detectOcs() against the start line +
  // first mark, and flag the OCS boats + broadcast the recall.
  //
  // Geometry inputs: course.start_line_* (from course_templates) as the line, and
  // course.marks[0] (the first mark / windward) as the course-side reference.
  // Graceful degradation: if the start line or first mark is missing, detectOcs
  // returns [] and we DON'T flag anyone — the OOD uses the manual list instead.
  async function runAutoDetect() {
    if (!race || !course) return
    const startLine: StartLine | null =
      course.start_line_lat1 != null && course.start_line_lng1 != null &&
      course.start_line_lat2 != null && course.start_line_lng2 != null
        ? { lat1: course.start_line_lat1, lng1: course.start_line_lng1, lat2: course.start_line_lat2, lng2: course.start_line_lng2 }
        : null
    const firstMark: CourseRef | null = course.marks.length > 0
      ? { lat: course.marks[0].lat, lon: course.marks[0].lon }
      : null
    if (!startLine || !firstMark) return // graceful degradation — manual path only

    const supabase = getBrowserClient()
    const gunIso = race.start_scheduled_at
    // Pull recent fixes for the race at/just-before the gun (small window), newest
    // first, then keep the most-recent per entry.
    let q = supabase
      .from('live_positions')
      .select('entry_id, lat, lon, recorded_at')
      .eq('race_id', race.id)
      .not('entry_id', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(500)
    if (gunIso) {
      // fixes up to ~10s after the gun (GPS jitter) so a late fix still counts.
      q = q.lte('recorded_at', new Date(new Date(gunIso).getTime() + 10_000).toISOString())
    }
    const { data: pos } = await q
    if (!pos || pos.length === 0) return
    const seen = new Set<string>()
    const fixes: BoatFix[] = []
    for (const row of pos as Array<{ entry_id: string | null; lat: number; lon: number; recorded_at: string }>) {
      if (!row.entry_id || seen.has(row.entry_id)) continue
      seen.add(row.entry_id)
      fixes.push({ entryId: row.entry_id, lat: row.lat, lon: row.lon, recordedAt: row.recorded_at })
    }
    const ocsIds = detectOcs(startLine, firstMark, fixes)
    // Always broadcast a recall context so clear boats see the subtle note too, but
    // only if we actually detected OCS boats; otherwise leave state untouched.
    if (ocsIds.length > 0) await applyOcs(ocsIds, { broadcast: true })
  }

  // ── Realtime: watch THIS race row so start/OOD/status changes reflect live ──
  // Foundation reused by later controls (recall/delay/abandon will broadcast here).
  useEffect(() => {
    if (!race?.id) return
    const supabase = getBrowserClient()
    const channel = supabase
      .channel(`race:${race.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'races', filter: `id=eq.${race.id}` },
        (payload) => {
          const n = payload.new as Partial<RaceData>
          setRace((r) => (r ? { ...r, ...n } : r))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [race?.id])

  // ── AUTO INDIVIDUAL RECALL trigger ──────────────────────────────────
  // When the controller's countdown reaches the gun, run ONE detection pass. Only
  // whoever holds control drives it (the RPC also enforces this) so it fires once,
  // not once-per-viewer. Skipped in sim mode (no real positions) + if already run.
  useEffect(() => {
    if (!iAmController || simActive) return
    if (scheduledStartMs == null || autoRan) return
    const tick = () => {
      if (Date.now() >= scheduledStartMs && !autoRan) {
        setAutoRan(true)
        void runAutoDetect()
        return true
      }
      return false
    }
    if (tick()) return
    const iv = setInterval(() => { if (tick()) clearInterval(iv) }, 500)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmController, simActive, scheduledStartMs, autoRan])

  // Reset the auto-run guard whenever the gun is (re)scheduled so a fresh start
  // after a recall re-arms detection.
  useEffect(() => { setAutoRan(false) }, [scheduledStartMs])

  // Read any prior dismissal of the safety nudge (client-only).
  useEffect(() => {
    try { setSafetyNudgeDismissed(localStorage.getItem('scq-dismissed-safety-nudge') === '1') } catch { setSafetyNudgeDismissed(false) }
  }, [])
  function dismissSafetyNudge() {
    setSafetyNudgeDismissed(true)
    try { localStorage.setItem('scq-dismissed-safety-nudge', '1') } catch { /* ignore */ }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const firstClass = startClasses[0] ?? null
  const warningTime = firstClass
    ? addMinutes(formatTime(firstClass.start_time), -firstClass.sequence_warning_mins)
    : null
  const cleanNotes = stripStartTimeLine(race?.notes ?? null)
  const raceIsOn = race?.status === 'live' || race?.status === 'confirmed'

  // Pre-filled no-login join link carrying the member's details in the URL. It
  // lands on the SINGLE canonical race screen (/race/live) for everyone. Passing
  // ?mode=tracker opts into the map-less beacon variant instead.
  function buildGoLink(mode?: 'tracker'): string {
    if (!race) return `/race/go/${token}`
    const qs = new URLSearchParams()
    if (myBoat?.boat_name) qs.set('boat', myBoat.boat_name)
    if (myBoat?.sail_number) qs.set('sail', myBoat.sail_number)
    if (myName) qs.set('helm', myName)
    if (mode) qs.set('mode', mode)
    const q = qs.toString()
    return `/race/go/${race.entry_token}${q ? `?${q}` : ''}`
  }
  const goLink = buildGoLink()
  const trackerLink = buildGoLink('tracker')

  // ── Text instructions ──────────────────────────────────────────────────────

  function buildTextInstructions(): string {
    if (!race) return ''
    const lines: string[] = []
    lines.push(`SAILING INSTRUCTIONS — ${race.name}`)
    if (race.series) lines.push(`Series: ${race.series}${race.race_number ? ` (Race ${race.race_number})` : ''}`)
    lines.push(`Date: ${formatDate(race.race_date)}`)
    lines.push('')
    if (startClasses.length > 0) {
      lines.push('START SEQUENCE')
      if (warningTime) lines.push(`First warning signal: ${warningTime}`)
      startClasses.forEach(cls => {
        const st = formatTime(cls.start_time)
        const flags = [cls.class_flag ? `Class flag: ${cls.class_flag}` : null, `Prep flag: ${cls.prep_flag}`]
          .filter(Boolean).join(', ')
        lines.push(`  ${cls.name} — Start ${st} (warning ${addMinutes(st, -cls.sequence_warning_mins)}; ${flags})`)
      })
      lines.push('')
    }
    if (course) {
      lines.push(`COURSE: ${course.name} — ${course.laps} lap${course.laps === 1 ? '' : 's'}`)
      course.marks.forEach((m, i) => {
        lines.push(`  ${i + 1}. ${m.name} — leave to ${m.roundingSide.toUpperCase()}`)
      })
      if (course.finish_at_start) lines.push('  Finish: at the start line')
      lines.push('')
    }
    if (race.vhf_channel) {
      lines.push(`VHF CHANNEL: ${race.vhf_channel}`)
      lines.push('')
    }
    if (race.safety_info) {
      lines.push('SAFETY INFORMATION')
      lines.push(race.safety_info)
      lines.push('')
    }
    if (cleanNotes) {
      lines.push('NOTES')
      lines.push(cleanNotes)
      lines.push('')
    }
    return lines.join('\n')
  }

  function handleCopyText() {
    navigator.clipboard.writeText(buildTextInstructions()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleDownloadText() {
    if (!race) return
    downloadBlob(buildTextInstructions(), `${slugify(race.name)}-instructions.txt`, 'text/plain;charset=utf-8')
  }

  // ── GPX download ───────────────────────────────────────────────────────────

  function handleDownloadGpx() {
    if (!race || !course || course.marks.length === 0) return

    const wpts: string[] = []
    const rtepts: string[] = []

    const addPoint = (lat: number, lon: number, name: string, asWpt: boolean) => {
      const pt = `lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"`
      if (asWpt) wpts.push(`  <wpt ${pt}>\n    <name>${escapeXml(name)}</name>\n  </wpt>`)
      rtepts.push(`    <rtept ${pt}>\n      <name>${escapeXml(name)}</name>\n    </rtept>`)
    }

    // Start line midpoint first (if defined)
    const hasStart =
      course.start_line_lat1 != null && course.start_line_lng1 != null &&
      course.start_line_lat2 != null && course.start_line_lng2 != null
    if (hasStart) {
      addPoint(
        (course.start_line_lat1! + course.start_line_lat2!) / 2,
        (course.start_line_lng1! + course.start_line_lng2!) / 2,
        'Start Line',
        true,
      )
    }

    course.marks.forEach((m, i) => {
      addPoint(m.lat, m.lon, `${i + 1}. ${m.name} (${m.roundingSide === 'port' ? 'P' : 'S'})`, true)
    })

    // Finish line midpoint last (dedicated line, or back at the start)
    const hasFinish =
      course.finish_line_lat1 != null && course.finish_line_lng1 != null &&
      course.finish_line_lat2 != null && course.finish_line_lng2 != null
    if (hasFinish) {
      addPoint(
        (course.finish_line_lat1! + course.finish_line_lat2!) / 2,
        (course.finish_line_lng1! + course.finish_line_lng2!) / 2,
        'Finish Line',
        true,
      )
    } else if (course.finish_at_start && hasStart) {
      addPoint(
        (course.start_line_lat1! + course.start_line_lat2!) / 2,
        (course.start_line_lng1! + course.start_line_lng2!) / 2,
        'Finish (Start Line)',
        false,
      )
    }

    const gpx = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Waypoint Racing" xmlns="http://www.topografix.com/GPX/1/1">',
      `  <metadata>\n    <name>${escapeXml(race.name)}</name>\n  </metadata>`,
      ...wpts,
      '  <rte>',
      `    <name>${escapeXml(`${race.name} — ${course.name}`)}</name>`,
      ...rtepts,
      '  </rte>',
      '</gpx>',
      '',
    ].join('\n')

    downloadBlob(gpx, `${slugify(race.name)}.gpx`, 'application/gpx+xml')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading race centre…</p>
      </div>
    )
  }

  if (error || !race) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card padding="lg" className="max-w-md w-full text-center">
          <p className="text-red-600 font-medium">{error || 'Race not found.'}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{race.name}</h1>
            <Badge variant={statusVariant[race.status] ?? 'default'}>
              {statusLabel[race.status] ?? race.status}
            </Badge>
          </div>
          <p className="text-gray-600 mt-1">
            {formatDate(race.race_date)}
            {race.series && <> · {race.series}{race.race_number ? ` — Race ${race.race_number}` : ''}</>}
          </p>
        </div>

        {/* Boat identity nudge — persistent prompt to replace an auto/blank boat name. */}
        <BoatIdentityNudge raceId={race.id} userId={user?.id ?? null} />

        {/* Safety reminder — never a gate. Only for members with no emergency contact. */}
        {needsSafetyContact && !safetyNudgeDismissed && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-800">
                <span className="font-medium">⚠️ Add a safety contact</span> — the race team can see this on the water.
              </p>
              <Link href="/dashboard/profile" className="mt-1.5 inline-block text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md px-2.5 py-1">
                Add now
              </Link>
            </div>
            <button
              type="button"
              onClick={dismissSafetyNudge}
              aria-label="Dismiss"
              className="shrink-0 text-amber-500 hover:text-amber-700 text-sm leading-none px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Advance entry — declare you're racing before the day */}
        {race.status !== 'completed' && (
          <Card padding="lg">
            {myEntry ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">✅ You’re entered</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {myEntry.boat_name ? `Boat: ${myEntry.boat_name}` : 'Entry confirmed'} · you can change or withdraw any time before the start.
                  </p>
                </div>
                <Link
                  href={`/race/join/${race.entry_token}`}
                  className="shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 text-sm"
                >
                  Manage entry
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Racing this one?</p>
                  <p className="text-xs text-gray-500 mt-0.5">Enter now so the club knows you’re coming — you can withdraw later.</p>
                </div>
                <Link
                  href={`/race/join/${race.entry_token}`}
                  className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 text-sm"
                >
                  Enter this race →
                </Link>
              </div>
            )}
          </Card>
        )}

        {/* Race Nav + Tracker */}
        <Card padding="lg">
          {raceIsOn ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <Link
                href={user ? `/race/live/${race.entry_token}` : goLink}
                className="inline-flex flex-col items-center justify-center gap-1 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold px-6 py-4 text-base transition-colors"
              >
                <span>📱 Full Race Nav</span>
                <span className="text-xs font-normal opacity-80">Map, marks, countdown &amp; instruments</span>
              </Link>
              <Link
                href={trackerLink}
                className="inline-flex flex-col items-center justify-center gap-1 rounded-lg bg-slate-700 hover:bg-slate-800 active:bg-slate-900 text-white font-semibold px-6 py-4 text-base transition-colors"
              >
                <span>📡 Tracker Only</span>
                <span className="text-xs font-normal opacity-80">Beacon mode — same countdown, marks &amp; finish, no map</span>
              </Link>
            </div>
          ) : (
            <div className="text-center">
              <div className="grid sm:grid-cols-2 gap-3">
                <Button size="lg" disabled className="w-full">📱 Full Race Nav</Button>
                <Button size="lg" disabled className="w-full">📡 Tracker Only</Button>
              </div>
              <p className="text-sm text-gray-500 mt-2">Race Nav &amp; Tracker open when racing starts.</p>
            </div>
          )}
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            <Link
              href={`/race/viewer/${race.entry_token}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2.5 text-sm transition-colors"
            >
              👁️ Live Viewer
            </Link>
            <Link
              href={`/race/results/${race.entry_token}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2.5 text-sm transition-colors"
            >
              🏆 Results
            </Link>
          </div>

          <p className="text-xs text-gray-400 mt-3 text-center">
            💡 Tip: add this to your home screen (Share &rarr; Add to Home Screen) to use it offline at sea.
          </p>

          {/* Training mode */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2 text-center">🎓 Never used it before? Practise first — nothing is recorded.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <Link
                href={`/race/live/${race.entry_token}?sim=1`}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium px-4 py-2 text-sm transition-colors"
              >
                Try Race Nav
              </Link>
              <Link
                href={`/race/tracker/${race.entry_token}?sim=1`}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium px-4 py-2 text-sm transition-colors"
              >
                Try Tracker
              </Link>
            </div>
          </div>
        </Card>

        {/* OOD / Race Official */}
        <Card>
          <CardHeader>
            <CardTitle>Officer of the Day</CardTitle>
          </CardHeader>
          {race?.ood_id ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-900">
                    🏳️ {oodName}{iAmOod && ' (you)'}
                  </p>
                  <p className="text-xs mt-0.5">
                    {race.ood_accepted
                      ? <span className="text-emerald-600 font-medium">✅ Accepted</span>
                      : <span className="text-amber-600 font-medium">⏳ Assigned — not yet accepted</span>}
                  </p>
                </div>
                {(isOfficer || iAmOod) && (
                  <button
                    onClick={standDownOod}
                    disabled={oodBusy}
                    className="shrink-0 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 font-medium disabled:opacity-50"
                  >
                    Stand down
                  </button>
                )}
              </div>

              {/* I'm the provisional assignee — accept it */}
              {iAmOod && !race.ood_accepted && (
                <button
                  onClick={acceptOod}
                  disabled={oodBusy}
                  className="w-full text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 font-semibold disabled:opacity-50"
                >
                  ✅ Accept OOD role
                </button>
              )}

              {/* Provisional (assigned, not accepted) and not me — anyone can take over (with confirm) */}
              {!race.ood_accepted && !iAmOod && (
                <button
                  onClick={() => takeOod(false)}
                  disabled={oodBusy}
                  className="w-full text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 font-medium disabled:opacity-50"
                >
                  Take OOD instead
                </button>
              )}

              {/* Current OOD can nominate a successor */}
              {iAmOod && clubMembers.length > 1 && (
                <div className="flex gap-2 pt-1">
                  <select
                    value={pickTarget}
                    onChange={(e) => setPickTarget(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="">Nominate a successor…</option>
                    {clubMembers.filter((mm) => mm.id !== user?.id).map((mm) => (
                      <option key={mm.id} value={mm.id}>{mm.full_name ?? 'Unnamed'}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => nominateOod(pickTarget)}
                    disabled={oodBusy || !pickTarget}
                    className="shrink-0 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 font-medium disabled:opacity-50"
                  >
                    Nominate
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">No Officer of the Day yet — anyone can take it.</p>
              <button
                onClick={() => takeOod(false)}
                disabled={oodBusy}
                className="text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 font-medium disabled:opacity-50"
              >
                🙋 Take OOD
              </button>

              {/* Officer can pre-assign someone (they must accept) */}
              {isOfficer && clubMembers.length > 0 && (
                <div className="flex gap-2 pt-1 border-t border-gray-100">
                  <select
                    value={pickTarget}
                    onChange={(e) => setPickTarget(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="">Pre-assign an OOD…</option>
                    {clubMembers.map((mm) => (
                      <option key={mm.id} value={mm.id}>{mm.full_name ?? 'Unnamed'}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => assignOod(pickTarget)}
                    disabled={oodBusy || !pickTarget}
                    className="shrink-0 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 font-medium disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── RACE CONTROL (OOD) ─────────────────────────────────────────────
            Visible ONLY to whoever holds control. If nobody holds it and the race
            is competitor-run, offer a big "Take race control" button (reuses the
            existing take-control flow). */}
        {iAmController ? (
          <Card className="border-2 border-red-500">
            <CardHeader>
              <CardTitle>🏴 Race Control{iAmOod ? '' : ' (officer)'}</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              {/* Live synchronised countdown (same beeps + tenths as Race Nav). */}
              {scheduledStartMs ? (
                <StartCountdown
                  startMs={scheduledStartMs}
                  warningMins={warningMins}
                  speedMultiplier={simActive ? SIM_SPEED : 1}
                  compact
                />
              ) : (
                <div className="rounded-xl bg-gray-900 py-6 text-center">
                  <p className="text-sm text-gray-400">No start scheduled yet.</p>
                  <p className="text-xs text-gray-500 mt-1">Set a start below — every boat's screen counts down in sync.</p>
                </div>
              )}

              {/* Big one-tap presets — usable one-handed on the water. */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">
                  {scheduledStartMs ? 'Reset the gun to:' : 'Start the sequence — gun in:'}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[5, 3, 1].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => scheduleInMinutes(mins)}
                      disabled={startBusy}
                      className="rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-4 text-lg disabled:opacity-50 transition-colors"
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Precise absolute time (today), plus clear. */}
              <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-gray-100">
                <div className="flex-1 min-w-[8rem]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Set exact start time</label>
                  <input
                    type="time"
                    step="1"
                    disabled={startBusy}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base tabular-nums disabled:opacity-50"
                    onChange={(e) => {
                      const v = e.target.value
                      if (!v) return
                      const [h, m, s] = v.split(':').map(Number)
                      const d = new Date()
                      d.setHours(h, m, s || 0, 0)
                      // If the chosen time already passed today, roll to the next minute-safe future.
                      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
                      setStartAt(d.toISOString())
                    }}
                  />
                </div>
                {scheduledStartMs && (
                  <button
                    onClick={() => setStartAt(null)}
                    disabled={startBusy}
                    className="shrink-0 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400">
                The start is an absolute time, so every boat counts down together. Changing it here updates all screens live.
              </p>

              {/* ── Broadcast actions: delay / abandon ─────────────────────────
                  These push a live banner to every boat via the races-row realtime
                  subscription. The OOD should ALSO announce verbally (radio note). */}
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <p className="text-xs font-medium text-gray-500">Broadcast to the fleet</p>

                {/* Current live status pill */}
                {race.race_status === 'postponed' && (
                  <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⏱️ Start currently postponed
                    {scheduledStartMs ? ` — new start ${formatTime(new Date(scheduledStartMs).toISOString())}` : ''}
                  </p>
                )}
                {race.race_status === 'abandoned' && (
                  <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    🛑 Race is marked ABANDONED for the whole fleet
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Delay start 5 min — repeatable */}
                  <button
                    onClick={() => delayStart(5)}
                    disabled={controlBusy || race.race_status === 'abandoned'}
                    className="rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold py-4 text-base disabled:opacity-50 transition-colors"
                  >
                    ⏱️ Delay start 5 min
                  </button>

                  {/* Abandon race — two-tap confirm */}
                  {confirmAbandon ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={abandonRace}
                        disabled={controlBusy}
                        className="rounded-xl bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-bold py-4 text-base disabled:opacity-50 transition-colors"
                      >
                        {controlBusy ? '…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmAbandon(false)}
                        disabled={controlBusy}
                        className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-4 text-base disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmAbandon(true)}
                      disabled={controlBusy || race.race_status === 'abandoned'}
                      className="rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-4 text-base disabled:opacity-50 transition-colors"
                    >
                      🛑 Abandon race
                    </button>
                  )}
                </div>
                {confirmAbandon && (
                  <p className="text-xs text-red-600 font-medium">Tap “Confirm” to abandon — this alerts every boat.</p>
                )}

                {/* Persistent radio-announcement reminder after an action. */}
                {radioNote && (
                  <div className="flex items-start gap-2 bg-slate-900 text-white rounded-lg px-3 py-2.5">
                    <p className="text-sm font-medium flex-1">{radioNote}</p>
                    <button
                      onClick={() => setRadioNote(null)}
                      aria-label="Dismiss"
                      className="shrink-0 text-slate-400 hover:text-white text-sm leading-none px-1"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* ── INDIVIDUAL RECALL (OCS) ───────────────────────────────
                  Auto-detection runs at the gun (marks the boats that were on the
                  course side of the start line). The OOD can add/remove boats the
                  auto pass missed — each tap re-applies the whole OCS set. Every
                  flagged boat gets a live red recall banner on its own screen. */}
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-500">Individual recall (OCS)</p>
                  {race.individual_recall && (
                    <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                      🚩 Recall in effect — {entries.filter((e) => e.ocs).length} OCS
                    </span>
                  )}
                </div>

                {/* Auto-detection status / graceful-degradation note. */}
                {(() => {
                  const hasLine =
                    course?.start_line_lat1 != null && course?.start_line_lat2 != null
                  const hasMark = (course?.marks?.length ?? 0) > 0
                  if (hasLine && hasMark) {
                    return (
                      <p className="text-[11px] text-gray-400">
                        Auto-detection runs at the start gun using the start line + first mark. Adjust below if needed.
                      </p>
                    )
                  }
                  return (
                    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      ⚠️ Auto-detection unavailable ({!hasLine ? 'no start line set' : 'no first mark'}). Flag OCS boats manually below.
                    </p>
                  )
                })()}

                {/* Manual per-boat toggles. */}
                {entries.length === 0 ? (
                  <p className="text-xs text-gray-400">No boats to flag yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                    {entries.map((en) => (
                      <li key={en.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm text-gray-900 truncate">
                          {entryDisplayLabel(en)}
                          {en.ocs && <span className="ml-2 text-[11px] font-semibold text-red-600">🚩 OCS</span>}
                        </span>
                        <button
                          onClick={() => toggleOcs(en.id)}
                          disabled={ocsBusy}
                          className={`shrink-0 text-xs rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50 transition-colors ${
                            en.ocs
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {en.ocs ? 'Clear' : 'Flag OCS'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {race.individual_recall && (
                  <button
                    onClick={clearRecall}
                    disabled={ocsBusy}
                    className="w-full rounded-xl bg-slate-700 hover:bg-slate-800 active:bg-slate-900 text-white font-semibold py-3 text-sm disabled:opacity-50"
                  >
                    Clear individual recall (all boats)
                  </button>
                )}
              </div>
            </div>
          </Card>
        ) : (!race?.ood_id && (race?.ood_open_for_volunteer ?? true)) ? (
          <Card className="border-2 border-dashed border-red-300">
            <CardHeader>
              <CardTitle>🏴 Race Control</CardTitle>
            </CardHeader>
            <p className="text-sm text-gray-600 mb-3">
              No one is running this race yet. Take control to set the start and run the countdown for the fleet.
            </p>
            <button
              onClick={() => takeOod(false)}
              disabled={oodBusy}
              className="w-full rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-4 text-lg disabled:opacity-50"
            >
              🙋 Take race control
            </button>
          </Card>
        ) : null}

        {/* Crew: MY pending/decided invite (shown to the crew member) */}
        {myCrewEntry && myCrewEntry.crew_invite_status === 'pending' && myCrewEntry.crew_invited_by && (
          <Card>
            <CardHeader>
              <CardTitle>⛵ You’ve been invited to crew</CardTitle>
            </CardHeader>
            <p className="text-sm text-gray-700 mb-3">
              <span className="font-semibold">{myCrewEntry.crew_invited_boat_name || 'A boat'}</span> has invited you to join them for this race. Accept to hop aboard — you’ll be added to their boat and taken off the available-crew list.
            </p>
            <div className="flex gap-2">
              <button
                onClick={acceptCrewInvite}
                disabled={crewBusyId === myCrewEntry.id}
                className="rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {crewBusyId === myCrewEntry.id ? 'Joining…' : '✅ Accept & join boat'}
              </button>
              <button
                onClick={declineCrewInvite}
                disabled={crewBusyId === myCrewEntry.id}
                className="rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </Card>
        )}

        {/* Crew available — people who volunteered to crew (no boat) */}
        {crewAvailable.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>🙋 Crew available ({crewAvailable.length})</CardTitle>
            </CardHeader>
            <p className="text-sm text-gray-500 mb-3">
              {myBoatEntry
                ? 'These sailors are looking for a boat — invite one to join yours.'
                : 'These sailors are looking for a boat — helms, grab a hand.'}
            </p>
            <ul className="divide-y divide-gray-100">
              {crewAvailable.map((cr) => {
                const invitedByMe = myBoatEntry && cr.crew_invited_by === myBoatEntry.id && cr.crew_invite_status === 'pending'
                const invitedByOther = cr.crew_invite_status === 'pending' && !invitedByMe
                return (
                  <li key={cr.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-900">{cr.helm_name}</span>
                      {invitedByMe && <span className="ml-2 text-xs text-amber-600">• invite sent, awaiting reply</span>}
                      {invitedByOther && <span className="ml-2 text-xs text-gray-400">• invited by another boat</span>}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {myBoatEntry ? (
                        invitedByMe ? (
                          <button
                            onClick={() => cancelCrewInvite(cr.id)}
                            disabled={crewBusyId === cr.id}
                            className="text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 font-medium disabled:opacity-50"
                          >
                            {crewBusyId === cr.id ? '…' : 'Cancel invite'}
                          </button>
                        ) : (
                          <button
                            onClick={() => inviteCrew(cr.id)}
                            disabled={crewBusyId === cr.id}
                            className="text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 font-semibold disabled:opacity-50"
                          >
                            {crewBusyId === cr.id ? '…' : '➕ Invite to my boat'}
                          </button>
                        )
                      ) : null}
                      {cr.phone ? (
                        <a href={`tel:${cr.phone}`} className="text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 font-medium">
                          📞 {cr.phone}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">No contact</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {/* Fleet + organiser remove */}
        <Card>
          <CardHeader>
            <CardTitle>Fleet ({entries.length})</CardTitle>
          </CardHeader>
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500">No boats entered yet. Share the tracking link to get people on the water.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{entryDisplayLabel(e)}</p>
                    {e.helm_name && <p className="text-xs text-gray-500 truncate">{e.helm_name}</p>}
                  </div>
                  <button
                    onClick={() => removeEntry(e.id)}
                    disabled={removingId === e.id}
                    className="shrink-0 text-xs rounded-lg bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 font-medium disabled:opacity-50"
                  >
                    {removingId === e.id ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Start sequence */}
        <Card>
          <CardHeader>
            <CardTitle>Start Sequence</CardTitle>
          </CardHeader>
          {startClasses.length === 0 ? (
            <p className="text-sm text-gray-500">No start classes have been set yet.</p>
          ) : (
            <div className="space-y-3">
              {warningTime && (
                <p className="text-sm text-gray-700">
                  First warning signal: <span className="font-semibold">{warningTime}</span>
                </p>
              )}
              <div className="divide-y divide-gray-100">
                {startClasses.map(cls => {
                  const st = formatTime(cls.start_time)
                  return (
                    <div key={cls.id} className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{cls.name}</p>
                        <p className="text-xs text-gray-500">
                          Warning {addMinutes(st, -cls.sequence_warning_mins)}
                          {cls.class_flag ? ` · Class flag ${cls.class_flag}` : ''}
                          {` · Prep flag ${cls.prep_flag}`}
                        </p>
                      </div>
                      <span className="text-lg font-semibold text-gray-900 tabular-nums">{st}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Course */}
        <Card>
          <CardHeader>
            <CardTitle>Course</CardTitle>
            {course && (
              <span className="text-sm text-gray-500">
                {course.laps} lap{course.laps === 1 ? '' : 's'}
              </span>
            )}
          </CardHeader>
          {!course ? (
            <p className="text-sm text-gray-500">No course has been assigned yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">{course.name}</p>
              {course.marks.length === 0 ? (
                <p className="text-sm text-gray-500">No marks defined for this course.</p>
              ) : (
                <ol className="space-y-1.5">
                  {course.marks.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-900">
                        <span className="text-gray-400 mr-2">{i + 1}.</span>
                        {m.name}
                      </span>
                      <RoundingBadge side={m.roundingSide} />
                    </li>
                  ))}
                </ol>
              )}
              {course.finish_at_start && (
                <p className="text-xs text-gray-500">Finish at the start line.</p>
              )}
            </div>
          )}
        </Card>

        {/* Safety & comms */}
        {(race.safety_info || race.vhf_channel || cleanNotes) && (
          <Card>
            <CardHeader>
              <CardTitle>Safety & Information</CardTitle>
            </CardHeader>
            <div className="space-y-3 text-sm">
              {race.vhf_channel && (
                <p className="text-gray-900">
                  <span className="font-medium">VHF Channel:</span> {race.vhf_channel}
                </p>
              )}
              {race.safety_info && (
                <div>
                  <p className="font-medium text-gray-900 mb-1">Safety</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{race.safety_info}</p>
                </div>
              )}
              {cleanNotes && (
                <div>
                  <p className="font-medium text-gray-900 mb-1">Notes</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{cleanNotes}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Downloads & text instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Instructions & Downloads</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowText(v => !v)}>
              📄 Text Instructions
            </Button>
            <Button
              variant="secondary"
              onClick={handleDownloadGpx}
              disabled={!course || course.marks.length === 0}
            >
              ⬇️ Download GPX
            </Button>
          </div>
          {showText && (
            <div className="mt-4 space-y-2">
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-800 whitespace-pre-wrap overflow-x-auto">
                {buildTextInstructions()}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleCopyText}>
                  {copied ? '✓ Copied' : 'Copy to clipboard'}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleDownloadText}>
                  Download .txt
                </Button>
              </div>
            </div>
          )}
          {(!course || course.marks.length === 0) && (
            <p className="text-xs text-gray-400 mt-2">GPX download is available once a course with marks is assigned.</p>
          )}
        </Card>
      </div>
      <WaypointFooter tone="light" />
    </div>
  )
}
