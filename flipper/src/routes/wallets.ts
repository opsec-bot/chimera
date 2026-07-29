import express from 'express';
import { walletsController } from '../controllers/walletsController';
import { upload } from '../utils/fileHandler';
import { requireAccessKey } from '../middleware/accessKey';
import { SubscriptionService } from '../services/subscriptionService';
import { Logger } from '../utils/logger';

async function accessKeyRequireSubscription(req: any, res: any, next: any) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.is_admin) return next();
    if (req.user.username && String(req.user.username).startsWith('__deleted__')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const has = await SubscriptionService.hasActiveSubscription(req.user.id).catch((e) => {
      Logger.warn('subscription check failed (wallets, fail-open)', {
        userId: req.user.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return true;
    });
    if (!has) return res.status(403).json({ error: 'Active subscription required' });
    next();
  } catch (e: any) {
    Logger.error('wallets subscription middleware failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
}

const router = express.Router();

router.post(
  '/',
  requireAccessKey,
  accessKeyRequireSubscription,
  upload.single('file'),
  walletsController.uploadWalletsData,
);

export default router;
