'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // Optional: You could make a request to your backend here
    // to verify the session status if needed, though the webhook
    // is the primary mechanism for updating the subscription.
    if (sessionId) {
      console.log('Stripe Checkout Session ID:', sessionId);
      // Example: fetch(`/api/verify-session?session_id=${sessionId}`);
    }
  }, [sessionId]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-3xl font-bold text-green-600 mb-4">Payment Successful!</h1>
      <p className="text-lg mb-6 text-center">
        Thank you for your purchase. Your subscription should be active shortly.
        <br />
        (Please allow a few moments for the update to reflect in your account.)
      </p>
      <p className="text-sm text-muted-foreground mb-8">Session ID: {sessionId || 'N/A'}</p>
      <Link href="/">
        <Button>Go to Dashboard</Button>
      </Link>
    </div>
  );
}
