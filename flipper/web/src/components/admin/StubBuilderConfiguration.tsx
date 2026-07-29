import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Settings,
  Power,
  Clock,
  RotateCcw,
  Trash2,
  RefreshCw,
  Database,
  HardDrive,
  Play,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getJson, postJson, putJson } from '@/utils/api';

interface StubBuilderConfig {
  builds_enabled: boolean;
  build_cooldown_seconds: number;
}

interface CacheStatus {
  cacheReady: boolean;
  buildSystemReady: boolean;
  cachePath: string;
  message?: string;
  isResetInProgress?: boolean;
  isRetryInProgress?: boolean;
  resetElapsedSeconds?: number;
  retryElapsedSeconds?: number;
}

export function StubBuilderConfiguration() {
  const [config, setConfig] = useState<StubBuilderConfig | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cooldownInput, setCooldownInput] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [clientElapsedTime, setClientElapsedTime] = useState<number>(0);

  // Format elapsed time in a human-readable format
  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
  };

  const loadConfig = async () => {
    try {
      const data = await getJson('/admin/api/stub-builder/config');
      setConfig(data.config);
      setCooldownInput(data.config.build_cooldown_seconds.toString());
    } catch (error) {
      console.error('Error loading stub builder config:', error);
      toast.error('Failed to load configuration');
    }
  };

  const loadCacheStatus = async () => {
    try {
      const data = await getJson('/admin/api/stub-builder/cache-status');
      setCacheStatus(data);
    } catch (error) {
      console.error('Error loading cache status:', error);
      toast.error('Failed to load cache status');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([loadConfig(), loadCacheStatus()]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Poll for cache status updates when operations are in progress
  useEffect(() => {
    if (!cacheStatus?.isResetInProgress && !cacheStatus?.isRetryInProgress) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        await loadCacheStatus();
      } catch (error) {
        console.error('Error polling cache status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [cacheStatus?.isResetInProgress, cacheStatus?.isRetryInProgress]);

  // Update client-side elapsed time every second when operations are in progress
  useEffect(() => {
    if (!cacheStatus?.isResetInProgress && !cacheStatus?.isRetryInProgress) {
      setClientElapsedTime(0);
      return;
    }

    // Initialize with server elapsed time
    const serverElapsed = cacheStatus.isResetInProgress
      ? cacheStatus.resetElapsedSeconds || 0
      : cacheStatus.retryElapsedSeconds || 0;

    setClientElapsedTime(serverElapsed);

    const timerInterval = setInterval(() => {
      setClientElapsedTime((prev) => prev + 1);
    }, 1000); // Update every second

    return () => clearInterval(timerInterval);
  }, [
    cacheStatus?.isResetInProgress,
    cacheStatus?.isRetryInProgress,
    cacheStatus?.resetElapsedSeconds,
    cacheStatus?.retryElapsedSeconds,
  ]);

  const toggleBuilds = async () => {
    if (!config) return;

    setActionLoading('toggle');
    try {
      const data = await postJson('/admin/api/stub-builder/toggle', {
        enabled: !config.builds_enabled,
      });
      setConfig(data.config);
      toast.success(data.message);
    } catch (error) {
      console.error('Error toggling builds:', error);
      toast.error('Failed to toggle builds');
    } finally {
      setActionLoading(null);
    }
  };

  const updateCooldown = async () => {
    const newCooldown = parseInt(cooldownInput);

    if (isNaN(newCooldown) || newCooldown < 0 || newCooldown > 3600) {
      toast.error('Cooldown must be between 0 and 3600 seconds');
      return;
    }

    setActionLoading('cooldown');
    try {
      const data = await putJson('/admin/api/stub-builder/config', {
        build_cooldown_seconds: newCooldown,
      });
      setConfig(data.config);
      toast.success(data.message);
    } catch (error) {
      console.error('Error updating cooldown:', error);
      toast.error('Failed to update cooldown');
    } finally {
      setActionLoading(null);
    }
  };

  const resetConfiguration = async () => {
    setActionLoading('reset');
    try {
      const data = await postJson('/admin/api/stub-builder/reset', {});
      setConfig(data.config);
      setCooldownInput(data.config.build_cooldown_seconds.toString());
      toast.success(data.message);
    } catch (error) {
      console.error('Error resetting config:', error);
      toast.error('Failed to reset configuration');
    } finally {
      setActionLoading(null);
    }
  };

  const cleanupAllFiles = async () => {
    setActionLoading('cleanup');
    try {
      const data = await postJson('/admin/api/stub-builder/cleanup', {});
      toast.success(data.message);
    } catch (error) {
      console.error('Error cleaning up files:', error);
      toast.error('Failed to cleanup files');
    } finally {
      setActionLoading(null);
    }
  };

  const refreshCacheStatus = async () => {
    setActionLoading('refresh-cache');
    try {
      await loadCacheStatus();
      toast.success('Cache status refreshed');
    } catch (error) {
      console.error('Error refreshing cache status:', error);
      toast.error('Failed to refresh cache status');
    } finally {
      setActionLoading(null);
    }
  };

  const resetBuildCache = async () => {
    setActionLoading('reset-cache');

    try {
      const data = await postJson('/admin/api/stub-builder/reset-cache', {});
      toast.success(data.message);
      // Refresh cache status to get updated server state
      await loadCacheStatus();
    } catch (error) {
      console.error('Error resetting build cache:', error);
      toast.error('Failed to reset build cache');
      // Refresh cache status even on error to get current server state
      await loadCacheStatus();
    } finally {
      setActionLoading(null);
    }
  };

  const retryCacheInit = async () => {
    setActionLoading('retry-cache');

    try {
      const data = await postJson('/admin/api/stub-builder/retry-cache', {});
      toast.success(data.message);
      // Refresh cache status to get updated server state
      await loadCacheStatus();
    } catch (error) {
      console.error('Error retrying cache initialization:', error);
      toast.error('Failed to retry cache initialization');
      // Refresh cache status even on error to get current server state
      await loadCacheStatus();
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Stub Builder Configuration</h1>
        <p className="text-muted-foreground mt-1">
          Manage global settings for the Stub Builder service.
        </p>
      </div>

      {/* Current Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Power className="h-5 w-5" />
                Build Service Status
              </span>
              {config && (
                <Badge
                  variant={config.builds_enabled ? 'default' : 'destructive'}
                  className={
                    config.builds_enabled
                      ? 'bg-success/15 text-success hover:bg-success/25'
                      : 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                  }
                >
                  {config.builds_enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Controls whether users can start new build processes
            </p>
            <Button
              onClick={toggleBuilds}
              disabled={actionLoading === 'toggle' || !config}
              variant={config?.builds_enabled ? 'destructive' : 'default'}
              className={config?.builds_enabled ? '' : 'bg-success hover:bg-success/90 text-white'}
            >
              {actionLoading === 'toggle' ? <LoadingSpinner size="sm" className="mr-2" /> : null}
              {config?.builds_enabled ? 'Disable Builds' : 'Enable Builds'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Build Cooldown
              </span>
              <span className="text-sm text-muted-foreground">
                {config ? `${config.build_cooldown_seconds}s` : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Time users must wait between build attempts
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Seconds"
                value={cooldownInput}
                onChange={(e) => setCooldownInput(e.target.value)}
                min="0"
                max="3600"
              />
              <Button onClick={updateCooldown} disabled={actionLoading === 'cooldown'}>
                {actionLoading === 'cooldown' ? (
                  <LoadingSpinner size="sm" className="mr-2" />
                ) : null}
                Update
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuration Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Advanced configuration management options
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={resetConfiguration}
              disabled={actionLoading === 'reset'}
            >
              {actionLoading === 'reset' ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Reset to Defaults
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={actionLoading === 'cleanup'}>
                  {actionLoading === 'cleanup' ? (
                    <LoadingSpinner size="sm" className="mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Cleanup All Files
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Cleanup All Build Files
                  </AlertDialogTitle>
                  <AlertDialogDescription className="flex flex-col gap-2">
                    <p>Are you sure you want to delete all build files and executables?</p>
                    <div className="text-sm flex flex-col gap-1">
                      <p className="font-medium">This will permanently delete:</p>
                      <ul className="list-disc list-inside ml-2 flex flex-col gap-1">
                        <li>All files in temp\builds</li>
                        <li>All files in temp\executables</li>
                        <li>All database records of builds</li>
                      </ul>
                    </div>
                    <p className="text-destructive font-medium">
                      Users will no longer be able to download previously built executables. This
                      action cannot be undone!
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={cleanupAllFiles}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, Delete All Files
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Build Cache Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Build Cache Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Manage the build dependency cache for faster compilation
          </p>

          {/* Cache Status */}
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Cache Status</span>
                {cacheStatus && (
                  <Badge
                    variant={
                      cacheStatus.isResetInProgress || cacheStatus.isRetryInProgress
                        ? 'secondary'
                        : cacheStatus.cacheReady && cacheStatus.buildSystemReady
                          ? 'default'
                          : cacheStatus.cacheReady && !cacheStatus.buildSystemReady
                            ? 'secondary'
                            : 'destructive'
                    }
                    className={
                      cacheStatus.isResetInProgress || cacheStatus.isRetryInProgress
                        ? 'bg-warning/15 text-warning hover:bg-warning/25'
                        : cacheStatus.cacheReady && cacheStatus.buildSystemReady
                          ? 'bg-success/15 text-success hover:bg-success/25'
                          : cacheStatus.cacheReady && !cacheStatus.buildSystemReady
                            ? 'bg-warning/15 text-warning hover:bg-warning/25'
                            : 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                    }
                  >
                    {cacheStatus.isResetInProgress
                      ? `Elapsed time: (${formatElapsedTime(clientElapsedTime)})`
                      : cacheStatus.isRetryInProgress
                        ? `Retrying... (${formatElapsedTime(clientElapsedTime)})`
                        : cacheStatus.cacheReady && cacheStatus.buildSystemReady
                          ? 'Ready'
                          : cacheStatus.cacheReady && !cacheStatus.buildSystemReady
                            ? 'Initializing'
                            : 'Not Ready'}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex flex-col gap-1">
                <div>
                  Build System:{' '}
                  <span className="font-mono">
                    {cacheStatus?.buildSystemReady ? 'Ready' : cacheStatus?.message || 'Not Ready'}
                  </span>
                </div>
                <div>
                  Cache Path:{' '}
                  <span className="font-mono">{cacheStatus?.cachePath || 'Unknown'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cache Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="default"
              onClick={refreshCacheStatus}
              disabled={
                actionLoading !== null ||
                cacheStatus?.isResetInProgress ||
                cacheStatus?.isRetryInProgress
              }
            >
              {actionLoading === 'refresh-cache' ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {actionLoading === 'refresh-cache' ? 'Refreshing...' : 'Refresh Status'}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="bg-warning text-white hover:bg-warning/90 border-warning hover:border-warning/90"
                  disabled={
                    actionLoading !== null ||
                    cacheStatus?.isResetInProgress ||
                    cacheStatus?.isRetryInProgress
                  }
                >
                  {cacheStatus?.isResetInProgress || actionLoading === 'reset-cache' ? (
                    <LoadingSpinner size="sm" className="mr-2" />
                  ) : (
                    <HardDrive className="h-4 w-4 mr-2" />
                  )}
                  {cacheStatus?.isResetInProgress || actionLoading === 'reset-cache'
                    ? `Resetting...`
                    : 'Reset Cache'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Reset Build Cache
                  </AlertDialogTitle>
                  <AlertDialogDescription className="flex flex-col gap-2">
                    <p>Are you sure you want to reset the build cache?</p>
                    <div className="text-sm flex flex-col gap-1">
                      <p className="font-medium">This will:</p>
                      <ul className="list-disc list-inside ml-2 flex flex-col gap-1">
                        <li>Delete all cached build dependencies</li>
                        <li>Force recompilation of all dependencies on next build</li>
                        <li>Temporarily disable builds until cache is rebuilt</li>
                      </ul>
                    </div>
                    <p className="text-warning font-medium">
                      The first build after reset will take longer (2-5 minutes). Subsequent builds
                      will be fast again.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={resetBuildCache}
                    className="bg-warning text-white hover:bg-warning/90"
                  >
                    Reset Cache
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="outline"
              className="bg-info text-white hover:bg-info/90 border-info hover:border-info/90"
              onClick={retryCacheInit}
              disabled={
                actionLoading !== null ||
                cacheStatus?.isResetInProgress ||
                cacheStatus?.isRetryInProgress ||
                (cacheStatus?.cacheReady && cacheStatus?.buildSystemReady)
              }
            >
              {cacheStatus?.isRetryInProgress || actionLoading === 'retry-cache' ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {cacheStatus?.isRetryInProgress || actionLoading === 'retry-cache'
                ? `Retrying... (${formatElapsedTime(clientElapsedTime)})`
                : cacheStatus?.cacheReady && cacheStatus?.buildSystemReady
                  ? 'Cache Ready'
                  : 'Retry Init'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
