'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'

/**
 * Race Nav link for live races. Only rendered for logged-in users —
 * the live nav view is a competitor tool, not a public spectator page.
 * Auth is stored client-side (localStorage), so this checks the browser session.
 */
export function RaceNavLink({ entryToken }: { entryToken: string }) {
  const [authed, setAuthed] = useState(false)

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

  if (!authed) return null

  return (
    <Link
      href={`/race/live/${entryToken}`}
      className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 transition-colors"
    >
      📱 Race Nav
    </Link>
  )
}
