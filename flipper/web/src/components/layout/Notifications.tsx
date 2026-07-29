import {
  Bell as BellIcon,
  CheckCircle,
  XCircle,
  Star,
  AlertTriangle,
  UserPlus,
  Info,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import React from 'react';
import { getJson, postJson } from '../../utils/api';

export function Notifications() {
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [unreadCount, setUnreadCount] = React.useState<number>(0);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [expandedIds, setExpandedIds] = React.useState<Set<number | string>>(new Set());
  const [isAnimating, setIsAnimating] = React.useState(false);
  const ANIM_MS = 220;

  async function loadNotifications() {
    try {
      const data = await getJson('/dashboard/api/notifications');
      setNotifications(data.notifications || []);
      if (typeof data.unreadCount === 'number') setUnreadCount(data.unreadCount);
      else setUnreadCount((data.notifications || []).filter((n: any) => !n.is_read).length);
    } catch (e) {
      // ignore
    }
  }

  async function markAllNotificationsRead() {
    try {
      await postJson('/dashboard/api/notifications/read-all', {});
      await loadNotifications();
    } catch (e) {
      // ignore
    }
  }

  async function markNotificationRead(id: number | string) {
    try {
      await postJson(`/dashboard/api/notifications/${id}/read`, {});
      // optimistically update local state to avoid refetching whole list
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadCount((u) => Math.max(0, u - 1));
    } catch (e) {
      // ignore
    }
  }

  function toggleExpand(id: number | string) {
    setExpandedIds((prev) => {
      const has = prev.has(id);
      if (has) {
        // collapse with animation
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), ANIM_MS);
        return new Set();
      }

      const existing = Array.from(prev)[0];
      if (existing && existing !== id) {
        // close existing first, then open the new one to avoid both being open together
        setIsAnimating(true);
        setExpandedIds(new Set());
        setTimeout(() => {
          setExpandedIds(new Set([id]));
          markNotificationRead(id);
          setTimeout(() => setIsAnimating(false), ANIM_MS);
        }, ANIM_MS);
        return prev; // immediate return; actual state set above
      }

      // no existing open, open directly
      setExpandedIds(new Set([id]));
      markNotificationRead(id);
      return new Set([id]);
    });
  }

  function getIconForType(type: string) {
    switch (type) {
      case 'payment_success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'payment_failed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'subscription_activated':
        return <Star className="h-5 w-5 text-yellow-500" />;
      case 'subscription_expired':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'invite_assigned':
        return <UserPlus className="h-5 w-5 text-primary" />;
      default:
        return <Info className="h-5 w-5 text-muted-foreground" />;
    }
  }

  function formatShortTime(ts?: string) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return ts;
    }
  }

  React.useEffect(() => {
    // load on mount
    loadNotifications();
  }, []);

  // inject minimal CSS for hiding scrollbars if not present
  React.useEffect(() => {
    if (document.getElementById('notif-scrollbar-style')) return;
    const s = document.createElement('style');
    s.id = 'notif-scrollbar-style';
    s.innerHTML = `
      .scrollbar-hide::-webkit-scrollbar { display: none; }
      .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
    `;
    document.head.appendChild(s);
    return () => {
      // keep style (cheap) — not removing to avoid flicker on re-mounts
    };
  }, []);

  // close on outside click / escape
  React.useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!ref.current) return;
      const clickedBell = (t as Element | null)?.closest?.('[aria-label="notifications"]');
      if (clickedBell) return;
      if (t && !ref.current.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="notifications"
        onClick={async () => {
          setOpen((v) => !v);
          // refresh when opening
          if (!open) await loadNotifications();
        }}
        className="inline-flex items-center justify-center p-2 rounded-md hover:bg-secondary"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive text-white text-xs px-2 py-0.5">
            {unreadCount}
          </span>
        )}
      </button>

      <div
        className={cn(
          'fixed right-8 top-16 mt-2 w-72 bg-card border border-border rounded-lg shadow-lg z-50 transition-opacity origin-top-right',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{ transformOrigin: 'top right' }}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Notifications</h3>
          <button
            onClick={markAllNotificationsRead}
            className="text-sm text-primary hover:underline"
          >
            Mark all read
          </button>
        </div>
        <div className="p-2">
          {notifications.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            <ul className="flex flex-col gap-2 max-h-60 overflow-auto scrollbar-hide">
              {notifications.map((n) => {
                let parsedData: any = null;
                try {
                  parsedData = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
                } catch (e) {
                  parsedData = n.data;
                }
                return (
                  <li key={n.id} className="text-sm">
                    <div className={cn('p-0')}>
                      <button
                        onClick={() => toggleExpand(n.id)}
                        aria-expanded={expandedIds.has(n.id)}
                        className={cn(
                          'w-full flex items-start gap-3 py-1.5 px-3 rounded hover:bg-secondary/60 text-left cursor-pointer',
                          !n.is_read ? 'bg-secondary/50' : '',
                        )}
                      >
                        <div className="flex-shrink-0 mt-0.5">{getIconForType(n.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col">
                            <div
                              className="font-medium text-sm -mt-0.5 whitespace-normal"
                              title={n.title || 'Notification'}
                            >
                              {n.title || 'Notification'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {formatShortTime(n.created_at)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform duration-200',
                              expandedIds.has(n.id) ? 'rotate-180' : 'rotate-0',
                            )}
                            aria-hidden
                          />
                          {!n.is_read && <div className="size-2 bg-primary rounded-full" />}
                        </div>
                      </button>

                      <div
                        className={cn(
                          'overflow-hidden transition-[max-height,opacity] duration-200 ease-out',
                        )}
                        style={{
                          maxHeight: expandedIds.has(n.id) ? 400 : 0,
                          opacity: expandedIds.has(n.id) ? 1 : 0,
                        }}
                        aria-hidden={!expandedIds.has(n.id)}
                      >
                        <div className="px-3 pb-3">
                          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {n.message}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
