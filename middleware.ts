import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Security headers are applied via next.config.ts
  // Auth protection is handled client-side by AuthGuard component
  // (Supabase JS client stores sessions in localStorage + cookies,
  //  but cookie propagation timing varies across mobile browsers,
  //  making server-side middleware redirects unreliable)

  const response = NextResponse.next()
  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
