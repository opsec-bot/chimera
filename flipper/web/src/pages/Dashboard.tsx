import React, { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { getJson, postJson } from '../utils/api';
import {
  Card as UiCard,
  CardHeader as UiCardHeader,
  CardTitle as UiCardTitle,
  CardContent as UiCardContent,
} from '../components/ui/card';
import { Input as UiInput } from '../components/ui/input';
import { Button as UiButton } from '../components/ui/button';
import { Badge as UiBadge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from 'sonner';
import { BrowserSubmissions } from './dashboard/BrowserSubmissions';
import { FilesearchList } from './dashboard/FilesearchList';
import { WalletsList } from './dashboard/WalletsList';
import { InviteControls } from './dashboard/InviteControls';
import { InvitePurchase } from './dashboard/InvitePurchase';
import {
  Bell,
  Database,
  UserPlus,
  Download,
  Hammer,
  Shield,
  Lock,
  X,
  Megaphone,
} from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';
import { checkPendingPaymentsAndReturnTrack } from './dashboard/payments';
import { PageLayout } from '../components/PageLayout';

type Counts = Record<string, number>;

type Submission = {
  id: string;
  type?: string;
  data?: any;
};

type Invite = { id: string; code: string; created_at?: string };

type Payment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  payment_link?: string;
  oxapay_track_id?: string;
};

// Utility function to extract domain from URL
function extractDomain(url: string): string {
  try {
    if (!url) return '';

    // Check if it's a valid URL that starts with http/https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // If it doesn't start with http/https, it's probably not a real URL
      // Return empty string to hide it from display
      return '';
    }

    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    // If URL parsing fails, return empty string to hide invalid URLs
    return '';
  }
}

