import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { StubBuilderService } from '../services/stubBuilder/stubBuilderService';
import { QueueFullError } from '../services/buildQueue';
import { sanitizeMeta } from '../routes/builder';
import { SystemRequirements } from '../services/stubBuilder/systemRequirements';
import { UserService } from '../services/userService';
import { StubBuildService } from '../services/stubBuildService';
import { StubBuilderConfigService } from '../services/stubBuilderConfigService';
import { Logger } from '../utils/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Encode a filename for the Content-Disposition header per RFC 5987.
 * Falls back to a quoted ASCII form for legacy clients.
 */
function contentDispositionAttachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Controller for Stub executable building operations
 */
export class StubBuilderController {
  /**
   * Start a new build process
   */
  public static async startBuild(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check if builds are currently enabled
      const buildsEnabled = await StubBuilderConfigService.areBuildsEnabled();
      if (!buildsEnabled) {
        res.status(503).json({
          error: 'Build service is currently disabled',
          details: 'Building is temporarily disabled by administrator',
        });
        return;
      }

      // Check if Rust is available before starting build
      const rustCheck = await SystemRequirements.checkRustInstallation();
      if (!rustCheck.available) {
        res.status(503).json({
          error: 'Stub builder service is not available',
          details: rustCheck.error,
        });
        return;
      }

      const userId = req.user!.id;

      // Check if user is in cooldown period
      const cooldownCheck = await StubBuildService.checkUserCooldown(userId);
      if (cooldownCheck.inCooldown) {
        res.status(429).json({
          error: 'Build cooldown active',
          message: `Please wait ${cooldownCheck.remainingTime} seconds before starting another build`,
          remainingTime: cooldownCheck.remainingTime,
        });
        return;
      }

      // Check if user already has an active build (this will also immediately expire any expired builds)
      const existingBuild = await StubBuildService.getUserActiveBuild(userId);
      if (existingBuild) {
        res.json({
          buildId: existingBuild.buildId,
          status: existingBuild.status,
          message:
            existingBuild.status === 'building'
              ? 'Build already in progress'
              : 'Build completed, download available',
          downloadUrl:
            existingBuild.status === 'completed'
              ? `/builder/api/download/${existingBuild.downloadToken}`
              : undefined,
        });
        return;
      }

      // Get user's access key from database
      const user = await UserService.getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Use the user's actual accessKey field
      const accessKey = user.accessKey;
      if (!accessKey) {
        res.status(400).json({ error: 'User access key not available' });
        return;
      }

      // Extract customization if provided (multipart or JSON)
      let customization: any = undefined;
      try {
        const body: any = req.body || {};
        const iconFile = (req as any).file;
        let iconBuffer: Buffer | undefined;
        if (iconFile?.buffer) {
          iconBuffer = iconFile.buffer;
        }
        const fileDescription = sanitizeMeta(body.fileDescription, 60);
        const productName = sanitizeMeta(body.productName, 50);
        let productVersion: string | undefined;
        if (body.productVersion) {
          const rawVersion = String(body.productVersion).trim();
          const versionRegex = /^\d{1,2}\.\d{1,2}\.\d{1,2}$/; // X.X.X or XX.XX.XX
          if (!versionRegex.test(rawVersion)) {
            res.status(400).json({
              error: 'Invalid productVersion format. Use X.X.X or XX.XX.XX with only numbers.',
            });
            return;
          }
          productVersion = rawVersion;
        }
        const companyName = sanitizeMeta(body.companyName, 60);
        const originalFilename = sanitizeMeta(body.originalFilename, 60);
        const internalName = sanitizeMeta(body.internalName, 60);
        if (
          fileDescription ||
          productName ||
          productVersion ||
          companyName ||
          originalFilename ||
          internalName ||
          iconBuffer
        ) {
          customization = {
            fileDescription,
            productName,
            productVersion,
            companyName,
            originalFilename,
            internalName,
            iconBuffer,
          };
        }
      } catch (e) {
        Logger.warn('Failed to parse customization data', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const buildId = await StubBuilderService.startBuild(userId, accessKey, customization);

      res.json({
        buildId,
        status: 'started', // Use 'started' to distinguish from existing 'building' builds
        message: 'Build process started successfully',
      });

      Logger.info('Build started', { userId, buildId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      Logger.error('Failed to start build', {
        userId: req.user?.id,
        error: errorMessage,
      });

      // Backpressure: queue at capacity. Reject with 503 + Retry-After so
      // clients (and any sane retry middleware) can back off intelligently
      // instead of pile-driving cargo invocations.
      if (error instanceof QueueFullError) {
        res.setHeader('Retry-After', String(error.retryAfterSec));
        res.status(503).json({
          error: 'Build service busy',
          message: `Too many builds in progress. Retry in ${error.retryAfterSec} seconds.`,
          retryAfterSec: error.retryAfterSec,
        });
        return;
      }

      // Check if this is a cache initialization error
      if (errorMessage.includes('Build system is initializing')) {
        res.status(503).json({
          error: 'Build cache is initializing',
          message:
            'The build system is preparing dependencies for faster builds. Please wait a few minutes and try again.',
          details: 'First-time setup or cache rebuild in progress',
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to start build process',
        message: 'An unexpected error occurred while starting the build',
      });
    }
  }

  /**
   * Get current user's build status
   */
  public static async getUserBuildStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Check for active build
      const activeBuild = await StubBuildService.getUserActiveBuild(userId);
      if (!activeBuild) {
        res.json({
          hasBuild: false,
          message: 'No active build found',
        });
        return;
      }

      const response: any = {
        hasBuild: true,
        buildId: activeBuild.buildId,
        status: activeBuild.status,
        createdAt: activeBuild.createdAt,
        expiresAt: activeBuild.expiresAt,
        message:
          activeBuild.status === 'building'
            ? 'Build in progress'
            : activeBuild.status === 'completed'
              ? 'Build completed, download available'
              : activeBuild.status === 'failed'
                ? 'Build failed'
                : 'Build status unknown',
      };

      if (activeBuild.status === 'completed') {
        response.downloadUrl = `/builder/api/download/${activeBuild.downloadToken}`;
      }

      if (activeBuild.status === 'failed' && activeBuild.errorMessage) {
        response.error = activeBuild.errorMessage;
      }

      res.json(response);
    } catch (error) {
      Logger.error('Failed to get user build status', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to get build status',
      });
    }
  }

  /**
   * Get build status. Authenticated; verifies the build belongs to the caller.
   */
  public static async getBuildStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { buildId } = req.params;

      if (!buildId || !UUID_RE.test(buildId)) {
        res.status(400).json({ error: 'Invalid build ID' });
        return;
      }

      const build = await StubBuildService.getBuildById(buildId);
      if (!build) {
        res.status(404).json({ error: 'Build not found' });
        return;
      }

      // Ownership check: a user can only read their own build's status.
      // The download token is included in the response when completed, so this
      // must not be inferable across users.
      if (build.userId !== req.user!.id) {
        res.status(404).json({ error: 'Build not found' });
        return;
      }

      const response: any = {
        buildId: build.buildId,
        status: build.status,
        createdAt: build.createdAt,
        expiresAt: build.expiresAt,
      };

      if (build.status === 'completed' && build.downloadToken) {
        response.downloadUrl = `/builder/api/download/${build.downloadToken}`;
      }

      if (build.status === 'failed' && build.errorMessage) {
        response.error = build.errorMessage;
      }

      res.json(response);
    } catch (error) {
      Logger.error('Failed to get build status', {
        buildId: req.params.buildId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to get build status',
      });
    }
  }

  /**
   * Download built executable. The download token authenticates the request
   * (no session auth required) and is single-use: we flip the build to
   * `downloaded` in the database BEFORE streaming, so a token can't be replayed
   * if the response is interrupted.
   */
  public static async downloadExecutable(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;

      if (!token || !UUID_RE.test(token)) {
        res.status(400).json({ error: 'Invalid download token' });
        return;
      }

      Logger.info('Download attempt', { token });

      const downloadInfo = await StubBuilderService.getExecutableForDownload(token);
      if (!downloadInfo) {
        Logger.warn('Download not found or expired', { token });
        res.status(404).json({ error: 'Download not found or expired' });
        return;
      }

      const { filePath, fileName } = downloadInfo;

      // Atomically invalidate the token before streaming: if the user's
      // network drops mid-download, the token is already burned. We accept the
      // tradeoff that a failed download cannot be retried — re-build instead.
      try {
        await StubBuildService.markAsDownloaded(token);
      } catch (err) {
        Logger.error('Failed to mark token as downloaded; aborting', {
          token,
          error: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({ error: 'Failed to process download' });
        return;
      }

      res.setHeader('Content-Disposition', contentDispositionAttachment(fileName));
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.sendFile(filePath, (error) => {
        if (error) {
          Logger.error('Failed to send executable file', {
            token,
            filePath,
            error: error.message,
          });
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download file' });
          }
        } else {
          Logger.info('Executable downloaded successfully', { token, fileName });
        }
        // Cleanup runs whether the stream succeeded or not — the token is
        // already burned, so the artifact is now garbage.
        setTimeout(() => {
          StubBuilderService.cleanupBuildByToken(token).catch((err) =>
            Logger.warn('Build artifact cleanup failed', {
              token,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }, 2000);
      });
    } catch (error) {
      Logger.error('Failed to handle download request', {
        token: req.params.token,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to process download',
        });
      }
    }
  }
}
