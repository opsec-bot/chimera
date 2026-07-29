import express from 'express';
import { filesearchController } from '../controllers/filesearchController';
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
      Logger.warn('subscription check failed (filesearch, fail-open)', {
        userId: req.user.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return true;
    });
    if (!has) return res.status(403).json({ error: 'Active subscription required' });
    next();
  } catch (e: any) {
    Logger.error('filesearch subscription middleware failed', { error: e.message });
    res.status(500).json({ error: 'Internal error' });
  }
}

const router = express.Router();

router.post(
  '/',
  requireAccessKey,
  accessKeyRequireSubscription,
  upload.single('file'),
  filesearchController.uploadFilesearchData,
);

export default router;
