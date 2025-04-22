import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = cookies();
    // Create client directly, defining required cookie methods.
    // We expect TS errors here due to cookies() returning a Promise,
    // but rely on exchangeCodeForSession + middleware.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            // @ts-expect-error - Known issue: cookies() returns Promise in Route Handler
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              // @ts-expect-error - Known issue: cookies() returns Promise in Route Handler
              cookieStore.set({ name, value, ...options });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_error) {
              // Errors here are expected in this context
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              // @ts-expect-error - Known issue: cookies() returns Promise in Route Handler
              cookieStore.set({ name, value: '', ...options });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_error) {
              // Errors here are expected in this context
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('Auth Callback Error during code exchange:', error.message);
  }

  if (!code) {
    console.error('Auth Callback Error: No code parameter found in URL.');
  }
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
