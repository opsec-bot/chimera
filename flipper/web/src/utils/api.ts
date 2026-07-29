export async function getJson(path: string) {
  const r = await fetch(path, { credentials: 'include' });
  // read as text first so we can give a helpful error when server returns HTML or plain text
  const txt = await r.text();
  // try to parse JSON, but catch parse errors to surface useful info
  try {
    const data = txt ? JSON.parse(txt) : {};
    if (!r.ok) throw new Error((data && (data.error || data.message)) || 'HTTP ' + r.status);
    return data;
  } catch (err) {
    // JSON parse failed — likely the server returned HTML (redirect/login page) or plain text
    const snippet = txt ? txt.slice(0, 500) : '<empty response body>';
    throw new Error(`Non-JSON response from ${path}: HTTP ${r.status}. Preview: ${snippet}`);
  }
}

/**
 * Helper function to get CSRF token from cache or fetch fresh
 */
async function getCSRFToken(): Promise<string> {
  // Avoid triggering auth calls on the public landing page
  try {
    if (typeof window !== 'undefined' && window.location && window.location.pathname === '/') {
      return '';
    }
  } catch {}

  // Try cached token first
  const { getCachedCSRFToken } = await import('./authCache');
  let token = getCachedCSRFToken();

  if (!token) {
    // If no cached token, try to get fresh auth data
    try {
      const { getCachedAuthData } = await import('./authCache');
      const authData = await getCachedAuthData();
      token = authData?.csrfToken || '';
    } catch (_) {
      // Final fallback to direct API call
      try {
        // Do not call /auth/me on landing page
        if (typeof window !== 'undefined' && window.location && window.location.pathname !== '/') {
          const me = await fetch('/auth/me', { credentials: 'include' });
          if (me.ok) {
            const jm = await me.json();
            token = jm.csrfToken || jm.csrf || '';
            (window as any).__csrf = token;
          }
        }
      } catch (_) {}
    }
  }

  return token;
}

export async function postJson(path: string, body: any) {
  async function doPost(token: string) {
    return fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token || '' },
      body: JSON.stringify(body),
    });
  }

  let token = await getCSRFToken();
  let r = await doPost(token);

  // If CSRF failed, try to refresh token once more
  if (r.status === 403) {
    try {
      const { getCachedAuthData, clearAuthCache } = await import('./authCache');
      // Clear cache and fetch fresh
      clearAuthCache();
      const authData = await getCachedAuthData();
      if (authData) {
        token = authData.csrfToken || '';
        (window as any).__csrf = token;
        r = await doPost(token);
      }
    } catch (_) {}
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
  return data;
}

export async function putJson(path: string, body: any) {
  async function doPut(token: string) {
    return fetch(path, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token || '' },
      body: JSON.stringify(body),
    });
  }

  let token = await getCSRFToken();
  let r = await doPut(token);

  // If CSRF failed, try to refresh token once more
  if (r.status === 403) {
    try {
      const { getCachedAuthData, clearAuthCache } = await import('./authCache');
      // Clear cache and fetch fresh
      clearAuthCache();
      const authData = await getCachedAuthData();
      if (authData) {
        token = authData.csrfToken || '';
        (window as any).__csrf = token;
        r = await doPut(token);
      }
    } catch (_) {}
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
  return data;
}
