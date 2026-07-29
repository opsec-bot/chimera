import React from 'react';
import { Badge, badgeVariants } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

interface StatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
  className?: string;
}

function getVariantForStatus(status: string): BadgeVariant {
  if (!status || typeof status !== 'string') return 'outline';
  const s = status.toLowerCase();
  if (['active', 'completed', 'success', 'linked', 'paid'].includes(s)) return 'success';
  if (['pending', 'processing'].includes(s)) return 'warning';
  if (['expired', 'failed', 'error', 'cancelled', 'canceled'].includes(s)) return 'destructive';
  return 'outline';
}

export function StatusBadge({ status, variant, className }: StatusBadgeProps) {
  const finalVariant = variant ?? getVariantForStatus(status);
  return (
    <Badge variant={finalVariant} className={cn('capitalize', className)}>
      {status || 'unknown'}
    </Badge>
  );
}
