/**
 * Human-first analytics view model.
 *
 * ONE eligibility rule, applied identically to every metric and every
 * dimension (sessions, pageviews, product views, ATC, cart views, checkout
 * starts, purchases, revenue, conversion rate, source/medium, geo, device,
 * landing pages, guide traffic, funnel). No mixed denominators.
 *
 * It reuses the EXISTING permanent strict-v3 classifier
 * (`src/lib/trafficQualityClassifier.ts`) — no new classifier, no new
 * thresholds, no database reads, no mutation of raw sessions. Pure reporting
 * over the session list already returned by `analytics-canonical`.
 */

import {
  classifySessions,
  type ClassifiedSession,
  type ClassifierSession,
  type SourceClass,
  type TrafficQualityClass,
} from "./trafficQualityClassifier";

/** Reporting mode. Default across the admin UI is `human`. */
export type TrafficMode = "human" | "expanded" | "raw";

export const TRAFFIC_MODES: Array<{ value: TrafficMode; label: string; help: string }> = [
  {
    value: "human",
    label: "Human",
    help: "Strict: PROBABLE_HUMAN only. Default for all commercial KPIs.",
  },
  {
    value: "expanded",
    label: "Expanded human",
    help: "PROBABLE_HUMAN + POSSIBLE_HUMAN. Ambiguous traffic, never labelled verified.",
  },
  {
    value: "raw",
    label: "Raw",
    help: "Diagnostic only: every ingested session incl. bots, automation and internal.",
  },
];

export const DEFAULT_TRAFFIC_MODE: TrafficMode = "human";

export interface HumanFirstSession extends ClassifierSession {
  visitor_id?: string | null;
  classification_reason?: string | null;
}

/** THE eligibility rule. Everything below counts a session iff this is true. */
export function isEligible(cls: TrafficQualityClass, mode: TrafficMode): boolean {
  if (mode === "raw") return true;
  if (mode === "expanded") return cls === "PROBABLE_HUMAN" || cls === "POSSIBLE_HUMAN";
  return cls === "PROBABLE_HUMAN";
}

export interface HumanFirstMetrics {
  sessions: number;
  visitors: number;
  page_views: number;
  product_views: number;
  add_to_cart: number;
  view_cart: number;
  checkout_started: number;
  purchases: number;
  revenue: number;
  /** purchases / sessions (0 when no eligible sessions). */
  conversion_rate: number;
}

export interface QualitySummary {
  total: number;
  probable_human: number;
  possible_human: number;
  unknown: number;
  internal: number;
  bot: number;
  /** possible + unknown — the ambiguous bucket, never mixed into strict. */
  possible_or_unknown: number;
  /** bot / total, 1 decimal. */
  bot_share_pct: number;
  human_share_pct: number;
}

export interface DimensionRow {
  key: string;
  label: string;
  sessions: number;
  page_views: number;
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  purchases: number;
  revenue: number;
}

export interface FunnelStepRow {
  stage: "Sessions" | "Product views" | "Add to cart" | "Cart views" | "Checkout" | "Purchases";
  count: number;
  /** Share of eligible sessions, 1 decimal. */
  pct_of_sessions: number;
}

export interface DrilldownRow {
  session_id: string;
  traffic_quality_class: TrafficQualityClass;
  confidence: number;
  source_class: SourceClass;
  country: string;
  device: string;
  landing_page: string;
  page_views: number;
  duration_seconds: number | null;
  commercial_intent_score: number;
  reasons: string[];
  /** Server-side v2 reason, when the envelope supplied one. */
  stored_reason: string | null;
  eligible: boolean;
}

export interface HumanFirstView {
  mode: TrafficMode;
  metrics: HumanFirstMetrics;
  funnel: FunnelStepRow[];
  quality: QualitySummary;
  channels: DimensionRow[];
  countries: DimensionRow[];
  devices: DimensionRow[];
  landingPages: DimensionRow[];
  /** Landing pages under /guides or /blog — content traffic, same rule. */
  guideTraffic: DimensionRow[];
  drilldown: DrilldownRow[];
}

