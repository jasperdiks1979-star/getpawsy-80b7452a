/**
 * Real-Human Session Classifier — client helper.
 *
 * Single source of truth for "is this session a real human?" across mission
 * KPI dashboards. Excludes bots, crawlers, smoke tests, admin/internal,
 * Pinterest iOS prefetch, Lovable preview, datacenter monitors, and the
 * classic sub-3s NULL-trio bounce fingerprint documented in the July 2026
 * conversion forensics report.
 *
 * Server truth: `public.is_real_human_session(...)` +
 * `public.real_human_sessions` view. Prefer the view in queries; use this
 * TS mirror only when you already hold a canonical_sessions row on the
 * client (e.g. streaming feed, live tail).
 */

export interface RealHumanSessionInput {
  session_id?: string | null;
  first_seen_at?: string | Date | null;
  last_seen_at?: string | Date | null;
  landing_page?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  country?: string | null;
  device?: string | null;
  browser?: string | null;
  os?: string | null;
  screen_wxh?: string | null;
  tsi_is_bot?: boolean | null;
  tsi_is_internal?: boolean | null;
  tsi_bucket?: string | null;
}

const SMOKE_SESSION_PREFIXES = ["atc-", "smoke-", "synthetic-", "e2e-"];
const INTERNAL_UTM_SOURCES = new Set([
  "smoke", "internal", "admin", "test", "synthetic", "lovable", "ci",
]);
const INTERNAL_UTM_MEDIUMS = new Set([
  "smoke", "internal", "admin", "test", "synthetic", "ci",
]);
const EXCLUDED_TSI_BUCKETS = new Set([
  "bot", "search_bot", "ai_crawler", "smoke_test",
  "lovable_preview", "ai_worker", "internal", "qa",
]);
const ADMIN_COUNTRIES = new Set(["NL", "THE NETHERLANDS", "NETHERLANDS"]);

function toMs(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Returns true iff the session passes the real-human classifier.
 * Mirrors `public.is_real_human_session()` exactly.
 */
export function isRealHumanSession(s: RealHumanSessionInput): boolean {
  if (s.tsi_is_bot === true) return false;
  if (s.tsi_is_internal === true) return false;
  if (s.tsi_bucket && EXCLUDED_TSI_BUCKETS.has(s.tsi_bucket)) return false;

  const sid = (s.session_id ?? "").toLowerCase();
  if (SMOKE_SESSION_PREFIXES.some((p) => sid.startsWith(p))) return false;

  const lp = (s.landing_page ?? "").toLowerCase();
  if (lp.includes("_smoke=")) return false;
  if (lp.includes("smoke_test=")) return false;
  if (lp.includes("__lovable=1")) return false;

  const utmSrc = (s.utm_source ?? "").toLowerCase();
  const utmMed = (s.utm_medium ?? "").toLowerCase();
  const utmCamp = (s.utm_campaign ?? "").toLowerCase();
  if (INTERNAL_UTM_SOURCES.has(utmSrc)) return false;
  if (INTERNAL_UTM_MEDIUMS.has(utmMed)) return false;
  if (utmCamp.startsWith("smoke") || utmCamp.startsWith("internal") || utmCamp.startsWith("admin")) return false;

  const ref = (s.referrer ?? "").toLowerCase();
  if (ref.includes("lovable.app") || ref.includes("lovable.dev") || ref.includes("id-preview--")) {
    return false;
  }

  if (!s.country || !s.device) return false;
  if (ADMIN_COUNTRIES.has(s.country.toUpperCase())) return false;

  if (s.screen_wxh === "390x844" && ref.includes("pinterest.com")) return false;

  const first = toMs(s.first_seen_at);
  const last = toMs(s.last_seen_at);
  if (first !== null && last !== null && (last - first) < 3000
      && !s.browser && !s.device && !s.os) {
    return false;
  }

  return true;
}

/**
 * Convenience: filter an array of canonical_sessions-shaped rows to real
 * humans only.
 */
export function filterRealHumans<T extends RealHumanSessionInput>(rows: T[]): T[] {
  return rows.filter(isRealHumanSession);
}

/**
 * Canonical view name — use in `supabase.from(REAL_HUMAN_SESSIONS_VIEW)` so
 * every dashboard hits the same server-side filter.
 */
export const REAL_HUMAN_SESSIONS_VIEW = "real_human_sessions" as const;

/**
 * Canonical counters view for mission dashboards.
 */
export const REAL_HUMAN_COUNTERS_VIEW = "real_human_sessions_counters_7d" as const;