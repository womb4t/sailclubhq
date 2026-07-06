import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { sendSms, sendEmail } from '@/lib/notify'

// POST /api/crew-notify
// Body:
//   { type: 'crew-invited', crewEntryId, raceToken }
//   { type: 'crew-available', crewEntryId, raceToken }
//
// crew-invited   -> notify the invited crew member (a helm offered them a boat).
// crew-available -> notify the helm of every entered boat that a crew is available.
//
// Recipient contact is looked up server-side (service role): entry.phone,
// and email from the linked profile (auth user) when the entry has a user_id.

export const runtime = 'nodejs'

type EntryRow = {
  id: string
  race_id: string | null
  user_id: string | null
  helm_name: string | null
  phone: string | null
  boat_name: string | null
  crew_invited_boat_name: string | null
}

async function emailFor(sb: ReturnType<typeof getServiceClient>, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const { data } = await sb.auth.admin.getUserById(userId)
  return data?.user?.email ?? null
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://waypointracing.vercel.app'
}

export async function POST(req: NextRequest) {
  let body: { type?: string; crewEntryId?: string; raceToken?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const { type, crewEntryId, raceToken } = body
  if (!type || !crewEntryId) {
    return NextResponse.json({ ok: false, error: 'missing type or crewEntryId' }, { status: 400 })
  }

  const sb = getServiceClient()

  // Load the crew entry.
  const { data: crew } = await sb
    .from('race_entries')
    .select('id, race_id, user_id, helm_name, phone, boat_name, crew_invited_boat_name')
    .eq('id', crewEntryId)
    .maybeSingle()
  if (!crew) return NextResponse.json({ ok: false, error: 'crew entry not found' }, { status: 404 })
  const crewRow = crew as EntryRow

  // Race name + centre link.
  const { data: race } = await sb
    .from('races')
    .select('name, entry_token')
    .eq('id', crewRow.race_id)
    .maybeSingle()
  const raceName = (race as { name?: string } | null)?.name || 'your race'
  const token = raceToken || (race as { entry_token?: string } | null)?.entry_token || ''
  const centreUrl = `${appUrl()}/race/centre/${token}`

  const results: Record<string, unknown> = { sms: [], email: [] }
  const crewName = (crewRow.helm_name || 'A sailor').replace(/\s*\(available as crew\)\s*/i, '').trim() || 'A sailor'

  if (type === 'crew-invited') {
    // Notify the invited crew member.
    const boat = crewRow.crew_invited_boat_name || 'A boat'
    const email = await emailFor(sb, crewRow.user_id)
    const smsBody = `⛵ ${boat} has invited you to crew in "${raceName}". Open Waypoint Racing to accept: ${centreUrl}`
    const subject = `You've been invited to crew — ${raceName}`
    const html = `<p><strong>${boat}</strong> has invited you to join them as crew for <strong>${raceName}</strong>.</p>`
      + `<p><a href="${centreUrl}">Open the Race Centre</a> to accept or decline.</p>`
      + `<p style="color:#888;font-size:12px">Waypoint Racing</p>`
    if (crewRow.phone) results.sms = [await sendSms(crewRow.phone, smsBody)]
    if (email) results.email = [await sendEmail(email, subject, html)]
    return NextResponse.json({ ok: true, ...results })
  }

  if (type === 'crew-available') {
    // Notify the helm of every entered boat in this race.
    const { data: boats } = await sb
      .from('race_entries')
      .select('id, user_id, helm_name, phone, boat_name, boat_id')
      .eq('race_id', crewRow.race_id)
      .not('boat_id', 'is', null)
      .neq('status', 'withdrawn')
    const rows = (boats || []) as Array<{ id: string; user_id: string | null; helm_name: string | null; phone: string | null; boat_name: string | null }>
    const smsOut: unknown[] = []
    const emailOut: unknown[] = []
    for (const b of rows) {
      const helm = (b.helm_name || 'there').trim()
      const boat = b.boat_name || 'your boat'
      const smsBody = `⛵ ${crewName} is available as crew for "${raceName}". Open Waypoint Racing to invite them to ${boat}: ${centreUrl}`
      const subject = `Crew available — ${raceName}`
      const html = `<p>Hi ${helm},</p>`
        + `<p><strong>${crewName}</strong> has put themselves forward as available crew for <strong>${raceName}</strong>.</p>`
        + `<p><a href="${centreUrl}">Open the Race Centre</a> to invite them aboard <strong>${boat}</strong>.</p>`
        + `<p style="color:#888;font-size:12px">Waypoint Racing</p>`
      if (b.phone) smsOut.push(await sendSms(b.phone, smsBody))
      const email = await emailFor(sb, b.user_id)
      if (email) emailOut.push(await sendEmail(email, subject, html))
    }
    return NextResponse.json({ ok: true, boats: rows.length, sms: smsOut, email: emailOut })
  }

  return NextResponse.json({ ok: false, error: 'unknown type' }, { status: 400 })
}
