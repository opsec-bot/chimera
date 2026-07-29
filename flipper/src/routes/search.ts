import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { SearchService } from '../services/searchService';
import { Logger } from '../utils/logger';

const router = Router();

// Search validation schemas
const searchQuerySchema = z.object({
  query: z.string().optional().default(''),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  sortBy: z.string().optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  filters: z.record(z.any()).optional().default({}),
});

/**
 * GET /api/search/browser
 * Search browser submissions for the authenticated user
 */
router.get('/browser', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Parse nested filter parameters (filters.type -> { filters: { type: ... }})
    const parsedQuery: any = { ...req.query };
    const filters: Record<string, any> = {};

    // Extract filters.* parameters and convert to nested structure
    Object.keys(parsedQuery).forEach((key) => {
      if (key.startsWith('filters.')) {
        const filterKey = key.substring('filters.'.length);
        filters[filterKey] = parsedQuery[key];
        delete parsedQuery[key];
      }
    });

    if (Object.keys(filters).length > 0) {
      parsedQuery.filters = filters;
    }

    const queryParams = searchQuerySchema.parse(parsedQuery);

    const results = await SearchService.searchBrowserSubmissions(req.user!.id, queryParams);

    res.json(results);
  } catch (error: any) {
    Logger.error('Error searching browser submissions', {
      userId: req.user?.id,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to search browser submissions' });
  }
});

/**
 * GET /api/search/filesearch
 * Search filesearch submissions for the authenticated user
 */
router.get('/filesearch', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const queryParams = searchQuerySchema.parse(req.query);

    const results = await SearchService.searchFilesearchSubmissions(req.user!.id, queryParams);

    res.json(results);
  } catch (error: any) {
    Logger.error('Error searching filesearch submissions', {
      userId: req.user?.id,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to search filesearch submissions' });
  }
});

/**
 * GET /api/search/wallet
 * Search wallet submissions for the authenticated user
 */
router.get('/wallet', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const queryParams = searchQuerySchema.parse(req.query);

    const results = await SearchService.searchWalletSubmissions(req.user!.id, queryParams);

    res.json(results);
  } catch (error: any) {
    Logger.error('Error searching wallet submissions', {
      userId: req.user?.id,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to search wallet submissions' });
  }
});

/**
 * GET /api/search/global
 * Global search across all submission types for the authenticated user
 */
router.get('/global', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const queryParams = searchQuerySchema.parse(req.query);

    const results = await SearchService.globalSearch(req.user!.id, queryParams);

    res.json(results);
  } catch (error: any) {
    Logger.error('Error in global search', {
      userId: req.user?.id,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to perform global search' });
  }
});

/**
 * GET /api/search/admin/users
 * Search users (admin only)
 */
router.get('/admin/users', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const queryParams = searchQuerySchema.parse(req.query);

    const results = await SearchService.searchUsers(queryParams);

    res.json(results);
  } catch (error: any) {
    Logger.error('Error searching users', {
      adminId: req.user?.id,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to search users' });
  }
});

/**
 * GET /api/search/admin/invites
 * Search invites (admin only)
 */
router.get('/admin/invites', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const queryParams = searchQuerySchema.parse(req.query);

    const results = await SearchService.searchInvites(queryParams);

    res.json(results);
  } catch (error: any) {
    Logger.error('Error searching invites', {
      adminId: req.user?.id,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to search invites' });
  }
});

export default router;
