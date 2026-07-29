import express from 'express';
import { AuthenticatedRequest, requireAuth, requireAdmin } from '../middleware/auth';
import { SubscriptionCodesService } from '../services/subscriptionCodesService';
import {
  SubscriptionCodeCreationRequest,
  BulkSubscriptionCodeCreationRequest,
  SubscriptionCodeRedemptionRequest,
} from '../types/subscriptionCodes';
import { Logger } from '../utils/logger';
import { z } from 'zod';

const router = express.Router();

/**
 * POST /subscription-codes/redeem
 * Redeem a subscription code (user endpoint)
 */
router.post('/redeem', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      code: z.string().min(1, 'Code is required').max(50, 'Code too long'),
    });

    const { code } = schema.parse(req.body);

    const result = await SubscriptionCodesService.redeemCode(code, req.user!.id);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid code format',
        errors: error.errors,
      });
      return;
    }

    Logger.error('Failed to redeem subscription code', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'An error occurred while redeeming the code',
    });
  }
});

/**
 * POST /subscription-codes/admin/create
 * Create a single subscription code (admin only)
 */
router.post('/admin/create', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      timeValueDays: z.number().min(1).max(365),
      expiresAt: z.string().optional(),
      oneTimeUse: z.boolean().default(true),
      eligibleUsers: z.enum(['all', 'premium']).default('all'),
    });

    const validatedData = schema.parse(req.body);

    const code = await SubscriptionCodesService.createCode(req.user!.id, validatedData);

    res.status(201).json({
      success: true,
      message: 'Subscription code created successfully',
      code,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid input data',
        errors: error.errors,
      });
      return;
    }

    Logger.error('Failed to create subscription code', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Failed to create subscription code',
    });
  }
});

/**
 * POST /subscription-codes/admin/bulk-create
 * Create multiple subscription codes (admin only)
 */
router.post('/admin/bulk-create', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      count: z.number().min(1).max(100), // Limit bulk creation
      timeValueDays: z.number().min(1).max(365),
      expiresAt: z.string().optional(),
      oneTimeUse: z.boolean().default(true),
      eligibleUsers: z.enum(['all', 'premium']).default('all'),
    });

    const validatedData = schema.parse(req.body);

    const codes = await SubscriptionCodesService.createBulkCodes(req.user!.id, validatedData);

    res.status(201).json({
      success: true,
      message: `${codes.length} subscription codes created successfully`,
      codes,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid input data',
        errors: error.errors,
      });
      return;
    }

    Logger.error('Failed to create bulk subscription codes', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Failed to create subscription codes',
    });
  }
});

/**
 * GET /subscription-codes/admin/all
 * Get all subscription codes (admin only)
 */
router.get('/admin/all', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const codes = await SubscriptionCodesService.getAllCodes();
    res.json({
      success: true,
      codes,
    });
  } catch (error) {
    Logger.error('Failed to get all subscription codes', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve subscription codes',
    });
  }
});

/**
 * GET /subscription-codes/admin/stats
 * Get subscription codes statistics (admin only)
 */
router.get('/admin/stats', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await SubscriptionCodesService.getStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    Logger.error('Failed to get subscription codes stats', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics',
    });
  }
});

/**
 * DELETE /subscription-codes/admin/:id
 * Delete a subscription code (admin only)
 */
router.delete('/admin/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const codeId = parseInt(req.params.id);
    if (isNaN(codeId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid code ID',
      });
      return;
    }

    await SubscriptionCodesService.deleteCode(codeId);

    res.json({
      success: true,
      message: 'Subscription code deleted successfully',
    });
  } catch (error) {
    Logger.error('Failed to delete subscription code', {
      userId: req.user?.id,
      codeId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      message: 'Failed to delete subscription code',
    });
  }
});

export default router;
