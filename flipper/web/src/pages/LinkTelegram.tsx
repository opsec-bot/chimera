import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getJson, postJson } from '../utils/api';
import { PageLayout } from '../components/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export function LinkTelegram() {
  const [linked, setLinked] = useState(false);
  const [code, setCode] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [botConfigError, setBotConfigError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const pollRef = useRef<number | null>(null);
  const ADMIN_CONTACT = '@telehecker';
  const ERROR_CODE = 'LT-ERR-20250825-01';

  useEffect(() => {
    (async () => {
      try {
        // ensure CSRF token is available (especially after signup/login)
        try {
          // Check for cached auth data first
          const cachedAuth = (window as any).__authMe;
          if (cachedAuth && (cachedAuth.csrfToken || cachedAuth.csrf)) {
            (window as any).__csrf = cachedAuth.csrfToken || cachedAuth.csrf || '';
          } else {
            // Only fetch if no cached CSRF token
            const meResp = await fetch('/auth/me', { credentials: 'include' });
            if (meResp.ok) {
              const me = await meResp.json();
              (window as any).__authMe = me;
              (window as any).__csrf = me.csrfToken || me.csrf || '';
            }
          }
        } catch (_) {}

        const info = await getJson('/auth/telegram/bot-info');
        // If the bot is disabled/unconfigured, show a server error with a reference code
        if (
          info &&
          info.enabled === false &&
          info.configured === false &&
          (info.bot_username === null || info.bot_username === undefined)
        ) {
          setBotConfigError(ERROR_CODE);
          setStatus('Telegram bot is not configured on the server');
          return;
        }
        if (info?.bot_username) setBotUsername(info.bot_username);
        await initLink();
      } catch (_) {}
    })();

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function initLink() {
    setStatus('Generating code...');
    try {
      const data = await postJson('/auth/telegram/init-link', {});
      if (data.code) {
        setCode(data.code);
        setStatus('');
        startPollStatus();
      } else if (data.linked) {
        setLinked(true);
        setStatus('');
      }
    } catch (_) {
      setStatus('Failed to generate code');
    }
  }

  function startPollStatus() {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await getJson('/auth/telegram/status');
        if (s.linked) {
          setLinked(true);
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch (_) {
        // ignore transient errors
      }
    }, 3000) as unknown as number;
  }

  function copyCommand() {
    try {
      navigator.clipboard.writeText('/link ' + code);
      setStatus('Copied to clipboard');
      setTimeout(() => setStatus(''), 1500);
    } catch (_) {
      setStatus('Copy failed');
    }
  }

  if (linked)
    return (
      <PageLayout>
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold tracking-tight">
                Telegram linked
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Your Telegram account is linked. You can now continue to the dashboard.
              </p>
              <Link to="/dashboard" className="self-start">
                <Button size="sm">Go to dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );

  return (
    <PageLayout>
      <div className="fixed left-0 right-0 top-14 bottom-0 flex items-center justify-center overflow-hidden px-4">
        <div className="pointer-events-auto w-full max-w-md">
          {botConfigError ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">
                  Server error
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Telegram integration is not configured on the server. Contact administrator:{' '}
                  <a
                    className="font-medium text-foreground underline underline-offset-4"
                    href={`https://t.me/${ADMIN_CONTACT.replace('@', '')}`}
                  >
                    {ADMIN_CONTACT}
                  </a>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  ref: {botConfigError}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">
                  Link your Telegram
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Send the command below to our bot to link your account.
                </p>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Telegram command
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={`/link ${code || ''}`.trim()}
                      onClick={copyCommand}
                      className="cursor-pointer select-all font-mono"
                    />
                    <Button onClick={copyCommand} variant="outline" size="sm">
                      Copy
                    </Button>
                    <Button onClick={initLink} variant="outline" size="sm">
                      Regenerate
                    </Button>
                  </div>
                </div>

                {botUsername && (
                  <p className="text-sm text-muted-foreground">
                    Open bot:{' '}
                    <a
                      className="font-medium text-foreground underline underline-offset-4"
                      href={`https://t.me/${botUsername}`}
                    >
                      @{botUsername}
                    </a>
                  </p>
                )}

                {status && <p className="text-xs text-muted-foreground">{status}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
