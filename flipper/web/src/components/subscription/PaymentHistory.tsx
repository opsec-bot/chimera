import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  oxapay_track_id?: string;
  payment_link?: string;
}

interface PaymentHistoryProps {
  payments: Payment[];
}

export function PaymentHistory({ payments }: PaymentHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <CreditCard className="h-4 w-4" />
          Payment history
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {payments.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              title="No payment history"
              description="Your payments will appear here once you make your first purchase."
              icon={<CreditCard className="h-10 w-10" />}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-accent/40"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium tabular-nums text-foreground">
                      ${payment.amount}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {payment.currency}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(payment.created_at).toLocaleString()}
                    {payment.oxapay_track_id && (
                      <>
                        <span className="mx-1.5 text-border">·</span>
                        <span className="font-mono">{payment.oxapay_track_id.slice(0, 12)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={payment.status} />
                  {payment.status === 'pending' && payment.payment_link && (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={payment.payment_link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5"
                      >
                        Complete
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
