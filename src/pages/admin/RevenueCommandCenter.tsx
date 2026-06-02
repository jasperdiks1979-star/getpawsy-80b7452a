import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign, TrendingUp, Target, Zap, Flame, Brain, Play } from "lucide-react";
import { toast } from "sonner";

type OrderRow = {
  id: string;
  total_amount: number | null;
  status: string | null;
  created_at: string;
  items: any;
};

type PinRow = {
  pin_id: string | null;
  product_id: string | null;
  pin_title: string | null;
  impressions: number | null;
  clicks: number | null;
  saves: number | null;
  ctr: number | null;
  performance_score: number | null;
};

type Recommendation = {
  id: string;
  title: string;
  body: string | null;
  severity: string | null;
  category: string | null;
  product_id: string | null;
  status: string | null;
  created_at: string;
};

type HotProduct = {
  product_id: string;
  hot_score: number | null;
  intent_score: number | null;
  viral_score: number | null;
  margin_score: number | null;
  pinterest_fit_score: number | null;
  revenue_30d: number | null;
  units_30d: number | null;
  recommended_action: string | null;
  auto_promoted: boolean | null;
  signals: any;
};

type ImprovementRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  revenue_7d: number | null;
  profit_7d: number | null;
  winners_count: number | null;
  losers_count: number | null;
  actions_taken: number | null;
  pattern_weights_updated: number | null;
};

const PAID_STATUSES = ["paid", "completed", "fulfilled", "shipped", "delivered"];

