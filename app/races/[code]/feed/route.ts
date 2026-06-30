import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function extractStartTime(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/Start time: (\d{2}:\d{2})/)
  return match ? match[1] : null
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

interface Race {
  id: string
  name: string
  race_number: number | null
  series: string | null
  race_date: string
  notes: string | null
  status: string
  entry_token: string
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const supabase = getSupabase()

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name')
    .eq('invite_code', code.toLowerCase())
    .maybeSingle()

  if (!club) {
    return new NextResponse('Club not found', { status: 404 })
  }

  const { data: races } = await supabase
    .from('races')
    .select('id, name, race_number, series, race_date, notes, status, entry_token')
    .eq('club_id', club.id)
    .in('status', ['planned', 'confirmed', 'completed'])
    .order('race_date', { ascending: false })

  const allRaces = (races ?? []) as Race[]

  const baseUrl = new URL(request.url).origin
  const pageUrl = `${baseUrl}/races/${code}`

  const items = allRaces
    .map((race) => {
      const startTime = extractStartTime(race.notes)
      const descParts: string[] = [
        `Date: ${formatDate(race.race_date)}`,
        ...(startTime ? [`Start time: ${startTime}`] : []),
        ...(race.series ? [`Series: ${race.series}`] : []),
        `Status: ${race.status.charAt(0).toUpperCase() + race.status.slice(1)}`,
      ]

      const pubDate = new Date(race.race_date + 'T00:00:00').toUTCString()

      return `    <item>
      <title>${escapeXml(race.name)}</title>
      <description>${escapeXml(descParts.join(' | '))}</description>
      <pubDate>${pubDate}</pubDate>
      <link>${pageUrl}</link>
      <guid isPermaLink="false">${race.id}</guid>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(club.name + ' Race Calendar')}</title>
    <link>${pageUrl}</link>
    <description>Upcoming and past races for ${escapeXml(club.name)}</description>
    <language>en-gb</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
