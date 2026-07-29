import { db } from '../db/connection';
import { eq, and, or, lt, lte, gt, desc, sql } from 'drizzle-orm';
import { stubBuilds } from '../db/schema/other';
import { Logger } from '../utils/logger';
import { StubBuilderConfigService } from './stubBuilderConfigService';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';

export interface StubBuild {
  id: number;
  userId: number;
  buildId: string;
  downloadToken: string;
  filePath: string;
  status: 'building' | 'completed' | 'failed' | 'downloaded' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  downloadedAt?: Date;
  errorMessage?: string;
}

export class StubBuildService {
  /**
   * Create a new stub build record
   */
  static async createBuild(
    userId: number,
    buildId: string,
    downloadToken: string,
    filePath: string,
  ): Promise<void> {
    try {
      // Set expiration to 5 minutes from now
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await db.insert(stubBuilds).values({
        userId,
        buildId,
        downloadToken,
        filePath,
        status: 'building',
        expiresAt,
        createdAt: new Date(),
      });

      Logger.info(`Created stub build record for user ${userId}, build ${buildId}`);
    } catch (error) {
      Logger.error('Failed to create stub build record:', {
        userId,
        buildId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update build status
   */
  static async updateBuildStatus(
    buildId: string,
    status: StubBuild['status'],
    errorMessage?: string,
  ): Promise<void> {
    try {
      await db
        .update(stubBuilds)
        .set({
          status,
          errorMessage: errorMessage || null,
        })
        .where(eq(stubBuilds.buildId, buildId));

      Logger.info(`Updated build ${buildId} status to ${status}`);
    } catch (error) {
      Logger.error(`Failed to update build status for ${buildId}:`, {
        buildId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clean up old builds for a specific user (except currently building ones)
   */
  static async cleanupUserBuilds(userId: number): Promise<void> {
    try {
      // Mark old builds as expired (except currently building ones)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      await db
        .update(stubBuilds)
        .set({ status: 'expired' })
        .where(
          and(
            eq(stubBuilds.userId, userId),
            sql`${stubBuilds.status} != 'building'`,
            or(
              sql`${stubBuilds.createdAt} < ${tenMinutesAgo}`,
              sql`${stubBuilds.status} IN ('completed', 'failed', 'downloaded')`,
            ),
          ),
        );

      Logger.info(`Cleaned up old builds for user ${userId}`);
    } catch (error) {
      Logger.error('Failed to cleanup user builds:', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw error here, just log it - cleanup failure shouldn't prevent new builds
    }
  }

  /**
   * Check if user is in cooldown period (prevents API bypass)
   */
  static async checkUserCooldown(
    userId: number,
  ): Promise<{ inCooldown: boolean; remainingTime?: number }> {
    try {
      // Get configurable cooldown from database
      const cooldownSeconds = await StubBuilderConfigService.getBuildCooldown();

      const cooldownStartTime = new Date(Date.now() - cooldownSeconds * 1000);

      const recentBuilds = await db
        .select()
        .from(stubBuilds)
        .where(
          and(eq(stubBuilds.userId, userId), sql`${stubBuilds.createdAt} > ${cooldownStartTime}`),
        )
        .orderBy(desc(stubBuilds.createdAt))
        .limit(1);

      if (recentBuilds.length > 0) {
        const recentBuild = recentBuilds[0];
        const createdAt = (recentBuild.createdAt || new Date()).getTime();
        const now = Date.now();
        const cooldownPeriod = cooldownSeconds * 1000; // Convert to milliseconds
        const elapsed = now - createdAt;

        if (elapsed < cooldownPeriod) {
          const remainingTime = Math.ceil((cooldownPeriod - elapsed) / 1000);
          return { inCooldown: true, remainingTime };
        }
      }

      return { inCooldown: false };
    } catch (error) {
      Logger.error(`Failed to check cooldown for user ${userId}:`, {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // On error, don't block the user
      return { inCooldown: false };
    }
  }

  /**
   * Get user's active build (if any) - includes building and completed builds but not downloaded or expired ones
   */
  static async getUserActiveBuild(userId: number): Promise<StubBuild | null> {
    try {
      // First, immediately mark any expired builds for this user as expired to prevent race conditions
      const now = new Date();
      const expireResult = await db
        .update(stubBuilds)
        .set({ status: 'expired' })
        .where(
          and(
            eq(stubBuilds.userId, userId),
            lte(stubBuilds.expiresAt, now),
            sql`${stubBuilds.status} NOT IN ('downloaded', 'expired')`,
          ),
        );

      Logger.info('Expired builds update completed for user', {
        userId,
        currentTime: now.toISOString(),
      });

      const builds = await db
        .select()
        .from(stubBuilds)
        .where(
          and(
            eq(stubBuilds.userId, userId),
            sql`${stubBuilds.status} IN ('building', 'completed')`,
            gt(stubBuilds.expiresAt, now),
          ),
        )
        .orderBy(desc(stubBuilds.createdAt))
        .limit(1);

      Logger.info('Active builds found for user', {
        userId,
        buildsCount: builds.length,
        builds: builds.map((b) => ({
          buildId: b.buildId,
          status: b.status,
          expiresAt: b.expiresAt?.toISOString(),
          downloadToken: b.downloadToken,
        })),
      });

      if (builds.length === 0) return null;

      const build = builds[0];
      return {
        id: build.id,
        userId: build.userId,
        buildId: build.buildId,
        downloadToken: build.downloadToken,
        filePath: build.filePath,
        status: build.status,
        createdAt: build.createdAt || new Date(),
        expiresAt: build.expiresAt,
        downloadedAt: build.downloadedAt || undefined,
        errorMessage: build.errorMessage || undefined,
      };
    } catch (error) {
      Logger.error(`Failed to get active build for user ${userId}:`, {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get build by build ID
   */
  static async getBuildById(buildId: string): Promise<StubBuild | null> {
    try {
      const builds = await db
        .select()
        .from(stubBuilds)
        .where(eq(stubBuilds.buildId, buildId))
        .limit(1);

      if (builds.length === 0) return null;

      const build = builds[0];
      return {
        id: build.id,
        userId: build.userId,
        buildId: build.buildId,
        downloadToken: build.downloadToken,
        filePath: build.filePath,
        status: build.status,
        createdAt: build.createdAt || new Date(),
        expiresAt: build.expiresAt,
        downloadedAt: build.downloadedAt || undefined,
        errorMessage: build.errorMessage || undefined,
      };
    } catch (error) {
      Logger.error(`Failed to get build ${buildId}:`, {
        buildId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get build by download token
   */
  static async getBuildByToken(downloadToken: string): Promise<StubBuild | null> {
    try {
      const builds = await db
        .select()
        .from(stubBuilds)
        .where(
          and(
            eq(stubBuilds.downloadToken, downloadToken),
            eq(stubBuilds.status, 'completed'),
            sql`${stubBuilds.expiresAt} > NOW()`,
          ),
        )
        .limit(1);

      if (builds.length === 0) return null;

      const build = builds[0];
      return {
        id: build.id,
        userId: build.userId,
        buildId: build.buildId,
        downloadToken: build.downloadToken,
        filePath: build.filePath,
        status: build.status,
        createdAt: build.createdAt || new Date(),
        expiresAt: build.expiresAt,
        downloadedAt: build.downloadedAt || undefined,
        errorMessage: build.errorMessage || undefined,
      };
    } catch (error) {
      Logger.error(`Failed to get build by token ${downloadToken}:`, {
        downloadToken,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark build as downloaded
   */
  static async markAsDownloaded(downloadToken: string): Promise<void> {
    try {
      await db
        .update(stubBuilds)
        .set({
          status: 'downloaded',
          downloadedAt: new Date(),
        })
        .where(eq(stubBuilds.downloadToken, downloadToken));

      Logger.info(`Marked build with token ${downloadToken} as downloaded`);
    } catch (error) {
      Logger.error(`Failed to mark build as downloaded:`, {
        downloadToken,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clean up expired builds
   */
  static async cleanupExpiredBuilds(): Promise<void> {
    try {
      // Get expired builds to delete their files
      const expiredBuilds = await db
        .select()
        .from(stubBuilds)
        .where(
          and(
            sql`${stubBuilds.expiresAt} < NOW()`,
            sql`${stubBuilds.status} NOT IN ('downloaded', 'expired')`,
          ),
        );

      if (expiredBuilds.length > 0) {
        // Mark as expired
        await db
          .update(stubBuilds)
          .set({ status: 'expired' })
          .where(
            and(
              sql`${stubBuilds.expiresAt} < NOW()`,
              sql`${stubBuilds.status} NOT IN ('downloaded', 'expired')`,
            ),
          );

        Logger.info(`Marked ${expiredBuilds.length} builds as expired`);
      }
    } catch (error) {
      Logger.error('Failed to cleanup expired builds:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete old build records and files (older than 1 hour)
   */
  static async deleteOldBuilds(): Promise<void> {
    try {
      // Get builds older than 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oldBuilds = await db
        .select()
        .from(stubBuilds)
        .where(sql`${stubBuilds.createdAt} < ${oneHourAgo}`);

      for (const build of oldBuilds) {
        // Try to delete the file
        try {
          if (build.filePath && fsSync.existsSync(build.filePath)) {
            await fs.unlink(build.filePath);
            Logger.info(`Deleted old build file: ${build.filePath}`);
          }
        } catch (fileError) {
          Logger.warn(`Failed to delete old build file ${build.filePath}:`, {
            filePath: build.filePath,
            error: fileError instanceof Error ? fileError.message : String(fileError),
          });
        }
      }

      // Delete old records
      await db.delete(stubBuilds).where(sql`${stubBuilds.createdAt} < ${oneHourAgo}`);

      if (oldBuilds.length > 0) {
        Logger.info(`Deleted ${oldBuilds.length} old build records`);
      }
    } catch (error) {
      Logger.error('Failed to delete old builds:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
