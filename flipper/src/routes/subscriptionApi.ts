import express from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { SubscriptionService } from '../services/subscriptionService';
import { PaymentService } from '../services/paymentService';
import { SUBSCRIPTION_TIERS } from '../config/subscriptionConfig';

const router = express.Router();

/**
 * GET /subscription/tiers
 * Get available subscription tiers
 */
router.get('/tiers', (req, res) => {
  res.json({ tiers: SUBSCRIPTION_TIERS });
});

/**
 * GET /subscription/status
 * Get user's subscription status
 */
router.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Admin users always have access (no subscription required)
    if (req.user!.isAdmin) {
      return res.json({
        has_active_subscription: true,
        admin_access: true,
      });
    }

    const subscription = await SubscriptionService.getUserActiveSubscription(req.user!.id);

    if (subscription) {
      const endDate = new Date(subscription.end_date);
      const now = new Date();
      const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      res.json({
        has_active_subscription: true,
        subscription,
        days_remaining: Math.max(0, daysRemaining),
      });
    } else {
      res.json({
        has_active_subscription: false,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /subscription/history
 * Get user's subscription history
 */
router.get('/history', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const subscriptions = await SubscriptionService.getUserSubscriptions(req.user!.id);
    res.json({ subscriptions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /subscription/purchase
 * Create a payment for subscription purchase
 */
router.post('/purchase', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { subscription_type } = req.body;

    if (!subscription_type || !['WEEK', 'MONTH', 'THREE_MONTHS'].includes(subscription_type)) {
      return res.status(400).json({ error: 'Valid subscription_type is required' });
    }

    const { payment, paymentLink } = await PaymentService.createPayment(
      req.user!.id,
      subscription_type,
    );

    res.json({
      payment_id: payment.id,
      payment_link: paymentLink,
      track_id: payment.oxapayTrackId,
      amount: payment.amount,
      expires_at: payment.expiresAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /subscription/extend
 * Extend existing subscription
 */
router.post('/extend', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { subscription_type } = req.body;

    if (!subscription_type || !['WEEK', 'MONTH', 'THREE_MONTHS'].includes(subscription_type)) {
      return res.status(400).json({ error: 'Valid subscription_type is required' });
    }

    // Create payment first
    const { payment, paymentLink } = await PaymentService.createPayment(
      req.user!.id,
      subscription_type,
    );

    res.json({
      message: 'Payment created for subscription extension',
      payment_id: payment.id,
      payment_link: paymentLink,
      track_id: payment.oxapayTrackId,
      amount: payment.amount,
      expires_at: payment.expiresAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
