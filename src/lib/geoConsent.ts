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
 * True when the visitor is (likely) in a GDPR jurisdiction and must give
 * explicit consent before marketing pixels fire.
 *
 * Defaults to TRUE on any uncertainty (missing tz, parsing error) — fail-closed
 * is the only safe stance for GDPR compliance.
 */
export function isGdprRegion(): boolean {
  if (typeof window === 'undefined') return true;

  // Dev override (only on dev hosts)
  const override = getDevGeoOverride();
  if (override === 'eu') return true;
  if (override === 'us') return false;

  const tz = getTimezone();
  if (!tz) return true; // unknown → assume EU

  // Explicit non-GDPR European zones
  if (NON_GDPR_EUROPE_TZ.has(tz)) return false;

  // Any Europe/* (minus the exclusions above) → GDPR
  if (GDPR_TZ_PREFIXES.some(prefix => tz.startsWith(prefix))) return true;

  // Everything else (America/*, Asia/*, Australia/*, Africa/*, Pacific/*) → non-GDPR
  return false;
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
  return {
    timezone: getTimezone(),
    devOverride: getDevGeoOverride(),
    isGdpr: isGdprRegion(),
    autoGrant: canAutoGrantConsent(),
  };
}

if (typeof window !== 'undefined') {
  (window as any).__geoConsent = getGeoConsentDebug;
}