-- Create the function to create the subscriptions table if it doesn't exist
CREATE OR REPLACE FUNCTION public.create_subscriptions_table()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the table already exists
  IF NOT EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'subscriptions'
  ) THEN
    -- Create the subscriptions table
    CREATE TABLE public.subscriptions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid REFERENCES auth.users(id) NOT NULL,
      stripe_customer_id text NOT NULL,
      stripe_subscription_id text UNIQUE NOT NULL,
      stripe_price_id text NOT NULL,
      status text NOT NULL,
      current_period_start timestamp with time zone,
      current_period_end timestamp with time zone,
      canceled_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );

    -- Add comment to the table
    COMMENT ON TABLE public.subscriptions IS 'Stores subscription information from Stripe';

    -- Set up Row Level Security
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

    -- Create policy for users to view their own subscriptions
    CREATE POLICY "Users can view their own subscriptions"
      ON public.subscriptions
      FOR SELECT
      USING (auth.uid() = user_id);

    -- Create policy for service role to manage all subscriptions
    CREATE POLICY "Service role can manage all subscriptions"
      ON public.subscriptions
      USING (auth.jwt() ->> 'role' = 'service_role');
      
    -- Create index for faster lookups
    CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
    CREATE INDEX idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
    CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
  END IF;
END;
$$;
