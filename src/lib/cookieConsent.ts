/**
 * Cookie consent utilities — Safari-safe, no reloads.
 * Uses BOTH localStorage AND a first-party cookie for maximum persistence.
 */

const CONSENT_KEY = 'gp_cookie_consent';
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

/** Read current consent from localStorage OR cookie. Returns null if not yet decided. */
export function getConsent(): ConsentValue | null {
  // Check localStorage first (faster)
  const ls = safeGetItem(CONSENT_KEY);
  if (ls === 'all' || ls === 'necessary') return ls;
  // Fallback to cookie
  const ck = getCookieValue(CONSENT_KEY);
  if (ck === 'all' || ck === 'necessary') {
    // Re-sync to localStorage if cookie exists but localStorage doesn't
    safeSetItem(CONSENT_KEY, ck);
    return ck;
  }
  return null;
}

/** Persist consent choice to both localStorage AND cookie, then update gtag. */
export function setConsent(value: ConsentValue): void {
  safeSetItem(CONSENT_KEY, value);
  setCookieValue(CONSENT_KEY, value);
  applyGtagConsent(value);
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
