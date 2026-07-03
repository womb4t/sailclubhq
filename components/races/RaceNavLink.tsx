'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'

/**
 * Race Nav link for live races on public pages.
 * - Logged-in users go straight to the live nav view.
 * - Logged-out users are routed to login first, then redirected to the race centre.
 * The live nav view is a competitor tool, not a public spectator page.
 * Auth is stored client-side (localStorage), so this checks the browser session.
 */
export function RaceNavLink({ entryToken }: { entryToken: string }) {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    const supabase = getBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthed(!!data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthed(!!session)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // While auth state is resolving, render nothing to avoid a flicker.
  if (authed === null) return null

  // Logged in → race centre (which offers Race Nav). Logged out → login, then back to race centre.
  const raceCentre = `/race/centre/${entryToken}`
  const href = authed
    ? raceCentre
    : `/login?redirect=${encodeURIComponent(raceCentre)}`

  return (
    <Link
      href={href}
      className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 transition-colors"
    >
      📱 Race Centre
    </Link>
  )
}
