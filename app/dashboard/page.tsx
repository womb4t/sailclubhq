import { redirect } from 'next/navigation'

// /dashboard redirects to the root dashboard (app/(dashboard)/page.tsx)
export default function DashboardRedirect() {
  redirect('/')
}
