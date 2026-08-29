/**
 * Traffic Quality block — compact KPI strip next to the Visitors World Map.
 *
 * Consumes the canonical analytics truth source (`useAnalyticsTruth`) and
 * runs every session through the permanent traffic-quality classifier.
 * Raw visitor count is deliberately NOT a primary KPI.
 *
 * Reporting only: the strict classifier thresholds are untouched here.
 */
import { useMemo } from "react";
import { useAnalyticsTruth } from "@/hooks/useAnalyticsTruth";
import { summarizeTrafficQuality, type SourceQualityRow } from "@/lib/trafficQualityClassifier";

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

const SOURCE_LABEL: Record<string, string> = {
  PINTEREST_PAID: "Pinterest paid",
  PINTEREST_ORGANIC: "Pinterest organic",
  GOOGLE_ORGANIC: "Google organic",
  OTHER_SEARCH: "Other search",
  DIRECT: "Direct",
  REFERRAL: "Referral",
  TIKTOK: "TikTok",
  META: "Meta",
  OTHER_PAID: "Other paid",
  UNKNOWN: "Unknown",
};

const MARKETING_ORDER = [
  "PINTEREST_PAID",
  "PINTEREST_ORGANIC",
  "GOOGLE_ORGANIC",
  "OTHER_SEARCH",
  "REFERRAL",
  "DIRECT",
] as const;

const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

