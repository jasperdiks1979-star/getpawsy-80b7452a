/**
 * utmNormalizer — single source of truth for UTM attribution across the
 * entire site. Every redirect, deep-link, tracker and reporting surface
 * MUST go through these helpers so that utm_source / utm_campaign /
 * utm_content stay consistent end-to-end.
 *
 * Why this exists:
 *   The TikTok funnel (TikTok ad → /go → /products/:slug → /product/:slug
 *   → checkout) historically dropped UTMs at every redirect/rewrite. Each
 *   page reinvented its own merge logic, causing PDP visits to lose
 *   utm_campaign=hookN and the dashboard to under-report. This module
 *   centralizes the rules so a fix only has to live in one place.
 *
 * Resolution priority (highest first):
 *   1. Explicit URL query params on the current request.
 *   2. sessionStorage cache (set by an earlier page in the session).
 *   3. Inferred source from the previous internal path or external
 *      referrer (e.g. coming from /go ⇒ tiktok, from pinterest.com ⇒
 *      pinterest).
 *   4. Caller-supplied fallback (e.g. a deep-link button's default).
 *
 * Persistence:
 *   Whatever we resolve is mirrored into sessionStorage so subsequent
 *   pages in the same session can fall back to it. We NEVER overwrite a
 *   stored value with null/undefined.
 */

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];

export type UtmRecord = Partial<Record<UtmKey, string | null>>;

const SESSION_PREV_PATH = 'gp_internal_prev_path';

function safeSession(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function safeLocal(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Long-lived UTM persistence (30-day attribution window).
 * Survives tab close so a returning visitor who completes checkout
 * 2 days after a TikTok ad click still attributes the purchase to
 * the original utm_campaign / utm_content.
 *
 * Keyed independently of session keys so we can read both layers and
 * pick the freshest non-null value.
 */
const LOCAL_UTM_PREFIX = 'gp_utm_';
const LOCAL_UTM_TS_KEY = 'gp_utm_ts';
const LOCAL_UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function readLocalUtm(): UtmRecord {
  const store = safeLocal();
  if (!store) return {};
  const ts = Number(store.getItem(LOCAL_UTM_TS_KEY) || 0);
  if (!ts || Date.now() - ts > LOCAL_UTM_TTL_MS) return {};
  const out: UtmRecord = {};
  for (const key of UTM_KEYS) {
    const value = store.getItem(LOCAL_UTM_PREFIX + key);
    if (value) out[key] = value;
  }
  return out;
}

function writeLocalUtm(utm: UtmRecord): void {
  const store = safeLocal();
  if (!store) return;
  let wrote = false;
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (value) {
      try {
        store.setItem(LOCAL_UTM_PREFIX + key, value);
        wrote = true;
      } catch {
        /* quota — non-fatal */
      }
    }
  }
  if (wrote) {
    try {
      store.setItem(LOCAL_UTM_TS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }
}

function readSearch(input?: string | URLSearchParams | null): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === 'string') {
    return new URLSearchParams(input.startsWith('?') ? input.slice(1) : input);
  }
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams();
}

/** Pure helper: pull the standard UTM keys out of a search-string-like input. */
export function readUtmFromSearch(
  input?: string | URLSearchParams | null,
): UtmRecord {
  const params = readSearch(input);
  const out: UtmRecord = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

/** Read the cached UTMs persisted by an earlier page in this session. */
export function readUtmFromSession(): UtmRecord {
  const store = safeSession();
  if (!store) return {};
  const out: UtmRecord = {};
  for (const key of UTM_KEYS) {
    const value = store.getItem(key);
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Persist a UTM record into sessionStorage. Only writes truthy values so
 * we never clobber an earlier page's source with a later page's null.
 */
export function persistUtmToSession(utm: UtmRecord): void {
  const store = safeSession();
  if (!store) return;
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (value) {
      try {
        store.setItem(key, value);
      } catch {
        /* private mode / quota — non-fatal */
      }
    }
  }
}

function isPinterestInApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('pinterest');
}

/** Inference rules used when neither URL nor session carry an explicit source. */
export function inferUtm(opts?: {
  internalReferrer?: string | null;
  externalReferrer?: string | null;
}): UtmRecord {
  const store = safeSession();
  const internalReferrer =
    opts?.internalReferrer ?? store?.getItem(SESSION_PREV_PATH) ?? '';
  const externalReferrer =
    opts?.externalReferrer ??
    (typeof document !== 'undefined' ? document.referrer : '') ??
    '';

  const cameFromGo =
    internalReferrer === '/go' || internalReferrer.startsWith('/go?');
  const referrerIsTikTok = /(?:^|\.)tiktok\.com/i.test(externalReferrer);
  const isTikTok = cameFromGo || referrerIsTikTok;

  if (isTikTok) {
    return { utm_source: 'tiktok', utm_medium: 'social' };
  }

  const hasPinterestParam = (() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    return p.has('epik') || p.has('pin_id');
  })();
  if (hasPinterestParam || isPinterestInApp()) {
    return {
      utm_source: 'pinterest',
      utm_medium: 'social',
      utm_campaign: 'pinterest_auto',
    };
  }

  return {};
}

/**
 * Resolve the canonical UTM record by merging URL > session > inferred >
 * fallback. Persists the result so later pages can read it back. Returns
 * a plain record with only the truthy keys set.
 */
export function resolveUtm(opts?: {
  search?: string | URLSearchParams | null;
  fallback?: UtmRecord;
  persist?: boolean;
}): UtmRecord {
  const fromUrl = readUtmFromSearch(opts?.search);
  const fromSession = readUtmFromSession();
  const inferred = inferUtm();
  const fallback = opts?.fallback ?? {};

  const merged: UtmRecord = {};
  for (const key of UTM_KEYS) {
    merged[key] =
      fromUrl[key] ||
      fromSession[key] ||
      inferred[key] ||
      fallback[key] ||
      null;
  }

  if (opts?.persist !== false) {
    persistUtmToSession(merged);
  }
  return merged;
}

/**
 * Build a query string that carries the canonical UTMs onto the next URL.
 * Existing non-UTM params on `base` are preserved; UTMs in `utm` win over
 * UTMs already on `base` so a redirect can refresh stale attribution.
 */
export function withUtm(
  base: string | URLSearchParams | null | undefined,
  utm: UtmRecord,
): string {
  const params = readSearch(base);
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (value) {
      params.set(key, value);
    }
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Append UTMs to a path while preserving its existing search and hash.
 * Use this in <Navigate> components and other internal redirects to
 * guarantee attribution survives every URL rewrite.
 */
export function appendUtmToPath(
  path: string,
  utm: UtmRecord,
  existingSearch?: string,
  existingHash?: string,
): string {
  const search = withUtm(existingSearch ?? '', utm);
  return `${path}${search}${existingHash ?? ''}`;
}

/**
 * Mirror a UTM record into the current URL via history.replaceState
 * WITHOUT triggering a navigation. Used by /go to lock in the bucketed
 * hook before any tracking call resolves UTMs from the URL.
 */
export function syncUtmToUrl(utm: UtmRecord): void {
  if (typeof window === 'undefined') return;
  const next = new URLSearchParams(window.location.search);
  let changed = false;
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (value && next.get(key) !== value) {
      next.set(key, value);
      changed = true;
    }
  }
  if (!changed) return;
  const search = next.toString();
  const newUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  try {
    window.history.replaceState(window.history.state, '', newUrl);
  } catch {
    /* some embedded webviews block replaceState — non-fatal */
  }
}
