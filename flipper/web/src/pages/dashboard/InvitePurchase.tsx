import React, { useState } from 'react';
import { postJson } from '../../utils/api';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '../../components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { ExternalLink } from 'lucide-react';

export function InvitePurchase({ onPurchase }: { onPurchase: () => void }) {
  const [count, setCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    invites?: number;
    amount?: number;
    payment_link?: string;
    error?: string;
  } | null>(null);

  async function purchaseInvites() {
    if (count < 1 || count > 50 || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await postJson('/dashboard/api/purchase-invites', { invite_count: count });
      setResult({
        invites: data.invite_count,
        amount: data.amount,
        payment_link: data.payment_link,
      });
      onPurchase();
      // Open payment link automatically if provided
      if (data.payment_link) {
        try {
          window.open(data.payment_link, '_blank', 'noopener,noreferrer');
        } catch (_) {}
      }
    } catch (e: any) {
      setResult({ error: e?.message || 'Failed to create purchase' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          // reset after close animation (~200ms)
          setTimeout(() => {
            setCount(1);
            setResult(null);
            setLoading(false);
          }, 220);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Purchase Invites
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purchase Invites</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="inviteCount">Quantity (1 - 50)</Label>
            <Input
              id="inviteCount"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (isNaN(v)) return;
                setCount(Math.min(50, Math.max(1, v)));
              }}
              className="w-28"
            />
          </div>
          {result && (
            <Alert variant={result.error ? 'destructive' : 'default'}>
              <AlertTitle>{result.error ? 'Error' : 'Payment Created'}</AlertTitle>
              <AlertDescription>
                {result.error ? (
                  <p>{result.error}</p>
                ) : (
                  <div className="flex flex-col gap-1 text-sm">
                    <p>
                      Invites: <span className="font-medium">{result.invites}</span>
                    </p>
                    <p>
                      Amount:{' '}
                      <span className="font-medium">
                        $
                        {typeof result.amount === 'number'
                          ? result.amount.toFixed(2)
                          : parseFloat(result.amount || '0').toFixed(2)}
                      </span>
                    </p>
                    {result.payment_link && (
                      <Button asChild size="sm" variant="outline" className="mt-2 gap-1">
                        <a href={result.payment_link} target="_blank" rel="noopener noreferrer">
                          Open Payment <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            type="button"
            disabled={loading}
            onClick={() => {
              /* Radix handles close via escape / overlay */ const closeBtn =
                document.querySelector('[data-slot=dialog-close]') as HTMLElement | null;
              closeBtn?.click();
            }}
          >
            Close
          </Button>
          <Button onClick={purchaseInvites} disabled={loading}>
            {loading ? 'Processing…' : 'Create Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
