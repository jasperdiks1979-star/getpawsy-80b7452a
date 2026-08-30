/**
 * Commercial eligibility V3 — SHADOW MODE (read-time only).
 *
 * Purpose: stored `exclude_from_commercial` / `traffic_class` on
 * `canonical_sessions` are produced by SQL `classify_channel_v2`, which never
 * sees user_agent, query string, JS/interaction evidence or dwell. Direct
 * sessions therefore collapse to UNKNOWN => excluded, permanently.
 *
 * This layer derives business eligibility at READ TIME from the strict-v3
 * traffic-quality classifier. It:
 *   - does NOT write to the database
 *   - does NOT mutate stored flags
 *   - does NOT change strict-v3 thresholds
 *   - is NOT wired into any production KPI gate yet
 *
 * Geo is explicitly NOT an input. Country/city are segmentation only.
 */

import {
  classifySessions,
  type ClassifiedSession,
  type ClassifierSession,
  type TrafficQualityClass,
} from "./trafficQualityClassifier";

/** Session shape as it arrives from the analytics-canonical truth envelope. */
export interface ShadowInputSession extends ClassifierSession {
  session_id?: string | null;
  stored_traffic_class_v2?: string | null;
  stored_exclude_from_commercial?: boolean | null;
  stored_is_bot?: boolean | null;
  stored_is_internal?: boolean | null;
  stored_technical_path?: boolean | null;
  country_iso2?: string | null;
}

export interface ShadowEligibilitySession {
  session_id: string;
  /** Diagnostic only — never authoritative in this layer. */
  stored_traffic_class_v2: string | null;
  stored_exclude_from_commercial: boolean | null;
  traffic_quality_class_v3: TrafficQualityClass;
  /** PROBABLE_HUMAN only. Verified business traffic. */
  commercial_eligible_v3_strict: boolean;
  /** PROBABLE_HUMAN + POSSIBLE_HUMAN. NEVER labelled verified. */
  commercial_eligible_v3_expanded: boolean;
  /** Hard veto fired (internal/test, bot, crawler, automation). */
  hard_veto: boolean;
  hard_veto_reason: string | null;
  /** Segmentation only — has zero influence on eligibility. */
  country: string | null;
  country_iso2: string | null;
  geo_confidence: "exact" | "country_only" | "none";
  classified: ClassifiedSession;
}

export interface CommerceGateMetrics {
  sessions: number;
  atc_sessions: number;
  view_cart_sessions: number;
  checkout_sessions: number;
  purchase_sessions: number;
  /** Session-derived revenue signal only; orders remain authoritative. */
  revenue: number;
}

export interface ShadowReconciliation {
  window_sessions: number;
  legacy: CommerceGateMetrics;
  strict_v3: CommerceGateMetrics;
  expanded_v3: CommerceGateMetrics;
  raw_canonical: CommerceGateMetrics;
  class_counts: Record<TrafficQualityClass, number>;
  hard_vetoes: number;
}

const ISO2: Record<string, string> = {
  "united states": "US", "united states of america": "US", usa: "US", us: "US",
  "u.s.": "US", "u.s.a.": "US",
  sweden: "SE", se: "SE",
  netherlands: "NL", "the netherlands": "NL", nl: "NL",
  germany: "DE", de: "DE",
  "united kingdom": "GB", "great britain": "GB", uk: "GB", gb: "GB",
  canada: "CA", ca: "CA", france: "FR", fr: "FR", spain: "ES", es: "ES",
  italy: "IT", it: "IT", belgium: "BE", be: "BE", australia: "AU", au: "AU",
  ireland: "IE", ie: "IE", denmark: "DK", dk: "DK", norway: "NO", no: "NO",
  finland: "FI", fi: "FI", poland: "PL", pl: "PL", india: "IN", in: "IN",
  brazil: "BR", br: "BR", japan: "JP", jp: "JP",
};

export function normalizeCountryIso2(country?: string | null): string | null {
  if (!country) return null;
  const k = country.trim().toLowerCase();
  if (!k) return null;
  if (ISO2[k]) return ISO2[k];
  if (/^[a-z]{2}$/.test(k)) return k.toUpperCase();
  return null;
}

/** Hard vetoes: proven non-business traffic, regardless of behaviour. */
function hardVeto(c: ClassifiedSession): string | null {
  if (c.traffic_quality_class === "INTERNAL_OR_TEST") return "internal_or_test";
  if (c.traffic_quality_class === "PROBABLE_BOT_OR_AUTOMATION") return "bot_or_automation";
  return null;
}

export function buildShadowEligibility(
  sessions: ShadowInputSession[],
): ShadowEligibilitySession[] {
  const classified = classifySessions(sessions as ClassifierSession[]);
  return classified.map((c, i) => {
    const src = sessions[i] ?? {};
    const veto = hardVeto(c);
    const cls = c.traffic_quality_class;
    const strict = !veto && cls === "PROBABLE_HUMAN";
    const expanded = !veto && (cls === "PROBABLE_HUMAN" || cls === "POSSIBLE_HUMAN");
    const country = (src.country ?? c.facts.country ?? null) || null;
    const iso2 = src.country_iso2 ?? normalizeCountryIso2(country);
    return {
      session_id: c.session_id,
      stored_traffic_class_v2: src.stored_traffic_class_v2 ?? null,
      stored_exclude_from_commercial: src.stored_exclude_from_commercial ?? null,
      traffic_quality_class_v3: cls,
      commercial_eligible_v3_strict: strict,
      commercial_eligible_v3_expanded: expanded,
      hard_veto: !!veto,
      hard_veto_reason: veto,
      country,
      country_iso2: iso2,
      geo_confidence: src.city && country ? "exact" : country ? "country_only" : "none",
      classified: c,
    };
  });
}

