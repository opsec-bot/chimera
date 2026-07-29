import React from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  fluid?: boolean;
  className?: string;
  actions?: React.ReactNode;
}

export function PageContainer({
  children,
  title,
  description,
  fluid = false,
  className,
  actions,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'w-full py-8',
        fluid ? 'px-4 sm:px-6 lg:px-8' : 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-8',
        className,
      )}
    >
      {(title || description || actions) && (
        <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            {title && (
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
