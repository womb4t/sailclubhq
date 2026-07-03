import Link from 'next/link'
import { Race } from '@/types/database'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

interface RaceCardProps {
  race: Race
  entryCount?: number
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  planned: 'info',
  confirmed: 'success',
  live: 'danger',
  cancelled: 'danger',
  completed: 'warning',
  archived: 'default',
}

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  planned: 'Planned',
  confirmed: 'Confirmed',
  live: 'Racing Live 🔴',
  cancelled: 'Cancelled',
  completed: 'Completed',
  archived: 'Archived',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function RaceCard({ race, entryCount }: RaceCardProps) {
  return (
    <Link href={`/dashboard/races/${race.id}`} className="block">
      <Card className="hover:border-blue-300 hover:shadow-md transition-all active:scale-[0.99]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{race.name}</h3>
              {race.race_number && (
                <span className="text-xs text-gray-400">#{race.race_number}</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{formatDate(race.race_date)}</p>
            {race.series && (
              <p className="text-xs text-gray-400 mt-0.5">{race.series}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <Badge variant={statusVariant[race.status] ?? 'default'}>
              {statusLabel[race.status] ?? race.status}
            </Badge>
            {entryCount !== undefined && (
              <span className="text-xs text-gray-400">{entryCount} {entryCount === 1 ? 'entry' : 'entries'}</span>
            )}
          </div>
        </div>
        {race.vhf_channel && (
          <p className="text-xs text-gray-400 mt-2">📻 VHF {race.vhf_channel}</p>
        )}
      </Card>
    </Link>
  )
}
