// services/UserService.ts
import { db } from '../db/connection';
import { eq, and, or, like, sql, desc, count, isNull, isNotNull } from 'drizzle-orm';
import { users, invites, subscriptions } from '../db/schema';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Logger } from '../utils/logger';

// Helper function to map database user to User interface
function mapDbUserToUser(dbUser: any): User {
  return {
    id: dbUser.id,
    username: dbUser.username,
    accessKey: dbUser.accessKey,
    isAdmin: Boolean(dbUser.isAdmin),
    createdAt: dbUser.createdAt?.toISOString() || '',
    lastLogin: dbUser.lastLogin?.toISOString(),
    ipAddress: dbUser.ipAddress || undefined,
    invitedBy: dbUser.invitedBy || undefined,
  };
}

// Helper function to map database user with stats to UserWithInviteStats interface
function mapDbUserToUserWithStats(dbUser: any): UserWithInviteStats {
  return {
    ...mapDbUserToUser(dbUser),
    invitesCreated: dbUser.invites_created || 0,
    usersInvited: dbUser.users_invited || 0,
    hasActiveSubscription: Boolean(dbUser.has_active_subscription),
    subscriptionEndDate: dbUser.subscription_end_date,
    invitedByUsername: dbUser.invited_by_username,
  };
}

export interface User {
  id: number;
  username: string;
  accessKey: string;
  isAdmin: boolean;
  createdAt: string;
  lastLogin?: string;
  ipAddress?: string;
  invitedBy?: number;
}

export interface UserWithInviteStats extends User {
  invitesCreated: number;
  usersInvited: number;
  hasActiveSubscription: boolean;
  subscriptionEndDate?: string;
  invitedByUsername?: string;
}

export interface Invite {
  id: number;
  code: string;
  created_by: number;
  used_by?: number;
  created_at: string;
  used_at?: string;
  is_active: boolean;
}

/* --- Drizzle ORM queries --- */

/* --- UserService --- */
export class UserService {
  public static async createUser(
    username: string,
    password: string,
    inviteCode: string,
    ipAddress: string,
  ): Promise<User> {
    // Username validation: only a-z, A-Z, 0-9, no spaces
    if (!/^[a-zA-Z0-9]+$/.test(username)) {
      throw new Error(
        'Username must only contain letters and numbers (a-z, A-Z, 0-9), no spaces or special characters',
      );
    }
    try {
      const inviteRow = await db
        .select()
        .from(invites)
        .where(
          and(eq(invites.code, inviteCode), eq(invites.isActive, true), isNull(invites.usedBy)),
        )
        .limit(1);

      if (inviteRow.length === 0) throw new Error('Invalid or expired invite code');
      const invite = inviteRow[0];

      const hashedPassword = bcrypt.hashSync(password, 10);
      const accessKey = crypto.randomBytes(8).toString('hex').toUpperCase();

      const [newUser] = await db
        .insert(users)
        .values({
          username,
          passwordHash: hashedPassword,
          accessKey,
          ipAddress,
          invitedBy: invite.createdBy,
        })
        .returning({ id: users.id });

      const userId = newUser.id;
      if (!userId) throw new Error('Failed to create user');

      // Mark invite as used
      await db
        .update(invites)
        .set({ usedBy: userId, usedAt: new Date() })
        .where(eq(invites.id, invite.id));

      // Notify inviter (best-effort)
      const inviter = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, invite.createdBy))
        .limit(1);
      const inviterUsername = inviter[0]?.username || 'Unknown';

      import('./telegram/telegramService')
        .then(({ TelegramService }) => {
          TelegramService.notifyNewClient(username, ipAddress, inviterUsername).catch(
            (error: any) => {
              Logger.error('Failed to send Telegram notification for new client', {
                username,
                error: error instanceof Error ? error.message : String(error),
              });
            },
          );
        })
        .catch(() => {
          // ignore import errors
        });

