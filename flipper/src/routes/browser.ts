import express from 'express';
import { browserController } from '../controllers/browserController';
import { upload } from '../utils/fileHandler';
import { requireAccessKey } from '../middleware/accessKey';
import { SubscriptionService } from '../services/subscriptionService';
import { Logger } from '../utils/logger';

// Middleware to enforce active subscription for access-key authenticated routes (non-admin)
async function accessKeyRequireSubscription(req: any, res: any, next: any) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.is_admin) return next();
    // Soft-deleted guard (username prefix strategy)
    if (req.user.username && String(req.user.username).startsWith('__deleted__')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const has = await SubscriptionService.hasActiveSubscription(req.user.id).catch((e) => {
      Logger.warn('subscription check failed (accessKey route, fail-open)', {
        userId: req.user.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return true;
    });
    if (!has) return res.status(403).json({ error: 'Active subscription required' });
    return next();
  } catch (e: any) {
    Logger.error('accessKeyRequireSubscription failure', { error: e.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

const router = express.Router();

router.post(
  '/',
  requireAccessKey,
  accessKeyRequireSubscription,
  upload.single('file'),
  browserController.uploadBrowserData,
);

router.get(
  '/pretty',
  requireAccessKey,
  accessKeyRequireSubscription,
  browserController.getUserBrowserSubmissions,
);

router.get(
  '/dashboard',
  requireAccessKey,
  accessKeyRequireSubscription,
  browserController.getUserDashboardSubmissions,
);

// (Admin route, protect as needed)
router.get('/pretty/all', browserController.getAllBrowserSubmissions);

router.get('/dashboard/all', browserController.getAllDashboardSubmissions);

export default router;
