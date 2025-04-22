import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY!;

if (!stripeSecretKey) {
  throw new Error('Stripe secret key is not defined in environment variables.');
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-03-31.basil', // Update to the version expected by types
  typescript: true,
});
