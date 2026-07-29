import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  MessageSquare,
  Settings,
  Send,
  CheckCircle,
  XCircle,
  RefreshCw,
  TestTube,
  DollarSign,
  Users,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

interface TelegramConfig {
  bot_token: string | null;
  channel_id: string | null;
  high_balance_threshold: number;
  enabled: boolean;
}

interface TelegramStats {
  total_notifications_sent: number;
  last_notification_sent: string | null;
  bot_username: string | null;
  channel_info: {
    title: string;
    member_count: number;
  } | null;
}

export function TelegramConfiguration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<TelegramConfig>({
    bot_token: null,
    channel_id: null,
    high_balance_threshold: 1000,
    enabled: false,
  });
  const [stats, setStats] = useState<TelegramStats | null>(null);
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    loadTelegramConfig();
    loadTelegramStats();
  }, []);

  const loadTelegramConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/admin/api/telegram/config', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load Telegram configuration');
      }

      const data = await response.json();
      setConfig(
        data.config || {
          bot_token: null,
          channel_id: null,
          high_balance_threshold: 1000,
          enabled: false,
        },
      );
    } catch (error) {
      console.error('Error loading Telegram config:', error);
      toast.error('Failed to load Telegram configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadTelegramStats = async () => {
    try {
      const response = await fetch('/admin/api/telegram/stats', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading Telegram stats:', error);
    }
  };

  const saveTelegramConfig = async () => {
    try {
      setSaving(true);

      if (!config.bot_token?.trim()) {
        toast.error('Bot token is required');
        return;
      }

      if (!config.channel_id?.trim()) {
        toast.error('Channel ID is required');
        return;
      }

      if (config.high_balance_threshold < 0) {
        toast.error('High balance threshold must be a positive number');
        return;
      }

      const response = await fetch('/admin/api/telegram/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save configuration');
      }

      toast.success('Telegram configuration saved successfully');
      loadTelegramStats(); // Reload stats after saving
    } catch (error: any) {
      console.error('Error saving Telegram config:', error);
      toast.error(error.message || 'Failed to save Telegram configuration');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    try {
      setTesting(true);

      if (!config.bot_token?.trim()) {
        toast.error('Please enter a bot token first');
        return;
      }

      const response = await fetch('/admin/api/telegram/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify({ bot_token: config.bot_token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Connection test failed');
      }

      if (data.success) {
        toast.success(`✅ Connection successful! Bot: @${data.bot_username}`);
        loadTelegramStats(); // Reload stats after successful test
      } else {
        toast.error(`❌ Connection failed: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error testing connection:', error);
      toast.error(error.message || '❌ Network error during connection test');
    } finally {
      setTesting(false);
    }
  };

  const sendTestMessage = async () => {
    try {
      setTesting(true);

      const message = testMessage.trim() || 'This is a test message from the admin panel.';

      const response = await fetch('/admin/api/telegram/test-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send test message');
      }

      if (data.success) {
        toast.success('✅ Test message sent successfully!');
        setTestMessage('');
        loadTelegramStats(); // Reload stats after sending message
      } else {
        toast.error(`❌ Failed to send message: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error sending test message:', error);
      toast.error(error.message || '❌ Network error during test message');
    } finally {
      setTesting(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
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
        <h1 className="text-2xl font-bold">Telegram Configuration</h1>
        <Button onClick={loadTelegramConfig} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {stats.bot_username ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span className="text-sm">@{stats.bot_username}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm">Not configured</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">Channel Info</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {stats.channel_info ? (
                  <>
                    <div className="font-medium">{stats.channel_info.title}</div>
                    <div className="text-muted-foreground">
                      {stats.channel_info.member_count} members
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground">No channel info</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_notifications_sent}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Message</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm">{formatDate(stats.last_notification_sent)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Bot Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Bot Token *</label>
                <Input
                  type="password"
                  placeholder="Enter bot token from @BotFather"
                  value={config.bot_token || ''}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, bot_token: e.target.value || null }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Get this from @BotFather on Telegram
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Channel ID *</label>
                <Input
                  placeholder="e.g., -1001234567890"
                  value={config.channel_id || ''}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, channel_id: e.target.value || null }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Channel ID (starts with -100 for supergroups)
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">High Balance Threshold</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="1000"
                    value={config.high_balance_threshold}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        high_balance_threshold: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum balance to trigger high-value notifications
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Connection Test</label>
                <Button
                  onClick={testConnection}
                  disabled={testing || !config.bot_token?.trim()}
                  className="w-full"
                  variant="outline"
                >
                  {testing ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <TestTube className="h-4 w-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Test Message</label>
                <Textarea
                  placeholder="Enter a test message (optional)"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                />
                <Button
                  onClick={sendTestMessage}
                  disabled={testing || !config.bot_token?.trim() || !config.channel_id?.trim()}
                  className="w-full"
                  variant="outline"
                >
                  {testing ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Test Message
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">Enable Notifications</h3>
                <p className="text-xs text-muted-foreground">
                  Enable automatic Telegram notifications for high-value submissions
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-info/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
              </label>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button onClick={saveTelegramConfig} disabled={saving} className="flex-1">
              {saving ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">1. Create a Telegram Bot</h4>
              <ul className="list-disc list-inside flex flex-col gap-1 text-muted-foreground">
                <li>Message @BotFather on Telegram</li>
                <li>Send /newbot and follow the instructions</li>
                <li>Copy the bot token and paste it above</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">2. Get Channel ID</h4>
              <ul className="list-disc list-inside flex flex-col gap-1 text-muted-foreground">
                <li>Add your bot to the channel as an administrator</li>
                <li>Forward a message from the channel to @userinfobot</li>
                <li>Copy the channel ID (starts with -100)</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">3. Test Configuration</h4>
              <ul className="list-disc list-inside flex flex-col gap-1 text-muted-foreground">
                <li>Use the "Test Connection" button to verify bot token</li>
                <li>Use "Send Test Message" to verify channel access</li>
                <li>Enable notifications once everything is working</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
