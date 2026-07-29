import dotenv from 'dotenv';
dotenv.config();

export const config = {
  oxapayMerchantKey: process.env.OXAPAY_MERCHANT_KEY || 'sandbox', // Use env variable or fallback to 'sandbox'
  baseUrl: process.env.BASE_URL,
  prices: {
    WEEK: 10, // Price in USD for a week
    MONTH: 20, // Price in USD for a month
    LIFETIME: 50, // Price in USD for a lifetime
    INVITE: 5, // Price in USD for purchasing invite codes
  },
};
