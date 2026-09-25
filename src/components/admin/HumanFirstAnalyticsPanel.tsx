import { CacheFreshnessBadge } from "@/components/admin/CacheFreshnessBadge";
/**
 * Human-first commercial KPIs.
 *
 * Default mode = Human (strict PROBABLE_HUMAN). Expanded human adds the
 * ambiguous POSSIBLE_HUMAN bucket, Raw is a clearly labelled diagnostic view.
 * Every metric, funnel step and dimension below comes from ONE eligibility
 * rule (`src/lib/humanFirstAnalytics.ts`) so denominators never mix.
 *
 * No extra database work: reads the same cached `analytics-canonical`
 * envelope the rest of the dashboard already fetched.
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown } from "lucide-react";
import {
  useHumanFirstAnalytics,
  useTrafficMode,
} from "@/hooks/useHumanFirstAnalytics";
import {
  TRAFFIC_MODES,
  type DimensionRow,
  type TrafficMode,
} from "@/lib/humanFirstAnalytics";

interface Props {
  hours?: number;
  geo?: "US" | "all";
  enabled?: boolean;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
const num = (n: number) => n.toLocaleString();
const pct1 = (n: number) => `${n.toFixed(1)}%`;

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function DimTable({ title, rows, keyLabel }: { title: string; rows: DimensionRow[]; keyLabel: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No eligible sessions in this window.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">{keyLabel}</th>
                <th className="px-2 py-1.5 text-right font-medium">Sessions</th>
                <th className="px-2 py-1.5 text-right font-medium">Views</th>
                <th className="px-2 py-1.5 text-right font-medium">ATC</th>
                <th className="px-2 py-1.5 text-right font-medium">Checkout</th>
                <th className="px-2 py-1.5 text-right font-medium">Orders</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="max-w-[240px] truncate px-2 py-1.5">{r.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.sessions)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.product_views)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.add_to_cart)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.checkout_started)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.purchases)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function HumanFirstAnalyticsPanel({ hours = 24, geo = "all", enabled = true }: Props) {
  const [mode, setMode] = useTrafficMode();
  const [showDrilldown, setShowDrilldown] = useState(false);
  const { view, isLoading, error, envelopeTotals, truth } = useHumanFirstAnalytics({ hours, geo, mode, enabled });
  const m = view.metrics;
  const q = view.quality;
  const modeMeta = TRAFFIC_MODES.find((t) => t.value === mode)!;

  return (
    <Card data-testid="human-first-analytics" className="min-w-0">
      <CardHeader className="gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Commercial KPIs · last {hours}h</CardTitle>
            <CardDescription>
              {modeMeta.help} Raw sessions are never deleted or altered.
            </CardDescription>
            <CacheFreshnessBadge
              className="mt-2"
              hours={hours}
              generatedAt={truth.data?.cache_generated_at ?? truth.data?.generated_at}
              clientFallback={truth.data?.served_from_client_cache}
            />
          </div>
          <div
            role="group"
            aria-label="Traffic quality mode"
            data-testid="traffic-mode-toggle"
            className="flex flex-wrap gap-1 rounded-lg border p-1"
          >
            {TRAFFIC_MODES.map((t) => (
              <Button
                key={t.value}
                size="sm"
                variant={t.value === mode ? "default" : "ghost"}
                className="h-9 px-3 text-xs"
                aria-pressed={t.value === mode}
                onClick={() => setMode(t.value as TrafficMode)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Traffic quality summary — informational, never an error banner. */}
        <div
          data-testid="traffic-quality-summary"
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-xs"
        >
          <Badge variant="secondary">Human {num(q.probable_human)}</Badge>
          <Badge variant="secondary">Possible / unknown {num(q.possible_or_unknown)}</Badge>
          <Badge variant="secondary">Bot / automation {num(q.bot)}</Badge>
          <Badge variant="secondary">Internal {num(q.internal)}</Badge>
          <span className="text-muted-foreground">
            Bot share {pct1(q.bot_share_pct)} of {num(q.total)} ingested sessions — expected for an
            open storefront, not an incident.
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
        {isLoading && !view.quality.total && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading canonical window…
          </div>
        )}
        {error && (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            Canonical analytics is unavailable right now ({error.message}). No numbers are estimated.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Sessions" value={num(m.sessions)} sub={`${modeMeta.label} mode`} />
          <Kpi label="Visitors" value={num(m.visitors)} />
          <Kpi label="Pageviews" value={num(m.page_views)} />
          <Kpi label="Product views" value={num(m.product_views)} />
          <Kpi label="Add to cart" value={num(m.add_to_cart)} />
          <Kpi label="Cart views" value={num(m.view_cart)} />
          <Kpi label="Checkout starts" value={num(m.checkout_started)} />
          <Kpi label="Purchases" value={num(m.purchases)} />
          <Kpi label="Revenue" value={money(m.revenue)} />
          <Kpi
            label="Conversion rate"
            value={m.sessions ? `${(m.conversion_rate * 100).toFixed(2)}%` : "—"}
            sub="purchases / sessions"
          />
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Funnel ({modeMeta.label})
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {view.funnel.map((f) => (
              <div key={f.stage} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{f.stage}</div>
                <div className="text-lg font-semibold tabular-nums">{num(f.count)}</div>
                <div className="text-xs text-muted-foreground">{pct1(f.pct_of_sessions)} of sessions</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <DimTable title={`Channels (${modeMeta.label})`} rows={view.channels} keyLabel="Channel" />
          <DimTable title="Countries" rows={view.countries} keyLabel="Country" />
          <DimTable title="Devices" rows={view.devices} keyLabel="Device" />
          <DimTable title="Landing pages" rows={view.landingPages} keyLabel="Page" />
          <DimTable title="Guide / content traffic" rows={view.guideTraffic} keyLabel="Page" />
        </div>

        {envelopeTotals && (
          <p className="text-xs text-muted-foreground">
            Diagnostic reference — canonical envelope for the same window:{" "}
            {num(envelopeTotals.sessions)} sessions, {num(envelopeTotals.page_views)} pageviews,{" "}
            {num(envelopeTotals.purchases)} purchases.
          </p>
        )}

        <div>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left"
            aria-expanded={showDrilldown}
            onClick={() => setShowDrilldown((v) => !v)}
          >
            <span className="text-sm font-medium">
              Session drill-down &amp; classification reasons ({num(view.drilldown.length)})
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showDrilldown ? "rotate-180" : ""}`} />
          </button>
          {showDrilldown && (
            <div className="mt-2 max-h-[420px] overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1.5 text-left font-medium">Session</th>
                    <th className="px-2 py-1.5 text-left font-medium">Class</th>
                    <th className="px-2 py-1.5 text-right font-medium">Conf.</th>
                    <th className="px-2 py-1.5 text-left font-medium">Channel</th>
                    <th className="px-2 py-1.5 text-left font-medium">Landing</th>
                    <th className="px-2 py-1.5 text-left font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {view.drilldown.slice(0, 300).map((d) => (
                    <tr key={d.session_id} className={`border-b last:border-0 ${d.eligible ? "" : "opacity-70"}`}>
                      <td className="px-2 py-1.5 font-mono">{d.session_id.slice(0, 10)}…</td>
                      <td className="px-2 py-1.5">{d.traffic_quality_class}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{d.confidence.toFixed(2)}</td>
                      <td className="px-2 py-1.5">{d.source_class}</td>
                      <td className="max-w-[200px] truncate px-2 py-1.5">{d.landing_page}</td>
                      <td className="max-w-[320px] px-2 py-1.5 text-muted-foreground [overflow-wrap:anywhere]">
                        {[...d.reasons, d.stored_reason ? `stored:${d.stored_reason}` : ""]
                          .filter(Boolean)
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default HumanFirstAnalyticsPanel;
