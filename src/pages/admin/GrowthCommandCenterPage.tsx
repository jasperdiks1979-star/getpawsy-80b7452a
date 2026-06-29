// Genesis V3 — Growth Command Center
// Executive dashboard. Reads exclusively from the canonical SDK (no duplicate SQL).
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  classifyCanonicalSource,
  getCanonicalFunnelSessions,
  getCanonicalOrders,
  getCanonicalProducts,
  getCanonicalSources,
  getConsistencyAlerts,
  getExecutiveKpis,
  runCanonicalRefresh,
  summarizeCanonicalSessions,
  type CanonicalExecKpis,
  type CanonicalOrderRow,
  type CanonicalProductRow,
  type CanonicalSessionRow,
  type CanonicalSourceRow,
  type ConsistencyAlertRow,
} from "@/lib/canonicalAnalytics";

const fmtEur = (v: number) => `€${v.toFixed(2)}`;
const fmtPct = (v: number) => `${v.toFixed(2)}%`;
const safePct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

type ChannelKey = ReturnType<typeof classifyCanonicalSource>;

interface ChannelAgg {
  channel: ChannelKey;
  sessions: number;
  purchases: number;
  revenue_eur: number;
  cvr_pct: number;
}

interface ProductAgg {
  product_id: string;
  product_views: number;
  add_to_carts: number;
  purchases: number;
  revenue_eur: number;
  atc_rate: number;
  cvr: number;
}

function aggregateChannels(
  sources: CanonicalSourceRow[],
  orders: CanonicalOrderRow[],
): ChannelAgg[] {
  const map = new Map<ChannelKey, ChannelAgg>();
  const get = (k: ChannelKey): ChannelAgg => {
    let v = map.get(k);
    if (!v) { v = { channel: k, sessions: 0, purchases: 0, revenue_eur: 0, cvr_pct: 0 }; map.set(k, v); }
    return v;
  };
  for (const s of sources) {
    const k = classifyCanonicalSource(s.source);
    const v = get(k);
    v.sessions += Number(s.sessions ?? 0);
    v.purchases += Number(s.purchases ?? 0);
  }
  for (const o of orders) {
    const k = classifyCanonicalSource(o.utm_source);
    get(k).revenue_eur += Number(o.total_amount ?? 0) / 100;
  }
  return Array.from(map.values())
    .map((c) => ({ ...c, cvr_pct: safePct(c.purchases, c.sessions) }))
    .sort((a, b) => b.revenue_eur - a.revenue_eur);
}

function aggregateProducts(products: CanonicalProductRow[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const p of products) {
    let v = map.get(p.product_id);
    if (!v) {
      v = { product_id: p.product_id, product_views: 0, add_to_carts: 0, purchases: 0, revenue_eur: 0, atc_rate: 0, cvr: 0 };
      map.set(p.product_id, v);
    }
    v.product_views += Number(p.product_views ?? 0);
    v.add_to_carts += Number(p.add_to_carts ?? 0);
    v.purchases += Number(p.purchases ?? 0);
    v.revenue_eur += Number(p.revenue_cents ?? 0) / 100;
  }
  return Array.from(map.values()).map((p) => ({
    ...p,
    atc_rate: safePct(p.add_to_carts, p.product_views),
    cvr: safePct(p.purchases, p.product_views),
  }));
}

interface Bottleneck { label: string; metric: string; severity: "high" | "medium" | "low" }

function detectBottlenecks(exec: CanonicalExecKpis, live: ReturnType<typeof summarizeCanonicalSessions>): Bottleneck[] {
  const out: Bottleneck[] = [];
  const pdpRate = safePct(exec.product_views, exec.sessions);
  const atcRate = safePct(exec.add_to_carts, exec.product_views);
  const ckRate = safePct(exec.checkouts, exec.add_to_carts);
  const purRate = safePct(exec.purchases, exec.checkouts);
  if (exec.sessions > 100 && pdpRate < 25) out.push({ label: "Low PDP entry", metric: `${pdpRate.toFixed(1)}% sessions reach PDP`, severity: "high" });
  if (exec.product_views > 100 && atcRate < 3) out.push({ label: "Weak Add to Cart", metric: `${atcRate.toFixed(2)}% ATC on PDP`, severity: "high" });
  if (exec.add_to_carts > 20 && ckRate < 35) out.push({ label: "Cart abandonment", metric: `${ckRate.toFixed(1)}% ATC → checkout`, severity: "medium" });
  if (exec.checkouts > 10 && purRate < 50) out.push({ label: "Checkout drop", metric: `${purRate.toFixed(1)}% checkout → purchase`, severity: "high" });
  if (live.sessions > 0 && live.purchases === 0) out.push({ label: "No live purchases", metric: `${live.sessions} sessions / 0 paid in last 24h`, severity: "medium" });
  return out;
}

interface Recommendation { title: string; rationale: string; impact: "high" | "medium" | "low" }

