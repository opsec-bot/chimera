import React from 'react';
import { PageLayout } from '../components/PageLayout';
import { Button } from '../components/ui/button';
import { TriangleAlert, RefreshCcw, Copy } from 'lucide-react';

interface Props {
  code: string;
  timestamp: string;
  errorMessage?: string;
  onRetry: () => void;
}

export function ServerIssue(props: Props) {
  const { code, timestamp, errorMessage, onRetry } = props;
  const [copied, setCopied] = React.useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(`${code} @ ${timestamp}${errorMessage ? `\n${errorMessage}` : ''}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <PageLayout showProfile={false}>
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center flex flex-col gap-6 max-w-lg w-full">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <TriangleAlert className="h-10 w-10 text-destructive" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Server issue</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The backend or proxy appears to be unreachable. Please report this to{' '}
              <span className="font-medium text-foreground">@telehecker</span> on Telegram.
            </p>
          </div>
          <dl className="flex flex-col gap-1 rounded-md border border-border bg-muted/60 p-4 text-left font-mono text-xs">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">code</dt>
              <dd>{code}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">time</dt>
              <dd>{timestamp}</dd>
            </div>
            {errorMessage && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">err</dt>
                <dd className="break-all">{errorMessage}</dd>
              </div>
            )}
          </dl>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={onRetry}>
              <RefreshCcw className="h-4 w-4" /> Retry
            </Button>
            <Button variant="outline" onClick={handleCopy}>
              <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy info'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            If the issue persists, include the error code and timestamp when contacting support.
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
