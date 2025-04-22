import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabaseAdmin'; // Use admin client for DB updates
import { headers } from 'next/headers';

const relevantEvents = new Set([
  'checkout.session.completed',
  'customer.subscription.updated', // Handle changes like cancellations, renewals
  'customer.subscription.deleted', // Handle subscription end
  // Add other events as needed
]);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = headers().get('Stripe-Signature') as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('🚨 Stripe webhook secret or signature missing.');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`🚨 Error verifying webhook signature: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const checkoutSession = event.data.object as Stripe.Checkout.Session;
          console.log('Checkout session completed:', checkoutSession.id);

          // Extract metadata we stored earlier
          const userId = checkoutSession.metadata?.supabaseUUID;
          const priceId = checkoutSession.metadata?.priceId;
          const customerId = checkoutSession.customer as string; // Customer ID should exist
          const subscriptionId = checkoutSession.subscription as string; // Subscription ID if mode was 'subscription'

          if (!userId || !priceId || !customerId) {
            console.error('🚨 Missing metadata or customer ID in checkout session:', checkoutSession.id);
            return NextResponse.json({ error: 'Missing required data in session.' }, { status: 400 });
          }

          // If it was a one-time payment (mode: 'payment'), create/update subscription record
          if (checkoutSession.mode === 'payment') {
            // For one-time payment, calculate end date (e.g., 1 month from now)
            const startDate = new Date(checkoutSession.created * 1000);
            const endDate = new Date(startDate);
            endDate.setMonth(startDate.getMonth() + 1); // Adjust based on product (e.g., 3 months)

            const { error } = await supabase.from('subscriptions').upsert({
              // Use upsert to handle potential duplicate webhooks
              id: checkoutSession.id, // Use checkout session ID as a unique ID for one-time payments?
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_price_id: priceId,
              status: 'active', // Mark as active
              start_date: startDate.toISOString(),
              end_date: endDate.toISOString(),
              metadata: checkoutSession, // Store the full session for reference
            }, { onConflict: 'id' }); // Adjust conflict target if needed

            if (error) {
              console.error('🚨 Supabase upsert error (payment):', error);
              return NextResponse.json({ error: 'Database error during subscription update.' }, { status: 500 });
            } else {
              console.log(`✅ Subscription record created/updated for user ${userId}, session ${checkoutSession.id}`);
            }
          }

          // If it was a subscription payment (mode: 'subscription'), Stripe sends separate subscription events
          // We might store the customer ID here if needed, but subscription status handled below.
          if (checkoutSession.mode === 'subscription' && subscriptionId) {
             // Usually handled by 'customer.subscription.created/updated' events
             console.log(`Subscription started: ${subscriptionId}. Awaiting 'customer.subscription' events.`);
          }
          break;
        }

        // --- Handle Recurring Subscription Events (if using mode: 'subscription') --- 
        /* 
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata?.supabaseUUID;
          const customerId = subscription.customer as string;

          if (!userId || !customerId) {
             console.error('🚨 Missing metadata or customer ID in subscription event:', subscription.id);
             return NextResponse.json({ error: 'Missing required data in subscription.' }, { status: 400 });
          }

          const { error } = await supabase.from('subscriptions').upsert({
            id: subscription.id, // Use Stripe Subscription ID as primary key
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_price_id: subscription.items.data[0].price.id, // Assuming one item
            status: subscription.status,
            start_date: new Date(subscription.current_period_start * 1000).toISOString(),
            end_date: new Date(subscription.current_period_end * 1000).toISOString(),
            metadata: subscription,
          }, { onConflict: 'id' });

           if (error) {
              console.error('🚨 Supabase upsert error (subscription):', error);
              return NextResponse.json({ error: 'Database error during subscription update.' }, { status: 500 });
            } else {
              console.log(`✅ Subscription record ${subscription.id} status updated to ${subscription.status} for user ${userId}`);
            }
          break;
        }
        */

        default:
          console.log(`Unhandled relevant event type: ${event.type}`);
      }
    } catch (error) {
      console.error('Webhook handler error:', error);
      return NextResponse.json({ error: 'Webhook handler failed.' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
