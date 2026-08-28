/**
 * Permanent Traffic-Quality Classifier — GetPawsy visitor analytics.
 *
 * Pure, dependency-free scoring layer that turns any session-shaped row
 * (canonical `TruthSession`, CSV export row, live dataset) into:
 *
 *   - traffic_quality_class  (human / bot / internal / unknown)
 *   - traffic_quality_confidence (0-1)
 *   - source_class           (paid vs organic vs direct, per channel)
 *   - commercial_intent_score (0-100) + tier
 *   - classification_reasons (audit trail — never silently dropped)
 *
 * Rules are intentionally conservative:
 *   - a conversion is NEVER required to qualify as human;
 *   - city is NEVER, on its own, evidence of automation;
 *   - internal/test only via explicit markers;
 *   - a generic Pinterest referrer is organic until paid evidence exists.
 *
 * Nothing here mutates or removes data. Cluster analysis only *raises*
 * bot confidence for sessions that already look synthetic.
 */

export type TrafficQualityClass =
  | "PROBABLE_HUMAN"
  | "POSSIBLE_HUMAN"
  | "PROBABLE_BOT_OR_AUTOMATION"
  | "INTERNAL_OR_TEST"
  | "UNKNOWN";

export type SourceClass =
  | "PINTEREST_PAID"
  | "PINTEREST_ORGANIC"
  | "GOOGLE_ORGANIC"
  | "OTHER_SEARCH"
  | "DIRECT"
  | "REFERRAL"
  | "TIKTOK"
  | "META"
  | "OTHER_PAID"
  | "UNKNOWN";

export type IntentTier = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface ClassifierSession {
  session_id?: string | null;
  visitor_id?: string | null;
  first_seen_at?: string | Date | null;
  last_seen_at?: string | Date | null;
  timestamp?: string | Date | null;
  country?: string | null;
  city?: string | null;
  device?: string | null;
  device_type?: string | null;
  browser?: string | null;
  user_agent?: string | null;
  referrer?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  landing_page?: string | null;
  page_path?: string | null;
  page_views?: number | null;
  pages_viewed?: number | null;
  session_duration_seconds?: number | null;
  has_product_view?: boolean | null;
  has_add_to_cart?: boolean | null;
  has_view_cart?: boolean | null;
  has_checkout?: boolean | null;
  has_purchase?: boolean | null;
  product_view?: boolean | null;
  add_to_cart?: boolean | null;
  view_cart?: boolean | null;
  checkout?: boolean | null;
  purchase?: boolean | null;
  order_value?: number | null;
  revenue?: number | null;
  is_internal?: boolean | null;
  is_bot?: boolean | null;
  bot_reason?: string | null;
}

export interface ClassifiedSession {
  session_id: string;
  traffic_quality_class: TrafficQualityClass;
  traffic_quality_confidence: number;
  source_class: SourceClass;
  commercial_intent_score: number;
  commercial_intent_tier: IntentTier;
  classification_reasons: string[];
  /** Normalized facts used for the decision (handy for drill-downs). */
  facts: {
    duration_seconds: number | null;
    page_views: number;
    device: string;
    city: string;
    country: string;
    landing_page: string;
    product_view: boolean;
    add_to_cart: boolean;
    view_cart: boolean;
    checkout: boolean;
    purchase: boolean;
    revenue: number;
  };
}

const BOT_UA_RE =
  /(bot|crawler|spider|googlebot|bingbot|yandex|baiduspider|duckduckbot|facebookexternalhit|pinterestbot|tiktokbot|ahrefsbot|semrushbot|mj12bot|petalbot|applebot|uptimerobot|prerender|headless|phantom|slurp|lighthouse|python-requests|curl\/|wget|axios|node-fetch|go-http-client)/i;

const INTERNAL_TOKENS = [
  "smoke", "internal", "admin", "synthetic", "e2e", "qa", "lovable", "ci", "test",
];

const PAID_MEDIUMS = new Set([
  "cpc", "ppc", "paid", "paidsocial", "paid_social", "paid-social", "ads", "ad",
  "display", "cpm", "cpv", "retargeting",
]);

const SEARCH_HOSTS: Array<[RegExp, SourceClass]> = [
  [/google\./i, "GOOGLE_ORGANIC"],
  [/bing\.|yahoo\.|duckduckgo\.|ecosia\.|search\.brave|startpage\.|qwant\./i, "OTHER_SEARCH"],
];

