import React, { useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Search } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

function FilesearchListInner({ list }: { list: any[] }) {
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [unblurredId, setUnblurredId] = useState<number | string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  if (!list || list.length === 0)
    return (
      <EmptyState
        title="No file search results"
        description="File search results will appear here when available."
        icon={<Search className="h-12 w-12" />}
      />
    );

  function copyText(text: string, id: number | string) {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch (e) {
      // ignore
    }
  }

  function formatDate(raw?: string) {
    try {
      if (!raw) return '';
      const d = new Date(String(raw).replace(' ', 'T'));
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString();
    } catch (e) {
      return '';
    }
  }

  // Group by pattern so related hits are shown together
  const groups: [string, any[]][] = Array.from(
    list
      .reduce((m, it) => {
        const key = it.pattern || it.filename || 'Unknown';
        if (!m.has(key)) m.set(key, [] as any[]);
        m.get(key)!.push(it);
        return m;
      }, new Map<string, any[]>())
      .entries(),
  );

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([pattern, items]: [string, any[]]) => {
        const open = !!openGroups[pattern];
        const patternLower = String(pattern || '').toLowerCase();
        const showBalanceForMnemonic = patternLower.includes('mnemonic');

        return (
          <Collapsible
            key={pattern}
            open={open}
            onOpenChange={(val) => setOpenGroups((g) => ({ ...g, [pattern]: val }))}
          >
            <Card className="transition-all">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="font-medium truncate">{pattern}</div>
                    <div className="text-xs text-muted-foreground">{items.length} hits</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        {open ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="bg-secondary/10 p-6 rounded text-sm font-mono leading-7 overflow-auto max-h-[42rem]">
                    {items.map((it: any, idx: number) => {
                      const parsed = (() => {
                        try {
                          return typeof it.data === 'string' ? JSON.parse(it.data) : it.data || {};
                        } catch (e) {
                          return it.data || {};
                        }
                      })();

                      const balance =
                        parsed?.balance ?? parsed?.balance_usd ?? parsed?.balanceUSD ?? null;
                      const balanceDisplay =
                        showBalanceForMnemonic && typeof balance === 'number'
                          ? new Intl.NumberFormat(undefined, {
                              style: 'currency',
                              currency: 'USD',
                            }).format(balance)
                          : '';

                      const line = it.line || it.match || it.value || '';
                      const key = `${pattern}-${it.id ?? idx}`;

                      // For mnemonic groups, hide the last 5 words until hovered
                      const isMnemonicLine = showBalanceForMnemonic;
                      let visiblePart = line;
                      let hiddenPart = '';
                      if (isMnemonicLine) {
                        const words = String(line).split(/\s+/).filter(Boolean);
                        if (words.length > 5) {
                          visiblePart = words.slice(0, words.length - 5).join(' ');
                          hiddenPart = words.slice(words.length - 5).join(' ');
                        } else {
                          visiblePart = '';
                          hiddenPart = words.join(' ');
                        }
                      }

                      return (
                        <div
                          key={key}
                          className={cn(
                            'flex items-start gap-3 py-3',
                            idx < items.length - 1 && 'border-b border-border/30'
                          )}
                        >
                          <div className="flex-1 break-words">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 text-sm">
                                {!isMnemonicLine ? (
                                  line
                                ) : (
                                  <>
                                    <span>
                                      {visiblePart}
                                      {visiblePart ? ' ' : ''}
                                    </span>
                                    <span
                                      onMouseEnter={() => setUnblurredId(key)}
                                      onMouseLeave={() => setUnblurredId(null)}
                                      style={{
                                        filter: unblurredId === key ? 'none' : 'blur(6px)',
                                        transition: 'filter 180ms ease, opacity 180ms ease',
                                        opacity: unblurredId === key ? 1 : 0.85,
                                        WebkitFilter: unblurredId === key ? 'none' : 'blur(6px)',
                                      }}
                                    >
                                      {hiddenPart}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-sm w-36 justify-end">
                                <div className="text-right text-sm w-24 truncate">
                                  {balanceDisplay}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    try {
                                      navigator.clipboard.writeText(line);
                                      setCopiedId(it.id ?? idx);
                                      setTimeout(() => setCopiedId(null), 1200);
                                    } catch (e) {}
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {copiedId && <div className="text-xs text-success mt-2">Copied</div>}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}

export const FilesearchList = React.memo(FilesearchListInner);
