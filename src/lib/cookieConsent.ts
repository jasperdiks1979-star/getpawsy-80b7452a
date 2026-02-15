/**
 * Cookie consent utilities — Safari-safe, no reloads, single localStorage key.
 */

const CONSENT_KEY = 'gp_cookie_consent';

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

/** Read current consent. Returns null if not yet decided. */
export function getConsent(): ConsentValue | null {
  const raw = safeGetItem(CONSENT_KEY);
  if (raw === 'all' || raw === 'necessary') return raw;
  return null;
}

/** Persist consent choice and update gtag consent mode. Never reloads. */
export function setConsent(value: ConsentValue): void {
  safeSetItem(CONSENT_KEY, value);
  applyGtagConsent(value);
}

/** Push a gtag consent update based on current value */
export function applyGtagConsent(value: ConsentValue): void {
  if (typeof window === 'undefined' || !window.dataLayer) return;
  // Use dataLayer.push to avoid type conflicts with gtag overloads
  window.dataLayer.push('consent', 'update', {
    analytics_storage: value === 'all' ? 'granted' : 'denied',
    ad_storage: value === 'all' ? 'granted' : 'denied',
    ad_user_data: value === 'all' ? 'granted' : 'denied',
    ad_personalization: value === 'all' ? 'granted' : 'denied',
  });
}

/** Check whether a consent value allows marketing/analytics */
export function isMarketingAllowed(consent: ConsentValue | null): boolean {
  return consent === 'all';
}
