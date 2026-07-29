import React, { useMemo, useState, useEffect } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Wallet, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// WalletsList: left-side viewer (full phrases, no inner scroll) + right-side compact list
export function WalletsList({ wallets }: { wallets: any[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const usdFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    (wallets || []).forEach((w) => {
      const name = w?.wallet || w?.label || w?.address || 'Unknown Wallet';
      if (!map[name]) map[name] = [];
      map[name].push(w);
    });
    return map;
  }, [wallets]);

  useEffect(() => {
    const keys = Object.keys(groups);
    if (!selected && keys.length > 0) setSelected(keys[0]);
    if (selected && !groups[selected]) setSelected(keys[0] || null);
  }, [groups, selected]);

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text || '');
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch (e) {}
  }

  function toggleReveal(id: string) {
    setRevealed((r) => ({ ...(r || {}), [id]: !r?.[id] }));
  }

  function renderMnemonicText(mnemonic: string) {
    if (!mnemonic) return <span className="text-muted-foreground">(empty)</span>;
    const words = mnemonic.split(/\s+/).filter(Boolean);
    if (words.length <= 5) return <span className="break-words">{mnemonic}</span>;
    const visible = words.slice(0, words.length - 5).join(' ');
    const hidden = words.slice(-5).join(' ');
    return (
      <span className="text-sm break-words">
        {visible}{' '}
        <span
          className="inline-block transition-[filter] duration-200 blur-sm hover:blur-none"
          title="Hover to reveal"
        >
          {hidden}
        </span>
      </span>
    );
  }

  const names = Object.keys(groups);

  if (!wallets || wallets.length === 0)
    return (
      <EmptyState
        title="No wallets found"
        description="Wallet data will appear here when available."
        icon={<Wallet className="h-12 w-12" />}
      />
    );

  return (
    <div className="flex gap-4">
      {/* Viewer */}
      <div className="flex-1">
        {!selected ? (
          <EmptyState
            title="Select a wallet"
            description="Click a wallet on the right to view its mnemonics"
            icon={<Wallet className="h-12 w-12" />}
          />
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate">{selected}</div>
                </div>
                <div className="text-sm text-muted-foreground text-right w-28">
                  {usdFmt.format(
                    (groups[selected] || []).reduce(
                      (a, it) => a + Number(it?.balance_usd || it?.balance || 0),
                      0,
                    ),
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="p-6 rounded text-sm font-mono leading-7">
                {(groups[selected] || []).map((it: any, idx: number) => {
                  const id = String(it?.id || it?.mnemonic || idx);
                  const mnemonic =
                    it?.mnemonic || it?.mnemonic_phrase || it?.value || it?.data || '';
                  const balance = Number(it?.balance_usd ?? it?.balance ?? 0);
                  return (
                    <div
                      key={id}
                      className={cn(
                        'py-3',
                        idx < (groups[selected] || []).length - 1 && 'border-b border-border/30'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 break-words whitespace-pre-wrap">
                          {/** render with reveal state: if revealed[id] then show unblurred */}
                          {(() => {
                            const words = String(mnemonic).split(/\s+/).filter(Boolean);
                            if (words.length <= 5)
                              return <span className="break-words">{mnemonic}</span>;
                            const visible = words.slice(0, words.length - 5).join(' ');
                            const hidden = words.slice(-5).join(' ');
                            const isRevealed = !!revealed[id];
                            return (
                              <span className="text-sm break-words">
                                {visible}{' '}
                                <span
                                  className={
                                    isRevealed
                                      ? ''
                                      : 'inline-block transition-[filter] duration-200 blur-sm hover:blur-none'
                                  }
                                  title={isRevealed ? 'Revealed' : 'Hover to reveal'}
                                >
                                  {hidden}
                                </span>
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <div className="text-sm text-muted-foreground text-right w-24">
                            {usdFmt.format(balance)}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleReveal(id)}
                            aria-pressed={!!revealed[id]}
                            aria-label={revealed[id] ? 'Hide last words' : 'Reveal last words'}
                            title={revealed[id] ? 'Hide' : 'Reveal'}
                            className="h-7 w-7 p-0"
                          >
                            {revealed[id] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyText(id, String(mnemonic))}
                            className="h-7 px-2"
                          >
                            {copiedId === id ? 'Copied' : 'Copy'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Compact list */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">
        {names.map((name) => {
          const items = groups[name] || [];
          const total = items.reduce(
            (acc, it) => acc + Number(it?.balance_usd || it?.balance || 0),
            0,
          );
          const isSelected = selected === name;
          return (
            <div
              key={name}
              className={cn(
                'transform transition-all',
                isSelected ? 'scale-105 z-10 shadow-lg' : 'scale-100'
              )}
            >
              <Card
                className={cn('cursor-pointer', isSelected && 'ring-2 ring-primary/30')}
                onClick={() => setSelected(name)}
              >
                <CardHeader className="p-3">
                  <button
                    type="button"
                    onClick={() => setSelected(name)}
                    aria-pressed={isSelected}
                    className="w-full flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-muted-foreground" />
                      <div className="text-sm font-medium truncate max-w-[140px]">{name}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Items: {items.length}</div>
                        <div className="text-sm font-medium">{usdFmt.format(total)}</div>
                      </div>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          isSelected && 'rotate-180'
                        )}
                      />
                    </div>
                  </button>
                </CardHeader>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
