/**
 * kpiSessionFilter — runtime assertions for business KPI aggregation.
 *
 * Two invariants every mission KPI dashboard MUST honour:
 *
 *   1. Sessions whose referrer is a Lovable preview / editor host
 *      (lovable.dev, lovable.app, lovableproject.com, gptengineer.app,
 *      id-preview--*) are NEVER counted as business traffic.
 *   2. A session with no referrer AND no UTM params is classified as
 *      `unknown` — never as `direct`. `direct/(none)` is a legacy
 *      pollution marker (see attribution cleanup hotfix) and MUST NOT
 *      appear in KPI output.
 *
 * This module gives us a single, tested implementation that both the
 * client aggregation paths and the CEO report can call, plus assertion
 * helpers that throw in dev/test when a caller tries to bypass the
 * rules.
 */

import { isPreviewReferrer } from "@/lib/utmNormalizer";

export type KpiSessionBucket =
  | "included"
  | "excluded_preview"
  | "unknown"
  | "excluded_legacy_direct";

export interface KpiSessionInput {
  session_id?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  landing_page?: string | null;
}

export interface KpiMetrics {
  total: number;
  included: number;
  excluded_preview: number;
  unknown: number;
  excluded_legacy_direct: number;
  /** included / total, 0 when total=0. Rounded to 4 decimals. */
  included_ratio: number;
  /** unknown / total, 0 when total=0. Rounded to 4 decimals. */
  unknown_ratio: number;
}

const LEGACY_DIRECT_SOURCE = "direct";
const LEGACY_NONE_MEDIUMS = new Set(["(none)", "none"]);

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Detect the legacy `direct/(none)` UTM pollution marker in either the
 * stored UTM columns OR the raw landing_page query string.
 */
export function hasLegacyDirectFallback(s: KpiSessionInput): boolean {
  if (norm(s.utm_source) === LEGACY_DIRECT_SOURCE &&
      LEGACY_NONE_MEDIUMS.has(norm(s.utm_medium))) {
    return true;
  }
  const lp = (s.landing_page ?? "").toLowerCase();
  if (!lp) return false;
  // literal + urlencoded forms, including malformed encodings such as
  // `%28none%28` observed in the wild (double-open-paren regression).
  if (!lp.includes("utm_source=direct")) return false;
  return (
    lp.includes("utm_medium=(none)") ||
    lp.includes("utm_medium=%28none%29") ||
    // malformed: `%28none%28`, `%28none`, `(none(` — any `(none` prefix
    // for utm_medium is treated as the legacy fallback marker.
    /utm_medium=(%28|\()none/.test(lp)
  );
}

/**
 * Classify a session into a KPI bucket. Pure function — safe to call
 * from tests, aggregators and assertions.
 */
export function classifyKpiSession(s: KpiSessionInput): KpiSessionBucket {
  if (isPreviewReferrer(s.referrer)) return "excluded_preview";
  if (hasLegacyDirectFallback(s)) return "excluded_legacy_direct";

  const hasRef = !!(s.referrer && s.referrer.trim());
  const hasUtm = !!(
    (s.utm_source && s.utm_source.trim()) ||
    (s.utm_medium && s.utm_medium.trim()) ||
    (s.utm_campaign && s.utm_campaign.trim())
  );
  if (!hasRef && !hasUtm) return "unknown";
  return "included";
}

/**
 * Aggregate KPI-safe metrics over an array of sessions. Deterministic
 * output shape so tests and reports can diff it directly.
 */
export function computeKpiMetrics(rows: KpiSessionInput[]): KpiMetrics {
  const m: KpiMetrics = {
    total: rows.length,
    included: 0,
    excluded_preview: 0,
    unknown: 0,
    excluded_legacy_direct: 0,
    included_ratio: 0,
    unknown_ratio: 0,
  };
  for (const r of rows) {
    m[classifyKpiSession(r)] += 1;
  }
  if (m.total > 0) {
    m.included_ratio = Math.round((m.included / m.total) * 10000) / 10000;
    m.unknown_ratio = Math.round((m.unknown / m.total) * 10000) / 10000;
  }
  return m;
}

/**
 * Filter a session array down to KPI-eligible rows. Use this before
 * any business KPI aggregation (conversion rate, revenue attribution,
 * funnel counts) so preview and legacy-direct traffic can never leak in.
 */
export function filterKpiSessions<T extends KpiSessionInput>(rows: T[]): T[] {
  return rows.filter((r) => classifyKpiSession(r) === "included");
}

/**
 * Runtime assertion — throws when a caller hands a row to a business
 * KPI aggregator that should have been excluded. Wired into the
 * aggregation entrypoints in dev/test builds; in prod it degrades to a
 * `console.warn` so a bad row never crashes the dashboard, only flags.
 */
export class KpiAssertionError extends Error {
  readonly bucket: KpiSessionBucket;
  readonly session: KpiSessionInput;
  constructor(bucket: KpiSessionBucket, session: KpiSessionInput) {
    super(
      `KPI invariant violated: session bucket=${bucket} must be excluded ` +
        `from business KPIs (session_id=${session.session_id ?? "?"})`,
    );
    this.name = "KpiAssertionError";
    this.bucket = bucket;
    this.session = session;
  }
}

function isProdRuntime(): boolean {
  try {
    // Vitest sets MODE=test; Vite prod sets MODE=production
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mode = (import.meta as any)?.env?.MODE;
    return mode === "production";
  } catch {
    return false;
  }
}

/**
 * Assert that a single session is KPI-eligible. Throws in dev/test;
 * warns in production. Prefer `assertKpiInputs` for bulk aggregation.
 */
export function assertKpiEligible(s: KpiSessionInput): void {
  const bucket = classifyKpiSession(s);
  if (bucket === "included") return;
  const err = new KpiAssertionError(bucket, s);
  if (isProdRuntime()) {
    // eslint-disable-next-line no-console
    console.warn("[kpi-assert]", err.message);
    return;
  }
  throw err;
}

/**
 * Assert an entire batch is KPI-eligible. Returns the KpiMetrics so the
 * caller can also emit them to a dashboard / log.
 */
export function assertKpiInputs(rows: KpiSessionInput[]): KpiMetrics {
  for (const r of rows) assertKpiEligible(r);
  return computeKpiMetrics(rows);
}

/**
 * Convenience: run the classifier + metrics in one call for the CEO
 * report. Never throws — returns a plain object that can be JSON-
 * serialised into `governance_decision_log` or the daily audit artifact.
 */
export function kpiAuditReport(rows: KpiSessionInput[]): KpiMetrics & {
  ok: boolean;
  violations: number;
} {
  const m = computeKpiMetrics(rows);
  const violations = m.excluded_preview + m.excluded_legacy_direct;
  return { ...m, ok: violations === 0, violations };
}