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
async function buffer(readable: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }
  // It's important to release the lock even if reading fails, though error handling might be needed
  reader.releaseLock();
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  console.log('[Webhook] Received request');
  const buf = await buffer(req.body!); // Read the raw body
  // Correctly get the headers object by awaiting the promise
  const headerPayload = await headers();
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
      
      console.log(`[Webhook] User ID: ${userId}, Price ID: ${priceId}, Stripe Customer ID: ${stripeCustomerId}, Subscription ID: ${subscriptionId}`);

      // First, check if the subscriptions table exists
      try {
        // Check if subscriptions table exists
        const { error: tableCheckError } = await supabaseAdmin
          .from('subscriptions')
          .select('count', { count: 'exact', head: true });

        if (tableCheckError) {
          // If table doesn't exist, create it
          console.log('[Webhook] Creating subscriptions table...');
          const { error: createTableError } = await supabaseAdmin.rpc('create_subscriptions_table');
          
          if (createTableError) {
            console.error('[Webhook] Error creating subscriptions table:', createTableError);
            throw createTableError;
          }
        }

        // Get subscription details from Stripe to ensure we have the latest status
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        // Insert or Update subscription data in Supabase
        const { data, error } = await supabaseAdmin
          .from('subscriptions')
          .upsert({
            user_id: userId,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: subscriptionId,
            status: subscription.status,
            stripe_price_id: priceId,
            // Convert Unix timestamps to ISO strings - using type assertion for Stripe types
            current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
            current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'stripe_subscription_id'
          })
          .select();

        if (error) {
          console.error('[Webhook] Supabase DB Error:', error);
          throw error;
        }
        console.log('[Webhook] Subscription created/updated successfully:', data);

      } catch (dbError) {
        const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown DB error';
        console.error(`[Webhook] Error updating Supabase: ${errorMessage}`);
        return new NextResponse(`Webhook Error: Failed to update database - ${errorMessage}`, { status: 500 });
      }
      break;
    }
    
    case 'invoice.payment_succeeded': {
      console.log('[Webhook] Handling invoice.payment_succeeded');
      const invoice = event.data.object as Stripe.Invoice;
      
      // Make sure we have a subscription ID
      // TypeScript doesn't recognize subscription property on Invoice by default
      // We need to use type assertion to access it
      const invoiceSubscription = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription }).subscription;
      if (!invoiceSubscription) {
        console.log('[Webhook] No subscription associated with this invoice');
        return new NextResponse('Success: No subscription to update', { status: 200 });
      }
      
      const subscriptionId = typeof invoiceSubscription === 'string' 
        ? invoiceSubscription 
        : invoiceSubscription.id;
      
      try {
        // Get the subscription details from Stripe
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        // Get customer ID from the subscription
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        // Find the user_id from Supabase using the customer ID
        const { data: userData, error: userError } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();
        
        if (userError || !userData) {
          console.error('[Webhook] Error finding user for customer:', userError);
          throw new Error('Could not find user for customer');
        }
        
        // Update the subscription in Supabase
        const { data, error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: subscription.status,
            // Using type assertion for Stripe types
            current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
            current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscriptionId)
          .select();
        
        if (error) {
          console.error('[Webhook] Error updating subscription after payment:', error);
          throw error;
        }
        
        console.log('[Webhook] Subscription updated after payment:', data);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Webhook] Error processing invoice payment: ${errorMessage}`);
        return new NextResponse(`Webhook Error: ${errorMessage}`, { status: 500 });
      }
      break;
    }
    
    case 'invoice.payment_failed': {
      console.log('[Webhook] Handling invoice.payment_failed');
      const invoice = event.data.object as Stripe.Invoice;
      
      // Same type assertion as above for invoice.subscription
      const invoiceSubscription = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription }).subscription;
      if (!invoiceSubscription) {
        console.log('[Webhook] No subscription associated with this failed invoice');
        return new NextResponse('Success: No subscription to update', { status: 200 });
      }
      
      const subscriptionId = typeof invoiceSubscription === 'string' 
        ? invoiceSubscription 
        : invoiceSubscription.id;
      
      try {
        // Update subscription status in Supabase to 'past_due' or 'incomplete'
        const { data, error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscriptionId)
          .select();
        
        if (error) {
          console.error('[Webhook] Error updating subscription after failed payment:', error);
          throw error;
        }
        
        console.log('[Webhook] Subscription marked as past_due after failed payment:', data);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Webhook] Error processing failed invoice: ${errorMessage}`);
        return new NextResponse(`Webhook Error: ${errorMessage}`, { status: 500 });
      }
      break;
    }
    
    case 'customer.subscription.deleted': {
      console.log('[Webhook] Handling customer.subscription.deleted');
      const subscription = event.data.object as Stripe.Subscription;
      
      try {
        // Update subscription status in Supabase to 'canceled'
        const { data, error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscription.id)
          .select();
        
        if (error) {
          console.error('[Webhook] Error updating subscription after cancellation:', error);
          throw error;
        }
        
        console.log('[Webhook] Subscription marked as canceled:', data);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Webhook] Error processing subscription cancellation: ${errorMessage}`);
        return new NextResponse(`Webhook Error: ${errorMessage}`, { status: 500 });
      }
      break;
    }
    
    case 'customer.subscription.updated': {
      console.log('[Webhook] Handling customer.subscription.updated');
      const subscription = event.data.object as Stripe.Subscription;
      
      try {
        // Update subscription details in Supabase
        const { data, error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: subscription.status,
            // Use proper type assertion for timestamp fields
            current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
            current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscription.id)
          .select();
        
        if (error) {
          console.error('[Webhook] Error updating subscription after update:', error);
          throw error;
        }
        
        console.log('[Webhook] Subscription updated after status change:', data);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Webhook] Error processing subscription update: ${errorMessage}`);
        return new NextResponse(`Webhook Error: ${errorMessage}`, { status: 500 });
      }
      break;
    }
    
    default:
      console.log(`[Webhook] Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
