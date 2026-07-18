// Shared v2 analytics adapter — the ONE reader for the internal Phase 4C
// traffic-quality envelope. Every authenticated internal surface (KPI
// strips, world map, funnel, journey, CSV, markdown summary) MUST derive
// its counters from `getCanonicalAnalyticsMetrics()` so bucket arithmetic
// stays in one place and legacy fallback is explicit.
//
// Invariants:
//   • commercial = human + genuine uncertain (asserted, never re-derived
//     from raw minus excluded buckets in the UI).
//   • legacy_unclassified is NEVER counted as commercial.
//   • When `envelope_resolved !== "v2"` the caller sees `envelope="v1"`
//     and only the v1 totals are populated — bucket fields fall back to
//     `null` so UIs can visibly mark the legacy state.

import type { TruthResponse } from "@/hooks/useAnalyticsTruth";

export type ResolvedEnvelope = "v2" | "v1";

export interface CanonicalAnalyticsMetrics {
  envelope_resolved: ResolvedEnvelope;
  // Bucket sessions
  human_sessions: number | null;
  genuine_uncertain_sessions: number | null;
  commercial_sessions: number | null;
  crawler_sessions: number | null;
  bot_sessions: number | null;
  technical_sessions: number | null;
  internal_sessions: number | null;
  legacy_unclassified_sessions: number | null;
  raw_sessions: number | null;
  // Bucket visitors
  human_visitors: number | null;
  genuine_uncertain_visitors: number | null;
  commercial_visitors: number | null;
  crawler_visitors: number | null;
  bot_visitors: number | null;
  technical_visitors: number | null;
  internal_visitors: number | null;
  legacy_unclassified_visitors: number | null;
  raw_visitors: number | null;
  // Diagnostics
  classification_coverage_pct: number | null;
  classification_version: string | null;
  atc_sessions_matched: number | null;
  atc_sessions_scanned: number | null;
  // Order/revenue (source of truth: orders table, unchanged by v1/v2 flip)
  purchases: number;
  checkout_started: number;
  revenue: number;
  currency: string;
  // v1 legacy totals for reversible display
  v1_visitors: number;
  v1_sessions: number;
}

/**
 * Extract v2 metrics from a canonical analytics response. When v2 is not
 * present (flag off, non-admin, or explicit `?envelope=v1`) the adapter
 * returns v1-only metrics and `envelope_resolved="v1"`. UIs must visibly
 * mark that state as legacy.
 */
export function getCanonicalAnalyticsMetrics(
  response: (TruthResponse & { v2?: any; v2_gate?: { envelope_resolved?: string } }) | null | undefined,
): CanonicalAnalyticsMetrics | null {
  if (!response) return null;
  const t = response.totals;
  const v2 = response.v2;
  const resolved: ResolvedEnvelope =
    response.v2_gate?.envelope_resolved === "v2" && v2 ? "v2" : "v1";

  const base = {
    purchases: Number(t?.purchases ?? 0),
    checkout_started: Number(t?.checkout_started ?? 0),
    revenue: Number(t?.revenue ?? 0),
    currency: String(t?.currency ?? "USD"),
    v1_visitors: Number(t?.visitors ?? 0),
    v1_sessions: Number(t?.sessions ?? 0),
  };

  if (resolved !== "v2") {
    return {
      envelope_resolved: "v1",
      human_sessions: null,
      genuine_uncertain_sessions: null,
      commercial_sessions: null,
      crawler_sessions: null,
      bot_sessions: null,
      technical_sessions: null,
      internal_sessions: null,
      legacy_unclassified_sessions: null,
      raw_sessions: null,
      human_visitors: null,
      genuine_uncertain_visitors: null,
      commercial_visitors: null,
      crawler_visitors: null,
      bot_visitors: null,
      technical_visitors: null,
      internal_visitors: null,
      legacy_unclassified_visitors: null,
      raw_visitors: null,
      classification_coverage_pct: null,
      classification_version: null,
      atc_sessions_matched: null,
      atc_sessions_scanned: null,
      ...base,
    };
  }

  const human_sessions = Number(v2.human_sessions ?? 0);
  const uncertain_sessions = Number(v2.uncertain_sessions ?? 0);
  const commercial_sessions = Number(v2.commercial_sessions ?? 0);
  // Invariant check — server is authoritative but we assert to catch drift.
  const derivedCommercial = human_sessions + uncertain_sessions;
  if (Math.abs(derivedCommercial - commercial_sessions) > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[analyticsV2Adapter] commercial_sessions invariant broken",
      { commercial_sessions, human_sessions, uncertain_sessions },
    );
  }

  return {
    envelope_resolved: "v2",
    human_sessions,
    genuine_uncertain_sessions: uncertain_sessions,
    commercial_sessions,
    crawler_sessions: Number(v2.crawler_sessions ?? 0),
    bot_sessions: Number(v2.bot_sessions ?? 0),
    technical_sessions: Number(v2.technical_sessions ?? 0),
    internal_sessions: Number(v2.internal_sessions ?? 0),
    legacy_unclassified_sessions: Number(v2.legacy_unclassified_sessions ?? 0),
    raw_sessions: Number(v2.raw_sessions ?? 0),
    human_visitors: Number(v2.human_visitors ?? 0),
    genuine_uncertain_visitors: Number(v2.uncertain_visitors ?? 0),
    commercial_visitors: Number(v2.commercial_visitors ?? 0),
    crawler_visitors: Number(v2.crawler_visitors ?? 0),
    bot_visitors: Number(v2.bot_visitors ?? 0),
    technical_visitors: Number(v2.technical_visitors ?? 0),
    internal_visitors: Number(v2.internal_visitors ?? 0),
    legacy_unclassified_visitors: Number(v2.legacy_unclassified_visitors ?? 0),
    raw_visitors: Number(v2.raw_visitors ?? 0),
    classification_coverage_pct: Number(v2.classification_coverage_pct ?? 0),
    classification_version: String(v2.classification_version ?? ""),
    atc_sessions_matched: Number(v2.atc_sessions_matched ?? 0),
    atc_sessions_scanned: Number(v2.atc_sessions_scanned ?? 0),
    ...base,
  };
}

/** Dutch bucket labels required by the internal analytics spec. */
export const V2_LABELS_NL = {
  human: "Echte bezoekers",
  commercial: "Bezoekers",
  uncertain: "Onzeker",
  crawler: "Crawlers",
  bot: "Bots",
  technical: "Technisch verkeer",
  internal: "Intern verkeer",
  legacy: "Niet geclassificeerd",
  raw: "Ruw totaal",
} as const;
