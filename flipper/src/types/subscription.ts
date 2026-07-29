import { Invite } from '../services/userService';

export interface Subscription {
  id: number;
  user_id: number;
  type: 'WEEK' | 'MONTH' | 'THREE_MONTHS';
  status: 'active' | 'expired' | 'pending';
  start_date: string;
  end_date: string;
  created_at: string;
  payment_id?: string;
}

export interface Payment {
  id: number;
  user_id: number;
  subscription_id?: number;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  oxapay_track_id: string;
  oxapay_txid?: string;
  payment_link: string;
  expires_at: string;
  payment_type: 'subscription' | 'invite_purchase';
  invite_count?: number;
  created_at: string;
}

export interface PremiumInvite extends Invite {
  subscription_days?: number;
  subscription_type?: 'WEEK' | 'MONTH' | 'THREE_MONTHS';
  is_premium: boolean;
}

export interface SubscriptionTier {
  type: 'WEEK' | 'MONTH' | 'THREE_MONTHS';
  name: string;
  duration_days: number;
  price_usd: number;
}

// API Request/Response Types
export interface CreatePaymentRequest {
  subscription_type: 'WEEK' | 'MONTH' | 'THREE_MONTHS';
}

export interface CreatePaymentResponse {
  payment_id: number;
  payment_link: string;
  track_id: string;
  amount: number;
  expires_at: string;
}

export interface BulkInviteRequest {
  count: number;
  subscription_days?: number;
  subscription_type?: 'WEEK' | 'MONTH' | 'THREE_MONTHS';
}

export interface BulkInviteResponse {
  created_count: number;
  invite_codes: string[];
  subscription_info?: {
    type: string;
    days: number;
  };
}

export interface SubscriptionStatusResponse {
  has_active_subscription: boolean;
  subscription?: Subscription;
  days_remaining?: number;
}
