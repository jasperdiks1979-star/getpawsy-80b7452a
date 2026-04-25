/**
 * Cookie consent utilities — Safari-safe, no reloads.
 * Uses BOTH localStorage AND a first-party cookie for maximum persistence.
 */

const CONSENT_KEY = 'gp_cookie_consent';
const CONSENT_VERSION = 'v1'; // bump to v2 to re-prompt users after policy change
const COOKIE_MAX_AGE = 31536000; // 1 year in seconds

export type ConsentValue = 'all' | 'necessary';

/** Safely read from localStorage (returns null on any error) */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safely write to localStorage (no-op on error) */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Safari private mode or quota exceeded — silently ignore
  }
}

/** Read consent from cookie */
function getCookieValue(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Write consent to cookie */
function setCookieValue(name: string, value: string): void {
  try {
    // Use SameSite=Lax, Secure, 1-year expiry
    const parts = [
      `${name}=${encodeURIComponent(value)}`,
      `path=/`,
      `max-age=${COOKIE_MAX_AGE}`,
      `SameSite=Lax`,
    ];
    // Only add Secure on HTTPS (not localhost)
    if (window.location.protocol === 'https:') {
      parts.push('Secure');
    }
    document.cookie = parts.join('; ');
  } catch {
    // Silently ignore
  }
}

/** Parse a versioned consent string like "v1:all" */
function parseVersionedConsent(raw: string | null): ConsentValue | null {
  if (!raw) return null;
  // Support versioned format "v1:all" and legacy format "all"
  if (raw.startsWith(`${CONSENT_VERSION}:`)) {
    const val = raw.slice(CONSENT_VERSION.length + 1);
    if (val === 'all' || val === 'necessary') return val;
  }
  // Legacy unversioned — accept but migrate on next set
  if (raw === 'all' || raw === 'necessary') return raw;
  return null;
}

/** Read current consent from localStorage OR cookie. Returns null if not yet decided. */
export function getConsent(): ConsentValue | null {
  // Check localStorage first (faster)
  const ls = parseVersionedConsent(safeGetItem(CONSENT_KEY));
  if (ls) return ls;
  // Fallback to cookie
  const ck = parseVersionedConsent(getCookieValue(CONSENT_KEY));
  if (ck) {
    // Re-sync to localStorage if cookie exists but localStorage doesn't
    safeSetItem(CONSENT_KEY, `${CONSENT_VERSION}:${ck}`);
    return ck;
  }
  return null;
}

/** Persist consent choice to both localStorage AND cookie, then update gtag. */
export function setConsent(value: ConsentValue): void {
  const versioned = `${CONSENT_VERSION}:${value}`;
  safeSetItem(CONSENT_KEY, versioned);
  setCookieValue(CONSENT_KEY, versioned);
  applyGtagConsent(value);
  // Mirror to TikTok pixel + expose state for the dev debug panel
  try {
    const w = window as any;
    if (value === 'all') {
      w.ttq?.grantConsent?.();
      w.__ttqConsent = 'granted';
    } else {
      w.ttq?.revokeConsent?.();
      w.__ttqConsent = 'revoked';
    }
  } catch { /* ignore */ }
}

/** Push a gtag consent update based on current value */
export function applyGtagConsent(value: ConsentValue): void {
  if (typeof window === 'undefined') return;
  try {
    // Use the gtag function if available (correct API), fallback to dataLayer
    const w = window as any;
    if (typeof w.gtag === 'function') {
      w.gtag('consent', 'update', {
        analytics_storage: value === 'all' ? 'granted' : 'denied',
        ad_storage: value === 'all' ? 'granted' : 'denied',
        ad_user_data: value === 'all' ? 'granted' : 'denied',
        ad_personalization: value === 'all' ? 'granted' : 'denied',
      });
    } else {
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({
        event: 'consent_update',
        analytics_storage: value === 'all' ? 'granted' : 'denied',
        ad_storage: value === 'all' ? 'granted' : 'denied',
        ad_user_data: value === 'all' ? 'granted' : 'denied',
        ad_personalization: value === 'all' ? 'granted' : 'denied',
      });
    }
  } catch (e) {
    console.warn('[CookieConsent] gtag consent update failed (non-fatal):', e);
  }
}

/** Check whether a consent value allows marketing/analytics */
export function isMarketingAllowed(consent: ConsentValue | null): boolean {
  return consent === 'all';
}