export function TrafficQualityBlock({ hours = 24, geo = "all" }: Props) {
  const truth = useAnalyticsTruth({ hours, geo });
  const sessions = truth.data?.sessions ?? [];

  const summary = useMemo(() => summarizeTrafficQuality(sessions), [sessions]);
  const matrix = summary.source_matrix;
  const byKey = useMemo(() => {
    const m = new Map<string, SourceQualityRow>();
    for (const r of matrix) m.set(r.source_class, r);
    return m;
  }, [matrix]);
  const pinPaid = byKey.get("PINTEREST_PAID");
  const visibleRows = matrix.filter((r) => r.raw_sessions > 0);
  const expandedTotal = summary.expanded_humans || 0;
  const probableTotal = summary.conservative_humans || 0;

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
          Canonical completed sessions ({geo === "US" ? "US" : "all geos"}) · Traffic classifier:
          strict v3 · {summary.total_sessions} raw sessions (full period, no sampling)
        </span>
      </div>

      {truth.isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading canonical sessions…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Echte bezoekers (probable human)" value={summary.quality.PROBABLE_HUMAN} tone="good" />
            <Kpi label="Mogelijke bezoekers (possible human)" value={summary.quality.POSSIBLE_HUMAN} />
            <Kpi label="Bots / automation" value={summary.quality.PROBABLE_BOT_OR_AUTOMATION} tone="warn" />
            <Kpi label="Intern / test" value={summary.quality.INTERNAL_OR_TEST} />
            <Kpi label="Onzeker (unknown)" value={summary.quality.UNKNOWN} />
            <Kpi label="Ruw totaal" value={summary.total_sessions} />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            Categories reconcile to the raw total. Expanded human estimate (probable + possible) ={" "}
            {summary.expanded_humans} — estimate only, never "verified" traffic. Crawlers are
            already contained in Bots / automation.
          </div>


          {/* ---------------- PRODUCT INTEREST (3 LEVELS) ---------------- */}
          <div className="mt-3 rounded-md border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide">Product interest</h3>
              <span className="text-[10px] text-muted-foreground">
                A raw product_view alone is never counted as confirmed interest
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
              <Kpi
                label="Strict product interest"
                value={summary.product_interest.strict}
                tone="good"
              />
              <Kpi label="Conservative product interest" value={summary.product_interest.conservative} />
              <Kpi label="Broad product-view upper bound" value={summary.product_interest.broad_upper_bound} />
              <Kpi label="Raw product-view sessions" value={summary.product_interest.raw_product_view_sessions} />
            </div>
            <div className="border-t px-3 py-1 text-[10px] text-muted-foreground">
              Strict = confirmed interest from probable humans · Conservative = confirmed interest from
              probable + possible humans · Broad = <strong>upper bound only</strong>, every product-view
              session still classified probable or possible — not proven human interest. Weak product
              interest: {summary.product_interest.weak}.
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Human ATC" value={summary.commerce_human.add_to_cart} />
            <Kpi label="Human checkout" value={summary.commerce_human.checkout} />
            <Kpi label="Human purchases" value={summary.commerce_human.purchases} tone="good" />
            <Kpi label="Expanded ATC" value={summary.commerce_expanded.add_to_cart} />
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span>
              Human share: {summary.quality_pct.PROBABLE_HUMAN}% probable ·{" "}
              {summary.quality_pct.POSSIBLE_HUMAN}% possible ·{" "}
              {summary.quality_pct.PROBABLE_BOT_OR_AUTOMATION}% bot ·{" "}
              {summary.quality_pct.UNKNOWN}% unknown
            </span>
            <span title="Expanded includes uncertain sessions and should not be interpreted as verified human traffic.">
              Human range: {summary.conservative_humans} strict / {summary.expanded_humans} expanded —
              expanded includes uncertain sessions and should not be interpreted as verified human traffic.
            </span>
            {summary.bot_clusters.length > 0 && (
              <span>
                Largest synthetic fingerprint: {summary.bot_clusters[0].landing_page}/
                {summary.bot_clusters[0].device}/{summary.bot_clusters[0].duration_bucket}/
                {summary.bot_clusters[0].page_views}pv/{summary.bot_clusters[0].source_class} —{" "}
                {summary.bot_clusters[0].sessions} sessions ({summary.bot_clusters[0].share_of_raw}% of raw)
              </span>
            )}

          </div>


          {/* ---------------- SOURCE QUALITY ---------------- */}
          <div className="mt-4 rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide">Source quality</h3>
              <span className="text-[10px] text-muted-foreground">
                Traffic quality score = (100×probable + 50×possible) / raw — not conversion performance
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-1 text-left font-medium">Source</th>
                    <th className="px-2 py-1 text-right font-medium">Raw</th>
                    <th className="px-2 py-1 text-right font-medium">Probable</th>
                    <th className="px-2 py-1 text-right font-medium">Possible</th>
                    <th className="px-2 py-1 text-right font-medium">Bot</th>
                    <th className="px-2 py-1 text-right font-medium">Internal</th>
                    <th className="px-2 py-1 text-right font-medium">Unknown</th>
                    <th className="px-2 py-1 text-right font-medium">Human rate</th>
                    <th className="px-3 py-1 text-right font-medium">Quality score</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-3 text-center text-muted-foreground">
                        No sessions in this window
                      </td>
                    </tr>
                  )}
                  {visibleRows.map((r) => (
                    <tr key={r.source_class} className="border-b last:border-0">
                      <td className="px-3 py-1 text-left">{SOURCE_LABEL[r.source_class]}</td>
                      <td className="px-2 py-1 text-right">{r.raw_sessions}</td>
                      <td className="px-2 py-1 text-right font-semibold text-primary">{r.probable_human}</td>
                      <td className="px-2 py-1 text-right">{r.possible_human}</td>
                      <td className="px-2 py-1 text-right text-destructive">{r.bot}</td>
                      <td className="px-2 py-1 text-right">{r.internal}</td>
                      <td className="px-2 py-1 text-right">{r.unknown}</td>
                      <td className="px-2 py-1 text-right">
                        {r.conservative_human_rate}% / {r.expanded_human_rate}%
                      </td>
                      <td className="px-3 py-1 text-right font-semibold">{r.quality_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t px-3 py-1 text-[10px] text-muted-foreground">
              Human rate shown as conservative / expanded.
            </div>
          </div>

          {/* ---------------- MARKETING HUMAN TRAFFIC + PINTEREST PAID ---------------- */}
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border">
              <div className="border-b px-3 py-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide">Marketing human traffic</h3>
                <p className="text-[10px] text-muted-foreground">
                  Notation: probable / expanded (probable + possible)
                </p>
              </div>
              <ul className="divide-y">
                {MARKETING_ORDER.map((k) => {
                  const r = byKey.get(k);
                  const probable = r?.probable_human ?? 0;
                  const expanded = probable + (r?.possible_human ?? 0);
                  return (
                    <li key={k} className="flex items-center justify-between px-3 py-1 text-[11px]">
                      <span>{SOURCE_LABEL[k]} humans</span>
                      <span className="tabular-nums font-semibold">
                        {probable} / {expanded}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-md border">
              <div className="border-b px-3 py-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide">Pinterest paid</h3>
                <p className="text-[10px] text-muted-foreground">
                  Paid requires UTM / ad-click evidence — a generic pinterest.com referrer stays organic.
                </p>
              </div>
              {!pinPaid || pinPaid.raw_sessions === 0 ? (
                <div className="px-3 py-3 text-[11px] text-muted-foreground">
                  No Pinterest paid sessions detected
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
                  <Kpi label="Raw" value={pinPaid.raw_sessions} />
                  <Kpi label="Probable" value={pinPaid.probable_human} tone="good" />
                  <Kpi label="Possible" value={pinPaid.possible_human} />
                  <Kpi label="Product views" value={pinPaid.commerce_expanded.product_views} />
                  <Kpi label="ATC" value={pinPaid.commerce_expanded.add_to_cart} />
                  <Kpi label="Checkout" value={pinPaid.commerce_expanded.checkout} />
                  <Kpi label="Purchases" value={pinPaid.commerce_expanded.purchases} tone="good" />
                  <Kpi label="Revenue" value={money(pinPaid.commerce_expanded.revenue)} />
                </div>
              )}
            </div>
          </div>

          {/* ---------------- HUMAN COMMERCE BY SOURCE ---------------- */}
          <div className="mt-3 rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide">Human commerce by source</h3>
              <span className="text-[10px] text-muted-foreground">
                Expanded humans only (probable + possible) · hover a cell for probable-only
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-1 text-left font-medium">Source</th>
                    <th className="px-2 py-1 text-right font-medium">Product views</th>
                    <th className="px-2 py-1 text-right font-medium">Add to cart</th>
                    <th className="px-2 py-1 text-right font-medium">Checkout</th>
                    <th className="px-2 py-1 text-right font-medium">Purchase</th>
                    <th className="px-3 py-1 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {visibleRows.map((r) => (
                    <tr key={r.source_class} className="border-b last:border-0">
                      <td className="px-3 py-1 text-left">{SOURCE_LABEL[r.source_class]}</td>
                      <td className="px-2 py-1 text-right" title={`Probable only: ${r.commerce_probable.product_views}`}>
                        {r.commerce_expanded.product_views}
                      </td>
                      <td className="px-2 py-1 text-right" title={`Probable only: ${r.commerce_probable.add_to_cart}`}>
                        {r.commerce_expanded.add_to_cart}
                      </td>
                      <td className="px-2 py-1 text-right" title={`Probable only: ${r.commerce_probable.checkout}`}>
                        {r.commerce_expanded.checkout}
                      </td>
                      <td className="px-2 py-1 text-right" title={`Probable only: ${r.commerce_probable.purchases}`}>
                        {r.commerce_expanded.purchases}
                      </td>
                      <td className="px-3 py-1 text-right" title={`Probable only: ${money(r.commerce_probable.revenue)}`}>
                        {money(r.commerce_expanded.revenue)}
                      </td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-center text-muted-foreground">
                        No sessions in this window
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---------------- TOP HUMAN SESSIONS ---------------- */}
          <div className="mt-3 rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide">Top human sessions</h3>
              <span className="text-[10px] text-muted-foreground">
                Probable + possible humans · internal/test excluded · {probableTotal} probable of{" "}
                {expandedTotal} expanded
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-1 text-left font-medium">Class</th>
                    <th className="px-2 py-1 text-left font-medium">Source</th>
                    <th className="px-2 py-1 text-right font-medium">Conf.</th>
                    <th className="px-2 py-1 text-right font-medium">Dur</th>
                    <th className="px-2 py-1 text-right font-medium">PV</th>
                    <th className="px-2 py-1 text-left font-medium">Landing</th>
                    <th className="px-2 py-1 text-center font-medium">PDP</th>
                    <th className="px-2 py-1 text-center font-medium">ATC</th>
                    <th className="px-2 py-1 text-center font-medium">CO</th>
                    <th className="px-2 py-1 text-center font-medium">Buy</th>
                    <th className="px-3 py-1 text-right font-medium">Intent</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {summary.top_human_sessions.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-3 text-center text-muted-foreground">
                        No human sessions in this window
                      </td>
                    </tr>
                  )}
                  {summary.top_human_sessions.map((s) => (
                    <tr key={s.session_id} className="border-b last:border-0">
                      <td className="px-3 py-1 text-left">
                        {s.traffic_quality_class === "PROBABLE_HUMAN" ? "Probable" : "Possible"}
                      </td>
                      <td className="px-2 py-1 text-left">{SOURCE_LABEL[s.source_class]}</td>
                      <td className="px-2 py-1 text-right">{s.traffic_quality_confidence.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">
                        {s.facts.duration_seconds === null ? "—" : `${s.facts.duration_seconds}s`}
                      </td>
                      <td className="px-2 py-1 text-right">{s.facts.page_views}</td>
                      <td className="max-w-[180px] truncate px-2 py-1 text-left" title={s.facts.landing_page}>
                        {s.facts.landing_page || "—"}
                      </td>
                      <td className="px-2 py-1 text-center">{s.facts.product_view ? "✓" : "0"}</td>
                      <td className="px-2 py-1 text-center">{s.facts.add_to_cart ? "✓" : "0"}</td>
                      <td className="px-2 py-1 text-center">{s.facts.checkout ? "✓" : "0"}</td>
                      <td className="px-2 py-1 text-center">{s.facts.purchase ? "✓" : "0"}</td>
                      <td className="px-3 py-1 text-right">{s.commercial_intent_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default TrafficQualityBlock;
