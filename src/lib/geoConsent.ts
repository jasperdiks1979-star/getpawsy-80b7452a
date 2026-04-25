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
 * True when the visitor is (likely) in a GDPR jurisdiction and must give
 * explicit consent before marketing pixels fire.
 *
 * Defaults to TRUE on any uncertainty (missing tz, parsing error) — fail-closed
 * is the only safe stance for GDPR compliance.
 */
export function isGdprRegion(): boolean {
  if (typeof window === 'undefined') return true;
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
    isGdpr: isGdprRegion(),
    autoGrant: canAutoGrantConsent(),
  };
}

if (typeof window !== 'undefined') {
  (window as any).__geoConsent = getGeoConsentDebug;
}