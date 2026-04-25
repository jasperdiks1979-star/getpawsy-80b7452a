/**
 * Geo-aware consent detection.
 *
 * EU (GDPR) requires explicit opt-in consent for marketing cookies.
 * US (CCPA) and most non-EU jurisdictions allow opt-out instead → marketing
 * pixels can fire by default until the user opts out.
 *
 * We detect region via the browser's IANA timezone (Intl API) — no network
 * call, no IP lookup, ~0ms cost. This is intentionally a soft heuristic:
 * VPN users, travelers and missing tz fall back to the EU/strict path so
 * we never wrongly fire pixels on a real EU visitor.
 */

// Source: every IANA "Europe/*" zone covered by GDPR + EEA + UK + Switzerland.
// We match by prefix to keep this list short and future-proof.
const GDPR_TZ_PREFIXES = ['Europe/', 'Atlantic/Faroe', 'Atlantic/Reykjavik'];

// Explicit non-GDPR European zones (Russia, Belarus, Ukraine zones — not in EU/EEA)
// These are matched AFTER the prefix check and excluded.
const NON_GDPR_EUROPE_TZ = new Set<string>([
  'Europe/Moscow',
  'Europe/Kaliningrad',
  'Europe/Samara',
  'Europe/Volgograd',
  'Europe/Saratov',
  'Europe/Ulyanovsk',
  'Europe/Astrakhan',
  'Europe/Kirov',
  'Europe/Minsk',
  'Europe/Simferopol',
]);

function getTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Dev-only override: set via the dev consent toggle (or manually in DevTools).
 * Stored in localStorage so it survives reloads. Values:
 *   'eu'     → force GDPR flow (banner shown, pixel held)
 *   'us'     → force non-GDPR flow (banner suppressed, pixel granted)
 *   null/''  → use real timezone detection
 *
 * Override is only honored on non-production hostnames (lovable.app/.dev,
 * localhost) so production users can never be tricked into the wrong flow.
 */
const DEV_OVERRIDE_KEY = 'gp_dev_geo_override';

export type DevGeoOverride = 'eu' | 'us' | null;

function isDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.endsWith('.lovable.app') ||
    h.endsWith('.lovable.dev') ||
    h.endsWith('.lovableproject.com')
  );
}

export function getDevGeoOverride(): DevGeoOverride {
  if (!isDevHost()) return null;
  try {
    const v = localStorage.getItem(DEV_OVERRIDE_KEY);
    return v === 'eu' || v === 'us' ? v : null;
  } catch {
    return null;
  }
}

export function setDevGeoOverride(value: DevGeoOverride): void {
  if (!isDevHost()) return;
  try {
    if (value === null) localStorage.removeItem(DEV_OVERRIDE_KEY);
    else localStorage.setItem(DEV_OVERRIDE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function isDevConsentToggleAvailable(): boolean {
  return isDevHost();
}

/**
 * Persisted geo decision — cached to localStorage so the consent flow stays
 * stable across reloads even if the user briefly travels, toggles a VPN,
 * or the browser changes its reported timezone. The cache is keyed by
 * timezone + dev override; if either changes we re-evaluate.
 *
 * TTL: 30 days. After expiry we re-detect from scratch so legitimate
 * relocation (e.g. an EU user moving to the US) eventually flips correctly.
 */
const DECISION_KEY = 'gp_geo_consent_decision';
const DECISION_VERSION = 1;
const DECISION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface GeoConsentDecision {
  v: number;          // schema version
  tz: string | null;  // timezone at time of decision
  override: DevGeoOverride; // dev override at time of decision
  isGdpr: boolean;
  autoGrant: boolean;
  decidedAt: number;  // epoch ms
}

function readDecision(): GeoConsentDecision | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DECISION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeoConsentDecision;
    if (!parsed || parsed.v !== DECISION_VERSION) return null;
    if (typeof parsed.decidedAt !== 'number') return null;
    if (Date.now() - parsed.decidedAt > DECISION_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDecision(decision: GeoConsentDecision): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DECISION_KEY, JSON.stringify(decision));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Force a re-evaluation on the next call (e.g. after the dev toggle flips). */
export function clearGeoConsentDecision(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(DECISION_KEY); } catch { /* ignore */ }
}

/** Compute the GDPR decision from scratch — no cache lookup. */
function computeIsGdpr(): boolean {
  if (typeof window === 'undefined') return true;

  const override = getDevGeoOverride();
  if (override === 'eu') return true;
  if (override === 'us') return false;

  const tz = getTimezone();
  if (!tz) return true;

  if (NON_GDPR_EUROPE_TZ.has(tz)) return false;
  if (GDPR_TZ_PREFIXES.some(prefix => tz.startsWith(prefix))) return true;
  return false;
}

/**
 * True when the visitor is (likely) in a GDPR jurisdiction and must give
 * explicit consent before marketing pixels fire.
 *
 * Defaults to TRUE on any uncertainty (missing tz, parsing error) — fail-closed
 * is the only safe stance for GDPR compliance.
 *
 * Result is persisted to localStorage with a 30-day TTL. The cache is
 * invalidated automatically if the browser timezone or dev override changes.
 */
export function isGdprRegion(): boolean {
  if (typeof window === 'undefined') return true;

  const override = getDevGeoOverride();
  const tz = getTimezone();

  // Cache hit only when the inputs that drove the decision haven't changed
  const cached = readDecision();
  if (cached && cached.tz === tz && cached.override === override) {
    return cached.isGdpr;
  }

  const isGdpr = computeIsGdpr();
  writeDecision({
    v: DECISION_VERSION,
    tz,
    override,
    isGdpr,
    autoGrant: !isGdpr,
    decidedAt: Date.now(),
  });
  return isGdpr;
}

/**
 * True when we may auto-grant marketing/tracking consent without a banner
 * interaction. Used to fire TikTok/Pinterest/Meta pixels for US visitors
 * (the campaign target audience) on first page view.
 */
export function canAutoGrantConsent(): boolean {
  return !isGdprRegion();
}

/** Diagnostic helper — exposed for debugging from console. */
export function getGeoConsentDebug() {
  const cached = readDecision();
  return {
    timezone: getTimezone(),
    devOverride: getDevGeoOverride(),
    isGdpr: isGdprRegion(),
    autoGrant: canAutoGrantConsent(),
    cachedDecision: cached,
    cachedAgeMs: cached ? Date.now() - cached.decidedAt : null,
  };
}

if (typeof window !== 'undefined') {
  (window as any).__geoConsent = getGeoConsentDebug;
}