'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getBrowserClient } from '@/lib/supabase/browser'

interface NavItem {
  href: string
  label: string
  icon: string
  officerOnly?: boolean
}

// officerOnly items are hidden from plain members (participants). Members only
// need to find races, manage their boats, and edit their profile.
const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/dashboard/races', label: 'Races', icon: '🏁' },
  { href: '/dashboard/marks', label: 'Marks', icon: '📍', officerOnly: true },
  { href: '/dashboard/courses', label: 'Courses', icon: '🗺️', officerOnly: true },
  { href: '/dashboard/boats', label: 'Boats', icon: '⛵' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href)
}

export function DashboardNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [isOfficer, setIsOfficer] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const supabase = getBrowserClient()
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (!cancelled) setIsOfficer(data?.role === 'admin' || data?.role === 'race_officer')
    })()
    return () => { cancelled = true }
  }, [user])

  // While role is unknown, hide officer-only items (avoid a flash for members).
  const items = navItems.filter((i) => !i.officerOnly || isOfficer === true)

  if (mobile) {
    return (
      <div className="flex justify-around py-2">
        {items.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs transition-colors',
                active ? 'text-blue-600 font-semibold' : 'text-gray-500',
              ].join(' ')}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              active
                ? 'bg-blue-800 text-white font-medium'
                : 'text-blue-200 hover:bg-blue-800/50 hover:text-white',
            ].join(' ')}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