const CHANNEL_LABEL: Record<SourceClass, string> = {
  PINTEREST_PAID: "Pinterest paid",
  PINTEREST_ORGANIC: "Pinterest organic",
  GOOGLE_ORGANIC: "Organic search (Google)",
  OTHER_SEARCH: "Other search",
  DIRECT: "Direct",
  REFERRAL: "Referral",
  TIKTOK: "TikTok",
  META: "Meta",
  OTHER_PAID: "Other paid",
  UNKNOWN: "Unknown",
};

export function channelLabel(s: SourceClass): string {
  return CHANNEL_LABEL[s] ?? s;
}

function emptyRow(key: string, label: string): DimensionRow {
  return {
    key, label, sessions: 0, page_views: 0, product_views: 0,
    add_to_cart: 0, checkout_started: 0, purchases: 0, revenue: 0,
  };
}

function addToRow(row: DimensionRow, c: ClassifiedSession) {
  row.sessions += 1;
  row.page_views += c.facts.page_views;
  if (c.facts.product_view) row.product_views += 1;
  if (c.facts.add_to_cart) row.add_to_cart += 1;
  if (c.facts.checkout) row.checkout_started += 1;
  if (c.facts.purchase) row.purchases += 1;
  row.revenue += c.facts.revenue;
}