function toSeconds(s: ClassifierSession): number | null {
  if (typeof s.session_duration_seconds === "number" && Number.isFinite(s.session_duration_seconds)) {
    return Math.max(0, s.session_duration_seconds);
  }
  const a = s.first_seen_at ? new Date(s.first_seen_at).getTime() : NaN;
  const b = s.last_seen_at ? new Date(s.last_seen_at).getTime() : NaN;
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(0, Math.round((b - a) / 1000));
  return null;
}

function bool(...vals: Array<boolean | null | undefined>): boolean {
  return vals.some((v) => v === true);
}

function lower(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase() : "";
}

// ---------------------------------------------------------------------------
// Source classification
// ---------------------------------------------------------------------------

export function classifySource(s: ClassifierSession): { source_class: SourceClass; reasons: string[] } {
  const reasons: string[] = [];
  const utmSource = lower(s.utm_source) || lower(s.source);
  const utmMedium = lower(s.utm_medium) || lower(s.medium);
  const campaign = lower(s.utm_campaign) || lower(s.campaign);
  const content = lower(s.utm_content);
  const ref = lower(s.referrer);
  const paidMedium = PAID_MEDIUMS.has(utmMedium) || /(^|[_-])(cpc|paid|ads?)([_-]|$)/.test(utmMedium);
  const adIdentifier = /(adgroup|ad_id|adid|adset|campaign_id|promoted|pin_promotion|\bad\b)/.test(
    `${campaign} ${content} ${ref}`,
  );

  const isPinterest = utmSource.includes("pinterest") || ref.includes("pinterest.") || ref.includes("pin.it");
  if (isPinterest) {
    if (paidMedium || adIdentifier) {
      reasons.push(paidMedium ? "pinterest_paid_medium" : "pinterest_ad_identifier");
      return { source_class: "PINTEREST_PAID", reasons };
    }
    reasons.push("pinterest_no_paid_evidence");
    return { source_class: "PINTEREST_ORGANIC", reasons };
  }

  if (utmSource.includes("tiktok") || ref.includes("tiktok.")) {
    reasons.push("tiktok_source");
    return { source_class: "TIKTOK", reasons };
  }
  if (/facebook|instagram|meta\b|fb\b/.test(utmSource) || /facebook\.|instagram\.|fb\./.test(ref)) {
    reasons.push("meta_source");
    return { source_class: "META", reasons };
  }

  if (utmSource.includes("google") || ref.includes("google.")) {
    if (paidMedium || adIdentifier || /gclid/.test(`${content} ${ref}`)) {
      reasons.push("google_paid_evidence");
      return { source_class: "OTHER_PAID", reasons };
    }
    reasons.push("google_organic");
    return { source_class: "GOOGLE_ORGANIC", reasons };
  }

  for (const [re, cls] of SEARCH_HOSTS) {
    if (re.test(ref) || re.test(utmSource)) {
      reasons.push("other_search_engine");
      return { source_class: cls, reasons };
    }
  }

  if (paidMedium) {
    reasons.push("generic_paid_medium");
    return { source_class: "OTHER_PAID", reasons };
  }

  if (ref && !ref.includes("getpawsy")) {
    reasons.push("external_referrer");
    return { source_class: "REFERRAL", reasons };
  }

  const declaredDirect = lower(s.source) === "direct" || (!ref && !utmSource);
  if (declaredDirect) {
    reasons.push("no_referrer_no_utm");
    return { source_class: "DIRECT", reasons };
  }

  reasons.push("source_indeterminate");
  return { source_class: "UNKNOWN", reasons };
}

// ---------------------------------------------------------------------------
// Commercial intent
// ---------------------------------------------------------------------------

