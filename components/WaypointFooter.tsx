import { WaypointMark } from './WaypointMark'

/**
 * Subtle brand footer — small Waypoint mark + wordmark, muted.
 * Drop at the bottom of any page/layout that shows "Waypoint Racing".
 * `tone` picks readable colours for light vs dark backgrounds.
 */
export function WaypointFooter({
  tone = 'light',
  className = '',
}: {
  tone?: 'light' | 'dark'
  className?: string
}) {
  const text = tone === 'dark' ? 'text-white/50' : 'text-gray-400'
  return (
    <footer
      className={`flex items-center justify-center gap-1.5 py-5 select-none ${className}`}
    >
      <WaypointMark className={`h-4 w-4 ${text}`} />
      <span className={`text-xs font-medium tracking-wide ${text}`}>Waypoint Racing</span>
    </footer>
  )
}
