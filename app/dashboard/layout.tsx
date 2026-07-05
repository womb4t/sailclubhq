import { AuthGuard } from '@/components/AuthGuard'
import { DashboardNav } from './DashboardNav'
import { WaypointMark } from '@/components/WaypointMark'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="lg:hidden bg-blue-950 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <WaypointMark className="h-6 w-6 text-white" />
            <span className="font-bold text-sm">Waypoint Racing</span>
          </div>
        </header>
        <div className="flex flex-1">
          <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:fixed lg:inset-y-0 bg-blue-950">
            <div className="flex items-center gap-2 px-6 py-5 border-b border-blue-800">
              <WaypointMark className="h-6 w-6 text-white" />
              <span className="font-bold text-white text-sm">Waypoint Racing</span>
            </div>
            <DashboardNav />
          </aside>
          <main className="flex-1 lg:ml-56 pb-20 lg:pb-8">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {children}
            </div>
          </main>
        </div>
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50">
          <DashboardNav mobile />
        </nav>
      </div>
    </AuthGuard>
  )
}
