import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  Line,
  Legend,
} from 'recharts';
// Workaround for JSX component type issues in current TS config
// Cast components to any to avoid "cannot be used as a JSX component" errors
const RC_ResponsiveContainer: any = ResponsiveContainer;
const RC_AreaChart: any = AreaChart;
const RC_Area: any = Area;
const RC_XAxis: any = XAxis;
const RC_YAxis: any = YAxis;
const RC_Tooltip: any = RTooltip;
const RC_CartesianGrid: any = CartesianGrid;
const RC_Line: any = Line;
const RC_Legend: any = Legend;
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Download, Filter, RefreshCw, Search, TrendingUp, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface RevenueSummaryBlock {
  total: number; // sum amount
  count: number; // number of paid invoices
}

interface RevenueSummaryPayload {
  today: RevenueSummaryBlock;
  last7: RevenueSummaryBlock;
  last30: RevenueSummaryBlock;
  thisMonth: RevenueSummaryBlock;
  previousMonth: RevenueSummaryBlock;
  allTime: RevenueSummaryBlock;
  statusBreakdown: { status: string; count: number; total_amount: number; avg_amount: number }[];
  topSpenders: { user_id: number; username: string; total_spent: number; paid_invoices: number }[];
}

interface TimeseriesPoint {
  day: string;
  total: number;
  count: number;
}

interface PaymentRow {
  id: number;
  user_id: number;
  username?: string;
  amount: number;
  currency: string;
  status: string;
  oxapay_track_id: string;
  oxapay_txid?: string;
  payment_link: string;
  payment_type: string; // subscription|invite_purchase
  invite_count?: number | null;
  created_at: string;
  expires_at?: string;
}

