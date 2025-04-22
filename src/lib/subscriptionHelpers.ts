import { supabase } from './supabaseAdmin';
import { User } from '@supabase/supabase-js';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
  updated_at: string;
  canceled_at?: string;
}

/**
 * Get the active subscription for a user
 * @param userId The user's ID
 * @returns The user's active subscription or null if none exists
 */
export const getUserSubscription = async (userId: string): Promise<Subscription | null> => {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.error('Error fetching subscription:', error);
      return null;
    }
    
    return data as Subscription;
  } catch (error) {
    console.error('Error in getUserSubscription:', error);
    return null;
  }
};

/**
 * Check if a user has an active subscription
 * @param userId The user's ID
 * @returns Boolean indicating if the user has an active subscription
 */
export const hasActiveSubscription = async (userId: string): Promise<boolean> => {
  const subscription = await getUserSubscription(userId);
  return !!subscription;
};

/**
 * Get all subscriptions for a user (including inactive ones)
 * @param userId The user's ID
 * @returns Array of all user subscriptions
 */
export const getAllUserSubscriptions = async (userId: string): Promise<Subscription[]> => {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching all subscriptions:', error);
      return [];
    }
    
    return data as Subscription[];
  } catch (error) {
    console.error('Error in getAllUserSubscriptions:', error);
    return [];
  }
};
