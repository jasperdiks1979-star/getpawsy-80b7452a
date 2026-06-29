import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CANONICAL_STAGES,
  CANONICAL_STAGE_LABEL,
  type CanonicalExecKpis,
  type CanonicalFunnelRow,
  type CanonicalProductRow,
  type CanonicalRevenueRow,
  type CanonicalSourceRow,
  type ConsistencyAlertRow,
  getCanonicalFunnel,
  getCanonicalProducts,
  getCanonicalRevenue,
  getCanonicalSources,
  getConsistencyAlerts,
  getExecutiveKpis,
  runCanonicalRefresh,
} from "@/lib/canonicalAnalytics";

const fmtEur = (v: number) => `€${v.toFixed(2)}`;
const fmtPct = (v: number) => `${v.toFixed(2)}%`;

function severityVariant(s: string): "default" | "destructive" | "secondary" | "outline" {
  if (s === "high") return "destructive";
  if (s === "medium") return "default";
  if (s === "warning") return "secondary";
  return "outline";
}

export default function CanonicalAnalyticsPage() {
  const [exec, setExec] = useState<CanonicalExecKpis | null>(null);
  const [funnel, setFunnel] = useState<CanonicalFunnelRow[]>([]);
  const [sources, setSources] = useState<CanonicalSourceRow[]>([]);
  const [products, setProducts] = useState<CanonicalProductRow[]>([]);
  const [revenue, setRevenue] = useState<CanonicalRevenueRow[]>([]);
  const [alerts, setAlerts] = useState<ConsistencyAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [e, f, s, p, r, a] = await Promise.all([
        getExecutiveKpis(24 * 30),
        getCanonicalFunnel(24 * 30),
        getCanonicalSources(30),
        getCanonicalProducts(30),
        getCanonicalRevenue(10),
        getConsistencyAlerts(),
      ]);
      setExec(e); setFunnel(f); setSources(s); setProducts(p); setRevenue(r); setAlerts(a);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try { await runCanonicalRefresh(); await load(); } finally { setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const topFunnel = funnel[0]?.count || funnel[1]?.count || 1;
  const sourceAgg = aggregateSources(sources);
  const productAgg = aggregateProducts(products).slice(0, 10);
  const activeAlerts = alerts.filter((a) => a.is_active);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Canonical Analytics — Executive Overview</h1>
          <p className="text-sm text-muted-foreground">
            Single source of truth. Every dashboard reads from these views via the canonical SDK.
          </p>
        </div>
        <Button onClick={refresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Ingest + Refresh + Validate"}
        </Button>
      </div>

      {/* Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Sessions"       value={exec?.sessions.toLocaleString() ?? "—"} />
        <Kpi label="Product views"  value={exec?.product_views.toLocaleString() ?? "—"} />
        <Kpi label="Add to cart"    value={exec?.add_to_carts.toLocaleString() ?? "—"} />
        <Kpi label="Checkout"       value={exec?.checkouts.toLocaleString() ?? "—"} />
        <Kpi label="Purchases"      value={exec?.purchases.toLocaleString() ?? "—"} />
        <Kpi label="Revenue (paid)" value={exec ? fmtEur(exec.revenue_eur) : "—"} />
        <Kpi label="AOV"            value={exec ? fmtEur(exec.aov_eur) : "—"} />
        <Kpi label="CVR (sess→buy)" value={exec ? fmtPct(exec.cvr_pct) : "—"} />
      </div>

      {/* Live consistency validator */}
      <Card>
        <CardHeader>
          <CardTitle>Live consistency validator</CardTitle>
        </CardHeader>
        <CardContent>
          {activeAlerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="default">All metrics in sync</Badge>
              <span className="text-muted-foreground">
                Canonical totals match legacy sources within 0.5% across the last 24h.
              </span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th>Severity</th><th>Metric</th><th className="text-right">Expected</th>
                <th className="text-right">Actual</th><th className="text-right">Δ %</th><th>Last seen</th>
              </tr></thead>
              <tbody>
                {activeAlerts.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td><Badge variant={severityVariant(a.severity)}>{a.severity}</Badge></td>
                    <td className="font-mono">{a.metric}</td>
                    <td className="text-right">{Number(a.expected ?? 0).toLocaleString()}</td>
                    <td className="text-right">{Number(a.actual ?? 0).toLocaleString()}</td>
                    <td className="text-right">{Number(a.diff_pct ?? 0).toFixed(2)}</td>
                    <td>{new Date(a.last_detected_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Funnel */}
      <Card>
        <CardHeader><CardTitle>Funnel (canonical, last 30 days)</CardTitle></CardHeader>
        <CardContent>
          {loading ? "Loading…" : (
            <div className="space-y-2">
              {CANONICAL_STAGES.map((s) => {
                const row = funnel.find((r) => r.stage === s);
                const v = row?.count ?? 0;
                const pct = Math.min(100, Math.round((v / topFunnel) * 100));
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className="w-44 text-sm">{CANONICAL_STAGE_LABEL[s]}</div>
                    <div className="flex-1 h-3 bg-muted rounded">
                      <div className="h-3 bg-primary rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <Badge variant="outline">{v.toLocaleString()}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Top traffic sources (30d)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th>Source / medium</th>
                <th className="text-right">Sessions</th>
                <th className="text-right">Purchases</th>
                <th className="text-right">CVR</th>
              </tr></thead>
              <tbody>
                {sourceAgg.slice(0, 10).map((r) => (
                  <tr key={`${r.source}|${r.medium}`} className="border-t">
                    <td className="font-mono text-xs">{r.source} / {r.medium}</td>
                    <td className="text-right">{r.sessions.toLocaleString()}</td>
                    <td className="text-right">{r.purchases.toLocaleString()}</td>
                    <td className="text-right">{r.sessions ? fmtPct((r.purchases / r.sessions) * 100) : "—"}</td>
                  </tr>
                ))}
                {sourceAgg.length === 0 && (
                  <tr><td colSpan={4} className="py-3 text-muted-foreground">No traffic in window.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top products (30d)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th>Product</th>
                <th className="text-right">Views</th>
                <th className="text-right">ATC</th>
                <th className="text-right">Buys</th>
                <th className="text-right">Revenue</th>
              </tr></thead>
              <tbody>
                {productAgg.map((r) => (
                  <tr key={r.product_id} className="border-t">
                    <td className="font-mono text-xs">{r.product_id.slice(0, 12)}…</td>
                    <td className="text-right">{r.product_views.toLocaleString()}</td>
                    <td className="text-right">{r.add_to_carts.toLocaleString()}</td>
                    <td className="text-right">{r.purchases.toLocaleString()}</td>
                    <td className="text-right">{fmtEur(r.revenue_cents / 100)}</td>
                  </tr>
                ))}
                {productAgg.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-muted-foreground">No product activity.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent verified Stripe revenue</CardTitle></CardHeader>
        <CardContent>
          {revenue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid orders yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th>Paid at</th><th>Order</th><th>Source</th><th>Country</th><th className="text-right">Amount</th>
              </tr></thead>
              <tbody>
                {revenue.map((r) => (
                  <tr key={r.order_id} className="border-t">
                    <td>{new Date(r.paid_at).toLocaleString()}</td>
                    <td className="font-mono text-xs">{r.order_id.slice(0, 8)}…</td>
                    <td>{r.utm_source ?? "(direct)"}</td>
                    <td>{r.country ?? "—"}</td>
                    <td className="text-right font-mono">{fmtEur(Number(r.total_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-mono">{value}</CardContent>
    </Card>
  );
}

type SourceAgg = { source: string; medium: string; sessions: number; purchases: number };
function aggregateSources(rows: CanonicalSourceRow[]): SourceAgg[] {
  const m = new Map<string, SourceAgg>();
  rows.forEach((r) => {
    const k = `${r.source}|${r.medium}`;
    const cur = m.get(k) ?? { source: r.source, medium: r.medium, sessions: 0, purchases: 0 };
    cur.sessions += Number(r.sessions);
    cur.purchases += Number(r.purchases);
    m.set(k, cur);
  });
  return Array.from(m.values()).sort((a, b) => b.sessions - a.sessions);
}

type ProductAgg = CanonicalProductRow;
function aggregateProducts(rows: CanonicalProductRow[]): ProductAgg[] {
  const m = new Map<string, ProductAgg>();
  rows.forEach((r) => {
    const cur = m.get(r.product_id) ?? { ...r, day: "" };
    if (m.has(r.product_id)) {
      cur.product_views += Number(r.product_views);
      cur.add_to_carts  += Number(r.add_to_carts);
      cur.checkouts     += Number(r.checkouts);
      cur.purchases     += Number(r.purchases);
      cur.revenue_cents += Number(r.revenue_cents);
    }
    m.set(r.product_id, cur);
  });
  return Array.from(m.values()).sort((a, b) => b.revenue_cents - a.revenue_cents || b.product_views - a.product_views);
}
