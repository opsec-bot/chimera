import { SubscriptionTier } from '../types/subscription';

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    type: 'WEEK',
    name: '1 Week',
    duration_days: 7,
    price_usd: 10,
  },
  {
    type: 'MONTH',
    name: '1 Month',
    duration_days: 30,
    price_usd: 25,
  },
  {
    type: 'THREE_MONTHS',
    name: '3 Months',
    duration_days: 90,
    price_usd: 60,
  },
];

export const getSubscriptionTier = (type: string): SubscriptionTier | undefined => {
  return SUBSCRIPTION_TIERS.find((tier) => tier.type === type);
};

export const calculateExpirationDate = (startDate: Date, type: string): Date => {
  const tier = getSubscriptionTier(type);
  if (!tier) throw new Error('Invalid subscription type');

  const expirationDate = new Date(startDate);
  expirationDate.setDate(expirationDate.getDate() + tier.duration_days);
  return expirationDate;
};
