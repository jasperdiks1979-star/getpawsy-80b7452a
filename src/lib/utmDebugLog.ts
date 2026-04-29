/**
 * utmDebugLog — session-scoped UTM checkpoint logger.
 *
 * Records a snapshot of the current UTM state at three checkpoints in the
 * TikTok funnel:
 *
 *   1. "go_mount"      — when /go (LinkInBio) mounts
 *   2. "cta_click"     — when the CTA in /go is clicked
 *   3. "pdp_load"      — when the product page mounts
 *
 * Use cases:
 *   • A founder visits /go → CTA → PDP and then opens the admin
 *     "TikTok Funnel Debug" page to see exactly which checkpoint dropped
 *     utm_campaign or utm_content.
 *   • Developers can `window.__utmDebug()` in DevTools to dump the log.
 *
 * Storage:
 *   sessionStorage under a single JSON key. Cleared on tab close. Capped
 *   at MAX_ENTRIES so a long-lived tab can't grow unbounded.
 *
 * Activation:
 *   ON by default ONLY when the URL contains ?debug_utm=1 OR the session
 *   already opted in via that flag (sticky for the rest of the tab).
 *   Production builds without that flag are silent — zero overhead.
 */
import { resolveUtm, type UtmRecord, UTM_KEYS } from './utmNormalizer';

const STORAGE_KEY = 'gp_utm_debug_log';
const FLAG_KEY = 'gp_utm_debug_enabled';
const MAX_ENTRIES = 50;

export type UtmCheckpoint =
  | 'go_mount'
  | 'cta_click'
  | 'pdp_load'
  | 'redirect'
  | 'custom';

export interface UtmDebugEntry {
  ts: number;
  checkpoint: UtmCheckpoint;
  path: string;
  search: string;
  referrer: string;
  utm: UtmRecord;
  /** Where each UTM key was resolved from — helps spot fallbacks. */
  resolved_from: Partial<Record<keyof UtmRecord, 'url' | 'session' | 'inferred' | 'fallback' | 'missing'>>;
  meta?: Record<string, unknown>;
}

function safeSession(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Returns true if the URL or session has flipped on the debug flag. */
export function isUtmDebugEnabled(): boolean {
  const store = safeSession();
  if (!store) return false;
  if (typeof window !== 'undefined') {
    const flag = new URLSearchParams(window.location.search).get('debug_utm');
    if (flag === '1' || flag === 'true') {
      try {
        store.setItem(FLAG_KEY, '1');
      } catch {
        /* ignore */
      }
      return true;
    }
    if (flag === '0' || flag === 'false') {
      try {
        store.removeItem(FLAG_KEY);
      } catch {
        /* ignore */
      }
      return false;
    }
  }
  return store.getItem(FLAG_KEY) === '1';
}

/** Force enable from code (e.g. a hidden admin toggle). */
export function enableUtmDebug(): void {
  const store = safeSession();
  try {
    store?.setItem(FLAG_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Force disable + clear the buffer. */
export function disableUtmDebug(): void {
  const store = safeSession();
  try {
    store?.removeItem(FLAG_KEY);
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Read the full session log. Empty array when disabled or not yet logged. */
export function readUtmDebugLog(): UtmDebugEntry[] {
  const store = safeSession();
  if (!store) return [];
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UtmDebugEntry[]) : [];
  } catch {
    return [];
  }
}

/** Erase the log without disabling debug. */
export function clearUtmDebugLog(): void {
  const store = safeSession();
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Classify each UTM key by where its value came from. Lets the admin
 * viewer flag rows where utm_campaign was rescued from sessionStorage
 * (= a redirect dropped it) vs read fresh from the URL.
 */
function classifySources(utm: UtmRecord, search: string): UtmDebugEntry['resolved_from'] {
  const urlParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const session = safeSession();
  const out: UtmDebugEntry['resolved_from'] = {};
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (!value) {
      out[key] = 'missing';
      continue;
    }
    if (urlParams.get(key) === value) {
      out[key] = 'url';
    } else if (session?.getItem(key) === value) {
      out[key] = 'session';
    } else {
      // resolveUtm only has URL/session/inferred/fallback as sources, and
      // we already checked URL+session — so anything else must be one of
      // those two. Default to "inferred" since "fallback" is caller-only.
      out[key] = 'inferred';
    }
  }
  return out;
}

/**
 * Record a checkpoint. Cheap no-op when debug is disabled.
 * Safe to call from anywhere — never throws.
 */
export function logUtmCheckpoint(
  checkpoint: UtmCheckpoint,
  meta?: Record<string, unknown>,
): void {
  try {
    if (!isUtmDebugEnabled()) return;
    if (typeof window === 'undefined') return;

    const search = window.location.search;
    // Resolve WITHOUT persisting — we don't want the act of debug-logging
    // to mutate session UTMs (would distort future checkpoints).
    const utm = resolveUtm({ search, persist: false });

    const entry: UtmDebugEntry = {
      ts: Date.now(),
      checkpoint,
      path: window.location.pathname,
      search,
      referrer:
        (typeof document !== 'undefined' ? document.referrer : '') || '',
      utm,
      resolved_from: classifySources(utm, search),
      meta,
    };

    const log = readUtmDebugLog();
    log.push(entry);
    // Cap so a long session doesn't blow sessionStorage quota.
    const trimmed = log.length > MAX_ENTRIES ? log.slice(-MAX_ENTRIES) : log;
    safeSession()?.setItem(STORAGE_KEY, JSON.stringify(trimmed));

    // Mirror to console so the founder can tail it live in DevTools.
    // eslint-disable-next-line no-console
    console.info(
      `[utm-debug] ${checkpoint} @ ${entry.path}`,
      { utm, resolved_from: entry.resolved_from, meta },
    );
  } catch {
    /* never let debug logging break the funnel */
  }
}

// Expose a tiny DevTools shortcut once per tab.
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  if (!w.__utmDebug) {
    w.__utmDebug = () => readUtmDebugLog();
    w.__utmDebugClear = () => clearUtmDebugLog();
    w.__utmDebugEnable = () => enableUtmDebug();
    w.__utmDebugDisable = () => disableUtmDebug();
  }
}
