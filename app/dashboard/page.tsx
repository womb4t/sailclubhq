'use client'
import { useEffect } from 'react'

// /dashboard → redirect to root dashboard (app/(dashboard)/page.tsx at /)
export default function DashboardRedirect() {
  useEffect(() => {
    window.location.href = '/'
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading...</div>
    </div>
  )
}
