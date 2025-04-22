import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY!;

if (!stripeSecretKey) {
  throw new Error('Stripe Secret Key is missing in environment variables.');
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-04-10', // Use the latest API version or your preferred version
  typescript: true,
});
