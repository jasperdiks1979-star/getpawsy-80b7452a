/**
 * Internal/Test Traffic Toggle
 * 
 * Cookie-first approach for tagging Jasper's NL/test sessions.
 * Works regardless of IP (4G changes), country, or device.
 * 
 * Activation:
 *   ?internal=1  → set cookie, tag all events as internal
 *   ?internal=0  → clear cookie, resume normal tracking
 * 
 * Also integrates with existing Founder Mode for backwards compat.
 */

import { getFounderModeStatus } from '@/lib/founder-mode';

const COOKIE_NAME = 'gp_internal';
const LS_KEY = 'gp_internal';
const COOKIE_MAX_AGE = 31536000; // 1 year

// ─── Cookie helpers ───────────────────────────────────────────────
const setCookie = (name: string, value: string, maxAge: number) => {
  const secure = window.location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax${secure}`;
};

const getCookie = (name: string): string | null => {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const deleteCookie = (name: string) => {
  document.cookie = `${name}=;path=/;max-age=0`;
};

// ─── Public API ───────────────────────────────────────────────────

export const setInternalTraffic = (on: boolean): void => {
  if (on) {
    setCookie(COOKIE_NAME, '1', COOKIE_MAX_AGE);
    localStorage.setItem(LS_KEY, '1');
    console.info('[Traffic] ✅ Internal traffic ON');
  } else {
    deleteCookie(COOKIE_NAME);
    localStorage.removeItem(LS_KEY);
    console.info('[Traffic] ❌ Internal traffic OFF');
  }
};

export const isInternalTraffic = (): boolean => {
  // Cookie is source of truth, localStorage is fallback
  if (getCookie(COOKIE_NAME) === '1') return true;
  if (localStorage.getItem(LS_KEY) === '1') return true;
  // Also check founder mode for backwards compat
  if (getFounderModeStatus()) return true;
  return false;
};

export interface TrafficContext {
  trafficType: 'internal' | 'external';
  testMode: boolean;
  countryHint: string;
  visitorIntent: 'test' | 'real';
  trafficSourceHint: 'google' | 'other';
}

export const getTrafficContext = (): TrafficContext => {
  const internal = isInternalTraffic();
  const referrer = document.referrer || '';
  const sourceHint: 'google' | 'other' = referrer.toLowerCase().includes('google.') ? 'google' : 'other';

  return {
    trafficType: internal ? 'internal' : 'external',
    testMode: internal,
    countryHint: 'US', // target market constant
    visitorIntent: internal ? 'test' : 'real',
    trafficSourceHint: sourceHint,
  };
};

// ─── URL param activation ─────────────────────────────────────────
/**
 * Check URL for ?internal=1 or ?internal=0 and activate/deactivate.
 * Cleans the param from URL. Call once on app boot.
 */
export const consumeInternalParamFromUrl = (): boolean => {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const val = params.get('internal');
  if (val === null) return false;

  // Clean URL immediately
  params.delete('internal');
  const clean = params.toString()
    ? `${window.location.pathname}?${params.toString()}${window.location.hash}`
    : `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, '', clean);

  if (val === '1') {
    setInternalTraffic(true);
    return true;
  } else if (val === '0') {
    setInternalTraffic(false);
    return true;
  }
  return false;
};

// ─── DataLayer push helper ────────────────────────────────────────
/**
 * Push traffic context to GTM dataLayer.
 * Non-blocking, safe if dataLayer doesn't exist.
 */
export const pushTrafficContext = (pagePath?: string): void => {
  if (typeof window === 'undefined') return;
  const ctx = getTrafficContext();
  const dl = ((window as any).dataLayer = (window as any).dataLayer || []);

  // Context event (fires before page_view)
  dl.push({
    event: 'gp_traffic_context',
    traffic_type: ctx.trafficType,
    traffic_country_target: ctx.countryHint,
    visitor_intent: ctx.visitorIntent,
    traffic_source_hint: ctx.trafficSourceHint,
  });

  // Virtual page view with traffic enrichment
  dl.push({
    event: 'gp_virtual_page_view',
    page_location: window.location.href,
    page_path: pagePath || window.location.pathname,
    page_title: document.title,
    traffic_type: ctx.trafficType,
    visitor_intent: ctx.visitorIntent,
    traffic_source_hint: ctx.trafficSourceHint,
  });
};
