import { useMemo } from "react";
import {
  useAnalyticsTruth,
  countersFromSessions,
  type TruthSession,
} from "@/hooks/useAnalyticsTruth";
import type { ProToolbarState } from "./ProToolbar";
import { proHoursForRange } from "./ProToolbar";
import { getCanonicalAnalyticsMetrics, V2_LABELS_NL } from "@/lib/analyticsV2Adapter";

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
  const { data: truth, isLoading } = useAnalyticsTruth({
    hours: proHoursForRange(state.timeRange),
    geo: state.usOnly ? "US" : "all",
  });
  const v2metrics = useMemo(() => getCanonicalAnalyticsMetrics(truth as any), [truth]);

  const derived = useMemo(() => {
    if (!truth?.sessions) return null;
    const rows = filteredSessions(truth.sessions, state);
    return countersFromSessions(rows);
  }, [truth, state]);

  const currency = truth?.totals?.currency ?? "USD";
  const useV2 = v2metrics?.envelope_resolved === "v2";
  const cards: { label: string; value: string; testid: string }[] = useV2 && v2metrics
    ? [
        { label: V2_LABELS_NL.human, value: fmtInt(v2metrics.human_sessions ?? 0), testid: "kpi-human" },
        { label: V2_LABELS_NL.commercial, value: fmtInt(v2metrics.commercial_sessions ?? 0), testid: "kpi-commercial" },
        { label: V2_LABELS_NL.uncertain, value: fmtInt(v2metrics.genuine_uncertain_sessions ?? 0), testid: "kpi-uncertain" },
        { label: V2_LABELS_NL.crawler, value: fmtInt(v2metrics.crawler_sessions ?? 0), testid: "kpi-crawler" },
        { label: V2_LABELS_NL.bot, value: fmtInt(v2metrics.bot_sessions ?? 0), testid: "kpi-bot" },
        { label: V2_LABELS_NL.technical, value: fmtInt(v2metrics.technical_sessions ?? 0), testid: "kpi-technical" },
        { label: V2_LABELS_NL.internal, value: fmtInt(v2metrics.internal_sessions ?? 0), testid: "kpi-internal" },
        { label: V2_LABELS_NL.legacy, value: fmtInt(v2metrics.legacy_unclassified_sessions ?? 0), testid: "kpi-legacy" },
        { label: V2_LABELS_NL.raw, value: fmtInt(v2metrics.raw_sessions ?? 0), testid: "kpi-raw" },
        { label: "Purchases", value: fmtInt(v2metrics.purchases), testid: "kpi-purchases" },
        { label: "Revenue", value: fmtMoney(v2metrics.revenue, currency), testid: "kpi-revenue" },
      ]
    : derived
    ? [
        { label: "Visitors", value: fmtInt(derived.visitors), testid: "kpi-visitors" },
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
            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              useV2
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            }`}
            title={useV2 ? "traffic-quality v2 (Phase 4C)" : "legacy v1 envelope"}
          >
            {useV2 ? "v2" : "v1 (legacy)"}
          </span>
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
      ) : isLoading || !derived ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : (
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
      )}
    </section>
  );
}
