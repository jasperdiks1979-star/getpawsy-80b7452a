import { useMemo } from "react";
import {
  useAnalyticsTruth,
  countersFromSessions,
  ANALYTICS_TRUTH_MAX_ATTEMPTS,
  type TruthSession,
} from "@/hooks/useAnalyticsTruth";

import type { ProToolbarState } from "./ProToolbar";
import { proHoursForRange } from "./ProToolbar";
import { getCanonicalAnalyticsMetrics } from "@/lib/analyticsV2Adapter";
import {
  summarizeTrafficQuality,
  type ClassifierSession,
} from "@/lib/trafficQualityClassifier";

import { PanelLoadingState } from "@/components/admin/PanelLoadingState";

/**
 * Canonical KPI header for the Pro page.
 *
 * ALL numbers come from `analytics-canonical` via `useAnalyticsTruth`. React
 * Query dedupes the fetch with any other consumer using the same
 * (hours, geo) key, so this does NOT introduce a parallel query pipeline.
 *
 * When the toolbar is in Live mode we intentionally BLANK the KPI values and
 * show "Not canonical" — live presence is diagnostic only and must never be
 * confused with business truth.
 */
export interface ProKpiHeaderProps {
  state: ProToolbarState;
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Human-readable cache freshness, e.g. "42s ago" / "6m ago". */
function fmtAge(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "unknown";
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function filteredSessions(rows: TruthSession[], state: ProToolbarState): TruthSession[] {
  return rows.filter((s) => {
    if (state.excludeInternal && s.is_internal) return false;
    if (state.source !== "all" && s.source !== state.source) return false;
    if (state.activity === "cart" && !s.has_add_to_cart) return false;
    if (state.activity === "checkout" && !s.has_checkout) return false;
    if (state.activity === "browsing" && (s.has_add_to_cart || s.has_checkout)) return false;
    return true;
  });
}

export function ProKpiHeader({ state }: ProKpiHeaderProps) {
  const isLive = state.timeRange === "live";
  const { data: truth, isLoading, isError, error, refetch, failureCount } = useAnalyticsTruth({
    hours: proHoursForRange(state.timeRange),
    geo: state.usOnly ? "US" : "all",
    // PHASE 3 — live mode is presence-only. Never fire a canonical window
    // query behind a blocked KPI panel.
    enabled: !isLive,
  });
  const v2metrics = useMemo(() => getCanonicalAnalyticsMetrics(truth as any), [truth]);

  const scopedRows = useMemo(
    () => (truth?.sessions ? filteredSessions(truth.sessions, state) : []),
    [truth, state],
  );

  const derived = useMemo(() => {
    if (!truth?.sessions) return null;
    return countersFromSessions(scopedRows);
  }, [truth, scopedRows]);

  // STRICT V3 — the single source of truth for traffic quality on this page.
  // Computed from the same canonical session rows the business KPIs use, so
  // every category reconciles to the same raw total.
  const v3 = useMemo(() => summarizeTrafficQuality(scopedRows as ClassifierSession[]), [scopedRows]);

  const currency = truth?.totals?.currency ?? "USD";
  const useV2 = v2metrics?.envelope_resolved === "v2";
  const cards: { label: string; value: string; testid: string }[] = derived
    ? [
        { label: "Echte bezoekers", value: fmtInt(v3.quality.PROBABLE_HUMAN), testid: "kpi-v3-probable-human" },
        { label: "Mogelijke bezoekers", value: fmtInt(v3.quality.POSSIBLE_HUMAN), testid: "kpi-v3-possible-human" },
        { label: "Bots / automation", value: fmtInt(v3.quality.PROBABLE_BOT_OR_AUTOMATION), testid: "kpi-v3-bot" },
        { label: "Intern / test", value: fmtInt(v3.quality.INTERNAL_OR_TEST), testid: "kpi-v3-internal" },
        { label: "Onzeker", value: fmtInt(v3.quality.UNKNOWN), testid: "kpi-v3-unknown" },
        { label: "Ruw totaal", value: fmtInt(v3.total_sessions), testid: "kpi-v3-raw" },
        { label: "Sessions", value: fmtInt(derived.sessions), testid: "kpi-sessions" },
        { label: "Pageviews", value: fmtInt(derived.page_views), testid: "kpi-pageviews" },
        { label: "Add to cart", value: fmtInt(derived.add_to_cart), testid: "kpi-atc" },
        { label: "View cart", value: fmtInt(derived.view_cart), testid: "kpi-view-cart" },
        { label: "Checkout", value: fmtInt(derived.checkout_started), testid: "kpi-checkout" },

        { label: "Purchases", value: fmtInt(derived.purchases), testid: "kpi-purchases" },
        { label: "Revenue", value: fmtMoney(derived.revenue, currency), testid: "kpi-revenue" },
      ]
    : [];

  return (
    <section
      aria-label="Canonical KPI header"
      data-testid="vwm-pro-kpi-header"
      data-source="analytics-canonical"
      data-hours={proHoursForRange(state.timeRange)}
      data-geo={state.usOnly ? "US" : "all"}
      className="rounded-lg border bg-card p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Business KPIs · analytics-canonical
          <span
            data-testid="vwm-pro-envelope"
            className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600"
            title="Traffic-quality categories computed with the strict v3 classifier over the same canonical sessions as the business KPIs"
          >
            Traffic classifier: strict v3
          </span>
          {useV2 && (
            <span
              data-testid="vwm-pro-ingest-envelope"
              className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case text-muted-foreground"
              title="Server ingest envelope (legacy v2 buckets). Diagnostic only — not used for any KPI card on this page."
            >
              ingest envelope v2 (diagnostic)
            </span>
          )}

          {!isLive && truth && (
            <span
              data-testid="vwm-pro-cache-age"
              data-cache-status={truth.cache_status ?? "unknown"}
              className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium normal-case ${
                truth.cache_stale
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  : "bg-muted text-muted-foreground"
              }`}
              title={
                truth.cache_generated_at
                  ? `Precomputed at ${new Date(truth.cache_generated_at).toLocaleString()}`
                  : "Computed on request"
              }
            >
              Data {fmtAge(truth.cache_age_seconds)}
              {truth.cache_stale ? " · refreshing" : ""}
            </span>
          )}
        </div>
        {isLive && (
          <div className="text-[11px] font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
            Live mode · KPIs disabled
          </div>
        )}
      </div>

      {isLive ? (
        <div
          data-testid="vwm-pro-kpi-live-blocked"
          className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground"
        >
          Business KPIs are hidden while the map is in Live now. Live presence
          is realtime and NOT canonical. Switch to a time range to see truth.
        </div>
      ) : isError ? (
        <div
          data-testid="vwm-pro-kpi-error"
          className="flex flex-wrap items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-4 text-xs text-rose-600 dark:text-rose-400"
        >
          <span>
            Canonical analytics unavailable after {ANALYTICS_TRUTH_MAX_ATTEMPTS} attempts —
            this is an error, not zero traffic. {(error as Error)?.message}
          </span>
          <button
            type="button"
            data-testid="vwm-pro-kpi-retry"
            onClick={() => refetch()}
            className="rounded border border-rose-500/40 px-2 py-0.5 font-semibold"
          >
            Retry now
          </button>
        </div>
      ) : isLoading || !derived ? (
        <PanelLoadingState
          isLoading
          onRetry={() => refetch()}
          label="Canonical KPIs"
          testId="vwm-pro-kpi-loading"
          attempt={failureCount + 1}
          maxAttempts={ANALYTICS_TRUTH_MAX_ATTEMPTS}

          skeleton={
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {cards.map((c) => (
              <div
                key={c.label}
                data-testid={c.testid}
                className="rounded-md border bg-background/50 p-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {c.value}
                </div>
              </div>
            ))}
          </div>
          <div
            data-testid="vwm-pro-kpi-v3-note"
            className="mt-2 space-y-0.5 text-[10px] normal-case text-muted-foreground"
          >
            <div>
              Echte bezoekers = PROBABLE_HUMAN only. Expanded human estimate
              (probable + possible) = <strong>{fmtInt(v3.expanded_humans)}</strong> — an estimate,
              not verified human traffic.
            </div>
            <div>
              Echte + Mogelijke + Bots/automation + Intern/test + Onzeker ={" "}
              {fmtInt(
                v3.quality.PROBABLE_HUMAN +
                  v3.quality.POSSIBLE_HUMAN +
                  v3.quality.PROBABLE_BOT_OR_AUTOMATION +
                  v3.quality.INTERNAL_OR_TEST +
                  v3.quality.UNKNOWN,
              )}{" "}
              = Ruw totaal {fmtInt(v3.total_sessions)} (full period, no sampling).
              {truth?.totals?.raw_sessions_all != null &&
                truth.totals.raw_sessions_all !== v3.total_sessions && (
                  <>
                    {" "}Scope: {fmtInt(v3.total_sessions)} of{" "}
                    {fmtInt(truth.totals.raw_sessions_all)} canonical sessions after the active
                    geo/source/activity filters.
                  </>
                )}
            </div>
            <div>
              Known-crawler sessions are already inside Bots / automation under strict v3 and are
              never shown as a separate additive bucket here.
              {useV2 && v2metrics?.crawler_sessions != null && (
                <> Legacy ingest envelope flags {fmtInt(v2metrics.crawler_sessions)} crawler
                sessions — diagnostic only, not added to the totals above.</>
              )}
            </div>
          </div>
        </>
      )}

    </section>
  );
}
