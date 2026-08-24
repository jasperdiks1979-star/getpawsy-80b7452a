// commercialInclusion — THE single commercial-session contract.
//
// Mirrors `public.canonical_sessions_commercial_v2` byte-for-byte in logic.
// Business KPIs, Organic vs Paid, Pinterest traffic, traffic quality and the
// conversion funnel MUST use this contract; no surface may re-derive its own
// definition of "commercial session" (that is exactly what produced the
// legacy `classified_channel = direct → organic` inflation).

export type AcquisitionBucket =
  | "ORGANIC_SEARCH"
  | "PINTEREST_ORGANIC"
  | "OTHER_ORGANIC_SOCIAL"
  | "REFERRAL"
  | "DIRECT"
  | "PAID"
  | "UNKNOWN"
  | "INTERNAL"
  | "BOT"
  | "TECHNICAL";

/** Buckets that are counted in business KPIs / commercial funnel. */
export const COMMERCIAL_BUCKETS: AcquisitionBucket[] = [
  "ORGANIC_SEARCH",
  "PINTEREST_ORGANIC",
  "OTHER_ORGANIC_SOCIAL",
  "REFERRAL",
  "DIRECT",
  "PAID",
];

/**
 * Buckets aggregated by the high-level "Organic" tile.
 * UNKNOWN, DIRECT, REFERRAL, BOT, INTERNAL and TECHNICAL are deliberately NOT
 * organic — no-signal fallback direct is not an acquisition channel.
 */
export const ORGANIC_BUCKETS: AcquisitionBucket[] = [
  "ORGANIC_SEARCH",
  "PINTEREST_ORGANIC",
  "OTHER_ORGANIC_SOCIAL",
];

export interface CommercialSessionInput {
  classified_channel?: string | null;
  /** v2 classifier verdict, e.g. HUMAN_PROBABLE / UNKNOWN / INTERNAL_PREVIEW. */
  traffic_class?: string | null;
  classification_reason?: string | null;
  is_internal?: boolean | null;
  is_bot?: boolean | null;
  technical_path?: boolean | null;
  exclude_from_commercial?: boolean | null;
}

const PAID_CHANNELS = new Set(["affiliate_paid", "shopping_paid", "unknown_paid"]);
const SEARCH_CHANNELS = new Set([
  "google_organic", "bing_organic", "duckduckgo_organic", "yahoo_organic",
  "ecosia_organic", "brave_organic", "baidu_organic", "yandex_organic",
]);
const SOCIAL_CHANNELS = new Set([
  "tiktok_organic", "facebook_organic", "instagram_organic", "reddit_organic",
  "youtube_organic", "linkedin_organic", "email_organic",
]);

/**
 * Assign one mutually exclusive acquisition bucket per session.
 * Exclusion signals always win over channel labels.
 */
export function classifyAcquisitionBucket(s: CommercialSessionInput): AcquisitionBucket {
  const channel = String(s.classified_channel ?? "").toLowerCase();
  const cls = String(s.traffic_class ?? "").toUpperCase();

  if (s.is_internal === true || cls === "INTERNAL" || cls === "INTERNAL_PREVIEW") return "INTERNAL";
  if (s.is_bot === true || cls === "BOT" || cls === "CRAWLER") return "BOT";
  if (s.technical_path === true) return "TECHNICAL";
  if (s.exclude_from_commercial === true || cls === "" || cls === "UNKNOWN") return "UNKNOWN";

  if (channel.endsWith("_ads") || channel.endsWith("_paid") || PAID_CHANNELS.has(channel)) return "PAID";
  if (channel.startsWith("pinterest")) return "PINTEREST_ORGANIC";
  if (SEARCH_CHANNELS.has(channel)) return "ORGANIC_SEARCH";
  if (SOCIAL_CHANNELS.has(channel)) return "OTHER_ORGANIC_SOCIAL";
  if (channel === "referral") return "REFERRAL";
  // Direct only counts as genuine Direct when v2 supplied affirmative
  // (non-excluded, human-evidence) classification — reached only here.
  if (channel === "direct") return "DIRECT";
  return "UNKNOWN";
}

/** Single authoritative commercial predicate. */
export function isCommercialSession(s: CommercialSessionInput): boolean {
  return COMMERCIAL_BUCKETS.includes(classifyAcquisitionBucket(s));
}

/** True only for genuinely unpaid acquisition channels. */
export function isOrganicSession(s: CommercialSessionInput): boolean {
  return ORGANIC_BUCKETS.includes(classifyAcquisitionBucket(s));
}

/**
 * Funnel-event gate: an event only counts for commercial funnel cards when
 * its originating session survives the commercial predicate.
 */
export function eventCountsForCommercialFunnel(session: CommercialSessionInput | null | undefined): boolean {
  return !!session && isCommercialSession(session);
}
