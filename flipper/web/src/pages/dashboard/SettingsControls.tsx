import React from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Slider } from '../../components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { TwoFactorAuth } from './TwoFactorAuth';

export function SettingsControls({
  accessKey,
  onRegenerate,
  userId,
  lastLogin,
  telegramLinked,
  telegramUsername,
  onUnlinkTelegram,
  dataNotificationsEnabled,
  onToggleDataNotifications,
  soundVolume,
  onChangeVolume,
  dataCooldown,
  onChangeCooldown,
  onTestDataSound,
  onTestPaymentSound,
  totpEnabled,
  onTotpStatusChange,
  onTotpDialogStateChange,
}: any) {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">User ID</div>
              <div className="font-mono">{userId ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last login</div>
              <div>{lastLogin ? new Date(lastLogin).toLocaleString() : '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Access Key</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="font-mono bg-secondary/10 px-3 py-1 rounded flex-1">
              {accessKey || 'Not loaded'}
            </div>
            <Button onClick={onRegenerate} variant="default" size="sm">
              Regenerate
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Regenerate your access key to stop receving data from previous builds; keep it secret.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
        </CardHeader>
        <CardContent>
          {telegramLinked ? (
            <div className="flex items-center justify-between">
              <div>Linked to @{telegramUsername || 'unknown'}</div>
              <Button onClick={onUnlinkTelegram} variant="destructive" size="sm">
                Unlink
              </Button>
            </div>
          ) : (
            <div>
              <a href="/auth/link-telegram" className="text-primary underline">
                Link Telegram
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <TwoFactorAuth
        isEnabled={totpEnabled}
        onStatusChange={onTotpStatusChange}
        onDialogStateChange={onTotpDialogStateChange}
      />

      <Card>
        <CardHeader>
          <CardTitle>Sound & Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Enable short sounds when new submissions or payments arrive. Use test buttons to
            preview.
          </p>
          <div className="flex items-center gap-2">
            <Switch
              id="data-notifications"
              checked={dataNotificationsEnabled}
              onCheckedChange={onToggleDataNotifications}
            />
            <Label htmlFor="data-notifications">Enable data sounds</Label>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="volume-slider">Volume</Label>
            <Slider
              id="volume-slider"
              min={0}
              max={100}
              step={1}
              value={[soundVolume]}
              onValueChange={([value]) => onChangeVolume(value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cooldown-input">Data cooldown (seconds)</Label>
            <Input
              id="cooldown-input"
              type="number"
              min={0}
              value={dataCooldown}
              onChange={(e) => onChangeCooldown(Number(e.target.value))}
              className="w-32"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={onTestDataSound} variant="default" size="sm">
              Test Data Sound
            </Button>
            <Button onClick={onTestPaymentSound} variant="secondary" size="sm">
              Test Payment Sound
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
