import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../utils/logger';
import { BuildJob, DownloadToken } from '../../types/stubBuilder';
import { SystemRequirements } from './systemRequirements';
import { StubBuildService } from '../stubBuildService';
import { StubBuildQueue, QueueFullError } from '../buildQueue';
import { BaseBinary } from './baseBinary';
import { injectIntoBase } from './inject';

/**
 * Service for building Stub executables with user-specific access keys
 */
export class StubBuilderService {
  private static readonly BUILDS_PATH = path.join(process.cwd(), 'temp', 'builds');
  private static readonly EXECUTABLES_PATH = path.join(process.cwd(), 'temp', 'executables');
  private static readonly BASE_DIR = path.join(process.cwd(), 'temp', 'stub_base');
  private static readonly BUILD_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  private static readonly DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  private static buildJobs: Map<string, BuildJob> = new Map();
  private static downloadTokens: Map<string, DownloadToken> = new Map();
  private static isCacheReady: boolean = false;
  private static isResetInProgress: boolean = false;
  private static isRetryInProgress: boolean = false;
  private static resetStartTime: number | null = null;
  private static retryStartTime: number | null = null;

  /**
   * Initialize the service and start cleanup tasks
   */
  public static async initialize(): Promise<{ healthy: boolean; report: any }> {
    const healthReport = {
      systemRequirements: false,
      directories: false,
      buildCache: false,
      errors: [] as string[],
    };

    try {
      // Check system requirements first
      const systemHealth = await SystemRequirements.checkSystemRequirements();
      healthReport.systemRequirements = systemHealth.healthy;

      if (!systemHealth.healthy) {
        healthReport.errors.push('System requirements not met');
        throw new Error('System requirements not met. Build environment not ready.');
      }

      // Ensure directories exist. BUILDS_PATH is kept for back-compat with
      // BuildJob.workingDirectory; nothing is written under it on the inject
      // path, but cleanup helpers still reference it.
      await fs.mkdir(this.BUILDS_PATH, { recursive: true });
      await fs.mkdir(this.EXECUTABLES_PATH, { recursive: true });
      healthReport.directories = true;

      // Prime the prebuilt base binary used by the inject hot path. Rebuilds
      // only when the template tree's content hash changes. The legacy
      // initializeBuildCache() path is dead — the inject path doesn't need
      // a per-build target copy at all.
      try {
        await BaseBinary.ensureFresh();
        this.isCacheReady = true;
      } catch (err) {
        this.isCacheReady = false;
        Logger.error('Base binary priming failed; builds disabled until fixed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      healthReport.buildCache = this.isCacheReady;

      // Start periodic cleanup
      setInterval(() => {
        this.cleanupExpiredBuilds();
        this.cleanupExpiredTokens();
      }, 60 * 1000); // Run every minute

      const healthy =
        healthReport.errors.length === 0 &&
        healthReport.systemRequirements &&
        healthReport.directories;

      if (healthy) {
        Logger.info('Builder service is healthy', healthReport);
      } else {
        Logger.warn('Builder service health issues detected', healthReport);
      }

      return { healthy, report: healthReport };
    } catch (error) {
      healthReport.errors.push(error instanceof Error ? error.message : String(error));
      Logger.error('Builder service initialization failed', healthReport);
      return { healthy: false, report: healthReport };
    }
  }

  /**
   * Start building a Stub executable for a user
   */
  public static async startBuild(
    userId: number,
    accessKey: string,
    customization?: import('../../types/stubBuilder').BuildCustomization,
  ): Promise<string> {
    // Check if build cache is ready before allowing builds
    if (!this.isCacheReady) {
      Logger.error('Build cache not ready, rejecting build request', {
        userId,
        cacheReady: this.isCacheReady,
      });
      throw new Error('Build system is initializing. Please wait a few minutes and try again.');
    }

    // Reserve a build queue slot up front so we fail fast with backpressure
    // before doing any DB writes or copying templates. Reservation is held
    // until performBuild() finishes (via Reservation.run() in the async tail).
    const reservation = StubBuildQueue.tryReserve();
    if ('full' in reservation) {
      Logger.warn('Build queue at capacity, rejecting request', {
        userId,
        stats: StubBuildQueue.stats,
        retryAfterSec: reservation.retryAfterSec,
      });
      throw new QueueFullError(reservation.retryAfterSec);
    }

    const buildId = uuidv4();
    const downloadToken = uuidv4();
    const workingDirectory = path.join(this.BUILDS_PATH, `build_${buildId}_${Date.now()}`);

    // Match the filename pattern used in buildExecutable method
    const isWindows = process.platform === 'win32';
    const executableName = `user-executable${isWindows ? '.exe' : ''}`;
    const executablePath = path.join(this.EXECUTABLES_PATH, `${buildId}_${executableName}`);

    const buildJob: BuildJob = {
      id: buildId,
      userId,
      accessKey,
      status: 'building',
      workingDirectory,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.BUILD_TIMEOUT),
      downloaded: false,
      executablePath,
      customization,
    };

    this.buildJobs.set(buildId, buildJob);

    try {
      // Create database record
      await StubBuildService.createBuild(userId, buildId, downloadToken, executablePath);
    } catch (dbError) {
      // Free the slot we reserved if we couldn't even persist the build.
      reservation.cancel();
      this.buildJobs.delete(buildId);
      throw dbError;
    }

    Logger.info('Starting Rust build with cache ready', {
      buildId,
      userId,
      workingDirectory,
      cacheReady: this.isCacheReady,
      queueStats: StubBuildQueue.stats,
    });

    // Start build process asynchronously, gated by the worker pool.
    // reservation.run() waits for an actual worker slot before performBuild
    // touches the filesystem or spawns cargo, and releases the slot when
    // done. Errors are logged and recorded against the build job as before.
    reservation
      .run(() => this.performBuild(buildJob, downloadToken))
      .catch((error) => {
        Logger.error('Build process failed', {
          buildId,
          error: error instanceof Error ? error.message : String(error),
        });
        buildJob.status = 'failed';
        buildJob.error = error instanceof Error ? error.message : 'Unknown build error';

        // Update database status
        StubBuildService.updateBuildStatus(buildId, 'failed', buildJob.error).catch((dbError) => {
          Logger.error('Failed to update build status in database', {
            buildId,
            error: dbError instanceof Error ? dbError.message : String(dbError),
          });
        });
      });

    return buildId;
  }

  /**
   * Get build status
   */
  public static getBuildStatus(buildId: string): BuildJob | null {
    return this.buildJobs.get(buildId) || null;
  }

  /**
   * Check if the build system is ready to accept new builds
   */
  public static isBuildSystemReady(): { ready: boolean; message?: string } {
    if (!this.isCacheReady) {
      return {
        ready: false,
        message:
          'Build system is initializing dependency cache. Please wait a few minutes and try again.',
      };
    }

    return { ready: true };
  }

  /**
   * Generate a one-time download token (Legacy - now using database tokens)
   * @deprecated Use database download_token instead
   */
  public static generateDownloadToken(buildId: string): string | null {
    const buildJob = this.buildJobs.get(buildId);
    if (!buildJob || buildJob.status !== 'completed' || !buildJob.executablePath) {
      return null;
    }

    const token = uuidv4();
    const downloadToken: DownloadToken = {
      token,
      buildId,
      expiresAt: new Date(Date.now() + this.DOWNLOAD_TIMEOUT),
      used: false,
    };

    this.downloadTokens.set(token, downloadToken);
    return token;
  }

  /**
   * Get executable file for download (one-time use)
   */
  public static async getExecutableForDownload(
    token: string,
  ): Promise<{ filePath: string; fileName: string } | null> {
    Logger.info('Looking for download token', { token });

    // Prefer the database record so downloads survive process restarts.
    const build = await StubBuildService.getBuildByToken(token);
    if (build) {
      Logger.info('Found database build for token', {
        token,
        buildId: build.buildId,
        status: build.status,
      });

      if (!build.filePath) {
        Logger.warn('No executable path found for database build', {
          token,
          buildId: build.buildId,
        });
        return null;
      }

      try {
        await fs.access(build.filePath);
        Logger.info('Executable file exists, proceeding with download', {
          token,
          buildId: build.buildId,
          executablePath: build.filePath,
        });

        const isWindows = process.platform === 'win32';
        const fileName = `user-executable${isWindows ? '.exe' : ''}`;

        return {
          filePath: build.filePath,
          fileName,
        };
      } catch (error) {
        Logger.error('Executable file not found for database token', {
          token,
          buildId: build.buildId,
          executablePath: build.filePath,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }

    Logger.info('No database build found for token', { token });

    // Fallback to in-memory tokens (for backwards compatibility)
    const downloadToken = this.downloadTokens.get(token);
    if (!downloadToken || downloadToken.used || downloadToken.expiresAt < new Date()) {
      Logger.info('No valid in-memory token found', {
        token,
        hasToken: !!downloadToken,
        used: downloadToken?.used,
        expired: downloadToken ? downloadToken.expiresAt < new Date() : null,
      });
      return null;
    }

    Logger.info('Found in-memory download token', { token, buildId: downloadToken.buildId });

    const buildJob = this.buildJobs.get(downloadToken.buildId);
    if (!buildJob || !buildJob.executablePath) {
      Logger.warn('No build job found for in-memory token', {
        token,
        buildId: downloadToken.buildId,
      });
      return null;
    }

    try {
      await fs.access(buildJob.executablePath);

      // Mark token as used
      downloadToken.used = true;

      // DO NOT schedule cleanup here - let download controller handle it after completion

      const isWindows = process.platform === 'win32';
      const fileName = `user-executable${isWindows ? '.exe' : ''}`;

      return {
        filePath: buildJob.executablePath,
        fileName,
      };
    } catch (error) {
      Logger.error('Executable file not found for in-memory token', {
        token,
        buildId: downloadToken.buildId,
        executablePath: buildJob.executablePath,
      });
      return null;
    }
  }

  /**
   * Perform the actual build process — hot path now.
   *
   * Reads the prebuilt base binary, swaps in user icon + VERSIONINFO via
   * resedit, patches the KEY_BLOB sentinel with the user's access key, and
   * writes the result to executablePath. No cargo, no linker, no Python.
   *
   * The legacy cargo-spawning helpers (copyTemplate / applyCustomization /
   * buildExecutable / runComplexBuildProcess / initializeBuildCache /
   * performCacheBuild / replacePlaceholder) are intentionally left in the
   * file but unused; deleting them is a follow-up cleanup commit so this
   * change stays reviewable in isolation.
   */
  private static async performBuild(buildJob: BuildJob, _downloadToken: string): Promise<void> {
    const t0 = Date.now();
    try {
      const basePath = await BaseBinary.pathIfReady();
      if (!basePath) {
        throw new Error(
          'Base binary is not ready; cannot inject. Wait for boot-time prime to finish.',
        );
      }

      const cust = buildJob.customization;
      // executablePath is always set in startBuild() before performBuild
      // runs; the optional in the type is a legacy from when it was filled
      // in only after buildExecutable() returned.
      if (!buildJob.executablePath) {
        throw new Error('Internal: buildJob.executablePath unset');
      }
      await injectIntoBase(basePath, buildJob.executablePath, {
        accessKey: buildJob.accessKey,
        iconBuffer: cust?.iconBuffer,
        metadata: cust
          ? {
              fileDescription: cust.fileDescription,
              productName: cust.productName,
              productVersion: cust.productVersion,
              companyName: cust.companyName,
              originalFilename: cust.originalFilename,
              internalName: cust.internalName,
            }
          : undefined,
      });

      buildJob.status = 'completed';
      buildJob.completedAt = new Date();
      await StubBuildService.updateBuildStatus(buildJob.id, 'completed');

      Logger.info('Build completed via inject path', {
        buildId: buildJob.id,
        elapsedMs: Date.now() - t0,
      });
    } catch (error) {
      buildJob.status = 'failed';
      buildJob.error = error instanceof Error ? error.message : 'Unknown build error';
      await StubBuildService.updateBuildStatus(buildJob.id, 'failed', buildJob.error);
      Logger.error('Build failed in inject path', {
        buildId: buildJob.id,
        elapsedMs: Date.now() - t0,
        error: buildJob.error,
      });
      throw error;
    }
  }

  /**
   * (Removed) Legacy cargo-spawning helpers: applyCustomization,
   * copyTemplate, initializeBuildCache, performCacheBuild, copyDirectory,
   * replacePlaceholder, buildExecutable, runComplexBuildProcess, and
   * cleanupSourceFiles were all obsolete after the prebuild-base + inject
   * refactor (see ./baseBinary.ts and ./inject.ts) and have been deleted.
   * If a per-request live compile ever comes back, derive it from
   * BaseBinary.compileBase() rather than reviving these.
   */

  /**
   * Clean up expired builds and their files
   */
  private static async cleanupExpiredBuilds(): Promise<void> {
    const now = new Date();
    const expiredBuilds: string[] = [];

    for (const [buildId, buildJob] of this.buildJobs) {
      if (buildJob.expiresAt < now || buildJob.downloaded) {
        expiredBuilds.push(buildId);
      }
    }

    for (const buildId of expiredBuilds) {
      await this.cleanupBuild(buildId);
    }
  }

  /**
   * Clean up a specific build by download token
   */
  public static async cleanupBuildByToken(token: string): Promise<void> {
    Logger.info('Starting cleanup for download token', { token });

    // First check database builds
    const build = await StubBuildService.getBuildByToken(token);
    if (build) {
      await this.cleanupBuild(build.buildId);
      return;
    }

    // Fallback to in-memory tokens
    const downloadToken = this.downloadTokens.get(token);
    if (downloadToken) {
      await this.cleanupBuild(downloadToken.buildId);
      this.downloadTokens.delete(token);
    }
  }

  /**
   * Clean up a specific build
   */
  private static async cleanupBuild(buildId: string): Promise<void> {
    try {
      const buildJob = this.buildJobs.get(buildId);
      const buildRecord = buildJob ? null : await StubBuildService.getBuildById(buildId);

      const executablePath = buildJob?.executablePath || buildRecord?.filePath;

      // Remove executable file
      if (executablePath) {
        await fs.rm(executablePath, { force: true });
      }

      // Remove working directory if it still exists
      if (buildJob?.workingDirectory) {
        await fs.rm(buildJob.workingDirectory, { recursive: true, force: true });
      }

      // Remove from memory
      this.buildJobs.delete(buildId);

      Logger.debug('Cleaned up build', { buildId });
    } catch (error) {
      Logger.warn('Failed to cleanup build', {
        buildId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clean up expired download tokens
   */
  private static cleanupExpiredTokens(): void {
    const now = new Date();
    const expiredTokens: string[] = [];

    for (const [token, downloadToken] of this.downloadTokens) {
      if (downloadToken.expiresAt < now || downloadToken.used) {
        expiredTokens.push(token);
      }
    }

    for (const token of expiredTokens) {
      this.downloadTokens.delete(token);
    }
  }

  /**
   * Clear build cache and force rebuild of dependencies
   * Useful when template has been updated or cache is corrupted
   */
  public static async clearBuildCache(): Promise<void> {
    try {
      Logger.info('Clearing build cache...');
      this.isResetInProgress = true;
      this.resetStartTime = Date.now();
      this.isCacheReady = false;

      // Removing temp/stub_base forces BaseBinary.ensureFresh() to recompile
      // on the next call.
      await fs.rm(this.BASE_DIR, { recursive: true, force: true });
      try {
        await BaseBinary.ensureFresh();
        this.isCacheReady = true;
      } catch (err) {
        this.isCacheReady = false;
        Logger.error('Base binary rebuild failed during clearBuildCache', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (this.isCacheReady) {
        Logger.info('Build cache cleared and reinitialized successfully');
      } else {
        Logger.error('Build cache reinitialization failed');
      }
    } catch (error) {
      Logger.error('Failed to clear build cache', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isResetInProgress = false;
      this.resetStartTime = null;
    }
  }

  /**
   * Retry cache initialization - useful if it failed during startup
   */
  public static async retryCacheInitialization(): Promise<boolean> {
    if (this.isCacheReady && !this.isRetryInProgress) {
      Logger.info('Cache already ready, no retry needed');
      return true;
    }

    try {
      Logger.info('Retrying base binary prime...');
      this.isRetryInProgress = true;
      this.retryStartTime = Date.now();
      try {
        await BaseBinary.ensureFresh();
        this.isCacheReady = true;
      } catch (err) {
        this.isCacheReady = false;
        Logger.error('Base binary prime retry failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (this.isCacheReady) {
        Logger.info('Cache initialization retry successful - builds are now available');
        return true;
      } else {
        Logger.error('Cache initialization retry failed');
        return false;
      }
    } catch (error) {
      Logger.error('Failed to retry cache initialization', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      this.isRetryInProgress = false;
      this.retryStartTime = null;
    }
  }

  /**
   * Get cache status information
   */
  public static getCacheStatus(): {
    ready: boolean;
    path: string;
    size?: string;
    isResetInProgress: boolean;
    isRetryInProgress: boolean;
    resetElapsedSeconds?: number;
    retryElapsedSeconds?: number;
  } {
    const now = Date.now();

    return {
      ready: this.isCacheReady,
      path: this.BASE_DIR,
      isResetInProgress: this.isResetInProgress,
      isRetryInProgress: this.isRetryInProgress,
      resetElapsedSeconds: this.resetStartTime
        ? Math.floor((now - this.resetStartTime) / 1000)
        : undefined,
      retryElapsedSeconds: this.retryStartTime
        ? Math.floor((now - this.retryStartTime) / 1000)
        : undefined,
      // You could add size calculation here if needed
    };
  }
}
