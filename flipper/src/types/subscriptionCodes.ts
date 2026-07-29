export interface SubscriptionCodeCreationRequest {
  timeValueDays: number;
  expiresAt?: string; // ISO date string, null = never expires
  oneTimeUse: boolean;
  eligibleUsers: 'all' | 'premium' | 'active_subscribers' | 'new_users';
  maxRedemptions?: number; // For universal codes, limit total redemptions
  specificUserIds?: number[]; // Restrict to specific user IDs
}

export interface BulkSubscriptionCodeCreationRequest {
  count: number;
  timeValueDays: number;
  expiresAt?: string; // ISO date string for all codes
  oneTimeUse: boolean;
  eligibleUsers: 'all' | 'premium' | 'active_subscribers' | 'new_users';
  maxRedemptions?: number; // For universal codes, limit total redemptions per code
  specificUserIds?: number[]; // Restrict to specific user IDs (applies to all codes)
}

export interface SubscriptionCodeRedemptionRequest {
  code: string;
}

export interface SubscriptionCodeRedemptionResponse {
  success: boolean;
  message: string;
  daysAdded?: number;
  newExpirationDate?: string;
}

export interface SubscriptionCodeValidationResult {
  valid: boolean;
  error?:
    | 'not_found'
    | 'expired'
    | 'already_used'
    | 'not_eligible'
    | 'already_redeemed'
    | 'max_redemptions_reached'
    | 'user_not_allowed';
  code?: {
    id: number;
    timeValueDays: number;
    eligibleUsers: 'all' | 'premium' | 'active_subscribers' | 'new_users';
    oneTimeUse: boolean;
    maxRedemptions?: number;
    specificUserIds?: number[];
  };
}

export interface SubscriptionCodeStats {
  total: number;
  active: number;
  used: number;
  expired: number;
  totalDaysGranted: number;
  uniqueRedeemers: number;
}
