import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { SubscriptionService } from '../services/subscriptionService';
import { Logger } from '../utils/logger';

/**
 * Middleware to check if user has an active subscription
 */
export async function requireActiveSubscription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasActiveSubscription = await SubscriptionService.hasActiveSubscription(req.user.id);

    if (!hasActiveSubscription) {
      return res.status(403).json({
        error: 'Active subscription required',
        message: 'Please purchase a subscription to access this feature',
      });
    }

    next();
  } catch (error) {
    Logger.error('Subscription check error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Middleware to check if user has an active subscription (HTML version)
 */
export async function requireActiveSubscriptionHTML(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) {
      return res.redirect('/auth');
    }

    const hasActiveSubscription = await SubscriptionService.hasActiveSubscription(req.user.id);

    if (!hasActiveSubscription) {
      return res.redirect('/subscriptions');
    }

    next();
  } catch (error) {
    Logger.error('Subscription check error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.redirect('/subscriptions');
  }
}

/**
 * Middleware to add subscription info to request (optional)
 */
export async function addSubscriptionInfo(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (req.user) {
      const subscription = await SubscriptionService.getUserActiveSubscription(req.user.id);
      (req as any).subscription = subscription;
    }
    next();
  } catch (error) {
    Logger.error('Subscription info error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    next(); // Continue without subscription info
  }
}
