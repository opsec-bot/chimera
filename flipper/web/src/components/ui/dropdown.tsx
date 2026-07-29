import * as React from 'react';

export function Dropdown({
  children,
  align = 'right',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <details className={`relative ${className}`}>
      <summary className="list-none cursor-pointer">{children}</summary>
      <div
        className={`absolute mt-2 ${align === 'right' ? 'right-0' : 'left-0'} bg-card border border-border rounded-lg shadow p-2 z-50`}
      >
        {/* content should be slotted by consumer */}
      </div>
    </details>
  );
}

export default Dropdown;
