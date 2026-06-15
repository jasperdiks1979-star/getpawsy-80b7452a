import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, TrendingUp, TrendingDown, RefreshCw, Trophy, Target } from "lucide-react";

type DailyReport = {
  report_date: string;
  pinterest_visitors: number;
  product_views: number;
  add_to_carts: number;
  checkouts: number;
  purchases: number;
  revenue_cents: number;
  pins_published: number;
  superstar_count: number;
  winner_count: number;
  average_count: number;
  weak_count: number;
  dead_count: number;
  top_products: any[];
  top_boards: any[];
  biggest_losers: any[];
  allocation: any;
};

const TIER_COLORS: Record<string, string> = {
  superstar: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  winner: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  average: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  weak: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  dead: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  discovery: "bg-blue-500/15 text-blue-700 border-blue-500/30",
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PinterestRevenuePage() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pinterest_revenue_daily_reports")
        .select("*")
        .order("report_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      setReports((data ?? []) as DailyReport[]);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runAutopilot() {
    setRunning(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-revenue-autopilot", { body: {} });
      if (error) throw error;
      setLastRun(data);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Autopilot run failed");
    } finally {
      setRunning(false);
    }
  }

  const today = reports[0];
  const sum = (n: number) => reports.slice(0, n).reduce((a, r) => a + (r.revenue_cents ?? 0), 0);
  const rev7 = sum(7);
  const rev30 = sum(30);
  const visitors7 = reports.slice(0, 7).reduce((a, r) => a + (r.pinterest_visitors ?? 0), 0);
  const atc7 = reports.slice(0, 7).reduce((a, r) => a + (r.add_to_carts ?? 0), 0);
  const purch7 = reports.slice(0, 7).reduce((a, r) => a + (r.purchases ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Pinterest Revenue Autopilot — Admin</title></Helmet>
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5" /> Pinterest Revenue Autopilot
          </h1>
          <p className="text-sm text-muted-foreground">
            Self-learning publishing: budget shifts automatically toward winners. Last report: {today?.report_date ?? "never"}
          </p>
        </div>
        <Button onClick={runAutopilot} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run autopilot now
        </Button>
      </header>

      {err && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div>
      )}

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : reports.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No revenue reports yet. Click <strong>Run autopilot now</strong> to generate the first snapshot.
        </CardContent></Card>
      ) : (
        <>
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Revenue today" value={dollars(today?.revenue_cents ?? 0)} sub={`${today?.purchases ?? 0} orders`} />
            <Kpi label="Revenue 7d" value={dollars(rev7)} sub={`${purch7} orders`} />
            <Kpi label="Revenue 30d" value={dollars(rev30)} sub={`${reports.length} days tracked`} />
            <Kpi label="Visitors 7d" value={visitors7.toLocaleString()} sub={`${atc7} add-to-carts`} />
          </div>

          {/* Tier distribution + publishing allocation */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Publishing allocation</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <TierStat label="Superstar" pct="40%" count={today?.superstar_count ?? 0} k="superstar" />
                <TierStat label="Winner" pct="30%" count={today?.winner_count ?? 0} k="winner" />
                <TierStat label="Average" pct="20%" count={today?.average_count ?? 0} k="average" />
                <TierStat label="Weak" pct="8%" count={today?.weak_count ?? 0} k="weak" />
                <TierStat label="Dead" pct="2%" count={today?.dead_count ?? 0} k="dead" />
                <TierStat label="Discovery reserve" pct="20%" count={today?.allocation?.tier_counts?.discovery ?? 0} k="discovery" />
              </div>
            </CardContent>
          </Card>

          {/* Funnel */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pinterest commerce funnel (today)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <FunnelStep label="Visitors" v={today?.pinterest_visitors ?? 0} />
                <FunnelStep label="Product views" v={today?.product_views ?? 0} />
                <FunnelStep label="Add-to-cart" v={today?.add_to_carts ?? 0} />
                <FunnelStep label="Checkouts" v={today?.checkouts ?? 0} />
                <FunnelStep label="Purchases" v={today?.purchases ?? 0} />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top products */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4" /> Top winning products</CardTitle></CardHeader>
              <CardContent>
                <Table rows={(today?.top_products ?? []).map((p: any) => ({
                  k: p.product_id,
                  primary: p.slug ?? p.product_id,
                  badge: <Badge variant="outline" className={TIER_COLORS[p.tier] ?? ""}>{p.tier}</Badge>,
                  value: dollars(p.revenue_cents ?? 0),
                  sub: `${p.purchases ?? 0} sales · ${p.clicks ?? 0} clicks`,
                }))} />
              </CardContent>
            </Card>

            {/* Top boards */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Top winning boards</CardTitle></CardHeader>
              <CardContent>
                <Table rows={(today?.top_boards ?? []).map((b: any) => ({
                  k: b.board,
                  primary: b.board,
                  badge: <Badge variant="outline">{b.classification}</Badge>,
                  value: dollars(b.revenue_cents ?? 0),
                  sub: `${b.purchases ?? 0} sales · CTR ${((b.ctr ?? 0) * 100).toFixed(2)}%`,
                }))} />
              </CardContent>
            </Card>

            {/* Biggest losers */}
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4" /> Biggest losers (high impressions, zero sales)</CardTitle></CardHeader>
              <CardContent>
                <Table rows={(today?.biggest_losers ?? []).map((p: any) => ({
                  k: p.product_id,
                  primary: p.slug ?? p.product_id,
                  badge: <Badge variant="outline" className={TIER_COLORS[p.tier] ?? ""}>{p.tier}</Badge>,
                  value: `${(p.impressions ?? 0).toLocaleString()} impr`,
                  sub: `${p.clicks ?? 0} clicks · 0 sales`,
                }))} empty="No losers detected — every product with ≥200 impressions converted at least once." />
              </CardContent>
            </Card>

            {/* Revenue heatmap (last 14 days) */}
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">Revenue heatmap (last 14 days)</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-1">
                  {reports.slice(0, 14).reverse().map((r) => {
                    const max = Math.max(1, ...reports.slice(0, 14).map((x) => x.revenue_cents));
                    const intensity = Math.min(1, (r.revenue_cents ?? 0) / max);
                    return (
                      <div key={r.report_date} className="flex-1 text-center" title={`${r.report_date}: ${dollars(r.revenue_cents)}`}>
                        <div
                          className="h-12 rounded"
                          style={{ backgroundColor: `hsl(142 70% ${90 - intensity * 50}%)` }}
                        />
                        <div className="text-[10px] text-muted-foreground mt-1">{r.report_date.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {lastRun && (
            <Card>
              <CardHeader><CardTitle className="text-base">Last autopilot run</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-xs overflow-auto max-h-64 bg-muted p-3 rounded">{JSON.stringify(lastRun, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function TierStat({ label, pct, count, k }: { label: string; pct: string; count: number; k: string }) {
  return (
    <div className={`rounded border p-3 ${TIER_COLORS[k] ?? ""}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-semibold mt-1">{pct}</div>
      <div className="text-xs opacity-70">{count} products</div>
    </div>
  );
}

function FunnelStep({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold mt-1">{v.toLocaleString()}</div>
    </div>
  );
}

function Table({ rows, empty }: { rows: { k: string; primary: any; badge?: any; value: any; sub?: any }[]; empty?: string }) {
  if (!rows.length) {
    return <div className="text-sm text-muted-foreground">{empty ?? "No data yet."}</div>;
  }
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <div key={r.k} className="flex items-center justify-between py-2 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate flex items-center gap-2">
              <span className="truncate">{r.primary}</span>
              {r.badge}
            </div>
            {r.sub && <div className="text-xs text-muted-foreground mt-0.5">{r.sub}</div>}
          </div>
          <div className="text-right font-medium ml-3">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

// Legacy stub for removed Helmet body — kept to avoid unused imports.
function _Unused() {
  return (
    <Card>
      <CardContent className="p-0">
              <div className="px-4 py-2 border-b font-semibold bg-muted/40">Revenue by product</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left"><th className="p-2">Product</th><th className="p-2 text-right">Revenue</th><th className="p-2 text-right">Orders</th></tr></thead>
                <tbody>
                  {byProduct.length === 0 ? (
                    <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No attributed revenue yet.</td></tr>
                  ) : byProduct.slice(0, 20).map((r: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 text-xs font-mono">{r.product_id || r.product_name || r.name}</td>
                      <td className="p-2 text-right">${Number(r.revenue || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{r.orders || r.count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-2 border-b font-semibold bg-muted/40">Revenue by board</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left"><th className="p-2">Board</th><th className="p-2 text-right">Revenue</th></tr></thead>
                <tbody>
                  {byBoard.length === 0 ? (
                    <tr><td colSpan={2} className="p-4 text-center text-muted-foreground">No board-level attribution yet.</td></tr>
                  ) : byBoard.slice(0, 20).map((r: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.board_name || r.board_id}</td>
                      <td className="p-2 text-right">${Number(r.revenue || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}