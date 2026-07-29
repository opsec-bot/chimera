import { Request, Response, NextFunction } from 'express';
import { getUserByAccessKey } from '../services/userService';
import { Logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const requireAccessKey = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const accessKey = req.query.key as string;

    if (!accessKey) {
      return res.status(400).json({
        error: 'Access key is required in query (?key=...)',
      });
    }

    const user = await getUserByAccessKey(accessKey);

    if (!user) {
      return res.status(401).json({
        error: 'Invalid access key',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    Logger.error('Access key validation error', {
      accessKey: req.query.key ? String(req.query.key).substring(0, 4) + '****' : 'missing',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Server error' });
  }
};
