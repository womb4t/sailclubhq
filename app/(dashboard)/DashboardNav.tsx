'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/races', label: 'Races', icon: '🏁' },
  { href: '/marks', label: 'Marks', icon: '📍' },
  { href: '/courses', label: 'Courses', icon: '🗺️' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href)
}

export function DashboardNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()

  if (mobile) {
    return (
      <div className="flex justify-around py-2">
        {navItems.map((item) => {
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
      {navItems.map((item) => {
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
