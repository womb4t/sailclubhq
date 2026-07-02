import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Check for Supabase auth token cookie
  // Supabase stores session in sb-<ref>-auth-token or sb-<ref>-auth-token.0 (chunked)
  const cookies = request.cookies.getAll()
  const hasAuthCookie = cookies.some(c =>
    c.name.startsWith('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-token.0'))
  )

  // Only protect dashboard routes, never redirect login/register
  if (
    !hasAuthCookie &&
    request.nextUrl.pathname.startsWith('/dashboard') &&
    !request.nextUrl.pathname.startsWith('/dashboard/onboarding')
  ) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
