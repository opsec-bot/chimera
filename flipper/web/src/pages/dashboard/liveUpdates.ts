type StartLiveOpts = {
  url?: string;
  onAddSubmissions: (items: any[]) => void;
  onAddPayments: (items: any[]) => void;
  onNotification: (payload: any) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  playDataSoundIfAllowed: (kind: 'dataReceived' | 'paymentSuccess') => void;
  setLiveIndicator: (count: number, visible: boolean) => void;
};

export function startLiveUpdates(opts: StartLiveOpts) {
  const url = opts.url || '/dashboard/api/live-updates';
  let es: EventSource | null = null;
  let shouldReconnect = true;
  let reconnectDelay = 1000; // start with 1s
  let reconnectTimer: number | null = null;

  // batching
  const pendingSubmissions: any[] = [];
  const pendingPayments: any[] = [];
  let flushTimeout: number | null = null;
  let lastToastAt = 0;
  const toastCooldown = 3000;

  function scheduleFlush(delay = 400) {
    if (flushTimeout) window.clearTimeout(flushTimeout);
    flushTimeout = window.setTimeout(() => flushPending(), delay);
  }

  function flushPending() {
    if (pendingSubmissions.length > 0) {
      const batch = pendingSubmissions.splice(0, pendingSubmissions.length);
      // prepend newest first (legacy behavior)
      opts.onAddSubmissions(batch.reverse());
      opts.setLiveIndicator(batch.length, true);
      if (flushTimeout) {
        window.clearTimeout(flushTimeout);
        flushTimeout = null;
      }
      const now = Date.now();
      if (now - lastToastAt > toastCooldown) {
        lastToastAt = now;
        // build a compact summary grouped by type when possible
        try {
          const typeGroups: Record<string, number> = batch.reduce((acc: any, s: any) => {
            const t = s.type || (s.data && s.data.type) || 'item';
            acc[t] = (acc[t] || 0) + 1;
            return acc;
          }, {});
          const summary = Object.entries(typeGroups)
            .map(([k, v]) => `${v} ${k}${v > 1 ? 's' : ''}`)
            .join(', ');
          opts.showToast(
            `${batch.length} new submission${batch.length > 1 ? 's' : ''}${summary ? `: ${summary}` : ''}`,
            'info',
          );
        } catch (e) {
          opts.showToast(`${batch.length} new submission${batch.length > 1 ? 's' : ''}`, 'info');
        }
      }
      opts.playDataSoundIfAllowed('dataReceived');
    }

    if (pendingPayments.length > 0) {
      const batch = pendingPayments.splice(0, pendingPayments.length);
      opts.onAddPayments(batch.reverse());
      opts.playDataSoundIfAllowed('paymentSuccess');
    }
    if (flushTimeout) {
      window.clearTimeout(flushTimeout);
      flushTimeout = null;
    }
  }

  function handleIncoming(kind: 'submission' | 'payment' | 'notification' | 'update', data: any) {
    if (kind === 'submission') {
      pendingSubmissions.push(data);
      scheduleFlush();
    } else if (kind === 'payment') {
      pendingPayments.push(data);
      scheduleFlush();
    } else if (kind === 'notification') {
      opts.onNotification(data);
    } else if (kind === 'update' && data) {
      // envelope style: { type, data }
      const t = data.type;
      const d = data.data || data.payload || data;
      if (t === 'new_submission' || t === 'submission') handleIncoming('submission', d);
      else if (t === 'payment_update' || t === 'payment') handleIncoming('payment', d);
      else if (t === 'notification') handleIncoming('notification', d);
    }
  }

  function connect() {
    try {
      if (!(typeof window !== 'undefined' && 'EventSource' in window)) return;
      // close previous if any
      if (es) {
        try {
          es.close();
        } catch (_) {}
        es = null;
      }

      // use credentials so cookies/session are sent
      // @ts-ignore - some TS lib defs may not include init param
      es = new EventSource(url, { withCredentials: true });

      es.addEventListener('open', () => {
        // reset reconnect backoff
        reconnectDelay = 1000;
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        console.debug('Live updates: connection opened');
      });

      es.addEventListener('connected', (ev: MessageEvent) => {
        try {
          const d = JSON.parse(ev.data);
          console.debug('Live updates connected:', d?.message || ev.data);
        } catch (_) {}
      });

      es.addEventListener('update', (ev: MessageEvent) => {
        try {
          const d = JSON.parse(ev.data);
          handleIncoming('update', d);
        } catch (_) {}
      });

      es.addEventListener('ping', () => {
        // keep alive
      });

      es.addEventListener('submission', (ev: MessageEvent) => {
        try {
          const d = JSON.parse(ev.data);
          handleIncoming('submission', d.payload ?? d);
        } catch (_) {}
      });

      es.addEventListener('payment', (ev: MessageEvent) => {
        try {
          const d = JSON.parse(ev.data);
          handleIncoming('payment', d.payload ?? d);
        } catch (_) {}
      });

      es.addEventListener('notification', (ev: MessageEvent) => {
        try {
          const d = JSON.parse(ev.data);
          handleIncoming('notification', d.payload ?? d);
        } catch (_) {}
      });

      // fallback generic message
      es.addEventListener('message', (ev: MessageEvent) => {
        try {
          const d = JSON.parse(ev.data);
          if (d?.type) handleIncoming(d.type as any, d.payload ?? d.data ?? d);
        } catch (_) {}
      });

      es.addEventListener('error', (ev) => {
        console.warn('Live updates error', ev);
        // EventSource will try to reconnect automatically in many browsers,
        // but implement our own reconnect/backoff in case of persistent failures
        if (!shouldReconnect) return;
        try {
          // if readyState is CLOSED (2), attempt reconnect after backoff
          // @ts-ignore
          const state = es && (es as any).readyState;
          if (state === EventSource.CLOSED || state === 2) {
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
              // exponential backoff with cap
              reconnectDelay = Math.min(reconnectDelay * 2, 30000);
              connect();
            }, reconnectDelay);
          }
        } catch (_) {}
      });
    } catch (e) {
      console.debug('Failed to start live updates', e);
      if (shouldReconnect) {
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      }
    }
  }

  // start first connection
  connect();

  return {
    close() {
      shouldReconnect = false;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (es) {
        try {
          es.close();
        } catch (_) {}
        es = null;
      }
      if (flushTimeout) {
        window.clearTimeout(flushTimeout);
        flushTimeout = null;
      }
    },
  };
}
