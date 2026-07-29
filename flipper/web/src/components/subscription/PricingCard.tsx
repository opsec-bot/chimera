import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PricingCardProps {
  title: string;
  price: number;
  duration?: number;
  features?: string[];
  isPopular?: boolean;
  onPurchase: () => void;
  disabled?: boolean;
  className?: string;
}

export function PricingCard({
  title,
  price,
  duration,
  features = ['Full access', 'Data collection tools', 'Priority support'],
  isPopular = false,
  onPurchase,
  disabled = false,
  className,
}: PricingCardProps) {
  return (
    <Card
      className={cn(
        'relative transition-colors',
        isPopular ? 'border-foreground/40' : 'hover:border-foreground/20',
        className,
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-muted-foreground">{title}</CardTitle>
          {isPopular && (
            <Badge variant="outline" className="border-foreground/30 text-foreground">
              Popular
            </Badge>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight text-foreground tabular-nums">
            ${price}
          </span>
          {duration && (
            <span className="text-sm text-muted-foreground">/ {duration} days</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <ul className="flex flex-col gap-2.5">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <Button
          onClick={onPurchase}
          disabled={disabled}
          className="w-full"
          variant={isPopular ? 'default' : 'outline'}
        >
          {disabled ? 'Processing…' : 'Purchase'}
        </Button>
      </CardContent>
    </Card>
  );
}