interface PaymentsResponse {
  payments: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const currencyFmt = (v: any) => {
  // Handle null, undefined, or non-numeric values
  if (v == null) return '$0.00';

  // Convert to number if it's a string
  const num = typeof v === 'string' ? parseFloat(v) : Number(v);

  // Check if it's a valid number
  if (isNaN(num) || !isFinite(num)) return '$0.00';

  return `$${num.toFixed(2)}`;
};

const numberFmt = (v: any) => {
  // Handle null, undefined, or non-numeric values
  if (v == null) return '0.00';

  // Convert to number if it's a string
  const num = typeof v === 'string' ? parseFloat(v) : Number(v);

  // Check if it's a valid number
  if (isNaN(num) || !isFinite(num)) return '0.00';

  return num.toFixed(2);
};

const numberFmt1 = (v: any) => {
  // Handle null, undefined, or non-numeric values
  if (v == null) return '0.0';

  // Convert to number if it's a string
  const num = typeof v === 'string' ? parseFloat(v) : Number(v);

  // Check if it's a valid number
  if (isNaN(num) || !isFinite(num)) return '0.0';

  return num.toFixed(1);
};

// Helper: robust date formatter for possibly-null or invalid inputs
const formatDate = (v: unknown): string => {
  if (!v) return '-';
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? '-' : d.toLocaleString();
};

const safeNumber = (v: any): number => {
  if (v == null) return 0;
  const num = typeof v === 'string' ? parseFloat(v) : Number(v);
  return isNaN(num) || !isFinite(num) ? 0 : num;
};

const rankBadge = (idx: number) => {
  const base = 'px-2 py-0.5 rounded text-xs font-semibold';
  if (idx === 0) return <span className={base + ' bg-yellow-500/90 text-black'}>🥇 1</span>;
  if (idx === 1) return <span className={base + ' bg-gray-300 text-black'}>🥈 2</span>;
  if (idx === 2) return <span className={base + ' bg-amber-700/80 text-white'}>🥉 3</span>;
  return <span className={base + ' bg-muted text-foreground/70'}>{idx + 1}</span>;
};

export const PaymentsAnalytics: React.FC = () => {
  const [summary, setSummary] = useState<RevenueSummaryPayload | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  // Dual series chart: revenue (total) and payments count simultaneously
  const [tsDays, setTsDays] = useState(30);

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);
  const [paymentsTotal, setPaymentsTotal] = useState(0);

  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingTs, setLoadingTs] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [trackLookup, setTrackLookup] = useState('');
  const [trackResult, setTrackResult] = useState<PaymentRow | null>(null);

  const [filters, setFilters] = useState({
    status: '',
    paymentType: '',
    trackId: '',
    dateFrom: '',
    dateTo: '',
  });
  const pageSize = 25;

  const fetchSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const res = await fetch('/admin/api/payments/revenue/summary', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed summary');
      const data = await res.json();
      setSummary(data.summary);
    } catch (e: any) {
      toast.error('Failed to load revenue summary');
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const fetchTimeseries = useCallback(async (days: number) => {
    try {
      setLoadingTs(true);
      const res = await fetch(`/admin/api/payments/revenue/timeseries?days=${days}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed timeseries');
      const data = await res.json();
      setTimeseries(data.timeseries || []);
    } catch (e) {
      toast.error('Failed to load timeseries');
    } finally {
      setLoadingTs(false);
    }
  }, []);

  const fetchPayments = useCallback(
    async (page = 1) => {
      try {
        setLoadingPayments(true);
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));
        if (filters.status) params.set('status', filters.status);
        if (filters.paymentType) params.set('paymentType', filters.paymentType);
        if (filters.trackId) params.set('trackId', filters.trackId);
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        const res = await fetch(`/admin/api/payments?${params.toString()}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed payments');
        const data: PaymentsResponse = await res.json();
        setPayments(data.payments || []);
        setPaymentsPage(data.page || 1);
        setPaymentsTotalPages(data.totalPages || 1);
        setPaymentsTotal(data.total || 0);
      } catch (e) {
        toast.error('Failed to load payments');
      } finally {
        setLoadingPayments(false);
      }
    },
    [filters],
  );

  const lookupTrack = async () => {
    setTrackResult(null);
    if (!trackLookup.trim()) return;
    try {
      const res = await fetch(
        `/admin/api/payments/track/${encodeURIComponent(trackLookup.trim())}`,
        {
          credentials: 'include',
        },
      );
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      setTrackResult(data.payment || null);
    } catch (e) {
      toast.error('Track ID not found');
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchTimeseries(tsDays);
    fetchPayments(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // refetch on filters change
  useEffect(() => {
    fetchPayments(1);
  }, [filters, fetchPayments]);

  const totalRevenueRange = timeseries.reduce((s, x) => s + safeNumber(x.total), 0);
  const totalPaymentsRange = timeseries.reduce((s, x) => s + safeNumber(x.count), 0);
  const avgRevenuePerDay = timeseries.length ? totalRevenueRange / timeseries.length : 0;
  const avgPaymentsPerDay = timeseries.length ? totalPaymentsRange / timeseries.length : 0;
  const peakRevenue = timeseries.reduce((m, p) => {
    const currentTotal = safeNumber(p.total);
    return currentTotal > m ? currentTotal : m;
  }, 0);

  // Check if we have meaningful data to display
  const hasData = totalRevenueRange > 0 || totalPaymentsRange > 0;

  const chartColor = '#60a5fa'; // baby blue area
  const chartColorDark = '#7dc3ff';
  const lineColor = '#a855f7'; // violet for count
  const lineColorDark = '#c084fc';
  const isDark =
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark') ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
  const strokeCol = isDark ? chartColorDark : chartColor;
  const strokeLine = isDark ? lineColorDark : lineColor;
  const tickColor = isDark ? '#ffffff' : 'hsl(var(--muted-foreground))';

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload as TimeseriesPoint;
    return (
      <div className="bg-popover/95 backdrop-blur border shadow-md rounded-md px-3 py-2 text-[11px] leading-tight">
        <div className="font-medium mb-1">{label}</div>
        <div>Revenue: {currencyFmt(point.total)}</div>
        <div>Payments: {point.count}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Summary & Top Spenders */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Revenue Summary
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                fetchSummary();
                fetchTimeseries(tsDays);
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {loadingSummary && !summary && (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            )}
            {summary && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
                {[
                  { label: 'Today', block: summary.today },
                  { label: 'Last 7 Days', block: summary.last7 },
                  { label: 'This Month', block: summary.thisMonth },
                  { label: 'Last 30 Days', block: summary.last30 },
                  { label: 'Previous Month', block: summary.previousMonth },
                  { label: 'All Time', block: summary.allTime },
                ].map(({ label, block }) => (
                  <div key={label} className="rounded-md border bg-card p-4 flex flex-col gap-1">
                    <div className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                      {label}
                    </div>
                    <div className="text-xl font-semibold leading-tight">
                      {currencyFmt(block.total)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{block.count} paid</div>
                  </div>
                ))}
                <div className="rounded-md border bg-card p-4 flex flex-col gap-2 col-span-full lg:col-span-3 2xl:col-span-2">
                  <div className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                    Status Breakdown
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {summary.statusBreakdown.map((s) => (
                      <span
                        key={s.status}
                        className="px-2 py-0.5 rounded bg-muted text-[10px] font-medium"
                        title={`Total: ${currencyFmt(s.total_amount)} | Avg: $${numberFmt(s.avg_amount)}`}
                      >
                        {s.status}: {s.count}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Avg Paid: $
                    {numberFmt(
                      summary.statusBreakdown.reduce((a, b) => a + safeNumber(b.avg_amount), 0) /
                        (summary.statusBreakdown.length || 1),
                    )}
                  </div>
                </div>
              </div>
            )}
            {!loadingSummary && !summary && (
              <div className="text-sm text-muted-foreground">No data.</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Top Spenders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary && !summary ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner />
              </div>
            ) : summary &&
              summary.topSpenders.filter((sp) => !sp.username.startsWith('__deleted__')).length >
                0 ? (
              <div className="flex flex-col gap-2">
                {summary.topSpenders
                  .filter((sp) => !sp.username.startsWith('__deleted__'))
                  .slice(0, 5)
                  .map((sp, idx) => (
                    <div
                      key={sp.user_id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-muted/40 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {rankBadge(idx)}
                        <span className="font-medium" title={sp.username}>
                          {sp.username.length > 26
                            ? `${sp.username.substring(0, 26)}...`
                            : sp.username}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-xs">{currencyFmt(sp.total_spent)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {sp.paid_invoices} paid
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No paid invoices yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeseries Chart (Dual Series) */}
      <Card>
        <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Daily Revenue & Payments
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={String(tsDays)}
              onValueChange={(v) => {
                const num = Number(v);
                setTsDays(num);
                fetchTimeseries(num);
              }}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue placeholder="Days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Days</SelectItem>
                <SelectItem value="14">14 Days</SelectItem>
                <SelectItem value="30">30 Days</SelectItem>
                <SelectItem value="60">60 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => fetchTimeseries(tsDays)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTs && !timeseries.length ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : timeseries.length ? (
            <div className="relative w-full">
              {!hasData && (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="text-sm">No revenue or payment data for the selected period</div>
                  <div className="text-xs mt-1">Try selecting a different time range</div>
                </div>
              )}
              {hasData && (
                <RC_ResponsiveContainer width="100%" height={240}>
                  <RC_AreaChart
                    data={timeseries}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="revGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={strokeCol} stopOpacity={0.45} />
                        <stop offset="85%" stopColor={strokeCol} stopOpacity={0.08} />
                        <stop offset="100%" stopColor={strokeCol} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <RC_CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--muted-foreground) / 0.15)"
                    />
                    <RC_XAxis
                      dataKey="day"
                      tickFormatter={(d: string) => d.slice(5)}
                      fontSize={10}
                      tick={{ fill: tickColor }}
                    />
                    <RC_YAxis
                      width={60}
                      yAxisId="left"
                      tickFormatter={(v: number) => currencyFmt(v).replace(/\.00$/, '')}
                      fontSize={10}
                      tick={{ fill: tickColor }}
                    />
                    <RC_YAxis
                      orientation="right"
                      yAxisId="right"
                      width={40}
                      tickFormatter={(v: number) => v}
                      fontSize={10}
                      tick={{ fill: tickColor }}
                    />
                    <RC_Tooltip content={<ChartTooltip />} />
                    <RC_Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="total"
                      stroke={strokeCol}
                      fill="url(#revGradient)"
                      strokeWidth={2}
                      activeDot={{ r: 5 }}
                    />
                    <RC_Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="count"
                      stroke={strokeLine}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <RC_Legend
                      verticalAlign="top"
                      height={24}
                      formatter={(value: string) => (value === 'total' ? 'Revenue' : 'Payments')}
                    />
                  </RC_AreaChart>
                </RC_ResponsiveContainer>
              )}
              {/* Dark mode label color overrides */}
              <style>
                {`.dark .recharts-text { fill: #fff !important; }
                  .dark .recharts-legend-item-text { fill:#fff !important; color:#fff !important; }
                  .dark .recharts-default-tooltip { background: rgba(15,15,15,0.9) !important; border:1px solid rgba(255,255,255,0.1); }
                `}
              </style>
              <div className="mt-3 text-[10px] text-muted-foreground flex flex-wrap gap-4">
                <span>Revenue (range): {currencyFmt(totalRevenueRange)}</span>
                <span>Payments (range): {totalPaymentsRange}</span>
                <span>Avg rev/day: {currencyFmt(avgRevenuePerDay)}</span>
                <span>Avg payments/day: {numberFmt1(avgPaymentsPerDay)}</span>
                <span>Peak day rev: {currencyFmt(peakRevenue)}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No data for selected range.</div>
          )}
        </CardContent>
      </Card>

      {/* Track ID Lookup */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Search className="h-4 w-4" /> Track ID Lookup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Input
              placeholder="Enter track id..."
              value={trackLookup}
              onChange={(e) => setTrackLookup(e.target.value)}
              className="w-64"
            />
            <Button size="sm" onClick={lookupTrack}>
              Lookup
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTrackLookup('');
                setTrackResult(null);
              }}
            >
              Clear
            </Button>
          </div>
          {trackResult && (
            <div className="p-3 border rounded-md bg-muted/30 text-xs flex flex-col gap-1">
              <div>
                <span className="font-medium">User:</span>{' '}
                {trackResult.username || trackResult.user_id}
              </div>
              <div>
                <span className="font-medium">Amount:</span> {currencyFmt(trackResult.amount)}
              </div>
              <div>
                <span className="font-medium">Status:</span>{' '}
                <Badge variant="outline" className="capitalize">
                  {trackResult.status}
                </Badge>
              </div>
              <div>
                <span className="font-medium">Type:</span> {trackResult.payment_type}
              </div>
              <div>
                <span className="font-medium">Created:</span> {formatDate(trackResult.created_at)}
              </div>
              {trackResult.invite_count ? (
                <div>
                  <span className="font-medium">Invites:</span> {trackResult.invite_count}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments Table + Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" /> Payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-5 gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium">Status</label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v === 'all' ? '' : v }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium">Type</label>
              <Select
                value={filters.paymentType}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, paymentType: v === 'all' ? '' : v }))
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="invite_purchase">Invite Purchase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium">From</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium">To</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium">Track ID</label>
              <Input
                value={filters.trackId}
                onChange={(e) => setFilters((f) => ({ ...f, trackId: e.target.value }))}
                placeholder="Partial..."
                className="h-8"
              />
            </div>
          </div>
          <div className="flex gap-2 mb-4">
            <Button size="sm" onClick={() => fetchPayments(1)}>
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFilters({ status: '', paymentType: '', trackId: '', dateFrom: '', dateTo: '' });
              }}
            >
              Reset
            </Button>
          </div>
          {loadingPayments ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm align-top">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="p-2 text-left font-medium">ID</th>
                    <th className="p-2 text-left font-medium">User</th>
                    <th className="p-2 text-left font-medium">Amount</th>
                    <th className="p-2 text-left font-medium">Status</th>
                    <th className="p-2 text-left font-medium">Type</th>
                    <th className="p-2 text-left font-medium">Track</th>
                    <th className="p-2 text-left font-medium">Created</th>
                    <th className="p-2 text-left font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length ? (
                    payments.map((p) => {
                      const status = p.status || '';
                      const statusVariant: any =
                        status === 'paid'
                          ? 'secondary'
                          : status === 'pending'
                            ? 'outline'
                            : 'destructive';
                      return (
                        <tr key={p.id} className="border-b hover:bg-muted/30">
                          <td className="p-2 font-mono text-[11px] text-muted-foreground">
                            {p.id}
                          </td>
                          <td className="p-2 font-medium">{p.username || p.user_id}</td>
                          <td className="p-2 whitespace-nowrap">{currencyFmt(p.amount)}</td>
                          <td className="p-2">
                            <Badge variant={statusVariant} className="capitalize">
                              {status}
                            </Badge>
                          </td>
                          <td className="p-2 text-xs">{p.payment_type}</td>
                          <td
                            className="p-2 font-mono text-[11px] truncate max-w-[150px]"
                            title={p.oxapay_track_id || ''}
                          >
                            {p.oxapay_track_id}
                          </td>
                          <td className="p-2 text-xs whitespace-nowrap">
                            {formatDate(p.created_at)}
                          </td>
                          <td className="p-2 text-xs whitespace-nowrap">
                            {formatDate(p.expires_at)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">
                        No payments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {paymentsTotalPages > 1 && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="text-xs text-muted-foreground text-center">
                {paymentsTotal} payments • Page {paymentsPage} of {paymentsTotalPages}
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (paymentsPage > 1) fetchPayments(paymentsPage - 1);
                      }}
                    />
                  </PaginationItem>
                  {Array.from({ length: paymentsTotalPages })
                    .slice(0, 7)
                    .map((_, i) => {
                      const page = i + 1;
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            isActive={page === paymentsPage}
                            onClick={(e) => {
                              e.preventDefault();
                              fetchPayments(page);
                            }}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                  {paymentsTotalPages > 7 && (
                    <PaginationItem>
                      <span className="px-2 text-xs">…</span>
                    </PaginationItem>
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (paymentsPage < paymentsTotalPages) fetchPayments(paymentsPage + 1);
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

