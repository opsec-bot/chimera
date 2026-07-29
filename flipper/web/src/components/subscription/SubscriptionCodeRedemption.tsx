import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { toast } from 'sonner';
// Removed postJson import since we're using direct fetch for better error handling
import { Gift, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface SubscriptionCodeRedemptionProps {
  onRedemptionSuccess?: () => void;
  disabled?: boolean;
}

export function SubscriptionCodeRedemption({
  onRedemptionSuccess,
  disabled = false,
}: SubscriptionCodeRedemptionProps) {
  const [code, setCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    message: string;
    daysAdded: number;
    newExpirationDate: string;
  } | null>(null);

  const handleRedeemCode = async () => {
    if (!code.trim()) {
      setError('Please enter a subscription code');
      return;
    }

    setIsRedeeming(true);
    setError(null);
    setSuccess(null);

    try {
      // Get CSRF token from global window object (set by auth flow)
      const csrfToken = (window as any).__csrf || '';

      const response = await fetch('/subscription-codes/redeem', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          code: code.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        const successData = {
          message: data.message || 'Code redeemed successfully!',
          daysAdded: data.daysAdded || 0,
          newExpirationDate: data.newExpirationDate || '',
        };

        setSuccess(successData);
        setCode(''); // Clear the input
        toast.success(`Success! ${successData.daysAdded} days added to your subscription.`);

        // Call the callback to refresh subscription data
        if (onRedemptionSuccess) {
          onRedemptionSuccess();
        }
      } else {
        // Handle both backend validation errors and HTTP errors
        const errorMessage =
          data.message || data.error || `Request failed (HTTP ${response.status})`;
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } catch (err: any) {
      const errorMessage = 'Network error or failed to process request';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isRedeeming && !disabled) {
      handleRedeemCode();
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <Gift className="h-4 w-4" />
          Redeem code
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Have a subscription code? Enter it below to extend your subscription.
        </p>

        {success && (
          <Alert variant="success">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Code redeemed</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-0.5 text-sm">
                <p>{success.message}</p>
                {success.daysAdded > 0 && (
                  <p>
                    <Clock className="mr-1 inline h-3.5 w-3.5" />
                    {success.daysAdded} days added
                  </p>
                )}
                {success.newExpirationDate && (
                  <p className="text-xs">New expiration: {formatDate(success.newExpirationDate)}</p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Redemption failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="subscription-code" className="text-xs font-medium text-muted-foreground">
            Subscription code
          </Label>
          <div className="flex gap-2">
            <Input
              id="subscription-code"
              type="text"
              placeholder="XXXX-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isRedeeming || disabled}
              className="font-mono"
              autoComplete="off"
            />
            <Button
              onClick={handleRedeemCode}
              disabled={!code.trim() || isRedeeming || disabled}
              variant="outline"
            >
              {isRedeeming ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Redeeming
                </>
              ) : (
                'Redeem'
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Codes are case-sensitive and single-use. Some may have eligibility restrictions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
