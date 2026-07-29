import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { toast } from 'sonner';
import { getJson, postJson } from '../../utils/api';
import { Shield, Copy, CheckCircle, AlertTriangle, QrCode, Smartphone } from 'lucide-react';

interface TOTPSetupData {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
  manualEntryKey: string;
}

interface TwoFactorAuthProps {
  isEnabled: boolean;
  onStatusChange: (enabled: boolean) => void;
  onDialogStateChange?: (isOpen: boolean) => void;
}

export function TwoFactorAuth({
  isEnabled,
  onStatusChange,
  onDialogStateChange,
}: TwoFactorAuthProps) {
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [setupData, setSetupData] = useState<TOTPSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupStep, setSetupStep] = useState<'qr' | 'verify' | 'backup'>('qr');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    toast[type](message);
  };

  const handleSetupStart = async () => {
    setLoading(true);
    try {
      const response = await postJson('/auth/totp/setup', {});
      setSetupData(response);
      setShowSetupDialog(true);
      onDialogStateChange?.(true);
      setSetupStep('qr');
    } catch (error: any) {
      showToast(error.message || 'Failed to start 2FA setup', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async () => {
    if (!verificationCode.trim()) {
      showToast('Please enter the 6-digit code', 'error');
      return;
    }

    setLoading(true);
    try {
      await postJson('/auth/totp/verify', { token: verificationCode });
      showToast('Two-factor authentication enabled successfully!');
      setSetupStep('backup');
      onStatusChange(true);
    } catch (error: any) {
      showToast(error.message || 'Invalid verification code', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!disableCode.trim()) {
      showToast('Please enter the 6-digit code', 'error');
      return;
    }

    setLoading(true);
    try {
      await postJson('/auth/totp/disable', { token: disableCode });
      showToast('Two-factor authentication disabled');
      setShowDisableDialog(false);
      setDisableCode('');
      onStatusChange(false);
      onDialogStateChange?.(false);
    } catch (error: any) {
      showToast(error.message || 'Invalid verification code', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'secret' | 'backup', index?: number) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'secret') {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } else {
        setCopiedBackup(index || 0);
        setTimeout(() => setCopiedBackup(null), 2000);
      }
      showToast('Copied to clipboard');
    } catch (error) {
      showToast('Failed to copy to clipboard', 'error');
    }
  };

  const resetDialogs = () => {
    setShowSetupDialog(false);
    setShowDisableDialog(false);
    setSetupData(null);
    setVerificationCode('');
    setDisableCode('');
    setSetupStep('qr');
    setCopiedSecret(false);
    setCopiedBackup(null);
    onDialogStateChange?.(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">
                  Status:
                  <Badge variant={isEnabled ? 'default' : 'secondary'} className="ml-2">
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Add an extra layer of security to your account with time-based authentication
                  codes
                </div>
              </div>
              <div className="flex gap-2">
                {!isEnabled ? (
                  <Button onClick={handleSetupStart} disabled={loading}>
                    Enable 2FA
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setShowDisableDialog(true);
                      onDialogStateChange?.(true);
                    }}
                    disabled={loading}
                  >
                    Disable 2FA
                  </Button>
                )}
              </div>
            </div>

            {isEnabled && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Two-factor authentication is active. You'll need to provide a 6-digit code from
                  your authenticator app when logging in.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Setup Dialog */}
      <Dialog open={showSetupDialog} onOpenChange={(open) => !open && resetDialogs()}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Set up Two-Factor Authentication</DialogTitle>
          </DialogHeader>

          <Tabs value={setupStep} onValueChange={() => {}} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="qr" disabled>
                Scan QR
              </TabsTrigger>
              <TabsTrigger value="verify" disabled>
                Verify
              </TabsTrigger>
              <TabsTrigger value="backup" disabled>
                Backup Codes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="qr" className="flex flex-col gap-4 mt-4">
              {setupData && (
                <>
                  <div className="text-center flex flex-col gap-4">
                    <div>
                      <div className="text-sm font-medium mb-2">
                        Scan this QR code with your authenticator app:
                      </div>
                      <div className="flex justify-center">
                        <img
                          src={setupData.qrCodeUrl}
                          alt="2FA QR Code"
                          className="border rounded"
                        />
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Recommended apps: Google Authenticator, Authy, 1Password
                    </div>

                    <div className="border-t pt-4">
                      <div className="text-sm font-medium mb-2">Or enter this key manually:</div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={setupData.manualEntryKey}
                          readOnly
                          className="font-mono text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(setupData.secret, 'secret')}
                        >
                          {copiedSecret ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full" onClick={() => setSetupStep('verify')}>
                    Continue to Verification
                  </Button>
                </>
              )}
            </TabsContent>

            <TabsContent value="verify" className="flex flex-col gap-4 mt-4">
              <div className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="verification-code">Enter the 6-digit code from your app:</Label>
                  <Input
                    id="verification-code"
                    type="text"
                    placeholder="123456"
                    value={verificationCode}
                    onChange={(e) =>
                      setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="text-center text-lg tracking-widest font-mono"
                    maxLength={6}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSetupStep('qr')} className="flex-1">
                    Back
                  </Button>
                  <Button
                    onClick={handleVerifySetup}
                    disabled={loading || verificationCode.length !== 6}
                    className="flex-1"
                  >
                    Verify & Enable
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="backup" className="flex flex-col gap-4 mt-4">
              <div className="flex flex-col gap-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Save these backup codes in a safe place. You can use them to access your account
                    if you lose your phone.
                  </AlertDescription>
                </Alert>

                <div className="flex flex-col gap-2">
                  <Label>Backup Codes:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {setupData?.backupCodes.map((code, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input value={code} readOnly className="font-mono text-xs" />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(code, 'backup', index)}
                        >
                          {copiedBackup === index ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button className="w-full" onClick={resetDialogs}>
                  Complete Setup
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Disable Dialog */}
      <Dialog
        open={showDisableDialog}
        onOpenChange={(open) => {
          setShowDisableDialog(open);
          if (!open) {
            onDialogStateChange?.(false);
          }
        }}
      >
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will remove the extra security layer from your account. You'll only need your
                password to log in.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <Label htmlFor="disable-code">Enter your current 6-digit code to confirm:</Label>
              <Input
                id="disable-code"
                type="text"
                placeholder="123456"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-lg tracking-widest font-mono"
                maxLength={6}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDisableDialog(false);
                  onDialogStateChange?.(false);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDisable}
                disabled={loading || disableCode.length !== 6}
                className="flex-1"
              >
                Disable 2FA
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
