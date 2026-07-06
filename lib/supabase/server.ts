import { createClient } from '@supabase/supabase-js'

// Server-only client using the service role key. NEVER import this into
// client components — it bypasses RLS. Used by API routes to look up
// contact details (emails, phones) for notifications.
export function getServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
