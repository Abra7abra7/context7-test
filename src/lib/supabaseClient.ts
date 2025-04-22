import { createBrowserClient } from '@supabase/ssr';
import { createClient as createAdminClientOriginal } from '@supabase/supabase-js';

// Function to create a Supabase client for Client Components
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/*
// NOTE: Commented out due to persistent TypeScript typing issues with 
// `cookieStore: ReturnType<typeof cookies>` resulting in errors like 
// "Property 'get' does not exist on type 'Promise<ReadonlyRequestCookies>'".
// The API route /api/create-checkout-session now creates its client directly.
// If this helper is needed for other Server Components/Routes, 
// this typing issue will need to be revisited.

// Function to create a Supabase client for Server Components and Route Handlers
export function createSupabaseServerClient(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            console.warn('SupabaseClient: Ignoring error setting cookie from Server Component:', error)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            console.warn('SupabaseClient: Ignoring error removing cookie from Server Component:', error)
          }
        },
      },
    }
  )
}
*/

// Function to create a Supabase Admin client (uses Service Role Key)
// Note: Using standard createClient from @supabase/supabase-js for admin
export function createSupabaseAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase URL or Service Role Key for admin client.');
    }

    // Note: Be cautious about singleton patterns in serverless environments if state needs to be isolated per request.
    // For typical Route Handlers, this should be fine.
    // TODO: Add better instance caching if needed
    // Use createClient from @supabase/supabase-js for admin
    return createAdminClientOriginal(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false, // Recommended for service roles
        persistSession: false // Recommended for service roles
        // detectSessionInUrl: false // Not needed for admin client
      }
    });
}