function generateRecommendations(
  exec: CanonicalExecKpis,
  channels: ChannelAgg[],
  products: ProductAgg[],
  bottlenecks: Bottleneck[],
): Recommendation[] {
  const out: Recommendation[] = [];
  const winner = products.filter((p) => p.purchases > 0).sort((a, b) => b.revenue_eur - a.revenue_eur)[0];
  if (winner) out.push({
    title: `Scale "${winner.product_id.slice(0, 8)}…"`,
    rationale: `${fmtEur(winner.revenue_eur)} revenue at ${fmtPct(winner.cvr)} CVR — expand creatives and ad budget`,
    impact: "high",
  });
  const weak = products.filter((p) => p.product_views > 200 && p.atc_rate < 1.5).slice(0, 1)[0];
  if (weak) out.push({
    title: `Rework PDP for "${weak.product_id.slice(0, 8)}…"`,
    rationale: `${weak.product_views} views but only ${fmtPct(weak.atc_rate)} ATC — rewrite hero, CTA and trust block`,
    impact: "high",
  });
  const topChannel = channels[0];
  if (topChannel && topChannel.revenue_eur > 0) out.push({
    title: `Double down on ${topChannel.channel}`,
    rationale: `${fmtEur(topChannel.revenue_eur)} revenue at ${fmtPct(topChannel.cvr_pct)} CVR — reallocate budget here`,
    impact: "medium",
  });
  const waste = channels.find((c) => c.sessions > 200 && c.revenue_eur === 0);
  if (waste) out.push({
    title: `Investigate ${waste.channel} traffic`,
    rationale: `${waste.sessions} sessions, €0 revenue — likely bot, mistargeted or broken landing`,
    impact: "medium",
  });
  if (bottlenecks.some((b) => b.label === "Checkout drop")) out.push({
    title: "Reduce checkout friction",
    rationale: "Checkout → purchase below 50% — verify payment methods, trust badges, shipping copy",
    impact: "high",
  });
  if (exec.aov_eur > 0 && exec.aov_eur < 30) out.push({
    title: "Lift AOV with bundles",
    rationale: `AOV is ${fmtEur(exec.aov_eur)} — promote bundle and upsell on PDP`,
    impact: "medium",
  });
  return out;
}

function severityBadge(s: string): "default" | "destructive" | "secondary" | "outline" {
  if (s === "high") return "destructive";
  if (s === "medium") return "default";
  if (s === "low" || s === "warning") return "secondary";
  return "outline";
}

