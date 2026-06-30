'use client'
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!user) return

    async function checkClub() {
      const supabase = getBrowserClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', user!.id)
        .maybeSingle()

      if (profile?.club_id) {
        setHasClub(true)
      } else {
        setHasClub(false)
        // Redirect to onboarding unless already there
        if (!pathname.startsWith('/dashboard/onboarding')) {
          window.location.href = '/dashboard/onboarding'
        }
      }
      setCheckingClub(false)
    }

    checkClub()
  }, [user, pathname])

  if (loading || (!user)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  // While checking club, show loading (unless on onboarding page)
  if (checkingClub && !pathname.startsWith('/dashboard/onboarding')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  // On onboarding page, always show it
  if (pathname.startsWith('/dashboard/onboarding')) {
    return <>{children}</>
  }

  // Everywhere else, only show if has club
  if (!hasClub) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Redirecting...</div>
      </div>
    )
  }

  return <>{children}</>
}
