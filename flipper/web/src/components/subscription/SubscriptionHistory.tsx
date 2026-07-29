import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History } from 'lucide-react';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';

interface Subscription {
  id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface SubscriptionHistoryProps {
  subscriptions: Subscription[];
}

function formatType(type: string): string {
  const typeMap: Record<string, string> = {
    WEEK: 'Weekly',
    MONTH: 'Monthly',
    THREE_MONTHS: '3 Months',
  };
  return typeMap[type] || type;
}

export function SubscriptionHistory({ subscriptions }: SubscriptionHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <History className="h-4 w-4" />
          Subscription history
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {subscriptions.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              title="No subscription history"
              description="Your subscriptions will appear here once you make your first purchase."
              icon={<History className="h-10 w-10" />}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {subscriptions.map((sub) => (
              <li
                key={sub.id}
                className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-accent/40"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="font-medium text-foreground">{formatType(sub.type)}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {new Date(sub.start_date).toLocaleDateString()} —{' '}
                    {new Date(sub.end_date).toLocaleDateString()}
                  </div>
                </div>
                <StatusBadge status={sub.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