export default function GrowthCommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exec, setExec] = useState<CanonicalExecKpis | null>(null);
  const [live, setLive] = useState<CanonicalSessionRow[]>([]);
  const [sources, setSources] = useState<CanonicalSourceRow[]>([]);
  const [products, setProducts] = useState<CanonicalProductRow[]>([]);
  const [orders30, setOrders30] = useState<CanonicalOrderRow[]>([]);
  const [alerts, setAlerts] = useState<ConsistencyAlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [e, liveRows, srcRows, prodRows, ordRows, alertRows] = await Promise.all([
        getExecutiveKpis(24 * 30),
        getCanonicalFunnelSessions({ hours: 24 }),
        getCanonicalSources(30),
        getCanonicalProducts(30),
        getCanonicalOrders({ hours: 24 * 30 }),
        getConsistencyAlerts(),
      ]);
      setExec(e); setLive(liveRows); setSources(srcRows);
      setProducts(prodRows); setOrders30(ordRows); setAlerts(alertRows);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load growth data");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try { await runCanonicalRefresh(); await load(); } finally { setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const liveSummary = useMemo(() => summarizeCanonicalSessions(live), [live]);
  const channelAgg = useMemo(() => aggregateChannels(sources, orders30), [sources, orders30]);
  const productAgg = useMemo(() => aggregateProducts(products), [products]);
  const topProducts = useMemo(() => [...productAgg].sort((a, b) => b.revenue_eur - a.revenue_eur).slice(0, 10), [productAgg]);
  const worstProducts = useMemo(
    () => productAgg.filter((p) => p.product_views > 150 && p.purchases === 0).sort((a, b) => b.product_views - a.product_views).slice(0, 10),
    [productAgg],
  );
  const bottlenecks = useMemo(() => (exec ? detectBottlenecks(exec, liveSummary) : []), [exec, liveSummary]);
  const recommendations = useMemo(
    () => (exec ? generateRecommendations(exec, channelAgg, productAgg, bottlenecks) : []),
    [exec, channelAgg, productAgg, bottlenecks],
  );
  const activeAlerts = alerts.filter((a) => a.is_active);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Growth Command Center</h1>
          <p className="text-sm text-muted-foreground">
            Genesis V3 · single executive view · 100% canonical SDK · no duplicated SQL
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>Reload</Button>
          <Button onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh canonical layer"}</Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>
      )}

      {/* Live (last 24h) */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Live sessions (24h)" value={liveSummary.sessions} />
        <Kpi label="Live PDP" value={liveSummary.product_views} />
        <Kpi label="Live ATC" value={liveSummary.add_to_carts} />
        <Kpi label="Live checkout" value={liveSummary.checkouts} />
        <Kpi label="Live purchases" value={liveSummary.purchases} highlight />
        <Kpi label="Open alerts" value={activeAlerts.length} highlight={activeAlerts.length > 0} />
      </section>

      {/* 30-day executive */}
      <Card>
        <CardHeader><CardTitle>Last 30 days · executive</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <Kpi label="Sessions" value={exec?.sessions ?? 0} />
            <Kpi label="PDP views" value={exec?.product_views ?? 0} />
            <Kpi label="Add to cart" value={exec?.add_to_carts ?? 0} />
            <Kpi label="Checkouts" value={exec?.checkouts ?? 0} />
            <Kpi label="Purchases" value={exec?.purchases ?? 0} highlight />
            <Kpi label="Revenue" value={exec ? fmtEur(exec.revenue_eur) : "—"} highlight />
            <Kpi label="AOV" value={exec ? fmtEur(exec.aov_eur) : "—"} />
            <Kpi label="CVR" value={exec ? fmtPct(exec.cvr_pct) : "—"} />
          </div>
        </CardContent>
      </Card>

      {/* Channels */}
      <Card>
        <CardHeader><CardTitle>Channel performance (30d)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Channel</th>
                <th className="py-2 text-right">Sessions</th>
                <th className="py-2 text-right">Purchases</th>
                <th className="py-2 text-right">Revenue</th>
                <th className="py-2 text-right">CVR</th>
              </tr>
            </thead>
            <tbody>
              {channelAgg.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">{loading ? "Loading…" : "No channel data yet"}</td></tr>}
              {channelAgg.map((c) => (
                <tr key={c.channel} className="border-t">
                  <td className="py-2 capitalize">{c.channel}</td>
                  <td className="py-2 text-right">{c.sessions.toLocaleString()}</td>
                  <td className="py-2 text-right">{c.purchases.toLocaleString()}</td>
                  <td className="py-2 text-right">{fmtEur(c.revenue_eur)}</td>
                  <td className="py-2 text-right">{fmtPct(c.cvr_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Products: top + worst */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top 10 revenue products (30d)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <ProductTable rows={topProducts} empty={loading ? "Loading…" : "No revenue yet"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Worst converters (≥150 views, 0 purchases)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <ProductTable rows={worstProducts} empty={loading ? "Loading…" : "Nothing flagged — healthy catalog"} />
          </CardContent>
        </Card>
      </div>

      {/* Bottlenecks + AI recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Conversion bottlenecks</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {bottlenecks.length === 0 && <p className="text-sm text-muted-foreground">{loading ? "Analyzing…" : "No bottlenecks detected"}</p>}
            {bottlenecks.map((b, i) => (
              <div key={i} className="flex items-center justify-between border-b py-2 last:border-0">
                <div>
                  <div className="font-medium text-sm">{b.label}</div>
                  <div className="text-xs text-muted-foreground">{b.metric}</div>
                </div>
                <Badge variant={severityBadge(b.severity)}>{b.severity}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>AI growth recommendations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recommendations.length === 0 && <p className="text-sm text-muted-foreground">{loading ? "Generating…" : "No recommendations yet"}</p>}
            {recommendations.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
                <div>
                  <div className="font-medium text-sm">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.rationale}</div>
                </div>
                <Badge variant={severityBadge(r.impact)}>{r.impact}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Critical alerts */}
      <Card>
        <CardHeader><CardTitle>Critical alerts</CardTitle></CardHeader>
        <CardContent>
          {activeAlerts.length === 0 && <p className="text-sm text-muted-foreground">No active canonical consistency alerts.</p>}
          <div className="space-y-2">
            {activeAlerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b py-2 last:border-0">
                <div>
                  <div className="text-sm font-medium">{a.alert_key}</div>
                  <div className="text-xs text-muted-foreground">{a.metric} · expected {a.expected ?? "—"} · actual {a.actual ?? "—"} · {a.diff_pct?.toFixed(2) ?? "—"}%</div>
                </div>
                <Badge variant={severityBadge(a.severity)}>{a.severity}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, highlight = false }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary" : undefined}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</div>
      </CardContent>
    </Card>
  );
}

function ProductTable({ rows, empty }: { rows: ProductAgg[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-2">Product</th>
          <th className="py-2 text-right">Views</th>
          <th className="py-2 text-right">ATC</th>
          <th className="py-2 text-right">Purchases</th>
          <th className="py-2 text-right">Revenue</th>
          <th className="py-2 text-right">CVR</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.product_id} className="border-t">
            <td className="py-2 font-mono text-xs">{p.product_id.slice(0, 12)}…</td>
            <td className="py-2 text-right">{p.product_views.toLocaleString()}</td>
            <td className="py-2 text-right">{p.add_to_carts.toLocaleString()}</td>
            <td className="py-2 text-right">{p.purchases.toLocaleString()}</td>
            <td className="py-2 text-right">{fmtEur(p.revenue_eur)}</td>
            <td className="py-2 text-right">{fmtPct(p.cvr)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}