      // Handle premium subscription if present (best-effort)
      if (invite.isPremium && (invite.subscriptionDays || invite.subscriptionType)) {
        (async () => {
          try {
            const { SubscriptionService } = await import('./subscriptionService');

            if (
              invite.subscriptionType === 'WEEK' ||
              invite.subscriptionType === 'MONTH' ||
              invite.subscriptionType === 'THREE_MONTHS'
            ) {
              await SubscriptionService.createSubscription(
                userId,
                invite.subscriptionType as 'WEEK' | 'MONTH' | 'THREE_MONTHS',
              );
            } else if (invite.subscriptionDays) {
              const startDate = new Date();
              const endDate = new Date(startDate);
              endDate.setDate(endDate.getDate() + Number(invite.subscriptionDays));

              await db.insert(subscriptions).values({
                userId,
                type: 'CUSTOM' as any, // Custom type for legacy support
                status: 'active',
                startDate,
                endDate,
              });
            }
          } catch (e) {
            Logger.error('Failed to create subscription for new user', {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        })();
      }

      // Grant one free invite to new user only if they registered with a premium invite (best-effort)
      if (invite && invite.isPremium) {
        try {
          await UserService.createInvite(userId);
        } catch (e) {
          Logger.error('Failed to create initial invite for premium invite user', {
            userId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Return the created user
      const createdUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (createdUser.length === 0) throw new Error('User created but could not be retrieved');

      return mapDbUserToUser(createdUser[0]);
    } catch (err) {
      throw err;
    }
  }

  public static async authenticateUser(
    username: string,
    password: string,
    ipAddress: string,
  ): Promise<User | null> {
    try {
      const userRow = await db.select().from(users).where(eq(users.username, username)).limit(1);

      if (userRow.length === 0) return null;
      const user = userRow[0];

      if (bcrypt.compareSync(password, user.passwordHash)) {
        // Update last_login and ip_address in DB
        await db
          .update(users)
          .set({ lastLogin: new Date(), ipAddress })
          .where(eq(users.id, user.id));

        // Read back the updated user data
        const updatedUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

        return mapDbUserToUser(updatedUser[0]);
      } else {
        return null;
      }
    } catch (err) {
      throw err;
    }
  }

  public static async getUserById(id: number): Promise<User | null> {
    try {
      const user = await db
        .select({
          id: users.id,
          username: users.username,
          accessKey: users.accessKey,
          isAdmin: users.isAdmin,
          createdAt: users.createdAt,
          lastLogin: users.lastLogin,
          ipAddress: users.ipAddress,
          invitedBy: users.invitedBy,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (user.length === 0) return null;

      return mapDbUserToUser(user[0]);
    } catch (err) {
      throw err;
    }
  }

  public static async getUserByUsername(username: string): Promise<User | null> {
    try {
      const row = await db.select().from(users).where(eq(users.username, username)).limit(1);
      return row.length > 0 ? mapDbUserToUser(row[0]) : null;
    } catch (err) {
      throw err;
    }
  }

  public static async getAllUsers(): Promise<User[]> {
    try {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      return allUsers.map(mapDbUserToUser);
    } catch (err) {
      throw err;
    }
  }

  public static async createInvite(createdBy: number): Promise<string> {
    try {
      const code = crypto.randomBytes(16).toString('hex');
      await db.insert(invites).values({ code, createdBy });
      return code;
    } catch (err) {
      throw err;
    }
  }

  public static async createPremiumInvite(
    createdBy: number,
    targetUserId: number,
    subscriptionType?: string,
    subscriptionDays?: number,
  ): Promise<string> {
    try {
      const code = crypto.randomBytes(16).toString('hex');

      await db.insert(invites).values({
        code,
        createdBy,
        targetUserId,
        isPremium: true,
        subscriptionType: subscriptionType as any,
        subscriptionDays,
      });
      return code;
    } catch (err) {
      throw err;
    }
  }

  public static async createBulkInvite(
    createdBy: number,
    subscriptionType?: string,
  ): Promise<string> {
    try {
      const code = crypto.randomBytes(16).toString('hex');

      if (subscriptionType) {
        await db.insert(invites).values({
          code,
          createdBy,
          isPremium: true,
          subscriptionType: subscriptionType as any,
        });
      } else {
        await db.insert(invites).values({ code, createdBy });
      }

      return code;
    } catch (err) {
      throw err;
    }
  }

  public static async getUserInvites(userId: number): Promise<Invite[]> {
    try {
      const userInvites = await db
        .select({
          id: invites.id,
          code: invites.code,
          created_by: invites.createdBy,
          used_by: invites.usedBy,
          created_at: invites.createdAt,
          used_at: invites.usedAt,
          is_active: invites.isActive,
          used_by_username: users.username,
        })
        .from(invites)
        .leftJoin(users, eq(invites.usedBy, users.id))
        .where(or(eq(invites.createdBy, userId), eq(invites.targetUserId, userId)))
        .orderBy(desc(invites.createdAt));

      return userInvites.map((invite: any) => ({
        id: invite.id,
        code: invite.code,
        created_by: invite.created_by,
        used_by: invite.used_by,
        created_at: invite.created_at,
        used_at: invite.used_at,
        is_active: invite.is_active,
        used_by_username: invite.used_by_username || null,
      }));
    } catch (err) {
      throw err;
    }
  }

  public static async getAllInvites(): Promise<InviteWithUsernames[]> {
    try {
      const allInvites = await db
        .select({
          id: invites.id,
          code: invites.code,
          created_by: invites.createdBy,
          used_by: invites.usedBy,
          created_at: invites.createdAt,
          used_at: invites.usedAt,
          is_active: invites.isActive,
          is_premium: invites.isPremium,
          created_by_username: sql<string>`u1.username`.as('created_by_username'),
          used_by_username: sql<string>`u2.username`.as('used_by_username'),
          target_user_username: sql<string>`u3.username`.as('target_user_username'),
        })
        .from(invites)
        .leftJoin(sql`users u1`, eq(invites.createdBy, sql`u1.id`))
        .leftJoin(sql`users u2`, eq(invites.usedBy, sql`u2.id`))
        .leftJoin(sql`users u3`, eq(invites.targetUserId, sql`u3.id`))
        .orderBy(desc(invites.createdAt));

      const mapped = allInvites.map((invite: any) => ({
        id: invite.id,
        code: invite.code,
        created_by: invite.created_by,
        used_by: invite.used_by,
        created_at: invite.created_at,
        used_at: invite.used_at,
        is_active: invite.is_active,
        is_premium: invite.is_premium,
        created_by_username: invite.created_by_username || '',
        used_by_username: invite.used_by_username || '',
        target_user_username: invite.target_user_username || '',
      }));

      return mapped;
    } catch (err) {
      throw err;
    }
  }

  public static async updatePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    try {
      const user = await db
        .select({ password_hash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (user.length === 0) throw new Error('User not found');

      if (!bcrypt.compareSync(currentPassword, user[0].password_hash)) {
        throw new Error('Current password is incorrect');
      }

      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      await db.update(users).set({ passwordHash: hashedPassword }).where(eq(users.id, userId));
    } catch (err) {
      throw err;
    }
  }

  public static async adminUpdatePassword(userId: number, newPassword: string): Promise<void> {
    try {
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      await db.update(users).set({ passwordHash: hashedPassword }).where(eq(users.id, userId));
    } catch (err) {
      throw err;
    }
  }

  public static async deleteUser(userId: number): Promise<void> {
    // Soft delete: keep record & related data, scramble credentials.
    try {
      const user = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (user.length === 0) return;
      if (user[0].username.startsWith('__deleted__')) return; // already soft deleted
      const newUsername = `__deleted__${user[0].username}_${Date.now()}`.slice(0, 64);
      const randomPass = crypto.randomBytes(24).toString('hex');
      const hashed = bcrypt.hashSync(randomPass, 10);
      await db
        .update(users)
        .set({ username: newUsername, passwordHash: hashed })
        .where(eq(users.id, userId));
    } catch (err) {
      throw err;
    }
  }

  public static async isSoftDeleted(userId: number): Promise<boolean> {
    try {
      const row = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return !!row[0] && row[0].username.startsWith('__deleted__');
    } catch (err) {
      throw err;
    }
  }

  public static async revokeInvite(inviteId: number): Promise<void> {
    try {
      await db.update(invites).set({ isActive: false }).where(eq(invites.id, inviteId));
    } catch (err) {
      throw err;
    }
  }

  public static async deleteInvite(inviteId: number): Promise<void> {
    try {
      const invite = await db
        .select({ used_by: invites.usedBy })
        .from(invites)
        .where(eq(invites.id, inviteId))
        .limit(1);
      if (invite.length === 0) throw new Error('Invite not found');
      if (invite[0].used_by) throw new Error('Cannot delete used invites');

      await db.delete(invites).where(eq(invites.id, inviteId));
    } catch (err) {
      throw err;
    }
  }

  public static async assignInviteToUser(
    targetUserId: number,
    createdBy: number,
  ): Promise<{ code: string; targetUsername: string }> {
    try {
      const targetUser = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (targetUser.length === 0) throw new Error('Target user not found');

      const code = crypto.randomBytes(16).toString('hex');

      await db.insert(invites).values({
        code,
        createdBy,
        targetUserId,
      });

      const creator = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, createdBy))
        .limit(1);
      const creatorUsername = creator[0]?.username || 'Administrator';

      try {
        const { NotificationService } = await import('./notificationService');
        await NotificationService.notifyInviteAssigned(targetUserId, code, creatorUsername);
      } catch (_notificationError) {
        Logger.error('Failed to send invite notification');
      }

      return {
        code,
        targetUsername: targetUser[0].username,
      };
    } catch (err) {
      throw err;
    }
  }

  public static async getUserAvailableInviteCount(userId: number): Promise<number> {
    try {
      const result = await db
        .select({ count: count() })
        .from(invites)
        .where(
          and(eq(invites.createdBy, userId), isNull(invites.usedBy), eq(invites.isActive, true)),
        );
      return result[0]?.count || 0;
    } catch (err) {
      throw err;
    }
  }

  public static async getUserAccessKey(userId: number): Promise<string> {
    try {
      const user = await db
        .select({ access_key: users.accessKey })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (user.length === 0) throw new Error('User not found');
      return user[0].access_key;
    } catch (err) {
      throw err;
    }
  }

  public static async regenerateAccessKey(userId: number): Promise<string> {
    try {
      const newAccessKey = crypto.randomBytes(8).toString('hex').toUpperCase();

      await db.update(users).set({ accessKey: newAccessKey }).where(eq(users.id, userId));

      Logger.info(`Access key regenerated for user ${userId}`);
      return newAccessKey;
    } catch (err) {
      Logger.error(`Error regenerating access key for user ${userId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  public static async getAllUsersWithInviteStats(): Promise<UserWithInviteStats[]> {
    try {
      // Get all users first
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));

      const results: UserWithInviteStats[] = [];

      for (const user of allUsers) {
        // Get inviter username if exists
        let invitedByUsername = undefined;
        if (user.invitedBy) {
          const inviterResult = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, user.invitedBy))
            .limit(1);
          invitedByUsername = inviterResult[0]?.username;
        }

        // Count invites created by this user
        const invitesCreatedResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(invites)
          .where(eq(invites.createdBy, user.id));
        const invitesCreated = invitesCreatedResult[0]?.count || 0;

        // Count users invited by this user (invites that were used)
        const usersInvitedResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(invites)
          .where(and(eq(invites.createdBy, user.id), isNotNull(invites.usedBy)));
        const usersInvited = usersInvitedResult[0]?.count || 0;

        // Check for active subscription
        const activeSubResult = await db
          .select({
            endDate: subscriptions.endDate,
            status: subscriptions.status,
          })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.userId, user.id),
              eq(subscriptions.status, 'active'),
              sql`${subscriptions.endDate} > NOW()`,
            ),
          )
          .orderBy(desc(subscriptions.endDate))
          .limit(1);

        const hasActiveSubscription = activeSubResult.length > 0;
        const subscriptionEndDate = activeSubResult[0]?.endDate?.toISOString();

        results.push({
          id: user.id,
          username: user.username,
          accessKey: user.accessKey,
          isAdmin: Boolean(user.isAdmin),
          createdAt: user.createdAt?.toISOString() || '',
          lastLogin: user.lastLogin?.toISOString(),
          ipAddress: user.ipAddress || undefined,
          invitedBy: user.invitedBy || undefined,
          invitedByUsername,
          invitesCreated,
          usersInvited,
          hasActiveSubscription,
          subscriptionEndDate,
        });
      }

      return results;
    } catch (err) {
      Logger.error('Error in getAllUsersWithInviteStats', { error: err });
      throw err;
    }
  }

  /**
   * Filter users by optional criteria. All filters are combined with AND logic.
   * subscriptionStatus: 'active' or 'inactive' based on computed has_active_subscription
   * lastLoginAfter / lastLoginBefore: ISO date string (date portion acceptable)
   * username: substring match (case-insensitive)
   */
  public static async filterUsers(filters: {
    username?: string;
    subscriptionStatus?: 'active' | 'inactive';
    lastLoginAfter?: string; // YYYY-MM-DD or full ISO
    lastLoginBefore?: string; // YYYY-MM-DD or full ISO
  }): Promise<UserWithInviteStats[]> {
    try {
      const { username, subscriptionStatus, lastLoginAfter, lastLoginBefore } = filters;

      // Build base WHERE conditions for user table
      const whereConditions: any[] = [];

      if (username) {
        whereConditions.push(sql`LOWER(${users.username}) LIKE ${`%${username.toLowerCase()}%`}`);
      }
      if (lastLoginAfter) {
        const after = /T/.test(lastLoginAfter) ? lastLoginAfter : `${lastLoginAfter} 00:00:00`;
        whereConditions.push(and(isNotNull(users.lastLogin), sql`${users.lastLogin} >= ${after}`));
      }
      if (lastLoginBefore) {
        const before = /T/.test(lastLoginBefore) ? lastLoginBefore : `${lastLoginBefore} 23:59:59`;
        whereConditions.push(and(isNotNull(users.lastLogin), sql`${users.lastLogin} <= ${before}`));
      }

      // Get filtered users from database
      let filteredUsers;
      if (whereConditions.length > 0) {
        filteredUsers = await db
          .select()
          .from(users)
          .where(and(...whereConditions))
          .orderBy(desc(users.createdAt));
      } else {
        filteredUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      }

      const results: UserWithInviteStats[] = [];

      for (const user of filteredUsers) {
        // Get inviter username if exists
        let invitedByUsername = undefined;
        if (user.invitedBy) {
          const inviterResult = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, user.invitedBy))
            .limit(1);
          invitedByUsername = inviterResult[0]?.username;
        }

        // Count invites created by this user
        const invitesCreatedResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(invites)
          .where(eq(invites.createdBy, user.id));
        const invitesCreated = invitesCreatedResult[0]?.count || 0;

        // Count users invited by this user (invites that were used)
        const usersInvitedResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(invites)
          .where(and(eq(invites.createdBy, user.id), isNotNull(invites.usedBy)));
        const usersInvited = usersInvitedResult[0]?.count || 0;

        // Check for active subscription
        const activeSubResult = await db
          .select({
            endDate: subscriptions.endDate,
            status: subscriptions.status,
          })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.userId, user.id),
              eq(subscriptions.status, 'active'),
              sql`${subscriptions.endDate} > NOW()`,
            ),
          )
          .orderBy(desc(subscriptions.endDate))
          .limit(1);

        const hasActiveSubscription = activeSubResult.length > 0;
        const subscriptionEndDate = activeSubResult[0]?.endDate?.toISOString();

        // Apply subscription status filter
        if (subscriptionStatus === 'active' && !hasActiveSubscription) {
          continue;
        }
        if (subscriptionStatus === 'inactive' && hasActiveSubscription) {
          continue;
        }

        results.push({
          id: user.id,
          username: user.username,
          accessKey: user.accessKey,
          isAdmin: Boolean(user.isAdmin),
          createdAt: user.createdAt?.toISOString() || '',
          lastLogin: user.lastLogin?.toISOString(),
          ipAddress: user.ipAddress || undefined,
          invitedBy: user.invitedBy || undefined,
          invitedByUsername,
          invitesCreated,
          usersInvited,
          hasActiveSubscription,
          subscriptionEndDate,
        });
      }

      return results;
    } catch (err) {
      Logger.error('Error in filterUsers', { error: err });
      throw err;
    }
  }
}

/* --- Access-key lookup (legacy snake_case shape used by data-API middleware) --- */
export interface AccessKeyUser {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
  last_login?: string;
  ip_address?: string;
  invited_by?: number;
  access_key: string;
}

export const getUserByAccessKey = async (accessKey: string): Promise<AccessKeyUser | null> => {
  try {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        is_admin: users.isAdmin,
        created_at: users.createdAt,
        last_login: users.lastLogin,
        ip_address: users.ipAddress,
        invited_by: users.invitedBy,
        access_key: users.accessKey,
      })
      .from(users)
      .where(eq(users.accessKey, accessKey))
      .limit(1);

    if (!result || result.length === 0) {
      return null;
    }

    const [userRow] = result;
    return {
      id: userRow.id,
      username: userRow.username,
      is_admin: Boolean(userRow.is_admin),
      created_at: userRow.created_at?.toISOString() ?? '',
      last_login: userRow.last_login?.toISOString(),
      ip_address: userRow.ip_address ?? undefined,
      invited_by: userRow.invited_by ?? undefined,
      access_key: userRow.access_key,
    };
  } catch (error) {
    Logger.error('Error getting user by access key', {
      accessKey: `${accessKey.substring(0, 4)}****`,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/* --- Additional types used above --- */
interface InviteRow {
  id: number;
  code: string;
  created_by: number;
  used_by?: number;
  created_at: string;
  used_at?: string;
  is_active: number;
  is_premium: number;
  created_by_username?: string;
  used_by_username?: string;
  target_user_username?: string;
}

interface InviteWithUsernames extends Omit<InviteRow, 'is_active' | 'is_premium'> {
  is_active: boolean;
  is_premium: boolean;
  created_by_username: string;
  used_by_username: string;
  target_user_username: string;
}
