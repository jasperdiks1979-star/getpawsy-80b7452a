/**
 * Canonical traffic source resolver.
 *
 * Single source of truth used by Visitor World Map, Attribution Compare,
 * Visitor Timeline and regression tests. Given the raw fields stored on a
 * visitor / session row, returns the canonical channel slug.
 *
 * Rules (highest priority first):
 *   1. Explicit Pinterest signals win (utm_source, referrer host, pin.it,
 *      pin_id query/column, epik/pinterest_click_id).
 *   2. TikTok / Meta / Google signals (utm OR referrer OR click-id).
 *   3. Generic UTM medium → email / organic_social / paid_social / referral.
 *   4. Known referrer hosts → google / referral.
 *   5. Only `direct` when NO utm and NO referrer.
 *
 * Pinterest paid vs organic is split via `paid_social` medium or campaign
 * prefix `ads_` / `paid_`. Both still resolve to canonical source `pinterest`
 * so the World Map filter matches Attribution Compare totals.
 */

export type CanonicalSource =
  | "pinterest"
  | "tiktok"
  | "google"
  | "facebook"
  | "email"
  | "organic"
  | "referral"
  | "direct"
  | "unknown";

export interface SourceInput {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  referrer?: string | null;
  referrer_category?: string | null;
  page_path?: string | null;
  landing_url?: string | null;
  pin_id?: string | null;
  ttclid?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  epik?: string | null;
  pinterest_click_id?: string | null;
  external_id?: string | null;
}

const PIN_HOSTS = /(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$/i;
const TIKTOK_HOSTS = /(^|\.)tiktok\.com$|(^|\.)vt\.tiktok\.com$/i;
const META_HOSTS = /(^|\.)(facebook|instagram|fb)\.com$|(^|\.)l\.facebook\.com$/i;
const GOOGLE_HOSTS = /(^|\.)google\.[a-z.]+$/i;

function host(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function landingHasPinSignal(input: SourceInput): boolean {
  const s = `${input.page_path ?? ""} ${input.landing_url ?? ""}`.toLowerCase();
  return /[?&](pin_id|epik|pinterest_click_id)=/.test(s);
}

export function resolveCanonicalSource(input: SourceInput): CanonicalSource {
  const src = (input.utm_source ?? "").toLowerCase().trim();
  const med = (input.utm_medium ?? "").toLowerCase().trim();
  const cmp = (input.utm_campaign ?? "").toLowerCase().trim();
  const refHost = host(input.referrer);

  // 1. Pinterest — utm, referrer host, pin.it, pin_id, epik, pinterest_click_id
  if (
    src === "pinterest" || src === "pinterest.com" || src === "pin" || src === "pin.it" ||
    (refHost && PIN_HOSTS.test(refHost)) ||
    !!input.pin_id || !!input.epik || !!input.pinterest_click_id ||
    landingHasPinSignal(input) ||
    (input.referrer_category === "social" && cmp.includes("pinterest"))
  ) {
    return "pinterest";
  }

  // 2. TikTok
  if (src === "tiktok" || src === "tiktok.com" || !!input.ttclid || (refHost && TIKTOK_HOSTS.test(refHost))) {
    return "tiktok";
  }

  // 3. Meta / Facebook
  if (["facebook", "instagram", "meta", "fb"].includes(src) || !!input.fbclid || (refHost && META_HOSTS.test(refHost))) {
    return "facebook";
  }

  // 4. Google
  if (src === "google" || !!input.gclid || (refHost && GOOGLE_HOSTS.test(refHost))) {
    return "google";
  }

  // 5. Email
  if (med === "email" || src === "newsletter" || src === "klaviyo" || src === "mailchimp") {
    return "email";
  }

  // 6. Generic medium hints (organic_social / paid_social / referral)
  if (med === "organic" || med === "organic_social" || med === "paid_social" || med === "social") {
    return refHost ? "referral" : "organic";
  }

  // 7. Any referrer host without utm → referral
  if (refHost) return "referral";

  // 8. No signals at all → direct
  if (!src && !med && !cmp && !input.utm_content) return "direct";

  return "unknown";
}

/** Canonical channel set used by the World Map debug panel + filters. */
export const CANONICAL_SOURCES: readonly CanonicalSource[] = [
  "direct",
  "pinterest",
  "tiktok",
  "google",
  "facebook",
  "email",
  "organic",
  "referral",
  "unknown",
] as const;