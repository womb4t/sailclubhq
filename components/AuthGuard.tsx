'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'authed' | 'unauthed'>('loading')

  useEffect(() => {
    const supabase = createClient()

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? 'authed' : 'unauthed')
    })

    // Also listen for auth state changes (handles the case where session loads async)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'authed' : 'unauthed')
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (status === 'unauthed') {
      router.replace('/login')
    }
  }, [status, router])

  if (status === 'loading') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading...</div>
    </div>
  )

  if (status === 'unauthed') return null

  return <>{children}</>
}
