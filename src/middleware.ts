import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  console.log('[Middleware] Running for path:', request.nextUrl.pathname); // Log path
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // If the cookie is updated, update the cookies for the request and response
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          // If the cookie is removed, update the cookies for the request and response
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Log before checking user
  console.log('[Middleware] Checking user session...');
  
  // Try getting user directly - this should use cookies
  const { data: { user } } = await supabase.auth.getUser();

  // Log the result of getUser
  console.log('[Middleware] User from getUser:', user ? `User ID: ${user.id}` : 'No user found in cookies/cache');

  // If no user found via cookies/cache, maybe session needs refresh?
  // This part might not be necessary if getUser() handles expired tokens gracefully,
  // but let's keep it for now with added logging.
  if (!user) {
    console.log('[Middleware] No user from getUser, attempting refreshSession...');
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error('[Middleware] Error refreshing session:', refreshError.message);
    } else {
      // Re-check user after potential refresh
      const { data: { user: userAfterRefresh } } = await supabase.auth.getUser();
      console.log('[Middleware] User after refresh attempt:', userAfterRefresh ? `User ID: ${userAfterRefresh.id}` : 'Still no user after refresh');
    }
  }

  console.log('[Middleware] Finished.');
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
