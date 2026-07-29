import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Copy, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../../components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { toast } from 'sonner';

export function InviteControls({
  invites,
  refresh,
}: {
  invites: any[];
  refresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const invitesPerPage = 10;
  const totalPages = Math.max(1, Math.ceil((invites || []).length / invitesPerPage));
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all');

  useEffect(() => {
    // if invites change and current page is out of range, reset
    if (page > totalPages) setPage(1);
  }, [invites.length, totalPages]);

  async function copyCode(code: string, id: string | number) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (_) {
      toast.error('Failed to copy code');
    }
  }

  // Invite creation is disabled for non-admin users in the SPA.

  // Apply search + filter before pagination
  const filtered = (invites || []).filter((inv) => {
    if (filter === 'used' && !inv.used_by) return false;
    if (filter === 'unused' && inv.used_by) return false;
    if (!query) return true;
    return (
      String(inv.code).toLowerCase().includes(query.toLowerCase()) ||
      String(inv.used_by_username || inv.used_by || '')
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });

  const startIndex = (page - 1) * invitesPerPage;
  const pageInvites = filtered.slice(startIndex, startIndex + invitesPerPage);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="h-9 w-32">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Codes</SelectItem>
              <SelectItem value="unused">Available</SelectItem>
              <SelectItem value="used">Used</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search codes or users..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-64"
          />
        </div>
        <Button onClick={refresh} variant="outline" size="sm" className="h-9">
          Refresh
        </Button>
      </div>

      {/* Results Summary */}
      {query && (
        <div className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'} found
          {query && ` for "${query}"`}
        </div>
      )}

      {/* Invite Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pageInvites.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
            <div className="text-muted-foreground mb-2">
              {query || filter !== 'all'
                ? 'No matching invite codes found'
                : 'No invite codes available'}
            </div>
            {!query && filter === 'all' && (
              <div className="text-sm text-muted-foreground">
                Invite codes you create will appear here
              </div>
            )}
          </div>
        ) : (
          pageInvites.map((inv: any) => {
            const isUsed = !!inv.used_by;
            const createdDate = inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '';
            return (
              <Card
                key={inv.id}
                className={cn(
                  'transition-all duration-200 hover:shadow-md',
                  isUsed ? 'opacity-75 bg-muted/30' : 'hover:shadow-lg'
                )}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4">
                    {/* Code and Status */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <code
                            className={cn(
                              'font-mono font-bold text-lg tracking-wider',
                              isUsed ? 'line-through text-muted-foreground' : 'text-foreground'
                            )}
                          >
                            {inv.code}
                          </code>
                          {isUsed ? (
                            <Badge variant="secondary" className="text-xs">
                              Used
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs">
                              Available
                            </Badge>
                          )}
                        </div>

                        {/* Metadata */}
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          <div>Created: {createdDate}</div>
                          {inv.used_at && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>Used: {new Date(inv.used_at).toLocaleDateString()}</span>
                            </div>
                          )}
                          {inv.used_by && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>
                                By: {inv.used_by_username || `User #${inv.used_by}` || 'Unknown'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Copy Button */}
                      <div className="flex-shrink-0 ml-3">
                        <Button
                          onClick={() => copyCode(inv.code, inv.id)}
                          disabled={isUsed}
                          variant={isUsed ? 'ghost' : 'secondary'}
                          size="sm"
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          {copiedId === inv.id ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col gap-4 border-t pt-6">
          <div className="text-sm text-muted-foreground text-center">
            Showing {startIndex + 1}-{Math.min(startIndex + invitesPerPage, filtered.length)} of{' '}
            {filtered.length} invite codes
          </div>
          <div className="flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(1, p - 1));
                    }}
                    className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const pg = i + 1;
                  return (
                    <PaginationItem key={pg}>
                      <PaginationLink
                        href="#"
                        isActive={pg === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(pg);
                        }}
                      >
                        {pg}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                {totalPages > 7 && (
                  <PaginationItem>
                    <span className="px-3 py-2 text-sm text-muted-foreground">…</span>
                  </PaginationItem>
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(totalPages, p + 1));
                    }}
                    className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}
    </div>
  );
}
