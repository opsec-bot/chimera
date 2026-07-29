import axios from 'axios';
import { config } from '../config/config';
import { Logger } from '../utils/logger';

/**
 * Oxapay inquiry response type
 */
export interface InquiryResponse {
  status: string;
  trackId: string;
  amount: number;
  currency: string;
  txID: string;
}

/**
 * Generates an invoice with the specified amount for Oxapay.
 * @param amount - The amount for the invoice.
 * @returns A JSON string containing the payment link, expiration date, and track ID, or null if an error occurs.
 */
export const generateInvoice = async (amount: number): Promise<string | null> => {
  try {
    const baseUrl = config.baseUrl; // Add this to your config and .env
    const callbackUrl = `${baseUrl}/payment/webhook/oxapay`;
    const returnUrl = `${baseUrl}/dashboard/`;

    const data = {
      merchant: config.oxapayMerchantKey,
      amount,
      currency: 'USD',
      callbackUrl,
      underPaidCover: 2.5,
      feePaidByPayer: 1,
      lifeTime: 60,
      returnUrl,
    };
    const response = await axios.post('https://api.oxapay.com/merchants/request/', data);
    const { payLink, expiredAt, trackId } = response.data;
    return JSON.stringify({ payLink, expiredAt, trackId });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      Logger.error('Axios error initiating payment', {
        amount,
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
      });
    } else {
      Logger.error('Unexpected error initiating payment', {
        amount,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
};

/**
 * Looks up transaction details using the provided track ID.
 * @param trackId - The Oxapay track ID to look up.
 * @returns The inquiry response data.
 * @throws Will throw an error if the trackId is not provided or if the request fails.
 */
export const txidLookup = async (trackId: string): Promise<InquiryResponse> => {
  if (!trackId) {
    throw new Error('Oxapay trackId is required');
  }
  const data = {
    merchant: config.oxapayMerchantKey,
    trackId,
  };
  try {
    const response = await axios.post<InquiryResponse>(
      'https://api.oxapay.com/merchants/inquiry',
      data,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      Logger.error('Axios error during txidLookup', {
        trackId,
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
      });
    } else {
      Logger.error('Unexpected error during txidLookup', {
        trackId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
};

// No Express router or bot logic is exported from this file. Only payment utilities for PaymentService.
