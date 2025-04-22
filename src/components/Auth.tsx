'use client';

import { useState, useEffect, useCallback } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import Pricing from './Pricing';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabaseClient'; 
import type { Session, User } from '@supabase/supabase-js';
import { getURL } from '@/lib/utils'; 

interface Subscription {
  id: string;
  user_id: string;
  status: 'active' | 'inactive' | 'past_due'; 
  tier: 'basic' | 'standard' | 'premium'; 
  // Add other relevant fields like current_period_end, etc.
}

export default function AuthForm() {
  const supabase = createClient(); 
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  // Function to fetch subscription status - wrapped in useCallback
  const fetchSubscription = useCallback(async (userId: string) => {
    try {
      // Assuming you have a 'subscriptions' table linked to user ID
      const { data, error } = await supabase
        .from('subscriptions') // Replace with your actual table name if different
        .select('*') // Select all columns or specific ones needed
        .eq('user_id', userId)
        .in('status', ['active', 'trialing']) // Check for active or trialing status
        .single(); // Assuming one active subscription per user

      if (error && error.code !== 'PGRST116') { // PGRST116: No rows found, which is okay
        console.error('Error fetching subscription:', error);
        throw error;
      }
      
      // Log the fetched data before setting state
      console.log('[Auth.tsx] Fetched subscription data:', data);
      
      setSubscription(data as Subscription | null); // Set subscription state with type cast
    } catch (error) {
       console.error('Failed to fetch subscription:', error);
       setSubscription(null); // Ensure state is null on error
    }
  }, [supabase]); // Add supabase as dependency for useCallback

  useEffect(() => {
    const checkSessionAndSubscription = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchSubscription(currentUser.id); // Fetch subscription if user exists
      }
      
      setLoading(false);
    };

    checkSessionAndSubscription();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchSubscription(currentUser.id); // Re-fetch on auth change
      } else {
        setSubscription(null); // Clear subscription if user logs out
      }
      setLoading(false);
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase, fetchSubscription]); // Add fetchSubscription to dependency array

  // Log subscription state whenever it changes
  useEffect(() => {
    console.log('[Auth.tsx] Subscription state changed:', subscription);
  }, [subscription]);

  const handleSignOut = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
    } else {
      console.log('User signed out');
    }
  };

  const handleCheckout = async (priceId: string) => {
    if (!user) {
      console.error('User not logged in for checkout.');
      // Optionally redirect to login or show a message
      return;
    }
    
    setLoading(true); // Indicate loading state
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Ensure the correct priceId is sent
        body: JSON.stringify({ priceId: priceId }), // Pass the priceId received as argument
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('Missing Stripe session URL');
        // Handle missing URL error
      }
    } catch (error) {
      console.error('Checkout error:', error);
      // Handle error (e.g., show a message to the user)
    } finally {
        setLoading(false); // Reset loading state
    }
  };

  // Prepare subscription display content before return
  let subscriptionDisplay;
  if (subscription) {
    // Check properties exist - this might be redundant now but safe
    if (subscription.status && subscription.tier) {
        subscriptionDisplay = <p>Your subscription is: {subscription.status} (Tier: {subscription.tier})</p>;
    } else {
        // Handle case where subscription object exists but properties are missing (unexpected)
        console.warn('[Auth.tsx] Subscription object present but missing status/tier:', subscription);
        subscriptionDisplay = <p>Subscription data is incomplete.</p>;
    }
  } else {
    subscriptionDisplay = <p>You do not have an active subscription.</p>;
  }

  console.log('Rendering AuthForm. Loading:', loading, 'Session:', !!session, 'Subscription:', subscription); 

  if (loading) {
    return <div className="text-center p-4">Loading...</div>; 
  }

  if (!session) {
    return (
      <div className="w-full max-w-md mx-auto">
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme="dark"
          providers={['google']} 
          redirectTo={`${getURL()}/auth/callback`}
        />
      </div>
    );
  }

  if (subscription) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4">Welcome back!</h2>
        <p className="mb-4">Your subscription tier: <span className="font-bold capitalize">{subscription.tier}</span></p>
        <p className="italic text-muted-foreground mb-4">(Video player component not yet implemented)</p>
        <Button onClick={handleSignOut}>Sign Out</Button>
      </div>
    );
  } else {
    return (
      <div className="w-full">
        <div className="flex justify-end mb-4">
             <Button onClick={handleSignOut} variant="outline">Sign Out</Button>
        </div>
        <Pricing userId={user.id} />
        <hr className="my-6" />
        <h3 className="text-lg font-semibold mb-4">Subscription Status</h3>
        {/* Render the prepared display content */}  
        {subscriptionDisplay}
        {/* Example Button - Replace with your actual Pricing component or button */} 
        {/* Show button only if subscription is null/falsy */} 
        {!subscription && (
           <Button onClick={() => handleCheckout('price_1RGeUvQTWTDZJ1qZbS1II5MA')} disabled={loading}>
             {loading ? 'Processing...' : 'Subscribe Now (Test Price)'}
           </Button>
        )}
        {/* Or integrate with Pricing component */}
        {/* <Pricing onSelectPlan={handleCheckout} /> */}
      </div>
    );
  }
}
