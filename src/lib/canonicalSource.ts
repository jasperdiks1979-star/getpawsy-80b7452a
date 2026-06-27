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
  | "instagram"
  | "reddit"
  | "x"
  | "linkedin"
  | "youtube"
  | "email"
  | "organic"
  | "referral"
  | "direct"
  | "paid_ads"
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
const FB_HOSTS = /(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)l\.facebook\.com$/i;
const IG_HOSTS = /(^|\.)instagram\.com$|(^|\.)l\.instagram\.com$/i;
const GOOGLE_HOSTS = /(^|\.)google\.[a-z.]+$/i;
const REDDIT_HOSTS = /(^|\.)reddit\.com$|(^|\.)redd\.it$/i;
const X_HOSTS = /(^|\.)(twitter|x)\.com$|(^|\.)t\.co$/i;
const LI_HOSTS = /(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/i;
const YT_HOSTS = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "display", "retargeting"]);

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
  if (src === "instagram" || src === "ig" || (refHost && IG_HOSTS.test(refHost))) {
    return "instagram";
  }
  if (["facebook", "meta", "fb"].includes(src) || !!input.fbclid || (refHost && FB_HOSTS.test(refHost))) {
    return "facebook";
  }

  // 4. Google
  if (src === "google" || !!input.gclid || (refHost && GOOGLE_HOSTS.test(refHost))) {
    return "google";
  }

  // 4b. Other social platforms
  if (src === "reddit" || (refHost && REDDIT_HOSTS.test(refHost))) return "reddit";
  if (src === "x" || src === "twitter" || (refHost && X_HOSTS.test(refHost))) return "x";
  if (src === "linkedin" || (refHost && LI_HOSTS.test(refHost))) return "linkedin";
  if (src === "youtube" || src === "yt" || (refHost && YT_HOSTS.test(refHost))) return "youtube";

  // 5. Email
  if (med === "email" || src === "newsletter" || src === "klaviyo" || src === "mailchimp") {
    return "email";
  }

  // 5b. Generic paid ad signals without a recognised platform → paid_ads
  if (PAID_MEDIUMS.has(med) || src === "ads" || src === "paid") {
    return "paid_ads";
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
  "instagram",
  "reddit",
  "x",
  "linkedin",
  "youtube",
  "email",
  "paid_ads",
  "organic",
  "referral",
  "unknown",
] as const;

/**
 * Shared presentation metadata for every canonical source.
 * Used by World Map, Attribution Compare, Visitor Timeline and Funnel
 * dashboards so colour/label/icon stay consistent.
 */
export interface SourceMeta {
  slug: CanonicalSource;
  label: string;
  color: string;
}

export const SOURCE_META: Record<CanonicalSource, SourceMeta> = {
  pinterest: { slug: "pinterest", label: "Pinterest", color: "#E60023" },
  tiktok:    { slug: "tiktok",    label: "TikTok",    color: "#000000" },
  google:    { slug: "google",    label: "Google",    color: "#4285F4" },
  facebook:  { slug: "facebook",  label: "Facebook",  color: "#1877F2" },
  instagram: { slug: "instagram", label: "Instagram", color: "#E1306C" },
  reddit:    { slug: "reddit",    label: "Reddit",    color: "#FF4500" },
  x:         { slug: "x",         label: "X (Twitter)", color: "#0F1419" },
  linkedin:  { slug: "linkedin",  label: "LinkedIn",  color: "#0A66C2" },
  youtube:   { slug: "youtube",   label: "YouTube",   color: "#FF0000" },
  email:     { slug: "email",     label: "Email",     color: "#F59E0B" },
  paid_ads:  { slug: "paid_ads",  label: "Paid Ads",  color: "#8B5CF6" },
  organic:   { slug: "organic",   label: "Organic",   color: "#10B981" },
  referral:  { slug: "referral",  label: "Referral",  color: "#1DA1F2" },
  direct:    { slug: "direct",    label: "Direct",    color: "#6B7280" },
  unknown:   { slug: "unknown",   label: "Unknown",   color: "#9CA3AF" },
};

export function getSourceMeta(s: CanonicalSource): SourceMeta {
  return SOURCE_META[s] ?? SOURCE_META.unknown;
}