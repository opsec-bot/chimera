import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: 1 | 2 | 3;
  telegramUsername: string;
  onTelegramUsernameChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  newPassword: string;
  onNewPasswordChange: (value: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  onRequestCode: () => void;
  onVerifyCode: () => void;
  onResetPassword: () => void;
  onBackToStep1: () => void;
  message?: { text: string; type: 'info' | 'error' | 'success' } | null;
  isLoading?: boolean;
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  step,
  telegramUsername,
  onTelegramUsernameChange,
  code,
  onCodeChange,
  newPassword,
  onNewPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  onRequestCode,
  onVerifyCode,
  onResetPassword,
  onBackToStep1,
  message,
  isLoading = false,
}: ForgotPasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            {step === 1 ? 'Reset password' : 'Enter code & new password'}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {step === 1
              ? "Enter your Telegram username or ID linked to the account. We'll send a reset code via the bot."
              : 'Enter the 6-digit code from the Telegram bot, then set your new password.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {step === 1 ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fpTelegramUsername" className="text-xs font-medium text-muted-foreground">
                  Telegram username or ID
                </Label>
                <Input
                  id="fpTelegramUsername"
                  value={telegramUsername}
                  onChange={(e) => onTelegramUsernameChange(e.target.value)}
                  placeholder="@username or 123456789"
                  disabled={isLoading}
                />
              </div>
              <Button onClick={onRequestCode} className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending…' : 'Send code'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Make sure you've started the bot so it can DM you.
              </p>
            </>
          ) : (
            <>
              {step === 2 && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpCode" className="text-xs font-medium text-muted-foreground">
                      6-digit code
                    </Label>
                    <div className="flex justify-center">
                      <div className="flex gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <input
                            key={i}
                            inputMode="numeric"
                            maxLength={1}
                            className="size-10 rounded-md border border-border bg-input text-center font-mono text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                            value={code?.[i] ?? ''}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 1);
                              const next = (code || '').padEnd(6, ' ').split('');
                              next[i] = v;
                              const joined = next.join('').trimEnd();
                              onCodeChange(joined);
                              // focus next field if typed
                              if (v && i < 5) {
                                const nextEl = (e.target as HTMLElement)
                                  .nextElementSibling as HTMLElement | null;
                                nextEl?.focus();
                              }
                            }}
                            disabled={isLoading}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={onBackToStep1}
                      disabled={isLoading}
                    >
                      Back
                    </Button>
                    <Button onClick={onVerifyCode} disabled={isLoading} className="flex-1">
                      Verify code
                    </Button>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpNewPassword" className="text-xs font-medium text-muted-foreground">
                      New password
                    </Label>
                    <Input
                      id="fpNewPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => onNewPasswordChange(e.target.value)}
                      placeholder="New password"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpConfirmPassword" className="text-xs font-medium text-muted-foreground">
                      Confirm password
                    </Label>
                    <Input
                      id="fpConfirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => onConfirmPasswordChange(e.target.value)}
                      placeholder="Confirm password"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={onBackToStep1} disabled={isLoading}>
                      Back
                    </Button>
                    <Button onClick={onResetPassword} className="flex-1" disabled={isLoading}>
                      {isLoading ? 'Resetting…' : 'Reset password'}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {message && (
            <Alert
              variant={
                message.type === 'error'
                  ? 'destructive'
                  : message.type === 'success'
                    ? 'success'
                    : 'info'
              }
            >
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
