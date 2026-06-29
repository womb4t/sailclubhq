import { HTMLAttributes } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'port' | 'starboard' | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  // Sailing-specific: Red = port, Green = starboard
  port: 'bg-red-600 text-white',
  starboard: 'bg-green-600 text-white',
}

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}

// Convenience component for mark rounding indicators
export function RoundingBadge({ side }: { side: 'port' | 'starboard' }) {
  return (
    <Badge variant={side}>
      {side === 'port' ? '● Port' : '● Stbd'}
    </Badge>
  )
}
