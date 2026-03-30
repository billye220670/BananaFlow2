import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyJwtFromRequest } from '@/lib/auth'

// Auth routes that don't require authentication
const AUTH_ROUTES = ['/api/auth']

// Public pages (login/register) - redirect to /projects if already logged in
const PUBLIC_AUTH_PAGES = ['/login', '/register']

// Public accessible pages (no auth required, no redirect if logged in)
const PUBLIC_PAGES = ['/projects']

// Protected pages that require authentication
const PROTECTED_PAGES = ['/canvas']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 0. Root path - redirect to /projects
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/projects', request.url))
  }

  // 1. Auth API routes - always allow
  if (AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Verify JWT from request
  const payload = await verifyJwtFromRequest(request)
  const isAuthenticated = payload !== null

  // 2. Login/Register pages - redirect to /projects if already authenticated
  if (PUBLIC_AUTH_PAGES.some(page => pathname === page || pathname.startsWith(page + '/'))) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/projects', request.url))
    }
    return NextResponse.next()
  }

  // 3. Public pages (like /projects) - allow all users
  if (PUBLIC_PAGES.some(page => pathname === page || pathname.startsWith(page + '/'))) {
    return NextResponse.next()
  }

  // 4. Protected API routes (non-auth APIs) - return 401 if not authenticated
  if (pathname.startsWith('/api/')) {
    if (!isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', message: '请先登录' },
        { status: 401 }
      )
    }
    return NextResponse.next()
  }

  // 5. Protected pages (canvas and others) - redirect to login if not authenticated
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (svg, jpg, png, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
