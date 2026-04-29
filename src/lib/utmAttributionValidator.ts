/**
 * utmAttributionValidator — runtime guard that verifies the funnel events
 * fired from /go (`lp_view`, `lp_scroll_depth`, `lp_cta_impression`,
 * `lp_cta_click`) carry the EXACT same `utm_source`, `utm_medium` and
 * `utm_campaign` as the downstream PDP / cart / checkout events
 * (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`) within the
 * same browser session.
 *
 * This catches three classes of regression that previously broke the
 * TikTok dashboard:
 *
 *   1. A redirect (e.g. /go → /products/:slug) silently drops UTMs, so
 *      `lp_cta_click` carries `utm_campaign=hook3` but the next
 *      `view_item` carries `utm_campaign=null`.
 *   2. A new call site forgets to spread `attribution` into trackEvent
 *      params and posts a downstream event with empty UTMs.
 *   3. Two competing components race-write conflicting UTMs into
 *      sessionStorage and the funnel ends up split across two campaigns.
 *
 * How it works:
 *   - When a `lp_*` funnel event fires, we record its UTM trio as the
 *     "expected" attribution for the rest of the session.
 *   - When a downstream event fires, we compare its UTM trio to the
 *     expected one. Mismatches log a `console.warn` (or `console.error`
 *     when ?debug_utm=1 is on the URL) AND surface a structured
 *     `lp_attribution_mismatch` analytics event so the dashboard can
 *     count violations in production without spamming users.
 *
 * Pure presentation/instrumentation — no DB writes, no UI side effects.
 */

const STORAGE_KEY = 'gp_lp_utm_expected';
const VIOLATION_LOG_KEY = 'gp_lp_utm_violations';

const FUNNEL_EVENTS = new Set([
  'lp_view',
  'lp_scroll_depth',
  'lp_cta_impression',
  'lp_cta_click',
]);

const DOWNSTREAM_EVENTS = new Set([
  'view_item',
  'add_to_cart',
  'begin_checkout',
  'purchase',
  'select_item',
]);

const TRACKED_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
type TrackedKey = (typeof TRACKED_KEYS)[number];

type Expected = Partial<Record<TrackedKey, string | null>> & {
  recorded_at: number;
  source_event: string;
};

export type AttributionViolation = {
  ts: number;
  event: string;
  expected: Partial<Record<TrackedKey, string | null>>;
  actual: Partial<Record<TrackedKey, string | null>>;
  source_event: string;
  page?: string;
};

function safeSession(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readExpected(): Expected | null {
  const store = safeSession();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Expected;
  } catch {
    return null;
  }
}

function writeExpected(value: Expected): void {
  const store = safeSession();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function pickUtm(
  params?: Record<string, unknown>,
): Partial<Record<TrackedKey, string | null>> {
  const out: Partial<Record<TrackedKey, string | null>> = {};
  if (!params) return out;
  for (const key of TRACKED_KEYS) {
    const value = params[key];
    if (typeof value === 'string') {
      out[key] = value || null;
    } else if (value === null) {
      out[key] = null;
    }
    // undefined → omit so we don't false-flag events that simply don't
    // declare a UTM (e.g. internal admin tracking).
  }
  return out;
}

function diffUtm(
  expected: Partial<Record<TrackedKey, string | null>>,
  actual: Partial<Record<TrackedKey, string | null>>,
): TrackedKey[] {
  const mismatches: TrackedKey[] = [];
  for (const key of TRACKED_KEYS) {
    if (!(key in expected) || !(key in actual)) continue;
    if ((expected[key] ?? null) !== (actual[key] ?? null)) {
      mismatches.push(key);
    }
  }
  return mismatches;
}

function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug_utm') === '1';
  } catch {
    return false;
  }
}

