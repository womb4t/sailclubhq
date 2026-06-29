import { Mark } from '@/types/database'
import { Card } from '@/components/ui/Card'
import { Badge, RoundingBadge } from '@/components/ui/Badge'

interface MarkCardProps {
  mark: Mark
  onEdit?: (mark: Mark) => void
  onDelete?: (mark: Mark) => void
  showCoords?: boolean
}

export function MarkCard({ mark, onEdit, onDelete, showCoords = true }: MarkCardProps) {
  return (
    <Card className="flex items-start gap-3">
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
                {mark.lat.toFixed(5)}°, {mark.lon.toFixed(5)}°
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

        {(onEdit || onDelete) && (
          <div className="flex gap-2 mt-2">
            {onEdit && (
              <button
                onClick={() => onEdit(mark)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(mark)}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
