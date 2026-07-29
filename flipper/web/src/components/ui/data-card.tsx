import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataCardProps {
  title: React.ReactNode;
  data: any;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
  defaultExpanded?: boolean;
}

export const DataCard = React.memo(function DataCard({
  title,
  data,
  badge,
  badgeVariant = 'secondary',
  className,
  defaultExpanded = false,
}: DataCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <Card className={cn('transition-all duration-200', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base font-medium">{title}</CardTitle>
          </div>

          <div className="flex items-center gap-2 ml-4">
            {badge && (
              <Badge variant={badgeVariant} className="text-xs">
                {badge}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8 px-2">
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 px-2"
              aria-expanded={isExpanded}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0">
          <pre className="text-xs bg-secondary/20 p-3 rounded-md overflow-auto max-h-64 text-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        </CardContent>
      )}
    </Card>
  );
});

// give it a display name for easier profiling
DataCard.displayName = 'DataCard';
