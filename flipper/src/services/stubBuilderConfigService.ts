import { db } from '../db/connection';
import { eq } from 'drizzle-orm';
import { builderConfig, stubBuilds } from '../db/schema/other';
import { Logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export interface StubBuilderConfig {
  id: number;
  buildsEnabled: boolean;
  buildCooldownSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

export class StubBuilderConfigService {
  /**
   * Get current stub builder configuration
   */
  static async getConfig(): Promise<StubBuilderConfig> {
    try {
      const config = await db.select().from(builderConfig).where(eq(builderConfig.id, 1)).limit(1);

      if (config.length === 0) {
        // If no config exists, create default one
        await this.resetToDefault();
        return await this.getConfig();
      }

      const row = config[0];
      return {
        id: row.id!,
        buildsEnabled: row.buildsEnabled ?? true,
        buildCooldownSeconds: row.buildCooldownSeconds ?? 120,
        createdAt: row.createdAt || new Date(),
        updatedAt: row.updatedAt || new Date(),
      };
    } catch (error) {
      Logger.error('Failed to get stub builder config:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update stub builder configuration
   */
  static async updateConfig(updates: {
    buildsEnabled?: boolean;
    buildCooldownSeconds?: number;
  }): Promise<void> {
    try {
      const updateData: any = {};

      if (typeof updates.buildsEnabled === 'boolean') {
        updateData.buildsEnabled = updates.buildsEnabled;
      }

      if (typeof updates.buildCooldownSeconds === 'number') {
        updateData.buildCooldownSeconds = updates.buildCooldownSeconds;
      }

      if (Object.keys(updateData).length === 0) {
        return; // Nothing to update
      }

      updateData.updatedAt = new Date();

      await db.update(builderConfig).set(updateData).where(eq(builderConfig.id, 1));

      Logger.info('Stub builder config updated', { updates });
    } catch (error) {
      Logger.error('Failed to update stub builder config:', {
        updates,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if builds are currently enabled
   */
  static async areBuildsEnabled(): Promise<boolean> {
    try {
      const config = await this.getConfig();
      return Boolean(config.buildsEnabled);
    } catch (error) {
      Logger.error('Failed to check if builds are enabled:', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Default to enabled on error
      return true;
    }
  }

  /**
   * Get current build cooldown in seconds
   */
  static async getBuildCooldown(): Promise<number> {
    try {
      const config = await this.getConfig();
      return config.buildCooldownSeconds;
    } catch (error) {
      Logger.error('Failed to get build cooldown:', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Default to 120 seconds on error
      return 120;
    }
  }

  /**
   * Toggle builds on/off
   */
  static async toggleBuilds(enabled: boolean): Promise<void> {
    await this.updateConfig({ buildsEnabled: enabled });
  }

  /**
   * Set build cooldown
   */
  static async setBuildCooldown(seconds: number): Promise<void> {
    if (seconds < 0) {
      throw new Error('Build cooldown cannot be negative');
    }
    if (seconds > 3600) {
      throw new Error('Build cooldown cannot exceed 1 hour (3600 seconds)');
    }
    await this.updateConfig({ buildCooldownSeconds: seconds });
  }

  /**
   * Reset configuration to default values
   */
  static async resetToDefault(): Promise<void> {
    try {
      await db
        .insert(builderConfig)
        .values({
          id: 1,
          buildsEnabled: true,
          buildCooldownSeconds: 120,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: builderConfig.id,
          set: {
            buildsEnabled: true,
            buildCooldownSeconds: 120,
            updatedAt: new Date(),
          },
        });

      Logger.info('Stub builder config reset to default');
    } catch (error) {
      Logger.error('Failed to reset stub builder config:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clean up all temporary build files and executables
   */
  static async cleanupAllFiles(): Promise<{ filesDeleted: number; directoriesCleared: string[] }> {
    try {
      const basePath = path.join(process.cwd(), 'temp');
      const buildsPath = path.join(basePath, 'builds');
      const executablesPath = path.join(basePath, 'executables');

      let filesDeleted = 0;
      const directoriesCleared: string[] = [];

      // Clean builds directory
      if (fsSync.existsSync(buildsPath)) {
        try {
          const buildFiles = await fs.readdir(buildsPath);
          for (const file of buildFiles) {
            const filePath = path.join(buildsPath, file);
            try {
              const stats = await fs.stat(filePath);
              if (stats.isFile()) {
                await fs.unlink(filePath);
                filesDeleted++;
              } else if (stats.isDirectory()) {
                // Remove directory recursively using modern fs.rm
                await fs.rm(filePath, { recursive: true, force: true });
                filesDeleted++;
              }
            } catch (fileError) {
              Logger.warn('Failed to delete file/directory', { filePath, error: fileError });
            }
          }
          directoriesCleared.push('builds');
        } catch (dirError) {
          Logger.warn('Failed to read builds directory', { buildsPath, error: dirError });
        }
      }

      // Clean executables directory
      if (fsSync.existsSync(executablesPath)) {
        try {
          const executableFiles = await fs.readdir(executablesPath);
          for (const file of executableFiles) {
            const filePath = path.join(executablesPath, file);
            try {
              const stats = await fs.stat(filePath);
              if (stats.isFile()) {
                await fs.unlink(filePath);
                filesDeleted++;
              } else if (stats.isDirectory()) {
                // Remove directory recursively using modern fs.rm
                await fs.rm(filePath, { recursive: true, force: true });
                filesDeleted++;
              }
            } catch (fileError) {
              Logger.warn('Failed to delete file/directory', { filePath, error: fileError });
            }
          }
          directoriesCleared.push('executables');
        } catch (dirError) {
          Logger.warn('Failed to read executables directory', { executablesPath, error: dirError });
        }
      }

      // Also clean up database records of builds
      await db.delete(stubBuilds);

      Logger.info('Cleaned up all stub builder files and database records', {
        filesDeleted,
        directoriesCleared,
      });

      return { filesDeleted, directoriesCleared };
    } catch (error) {
      Logger.error('Failed to cleanup all files:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
