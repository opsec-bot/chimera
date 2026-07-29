import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield } from 'lucide-react';

interface TotpFormProps {
  totpCode: string;
  onTotpChange: (code: string) => void;
  backupCode: string;
  onBackupCodeChange: (code: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  message?: string | null;
  isLoading?: boolean;
  backupCodesAvailable?: number;
}

export function TotpForm({
  totpCode,
  onTotpChange,
  backupCode,
  onBackupCodeChange,
  onSubmit,
  onBack,
  message,
  isLoading = false,
  backupCodesAvailable = 0,
}: TotpFormProps) {
  const [useBackupCode, setUseBackupCode] = useState(false);
  const isSuccessMessage = !!message && /success/i.test(message);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-border bg-background">
            <Shield className="size-4 text-foreground" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Two-factor authentication
            </h1>
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit code from your authenticator
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {message && (
          <Alert variant={isSuccessMessage ? 'success' : 'destructive'}>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {!useBackupCode ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="totpCode" className="text-xs font-medium text-muted-foreground">
                Authentication code
              </Label>
              <Input
                id="totpCode"
                type="text"
                inputMode="numeric"
                placeholder="123456"
                value={totpCode}
                onChange={(e) => onTotpChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center font-mono text-lg tracking-[0.4em]"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                disabled={isLoading}
                required={!useBackupCode}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="backupCode" className="text-xs font-medium text-muted-foreground">
                Backup code
              </Label>
              <Input
                id="backupCode"
                type="text"
                placeholder="AB-CD-EF-GH"
                value={backupCode}
                onChange={(e) => {
                  const cleaned = e.target.value.toUpperCase().replace(/[^0-9A-F-]/g, '');
                  onBackupCodeChange(cleaned.slice(0, 11));
                }}
                className="text-center font-mono text-lg tracking-widest"
                maxLength={11}
                autoComplete="off"
                autoFocus
                disabled={isLoading}
                required={useBackupCode}
              />
              <p className="text-xs text-muted-foreground">
                {backupCodesAvailable} backup code{backupCodesAvailable === 1 ? '' : 's'} remaining
              </p>
            </div>
          )}

          {backupCodesAvailable > 0 && (
            <button
              type="button"
              onClick={() => setUseBackupCode(!useBackupCode)}
              className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              disabled={isLoading}
            >
              {useBackupCode ? 'Use authenticator app instead' : 'Use backup code instead'}
            </button>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isLoading}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading ||
                (!useBackupCode && totpCode.length !== 6) ||
                (useBackupCode && backupCode.length !== 11)
              }
              className="flex-1"
            >
              {isLoading ? 'Verifying…' : useBackupCode ? 'Use backup code' : 'Verify code'}
            </Button>
          </div>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Lost access to your authenticator? Contact support for assistance.
        </p>
      </CardContent>
    </Card>
  );
}
