'use client'
import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getBrowserClient } from '@/lib/supabase/browser'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const [checkingClub, setCheckingClub] = useState(true)
  const [hasClub, setHasClub] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login'
    }
  }, [user, loading])

  const checkClub = useCallback(async () => {
    if (!user) return

    // Check if we just completed onboarding (flag set by onboarding page)
    const justOnboarded = sessionStorage.getItem('schq_onboarded')
    if (justOnboarded) {
      sessionStorage.removeItem('schq_onboarded')
      setHasClub(true)
      setCheckingClub(false)
      return
    }

    const supabase = getBrowserClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('club_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.club_id) {
      setHasClub(true)
      // Self-heal: if this club has been left with no admin (e.g. all members
      // cleared), the server-side function promotes the caller. No-op otherwise.
      void supabase.rpc('claim_admin_if_orphaned')
    } else {
      setHasClub(false)
      if (!pathname.startsWith('/dashboard/onboarding')) {
        window.location.href = '/dashboard/onboarding'
      }
    }
    setCheckingClub(false)
  }, [user, pathname])

  useEffect(() => {
    checkClub()
  }, [checkClub])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (checkingClub && !pathname.startsWith('/dashboard/onboarding')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (pathname.startsWith('/dashboard/onboarding')) {
    return <>{children}</>
  }

  if (!hasClub) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Redirecting...</div>
      </div>
    )
  }

  return <>{children}</>
}