function sortRows(map: Map<string, DimensionRow>): DimensionRow[] {
  return [...map.values()].sort(
    (a, b) => b.sessions - a.sessions || b.page_views - a.page_views || a.label.localeCompare(b.label),
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizePath(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "(unknown)";
  try {
    const url = v.startsWith("http") ? new URL(v) : new URL(v, "https://getpawsy.pet");
    return url.pathname || "/";
  } catch {
    return v.split("?")[0] || "/";
  }
}

export function summarizeQuality(classified: ClassifiedSession[]): QualitySummary {
  const q: QualitySummary = {
    total: classified.length,
    probable_human: 0,
    possible_human: 0,
    unknown: 0,
    internal: 0,
    bot: 0,
    possible_or_unknown: 0,
    bot_share_pct: 0,
    human_share_pct: 0,
  };
  for (const c of classified) {
    switch (c.traffic_quality_class) {
      case "PROBABLE_HUMAN": q.probable_human += 1; break;
      case "POSSIBLE_HUMAN": q.possible_human += 1; break;
      case "PROBABLE_BOT_OR_AUTOMATION": q.bot += 1; break;
      case "INTERNAL_OR_TEST": q.internal += 1; break;
      default: q.unknown += 1; break;
    }
  }
  q.possible_or_unknown = q.possible_human + q.unknown;
  if (q.total > 0) {
    q.bot_share_pct = round1((q.bot / q.total) * 100);
    q.human_share_pct = round1((q.probable_human / q.total) * 100);
  }
  return q;
}

/**
 * Build the full mode-aware view. `quality` is ALWAYS computed over every
 * session in the window so the traffic-quality summary stays truthful
 * regardless of the selected mode.
 */
export function buildHumanFirstView(
  rows: HumanFirstSession[],
  mode: TrafficMode = DEFAULT_TRAFFIC_MODE,
): HumanFirstView {
  const src = rows ?? [];
  const classified = classifySessions(src as ClassifierSession[]);
  const quality = summarizeQuality(classified);

  const metrics: HumanFirstMetrics = {
    sessions: 0, visitors: 0, page_views: 0, product_views: 0, add_to_cart: 0,
    view_cart: 0, checkout_started: 0, purchases: 0, revenue: 0, conversion_rate: 0,
  };
  const visitors = new Set<string>();
  const channels = new Map<string, DimensionRow>();
  const countries = new Map<string, DimensionRow>();
  const devices = new Map<string, DimensionRow>();
  const landing = new Map<string, DimensionRow>();
  const guides = new Map<string, DimensionRow>();
  const drilldown: DrilldownRow[] = [];

  classified.forEach((c, i) => {
    const raw = src[i] ?? {};
    const eligible = isEligible(c.traffic_quality_class, mode);
    drilldown.push({
      session_id: c.session_id,
      traffic_quality_class: c.traffic_quality_class,
      confidence: c.traffic_quality_confidence,
      source_class: c.source_class,
      country: c.facts.country || "(unknown)",
      device: c.facts.device || "unknown",
      landing_page: normalizePath(c.facts.landing_page),
      page_views: c.facts.page_views,
      duration_seconds: c.facts.duration_seconds,
      commercial_intent_score: c.commercial_intent_score,
      reasons: c.classification_reasons,
      stored_reason: raw.classification_reason ?? null,
      eligible,
    });
    if (!eligible) return;

    metrics.sessions += 1;
    visitors.add(String(raw.visitor_id || c.session_id));
    metrics.page_views += c.facts.page_views;
    if (c.facts.product_view) metrics.product_views += 1;
    if (c.facts.add_to_cart) metrics.add_to_cart += 1;
    if (c.facts.view_cart) metrics.view_cart += 1;
    if (c.facts.checkout) metrics.checkout_started += 1;
    if (c.facts.purchase) metrics.purchases += 1;
    metrics.revenue += c.facts.revenue;

    const chKey = c.source_class;
    if (!channels.has(chKey)) channels.set(chKey, emptyRow(chKey, channelLabel(c.source_class)));
    addToRow(channels.get(chKey)!, c);

    const coKey = c.facts.country || "(unknown)";
    if (!countries.has(coKey)) countries.set(coKey, emptyRow(coKey, coKey));
    addToRow(countries.get(coKey)!, c);

    const dvKey = c.facts.device || "unknown";
    if (!devices.has(dvKey)) devices.set(dvKey, emptyRow(dvKey, dvKey));
    addToRow(devices.get(dvKey)!, c);

    const lpKey = normalizePath(c.facts.landing_page);
    if (!landing.has(lpKey)) landing.set(lpKey, emptyRow(lpKey, lpKey));
    addToRow(landing.get(lpKey)!, c);

    if (/^\/(guides?|blog)\b/i.test(lpKey)) {
      if (!guides.has(lpKey)) guides.set(lpKey, emptyRow(lpKey, lpKey));
      addToRow(guides.get(lpKey)!, c);
    }
  });

  metrics.visitors = visitors.size;
  metrics.revenue = Math.round(metrics.revenue * 100) / 100;
  metrics.conversion_rate = metrics.sessions > 0 ? metrics.purchases / metrics.sessions : 0;

  const share = (n: number) => (metrics.sessions > 0 ? round1((n / metrics.sessions) * 100) : 0);
  const funnel: FunnelStepRow[] = [
    { stage: "Sessions", count: metrics.sessions, pct_of_sessions: metrics.sessions > 0 ? 100 : 0 },
    { stage: "Product views", count: metrics.product_views, pct_of_sessions: share(metrics.product_views) },
    { stage: "Add to cart", count: metrics.add_to_cart, pct_of_sessions: share(metrics.add_to_cart) },
    { stage: "Cart views", count: metrics.view_cart, pct_of_sessions: share(metrics.view_cart) },
    { stage: "Checkout", count: metrics.checkout_started, pct_of_sessions: share(metrics.checkout_started) },
    { stage: "Purchases", count: metrics.purchases, pct_of_sessions: share(metrics.purchases) },
  ];

  return {
    mode,
    metrics,
    funnel,
    quality,
    channels: sortRows(channels),
    countries: sortRows(countries),
    devices: sortRows(devices),
    landingPages: sortRows(landing).slice(0, 25),
    guideTraffic: sortRows(guides).slice(0, 25),
    drilldown,
  };
}
