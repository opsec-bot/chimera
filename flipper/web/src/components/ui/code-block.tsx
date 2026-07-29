import * as React from 'react';
import { Button } from './button';
import { Copy } from 'lucide-react';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
  copyText?: string;
  enableCopy?: boolean;
}

export function CodeBlock({
  children,
  className = '',
  copyText,
  enableCopy = false,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  function onCopy() {
    if (!enableCopy) return;
    try {
      navigator.clipboard.writeText(
        typeof copyText === 'string'
          ? copyText
          : ((typeof children === 'string' ? children : '') as string),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (_) {}
  }
  return (
    <div className={`relative group font-mono text-xs md:text-sm ${className}`}>
      <pre className="bg-secondary/10 p-3 rounded overflow-auto leading-relaxed whitespace-pre-wrap">
        {children}
      </pre>
      {enableCopy && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onCopy}
          aria-label="Copy code"
          className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Copy className="h-3 w-3" />
        </Button>
      )}
      {copied && <div className="absolute top-2 right-10 text-xs text-success">Copied</div>}
    </div>
  );
}