function Sidebar({
  active,
  onSelect,
  stubAllowed,
  onStubBlocked,
  isAdmin,
}: {
  active: string;
  onSelect: (tab: string) => void;
  stubAllowed?: boolean | null;
  onStubBlocked: () => void;
  isAdmin?: boolean;
}) {
  return (
    // collapsed by default (icons only) -> expands on hover to show labels
    <nav className="bg-card border-r border-border flex-shrink-0 h-full flex flex-col w-16 hover:w-64 transition-[width] duration-200 ease-out group overflow-x-hidden">
      <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto overflow-x-hidden">
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-center group-hover:justify-start gap-0 group-hover:gap-3 px-2 py-2 rounded-lg transition-colors',
            active === 'submissions'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
          onClick={() => onSelect('submissions')}
        >
          <span
            className={cn(
              'size-10 rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
              active === 'submissions'
                ? 'bg-primary/90 text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Database className="h-4 w-4" />
          </span>
          <span className="ml-0 group-hover:ml-1.5 overflow-hidden transition-all duration-200 max-w-0 group-hover:max-w-[160px] opacity-0 group-hover:opacity-100">
            My Submissions
          </span>
        </Button>
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-center group-hover:justify-start gap-0 group-hover:gap-3 px-2 py-2 rounded-lg transition-colors',
            active === 'invites'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
          onClick={() => onSelect('invites')}
        >
          <span
            className={cn(
              'size-10 rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
              active === 'invites'
                ? 'bg-primary/90 text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <UserPlus className="h-4 w-4" />
          </span>
          <span className="ml-0 group-hover:ml-1.5 overflow-hidden transition-all duration-200 max-w-0 group-hover:max-w-[160px] opacity-0 group-hover:opacity-100">
            Invite Codes
          </span>
        </Button>
        {/* Subscription moved to separate /subscriptions page and header dropdown */}
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-center group-hover:justify-start gap-0 group-hover:gap-3 px-2 py-2 rounded-lg transition-colors',
            active === 'export'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
          onClick={() => onSelect('export')}
        >
          <span
            className={cn(
              'size-10 rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
              active === 'export'
                ? 'bg-primary/90 text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Download className="h-4 w-4" />
          </span>
          <span className="ml-0 group-hover:ml-1.5 overflow-hidden transition-all duration-200 max-w-0 group-hover:max-w-[160px] opacity-0 group-hover:opacity-100">
            Export Data
          </span>
        </Button>

        <Button
          variant="ghost"
          className={cn(
            'w-full justify-center group-hover:justify-start gap-0 group-hover:gap-3 px-2 py-2 rounded-lg transition-colors',
            stubAllowed
              ? 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              : 'text-muted-foreground opacity-70 cursor-not-allowed'
          )}
          onClick={(e) => {
            if (!stubAllowed) {
              e.preventDefault();
              onStubBlocked();
              return;
            }
            window.location.href = '/builder';
          }}
        >
          <span
            className={cn(
              'size-10 rounded-md flex items-center justify-center flex-shrink-0 transition-colors relative',
              stubAllowed ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            <Hammer className="h-4 w-4" />
            {!stubAllowed && (
              <Lock
                id="stubBuilderLock"
                className="h-3 w-3 text-destructive absolute -top-1 -right-1"
              />
            )}
          </span>
          <span className="ml-0 group-hover:ml-1.5 overflow-hidden transition-all duration-200 max-w-0 group-hover:max-w-[160px] opacity-0 group-hover:opacity-100">
            Stub Builder
          </span>
        </Button>

        {/* Admin Panel Button - Only visible to admins */}
        {isAdmin && (
          <Button
            variant="ghost"
            className="w-full justify-center group-hover:justify-start gap-0 group-hover:gap-3 px-2 py-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => (window.location.href = '/admin')}
          >
            <span className="size-10 rounded-md flex items-center justify-center flex-shrink-0 bg-muted text-muted-foreground">
              <Shield className="h-4 w-4" />
            </span>
            <span className="ml-0 group-hover:ml-1.5 overflow-hidden transition-all duration-200 max-w-0 group-hover:max-w-[160px] opacity-0 group-hover:opacity-100 font-medium">
              Administrative Panel
            </span>
          </Button>
        )}
      </div>
    </nav>
  );
}

export function Dashboard() {
  const [active, setActive] = useState<'submissions' | 'invites' | 'subscription' | 'export'>(
    'submissions',
  );
  const [counts, setCounts] = useState<Counts>({});
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  // Pagination for browser submissions (client-side paging)
  const [browserPage, setBrowserPage] = useState<number>(1);
  const browserPageSize = 10;
  const browserTotalPages = Math.max(1, Math.ceil((submissions || []).length / browserPageSize));
  const browserPageItems = React.useMemo(() => {
    const start = (browserPage - 1) * browserPageSize;
    return submissions.slice(start, start + browserPageSize);
  }, [submissions, browserPage]);
  const [browserStats, setBrowserStats] = useState<Counts>({});
  const [filesearchList, setFilesearchList] = useState<any[]>([]);
  const [walletsList, setWalletsList] = useState<any[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subsStatus, setSubsStatus] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const notifPollRef = useRef<number | null>(null);
  const paymentPollRef = useRef<number | null>(null);
  // Announcement storage for re-opening
  const [lastAnnouncement, setLastAnnouncement] = useState<any | null>(null);

  // Close notifications when clicking outside or pressing Escape
  React.useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!notifRef.current) return;
      // If click is on the bell button, ignore (it toggles)
      const clickedBell = (target as Element | null)?.closest?.('[aria-label="notifications"]');
      if (clickedBell) return;
      if (target && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setNotifOpen(false);
    }

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [notifRef]);

  // AlertDialog states
  const [regenerateKeyOpen, setRegenerateKeyOpen] = useState(false);
  const [unlinkTelegramOpen, setUnlinkTelegramOpen] = useState(false);

  // SSE batching / sound cooldown helpers
  const pendingSubmissionsRef = useRef<any[]>([]);
  const pendingWalletsRef = useRef<any[]>([]);
  const pendingFilesearchRef = useRef<any[]>([]);
  const pendingPaymentsRef = useRef<any[]>([]);
  const flushTimeoutRef = useRef<number | null>(null);
  const lastDataSoundAtRef = useRef<number>(0);
  const dataSettingsRef = useRef<{ enabled: boolean; cooldown: number }>({
    enabled: true,
    cooldown: 2000,
  });
  const lastToastAtRef = useRef<number>(0);
  const toastCooldownRef = useRef<number>(3000);
  const [liveCount, setLiveCount] = useState<number>(0);
  const [liveVisible, setLiveVisible] = useState<boolean>(false);
  const [liveBrowserCount, setLiveBrowserCount] = useState<number>(0);
  const [liveBrowserVisible, setLiveBrowserVisible] = useState<boolean>(false);
  const [liveWalletsCount, setLiveWalletsCount] = useState<number>(0);
  const [liveWalletsVisible, setLiveWalletsVisible] = useState<boolean>(false);
  const [liveFilesearchCount, setLiveFilesearchCount] = useState<number>(0);
  const [liveFilesearchVisible, setLiveFilesearchVisible] = useState<boolean>(false);
  const liveTimeoutRef = useRef<number | null>(null);
  const liveBrowserTimeoutRef = useRef<number | null>(null);
  const liveWalletsTimeoutRef = useRef<number | null>(null);
  const liveFilesearchTimeoutRef = useRef<number | null>(null);
  const [lastUpdatedText, setLastUpdatedText] = useState<string>('Never');
  const lastUpdatedTimerRef = useRef<number | null>(null);

  // Helper function to show live indicator for specific submission type
  function showLiveIndicator(type: 'browser' | 'wallets' | 'filesearch', count: number) {
    if (type === 'browser') {
      setLiveBrowserCount(count);
      setLiveBrowserVisible(true);
      if (liveBrowserTimeoutRef.current) window.clearTimeout(liveBrowserTimeoutRef.current);
      liveBrowserTimeoutRef.current = window.setTimeout(() => {
        setLiveBrowserVisible(false);
        setLiveBrowserCount(0);
        liveBrowserTimeoutRef.current = null;
      }, 3500);
    } else if (type === 'wallets') {
      setLiveWalletsCount(count);
      setLiveWalletsVisible(true);
      if (liveWalletsTimeoutRef.current) window.clearTimeout(liveWalletsTimeoutRef.current);
      liveWalletsTimeoutRef.current = window.setTimeout(() => {
        setLiveWalletsVisible(false);
        setLiveWalletsCount(0);
        liveWalletsTimeoutRef.current = null;
      }, 3500);
    } else if (type === 'filesearch') {
      setLiveFilesearchCount(count);
      setLiveFilesearchVisible(true);
      if (liveFilesearchTimeoutRef.current) window.clearTimeout(liveFilesearchTimeoutRef.current);
      liveFilesearchTimeoutRef.current = window.setTimeout(() => {
        setLiveFilesearchVisible(false);
        setLiveFilesearchCount(0);
        liveFilesearchTimeoutRef.current = null;
      }, 3500);
    }
  }

  // Schedule a flush of pending batches after a short debounce
  function scheduleFlush(delay = 500) {
    if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    flushTimeoutRef.current = window.setTimeout(() => flushPending(), delay);
  }

  // Play data sound if enabled and cooldown has passed
  function playDataSoundIfAllowed(kind: 'dataReceived' | 'paymentSuccess') {
    try {
      const now = Date.now();
      const settings = dataSettingsRef.current;
      if (!settings.enabled) return;
      if (kind === 'dataReceived') {
        if (now - lastDataSoundAtRef.current < settings.cooldown) return;
        lastDataSoundAtRef.current = now;
        if ((window as any).soundNotifications)
          (window as any).soundNotifications.playDataReceived &&
            (window as any).soundNotifications.playDataReceived();
      } else if (kind === 'paymentSuccess') {
        if ((window as any).soundNotifications)
          (window as any).soundNotifications.playPaymentSuccess &&
            (window as any).soundNotifications.playPaymentSuccess();
      }
    } catch (e) {
      // ignore
    }
  }

  // Helper function to normalize submission data for consistent display
  function normalizeSubmissionData(rawSubmission: any): any {
    // Ensure the submission has all required properties for BrowserSubmissions component
    const normalized = {
      id: rawSubmission.id || `live-${Date.now()}-${Math.random()}`,
      type:
        rawSubmission.type ||
        rawSubmission.submission_type ||
        rawSubmission.submission_category ||
        'browser',
      data: rawSubmission.data,
      ip_address: rawSubmission.ip_address || rawSubmission.ip || 'Unknown',
      desktop_name:
        rawSubmission.desktop_name || rawSubmission.desktopName || rawSubmission.desktop || '',
      browser: rawSubmission.browser || 'browser',
      created_at:
        rawSubmission.created_at ||
        rawSubmission.createdAt ||
        rawSubmission.created ||
        new Date().toISOString(),
      user_id: rawSubmission.user_id || rawSubmission.userId,
      // Preserve any additional fields that might be present
      ...rawSubmission,
    };

    // Ensure data is properly structured - if it's a string, try to parse it
    let parsedData: any = null;
    if (typeof normalized.data === 'string') {
      try {
        parsedData = JSON.parse(normalized.data);
        normalized.data = parsedData;
      } catch (e) {
        parsedData = normalized.data;
      }
    } else {
      parsedData = normalized.data || {};
    }

    // Normalize the submission type to match what BrowserSubmissions expects
    const rawType = String(normalized.type).toLowerCase();
    const subtype = String(rawSubmission.subtype || '').toLowerCase();

    // More specific type detection based on data content if type is generic
    let detectedType = rawType;

    // First check subtype field (this seems to be the key field for browser submissions)
    if (subtype) {
      detectedType = subtype;
    } else if (rawType === 'browser' || rawType === 'submission' || !rawType) {
      // Try to detect type from data content
      if (parsedData) {
        if (parsedData.username || parsedData.login || parsedData.password) {
          detectedType = 'password';
        } else if (parsedData.name && parsedData.value) {
          detectedType = 'autofill';
        } else if (parsedData.url && (parsedData.title || parsedData.visit_count)) {
          detectedType = 'history';
        } else if (parsedData.host || parsedData.domain || parsedData.cookie_name) {
          detectedType = 'cookie';
        } else if (parsedData.card_number || parsedData.name_on_card) {
          detectedType = 'credit';
        }
      }
    }

    if (
      detectedType.includes('password') ||
      detectedType === 'pw' ||
      detectedType === 'passwords'
    ) {
      normalized.type = 'passwords';
      normalized.submission_type = 'passwords';
      normalized.submission_category = 'passwords';
    } else if (detectedType.includes('autofill') || detectedType === 'autofills') {
      normalized.type = 'autofill';
      normalized.submission_type = 'autofill';
      normalized.submission_category = 'autofill';
    } else if (detectedType.includes('history')) {
      normalized.type = 'history';
      normalized.submission_type = 'history';
      normalized.submission_category = 'history';
    } else if (detectedType.includes('cookie') || detectedType === 'cookies') {
      normalized.type = 'cookies';
      normalized.submission_type = 'cookies';
      normalized.submission_category = 'cookies';
    } else if (detectedType.includes('credit') || detectedType.includes('card')) {
      normalized.type = 'creditCards';
      normalized.submission_type = 'creditCards';
      normalized.submission_category = 'creditCards';
    } else if (
      detectedType === 'filesearch' ||
      detectedType === 'file_search' ||
      detectedType === 'file-search'
    ) {
      normalized.type = 'filesearch';
      normalized.submission_type = 'filesearch';
      normalized.submission_category = 'filesearch';
    } else {
      normalized.type = detectedType || 'browser';
      normalized.submission_type = detectedType || 'browser';
      normalized.submission_category = detectedType || 'browser';
    }

    // Compute meaningful title based on type and data (matching BrowserSubmissions.tsx logic)
    const capitalizeFirst = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
    let computedTitle = 'Browser Item';

    switch (true) {
      case normalized.type === 'autofill':
        if (parsedData && parsedData.name) {
          computedTitle = capitalizeFirst(String(parsedData.name));
        }
        break;
      case normalized.type === 'history':
        if (parsedData && parsedData.url) {
          const domain = extractDomain(String(parsedData.url));
          computedTitle = domain || 'Browser History';
        }
        break;
      case normalized.type === 'passwords':
        if (parsedData && parsedData.url) {
          const domain = extractDomain(String(parsedData.url));
          computedTitle = domain || 'Saved Password';
        } else if (parsedData && parsedData.origin_url) {
          const domain = extractDomain(String(parsedData.origin_url));
          computedTitle = domain || 'Saved Password';
        }
        break;
      case normalized.type === 'cookies':
        if (parsedData && parsedData.host) {
          computedTitle = String(parsedData.host);
        } else if (parsedData && parsedData.domain) {
          computedTitle = String(parsedData.domain);
        }
        break;
      case normalized.type === 'creditCards':
        if (parsedData) {
          const nameOnCard = parsedData.name_on_card || parsedData.name || parsedData.cardholder;
          const cardNum =
            parsedData.card_number || parsedData.number || parsedData.cardNumber || '';
          const last4 = String(cardNum).slice(-4);
          if (nameOnCard) {
            computedTitle = `${capitalizeFirst(String(nameOnCard))} ${last4}`;
          } else if (last4) {
            computedTitle = `****${last4}`;
          }
        }
        break;
      default:
        // For other types, try to use url, title, or other meaningful fields
        if (parsedData && parsedData.url) {
          const domain = extractDomain(String(parsedData.url));
          computedTitle = domain || 'Browser Item';
        } else if (parsedData && parsedData.title) {
          computedTitle = String(parsedData.title);
        }
    }

    // Store the computed title for display
    normalized.title = computedTitle;
    normalized.url = parsedData?.url || parsedData?.origin_url || '';

    return normalized;
  }

  // Helper function to normalize filesearch submission data
  function normalizeFilesearchData(rawSubmission: any): any {
    const normalized = {
      id: rawSubmission.id || `live-filesearch-${Date.now()}-${Math.random()}`,
      created_at:
        rawSubmission.created_at ||
        rawSubmission.createdAt ||
        rawSubmission.created ||
        new Date().toISOString(),
      type: 'filesearch',
      // Preserve any additional fields
      ...rawSubmission,
    };

    // Parse the data field if it's a string
    let parsedData: any = null;
    if (typeof rawSubmission.data === 'string') {
      try {
        parsedData = JSON.parse(rawSubmission.data);
      } catch (e) {
        parsedData = rawSubmission.data || {};
      }
    } else {
      parsedData = rawSubmission.data || {};
    }

    // Flatten the data structure - move key fields from data to top level
    if (parsedData) {
      normalized.line = parsedData.line || parsedData.match || parsedData.value || '';
      normalized.pattern = parsedData.pattern || parsedData.filename || 'Unknown';
      normalized.balance =
        parsedData.balance ?? parsedData.balance_usd ?? parsedData.balanceUSD ?? null;

      // Keep the original data field as well for compatibility
      normalized.data = parsedData;
    }

    return normalized;
  }

  function flushPending() {
    // flush browser submissions
    const subs = pendingSubmissionsRef.current.splice(0);
    // flush filesearch submissions
    const filesearch = pendingFilesearchRef.current.splice(0);
    // flush wallet submissions
    const wallets = pendingWalletsRef.current.splice(0);

    const totalNewSubmissions = subs.length + filesearch.length + wallets.length;

    if (subs.length > 0) {
      // Normalize submission data to ensure it displays properly in BrowserSubmissions component
      const normalizedSubs = subs.map(normalizeSubmissionData);
      setSubmissions((s) => [...normalizedSubs.reverse(), ...s]);
      // Show live indicator for browser submissions
      showLiveIndicator('browser', subs.length);
    }

    if (filesearch.length > 0) {
      // Normalize filesearch data with specialized function
      const normalizedFilesearch = filesearch.map(normalizeFilesearchData);
      setFilesearchList((f) => [...normalizedFilesearch.reverse(), ...f]);
      // Show live indicator for filesearch submissions
      showLiveIndicator('filesearch', filesearch.length);
    }

    if (wallets.length > 0) {
      // Transform wallet data to match expected structure
      const transformedWallets = wallets.map((wallet) => {
        // If data is nested inside a 'data' property, flatten it
        if (wallet.data && typeof wallet.data === 'object') {
          return {
            id: wallet.id,
            user_id: wallet.user_id,
            wallet: wallet.data.wallet,
            mnemonic: wallet.data.mnemonic,
            balance_usd: wallet.data.balance_usd,
            ip_address: wallet.ip_address,
            created_at: wallet.created_at,
          };
        }
        // Otherwise, return as-is (already in correct format)
        return wallet;
      });

      setWalletsList((w) => [...transformedWallets.reverse(), ...w]);
      // Show live indicator for wallet submissions
      showLiveIndicator('wallets', wallets.length);
    }

    if (totalNewSubmissions > 0) {
      // Global live indicator (keep existing behavior for backward compatibility)
      setLiveCount((c) => c + totalNewSubmissions);
      setLiveVisible(true);
      if (liveTimeoutRef.current) window.clearTimeout(liveTimeoutRef.current);
      liveTimeoutRef.current = window.setTimeout(() => {
        setLiveVisible(false);
        setLiveCount(0);
        liveTimeoutRef.current = null;
      }, 3500);

      // batched toast (rate-limited)
      const now = Date.now();
      if (now - lastToastAtRef.current > toastCooldownRef.current) {
        lastToastAtRef.current = now;

        // Create a more detailed toast message
        const parts: string[] = [];
        if (subs.length > 0) parts.push(`${subs.length} browser`);
        if (filesearch.length > 0) parts.push(`${filesearch.length} filesearch`);
        if (wallets.length > 0)
          parts.push(`${wallets.length} wallet${wallets.length > 1 ? 's' : ''}`);
        const detail = parts.length > 0 ? `: ${parts.join(', ')}` : '';

        showToast(
          `${totalNewSubmissions} new submission${totalNewSubmissions > 1 ? 's' : ''}${detail}`,
          'info',
        );
      }
      // play a data sound for new submissions (single sound per flush)
      playDataSoundIfAllowed('dataReceived');
    }
    // flush payments
    const pays = pendingPaymentsRef.current.splice(0);
    if (pays.length > 0) {
      setPayments((p) => [...pays.reverse(), ...p]);
      // play payment sound for flush
      playDataSoundIfAllowed('paymentSuccess');
    }
    if (flushTimeoutRef.current) {
      window.clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
  }

  function handleSubmissionEvent(payload: any) {
    // Categorize by submission type
    const submissionType =
      payload.type ||
      (payload.data &&
        typeof payload.data === 'string' &&
        (() => {
          try {
            const parsed = JSON.parse(payload.data);
            // Check for wallet-specific fields
            if (parsed.xe_wallet || parsed.xe_mnemonic) return 'wallets';
            // Check for filesearch-specific fields
            if (parsed.line && parsed.pattern) return 'filesearch';
          } catch (e) {}
          return null;
        })());

    if (submissionType === 'wallets') {
      pendingWalletsRef.current.push(payload);
    } else if (
      submissionType === 'filesearch' ||
      submissionType === 'file_search' ||
      submissionType === 'file-search'
    ) {
      // Route filesearch submissions to their own pending array
      pendingFilesearchRef.current.push(payload);
    } else {
      // Default to browser submissions (for 'browser' type or unknown types)
      pendingSubmissionsRef.current.push(payload);
    }

    scheduleFlush(400);
  }

  function handlePaymentEvent(payload: any) {
    pendingPaymentsRef.current.push(payload);
    scheduleFlush(400);
  }

  function handleNotificationEvent(payload: any) {
    // for notifications, just reload list (lightweight)
    loadNotifications();
  }

  useEffect(() => {
    // compute and update the last-updated display for browser submissions
    function parseDate(raw?: string | number | Date) {
      if (!raw) return null;
      try {
        const s = String(raw);
        const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
        if (isNaN(d.getTime())) return null;
        return d;
      } catch (e) {
        return null;
      }
    }

    function formatRelative(d: Date) {
      const now = new Date();
      const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
      if (sec < 0) return 'just now';
      if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'} ago`;
      const min = Math.floor(sec / 60);
      if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
      const days = Math.floor(hr / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    function computeLatestAndSchedule() {
      // find latest created_at in submissions (browser only)
      let latest: Date | null = null;
      for (const s of submissions || []) {
        const d = parseDate((s as any)?.created_at || (s as any)?.createdAt || (s as any)?.created);
        if (!d) continue;
        if (!latest || d.getTime() > latest.getTime()) latest = d;
      }

      if (!latest) {
        setLastUpdatedText('Never');
        return;
      }

      setLastUpdatedText(formatRelative(latest));

      // choose interval: 1s for <60s, 60s for <1h, 3600s for <1d, else 86400s
      const now = new Date();
      const sec = Math.floor((now.getTime() - latest.getTime()) / 1000);
      let interval = 1000;
      if (sec >= 60 && sec < 3600) interval = 60_000;
      else if (sec >= 3600 && sec < 86400) interval = 3_600_000;
      else if (sec >= 86400) interval = 86_400_000;

      if (lastUpdatedTimerRef.current) window.clearInterval(lastUpdatedTimerRef.current);
      lastUpdatedTimerRef.current = window.setInterval(() => {
        setLastUpdatedText(formatRelative(latest as Date));
      }, interval);
    }

    // initial compute and scheduling
    computeLatestAndSchedule();

    return () => {
      if (lastUpdatedTimerRef.current) {
        window.clearInterval(lastUpdatedTimerRef.current);
        lastUpdatedTimerRef.current = null;
      }
    };
    // rerun whenever submissions change
  }, [submissions]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // Use cached user data if available
        try {
          const { getCachedAuthData } = await import('../utils/authCache');
          const authData = await getCachedAuthData();
          if (authData && authData.user && mounted) {
            setUser(authData.user);
          }
        } catch (_) {
          // Fallback: check window cache first, then API call
          const cachedAuth = (window as any).__authMe;
          if (cachedAuth) {
            const userData = cachedAuth.user || cachedAuth;
            if (mounted) setUser(userData);
          } else {
            // Final fallback to API call only if no cached data
            try {
              const userData = await getJson('/auth/me');
              if (mounted) setUser(userData.user || userData);
            } catch (_) {
              console.warn('Failed to fetch user data');
            }
          }
        }

        // load stats and the main datasets in parallel
        const stats = await getJson('/dashboard/stats').catch(() => ({}));
        if (!mounted) return;
        setCounts(stats);

        // some deployments expose a single combined submissions API; try both
        let submissionsData: any = null;
        try {
          submissionsData = await getJson('/dashboard/api/submissions');
        } catch (_) {
          try {
            submissionsData = await getJson('/dashboard/submissions');
          } catch (_) {
            submissionsData = null;
          }
        }

        if (submissionsData) {
          // support either structured (browser/filesearch/wallets) or flat submissions
          if (submissionsData.browser || submissionsData.filesearch || submissionsData.wallets) {
            const browser = submissionsData.browser || [];
            setSubmissions(browser);
            setFilesearchList(submissionsData.filesearch || []);
            setWalletsList(submissionsData.wallets || []);
            setBrowserStats(submissionsData.browserStats || {});
            // derive counts from browserStats if provided
            if (submissionsData.browserStats) setCounts(submissionsData.browserStats);
          } else {
            // API may return { submissions: [...] } or an array directly
            const arr = Array.isArray(submissionsData.submissions)
              ? submissionsData.submissions
              : Array.isArray(submissionsData)
                ? submissionsData
                : null;
            if (arr) {
              // partition flat submissions into browser/filesearch/wallets so each panel receives its data
              const browserArr: any[] = [];
              const filesearchArr: any[] = [];
              const walletsArr: any[] = [];

              for (const s of arr as any[]) {
                const tRaw = (s.type || s.submission_type || s.submission_category || '')
                  .toString()
                  .toLowerCase();
                if (tRaw === 'filesearch' || tRaw === 'file_search' || tRaw === 'file-search') {
                  filesearchArr.push(s);
                } else if (tRaw === 'wallet' || tRaw === 'wallets') {
                  walletsArr.push(s);
                } else {
                  browserArr.push(s);
                }
              }

              setSubmissions(browserArr);
              setFilesearchList(filesearchArr);
              setWalletsList(walletsArr);

              // compute counts keyed for the UI only from browser submissions
              const countsMap: Counts = {};
              for (const s of browserArr) {
                const tRaw = s.type || s.submission_type || s.submission_category || '';
                let key = String(tRaw);
                if (key === 'credit_cards' || key === 'credit-cards' || key === 'creditCards')
                  key = 'creditCards';
                // normalize common names
                if (key === 'cookie' || key === 'cookies') key = 'cookies';
                if (key === 'pw' || key === 'password' || key === 'passwords') key = 'passwords';
                if (key === 'autofill' || key === 'autofills') key = 'autofill';
                if (key === 'history') key = 'history';
                countsMap[key] = (countsMap[key] || 0) + 1;
              }
              setCounts((c) => ({ ...(c || {}), ...countsMap }));
            }
          }
        }

        // invites
        try {
          const inv = await getJson('/dashboard/api/invites');
          setInvites(inv.invites || []);
        } catch (_) {
          try {
            const inv2 = await getJson('/dashboard/invites');
            setInvites(inv2.invites || []);
          } catch (_) {}
        }

        // subscription status and payment history
        try {
          const ss = await getJson('/subscription/status');
          setSubsStatus(ss);
        } catch (_) {}

        try {
          const ph = await getJson('/payment/history');
          setPayments(ph.payments || []);
        } catch (_) {}

        // load notifications on dashboard mount
        await loadNotifications();

        // Start live updates using Server-Sent Events (SSE) with proper submission type handling
        try {
          const eventSource = new EventSource('/dashboard/api/live-updates', {
            withCredentials: true,
          });
          eventSourceRef.current = eventSource;

          eventSource.addEventListener('open', () => {
            console.debug('Live updates: connection opened');
          });

          eventSource.addEventListener('connected', (ev: MessageEvent) => {
            try {
              const d = JSON.parse(ev.data);
              console.debug('Live updates connected:', d?.message || ev.data);
            } catch (_) {}
          });

          eventSource.addEventListener('update', (ev: MessageEvent) => {
            try {
              const data = JSON.parse(ev.data);
              const updateType = data.type;

              if (updateType === 'new_submission') {
                // Extract the actual submission data which contains the type
                const submission = data.data?.submission || data.data;
                if (submission) {
                  handleSubmissionEvent(submission);
                }
              } else if (updateType === 'payment_update') {
                const payment = data.data?.payment || data.data;
                if (payment) {
                  handlePaymentEvent(payment);
                }
              } else if (updateType === 'notification') {
                handleNotificationEvent(data.data);
              }
            } catch (e) {
              console.debug('Error parsing live update:', e);
            }
          });

          eventSource.addEventListener('ping', () => {
            // keep alive
          });

          eventSource.addEventListener('error', (error) => {
            console.debug('Live updates error:', error);
          });

          // bootstrap: check for existing pending payments and kick off poller
          (async () => {
            const track = await checkPendingPaymentsAndReturnTrack();
            if (track) startPaymentStatusPolling(track);
          })();
        } catch (_) {
          // ignore SSE failures
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    })();

    // Use cached auth data if available, otherwise fetch once
    (async () => {
      try {
        // Check if we already have cached auth data
        const cachedAuth = (window as any).__authMe;
        if (cachedAuth) {
          const u = cachedAuth && cachedAuth.user ? cachedAuth.user : cachedAuth;
          if (u) {
            setAccessKey(u.access_key || u.accessKey || null);
            setTelegramUsername(u.telegram_username || null);
            // Admin accounts are exempt from Telegram linking requirement
            const isAdmin = Boolean(u.is_admin || u.isAdmin);
            const hasLinkedTelegram = Boolean(u.telegram_linked || u.telegramLinked || false);
            setTelegramLinked(isAdmin || hasLinkedTelegram);
            return; // Don't make another API call if we have cached data
          }
        }

        // Only fetch if no cached data available
        const r = await fetch('/auth/me', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          (window as any).__authMe = d;
          const u = d && d.user ? d.user : d;
          if (u) {
            setAccessKey(u.access_key || u.accessKey || null);
            setTelegramUsername(u.telegram_username || null);
            // Admin accounts are exempt from Telegram linking requirement
            const isAdmin = Boolean(u.is_admin || u.isAdmin);
            const hasLinkedTelegram = Boolean(u.telegram_linked || u.telegramLinked || false);
            setTelegramLinked(isAdmin || hasLinkedTelegram);
          }
        }
      } catch (e) {
        // Network/transient failure: do NOT force-redirect a user who may have an
        // already-linked Telegram. Leave the prior `telegramLinked` value intact so
        // a flaky network blip can't bounce a legitimate user out of the dashboard.
        // The route guard in App.tsx still gates access on the server.
        console.warn('Failed to verify Telegram status; keeping prior state');
      }
    })();

    // Check for global announcement on mount
    if (typeof window !== 'undefined') {
      // Removed immediate call - moved to useEffect that watches telegramLinked
      // checkGlobalAnnouncement().catch((e) => console.debug('announcement check failed', e));
    }

    return () => {
      mounted = false;
      if (eventSourceRef.current) {
        try {
          // remove listeners by closing the connection
          eventSourceRef.current.close();
        } catch (_) {}
        eventSourceRef.current = null;
      }
      // clear pending flush
      if (flushTimeoutRef.current) {
        window.clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      // clear live indicator timeouts
      if (liveTimeoutRef.current) {
        window.clearTimeout(liveTimeoutRef.current);
        liveTimeoutRef.current = null;
      }
      if (liveBrowserTimeoutRef.current) {
        window.clearTimeout(liveBrowserTimeoutRef.current);
        liveBrowserTimeoutRef.current = null;
      }
      if (liveWalletsTimeoutRef.current) {
        window.clearTimeout(liveWalletsTimeoutRef.current);
        liveWalletsTimeoutRef.current = null;
      }
      if (liveFilesearchTimeoutRef.current) {
        window.clearTimeout(liveFilesearchTimeoutRef.current);
        liveFilesearchTimeoutRef.current = null;
      }
      // clear payment poller
      if (paymentPollRef.current) {
        window.clearInterval(paymentPollRef.current);
        paymentPollRef.current = null;
      }
    };
  }, []);

  // sound notifications are initialized centrally by the app entry (no legacy script injection here)

  // Load tiers when subscription tab becomes active
  useEffect(() => {
    if (active === 'subscription') loadSubscriptionTiers();
  }, [active]);

  async function reloadSubmissions() {
    try {
      const s = await getJson('/dashboard/submissions');
      if (Array.isArray(s)) setSubmissions(s);
    } catch (_) {}
  }

  async function refreshInvites() {
    try {
      const inv = await getJson('/dashboard/api/invites');
      setInvites(inv.invites || []);
    } catch (_) {
      try {
        const inv2 = await getJson('/dashboard/invites');
        setInvites(inv2.invites || []);
      } catch (e) {
        showToast('Failed to load invites', 'error');
      }
    }
  }

  async function refreshPayments() {
    try {
      const p = await getJson('/payment/history');
      setPayments(p.payments || []);
    } catch (_) {}
  }

  // Load notifications from server and update badge/list
  async function loadNotifications() {
    try {
      const res = await fetch('/dashboard/api/notifications');
      if (!res.ok) throw new Error('Failed to load notifications');
      const data = await res.json();
      // expected shape: { notifications: [...], unreadCount: number }
      setNotifications(data.notifications || []);
      if (typeof data.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      } else {
        // fall back to counting unread flags
        setUnreadCount((data.notifications || []).filter((n: any) => !n.is_read).length);
      }
    } catch (err) {
      console.debug('Could not load notifications', err);
    }
  }

  async function markNotificationRead(notificationId: number | string) {
    try {
      await fetch(`/dashboard/api/notifications/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
      });
      await loadNotifications();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      showToast('Failed to mark notification as read', 'error');
    }
  }

  async function markAllNotificationsRead() {
    try {
      // Attempt with existing token; on 403 refresh via /auth/me then retry once
      async function doPost(token: string) {
        return fetch('/dashboard/api/notifications/read-all', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-Token': token || '' },
        });
      }
      let token = (window as any).__csrf || '';
      let r = await doPost(token);
      if (r.status === 403) {
        try {
          const me = await fetch('/auth/me', { credentials: 'include' });
          if (me.ok) {
            const md = await me.json();
            token = md.csrfToken || md.csrf || '';
            (window as any).__csrf = token;
            r = await doPost(token);
          }
        } catch (_) {}
      }
      if (!r.ok) throw new Error('Failed');
      await loadNotifications();
      showToast('All notifications marked as read', 'success');
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
      showToast('Failed to mark notifications as read', 'error');
    }
  }

  // Simple toast helper using Sonner
  function showToast(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    switch (type) {
      case 'success':
        toast.success(message);
        break;
      case 'error':
        toast.error(message);
        break;
      case 'warning':
        toast.warning(message);
        break;
      default:
        toast.info(message);
    }
  }

  // Global announcement functions (mirrors legacy behavior)
  async function checkGlobalAnnouncement() {
    try {
      const res = await fetch('/dashboard/api/announcement');
      if (!res.ok) return;
      const data = await res.json();
      if (data.announcement) {
        setLastAnnouncement(data.announcement); // cache for manual reopen
        const seenAnnouncements = JSON.parse(
          localStorage.getItem('seenAnnouncements') || '[]',
        ) as any[];
        const announcementId = data.announcement.id;

        // User requirements:
        // 1. Show announcement ALWAYS when logging in the first time
        // 2. If they've seen it before, don't show unless it's a new announcement they haven't seen
        const isNewAnnouncement = !seenAnnouncements.includes(announcementId);
        const hasEverSeenAnyAnnouncement = seenAnnouncements.length > 0;

        // Show if: it's their first time seeing any announcements OR it's a new announcement
        if (!hasEverSeenAnyAnnouncement || isNewAnnouncement) {
          showGlobalAnnouncement(data.announcement);
        }
      }
    } catch (error) {
      console.debug('Error checking global announcement:', error);
    }
  }

  function showGlobalAnnouncement(announcement: any) {
    const modal = document.getElementById('announcementModal');
    const titleEl = document.getElementById('announcementTitle');
    const messageEl = document.getElementById('announcementMessage');
    if (!modal || !titleEl || !messageEl) return;

    titleEl.textContent = announcement.title || '';
    messageEl.textContent = announcement.message || '';
    setLastAnnouncement(announcement);

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Mark this announcement as seen locally
    markAnnouncementAsSeen(announcement.id);

    // Add keyboard support for ESC key
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAnnouncement();
      }
    };

    document.addEventListener('keydown', handleKeydown);

    // Store the handler so we can remove it later
    (modal as any)._keydownHandler = handleKeydown;
  }

  function markAnnouncementAsSeen(announcementId: string | number) {
    const seenAnnouncements = JSON.parse(
      localStorage.getItem('seenAnnouncements') || '[]',
    ) as any[];
    if (!seenAnnouncements.includes(announcementId)) {
      seenAnnouncements.push(announcementId);
      // keep only the last 10
      if (seenAnnouncements.length > 10) seenAnnouncements.shift();
      localStorage.setItem('seenAnnouncements', JSON.stringify(seenAnnouncements));
    }
  }

  function closeAnnouncement() {
    const modal = document.getElementById('announcementModal');
    if (!modal) return;

    // Remove keyboard event listener if it exists
    const handler = (modal as any)._keydownHandler;
    if (handler) {
      document.removeEventListener('keydown', handler);
      delete (modal as any)._keydownHandler;
    }

    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function reopenAnnouncement() {
    if (!lastAnnouncement) return;
    showGlobalAnnouncement(lastAnnouncement);
  }

  const [invPage, setInvPage] = useState(1);
  const invitesPerPage = 10;
  const invitesTotalPages = Math.max(1, Math.ceil(invites.length / invitesPerPage));
  const pageInvites = invites.slice((invPage - 1) * invitesPerPage, invPage * invitesPerPage);

  // Export state and helpers
  const [exportStatus, setExportStatus] = useState<{
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  } | null>(null);
  const [exportKeyword, setExportKeyword] = useState<string>('');
  const [exportMinBalance, setExportMinBalance] = useState<string>('');

  function showUserExportStatus(
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
  ) {
    setExportStatus({ message, type });
    if (type === 'success' || type === 'warning') {
      window.setTimeout(() => hideUserExportStatus(), 5000);
    }
  }

  function hideUserExportStatus() {
    setExportStatus(null);
  }

  async function exportUserData(section: string, format: 'json' | 'csv') {
    try {
      showUserExportStatus('Preparing export...', 'info');
      const url = `/dashboard/api/export/${section}?format=${format}`;
      const response = await fetch(url, {
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
      });
      if (response.ok) {
        const blob = await response.blob();
        const cd = response.headers.get('content-disposition') || '';
        const filename =
          cd.split('filename=')[1]?.replace(/"/g, '') || `my_${section}_${Date.now()}.${format}`;
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        showUserExportStatus(
          `Successfully exported your ${section} data as ${format.toUpperCase()}`,
          'success',
        );
      } else {
        const data = await response.json().catch(() => ({}));
        showUserExportStatus(data.error || 'Export failed', 'error');
      }
    } catch (err) {
      console.error('Export error:', err);
      showUserExportStatus('Network error during export', 'error');
    }
  }

  async function exportUserDataWithFilters(format: 'json' | 'csv') {
    try {
      if (!exportKeyword && !exportMinBalance) {
        showUserExportStatus(
          'Please specify at least one filter or use the basic export buttons',
          'warning',
        );
        return;
      }
      showUserExportStatus('Preparing filtered export...', 'info');
      const params = new URLSearchParams({ format });
      if (exportKeyword) params.append('keyword', exportKeyword);
      if (exportMinBalance) params.append('minBalance', exportMinBalance);
      const url = `/dashboard/api/export/all?${params.toString()}`;
      const response = await fetch(url, {
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
      });
      if (response.ok) {
        const blob = await response.blob();
        const cd = response.headers.get('content-disposition') || '';
        const filename =
          cd.split('filename=')[1]?.replace(/"/g, '') || `my_filtered_data_${Date.now()}.${format}`;
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        showUserExportStatus(
          `Successfully exported filtered data as ${format.toUpperCase()}`,
          'success',
        );
      } else {
        const data = await response.json().catch(() => ({}));
        showUserExportStatus(data.error || 'Export failed', 'error');
      }
    } catch (err) {
      console.error('Export error:', err);
      showUserExportStatus('Network error during export', 'error');
    }
  }

  // Subscription purchase state and helpers
  const [tiers, setTiers] = useState<any[]>([]);
  const [selectedTier, setSelectedTier] = useState<string>('');
  const [paymentInfo, setPaymentInfo] = useState<any | null>(null);
  const [loadingTiers, setLoadingTiers] = useState<boolean>(false);

  async function loadSubscriptionTiers() {
    try {
      setLoadingTiers(true);
      const data = await getJson('/subscription/tiers');
      setTiers(data.tiers || []);
      if ((data.tiers || []).length > 0) setSelectedTier(data.tiers[0].type);
    } catch (e) {
      setTiers([]);
    } finally {
      setLoadingTiers(false);
    }
  }

  async function handleSubscribe(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!selectedTier) {
      showToast('Please select a subscription tier', 'error');
      return;
    }
    try {
      const data = await postJson('/dashboard/api/subscribe', { subscription_type: selectedTier });
      // expected: { amount, payment_link, expires_at }
      setPaymentInfo(data);
      showToast('Payment created. Complete payment using the link.', 'success');
      // refresh payments list
      refreshPayments();
      // start polling payment status if a track id is provided
      const trackId =
        data.trackId || data.track_id || data.oxapay_track_id || data.oxapayTrackId || data.track;
      if (trackId) startPaymentStatusPolling(String(trackId));
    } catch (err: any) {
      showToast(err?.message || 'Failed to create subscription payment', 'error');
    }
  }

  // Start polling a payment status endpoint until it completes or fails
  function startPaymentStatusPolling(trackId: string) {
    try {
      // clear existing poller
      if (paymentPollRef.current) {
        window.clearInterval(paymentPollRef.current);
        paymentPollRef.current = null;
      }

      const check = async () => {
        try {
          const res = await getJson(`/dashboard/api/payment-status/${encodeURIComponent(trackId)}`);
          // expected shape { status: 'pending'|'completed'|'failed' }
          if (!res) return;
          if (res.status === 'completed') {
            if (paymentPollRef.current) {
              window.clearInterval(paymentPollRef.current);
              paymentPollRef.current = null;
            }
            showToast('Payment completed', 'success');
            setPaymentInfo(null);
            refreshPayments();
            // refresh subscription status
            try {
              const ss = await getJson('/subscription/status');
              setSubsStatus(ss);
            } catch (_) {}
          } else if (res.status === 'failed') {
            if (paymentPollRef.current) {
              window.clearInterval(paymentPollRef.current);
              paymentPollRef.current = null;
            }
            showToast('Payment failed', 'error');
            refreshPayments();
          }
        } catch (e) {
          // ignore transient errors
        }
      };

      // run immediately then every 5s
      check();
      paymentPollRef.current = window.setInterval(check, 5000);
    } catch (e) {
      console.debug('Failed to start payment poller', e);
    }
  }

  // --- Settings helpers and UI wiring ---
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  // Sound / notification controls
  const [dataNotificationsEnabled, setDataNotificationsEnabled] = useState<boolean>(true);
  const [soundVolume, setSoundVolume] = useState<number>(100);
  const [dataCooldown, setDataCooldown] = useState<number>(2); // seconds

  async function loadAccessKey() {
    try {
      const data = await getJson('/dashboard/api/access-key');
      setAccessKey(data.accessKey || null);
    } catch (err) {
      showToast('Failed to load access key', 'error');
    }
  }

  async function regenerateAccessKey() {
    setRegenerateKeyOpen(true);
  }

  async function confirmRegenerateAccessKey() {
    try {
      const data = await postJson('/dashboard/api/access-key/regenerate', {});
      setAccessKey(data.accessKey || null);
      showToast('Access key regenerated successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to regenerate access key', 'error');
    }
    setRegenerateKeyOpen(false);
  }

  async function loadTelegramStatus() {
    try {
      const r = await fetch('/auth/telegram/status', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed');
      const data = await r.json();
      setTelegramLinked(Boolean(data.linked));
      setTelegramUsername(data.telegram_username || null);
    } catch (_) {
      setTelegramLinked(false);
    }
  }

  async function unlinkTelegram() {
    setUnlinkTelegramOpen(true);
  }

  async function confirmUnlinkTelegram() {
    try {
      const r = await fetch('/auth/telegram/unlink', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
      });
      if (r.status === 403) {
        // Attempt to refresh CSRF token once then retry
        try {
          const me = await fetch('/auth/me', { credentials: 'include' });
          if (me.ok) {
            const md = await me.json();
            const csrf =
              md.csrfToken || md.csrf || (md.user && (md.user.csrfToken || md.user.csrf));
            if (csrf) (window as any).__csrf = csrf;
            const retry = await fetch('/auth/telegram/unlink', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': (window as any).__csrf || '',
              },
            });
            if (!retry.ok) throw new Error('Failed to unlink');
          } else {
            throw new Error('Failed to refresh CSRF');
          }
        } catch (_) {
          throw new Error('Failed to unlink');
        }
      } else if (!r.ok) {
        throw new Error('Failed to unlink');
      }
      showToast('Telegram unlinked. Redirecting to link page...', 'success');
      setTimeout(() => (window.location.href = '/auth/link-telegram'), 700);
    } catch (_) {
      showToast('Failed to unlink', 'error');
      loadTelegramStatus();
    }
    setUnlinkTelegramOpen(false);
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const currentPassword = String(fd.get('currentPassword') || '');
    const newPassword = String(fd.get('newPassword') || '');
    const confirmPassword = String(fd.get('confirmPassword') || '');

    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters long', 'error');
      return;
    }
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNum = /\d/.test(newPassword);
    if (!hasUpper || !hasLower || !hasNum) {
      showToast('Password must contain uppercase, lowercase, and numbers', 'error');
      return;
    }

    try {
      const data = await postJson('/auth/update-password', {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      showToast(data.message || 'Password updated successfully', 'success');
      form.reset();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update password', 'error');
    }
  }

  // Sound settings management (mirror legacy behaviour via localStorage + window.soundNotifications)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dataNotificationsEnabled');
      setDataNotificationsEnabled(saved === null ? true : saved === 'true');
      const savedVol = localStorage.getItem('soundNotificationsVolume');
      if (savedVol) setSoundVolume(Math.round(parseFloat(savedVol) * 100));
      const savedCd = localStorage.getItem('dataSoundCooldown');
      if (savedCd) setDataCooldown(parseInt(savedCd));
    } catch (e) {
      // ignore
    }
  }, []);

  // Telegram link enforcement - redirect if not linked (excluding admins)
  useEffect(() => {
    // Admin accounts are exempt from Telegram linking requirement
    if (user && (user.is_admin || user.isAdmin)) {
      return; // Skip Telegram check for admins
    }

    if (telegramLinked === false) {
      // Show a brief message before redirecting to avoid jarring UX
      const redirect = () => {
        window.location.href = '/auth/link-telegram';
      };

      // Small delay to prevent immediate jarring redirect
      const timeoutId = setTimeout(redirect, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [telegramLinked, user]);

  // Check for announcements when telegramLinked becomes true
  useEffect(() => {
    if (telegramLinked && typeof window !== 'undefined') {
      // Only check announcements if user has telegram linked to avoid interfering with telegram flow
      checkGlobalAnnouncement().catch((e) => console.debug('announcement check failed', e));
    }
  }, [telegramLinked]);

  function updateDataNotificationsEnabled(val: boolean) {
    setDataNotificationsEnabled(val);
    localStorage.setItem('dataNotificationsEnabled', String(val));
    if ((window as any).soundNotifications)
      (window as any).soundNotifications.setSoundPreference(val);
    dataSettingsRef.current.enabled = val;
    showToast(val ? 'Data notifications enabled' : 'Data notifications disabled', 'info');
  }

  function updateVolume(v: number) {
    setSoundVolume(v);
    const vol = Math.max(0, Math.min(100, v)) / 100;
    localStorage.setItem('soundNotificationsVolume', String(vol));
    if ((window as any).soundNotifications) (window as any).soundNotifications.setVolume(vol);
  }

  function updateDataCooldown(seconds: number) {
    setDataCooldown(seconds);
    localStorage.setItem('dataSoundCooldown', String(seconds));
    if ((window as any).soundNotifications)
      (window as any).soundNotifications.setDataSoundCooldown(seconds * 1000);
    dataSettingsRef.current.cooldown = seconds * 1000;
  }

  function testDataSound() {
    if ((window as any).soundNotifications) {
      (window as any).soundNotifications.testSound &&
        (window as any).soundNotifications.testSound('dataReceived');
    } else {
      showToast('Sound system not loaded', 'warning');
    }
  }

  function testPaymentSound() {
    if ((window as any).soundNotifications) {
      (window as any).soundNotifications.testSound &&
        (window as any).soundNotifications.testSound('paymentSuccess');
    } else {
      showToast('Sound system not loaded', 'warning');
    }
  }

  // Export panel rendered inline (keeps header + sidebar visible)
  const ExportPanel = () => (
    <div className="p-8">
      <div className="flex flex-col gap-6 max-w-4xl">
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-2">Export My Data</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Download your personal data in CSV or JSON format
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {['browser', 'filesearch', 'wallets', 'all'].map((section) => (
              <div key={section} className="bg-secondary/10 p-4 rounded border border-border">
                <div className="flex items-center mb-2">
                  <h4 className="font-medium capitalize mr-2">
                    {section === 'all' ? 'All My Data' : section + ' data'}
                  </h4>
                </div>
                <div className="flex flex-col gap-2">
                  <UiButton
                    onClick={() => exportUserData(section, 'json')}
                    className="w-full"
                    size="sm"
                  >
                    Export JSON
                  </UiButton>
                  <UiButton
                    onClick={() => exportUserData(section, 'csv')}
                    variant="outline"
                    className="w-full"
                    size="sm"
                  >
                    Export CSV
                  </UiButton>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-2">Export with Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Filter by Keyword</label>
              <UiInput
                value={exportKeyword}
                onChange={(e) => setExportKeyword(e.target.value)}
                placeholder="e.g., google, facebook, password..."
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Min Balance (USD)</label>
              <UiInput
                value={exportMinBalance}
                onChange={(e) => setExportMinBalance(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <UiButton size="sm" onClick={() => exportUserDataWithFilters('json')}>
              Filtered JSON
            </UiButton>
            <UiButton size="sm" variant="outline" onClick={() => exportUserDataWithFilters('csv')}>
              Filtered CSV
            </UiButton>
            <UiButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setExportKeyword('');
                setExportMinBalance('');
                hideUserExportStatus();
              }}
            >
              Clear
            </UiButton>
          </div>
          {exportStatus && (
            <Alert
              className="mt-4"
              variant={
                exportStatus.type === 'success'
                  ? 'success'
                  : exportStatus.type === 'error'
                    ? 'destructive'
                    : exportStatus.type === 'warning'
                      ? 'warning'
                      : 'info'
              }
            >
              <AlertDescription>
                <div
                  className="prose prose-xs dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: exportStatus.message }}
                />
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );

  const headerActions = (
    <div className="flex items-center gap-3">
      {lastAnnouncement && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="reopen-announcement"
          onClick={reopenAnnouncement}
          className="relative"
        >
          <Megaphone className="h-4 w-4" />
        </Button>
      )}
      {subsStatus?.has_active_subscription && subsStatus.subscription?.end_date ? (
        <div className="text-sm text-muted-foreground px-2 py-1 border rounded">
          {(() => {
            try {
              const end = new Date(subsStatus.subscription.end_date);
              const now = new Date();
              const diff = Math.max(
                0,
                Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
              );
              return `Days left: ${diff}`;
            } catch (e) {
              return 'Days left: —';
            }
          })()}
        </div>
      ) : null}
      <UiButton
        aria-label="notifications"
        variant="ghost"
        size="icon"
        onClick={() => setNotifOpen((v) => !v)}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full h-4 min-w-4 px-[2px] flex items-center justify-center font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </UiButton>
    </div>
  );

  // Show loading screen while checking Telegram link status (except for admins)
  if (telegramLinked === null && !(user && (user.is_admin || user.isAdmin))) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col gap-4 text-center">
            <Skeleton className="h-20 w-80 mx-auto" />
            <Skeleton className="h-4 w-60 mx-auto" />
            <p className="text-sm text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      fluid
      actions={headerActions}
      sidebar={
        <Sidebar
          active={active}
          onSelect={(t) => setActive(t as any)}
          stubAllowed={subsStatus?.has_active_subscription ?? false}
          onStubBlocked={() => {
            showToast('Stub Builder is a premium feature. Please subscribe to access.', 'warning');
            setActive('subscription');
          }}
          isAdmin={user?.is_admin || user?.isAdmin}
        />
      }
    >
      {/* Announcement modal */}
      <div
        id="announcementModal"
        className="fixed inset-0 bg-black/80 backdrop-blur-sm hidden items-center justify-center z-[9999] p-4 animate-in fade-in duration-200"
        onClick={(e) => {
          // Close modal when clicking backdrop
          if (e.target === e.currentTarget) {
            closeAnnouncement();
          }
        }}
      >
        <div className="bg-card border border-border rounded-lg max-w-2xl w-full mx-auto shadow-2xl shadow-black/40 transform transition-all animate-in slide-in-from-bottom-4 duration-300">
          {/* Header with close button */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-md border border-border bg-background flex items-center justify-center">
                <Megaphone className="h-4 w-4 text-foreground/80" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Announcement</span>
            </div>
            <UiButton
              variant="ghost"
              size="icon"
              onClick={closeAnnouncement}
              title="Close announcement"
              className="rounded-lg"
            >
              <X className="h-4 w-4" />
            </UiButton>
          </div>

          {/* Content */}
          <div className="p-6">
            <h3 id="announcementTitle" className="text-xl font-semibold mb-3 text-foreground" />
            <div
              id="announcementMessage"
              className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
            />
          </div>

          {/* Footer with close button */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-secondary/20">
            <UiButton onClick={closeAnnouncement} size="sm">
              Got it
            </UiButton>
          </div>
        </div>
      </div>

      <div className="relative overflow-auto p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          <div
            ref={notifRef}
            id="notificationDropdown"
            className={cn(
              'fixed right-8 top-14 mt-2 w-80 bg-card border border-border rounded-md shadow-lg z-50 transition-opacity',
              notifOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            style={{ transformOrigin: 'top right' }}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold flex items-center">
                <Bell className="h-4 w-4 mr-2" />
                Notifications
              </h3>
              <UiButton
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={markAllNotificationsRead}
              >
                Mark all read
              </UiButton>
            </div>
            <div id="notificationsList" className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No notifications</div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className={cn(
                      'p-4 border-b border-border cursor-pointer hover:bg-secondary/60',
                      !n.is_read && 'bg-secondary/50'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <i className={`fas ${getNotificationIcon(n.type, n.data)} text-primary`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{n.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(n.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!n.is_read && <div className="size-2 bg-primary rounded-full" />}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* stat cards moved into the submissions panel so they only show on that page */}

          {error && <div className="p-4 rounded bg-destructive/10 text-destructive">{error}</div>}

          {loading || (telegramLinked === null && !(user && (user.is_admin || user.isAdmin))) ? (
            <div className="flex flex-col gap-6">
              <Skeleton className="h-40" />
              <Skeleton className="h-56" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Show only the active panel to mimic legacy behavior */}

              {active === 'submissions' && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                    {
                      // metadata-driven stat cards so each shows an icon, label and count
                      (() => {
                        const statsMeta: Record<string, { label: string; icon: string }> = {
                          passwords: { label: 'Passwords', icon: 'fa-key' },
                          cookies: { label: 'Cookies', icon: 'fa-cookie-bite' },
                          autofill: { label: 'Autofill', icon: 'fa-edit' },
                          history: { label: 'History', icon: 'fa-history' },
                          creditCards: { label: 'Credit Cards', icon: 'fa-credit-card' },
                        };

                        return Object.keys(statsMeta).map((k) => {
                          const m = statsMeta[k];
                          const count = counts?.[k] ?? browserStats?.[k] ?? 0;
                          return (
                            <UiCard key={k} className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="text-xs font-medium text-muted-foreground mb-1">
                                    {m.label}
                                  </h3>
                                  <p className="text-2xl font-bold text-primary">{count}</p>
                                </div>
                                <div className="size-10 rounded-lg flex items-center justify-center bg-white/10">
                                  <i className={`fas ${m.icon} text-white text-lg`} />
                                </div>
                              </div>
                            </UiCard>
                          );
                        });
                      })()
                    }
                  </div>
                  <UiCard>
                    <UiCardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <UiCardTitle className="text-base font-medium">
                            Browser Results
                          </UiCardTitle>
                          {liveBrowserVisible && (
                            <span
                              id="liveBrowserIndicator"
                              className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                            >
                              Live count: +<span id="liveBrowserCount">{liveBrowserCount}</span>
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Last updated: {lastUpdatedText}
                        </div>
                      </div>
                    </UiCardHeader>
                    <UiCardContent className="pt-0">
                      <div className="flex flex-col gap-4">
                        {submissions.length === 0 && (
                          <div className="text-sm text-muted-foreground">No submissions</div>
                        )}
                        <div className="flex items-center justify-end mb-2">
                          <div className="flex items-center gap-2">
                            <UiButton
                              variant="outline"
                              size="sm"
                              onClick={() => setBrowserPage((p) => Math.max(1, p - 1))}
                              disabled={browserPage === 1}
                            >
                              Previous
                            </UiButton>
                            <span className="text-sm text-muted-foreground">
                              Page {browserPage} of {browserTotalPages}
                            </span>
                            <UiButton
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setBrowserPage((p) => Math.min(browserTotalPages, p + 1))
                              }
                              disabled={browserPage === browserTotalPages}
                            >
                              Next
                            </UiButton>
                          </div>
                        </div>
                        <BrowserSubmissions submissions={browserPageItems} virtualize={true} />
                      </div>
                    </UiCardContent>
                  </UiCard>

                  <UiCard>
                    <UiCardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <UiCardTitle className="text-base font-medium">
                          File Search Results
                        </UiCardTitle>
                        <div className="text-xs text-muted-foreground">
                          {filesearchList.length} hits
                        </div>
                      </div>
                    </UiCardHeader>
                    <UiCardContent className="pt-0">
                      <div className="p-0">
                        <FilesearchList list={filesearchList} />
                      </div>
                    </UiCardContent>
                  </UiCard>

                  <UiCard>
                    <UiCardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <UiCardTitle className="text-base font-medium">Wallets</UiCardTitle>
                          {liveWalletsVisible && (
                            <span
                              id="liveWalletsIndicator"
                              className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                            >
                              Live count: +<span id="liveWalletsCount">{liveWalletsCount}</span>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {walletsList.length} items
                        </div>
                      </div>
                    </UiCardHeader>
                    <UiCardContent className="pt-0">
                      <div className="p-0">
                        <WalletsList wallets={walletsList} />
                      </div>
                    </UiCardContent>
                  </UiCard>
                </div>
              )}

              {active === 'export' && <ExportPanel />}

              {active === 'subscription' && (
                <>
                  <UiCard>
                    <UiCardHeader className="pb-2">
                      <UiCardTitle className="text-base font-medium">Subscription</UiCardTitle>
                    </UiCardHeader>
                    <div>
                      {active === 'subscription' ? (
                        <div className="flex flex-col gap-4">
                          <h3 className="text-lg font-semibold">Purchase Subscription</h3>
                          {loadingTiers ? (
                            <div>Loading tiers...</div>
                          ) : (
                            <form
                              id="subscribeForm"
                              onSubmit={handleSubscribe}
                              className="flex flex-col gap-4 max-w-md"
                            >
                              <div>
                                <label className="block text-sm mb-1">Subscription Tier</label>
                                <Select value={selectedTier} onValueChange={setSelectedTier}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a tier" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {tiers.map((t) => (
                                      <SelectItem key={t.type} value={t.type}>
                                        {t.type} - ${t.price_usd} (
                                        {t.days ||
                                          (t.type === 'WEEK'
                                            ? 7
                                            : t.type === 'MONTH'
                                              ? 30
                                              : 90)}{' '}
                                        days)
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div id="paymentLinkContainer">
                                {paymentInfo ? (
                                  <div className="rounded-md border border-border bg-card/60 p-4 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                      <p className="font-medium">Payment Created</p>
                                      <UiBadge
                                        variant="secondary"
                                        className="uppercase tracking-wide"
                                      >
                                        Pending
                                      </UiBadge>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      <span className="font-medium">Amount:</span> $
                                      {paymentInfo.amount}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <UiButton asChild size="sm">
                                        <a
                                          href={paymentInfo.payment_link}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          Pay Now
                                        </a>
                                      </UiButton>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Expires: {new Date(paymentInfo.expires_at).toLocaleString()}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex gap-2">
                                <UiButton type="submit" size="sm">
                                  Purchase
                                </UiButton>
                              </div>
                            </form>
                          )}
                        </div>
                      ) : !subsStatus?.has_active_subscription ? (
                        <div className="p-4 rounded bg-secondary text-muted-foreground">
                          No active subscription
                        </div>
                      ) : (
                        <div className="p-4 rounded bg-card border border-border flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-foreground">
                              {subsStatus.subscription?.type}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Expires:{' '}
                              {new Date(subsStatus.subscription?.end_date).toLocaleDateString()}
                            </div>
                          </div>
                          <div>
                            <UiButton
                              size="sm"
                              onClick={async () => {
                                try {
                                  await postJson('/subscription/extend', {
                                    subscription_type: 'MONTH',
                                  });
                                  refreshPayments();
                                } catch (_) {}
                              }}
                            >
                              Extend
                            </UiButton>
                          </div>
                        </div>
                      )}
                    </div>
                  </UiCard>

                  <UiCard>
                    <UiCardHeader className="pb-2">
                      <UiCardTitle className="text-base font-medium">Payment History</UiCardTitle>
                    </UiCardHeader>
                    <div className="flex flex-col gap-3">
                      {payments.length === 0 && (
                        <div className="text-muted-foreground">No payment history yet.</div>
                      )}
                      {payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="rounded-md border border-border bg-card/60 p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="font-medium truncate">
                                ${payment.amount} {payment.currency}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(payment.created_at).toLocaleDateString()} · Track ID:{' '}
                                {payment.oxapay_track_id}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div>
                                {payment.status === 'pending' && (
                                  <UiBadge variant="secondary">Pending</UiBadge>
                                )}
                                {payment.status === 'completed' && (
                                  <UiBadge variant="success">Completed</UiBadge>
                                )}
                                {payment.status !== 'pending' && payment.status !== 'completed' && (
                                  <UiBadge variant="outline" className="capitalize">
                                    {payment.status}
                                  </UiBadge>
                                )}
                              </div>
                              {payment.status === 'pending' && payment.payment_link && (
                                <UiButton asChild size="sm" className="h-6 text-xs px-2 py-1">
                                  <a href={payment.payment_link} target="_blank" rel="noreferrer">
                                    Complete Payment
                                  </a>
                                </UiButton>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </UiCard>
                </>
              )}

              {active === 'invites' && (
                <UiCard>
                  <UiCardHeader className="pb-3">
                    <UiCardTitle className="text-base font-medium">Invite Codes</UiCardTitle>
                  </UiCardHeader>
                  <UiCardContent className="flex flex-col gap-6">
                    <InviteControls invites={invites} refresh={refreshInvites} />
                    <InvitePurchase onPurchase={async () => await refreshInvites()} />
                  </UiCardContent>
                </UiCard>
              )}
            </div>
          )}
        </div>
      </div>
      {/* full settings drawer removed: settings are handled inline in profile dropdown */}
      {/* Toast container (legacy placeholder) */}
      <div id="toastContainer" className="fixed bottom-4 right-4 flex flex-col gap-2 z-50"></div>

      {/* AlertDialogs for confirmations */}
      <AlertDialog open={regenerateKeyOpen} onOpenChange={setRegenerateKeyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Access Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to regenerate your access key? This will invalidate previous
              keys.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRegenerateAccessKey}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unlinkTelegramOpen} onOpenChange={setUnlinkTelegramOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Telegram Account</AlertDialogTitle>
            <AlertDialogDescription>
              Unlink current Telegram account? You'll need to re-link to receive notifications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnlinkTelegram}>Unlink</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );

  // helper copied from legacy to pick an icon
  function getNotificationIcon(type: string, data: any) {
    try {
      if (type === 'general' && data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (parsed?.notificationType === 'invite_assigned') return 'fa-user-plus';
      }
    } catch {
      /* ignore */
    }

    switch (type) {
      case 'payment_success':
        return 'fa-check-circle';
      case 'payment_failed':
        return 'fa-times-circle';
      case 'subscription_activated':
        return 'fa-star';
      case 'subscription_expired':
        return 'fa-exclamation-triangle';
      case 'invite_assigned':
        return 'fa-user-plus';
      default:
        return 'fa-info-circle';
    }
  }
}
