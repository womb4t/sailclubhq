'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

export default function RootPage() {
  const { user, loading } = useAuth()
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      setRedirecting(true)
      window.location.href = '/dashboard'
    }
  }, [user, loading])

  if (loading || redirecting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center">
        <div className="text-blue-200 text-sm">Loading...</div>
      </div>
    )
  }

  // Not logged in — show landing page
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="text-4xl">⛵</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">Sail Club HQ</h1>
        <p className="text-blue-200 mt-2 text-lg">Race management for sailing clubs</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full mb-10">
        {[
          { icon: '📍', title: 'Marks Catalogue', desc: 'Virtual & physical marks with GPS coords' },
          { icon: '🗺️', title: 'Course Builder', desc: 'Design courses with leg-level rounding rules' },
          { icon: '🏁', title: 'Race Management', desc: 'Starts, entries, GPS tracking & results' },
        ].map((f) => (
          <div key={f.title} className="bg-white/10 rounded-xl p-4 text-center backdrop-blur-sm">
            <div className="text-2xl mb-2">{f.icon}</div>
            <h2 className="text-sm font-semibold text-white">{f.title}</h2>
            <p className="text-xs text-blue-200 mt-1">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Link
          href="/register"
          className="flex-1 bg-white text-blue-900 font-semibold text-center py-3 px-6 rounded-xl hover:bg-blue-50 transition-colors"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="flex-1 border border-white/30 text-white font-semibold text-center py-3 px-6 rounded-xl hover:bg-white/10 transition-colors"
        >
          Sign in
        </Link>
      </div>

      <p className="text-blue-400 text-xs mt-8">
        Built for race officers, by sailors.
      </p>
    </main>
  )
}
