import { useMemo } from "react";
import { useAnalyticsTruth } from "@/hooks/useAnalyticsTruth";
import { getCanonicalAnalyticsMetrics, V2_LABELS_NL } from "@/lib/analyticsV2Adapter";

/**
 * Shared v2 envelope indicator + compact bucket strip for internal admin
 * surfaces. Additive — surfaces keep their existing v1 UI intact and add
 * this at the top so admins can see which envelope resolved and the true
 * bucket split (Echte bezoekers / Bezoekers / Onzeker / Crawlers / Bots /
 * Technisch / Intern / Niet geclassificeerd / Ruw totaal).
 *
 * Data source: analytics-canonical (single React-Query dedupe key per
 * (hours, geo) pair). Never re-derives commercial in the client.
 */
export interface V2EnvelopeBadgeProps {
  hours: number;
  geo?: "all" | "US";
  compact?: boolean;
  label?: string;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function V2EnvelopeBadge({ hours, geo = "all", compact = false, label }: V2EnvelopeBadgeProps) {
  const { data } = useAnalyticsTruth({ hours, geo });
  const m = useMemo(() => getCanonicalAnalyticsMetrics(data as any), [data]);
  const useV2 = m?.envelope_resolved === "v2";

  const cards: Array<{ label: string; value: string; key: string }> = useV2 && m
    ? [
        { key: "human", label: V2_LABELS_NL.human, value: fmt(m.human_sessions) },
        { key: "commercial", label: V2_LABELS_NL.commercial, value: fmt(m.commercial_sessions) },
        { key: "uncertain", label: V2_LABELS_NL.uncertain, value: fmt(m.genuine_uncertain_sessions) },
        { key: "crawler", label: V2_LABELS_NL.crawler, value: fmt(m.crawler_sessions) },
        { key: "bot", label: V2_LABELS_NL.bot, value: fmt(m.bot_sessions) },
        { key: "technical", label: V2_LABELS_NL.technical, value: fmt(m.technical_sessions) },
        { key: "internal", label: V2_LABELS_NL.internal, value: fmt(m.internal_sessions) },
        { key: "legacy", label: V2_LABELS_NL.legacy, value: fmt(m.legacy_unclassified_sessions) },
        { key: "raw", label: V2_LABELS_NL.raw, value: fmt(m.raw_sessions) },
      ]
    : [];

  return (
    <section
      data-testid="v2-envelope-badge"
      data-envelope={useV2 ? "v2" : "v1"}
      data-hours={hours}
      data-geo={geo}
      className="rounded-md border bg-card p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label ?? "Traffic quality"} · analytics-canonical
          <span
            data-testid="v2-envelope-indicator"
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
        {useV2 && m && (
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {m.classification_version} · coverage {m.classification_coverage_pct?.toFixed(1)}%
          </div>
        )}
      </div>
      {useV2 && cards.length ? (
        <div className={`grid gap-2 ${compact ? "grid-cols-3 sm:grid-cols-5 lg:grid-cols-9" : "grid-cols-3 sm:grid-cols-5 md:grid-cols-9"}`}>
          {cards.map((c) => (
            <div key={c.key} data-testid={`v2b-${c.key}`} className="rounded border bg-background/50 p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">{c.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">
          Legacy v1 envelope — bucket split unavailable. Enable Phase 4C or authenticate as admin to see v2.
        </div>
      )}
    </section>
  );
}

export default V2EnvelopeBadge;