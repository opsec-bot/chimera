import React from 'react';

export function Card({
  title,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-card border border-border rounded-xl p-6 ${className}`}>
      {title && (
        <div className="mb-4">
          {typeof title === 'string' ? <h3 className="text-lg font-semibold">{title}</h3> : title}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}
