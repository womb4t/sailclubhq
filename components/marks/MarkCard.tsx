import Link from 'next/link'
import { Mark } from '@/types/database'
import { Card } from '@/components/ui/Card'
import { Badge, RoundingBadge } from '@/components/ui/Badge'
import { decimalToDDM } from '@/lib/coordinates'

interface MarkCardProps {
  mark: Mark
  showCoords?: boolean
}

export function MarkCard({ mark, showCoords = true }: MarkCardProps) {
  return (
    <Link href={`/dashboard/marks/${mark.id}`} className="block">
      <Card className="flex items-start gap-3 hover:border-blue-300 hover:shadow-md transition-all active:scale-[0.99]">
        {/* Short ID badge — large, used on course boards */}
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-900 text-white flex items-center justify-center font-bold text-lg">
          {mark.short_id}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium text-gray-900 text-sm">{mark.name}</h3>
              {showCoords && (
                <p className="text-xs text-gray-500 mt-0.5 font-mono">
                  {decimalToDDM(Number(mark.lat), Number(mark.lon)).full}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <RoundingBadge side={mark.default_rounding} />
              <Badge variant={mark.type === 'physical' ? 'default' : 'info'}>
                {mark.type}
              </Badge>
            </div>
          </div>

          {mark.notes && (
            <p className="text-xs text-gray-500 mt-1 truncate">{mark.notes}</p>
          )}
        </div>
      </Card>
    </Link>
  )
}
