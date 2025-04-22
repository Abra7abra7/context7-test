'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// Load Stripe.js outside of the component to avoid recreating it on every render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Plan {
  name: string;
  description: string;
  price: string;
  priceId: string;
  features: string[];
}

const plans: Plan[] = [
  {
    name: 'Basic',
    description: 'Start with the essentials',
    price: '29 € / month',
    priceId: 'price_1RGeUvQTWTDZJ1qZbS1II5MA', // Replace with your actual Price ID
    features: ['Access to 1 fitness video'],
  },
  {
    name: 'Standard',
    description: 'More content for better results',
    price: '59 € / month',
    priceId: 'price_1RGd904Gzz5zJfSKpbBVyauh', // Replace with your actual Price ID
    features: ['Access to 2 fitness videos'],
  },
  {
    name: 'Premium',
    description: 'Unlock everything',
    price: '99 € / month',
    priceId: 'price_1RGd9F4Gzz5zJfSKbljTm5A1', // Replace with your actual Price ID
    features: ['Access to 3 fitness videos'],
  },
];

export default function Pricing() {
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (priceId: string) => {
    setLoadingPriceId(priceId);
    setError(null);

    try {
      // 1. Call your API route to create a checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId }),
      });

      const { sessionId, error: apiError } = await response.json();

      if (apiError || !sessionId) {
        throw new Error(apiError || 'Failed to create checkout session.');
      }

      // 2. Redirect to Stripe Checkout
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe.js failed to load.');
      }

      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId });

      if (stripeError) {
        console.error('Stripe redirect error:', stripeError);
        setError(stripeError.message || 'Failed to redirect to Stripe.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMessage);
    } finally {
      setLoadingPriceId(null);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <h2 className="text-3xl font-bold text-center mb-8">Choose Your Plan</h2>
      {error && <p className="text-red-500 text-center mb-4">Error: {error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.priceId}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold mb-4">{plan.price}</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {plan.features.map((feature, index) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={() => handleCheckout(plan.priceId)}
                disabled={loadingPriceId === plan.priceId}
              >
                {loadingPriceId === plan.priceId ? 'Processing...' : 'Choose Plan'}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