function fmtMoney(n: number): string {
  return `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function RevenueCommandCenter() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [hot, setHot] = useState<HotProduct[]>([]);
  const [runs, setRuns] = useState<ImprovementRun[]>([]);
  const [running, setRunning] = useState<"hot" | "loop" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const since = daysAgoIso(30);
        const today = new Date().toISOString().slice(0, 10);
        const [ordersRes, pinsRes, recsRes, hotRes, runsRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id,total_amount,status,created_at,items")
            .gte("created_at", since)
            .in("status", PAID_STATUSES)
            .order("created_at", { ascending: false })
            .limit(1000),
          supabase
            .from("pinterest_pin_performance")
            .select("pin_id,product_id,pin_title,impressions,clicks,saves,ctr,performance_score")
            .order("performance_score", { ascending: false, nullsFirst: false })
            .limit(50),
          supabase
            .from("ai_revenue_recommendations")
            .select("id,title,body,severity,category,product_id,status,created_at")
            .in("status", ["open", "pending", "new"])
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("hot_product_scores")
            .select("product_id,hot_score,intent_score,viral_score,margin_score,pinterest_fit_score,revenue_30d,units_30d,recommended_action,auto_promoted,signals")
            .eq("day", today)
            .order("hot_score", { ascending: false })
            .limit(20),
          supabase
            .from("self_improvement_runs")
            .select("id,started_at,finished_at,status,revenue_7d,profit_7d,winners_count,losers_count,actions_taken,pattern_weights_updated")
            .order("started_at", { ascending: false })
            .limit(5),
        ]);
        if (cancelled) return;
        if (ordersRes.error) throw ordersRes.error;
        setOrders((ordersRes.data ?? []) as OrderRow[]);
        setPins((pinsRes.data ?? []) as PinRow[]);
        setRecs((recsRes.data ?? []) as Recommendation[]);
        setHot((hotRes.data ?? []) as HotProduct[]);
        setRuns((runsRes.data ?? []) as ImprovementRun[]);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load revenue data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const now = Date.now();
  const startOfTodayUtc = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const ms7 = 7 * 24 * 60 * 60 * 1000;

  const sumIn = (cutoffMs: number, sinceStartOfDay = false) =>
    orders.reduce((acc, o) => {
      const t = new Date(o.created_at).getTime();
      const ok = sinceStartOfDay ? t >= cutoffMs : t >= now - cutoffMs;
      return ok ? acc + Number(o.total_amount || 0) : acc;
    }, 0);

  const revenueToday = sumIn(startOfTodayUtc, true);
  const revenue7d = sumIn(ms7);
  const revenue30d = orders.reduce((a, o) => a + Number(o.total_amount || 0), 0);
  const orders30d = orders.length;
  const aov30d = orders30d > 0 ? revenue30d / orders30d : 0;

  // Revenue per product (from items jsonb)
  const productRevenue = new Map<string, { revenue: number; qty: number; name: string }>();
  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      const id = String(it?.product_id ?? it?.id ?? it?.slug ?? "unknown");
      const name = String(it?.name ?? it?.title ?? id);
      const qty = Number(it?.quantity ?? 1);
      const price = Number(it?.price ?? it?.unit_price ?? 0);
      const line = price * qty;
      const cur = productRevenue.get(id) ?? { revenue: 0, qty: 0, name };
      cur.revenue += line;
      cur.qty += qty;
      cur.name = name;
      productRevenue.set(id, cur);
    }
  }
  const topProducts = Array.from(productRevenue.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const totalPinImpressions = pins.reduce((a, p) => a + Number(p.impressions || 0), 0);
  const totalPinClicks = pins.reduce((a, p) => a + Number(p.clicks || 0), 0);
  const totalPinSaves = pins.reduce((a, p) => a + Number(p.saves || 0), 0);

  async function runEngine(kind: "hot" | "loop") {
    setRunning(kind);
    try {
      const fn = kind === "hot" ? "hot-product-engine" : "self-improvement-loop";
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      toast.success(kind === "hot"
        ? `Hot Product Engine: scored ${data?.scored ?? 0}, promoted ${data?.promoted ?? 0}`
        : `Self-Improvement Loop: ${data?.actions ?? 0} actions, ${data?.winners ?? 0}W/${data?.losers ?? 0}L`);
      // refresh
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      toast.error(e?.message || "Engine run failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <>
      <Helmet>
        <title>Revenue Command Center | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="p-6 space-y-6">
        <header>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <DollarSign className="h-7 w-7 text-primary" /> Revenue Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Profitable-revenue focused dashboard for US Pinterest commerce. All numbers from real orders & pin performance.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading revenue data…
          </div>
        ) : err ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div>
        ) : (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Today" value={fmtMoney(revenueToday)} icon={<DollarSign className="h-4 w-4" />} />
              <Stat label="Last 7 days" value={fmtMoney(revenue7d)} icon={<TrendingUp className="h-4 w-4" />} />
              <Stat label="Last 30 days" value={fmtMoney(revenue30d)} icon={<Target className="h-4 w-4" />} />
              <Stat label={`AOV (${orders30d} orders)`} value={fmtMoney(aov30d)} icon={<Zap className="h-4 w-4" />} />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top products by revenue (30d)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="p-2">Product</th>
                        <th className="p-2 text-right">Revenue</th>
                        <th className="p-2 text-right">Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-muted-foreground">
                            No paid orders in the last 30 days.
                          </td>
                        </tr>
                      ) : (
                        topProducts.map((p) => (
                          <tr key={p.id} className="border-b last:border-b-0">
                            <td className="p-2 truncate max-w-[260px]" title={p.name}>{p.name}</td>
                            <td className="p-2 text-right font-medium">{fmtMoney(p.revenue)}</td>
                            <td className="p-2 text-right">{p.qty}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Pinterest pins by performance</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="px-4 py-2 text-xs text-muted-foreground border-b">
                    {totalPinImpressions.toLocaleString()} impressions · {totalPinClicks.toLocaleString()} clicks · {totalPinSaves.toLocaleString()} saves
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="p-2">Pin</th>
                        <th className="p-2 text-right">Score</th>
                        <th className="p-2 text-right">CTR</th>
                        <th className="p-2 text-right">Saves</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pins.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-muted-foreground">
                            No pin performance data yet.
                          </td>
                        </tr>
                      ) : (
                        pins.slice(0, 15).map((p, i) => (
                          <tr key={p.pin_id ?? i} className="border-b last:border-b-0">
                            <td className="p-2 truncate max-w-[220px]" title={p.pin_title ?? ""}>
                              {p.pin_title || p.pin_id || "—"}
                            </td>
                            <td className="p-2 text-right">{Number(p.performance_score ?? 0).toFixed(1)}</td>
                            <td className="p-2 text-right">{((Number(p.ctr ?? 0)) * (Number(p.ctr ?? 0) > 1 ? 1 : 100)).toFixed(2)}%</td>
                            <td className="p-2 text-right">{p.saves ?? 0}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Top 10 AI revenue actions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {recs.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    No open recommendations. The AI loop hasn't surfaced new actions yet.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {recs.map((r) => (
                      <li key={r.id} className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{r.title}</div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {r.severity || "info"} · {r.category || "general"}
                          </span>
                        </div>
                        {r.body && <div className="text-sm text-muted-foreground mt-1">{r.body}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-500" /> Hot Products (today)
                  </CardTitle>
                  <Button size="sm" variant="outline" disabled={running === "hot"} onClick={() => runEngine("hot")}>
                    {running === "hot" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    <span className="ml-1">Run engine</span>
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="px-4 py-2 text-xs text-muted-foreground border-b">
                    Score ≥85 auto-promotes to Autopilot + V8 Cinematic + Creative Director.
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="p-2">Product</th>
                        <th className="p-2 text-right">Score</th>
                        <th className="p-2 text-right">Rev 30d</th>
                        <th className="p-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hot.length === 0 ? (
                        <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No scores yet. Click "Run engine".</td></tr>
                      ) : hot.map((h) => (
                        <tr key={h.product_id} className="border-b last:border-b-0">
                          <td className="p-2 truncate max-w-[220px]" title={h.signals?.name ?? ""}>
                            {h.signals?.name ?? h.product_id.slice(0, 8)}
                            {h.auto_promoted && <span className="ml-1 text-[10px] px-1 rounded bg-orange-500/20 text-orange-600">PROMOTED</span>}
                          </td>
                          <td className="p-2 text-right font-bold">{Number(h.hot_score ?? 0).toFixed(0)}</td>
                          <td className="p-2 text-right">{fmtMoney(Number(h.revenue_30d ?? 0))}</td>
                          <td className="p-2 text-right text-xs text-muted-foreground">{h.recommended_action ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-violet-500" /> Self-Improvement Loop
                  </CardTitle>
                  <Button size="sm" variant="outline" disabled={running === "loop"} onClick={() => runEngine("loop")}>
                    {running === "loop" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    <span className="ml-1">Run now</span>
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="px-4 py-2 text-xs text-muted-foreground border-b">
                    Auto-pauses losers, boosts winners, retrains pattern weights, scales publishing.
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="p-2">Run</th>
                        <th className="p-2 text-right">Rev 7d</th>
                        <th className="p-2 text-right">W/L</th>
                        <th className="p-2 text-right">Actions</th>
                        <th className="p-2 text-right">Patterns</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.length === 0 ? (
                        <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No runs yet.</td></tr>
                      ) : runs.map((r) => (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="p-2 text-xs">
                            {new Date(r.started_at).toLocaleString()}
                            <span className={`ml-1 text-[10px] px-1 rounded ${r.status === "ok" ? "bg-emerald-500/20 text-emerald-600" : r.status === "error" ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
                          </td>
                          <td className="p-2 text-right">{fmtMoney(Number(r.revenue_7d ?? 0))}</td>
                          <td className="p-2 text-right">{r.winners_count ?? 0}/{r.losers_count ?? 0}</td>
                          <td className="p-2 text-right">{r.actions_taken ?? 0}</td>
                          <td className="p-2 text-right">{r.pattern_weights_updated ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon} {label}
        </div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}