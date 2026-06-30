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
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { AutonomousFirstSaleStrip } from "@/components/admin/AutonomousFirstSaleStrip";
import { FirstSaleWarRoom } from "@/components/admin/FirstSaleWarRoom";
import { CreativeIntelligenceV4Card } from "@/components/admin/CreativeIntelligenceV4Card";

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
  const [piScores, setPiScores] = useState<any[]>([]);
  const [piProducts, setPiProducts] = useState<Record<string, { name: string }>>({});
  const [pinScores, setPinScores] = useState<any[]>([]);
  const [pinProducts, setPinProducts] = useState<Record<string, { name: string }>>({});
  const [error, setError] = useState<string | null>(null);

  // Autopilot state
  const [autopilotQueue, setAutopilotQueue] = useState<any[]>([]);
  const [autopilotHistory, setAutopilotHistory] = useState<any[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<any | null>(null);

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
      const { data: pi } = await supabase
        .from("gv3_pi_scores")
        .select("product_id, overall_score, classification, confidence_score, sessions, product_views, add_to_carts, checkouts, purchases, revenue_cents, pinterest_score, cro_risk_score")
        .order("overall_score", { ascending: false })
        .limit(500);
      setPiScores(pi ?? []);
      const ids = Array.from(new Set((pi ?? []).map((r: any) => r.product_id)));
      if (ids.length) {
        const { data: pr } = await supabase.from("products").select("id, name").in("id", ids);
        const m: Record<string, any> = {};
        for (const p of pr ?? []) m[(p as any).id] = { name: (p as any).name };
        setPiProducts(m);
      }
      const { data: pin } = await supabase
        .from("gv3_pin_growth_scores")
        .select("product_id, pinterest_growth_score, classification, predicted_opportunity, pinterest_saturation, confidence, reason")
        .order("pinterest_growth_score", { ascending: false })
        .limit(500);
      setPinScores(pin ?? []);
      const pinIds = Array.from(new Set((pin ?? []).map((r: any) => r.product_id)));
      if (pinIds.length) {
        const { data: pr } = await supabase.from("products").select("id, name").in("id", pinIds);
        const m: Record<string, any> = {};
        for (const p of pr ?? []) m[(p as any).id] = { name: (p as any).name };
        setPinProducts(m);
      }
      await loadAutopilot();
    } catch (err: any) {
      setError(err?.message ?? "Failed to load growth data");
    } finally {
      setLoading(false);
    }
  }

  async function loadAutopilot() {
    try {
      const [todayRes, historyRes] = await Promise.all([
        supabase.functions.invoke("autopilot-dispatch?op=today", { body: {} }),
        supabase.from("autopilot_actions")
          .select("id, kind, product_id, priority, confidence, ai_credit_cost, expected_revenue_eur, expected_roi, status, executed_at, created_at, error_message, invocation_result")
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      setAutopilotQueue((todayRes.data as any)?.queue ?? []);
      setAutopilotHistory(historyRes.data ?? []);
    } catch (e) {
      // non-fatal — autopilot is optional surface
    }
  }

  async function callDispatch(op: "preview" | "execute" | "undo", body: any) {
    const url = `${(supabase as any).functionsUrl ?? ""}/autopilot-dispatch?op=${op}`;
    // Use supabase.functions.invoke with query-string via path
    const { data, error: invokeErr } = await supabase.functions.invoke(
      `autopilot-dispatch?op=${op}`,
      { body },
    );
    if (invokeErr) throw new Error(invokeErr.message);
    return data;
  }

  async function onPreview(action: { kind: string; product_id?: string | null }) {
    setBusyAction(`preview:${action.kind}:${action.product_id ?? ""}`);
    try {
      const data = await callDispatch("preview", action);
      setPreviewing(data);
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function onExecute(action: { kind: string; product_id?: string | null }) {
    const key = `exec:${action.kind}:${action.product_id ?? ""}`;
    setBusyAction(key);
    try {
      const data: any = await callDispatch("execute", action);
      if (data?.result?.ok) {
        toast({ title: "Action executed", description: `${action.kind} · ROI ${data?.preview?.expected_roi ?? 0}` });
      } else {
        toast({
          title: "Action did not run",
          description: data?.result?.error ?? "Unknown error",
          variant: "destructive",
        });
      }
      await loadAutopilot();
    } catch (e: any) {
      toast({ title: "Execute failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function onUndo(action_id: string) {
    setBusyAction(`undo:${action_id}`);
    try {
      await callDispatch("undo", { action_id });
      toast({ title: "Undo requested" });
      await loadAutopilot();
    } catch (e: any) {
      toast({ title: "Undo failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
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

  const firstSaleBrief = useMemo(() => {
    return buildFirstSaleBrief({
      exec, liveSummary, productAgg, piScores, pinScores, piProducts, pinProducts,
    });
  }, [exec, liveSummary, productAgg, piScores, pinScores, piProducts, pinProducts]);

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

      {/* Genesis V3.4 — Autonomous First Sale Mode */}
      <AutonomousFirstSaleStrip />
      <FirstSaleWarRoom />
      <CreativeIntelligenceV4Card />

      {/* Genesis V3.1 — First Sale Mission brief */}
      <Card className="border-primary">
        <CardHeader>
          <CardTitle>🔥 First Sale Brief · next 24–72h</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Analyzing…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <BriefRow icon="🔥" label="Best product today" value={firstSaleBrief.bestProduct} />
              <BriefRow icon="💰" label="Highest revenue opportunity" value={firstSaleBrief.revenueOpportunity} />
              <BriefRow icon="📌" label="Best Pinterest opportunity" value={firstSaleBrief.pinOpportunity} />
              <BriefRow icon="⚠️" label="Worst converter" value={firstSaleBrief.worstConverter} />
              <BriefRow icon="⏸️" label="Pause" value={firstSaleBrief.toPause} />
              <BriefRow icon="🚀" label="Scale" value={firstSaleBrief.toScale} />
              <BriefRow icon="🎨" label="Regenerate creative" value={firstSaleBrief.regenerateCreative} />
              <BriefRow icon="🕐" label="Best posting times" value={firstSaleBrief.postingTimes} />
              <BriefRow icon="🎯" label="Sales probability (24–72h)" value={firstSaleBrief.salesProbability} />
              <BriefRow icon="💵" label="Estimated revenue potential" value={firstSaleBrief.revenuePotential} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Genesis V3.2 — Autopilot today's queue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>⚡ Today's Autopilot Queue · CRITICAL + HIGH only</CardTitle>
          <Button variant="outline" size="sm" onClick={loadAutopilot}>Reload queue</Button>
        </CardHeader>
        <CardContent>
          {autopilotQueue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No qualified actions. Increase scoring confidence to unlock AI-credit spend.</p>
          ) : (
            <div className="space-y-2">
              {autopilotQueue.map((q, i) => {
                const name = piProducts[q.product_id]?.name || pinProducts[q.product_id]?.name || q.product_id?.slice(0, 8) || "—";
                const key = `exec:${q.kind}:${q.product_id ?? ""}`;
                return (
                  <div key={`${q.kind}-${q.product_id}-${i}`} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border rounded p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{q.kind} · {name}</div>
                      <div className="text-xs text-muted-foreground truncate">{q.reason}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={q.priority === "CRITICAL" ? "destructive" : "default"}>{q.priority}</Badge>
                      <Badge variant="secondary">{q.ai_credit_cost} cr</Badge>
                      <Badge variant="outline">+{Math.round(q.expected_lift_pct)}% lift</Badge>
                      <Button size="sm" variant="outline" disabled={busyAction === key} onClick={() => onPreview({ kind: q.kind, product_id: q.product_id })}>Preview</Button>
                      <Button size="sm" disabled={busyAction === key} onClick={() => onExecute({ kind: q.kind, product_id: q.product_id })}>{busyAction === key ? "…" : "Execute"}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {previewing && (
            <div className="mt-4 border rounded p-3 bg-muted/40 text-xs space-y-1">
              <div className="font-medium text-sm">Preview · {previewing.kind}</div>
              <div>Priority: <strong>{previewing.priority}</strong> · Confidence: {(previewing.confidence * 100).toFixed(0)}%</div>
              <div>AI cost: {previewing.ai_credit_cost} credits · Expected revenue: €{previewing.expected_revenue_eur} · ROI: {previewing.expected_roi}</div>
              <div>Invokes: <code>{previewing.invoked_function ?? "n/a"}</code></div>
              {previewing.credit_gated && <div className="text-destructive">Blocked: priority too low to spend AI credits.</div>}
              <Button size="sm" variant="ghost" onClick={() => setPreviewing(null)}>Dismiss</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Genesis V3.2 — Autopilot execution history */}
      <Card>
        <CardHeader><CardTitle>🧾 Autopilot Execution History (last 25)</CardTitle></CardHeader>
        <CardContent>
          {autopilotHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actions executed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1">When</th>
                    <th className="py-1">Kind</th>
                    <th className="py-1">Priority</th>
                    <th className="py-1">Status</th>
                    <th className="py-1 text-right">Credits</th>
                    <th className="py-1 text-right">€ est.</th>
                    <th className="py-1">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {autopilotHistory.map((h: any) => (
                    <tr key={h.id} className="border-t">
                      <td className="py-1 whitespace-nowrap">{new Date(h.executed_at ?? h.created_at).toLocaleTimeString()}</td>
                      <td className="py-1">{h.kind}</td>
                      <td className="py-1">{h.priority}</td>
                      <td className="py-1">
                        <Badge variant={h.status === "failed" ? "destructive" : h.status === "done" ? "default" : "secondary"}>{h.status}</Badge>
                      </td>
                      <td className="py-1 text-right">{Number(h.ai_credit_cost).toFixed(1)}</td>
                      <td className="py-1 text-right">{Number(h.expected_revenue_eur).toFixed(2)}</td>
                      <td className="py-1">
                        {h.status === "done" && (
                          <Button size="sm" variant="ghost" disabled={busyAction === `undo:${h.id}`} onClick={() => onUndo(h.id)}>Undo</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
      {/* Product Intelligence (Genesis V3 · Phase 2) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Product Intelligence (V3)</CardTitle>
          <Link to="/admin/product-intelligence-v3" className="text-xs underline">Open dashboard →</Link>
        </CardHeader>
        <CardContent>
          {piScores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Product Intelligence run yet. Open the dashboard and click “Run Now”.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <PiList title="Top winners" rows={piScores.filter(p=>p.classification==="Winner").slice(0,5)} products={piProducts} />
              <PiList title="To promote" rows={piScores.filter(p=>p.classification==="Candidate to Promote"||p.classification==="Promising").slice(0,5)} products={piProducts} />
              <PiList title="Needs CRO" rows={piScores.filter(p=>p.classification==="Needs CRO").slice(0,5)} products={piProducts} />
              <PiList title="Traffic but no purchases" rows={piScores.filter(p=>p.product_views>=150 && p.purchases===0).slice(0,5)} products={piProducts} />
              <PiList title="ATC but no checkout" rows={piScores.filter(p=>p.add_to_carts>0 && p.checkouts===0).slice(0,5)} products={piProducts} />
              <PiList title="Checkout but no purchase" rows={piScores.filter(p=>p.checkouts>0 && p.purchases===0).slice(0,5)} products={piProducts} />
              <PiList title="Low confidence" rows={piScores.filter(p=>p.classification==="Low Confidence").slice(0,5)} products={piProducts} />
              <PiList title="Top Pinterest opportunities" rows={[...piScores].sort((a,b)=>b.pinterest_score-a.pinterest_score).slice(0,5)} products={piProducts} />
              <PiList title="Highest CRO risk" rows={[...piScores].sort((a,b)=>b.cro_risk_score-a.cro_risk_score).slice(0,5)} products={piProducts} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pinterest Growth (Genesis V3 · Phase 3) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pinterest Growth (V3)</CardTitle>
          <Link to="/admin/pinterest-growth-v3" className="text-xs underline">Open dashboard →</Link>
        </CardHeader>
        <CardContent>
          {pinScores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Pinterest Growth run yet. Open the dashboard and click “Run Now”.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Kpi label="Scored" value={pinScores.length} />
                <Kpi label="Promote today" value={pinScores.filter(p=>p.classification==="Promote Immediately").length} highlight />
                <Kpi label="Needs creative" value={pinScores.filter(p=>["Needs New Creative","Needs Better Images","Needs Better Copy"].includes(p.classification)).length} />
                <Kpi label="Do not promote" value={pinScores.filter(p=>p.classification==="Do Not Promote").length} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <PinList
                  title="Top opportunities"
                  rows={[...pinScores]
                    .filter(p=>!["Do Not Promote","Hold","Low Confidence"].includes(p.classification))
                    .sort((a,b)=>b.predicted_opportunity-a.predicted_opportunity)
                    .slice(0,6)}
                  products={pinProducts}
                  metric="predicted_opportunity"
                  metricLabel="opp"
                />
                <PinList
                  title="Publish today"
                  rows={pinScores.filter(p=>p.classification==="Promote Immediately").slice(0,6)}
                  products={pinProducts}
                  metric="pinterest_growth_score"
                  metricLabel="PGS"
                />
                <PinList
                  title="Needs new creative"
                  rows={pinScores.filter(p=>["Needs New Creative","Needs Better Images","Needs Better Copy"].includes(p.classification)).slice(0,6)}
                  products={pinProducts}
                  metric="pinterest_growth_score"
                  metricLabel="PGS"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

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

function PiList({ title, rows, products }: { title: string; rows: any[]; products: Record<string, { name: string }> }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs uppercase text-muted-foreground mb-2">{title}</div>
      {rows.length === 0 ? <div className="text-xs text-muted-foreground">—</div> : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.product_id} className="flex items-center justify-between gap-2">
              <span className="truncate">{products[r.product_id]?.name || r.product_id.slice(0, 8)}</span>
              <span className="text-xs text-muted-foreground">{Math.round(r.overall_score)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PinList({
  title, rows, products, metric, metricLabel,
}: {
  title: string;
  rows: any[];
  products: Record<string, { name: string }>;
  metric: "predicted_opportunity" | "pinterest_growth_score";
  metricLabel: string;
}) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs uppercase text-muted-foreground mb-2">{title}</div>
      {rows.length === 0 ? <div className="text-xs text-muted-foreground">—</div> : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.product_id} className="flex items-center justify-between gap-2">
              <span className="truncate">{products[r.product_id]?.name || r.product_id.slice(0, 8)}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{Math.round(Number(r[metric] ?? 0))} {metricLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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

function BriefRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 border rounded p-3">
      <span className="text-lg leading-none">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

interface FirstSaleBriefInput {
  exec: CanonicalExecKpis | null;
  liveSummary: ReturnType<typeof summarizeCanonicalSessions>;
  productAgg: ProductAgg[];
  piScores: any[];
  pinScores: any[];
  piProducts: Record<string, { name: string }>;
  pinProducts: Record<string, { name: string }>;
}

function buildFirstSaleBrief(input: FirstSaleBriefInput) {
  const { exec, liveSummary, productAgg, piScores, pinScores, piProducts, pinProducts } = input;
  const nameOf = (id: string) => piProducts[id]?.name || pinProducts[id]?.name || id.slice(0, 8);

  // Best product today: highest PI overall_score with confidence >= 90 (Phase 9 gate)
  const piRanked = [...piScores]
    .filter((p) => (p.confidence_score ?? 0) >= 90 && (p.overall_score ?? 0) >= 90)
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));
  const bestProduct = piRanked[0]
    ? `${nameOf(piRanked[0].product_id)} · score ${Math.round(piRanked[0].overall_score)}`
    : "No product clears the 90/90 gate — hold publishing";

  // Revenue opportunity: PDP views × no purchase × high PI score (latent demand)
  const revOpp = [...piScores]
    .filter((p) => (p.product_views ?? 0) >= 50 && (p.purchases ?? 0) === 0)
    .sort((a, b) => (b.overall_score ?? 0) * (b.product_views ?? 0) - (a.overall_score ?? 0) * (a.product_views ?? 0))[0];
  const revenueOpportunity = revOpp
    ? `${nameOf(revOpp.product_id)} · ${revOpp.product_views} views, 0 sales`
    : "Catalog converting — no latent opp";

  // Pinterest opportunity: highest predicted_opportunity among Promote Immediately
  const pinOpp = [...pinScores]
    .filter((p) => p.classification === "Promote Immediately" && (p.confidence ?? 0) >= 0.9)
    .sort((a, b) => (b.predicted_opportunity ?? 0) - (a.predicted_opportunity ?? 0))[0];
  const pinOpportunity = pinOpp
    ? `${nameOf(pinOpp.product_id)} · opp ${Math.round(pinOpp.predicted_opportunity ?? 0)}`
    : "No high-confidence Pinterest promotion candidate";

  // Worst converter: highest views with 0 purchases (canonical 30d)
  const worst = [...productAgg]
    .filter((p) => p.product_views >= 150 && p.purchases === 0)
    .sort((a, b) => b.product_views - a.product_views)[0];
  const worstConverter = worst
    ? `${worst.product_id.slice(0, 12)}… · ${worst.product_views} views, 0 sales`
    : "Nothing flagged";

  // Pause: classifications "Do Not Promote" + "Needs CRO" with 0 purchases
  const pauseList = piScores
    .filter((p) => (p.classification === "Do Not Promote" || p.classification === "Needs CRO") && (p.purchases ?? 0) === 0)
    .slice(0, 3)
    .map((p) => nameOf(p.product_id));
  const toPause = pauseList.length ? `${pauseList.length} products: ${pauseList.join(", ")}` : "Nothing to pause";

  // Scale: PI Winners with confidence >= 90
  const scaleList = piScores
    .filter((p) => p.classification === "Winner" && (p.confidence_score ?? 0) >= 90)
    .slice(0, 3)
    .map((p) => nameOf(p.product_id));
  const toScale = scaleList.length ? scaleList.join(", ") : "No winners qualified yet";

  // Regenerate creative: Pinterest "Needs New Creative" classifications
  const regenList = pinScores
    .filter((p) => ["Needs New Creative", "Needs Better Images", "Needs Better Copy"].includes(p.classification))
    .slice(0, 3)
    .map((p) => nameOf(p.product_id));
  const regenerateCreative = regenList.length ? regenList.join(", ") : "Creative inventory healthy";

  // Posting times: US Pinterest peak windows (well-known: weekday 8-11pm ET, Sat morning)
  const postingTimes = "20:00–23:00 ET weekdays · 09:00–11:00 ET Saturday";

  // Sales probability: derived from live 24h funnel signal
  const liveSig = liveSummary.add_to_carts + liveSummary.checkouts * 3 + liveSummary.purchases * 10;
  const promotables = piRanked.length + (pinOpp ? 1 : 0);
  const probScore = Math.min(95, liveSig * 5 + promotables * 8 + (exec?.purchases ?? 0) * 3);
  const salesProbability =
    probScore >= 70 ? `HIGH (${probScore}%) — push top product now`
    : probScore >= 40 ? `MEDIUM (${probScore}%) — needs traffic + qualified creative`
    : `LOW (${probScore}%) — qualify creative first, then drive Pinterest traffic`;

  // Revenue potential: AOV × expected purchases from promotables
  const aov = exec?.aov_eur && exec.aov_eur > 0 ? exec.aov_eur : 35;
  const expectedPurch = Math.max(0, Math.round((probScore / 100) * (promotables * 2 + 1)));
  const revenuePotential = `~${expectedPurch} sale${expectedPurch === 1 ? "" : "s"} · €${(expectedPurch * aov).toFixed(0)} at €${aov.toFixed(0)} AOV`;

  return {
    bestProduct,
    revenueOpportunity,
    pinOpportunity,
    worstConverter,
    toPause,
    toScale,
    regenerateCreative,
    postingTimes,
    salesProbability,
    revenuePotential,
  };
}