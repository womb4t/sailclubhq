'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getBrowserClient } from '@/lib/supabase/browser'
import { IntroTour } from './IntroTour'

/**
 * Shows the intro tutorial to every logged-in user on each visit until they
 * pick "Don't show this again" (persisted to profiles.hide_intro). Mounted
 * once in the dashboard layout.
 */
export function IntroTourGate() {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const onOnboarding = pathname?.startsWith('/dashboard/onboarding')
  const [show, setShow] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (loading || !user || checked || onOnboarding) return
    let cancelled = false
    ;(async () => {
      const supabase = getBrowserClient()
      const { data } = await supabase
        .from('profiles')
        .select('hide_intro')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled) {
        setShow(!data?.hide_intro)
        setChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, loading, checked])

  if (!user || !show || onOnboarding) return null
  return <IntroTour userId={user.id} onClose={() => setShow(false)} />
}
