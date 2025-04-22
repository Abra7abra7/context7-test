import { supabase } from './supabaseAdmin'; // We'll create supabaseAdmin soon
import { stripe } from './stripe';
import { User } from '@supabase/supabase-js';

export const getOrCreateStripeCustomer = async (user: User): Promise<string> => {
  // Get user profile from Supabase
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('Error fetching profile or profile not found:', profileError);
    throw new Error('Could not retrieve user profile.');
  }

  // Return existing Stripe customer ID if available
  if (profile.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  // Create a new Stripe customer
  try {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        supabaseUUID: user.id,
      },
    });

    // Update the user's profile in Supabase with the new Stripe customer ID
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile with Stripe customer ID:', updateError);
      // Don't throw here, maybe log it, as customer creation succeeded
    }

    console.log(`Created Stripe customer ${customer.id} for user ${user.id}`);
    return customer.id;
  } catch (stripeError) {
    console.error('Error creating Stripe customer:', stripeError);
    throw new Error('Could not create Stripe customer.');
  }
};
