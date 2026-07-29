import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell } from 'lucide-react';
import { Notifications } from './Notifications';
import { SettingsControls } from '@/pages/dashboard/SettingsControls';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  userInitial?: string;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
  onSettings?: () => void;
  actions?: React.ReactNode;
  showProfile?: boolean;
}

export function AppHeader({
  title = 'Flipper',
  subtitle = 'Dashboard',
  userInitial = 'U',
  userName = 'User',
  userRole = 'Member',
  onLogout,
  onSettings,
  actions,
  showProfile = true,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const handleLogout = async () => {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
      });
      // Clear any cached user data
      try {
        (window as any).__authMe = null;
        (window as any).__csrf = '';
        localStorage.clear();
      } catch (_) {}
      window.location.href = '/auth';
    } catch (error) {
      // Even if logout request fails, still redirect to clear client state
      try {
        (window as any).__authMe = null;
        (window as any).__csrf = '';
        localStorage.clear();
      } catch (_) {}
      window.location.href = '/auth';
    }
  };

  // local settings view inside profile dropdown
  const [showSettingsInline, setShowSettingsInline] = useState(false);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | string | null>(null);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [dataNotificationsEnabled, setDataNotificationsEnabled] = useState<boolean>(true);
  const [soundVolume, setSoundVolume] = useState<number>(100);
  const [dataCooldown, setDataCooldown] = useState<number>(2);
  const [totpEnabled, setTotpEnabled] = useState<boolean>(false);
  const [totpDialogOpen, setTotpDialogOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleTotpStatusChange = (enabled: boolean) => {
    setTotpEnabled(enabled);
  };

  const handleTotpDialogStateChange = (isOpen: boolean) => {
    setTotpDialogOpen(isOpen);
  };

  // displayed user info (prefer server /auth/me but fall back to props)
  const [displayName, setDisplayName] = useState<string>(userName || 'User');
  const [displayRole, setDisplayRole] = useState<string>(userRole || 'Member');

  useEffect(() => {
    if (!showProfile) return;
    let mounted = true;
    (async () => {
      try {
        // Check for cached auth data first
        const cachedAuth = (window as any).__authMe;
        if (cachedAuth && mounted) {
          const u = cachedAuth && cachedAuth.user ? cachedAuth.user : cachedAuth;
          if (u) {
            setAccessKey(u.access_key || u.accessKey || null);
            setUserId(u.id || u.userId || null);
            setLastLogin(u.last_login || u.lastLogin || null);
            setTotpEnabled(u.totp_enabled || false);
            const name = u.displayName || u.name || u.username || u.user || null;
            if (name) setDisplayName(String(name));
            const role =
              u.role ||
              u.userRole ||
              (u.is_admin || u.isAdmin ? 'Administrator' : 'Member') ||
              'Member';
            setDisplayRole(role);
            return; // Don't make API call if we have cached data
          }
        }

        // Use cached auth data instead of direct /auth/me call
        try {
          const { getCachedAuthData } = await import('../../utils/authCache');
          const authData = await getCachedAuthData();
          if (!authData || !mounted) return;

          // handle API shape { user: { ... }, csrfToken }
          const u = authData.user;
          // populate access key if present in cached auth data
          setAccessKey((u && (u.access_key || u.accessKey)) || null);
          // populate id and last login
          setUserId((u && (u.id || u.userId)) || null);
          setLastLogin((u && (u.last_login || u.lastLogin)) || null);
          setTotpEnabled((u && u.totp_enabled) || false);
          // prefer display-like fields, otherwise username
          const name = (u && (u.displayName || u.name || u.username || u.user)) || null;
          if (name) setDisplayName(String(name));
          // detect admin flag (some APIs use 1/0)
          const isAdmin = Boolean(
            u && (u.is_admin === 1 || u.is_admin === true || u.isAdmin === true),
          );
          setDisplayRole(isAdmin ? 'Admin' : 'Member');
        } catch (e) {
          // If cache fails, fallback to direct API call
          const r = await fetch('/auth/me', { credentials: 'include' });
          if (!r.ok || !mounted) return;
          const d = await r.json();
          // handle API shape { user: { ... }, csrfToken }
          const u = d && d.user ? d.user : d;
          // expose auth/me payload for other parts of the app to avoid redundant calls
          (window as any).__authMe = d;
          // populate access key if present in /auth/me
          setAccessKey((u && (u.access_key || u.accessKey)) || null);
          // populate id and last login
          setUserId((u && (u.id || u.userId)) || null);
          setLastLogin((u && (u.last_login || u.lastLogin)) || null);
          // prefer display-like fields, otherwise username
          const name = (u && (u.displayName || u.name || u.username || u.user)) || null;
          if (name) setDisplayName(String(name));
          // detect admin flag (some APIs use 1/0)
          const isAdmin = Boolean(
            u && (u.is_admin === 1 || u.is_admin === true || u.isAdmin === true),
          );
          setDisplayRole(isAdmin ? 'Admin' : 'Member');
        }
      } catch (e) {
        // ignore network errors and keep props/defaults
      }
    })();
    return () => {
      mounted = false;
    };
  }, [showProfile]);

  useEffect(() => {
    if (!showSettingsInline) return;
    // load minimal settings when opening inline settings
    (async () => {
      // avoid calling /dashboard/api/access-key if we already have it from /auth/me
      if (!accessKey) {
        try {
          // fallback: try to read from global auth payload set on mount
          const global = (window as any).__authMe;
          const u = global && global.user ? global.user : global;
          if (u && (u.access_key || u.accessKey)) {
            setAccessKey(u.access_key || u.accessKey);
          } else {
            const r = await fetch('/dashboard/api/access-key');
            if (r.ok) {
              const data = await r.json();
              setAccessKey(data.accessKey || null);
            }
          }
        } catch (e) {}
      }
      try {
        const r2 = await fetch('/auth/telegram/status', { credentials: 'include' });
        if (r2.ok) {
          const d2 = await r2.json();
          setTelegramLinked(Boolean(d2.linked));
          setTelegramUsername(d2.telegram_username || null);
        } else setTelegramLinked(false);
      } catch (e) {
        setTelegramLinked(false);
      }
      try {
        const saved = localStorage.getItem('dataNotificationsEnabled');
        setDataNotificationsEnabled(saved === null ? true : saved === 'true');
        const savedVol = localStorage.getItem('soundNotificationsVolume');
        if (savedVol) setSoundVolume(Math.round(parseFloat(savedVol) * 100));
        const savedCd = localStorage.getItem('dataSoundCooldown');
        if (savedCd) setDataCooldown(parseInt(savedCd));
      } catch (e) {}
    })();
    // soundNotifications module is initialized at app startup; no legacy script injection here
  }, [showSettingsInline]);

  // close inline settings on outside click / Escape
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!menuRef.current) return;
      // Don't close if a TOTP dialog is open
      if (totpDialogOpen) return;
      if (target && !menuRef.current.contains(target)) {
        setShowSettingsInline(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      // Don't close on Escape if a TOTP dialog is open
      if (e.key === 'Escape' && !totpDialogOpen) setShowSettingsInline(false);
    }
    if (showSettingsInline) {
      document.addEventListener('mousedown', onDocMouseDown);
      document.addEventListener('keydown', onKey);
    }
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showSettingsInline, totpDialogOpen]);

  async function confirmRegenerateAccessKey() {
    try {
      const data = await fetch('/dashboard/api/access-key/regenerate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
      });
      if (!data.ok) throw new Error('Failed');
      const d = await data.json();
      setAccessKey(d.accessKey || null);
      toast.success('Access key regenerated');
    } catch (e) {
      toast.error('Failed to regenerate access key');
    }
  }

  async function handleUnlinkTelegram() {
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
            if (!retry.ok) throw new Error('Failed');
          } else {
            throw new Error('Failed');
          }
        } catch (_) {
          throw new Error('Failed');
        }
      } else if (!r.ok) {
        throw new Error('Failed');
      }
      toast.success('Telegram unlinked. Redirecting...');
      setTimeout(() => (window.location.href = '/auth/link-telegram'), 700);
    } catch (_) {
      toast.error('Failed to unlink Telegram');
    }
  }

  function updateDataNotificationsEnabled(val: boolean) {
    setDataNotificationsEnabled(val);
    localStorage.setItem('dataNotificationsEnabled', String(val));
    try {
      if ((window as any).soundNotifications)
        (window as any).soundNotifications.setSoundPreference(val);
    } catch (e) {}
  }

  function updateVolume(v: number) {
    setSoundVolume(v);
    const vol = Math.max(0, Math.min(100, v)) / 100;
    localStorage.setItem('soundNotificationsVolume', String(vol));
    try {
      if ((window as any).soundNotifications) (window as any).soundNotifications.setVolume(vol);
    } catch (e) {}
  }

  function updateDataCooldown(seconds: number) {
    setDataCooldown(seconds);
    localStorage.setItem('dataSoundCooldown', String(seconds));
    try {
      if ((window as any).soundNotifications)
        (window as any).soundNotifications.setDataSoundCooldown(seconds * 1000);
    } catch (e) {}
  }

  function testDataSound() {
    (async () => {
      try {
        if ((window as any).soundNotifications && (window as any).soundNotifications.testSound) {
          (window as any).soundNotifications.testSound('dataReceived');
          return;
        }
      } catch (e) {}

      // Try to play bundled audio file, otherwise fallback to WebAudio beep
      try {
        const a = new Audio('/sounds/data-received.mp3');
        await a.play();
        toast.success('Played test data sound');
        return;
      } catch (e) {
        // fallback to WebAudio beep
      }

      try {
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as any;
        const ctx = new AudioCtx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.01);
        setTimeout(() => {
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
          try {
            o.stop();
            ctx.close();
          } catch (e) {}
        }, 200);
        toast.success('Played test data sound (fallback)');
      } catch (e) {
        toast.info('Sound system not available');
      }
    })();
  }

  function testPaymentSound() {
    (async () => {
      try {
        if ((window as any).soundNotifications && (window as any).soundNotifications.testSound) {
          (window as any).soundNotifications.testSound('paymentSuccess');
          return;
        }
      } catch (e) {}

      try {
        const a = new Audio('/sounds/payment-success.mp3');
        await a.play();
        toast.success('Played test payment sound');
        return;
      } catch (e) {
        // fallback to WebAudio beep
      }

      try {
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as any;
        const ctx = new AudioCtx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = 440;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.01);
        setTimeout(() => {
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
          try {
            o.stop();
            ctx.close();
          } catch (e) {}
        }, 300);
        toast.success('Played test payment sound (fallback)');
      } catch (e) {
        toast.info('Sound system not available');
      }
    })();
  }

  return (
    <header className="sticky top-0 left-0 right-0 z-50 h-14 flex items-center border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="size-7 rounded-md border border-border bg-card flex items-center justify-center">
            <span className="text-sm font-semibold text-foreground">F</span>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-sm font-semibold tracking-tight text-foreground">{title}</div>
            <div className="hidden sm:block text-xs text-muted-foreground">/ {subtitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actions ?? <Notifications />}

          {showProfile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
                >
                  <div className="text-sm text-left">
                    <div className="font-medium text-foreground leading-tight">{displayName}</div>
                    <div className="text-xs text-muted-foreground leading-tight">{displayRole}</div>
                  </div>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                side="bottom"
                sideOffset={8}
                ref={menuRef as any}
                className={cn(
                  'origin-top-right data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2',
                  showSettingsInline ? 'w-96' : 'w-28'
                )}
              >
                {!showSettingsInline ? (
                  <div>
                    <DropdownMenuItem
                      onSelect={(e: any) => {
                        try {
                          e.preventDefault();
                        } catch (err) {}
                        setShowSettingsInline(true);
                      }}
                    >
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e: any) => {
                        try {
                          e.preventDefault();
                        } catch (err) {}
                        navigate('/subscriptions');
                      }}
                    >
                      Subscriptions
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onLogout || handleLogout}>Logout</DropdownMenuItem>
                  </div>
                ) : (
                  <div className="p-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">Settings</div>
                      <button
                        onClick={() => setShowSettingsInline(false)}
                        className="p-1 rounded hover:bg-accent"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="max-h-[60vh] overflow-auto">
                      <SettingsControls
                        accessKey={accessKey}
                        onRegenerate={confirmRegenerateAccessKey}
                        telegramLinked={telegramLinked}
                        telegramUsername={telegramUsername}
                        onUnlinkTelegram={handleUnlinkTelegram}
                        dataNotificationsEnabled={dataNotificationsEnabled}
                        onToggleDataNotifications={updateDataNotificationsEnabled}
                        soundVolume={soundVolume}
                        onChangeVolume={updateVolume}
                        dataCooldown={dataCooldown}
                        onChangeCooldown={updateDataCooldown}
                        onTestDataSound={testDataSound}
                        onTestPaymentSound={testPaymentSound}
                        userId={userId}
                        lastLogin={lastLogin}
                        totpEnabled={totpEnabled}
                        onTotpStatusChange={handleTotpStatusChange}
                        onTotpDialogStateChange={handleTotpDialogStateChange}
                      />
                      <div className="mt-3 flex justify-end"></div>
                    </div>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
