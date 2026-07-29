import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CreditCard } from 'lucide-react';
import { StatusBadge } from '@/components/common/StatusBadge';

interface SubscriptionStatusProps {
  hasActiveSubscription: boolean;
  subscription?: {
    type: string;
    end_date: string;
    status: string;
  };
  onChoosePlan?: () => void;
  isLoading?: boolean;
}

function formatType(type: string): string {
  const typeMap: Record<string, string> = {
    WEEK: 'Weekly',
    MONTH: 'Monthly',
    THREE_MONTHS: '3 Months',
  };
  return typeMap[type] || type;
}

export function SubscriptionStatus({
  hasActiveSubscription,
  subscription,
  onChoosePlan,
}: SubscriptionStatusProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <CreditCard className="h-4 w-4" />
          Current subscription
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasActiveSubscription ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <div className="text-lg font-semibold text-foreground">No active subscription</div>
              <div className="text-sm text-muted-foreground">
                Purchase a plan to unlock premium features.
              </div>
            </div>
            <Button onClick={onChoosePlan}>Choose plan</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold text-foreground">
                  {subscription ? formatType(subscription.type) : 'Admin access'}
                </span>
                {subscription ? (
                  <StatusBadge status={subscription.status} />
                ) : (
                  <Badge variant="outline">Admin</Badge>
                )}
              </div>
              {subscription ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Expires {new Date(subscription.end_date).toLocaleDateString()}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Full access via admin privileges</div>
              )}
            </div>
            <Button onClick={onChoosePlan} variant="outline" size="sm">
              View plans
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
