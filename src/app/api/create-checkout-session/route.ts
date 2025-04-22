import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getURL } from '@/lib/utils';
import { createSupabaseAdminClient } from '@/lib/supabaseClient';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function POST(req: NextRequest) {
  const { priceId } = await req.json();

  if (!priceId) {
    return new NextResponse('Price ID is required', { status: 400 });
  }

  try {
    // Await the cookies() call to get the actual cookie store
    const cookieStore = await cookies();

    // Create Supabase server client directly within the route handler
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          // Remove async workaround - middleware handles cookie logic now
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value, ...options });
            } catch { }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch { }
          },
        },
      }
    );

    // Use getUser() for authenticated check against the server
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.error('Auth user error:', userError);
      return new NextResponse(`Auth error: ${userError.message}`, { status: 401 });
    }

    if (!user) {
      console.error('Auth error: User not authenticated');
      return new NextResponse('User not authenticated', { status: 401 });
    }

    // Use Admin client for potentially elevated operations like profile access/update
    const supabaseAdmin = createSupabaseAdminClient();

    // Retrieve user profile to get Stripe customer ID
    let customerId: string | null = null;
    try {
        const { data: profile } = await supabaseAdmin
            .from('profiles') // Assuming a 'profiles' table
            .select('stripe_customer_id')
            .eq('id', user.id) // Use user.id from getUser()
            .single();

        customerId = profile?.stripe_customer_id;
    } catch (error) {
         console.error('Error fetching profile:', error);
         const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve user profile';
         return new NextResponse(errorMessage, { status: 500 });
    }

    // Create Stripe customer if not exists
    if (!customerId) {
        try {
            console.log('Creating Stripe customer for user:', user.id); // Use user.id
            const customer = await stripe.customers.create({
                email: user.email, // Use user.email
                metadata: {
                    supabaseUUID: user.id, // Use user.id
                },
            });
            customerId = customer.id;
            
            // Update Supabase profile table with the new customerId using Admin client
            await supabaseAdmin
                .from('profiles')
                .update({ stripe_customer_id: customerId })
                .eq('id', user.id); // Use user.id
            
             console.log('Stripe customer created and profile updated:', customerId);
        } catch (error) {
            console.error('Error creating Stripe customer or updating profile:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to create Stripe customer';
            return new NextResponse(errorMessage, { status: 500 });
        }
    }

    // Create Stripe Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId, // Make sure this priceId is valid in Stripe!
          quantity: 1,
        },
      ],
      mode: 'subscription', // Use 'subscription' for recurring payments
      customer: customerId, // Associate session with Stripe customer
      success_url: `${getURL()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getURL()}/`,
      metadata: {
        supabaseUUID: user.id, // Use user.id
        priceId: priceId,
      },
    });

    if (!checkoutSession.url) {
      return new NextResponse('Could not create Stripe session URL', { status: 500 });
    }

    return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url });

  } catch (error: unknown) {
    console.error('Stripe session creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return new NextResponse(`Error creating checkout session: ${errorMessage}`, {
      status: 500,
    });
  }
}