function emptyMetrics(): CommerceGateMetrics {
  return {
    sessions: 0, atc_sessions: 0, view_cart_sessions: 0,
    checkout_sessions: 0, purchase_sessions: 0, revenue: 0,
  };
}

function accumulate(m: CommerceGateMetrics, c: ClassifiedSession) {
  m.sessions += 1;
  if (c.facts.add_to_cart) m.atc_sessions += 1;
  if (c.facts.view_cart) m.view_cart_sessions += 1;
  if (c.facts.checkout) m.checkout_sessions += 1;
  if (c.facts.purchase) m.purchase_sessions += 1;
  m.revenue += c.facts.revenue || 0;
}

/**
 * Legacy gate replica: stored v2 flags decide (what production KPIs use today).
 */
function legacyEligible(s: ShadowEligibilitySession, raw: ShadowInputSession): boolean {
  if (raw.stored_is_internal || raw.stored_is_bot || raw.stored_technical_path) return false;
  if (raw.stored_exclude_from_commercial === true) return false;
  const tc = s.stored_traffic_class_v2;
  if (tc && ["INTERNAL_PREVIEW", "BOT_CONFIRMED", "BOT_PROBABLE", "CRAWLER", "TECHNICAL"].includes(tc)) {
    return false;
  }
  return true;
}

export function reconcileShadowGates(
  sessions: ShadowInputSession[],
): { rows: ShadowEligibilitySession[]; reconciliation: ShadowReconciliation } {
  const rows = buildShadowEligibility(sessions);
  const legacy = emptyMetrics();
  const strict = emptyMetrics();
  const expanded = emptyMetrics();
  const raw = emptyMetrics();
  const class_counts: Record<TrafficQualityClass, number> = {
    PROBABLE_HUMAN: 0, POSSIBLE_HUMAN: 0, PROBABLE_BOT_OR_AUTOMATION: 0,
    INTERNAL_OR_TEST: 0, UNKNOWN: 0,
  };
  let hard_vetoes = 0;

  rows.forEach((r, i) => {
    const src = sessions[i] ?? {};
    class_counts[r.traffic_quality_class] += 1;
    if (r.hard_veto) hard_vetoes += 1;
    accumulate(raw, r.classified);
    if (legacyEligible(r, src)) accumulate(legacy, r.classified);
    if (r.commercial_eligible_v3_strict) accumulate(strict, r.classified);
    if (r.commercial_eligible_v3_expanded) accumulate(expanded, r.classified);
  });

  return {
    rows,
    reconciliation: {
      window_sessions: rows.length,
      legacy, strict_v3: strict, expanded_v3: expanded, raw_canonical: raw,
      class_counts, hard_vetoes,
    },
  };
}

export interface SuspiciousSession {
  session_id: string;
  reasons: string[];
  duration_seconds: number | null;
  page_views: number;
  distinct_paths: number;
  source: string;
  device: string;
  country: string | null;
  product_view: boolean;
  add_to_cart: boolean;
  checkout: boolean;
}

/**
 * False-positive safety audit: every strict-v3-eligible session that carries a
 * commerce event is re-inspected for automation smells. Nothing is hidden —
 * suspects are returned so a human can decide.
 */
export function auditStrictCommerceSessions(
  rows: ShadowEligibilitySession[],
): { inspected: number; suspicious: SuspiciousSession[] } {
  const fingerprints = new Map<string, number>();
  for (const r of rows) {
    const f = r.classified.facts;
    fingerprints.set(
      `${f.device}|${f.landing_page}|${r.country ?? ""}`,
      (fingerprints.get(`${f.device}|${f.landing_page}|${r.country ?? ""}`) ?? 0) + 1,
    );
  }
  const commerce = rows.filter(
    (r) =>
      r.commercial_eligible_v3_strict &&
      (r.classified.facts.add_to_cart || r.classified.facts.view_cart || r.classified.facts.checkout),
  );
  const suspicious: SuspiciousSession[] = [];
  for (const r of commerce) {
    const f = r.classified.facts;
    const reasons: string[] = [];
    const dur = f.duration_seconds;
    if (dur != null && dur < 5) reasons.push("dwell_lt_5s");
    if (dur != null && dur > 0 && f.page_views / dur > 0.6) reasons.push("burst_rate");
    if (f.page_views >= 3 && f.distinct_paths <= 1) reasons.push("single_path_repeat");
    if (f.missing_metadata) reasons.push("missing_metadata");
    const fpKey = `${f.device}|${f.landing_page}|${r.country ?? ""}`;
    if ((fingerprints.get(fpKey) ?? 0) >= 25) reasons.push("repeated_fingerprint");
    if (reasons.length > 0) {
      suspicious.push({
        session_id: r.session_id,
        reasons,
        duration_seconds: dur,
        page_views: f.page_views,
        distinct_paths: f.distinct_paths,
        source: r.classified.source_class,
        device: f.device,
        country: r.country,
        product_view: f.product_view,
        add_to_cart: f.add_to_cart,
        checkout: f.checkout,
      });
    }
  }
  return { inspected: commerce.length, suspicious };
}
