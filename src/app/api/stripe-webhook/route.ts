import Stripe from 'stripe';
import { NextResponse, NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe client with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil', // Use the latest API version expected by types
  typescript: true,
});

// Get the webhook secret from environment variables
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Initialize Supabase client with Service Role Key for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use Service Role Key for admin actions
  { auth: { persistSession: false } } // Important: Disable session persistence for admin client
);

// Helper function to read ReadableStream to buffer
async function buffer(readable: ReadableStream<Uint8Array>) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  console.log('[Webhook] Received request');
  const buf = await buffer(req.body!); // Read the raw body
  // Correctly get the headers object
  const headerPayload = headers();
  const sig = headerPayload.get('stripe-signature') as string;

  if (!sig || !webhookSecret) {
    console.error('[Webhook] Error: Missing signature or webhook secret.');
    return new NextResponse('Webhook Error: Missing signature or secret', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    console.log('[Webhook] Event constructed:', event.type);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Webhook] Error constructing event: ${errorMessage}`);
    return new NextResponse(`Webhook Error: ${errorMessage}`, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      console.log('[Webhook] Handling checkout.session.completed');
      const session = event.data.object as Stripe.Checkout.Session;

      // Ensure the session contains customer details and metadata AND subscription
      if (!session.customer || !session.metadata?.supabaseUUID || !session.metadata?.priceId || !session.subscription) {
        console.error('[Webhook] Error: Missing customer, metadata, or subscription in session', session);
        return new NextResponse('Webhook Error: Missing data in session', { status: 400 });
      }

      const userId = session.metadata.supabaseUUID;
      const priceId = session.metadata.priceId;
      const stripeCustomerId = session.customer as string;
      const subscriptionId = session.subscription as string; // Subscription ID is usually in the session for subscription modes
      // const status = session.status; // 'complete' is for checkout, need subscription status later
      
      console.log(`[Webhook] User ID: ${userId}, Price ID: ${priceId}, Stripe Customer ID: ${stripeCustomerId}, Subscription ID: ${subscriptionId}`);

      // === Insert or Update subscription data in Supabase ===
      try {
        // Example: Upsert into a 'subscriptions' table
        // Adjust table and column names according to your schema
        const { data, error } = await supabaseAdmin
          .from('subscriptions') // MAKE SURE 'subscriptions' TABLE EXISTS
          .upsert({
            user_id: userId,                 // Ensure this column exists and matches type UUID
            stripe_customer_id: stripeCustomerId, // Ensure this column exists and matches type TEXT
            stripe_subscription_id: subscriptionId, // Ensure this column exists and matches type TEXT (and is unique if used for conflict)
            status: 'active', // Set initial status, Stripe subscription object has its own status for later updates
            price_id: priceId,               // Ensure this column exists and matches type TEXT
            // You might need 'id' (PK - uuid) if it doesn't default
            // Add other relevant fields like start_date, end_date from Stripe subscription object if needed
          }, {
            onConflict: 'stripe_subscription_id', // Using subscription ID is often more reliable than user_id if user can have multiple subs (even inactive ones)
          })
          .select(); // Select the upserted data

        if (error) {
          console.error('[Webhook] Supabase DB Error:', error);
          throw error; // Throw to be caught by the outer catch block
        }
        console.log('[Webhook] Supabase DB operation successful:', data);

      } catch (dbError) {
        const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown DB error';
        console.error(`[Webhook] Error updating Supabase: ${errorMessage}`);
        // Return 500, Stripe will retry
        return new NextResponse(`Webhook Error: Failed to update database - ${errorMessage}`, { status: 500 });
      }
      break;
    }
    // === TODO: Handle other relevant events ===
    // case 'invoice.payment_succeeded':
    //   // Handle successful recurring payments, update next billing date etc.
    //   break;
    // case 'invoice.payment_failed':
    //   // Handle failed payments, maybe notify user or change subscription status
    //   break;
    // case 'customer.subscription.deleted':
    //   // Handle subscription cancellations
    //   break;
    // case 'customer.subscription.updated':
    //   // Handle plan changes, status changes etc.
    //   break;
    default:
      console.log(`[Webhook] Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
