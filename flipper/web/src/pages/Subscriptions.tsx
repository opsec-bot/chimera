import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJson, postJson } from '../utils/api';
import { PageLayout } from '../components/PageLayout';
import { SubscriptionStatus } from '../components/subscription/SubscriptionStatus';
import { SubscriptionCodeRedemption } from '../components/subscription/SubscriptionCodeRedemption';
import { PricingCard } from '../components/subscription/PricingCard';
import { SubscriptionHistory } from '../components/subscription/SubscriptionHistory';
import { PaymentHistory } from '../components/subscription/PaymentHistory';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { checkPendingPaymentsAndReturnTrack } from './dashboard/payments';
import { startLiveUpdates } from './dashboard/liveUpdates';
// Import sound notifications to ensure it's available
import '../lib/soundNotifications';

type Tier = {
  type: string;
  price_usd: number;
  duration_days?: number;
};

type Subscription = {
  id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: string;
};

function formatType(t: string) {
  if (t === 'WEEK') return 'Weekly';
  if (t === 'MONTH') return 'Monthly';
  if (t === 'THREE_MONTHS') return '3 Months';
  return t;
}

export function Subscriptions() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [history, setHistory] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Payment polling (reuse dashboard logic)
  const paymentPollRef = useRef<number | null>(null);

  // Live updates (reuse dashboard logic)
  const liveControllerRef = useRef<any | null>(null);

  // Sound notification helper (reuse dashboard logic)
  function playDataSoundIfAllowed(kind: 'dataReceived' | 'paymentSuccess') {
    try {
      if (kind === 'paymentSuccess') {
        if (typeof window !== 'undefined' && (window as any).soundNotifications) {
          const soundNotifications = (window as any).soundNotifications;
          if (soundNotifications.playPaymentSuccess) {
            soundNotifications.playPaymentSuccess();
          }
        }
      }
    } catch (e) {
      console.error('Error playing sound notification:', e);
    }
  }

  // Payment validation helper to eliminate duplication
  const validatePayment = (payment: any) => ({
    ...payment,
    status: payment.status || 'unknown',
    currency: payment.currency || 'USD',
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // Fetch auth/me first. If this fails, user is unauthenticated and we should redirect to /auth.
        let me;
        try {
          me = await getJson('/auth/me');
        } catch (authErr: any) {
          console.error('auth/me failed', authErr);
          window.location.href = '/auth';
          return;
        }
        if (me?.csrfToken) (window as any).__csrf = me.csrfToken;

        // Fetch other subscription-related endpoints. Failures here shouldn't force an auth redirect.
        try {
          const [s, t, h, p] = await Promise.all([
            getJson('/subscription/status'),
            getJson('/subscription/tiers'),
            getJson('/subscription/history'),
            getJson('/payment/history'),
          ]);
          if (!mounted) return;
          setStatus(s);
          setTiers(t.tiers || []);
          setHistory(h.subscriptions || []);

          setPayments((p.payments || []).map(validatePayment));

          // Check for pending payments and start polling (reuse dashboard logic)
          const trackId = await checkPendingPaymentsAndReturnTrack();
          if (trackId) {
            startPaymentStatusPolling(trackId);
          }

          // Start live updates for real-time payment notifications (reuse dashboard logic)
          try {
            liveControllerRef.current = startLiveUpdates({
              url: '/dashboard/api/live-updates',
              onAddSubmissions(items: any[]) {
                // We don't handle submissions on subscriptions page
              },
              onAddPayments(items: any[]) {
                try {
                  // Filter and validate payment items
                  const validPayments = items
                    .filter((item) => item?.id && item.amount !== undefined && item.status)
                    .map(validatePayment);

                  setPayments((p) => [...validPayments, ...p]);
                  // Note: Subscription data refresh is handled by the polling system when payments complete
                  // This avoids duplicate API calls and ensures proper timing
                } catch (e) {
                  console.error('Error in onAddPayments:', e);
                }
              },
              onNotification(payload: any) {
                // Handle notifications if needed
              },
              showToast(message: string, type?: any) {
                const toastMap: Record<string, Function> = {
                  success: toast.success,
                  error: toast.error,
                  warning: toast.warning,
                  default: toast.info,
                };
                (toastMap[type] || toastMap.default)(message);
              },
              playDataSoundIfAllowed(kind: any) {
                try {
                  // Only play data received sounds, not payment success sounds
                  // Payment success sounds are handled by the polling system for better timing
                  if (kind === 'dataReceived') {
                    playDataSoundIfAllowed(kind);
                  }
                } catch (e) {
                  console.error('Error playing sound:', e);
                }
              },
              setLiveIndicator(count: number, visible: boolean) {
                // Not used on subscriptions page
              },
            });
          } catch (e) {
            console.error('Failed to start live updates:', e);
          }
        } catch (apiErr: any) {
          console.warn('subscription related endpoints failed', apiErr);
          setError(apiErr?.message || 'Failed to load subscription data');
        }
      } catch (e: any) {
        console.error('subscriptions load', e);
        setError(e?.message || 'Failed to load subscriptions');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      // Cleanup payment polling on unmount
      if (paymentPollRef.current) {
        window.clearInterval(paymentPollRef.current);
        paymentPollRef.current = null;
      }
      // Cleanup live updates on unmount
      if (liveControllerRef.current && liveControllerRef.current.close) {
        liveControllerRef.current.close();
        liveControllerRef.current = null;
      }
    };
  }, []);

  // Extracted subscription data refresh to eliminate duplication.
  // Returns the freshly-fetched status so callers can act on it without waiting
  // for the setState to settle.
  const refreshSubscriptionData = async () => {
    try {
      const [s, h] = await Promise.all([
        getJson('/subscription/status'),
        getJson('/subscription/history'),
      ]);
      setStatus(s);
      setHistory(h.subscriptions || []);
      return s;
    } catch (e) {
      console.error('Error refreshing subscription data:', e);
      return null;
    }
  };

  // Full refresh (used only in fallback scenarios)
  const refreshAll = async () => {
    try {
      const [s, h, p] = await Promise.all([
        getJson('/subscription/status'),
        getJson('/subscription/history'),
        getJson('/payment/history'),
      ]);
      setStatus(s);
      setHistory(h.subscriptions || []);
      setPayments(p.payments || []);
    } catch (e) {
      console.error('Error in refreshAll:', e);
    }
  };

  // Reuse dashboard's payment polling logic
  function startPaymentStatusPolling(trackId: string) {
    try {
      // clear existing poller
      if (paymentPollRef.current) {
        window.clearInterval(paymentPollRef.current);
        paymentPollRef.current = null;
      }

      const check = async () => {
        try {
          const res = await getJson(`/dashboard/api/payment-status/${encodeURIComponent(trackId)}`);
          if (!res) return;

          // Extract status from the response - handle both possible structures
          const paymentStatus = res.status || res.payment?.status;
          if (!paymentStatus) return;

          // Update the payment status in Payment History immediately
          setPayments((prevPayments) => {
            return prevPayments.map((payment) => {
              // Check multiple track ID field possibilities
              const trackIds = [payment.oxapay_track_id, payment.track_id, payment.trackId];
              const matches = trackIds.some(
                (id) => id === trackId || String(id) === String(trackId),
              );

              if (matches) {
                return { ...payment, status: paymentStatus };
              }
              return payment;
            });
          });

          if (paymentStatus === 'paid') {
            if (paymentPollRef.current) {
              window.clearInterval(paymentPollRef.current);
              paymentPollRef.current = null;
            }
            toast.success('Payment completed! Your subscription is now active.');
            playDataSoundIfAllowed('paymentSuccess');
            refreshSubscriptionData();
          } else if (paymentStatus === 'failed') {
            if (paymentPollRef.current) {
              window.clearInterval(paymentPollRef.current);
              paymentPollRef.current = null;
            }
            console.warn('Payment failed for trackId:', trackId);
            toast.error('Payment failed');
            refreshSubscriptionData();
          }
        } catch (e) {
          console.error('Error checking payment status:', e);
        }
      };

      // run immediately then every 5s (same as dashboard)
      check();
      paymentPollRef.current = window.setInterval(check, 5000);
    } catch (e) {
      console.error('Failed to start payment poller', e);
    }
  }

  // Create payment for subscription purchase (handles both new subscriptions and extensions automatically)
  async function purchaseSubscription(tierType: string) {
    setBusy(true);

    try {
      const r = await postJson('/subscription/purchase', { subscription_type: tierType });

      // Extract track ID. Backend should return `track_id` (snake_case per CLAUDE.md);
      // we still accept `trackId` as a transitional fallback while older endpoints exist.
      const trackId = r.track_id ?? r.trackId;
      const newPayment = {
        id: r.payment_id?.toString() || `temp_${Date.now()}`,
        amount: r.amount || 0,
        currency: 'USD',
        status: 'pending',
        created_at: new Date().toISOString(),
        oxapay_track_id: trackId,
        track_id: trackId,
        payment_link: r.payment_link,
      };

      // Add to payment history and open payment link
      setPayments((prev) => [newPayment, ...prev]);
      if (r.payment_link) {
        window.open(r.payment_link, '_blank');
      } else {
        console.warn('No payment_link in purchase response');
      }

      // Start polling or fallback
      if (trackId) {
        startPaymentStatusPolling(String(trackId));
        toast.success("Payment created. We'll notify you when payment is confirmed.");
      } else {
        console.warn('No trackId found in purchase response');
        setTimeout(refreshAll, 1500);
        toast.success('Payment created successfully.');
      }
    } catch (e: any) {
      console.error('Purchase failed:', e.message || e);
      toast.error(e?.message || 'Purchase failed. Please try again.');
      setError(e?.message || 'Purchase failed');
    } finally {
      setBusy(false);
    }
  }
  if (loading) {
    return (
      <PageLayout showProfile={false}>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout showProfile={false}>
        <div className="flex items-center justify-center py-12 px-4">
          <div className="max-w-md w-full flex flex-col gap-4">
            <Alert variant="destructive">
              <AlertTitle>Subscription Load Failed</AlertTitle>
              <AlertDescription>
                <p className="mb-2">{error}</p>
                <Button size="sm" onClick={() => window.location.reload()}>
                  Reload Page
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </PageLayout>
    );
  }

  const hasActive = Boolean(status?.has_active_subscription ?? status?.hasActiveSubscription);

  return (
    <PageLayout
      showProfile={false}
      actions={
        hasActive ? (
          <Button onClick={() => navigate('/dashboard')} size="sm" variant="outline">
            Back to dashboard
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Manage your subscription, redeem codes, and review payment history.
          </p>
        </header>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <SubscriptionStatus
          hasActiveSubscription={hasActive}
          subscription={status?.subscription}
          onChoosePlan={() =>
            document
              .getElementById('plans')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          isLoading={busy}
        />

        <SubscriptionCodeRedemption onRedemptionSuccess={refreshSubscriptionData} disabled={busy} />

        <section id="plans" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-foreground">Plans</h2>
            <p className="text-xs text-muted-foreground">
              Invoices expire 1 hour after creation. If a payment expires, just create a new one.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {tiers.map((tier) => (
              <PricingCard
                key={tier.type}
                title={formatType(tier.type)}
                price={tier.price_usd}
                duration={tier.duration_days}
                onPurchase={() => purchaseSubscription(tier.type)}
                disabled={busy}
                isPopular={tier.type === 'MONTH'}
              />
            ))}
          </div>
        </section>

        <SubscriptionHistory subscriptions={Array.isArray(history) ? history : []} />

        <PaymentHistory payments={Array.isArray(payments) ? payments : []} />
      </div>
    </PageLayout>
  );
}
