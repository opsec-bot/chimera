import { sql, SQL } from 'drizzle-orm';
import { eq, and, or, ilike, desc, asc } from 'drizzle-orm';

export interface SearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

export interface SearchResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

/**
 * Creates a tsvector search query for PostgreSQL full-text search
 */
export function createTsvectorSearch(
  searchColumn: SQL,
  query: string,
  language: string = 'english',
): SQL {
  if (!query || query.trim().length === 0) {
    return sql`true`;
  }

  // Clean and prepare the search query
  const cleanQuery = query.trim().replace(/\s+/g, ' & ');

  return sql`
    ${searchColumn} @@ plainto_tsquery(${language}, ${cleanQuery})
    OR ${searchColumn} @@ to_tsquery(${language}, ${cleanQuery})
  `;
}

/**
 * Creates a simple ILIKE search for basic text matching
 */
export function createIlikeSearch(columns: SQL[], query: string): SQL {
  if (!query || query.trim().length === 0) {
    return sql`true`;
  }

  const searchTerm = `%${query.trim()}%`;
  const conditions = columns.map((col) => sql`${col} ILIKE ${searchTerm}`);

  return or(...conditions) || sql`true`;
}

/**
 * Creates a combined search that uses both tsvector and ILIKE
 * This provides better search coverage
 */
export function createCombinedSearch(
  tsvectorColumn: SQL,
  ilikeColumns: SQL[],
  query: string,
  language: string = 'english',
): SQL {
  if (!query || query.trim().length === 0) {
    return sql`true`;
  }

  const tsvectorSearch = createTsvectorSearch(tsvectorColumn, query, language);
  const ilikeSearch = createIlikeSearch(ilikeColumns, query);

  return or(tsvectorSearch, ilikeSearch) || sql`true`;
}

/**
 * Creates a ranking function for search results
 * Higher rank = better match
 */
export function createSearchRank(
  tsvectorColumn: SQL,
  query: string,
  language: string = 'english',
): SQL {
  if (!query || query.trim().length === 0) {
    return sql`0`;
  }

  const cleanQuery = query.trim().replace(/\s+/g, ' & ');

  return sql`
    ts_rank(${tsvectorColumn}, plainto_tsquery(${language}, ${cleanQuery})) +
    ts_rank(${tsvectorColumn}, to_tsquery(${language}, ${cleanQuery}))
  `;
}

/**
 * Helper function to build search conditions
 */
export function buildSearchConditions(
  baseConditions: SQL[] = [],
  searchCondition?: SQL,
  additionalFilters: Record<string, any> = {},
): SQL[] {
  const conditions = [...baseConditions];

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  // Add additional filters
  Object.entries(additionalFilters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      // Use raw SQL for filter conditions since we don't have column references
      conditions.push(sql`${sql.raw(key)} = ${value}`);
    }
  });

  return conditions;
}

/**
 * Helper function to create sort order
 */
export function createSortOrder(sortBy?: string, sortOrder: 'asc' | 'desc' = 'desc'): SQL {
  if (!sortBy) {
    return desc(sql`created_at`);
  }

  const order = sortOrder === 'asc' ? asc : desc;
  return order(sql.raw(sortBy));
}

/**
 * Utility to extract searchable text from JSONB data
 * This is useful for browser submissions and other JSONB fields
 */
export function extractSearchableTextFromJsonb(jsonbColumn: SQL, fields: string[]): SQL {
  const fieldExtractions = fields.map((field) => sql`COALESCE(${jsonbColumn}->>${field}, '')`);

  return sql`CONCAT_WS(' ', ${sql.join(fieldExtractions, sql`, `)})`;
}

/**
 * Creates a searchable text column for browser submissions
 */
export function createBrowserSubmissionSearchText(): SQL {
  return sql`
    CONCAT_WS(' ',
      COALESCE(browser, ''),
      COALESCE(type, ''),
      COALESCE(desktop_name, ''),
      COALESCE(ip_address, ''),
      COALESCE(data->>'url', ''),
      COALESCE(data->>'title', ''),
      COALESCE(data->>'name', ''),
      COALESCE(data->>'username', ''),
      COALESCE(data->>'host', ''),
      COALESCE(data->>'domain', ''),
      COALESCE(data->>'name_on_card', ''),
      COALESCE(data->>'cardholder', '')
    )
  `;
}

/**
 * Creates a searchable text column for filesearch submissions
 */
export function createFilesearchSubmissionSearchText(): SQL {
  return sql`
    CONCAT_WS(' ',
      COALESCE(line, ''),
      COALESCE(pattern, ''),
      COALESCE(ip_address, ''),
      COALESCE(data::text, '')
    )
  `;
}

/**
 * Creates a searchable text column for wallet submissions
 */
export function createWalletSubmissionSearchText(): SQL {
  return sql`
    CONCAT_WS(' ',
      COALESCE(wallet, ''),
      COALESCE(mnemonic, ''),
      COALESCE(balance_usd::text, ''),
      COALESCE(ip_address, '')
    )
  `;
}

/**
 * Creates a searchable text column for users
 */
export function createUserSearchText(): SQL {
  return sql`
    CONCAT_WS(' ',
      COALESCE(username, ''),
      COALESCE(access_key, ''),
      COALESCE(ip_address, '')
    )
  `;
}

/**
 * Creates a searchable text column for invites
 */
export function createInviteSearchText(): SQL {
  return sql`
    CONCAT_WS(' ',
      COALESCE(code, ''),
      COALESCE(subscription_type, ''),
      COALESCE(subscription_days::text, '')
    )
  `;
}