export function commercialIntentScore(
  s: ClassifierSession,
  sourceClass: SourceClass,
): { score: number; tier: IntentTier } {
  const duration = toSeconds(s);
  const pv = Number(s.page_views ?? s.pages_viewed ?? 0) || 0;
  const landing = lower(s.landing_page ?? s.page_path);
  let score = 0;
  if (bool(s.has_product_view, s.product_view)) score += 15;
  if (bool(s.has_add_to_cart, s.add_to_cart)) score += 25;
  if (bool(s.has_view_cart, s.view_cart)) score += 20;
  if (bool(s.has_checkout, s.checkout)) score += 25;
  if (bool(s.has_purchase, s.purchase)) score += 40;
  if (duration !== null && duration >= 20) score += 10;
  if (pv >= 3) score += 10;
  const isPinterest = sourceClass === "PINTEREST_PAID" || sourceClass === "PINTEREST_ORGANIC";
  if (isPinterest && /\/product|\/products\//.test(landing)) score += 10;
  if (
    (sourceClass === "GOOGLE_ORGANIC" || sourceClass === "OTHER_SEARCH") &&
    landing && landing !== "/"
  ) score += 5;

  score = Math.min(100, score);
  const tier: IntentTier =
    score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : score >= 1 ? "LOW" : "NONE";
  return { score, tier };
}

// ---------------------------------------------------------------------------
// Human / bot classification
// ---------------------------------------------------------------------------

export function classifySession(s: ClassifierSession): ClassifiedSession {
  const reasons: string[] = [];
  const { source_class, reasons: srcReasons } = classifySource(s);
  reasons.push(...srcReasons.map((r) => `source:${r}`));

  const duration = toSeconds(s);
  const pv = Number(s.page_views ?? s.pages_viewed ?? 0) || 0;
  const device = lower(s.device ?? s.device_type) || "unknown";
  const ua = s.user_agent ?? "";
  const landing = (s.landing_page ?? s.page_path ?? "") as string;
  const productView = bool(s.has_product_view, s.product_view);
  const atc = bool(s.has_add_to_cart, s.add_to_cart);
  const viewCart = bool(s.has_view_cart, s.view_cart);
  const checkout = bool(s.has_checkout, s.checkout);
  const purchase = bool(s.has_purchase, s.purchase);
  const revenue = Number(s.order_value ?? s.revenue ?? 0) || 0;

  const { score, tier } = commercialIntentScore(s, source_class);

  const facts = {
    duration_seconds: duration,
    page_views: pv,
    device,
    city: s.city ?? "",
    country: s.country ?? "",
    landing_page: landing,
    product_view: productView,
    add_to_cart: atc,
    view_cart: viewCart,
    checkout,
    purchase,
    revenue,
  };

  const sid = s.session_id ?? "";
  const finish = (
    cls: TrafficQualityClass,
    confidence: number,
  ): ClassifiedSession => ({
    session_id: sid,
    traffic_quality_class: cls,
    traffic_quality_confidence: Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100,
    source_class,
    commercial_intent_score: score,
    commercial_intent_tier: tier,
    classification_reasons: reasons,
    facts,
  });

  // 1. Internal / test — explicit markers only.
  const internalHaystack = `${lower(sid)} ${lower(s.utm_source)} ${lower(s.utm_medium)} ${lower(s.utm_campaign)} ${lower(landing)}`;
  if (s.is_internal === true) {
    reasons.push("explicit_internal_flag");
    return finish("INTERNAL_OR_TEST", 0.99);
  }
  if (INTERNAL_TOKENS.some((t) => internalHaystack.includes(`${t}_`) || internalHaystack.includes(`${t}=`) || internalHaystack.includes(`${t}-`))) {
    reasons.push("internal_marker_token");
    return finish("INTERNAL_OR_TEST", 0.9);
  }

  // 2. Declared automation.
  if (s.is_bot === true || (ua && BOT_UA_RE.test(ua))) {
    reasons.push(s.is_bot === true ? "declared_bot_flag" : "bot_user_agent");
    return finish("PROBABLE_BOT_OR_AUTOMATION", 0.97);
  }

  // 3. Strong human signals — a conversion is not required.
  const strong: string[] = [];
  if (atc) strong.push("add_to_cart");
  if (viewCart) strong.push("view_cart");
  if (checkout) strong.push("checkout");
  if (purchase) strong.push("purchase");
  if (duration !== null && duration >= 20) strong.push("duration>=20s");
  if (pv >= 3) strong.push("pageviews>=3");
  if (productView && pv >= 2) strong.push("product_view_with_navigation");
  const coherentSearchOrReferral =
    (source_class === "GOOGLE_ORGANIC" ||
      source_class === "OTHER_SEARCH" ||
      source_class === "REFERRAL" ||
      source_class === "PINTEREST_ORGANIC" ||
      source_class === "PINTEREST_PAID") &&
    !!landing && landing !== "" &&
    (device === "mobile" || device === "tablet" || device === "desktop") &&
    (duration === null || duration >= 3);
  if (coherentSearchOrReferral && pv >= 2) strong.push("coherent_source_with_navigation");

  if (strong.length > 0) {
    reasons.push(...strong.map((r) => `human:${r}`));
    const confidence = Math.min(0.98, 0.6 + 0.12 * strong.length);
    return finish("PROBABLE_HUMAN", confidence);
  }

  // 4. Possible human.
  const possible: string[] = [];
  if (duration !== null && duration >= 3 && duration <= 19) possible.push("duration_3_19s");
  if (pv >= 2) possible.push("pageviews>=2");
  if (coherentSearchOrReferral) possible.push("real_source_single_page");
  if ((device === "mobile" || device === "tablet") && source_class === "DIRECT" && !!landing && landing !== "/") {
    possible.push("mobile_direct_content_landing");
  }
  if (productView) possible.push("product_view");
  if (possible.length > 0) {
    reasons.push(...possible.map((r) => `possible:${r}`));
    return finish("POSSIBLE_HUMAN", Math.min(0.75, 0.35 + 0.12 * possible.length));
  }

  // 5. Probable bot / automation — requires MULTIPLE weak synthetic signals.
  const weak: string[] = [];
  if (duration !== null && duration <= 2) weak.push("duration<=2s");
  if (device === "desktop") weak.push("desktop");
  if (source_class === "DIRECT" || source_class === "UNKNOWN") weak.push("direct_or_unknown_source");
  if (pv >= 1 && pv <= 2) weak.push("1_2_pageviews");
  if (!productView && !atc && !viewCart && !checkout && !purchase) weak.push("no_commerce_events");
  if (weak.length >= 4 && weak.includes("duration<=2s") && weak.includes("no_commerce_events")) {
    reasons.push(...weak.map((r) => `bot:${r}`));
    return finish("PROBABLE_BOT_OR_AUTOMATION", Math.min(0.85, 0.45 + 0.08 * weak.length));
  }

  reasons.push("insufficient_evidence");
  return finish("UNKNOWN", 0.3);
}

export function classifySessions(rows: ClassifierSession[]): ClassifiedSession[] {
  return applyClusterBoost(rows.map(classifySession), rows);
}

// ---------------------------------------------------------------------------
// Cluster analysis — raises bot confidence, never demotes a human.
// City alone is NEVER sufficient: a cluster must share city + device +
// near-identical duration bucket AND consist of non-human-classified rows.
// ---------------------------------------------------------------------------

export interface BotCluster {
  key: string;
  city: string;
  device: string;
  duration_bucket: string;
  landing_page: string;
  sessions: number;
  share_of_raw: number;
}

function clusterKey(c: ClassifiedSession): string {
  const d = c.facts.duration_seconds;
  const bucket = d === null ? "na" : d <= 2 ? "0-2s" : d <= 5 ? "3-5s" : d <= 19 ? "6-19s" : "20s+";
  return `${c.facts.city || "unknown"}|${c.facts.device}|${bucket}|${c.facts.landing_page || "/"}`;
}

export function detectBotClusters(
  classified: ClassifiedSession[],
  minSize = 5,
): BotCluster[] {
  const total = classified.length || 1;
  const groups = new Map<string, ClassifiedSession[]>();
  for (const c of classified) {
    if (c.traffic_quality_class === "INTERNAL_OR_TEST") continue;
    const k = clusterKey(c);
    const arr = groups.get(k) ?? [];
    arr.push(c);
    groups.set(k, arr);
  }
  const out: BotCluster[] = [];
  for (const [key, rows] of groups) {
    if (rows.length < minSize) continue;
    const humanish = rows.filter((r) => r.traffic_quality_class === "PROBABLE_HUMAN").length;
    if (humanish / rows.length > 0.3) continue; // real audience cluster
    const [city, device, duration_bucket, landing_page] = key.split("|");
    out.push({
      key, city, device, duration_bucket, landing_page,
      sessions: rows.length,
      share_of_raw: Math.round((rows.length / total) * 1000) / 10,
    });
  }
  return out.sort((a, b) => b.sessions - a.sessions);
}

/** Bumps confidence (and UNKNOWN → bot) for members of synthetic clusters. */
export function applyClusterBoost(
  classified: ClassifiedSession[],
  _raw?: ClassifierSession[],
): ClassifiedSession[] {
  const clusters = new Set(detectBotClusters(classified).map((c) => c.key));
  if (clusters.size === 0) return classified;
  return classified.map((c) => {
    if (!clusters.has(clusterKey(c))) return c;
    if (c.traffic_quality_class === "PROBABLE_HUMAN" || c.traffic_quality_class === "INTERNAL_OR_TEST") return c;
    if (c.traffic_quality_class === "PROBABLE_BOT_OR_AUTOMATION") {
      return {
        ...c,
        traffic_quality_confidence: Math.min(0.95, c.traffic_quality_confidence + 0.1),
        classification_reasons: [...c.classification_reasons, "cluster:repeated_pattern"],
      };
    }
    if (c.traffic_quality_class === "UNKNOWN" && (c.facts.duration_seconds ?? 99) <= 2) {
      return {
        ...c,
        traffic_quality_class: "PROBABLE_BOT_OR_AUTOMATION",
        traffic_quality_confidence: 0.6,
        classification_reasons: [...c.classification_reasons, "cluster:repeated_pattern_zero_duration"],
      };
    }
    return c;
  });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface TrafficQualitySummary {
  total_sessions: number;
  quality: Record<TrafficQualityClass, number>;
  quality_pct: Record<TrafficQualityClass, number>;
  conservative_humans: number;
  expanded_humans: number;
  sources_raw: Record<SourceClass, number>;
  sources_human: Record<SourceClass, number>;
  commerce_human: {
    product_views: number;
    add_to_cart: number;
    view_cart: number;
    checkout: number;
    purchases: number;
    revenue: number;
  };
  top_human_sessions: ClassifiedSession[];
  bot_clusters: BotCluster[];
}

const QUALITY_KEYS: TrafficQualityClass[] = [
  "PROBABLE_HUMAN", "POSSIBLE_HUMAN", "PROBABLE_BOT_OR_AUTOMATION", "INTERNAL_OR_TEST", "UNKNOWN",
];
const SOURCE_KEYS: SourceClass[] = [
  "PINTEREST_PAID", "PINTEREST_ORGANIC", "GOOGLE_ORGANIC", "OTHER_SEARCH", "DIRECT",
  "REFERRAL", "TIKTOK", "META", "OTHER_PAID", "UNKNOWN",
];

export function summarizeTrafficQuality(rows: ClassifierSession[]): TrafficQualitySummary {
  const classified = classifySessions(rows);
  const total = classified.length;
  const quality = Object.fromEntries(QUALITY_KEYS.map((k) => [k, 0])) as Record<TrafficQualityClass, number>;
  const sources_raw = Object.fromEntries(SOURCE_KEYS.map((k) => [k, 0])) as Record<SourceClass, number>;
  const sources_human = Object.fromEntries(SOURCE_KEYS.map((k) => [k, 0])) as Record<SourceClass, number>;
  const commerce_human = {
    product_views: 0, add_to_cart: 0, view_cart: 0, checkout: 0, purchases: 0, revenue: 0,
  };

  for (const c of classified) {
    quality[c.traffic_quality_class] += 1;
    sources_raw[c.source_class] += 1;
    if (c.traffic_quality_class === "PROBABLE_HUMAN") {
      sources_human[c.source_class] += 1;
      if (c.facts.product_view) commerce_human.product_views += 1;
      if (c.facts.add_to_cart) commerce_human.add_to_cart += 1;
      if (c.facts.view_cart) commerce_human.view_cart += 1;
      if (c.facts.checkout) commerce_human.checkout += 1;
      if (c.facts.purchase) commerce_human.purchases += 1;
      commerce_human.revenue += c.facts.revenue;
    }
  }

  const quality_pct = Object.fromEntries(
    QUALITY_KEYS.map((k) => [k, total ? Math.round((quality[k] / total) * 1000) / 10 : 0]),
  ) as Record<TrafficQualityClass, number>;

  const top_human_sessions = classified
    .filter((c) => c.traffic_quality_class === "PROBABLE_HUMAN")
    .sort(
      (a, b) =>
        b.commercial_intent_score - a.commercial_intent_score ||
        b.traffic_quality_confidence - a.traffic_quality_confidence ||
        (b.facts.duration_seconds ?? 0) - (a.facts.duration_seconds ?? 0),
    )
    .slice(0, 10);

  return {
    total_sessions: total,
    quality,
    quality_pct,
    conservative_humans: quality.PROBABLE_HUMAN,
    expanded_humans: quality.PROBABLE_HUMAN + quality.POSSIBLE_HUMAN,
    sources_raw,
    sources_human,
    commerce_human,
    top_human_sessions,
    bot_clusters: detectBotClusters(classified),
  };
}

/** CSV columns appended by the classifier — raw fields are never overwritten. */
export const TRAFFIC_QUALITY_CSV_HEADERS = [
  "traffic_quality_class",
  "traffic_quality_confidence",
  "source_class",
  "commercial_intent_score",
  "commercial_intent_tier",
  "classification_reasons",
] as const;

export function trafficQualityCsvValues(c: ClassifiedSession): (string | number)[] {
  return [
    c.traffic_quality_class,
    c.traffic_quality_confidence,
    c.source_class,
    c.commercial_intent_score,
    c.commercial_intent_tier,
    c.classification_reasons.join("|"),
  ];
}