function recordViolation(violation: AttributionViolation): void {
  const store = safeSession();
  if (!store) return;
  try {
    const raw = store.getItem(VIOLATION_LOG_KEY);
    const log: AttributionViolation[] = raw ? JSON.parse(raw) : [];
    log.push(violation);
    // Cap at 50 entries so the session storage doesn't bloat.
    while (log.length > 50) log.shift();
    store.setItem(VIOLATION_LOG_KEY, JSON.stringify(log));
  } catch {
    /* non-fatal */
  }
}

/**
 * Inspect an outgoing analytics event and validate its UTM attribution
 * against the session's expected trio.
 *
 * Returns a structured mismatch payload that the caller (trackEvent)
 * should forward as a `lp_attribution_mismatch` event so violations are
 * countable in production. Returns null if everything matches or the
 * event is irrelevant.
 */
export function validateUtmAttribution(
  eventName: string,
  params?: Record<string, unknown>,
): AttributionViolation | null {
  // 1. Funnel event → record/refresh the expected attribution.
  if (FUNNEL_EVENTS.has(eventName)) {
    const utm = pickUtm(params);
    if (Object.keys(utm).length === 0) return null;
    const previous = readExpected();
    // Promote the most specific (non-null) UTM trio we see in the funnel.
    const merged: Expected = {
      utm_source: previous?.utm_source ?? utm.utm_source ?? null,
      utm_medium: previous?.utm_medium ?? utm.utm_medium ?? null,
      utm_campaign: previous?.utm_campaign ?? utm.utm_campaign ?? null,
      recorded_at: Date.now(),
      source_event: previous?.source_event ?? eventName,
    };
    // If a later funnel event carries a more specific value (e.g. paid
    // hook campaign overriding tt_bio_link), trust the latest non-null.
    for (const key of TRACKED_KEYS) {
      const fresh = utm[key];
      if (fresh) merged[key] = fresh;
    }
    writeExpected(merged);
    return null;
  }

  // 2. Downstream event → compare against the expected trio.
  if (!DOWNSTREAM_EVENTS.has(eventName)) return null;
  const expected = readExpected();
  if (!expected) return null;

  const actual = pickUtm(params);
  if (Object.keys(actual).length === 0) {
    // Downstream event fired with NO UTMs at all even though we expected
    // some — this is the most common silent-drop bug.
    actual.utm_source = null;
    actual.utm_medium = null;
    actual.utm_campaign = null;
  }

  const expectedTrio: Partial<Record<TrackedKey, string | null>> = {
    utm_source: expected.utm_source ?? null,
    utm_medium: expected.utm_medium ?? null,
    utm_campaign: expected.utm_campaign ?? null,
  };

  const mismatches = diffUtm(expectedTrio, actual);
  if (mismatches.length === 0) return null;

  const violation: AttributionViolation = {
    ts: Date.now(),
    event: eventName,
    expected: expectedTrio,
    actual,
    source_event: expected.source_event,
    page:
      typeof window !== 'undefined' ? window.location.pathname : undefined,
  };

  recordViolation(violation);

  const message = `[UTM Validator] ${eventName} attribution mismatch — expected ${JSON.stringify(
    expectedTrio,
  )} (set by ${expected.source_event}) but got ${JSON.stringify(actual)} on ${violation.page}`;
  if (isDebugMode()) {
    console.error(message, violation);
  } else {
    console.warn(message);
  }

  return violation;
}

/** Read the session-scoped violation log (debug surfaces). */
export function readUtmViolations(): AttributionViolation[] {
  const store = safeSession();
  if (!store) return [];
  try {
    const raw = store.getItem(VIOLATION_LOG_KEY);
    return raw ? (JSON.parse(raw) as AttributionViolation[]) : [];
  } catch {
    return [];
  }
}

/** Clear the violation log (used by tests + admin debug page). */
export function clearUtmViolations(): void {
  const store = safeSession();
  if (!store) return;
  try {
    store.removeItem(VIOLATION_LOG_KEY);
  } catch {
    /* non-fatal */
  }
}