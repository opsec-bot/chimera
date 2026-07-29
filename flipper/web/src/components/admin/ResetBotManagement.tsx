import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  RefreshCw,
  Play,
  Square,
  Settings,
  Bot,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Activity,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

interface ResetBotConfig {
  bot_token: string | null;
  bot_username: string | null;
  enabled: boolean;
  has_token: boolean;
  poll_interval: number;
}

interface ResetBotStatus {
  running: boolean;
  startedAt: string | null;
  lastPollAt: string | null;
  lastUpdateId: number | null;
  errors: number;
  processed_requests: number;
  uptime: number;
}

export function ResetBotManagement() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ResetBotConfig>({
    bot_token: null,
    bot_username: null,
    enabled: false,
    has_token: false,
    poll_interval: 1000,
  });
  const [tokenInput, setTokenInput] = useState<string>('');
  const [status, setStatus] = useState<ResetBotStatus | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadResetBotConfig();
    refreshResetBotStatus();

    // Set up auto-refresh every 5 seconds when component mounts
    const interval = setInterval(refreshResetBotStatus, 5000);
    setRefreshInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const loadResetBotConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/admin/api/reset-bot/config', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load reset bot configuration');
      }

      const data = await response.json();
      const serverConfig = data.config || {
        bot_token: null,
        bot_username: null,
        enabled: false,
        has_token: false,
        poll_interval: 1000,
      };

      // Handle token placeholder - don't overwrite user input
      const newConfig = {
        ...serverConfig,
        bot_token: serverConfig.bot_token === '***configured***' ? null : serverConfig.bot_token,
      };

      setConfig(newConfig);

      // Only update token input if we don't have a current value
      if (!tokenInput && serverConfig.bot_token && serverConfig.bot_token !== '***configured***') {
        setTokenInput(serverConfig.bot_token);
      }
    } catch (error) {
      console.error('Error loading reset bot config:', error);
      toast.error('Failed to load reset bot configuration');
    } finally {
      setLoading(false);
    }
  };

  const refreshResetBotStatus = async () => {
    try {
      const response = await fetch('/admin/api/reset-bot/status', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data.status);
      } else {
        setStatus(null);
      }
    } catch (error) {
      console.error('Error loading reset bot status:', error);
      setStatus(null);
    }
  };

  const saveResetBotConfig = async () => {
    try {
      setSaving(true);

      if (!tokenInput?.trim()) {
        toast.error('Bot token is required');
        return;
      }

      // Basic token format validation
      const trimmedToken = tokenInput.trim();
      if (!trimmedToken.includes(':') || trimmedToken.length < 20) {
        toast.error(
          'Invalid bot token format. Bot tokens should be in the format "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"',
        );
        return;
      }

      if (config.poll_interval < 500 || config.poll_interval > 10000) {
        toast.error('Poll interval must be between 500ms and 10000ms');
        return;
      }

      const configToSend = {
        ...config,
        bot_token: tokenInput.trim(),
        enabled: true, // Always enable when saving configuration
      };

      const response = await fetch('/admin/api/reset-bot/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify(configToSend),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save configuration (${response.status})`);
      }

      toast.success('Reset bot configuration saved successfully');
      setTokenInput(''); // Clear the token input after successful save
      loadResetBotConfig(); // Reload config to get updated has_token value
      refreshResetBotStatus();
    } catch (error: any) {
      console.error('Error saving reset bot config:', error);

      // Provide more specific error messages
      let errorMessage = error.message || 'Failed to save reset bot configuration';

      if (errorMessage.includes('Invalid bot token')) {
        errorMessage = 'Invalid bot token. Please check your token from @BotFather and try again.';
      } else if (errorMessage.includes('timeout')) {
        errorMessage = 'Request timed out. Please check your internet connection and try again.';
      } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      }

      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const startResetBot = async () => {
    try {
      // Step 1: Check if token is set
      if (!config.has_token) {
        toast.error('Please configure and save the bot token first');
        return;
      }

      // Step 2: Validate token before starting
      const testResponse = await fetch('/admin/api/reset-bot/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify({ message: 'test' }),
      });

      if (!testResponse.ok) {
        const testError = await testResponse.json();

        // If token is invalid, remove it from config and show error
        if (
          testError.error &&
          (testError.error.includes('Invalid bot token') ||
            testError.error.includes('not configured'))
        ) {
          // Clear the invalid token from config
          setConfig((prev) => ({ ...prev, bot_token: null, bot_username: null, has_token: false }));
          setTokenInput('');

          toast.error(
            'Invalid bot token detected. Please enter a new token and save the configuration.',
          );
          return;
        }

        throw new Error(testError.error || 'Token validation failed');
      }

      // Step 3: If token is valid, start the bot
      const response = await fetch('/admin/api/reset-bot/start', {
        method: 'POST',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start reset bot');
      }

      toast.success('Reset bot started successfully');
      refreshResetBotStatus();
    } catch (error: any) {
      console.error('Error starting reset bot:', error);
      let errorMessage = error.message || 'Failed to start reset bot';

      if (errorMessage.includes('not configured')) {
        errorMessage = 'Please configure and save the bot token first';
      } else if (errorMessage.includes('not enabled')) {
        errorMessage = 'Please save the bot configuration first';
      }

      toast.error(errorMessage);
    }
  };

  const stopResetBot = async () => {
    try {
      const response = await fetch('/admin/api/reset-bot/stop', {
        method: 'POST',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to stop reset bot');
      }

      toast.success('Reset bot stopped successfully');
      refreshResetBotStatus();
    } catch (error: any) {
      console.error('Error stopping reset bot:', error);
      toast.error(error.message || 'Failed to stop reset bot');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Password Reset Bot Management</h1>
        <Button onClick={refreshResetBotStatus} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Status
        </Button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
            <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {status?.running ? (
                <>
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success">Running</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Stopped</span>
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {config.bot_username ? `@${config.bot_username}` : 'Not configured'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {status?.uptime ? formatUptime(status.uptime) : '0s'}
            </div>
            <div className="text-xs text-muted-foreground">
              Started: {formatDate(status?.startedAt || null)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
            <CardTitle className="text-sm font-medium">Requests Processed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.processed_requests || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{status?.errors || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Bot Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Bot Management
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Configuration Section */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Bot Token *</label>
                <Input
                  type="password"
                  placeholder="Enter bot token from @BotFather"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Bot Username</label>
                <Input placeholder="Auto-detected" value={config.bot_username || ''} disabled />
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={saveResetBotConfig} disabled={saving} className="flex-1">
                {saving ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Configuration'
                )}
              </Button>

              {status?.running ? (
                <Button onClick={stopResetBot} variant="destructive" className="flex-1">
                  <Square className="h-4 w-4 mr-2" />
                  Stop Bot
                </Button>
              ) : (
                <Button
                  onClick={startResetBot}
                  disabled={!config.has_token}
                  className="flex-1"
                  title={
                    !config.has_token
                      ? 'Please configure and save the bot token first'
                      : 'Start the reset bot'
                  }
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Bot
                </Button>
              )}
            </div>
          </div>

          {!config.has_token && (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-md">
              <p className="text-sm text-warning">
                <strong>Note:</strong> Enter a bot token and save the configuration to enable the
                start button.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Information */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">Password Password Reset Bot</h4>
              <p className="text-muted-foreground">
                This bot automatically processes password reset requests sent via Telegram. Users
                can send their username to the bot, and it will generate a new password and send it
                back privately.
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Setup Instructions</h4>
              <ul className="list-disc list-inside flex flex-col gap-1 text-muted-foreground">
                <li>Create a new bot with @BotFather</li>
                <li>Get the bot token and paste it in the configuration</li>
                <li>Save the bot configuration</li>
                <li>Click "Start Bot" to begin processing requests</li>
                <li>Users can now message the bot with their username to reset their password</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Security Notes</h4>
              <ul className="list-disc list-inside flex flex-col gap-1 text-muted-foreground">
                <li>The bot only responds to direct messages, not group messages</li>
                <li>Each user can only reset their password once per hour</li>
                <li>All password reset attempts are logged for security</li>
                <li>The bot requires exact username matches</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
