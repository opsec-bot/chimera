/**
 * Auth data caching utility with automatic refresh
 */

interface CachedAuthData {
  user: any;
  csrfToken: string;
  accessKey?: string;
  lastFetched: number;
}

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds (increased from 5)
const ACCESS_KEY_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for access key (increased from 2)

/**
 * Get cached auth data, fetching if expired or missing
 */
export async function getCachedAuthData(): Promise<CachedAuthData | null> {
  try {
    // Do not attempt auth fetches on the public landing page
    try {
      if (typeof window !== 'undefined' && window.location && window.location.pathname === '/') {
        return null;
      }
    } catch {}

    const cached = (window as any).__authMe as CachedAuthData;
    const now = Date.now();

    // Check if we have valid cached data
    if (cached && cached.lastFetched && now - cached.lastFetched < CACHE_DURATION) {
      return cached;
    }

    // Fetch fresh data
    const response = await fetch('/auth/me', { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json().catch(() => ({} as any));
    const authData: CachedAuthData = {
      user: data.user,
      csrfToken: data.csrfToken,
      lastFetched: now,
    };

    // Cache the response
    (window as any).__authMe = authData;
    (window as any).__csrf = data.csrfToken;

    return authData;
  } catch (error) {
    console.error('Failed to get cached auth data:', error);
    return null;
  }
}

/**
 * Get cached access key, fetching if expired or missing
 */
export async function getCachedAccessKey(): Promise<string | null> {
  try {
    const cached = (window as any).__authMe as CachedAuthData;
    const now = Date.now();

    // Check if we have a recent access key
    if (
      cached?.accessKey &&
      cached.lastFetched &&
      now - cached.lastFetched < ACCESS_KEY_CACHE_DURATION
    ) {
      return cached.accessKey;
    }

    // Fetch fresh access key
    const response = await fetch('/dashboard/api/access-key', { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json().catch(() => ({} as any));
    const accessKey = data.accessKey;

    // Update cached data with new access key
    if (cached) {
      cached.accessKey = accessKey;
      cached.lastFetched = now;
    }

    return accessKey;
  } catch (error) {
    console.error('Failed to get cached access key:', error);
    return null;
  }
}

/**
 * Update cached access key (used after regeneration)
 */
export function updateCachedAccessKey(newAccessKey: string): void {
  const cached = (window as any).__authMe as CachedAuthData;
  if (cached) {
    cached.accessKey = newAccessKey;
    cached.lastFetched = Date.now();
  }
}

/**
 * Clear all cached auth data
 */
export function clearAuthCache(): void {
  (window as any).__authMe = null;
  (window as any).__csrf = '';
}

/**
 * Get cached CSRF token only (without full auth data fetch)
 */
export function getCachedCSRFToken(): string {
  const cached = (window as any).__authMe as CachedAuthData;
  return cached?.csrfToken || (window as any).__csrf || '';
}

/**
 * Safely get cached auth data with fallback to direct API call
 * This is a convenience method that handles errors gracefully
 */
export async function getCachedAuthDataSafe(): Promise<CachedAuthData | null> {
  try {
    return await getCachedAuthData();
  } catch (error) {
    console.debug('Auth cache failed, falling back to direct API call');
    // Clear potentially corrupted cache
    clearAuthCache();
    return null;
  }
}
