/**
 * Founder Mode — Anti-pollution analytics guard
 * 
 * Ensures founder/test traffic NEVER pollutes GA4 conversion data.
 * Persists across sessions via localStorage + cookie.
 * Activation: ?gp_key=<secret> | localStorage | cookie | founder email match
 * 
 * NEVER exposes the secret key in UI or logs.
 */

const LS_KEY = 'gp_founder';
const COOKIE_KEY = 'gp_founder';
const KEY_PARAM = 'gp_key';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

// ─── Cookie helpers ───────────────────────────────────────────────
const setCookie = (name: string, value: string, maxAge: number) => {
  document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

const getCookie = (name: string): string | null => {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const deleteCookie = (name: string) => {
  document.cookie = `${name}=;path=/;max-age=0`;
};

// ─── Founder email allowlist ──────────────────────────────────────
const getFounderEmails = (): string[] => {
  const raw = import.meta.env.VITE_FOUNDER_EMAILS;
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
};

// ─── Secret key from env ──────────────────────────────────────────
// SECURITY: VITE_* env vars are inlined into the public client bundle, so a
// secret URL key MUST NOT live there. URL-based activation is disabled; use
// /founder-mode toggle (authenticated) or the founder-email allowlist.
const getFounderKey = (): string | null => null;

// ─── Core detection ───────────────────────────────────────────────
let _cachedStatus: boolean | null = null;

/**
 * Returns true if this device/session is in Founder Mode.
 * Result is cached for the lifetime of the page to avoid repeated checks.
 */
export const getFounderModeStatus = (): boolean => {
  if (_cachedStatus !== null) return _cachedStatus;

  if (typeof window !== 'undefined') {
    // Check localStorage
    if (localStorage.getItem(LS_KEY) === '1') {
      _cachedStatus = true;
      return true;
    }

    // Check cookie
    if (getCookie(COOKIE_KEY) === '1') {
      _cachedStatus = true;
      localStorage.setItem(LS_KEY, '1');
      return true;
    }
  }

  _cachedStatus = false;
  return false;
};

/**
 * Check URL for ?gp_key=<secret>, activate if valid, clean URL.
 * Call ONCE on app boot, BEFORE analytics init.
 * Returns true if founder mode was just activated via key.
 */
export const consumeFounderKeyFromUrl = (): boolean => {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get(KEY_PARAM);

  if (!urlKey) return false;

  const expectedKey = getFounderKey();

  // Always clean the key from URL immediately (never leave secret in address bar)
  params.delete(KEY_PARAM);
  const cleanUrl = params.toString()
    ? `${window.location.pathname}?${params.toString()}${window.location.hash}`
    : `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, '', cleanUrl);

  if (expectedKey && urlKey === expectedKey) {
    enableFounderMode();
    return true;
  }

  console.warn('[FounderMode] Invalid key provided — ignored');
  return false;
};

/**
 * Check if a given email matches the founder allowlist.
 * If matched, auto-enables founder mode.
 */
export const isFounderEmail = (email: string): boolean => {
  const allowlist = getFounderEmails();
  if (allowlist.length === 0) return false;
  const match = allowlist.includes(email.trim().toLowerCase());
  if (match && !getFounderModeStatus()) {
    enableFounderMode();
  }
  return match;
};

// ─── Activation / Deactivation ────────────────────────────────────
export const enableFounderMode = () => {
  localStorage.setItem(LS_KEY, '1');
  setCookie(COOKIE_KEY, '1', COOKIE_MAX_AGE);
  _cachedStatus = true;
  console.info('[FounderMode] ✅ Enabled — analytics will be suppressed on this device');
};

export const disableFounderMode = () => {
  localStorage.removeItem(LS_KEY);
  deleteCookie(COOKIE_KEY);
  _cachedStatus = false;
  console.info('[FounderMode] ❌ Disabled — analytics will fire normally');
};

// ─── Event log for debug panel ────────────────────────────────────
interface FounderEventLog {
  name: string;
  suppressed: boolean;
  timestamp: number;
}

const _eventLog: FounderEventLog[] = [];
const MAX_LOG = 20;

export const logFounderEvent = (name: string, suppressed: boolean) => {
  _eventLog.unshift({ name, suppressed, timestamp: Date.now() });
  if (_eventLog.length > MAX_LOG) _eventLog.length = MAX_LOG;
};

export const getFounderEventLog = (): FounderEventLog[] => [..._eventLog];

// ─── Traffic type helper ──────────────────────────────────────────
export const getTrafficType = (): 'internal' | 'external' => {
  return getFounderModeStatus() ? 'internal' : 'external';
};
