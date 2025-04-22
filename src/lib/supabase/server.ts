import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Function to create a Supabase client for Server Components, Route Handlers, Server Actions
// Uses getAll/setAll pattern for cookie handling
export function createSupabaseServerClient() {
  const cookieStore = cookies(); // Call cookies internally

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Use getAll to retrieve all cookies
        getAll() {
          // @ts-expect-error - Known issue: cookies() returns Promise in some server contexts
          return cookieStore.getAll();
        },
        // Use setAll to batch cookie updates
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // @ts-expect-error - Known issue: cookies() returns Promise in some server contexts
              cookieStore.set(name, value, options);
            });
          } catch /* istanbul ignore next */ {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// Function to create a Supabase Admin client (uses Service Role Key)
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase URL or Service Role Key for admin client.');
  }

  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
