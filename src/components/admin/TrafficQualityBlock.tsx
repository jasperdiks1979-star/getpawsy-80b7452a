/**
 * Traffic Quality block — compact KPI strip next to the Visitors World Map.
 *
 * Consumes the canonical analytics truth source (`useAnalyticsTruth`) and
 * runs every session through the permanent traffic-quality classifier.
 * Raw visitor count is deliberately NOT a primary KPI.
 */
import { useMemo } from "react";
import { useAnalyticsTruth } from "@/hooks/useAnalyticsTruth";
import { summarizeTrafficQuality } from "@/lib/trafficQualityClassifier";

interface Props {
  /** Commercial performance defaults to 10h or 24h — never "live". */
  hours?: 1 | 5 | 10 | 24;
  geo?: "US" | "all";
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "good" | "warn" }) {
  const toneClass =
    tone === "good" ? "text-primary" : tone === "warn" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

export function TrafficQualityBlock({ hours = 24, geo = "all" }: Props) {
  const truth = useAnalyticsTruth({ hours, geo });
  const sessions = truth.data?.sessions ?? [];

  const summary = useMemo(() => summarizeTrafficQuality(sessions), [sessions]);

  return (
    <section
      aria-label="Traffic quality"
      data-testid="traffic-quality-block"
      className="rounded-lg border bg-card p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide">
          Traffic quality · last {hours}h
        </h2>
        <span className="text-[10px] text-muted-foreground">
          Realtime presence — not a canonical performance KPI · classifier v1 ·{" "}
          {summary.total_sessions} raw sessions
        </span>
      </div>

      {truth.isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading canonical sessions…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Probable human" value={summary.quality.PROBABLE_HUMAN} tone="good" />
            <Kpi label="Possible human" value={summary.quality.POSSIBLE_HUMAN} />
            <Kpi label="Bot / automation" value={summary.quality.PROBABLE_BOT_OR_AUTOMATION} tone="warn" />
            <Kpi label="Internal / test" value={summary.quality.INTERNAL_OR_TEST} />
            <Kpi label="Unknown" value={summary.quality.UNKNOWN} />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Human product views" value={summary.commerce_human.product_views} />
            <Kpi label="Human ATC" value={summary.commerce_human.add_to_cart} />
            <Kpi label="Human checkout" value={summary.commerce_human.checkout} />
            <Kpi label="Human purchases" value={summary.commerce_human.purchases} tone="good" />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Expanded product views" value={summary.commerce_expanded.product_views} />
            <Kpi label="Expanded ATC" value={summary.commerce_expanded.add_to_cart} />
            <Kpi label="Expanded checkout" value={summary.commerce_expanded.checkout} />
            <Kpi label="Expanded purchases" value={summary.commerce_expanded.purchases} />
          </div>


          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span>
              Human share: {summary.quality_pct.PROBABLE_HUMAN}% probable ·{" "}
              {summary.quality_pct.POSSIBLE_HUMAN}% possible ·{" "}
              {summary.quality_pct.PROBABLE_BOT_OR_AUTOMATION}% bot ·{" "}
              {summary.quality_pct.UNKNOWN}% unknown
            </span>
            <span>Expanded human estimate: {summary.expanded_humans}</span>
            {summary.bot_clusters.length > 0 && (
              <span>
                Largest synthetic fingerprint: {summary.bot_clusters[0].landing_page}/
                {summary.bot_clusters[0].device}/{summary.bot_clusters[0].duration_bucket}/
                {summary.bot_clusters[0].page_views}pv/{summary.bot_clusters[0].source_class} —{" "}
                {summary.bot_clusters[0].sessions} sessions ({summary.bot_clusters[0].share_of_raw}% of raw)
              </span>
            )}

          </div>
        </>
      )}
    </section>
  );
}

export default TrafficQualityBlock;
