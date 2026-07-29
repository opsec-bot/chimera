import express from 'express';
import { AuthenticatedRequest, requireAdmin } from '../middleware/auth';
import { UserService } from '../services/userService';
import crypto from 'crypto';
import { db } from '../db/connection';
import { Logger } from '../utils/logger';
import { invites } from '../db/schema/invites';
import { users } from '../db/schema/users';
import { eq, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const router = express.Router();

/**
 * POST /admin/invites/bulk
 * Create bulk invites with optional subscription pre-loading
 */
router.post('/bulk', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { count, subscription_days, subscription_type } = req.body;

    if (!count || count < 1 || count > 1000) {
      return res.status(400).json({ error: 'Count must be between 1 and 1000' });
    }

    if (subscription_type && !['WEEK', 'MONTH', 'THREE_MONTHS'].includes(subscription_type)) {
      return res.status(400).json({ error: 'Invalid subscription_type' });
    }

    const createdBy = req.user!.id;
    const inviteCodes: string[] = [];

    // Create invites data for batch insert
    const invitesData = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(16).toString('hex');
      inviteCodes.push(code);

      const isPremium = !!(subscription_days || subscription_type);
      invitesData.push({
        code,
        createdBy,
        subscriptionDays: subscription_days || null,
        subscriptionType: subscription_type || null,
        isPremium,
      });
    }

    // Insert all invites using Drizzle batch insert
    try {
      await db.insert(invites).values(invitesData);

      const response = {
        created_count: count,
        invite_codes: inviteCodes,
        subscription_info:
          subscription_days || subscription_type
            ? {
                type: subscription_type || 'custom',
                days:
                  subscription_days ||
                  (subscription_type === 'WEEK'
                    ? 7
                    : subscription_type === 'MONTH'
                      ? 30
                      : subscription_type === 'THREE_MONTHS'
                        ? 90
                        : 0),
              }
            : undefined,
      };

      res.json(response);
    } catch (error) {
      Logger.error('Bulk invite creation error', {
        error: error instanceof Error ? error.message : String(error),
        count,
        createdBy,
      });
      throw new Error('Failed to create invites');
    }
  } catch (error: any) {
    console.error('Bulk invite error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/invites/premium
 * Create a single premium invite with subscription pre-loading
 */
router.post('/premium', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { subscription_days, subscription_type, target_user_id } = req.body;

    if (!subscription_days && !subscription_type) {
      return res.status(400).json({
        error: 'Either subscription_days or subscription_type is required',
      });
    }

    if (subscription_type && !['WEEK', 'MONTH', 'THREE_MONTHS'].includes(subscription_type)) {
      return res.status(400).json({ error: 'Invalid subscription_type' });
    }

    const code = crypto.randomBytes(16).toString('hex');
    const createdBy = req.user!.id;

    try {
      // Insert premium invite using Drizzle
      await db.insert(invites).values({
        code,
        createdBy,
        subscriptionDays: subscription_days || null,
        subscriptionType: subscription_type || null,
        isPremium: true,
        targetUserId: target_user_id || null,
      });

      // Send notification if assigned to specific user
      if (target_user_id) {
        try {
          // Get target user's username
          const targetUser = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, target_user_id))
            .limit(1);

          if (targetUser.length > 0) {
            const { NotificationService } = await import('../services/notificationService');
            await NotificationService.notifyInviteAssigned(
              target_user_id,
              code,
              req.user!.username,
            );
          }
        } catch (notificationError) {
          Logger.error('Failed to send premium invite notification', {
            targetUserId: target_user_id,
            inviteCode: code,
            error:
              notificationError instanceof Error
                ? notificationError.message
                : String(notificationError),
          });
          // Don't fail the invite creation due to notification error
        }
      }

      const response = {
        invite_code: code,
        subscription_info: {
          type: subscription_type || 'custom',
          days:
            subscription_days ||
            (subscription_type === 'WEEK'
              ? 7
              : subscription_type === 'MONTH'
                ? 30
                : subscription_type === 'THREE_MONTHS'
                  ? 90
                  : 0),
        },
      };

      res.json(response);
    } catch (error) {
      throw error;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/invites/premium
 * Get all premium invites
 */
router.get('/premium', requireAdmin, async (req, res) => {
  try {
    // Create aliases for multiple joins to users table
    const createdByUser = alias(users, 'createdByUser');
    const usedByUser = alias(users, 'usedByUser');
    const targetUser = alias(users, 'targetUser');

    const premiumInvites = await db
      .select({
        id: invites.id,
        code: invites.code,
        createdBy: invites.createdBy,
        usedBy: invites.usedBy,
        subscriptionDays: invites.subscriptionDays,
        subscriptionType: invites.subscriptionType,
        isPremium: invites.isPremium,
        targetUserId: invites.targetUserId,
        createdAt: invites.createdAt,
        usedAt: invites.usedAt,
        isActive: invites.isActive,
        created_by_username: createdByUser.username,
        used_by_username: usedByUser.username,
        target_username: targetUser.username,
      })
      .from(invites)
      .leftJoin(createdByUser, eq(invites.createdBy, createdByUser.id))
      .leftJoin(usedByUser, eq(invites.usedBy, usedByUser.id))
      .leftJoin(targetUser, eq(invites.targetUserId, targetUser.id))
      .where(eq(invites.isPremium, true))
      .orderBy(desc(invites.createdAt));

    res.json({ premium_invites: premiumInvites });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /admin/invites/:id
 * Delete an invite (only if not used)
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { UserService } = await import('../services/userService');
    await UserService.deleteInvite(parseInt(id));
    res.json({ message: 'Invite deleted successfully' });
  } catch (error: any) {
    if (error.message === 'Cannot delete used invites') {
      return res.status(400).json({ error: 'Cannot delete invites that have already been used' });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
