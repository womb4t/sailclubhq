'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { WaypointMark } from '@/components/WaypointMark'

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
      <div className="min-h-screen bg-blue-950 flex items-center justify-center">
        <div className="text-blue-200 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center px-4">
      {/* Background image */}
      <Image
        src="/hero-sailing.jpg"
        alt="Sailboats racing at sea"
        fill
        className="object-cover"
        priority
        quality={85}
      />

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-950/70 via-blue-900/60 to-blue-950/80" />

      {/* Content panel */}
      <div className="relative z-10 bg-blue-950/50 backdrop-blur-sm rounded-3xl px-8 py-10 max-w-2xl w-full flex flex-col items-center">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <WaypointMark className="h-16 w-16 text-white drop-shadow-lg" />
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tight drop-shadow-lg">
            Waypoint Racing
          </h1>
          <p className="text-blue-100 mt-3 text-xl font-light drop-shadow">
            Live GPS race tracking, nav &amp; results
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mb-8">
          {[
            { icon: '📍', title: 'Marks Catalogue', desc: 'Virtual & physical marks with GPS coords' },
            { icon: '🗺️', title: 'Course Builder', desc: 'Design courses with leg-level rounding rules' },
            { icon: '🏁', title: 'Race Management', desc: 'Starts, entries, GPS tracking & results' },
          ].map((f) => (
            <div key={f.title} className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center border border-white/20">
              <div className="text-2xl mb-2">{f.icon}</div>
              <h2 className="text-sm font-semibold text-white">{f.title}</h2>
              <p className="text-xs text-blue-100 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <Link
            href="/register"
            className="flex-1 bg-white text-blue-900 font-semibold text-center py-3 px-6 rounded-xl hover:bg-blue-50 transition-colors shadow-lg"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="flex-1 border border-white/40 text-white font-semibold text-center py-3 px-6 rounded-xl hover:bg-white/10 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>

      {/* Photo credit */}
      <p className="relative z-10 text-blue-300/60 text-xs mt-8">
        Photo by{' '}
        <a
          href="https://www.pexels.com/photo/sailboats-sailing-at-sea-4015746/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-blue-200/80 transition-colors"
        >
          Cameron Shaw
        </a>
      </p>
    </main>
  )
}
