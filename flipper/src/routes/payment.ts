import express from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { PaymentService } from '../services/paymentService';
import { SubscriptionService } from '../services/subscriptionService';
import { NotificationService } from '../services/notificationService';
import { UserService } from '../services/userService';
import { LiveUpdateService } from '../services/liveUpdateService';
import { Logger } from '../utils/logger';

const router = express.Router();

/**
 * GET /payment/history
 * Get user's payment history
 */
router.get('/history', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payments = await PaymentService.getUserPayments(req.user!.id);
    res.json({ payments });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /payment/:id/status
 * Check payment status
 */
router.get('/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const payment = await PaymentService.getPaymentById(paymentId);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify with Oxapay if payment is still pending
    if (payment.status === 'pending') {
      try {
        const oxapayStatus = await PaymentService.verifyPayment(payment.oxapayTrackId);

        if (oxapayStatus.status === 'Paid' && (payment.status as string) !== 'paid') {
          // Update payment status
          await PaymentService.updatePaymentStatus(payment.id, 'paid', oxapayStatus.txID);

          // Get user details for notifications
          const user = await UserService.getUserById(payment.userId);

          // Create/extend subscription
          const subscriptionType = req.query.subscription_type as string;
          if (subscriptionType) {
            await SubscriptionService.extendSubscription(req.user!.id, subscriptionType as any);

            // Send notifications for successful payment
            if (user) {
              await NotificationService.notifyPaymentSuccess(
                user.id,
                parseFloat(payment.amount),
                subscriptionType,
                user.username,
                payment.oxapayTrackId,
              );
            }
          }

          payment.status = 'paid';
          payment.oxapayTxid = oxapayStatus.txID;
        }
      } catch (error) {
        Logger.error('Error verifying payment', {
          paymentId,
          userId: req.user!.id,
          trackId: payment.oxapayTrackId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.json({ payment });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /payment/webhook/oxapay
 * Oxapay webhook handler
 */
router.post('/webhook/oxapay', async (req, res) => {
  try {
    const { status, trackId, txID, amount } = req.body;

    const payment = await PaymentService.getPaymentByTrackId(trackId);
    if (!payment) {
      Logger.error('Payment not found for trackId in webhook', { trackId });
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Get user details for notifications
    const user = await UserService.getUserById(payment.userId);

    switch (status) {
      case 'Paid':
        await PaymentService.updatePaymentStatus(payment.id, 'paid', txID);

        if (payment.paymentType === 'invite_purchase') {
          // Handle invite purchase
          const inviteCount = payment.inviteCount || 1;
          const createdInvites = [];

          // Create the purchased invites
          const { UserService } = await import('../services/userService');
          for (let i = 0; i < inviteCount; i++) {
            try {
              const inviteCode = await UserService.createInvite(payment.userId);
              createdInvites.push(inviteCode);
            } catch (error) {
              Logger.error('Failed to create invite during payment processing', {
                userId: payment.userId,
                paymentId: payment.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Send success notification for invite purchase
          if (user) {
            await NotificationService.createNotification(
              user.id,
              'general',
              'Invite Purchase Successful',
              `Successfully purchased ${inviteCount} invite code(s) for $${payment.amount}. Check your invite codes section to see them.`,
              {
                inviteCount,
                amount: parseFloat(payment.amount),
                notificationType: 'invite_purchase_success',
              },
            );
          }

          Logger.info('Invite purchase completed', {
            userId: payment.userId,
            paymentId: payment.id,
            inviteCount,
            createdInvites: createdInvites.length,
            amount: parseFloat(payment.amount),
          });

          // Broadcast payment update to user
          LiveUpdateService.broadcastPaymentUpdate(payment.userId, {
            id: payment.id,
            status: 'paid',
            type: 'invite',
            invite_count: inviteCount,
            amount: parseFloat(payment.amount),
            txid: txID,
            updated_at: new Date().toISOString(),
          });
        } else {
          // Handle subscription purchase
          // Determine subscription type based on payment amount
          let subscriptionType: 'WEEK' | 'MONTH' | 'THREE_MONTHS' = 'WEEK';
          if (parseFloat(payment.amount) >= 60) subscriptionType = 'THREE_MONTHS';
          else if (parseFloat(payment.amount) >= 25) subscriptionType = 'MONTH';

          // Create or extend subscription
          await SubscriptionService.extendSubscription(payment.userId, subscriptionType);

          // Send success notifications
          if (user) {
            await NotificationService.notifyPaymentSuccess(
              user.id,
              parseFloat(payment.amount),
              subscriptionType,
              user.username,
              trackId,
            );
          }

          // Broadcast payment update to user
          LiveUpdateService.broadcastPaymentUpdate(payment.userId, {
            id: payment.id,
            status: 'paid',
            type: 'subscription',
            subscription_type: subscriptionType,
            amount: parseFloat(payment.amount),
            txid: txID,
            updated_at: new Date().toISOString(),
          });
        }
        break;

      case 'Expired':
        await PaymentService.updatePaymentStatus(payment.id, 'expired');

        // Send failure notification for expired payment
        if (user) {
          await NotificationService.notifyPaymentFailed(
            user.id,
            parseFloat(payment.amount),
            'Payment expired - please try again',
            user.username,
            trackId,
          );
        }

        // Broadcast payment update to user
        LiveUpdateService.broadcastPaymentUpdate(payment.userId, {
          id: payment.id,
          status: 'expired',
          type: payment.paymentType === 'invite_purchase' ? 'invite' : 'subscription',
          amount: payment.amount,
          updated_at: new Date().toISOString(),
        });
        break;

      case 'Failed':
        await PaymentService.updatePaymentStatus(payment.id, 'failed');

        // Send failure notification
        if (user) {
          await NotificationService.notifyPaymentFailed(
            user.id,
            parseFloat(payment.amount),
            'Payment processing failed',
            user.username,
            trackId,
          );
        }

        // Broadcast payment update to user
        LiveUpdateService.broadcastPaymentUpdate(payment.userId, {
          id: payment.id,
          status: 'failed',
          type: payment.paymentType === 'invite_purchase' ? 'invite' : 'subscription',
          amount: payment.amount,
          updated_at: new Date().toISOString(),
        });
        break;
    }

    res.status(200).json({ message: 'Webhook processed' });
  } catch (error: any) {
    Logger.error('Webhook processing error', {
      body: req.body,
      error: error.message,
    });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
