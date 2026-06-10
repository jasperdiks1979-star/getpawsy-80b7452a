import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, TrendingUp, MapPin, Target, RefreshCw, Play, AlertTriangle, ShieldCheck, Package, Image as ImageIcon, Lightbulb } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type Dash = {
  summary?: { usShare: number; totalPinterestVisitors30d: number; usVisitors30d: number };
  topProducts?: any[];
  topBoards?: any[];
  topKeywords?: any[];
  forecasts30d?: any[];
  usDaily?: any[];
  byState?: any[];
  byCity?: any[];
  trafficQuality?: { counts: Record<string, number>; pct: Record<string, number>; total: number };
  topProductsByConversion?: any[];
  topPins?: any[];
  alerts?: any[];
};

function fmtCents(c: number) { return `$${(Number(c || 0) / 100).toFixed(2)}`; }
function pct(n: number) { return `${(Number(n || 0) * 100).toFixed(1)}%`; }

export default function RevenueAiPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("pinterest-revenue-ai", { body: { action: "dashboard" } });
      if (error) throw error;
      setData(res);
      // Lazy-load opportunities (Phase 7) — not in dashboard payload
      supabase.functions.invoke("pinterest-revenue-ai", { body: { action: "opportunities", limit: 25 } })
        .then(({ data: r }) => setOpportunities((r as any)?.opportunities ?? []))
        .catch(() => { /* non-fatal */ });
    } catch (e: any) { setErr(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }

  async function runLoop() {
    setRunning(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("pinterest-revenue-ai", { body: { action: "loop" } });
      if (error) throw error;
      toast.success("Revenue AI loop complete", { description: JSON.stringify(res).slice(0, 200) });
      await load();
    } catch (e: any) { toast.error(e?.message || "Loop failed"); }
    finally { setRunning(false); }
  }

  useEffect(() => { load(); const t = setInterval(load, 60 * 60 * 1000); return () => clearInterval(t); }, []);

  const usShare = data?.summary?.usShare ?? 0;
  const usShareTarget = 0.8;
  const tq = data?.trafficQuality?.pct ?? {};
  const tqTotal = data?.trafficQuality?.total ?? 0;
  const humanPct = (tq.verified_user ?? 0) + (tq.probable_user ?? 0);

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Revenue AI — Pinterest Command Center</title></Helmet>

      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Pinterest Revenue AI
          </h1>
          <p className="text-sm text-muted-foreground">Autonomous learning, scoring, and forecasting. Auto-refresh every hour.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={runLoop} disabled={running}>
            <Play className="h-4 w-4 mr-2" /> {running ? "Running…" : "Run loop now"}
          </Button>
        </div>
      </header>

      {err && <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div>}

      {loading && !data ? (
        <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="traffic">Traffic Quality</TabsTrigger>
            <TabsTrigger value="products">Top Products</TabsTrigger>
            <TabsTrigger value="pins">Top Pins</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="alerts">
              Alerts {(data?.alerts?.length ?? 0) > 0 ? <span className="ml-1 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1.5">{data?.alerts?.length}</span> : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> US Share (30d)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{pct(usShare)}</div>
                <div className="text-xs text-muted-foreground mt-1">Target: {pct(usShareTarget)} · {usShare >= usShareTarget ? "✓ on target" : `gap: ${pct(usShareTarget - usShare)}`}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Pinterest Visitors (30d)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{data?.summary?.totalPinterestVisitors30d ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">{data?.summary?.usVisitors30d ?? 0} from US</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Forecasts (30d)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{fmtCents((data?.forecasts30d ?? []).reduce((s, f) => s + Number(f.expected_revenue_cents || 0), 0))}</div>
                <div className="text-xs text-muted-foreground mt-1">{data?.forecasts30d?.length ?? 0} entities forecasted</div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue overview (7d, qualified-only) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MiniStat label="Qualified visitors 7d" value={(data?.summary as any)?.qualifiedVisitors7d ?? 0} />
            <MiniStat label="Add to cart" value={(data?.summary as any)?.atc7d ?? 0} />
            <MiniStat label="Begin checkout" value={(data?.summary as any)?.checkout7d ?? 0} />
            <MiniStat label="Purchases" value={(data?.summary as any)?.purchases7d ?? 0} />
            <MiniStat label="Conv. rate" value={pct((data?.summary as any)?.conversionRate7d ?? 0)} />
          </div>

          {/* Top winners */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <RankCard title="Top Products" rows={data?.topProducts ?? []} />
            <RankCard title="Top Boards" rows={data?.topBoards ?? []} />
            <RankCard title="Top Keywords" rows={data?.topKeywords ?? []} />
          </div>

          {/* Geo breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GeoCard title="Revenue by US state" rows={data?.byState ?? []} keyField="state" />
            <GeoCard title="Revenue by US city" rows={data?.byCity ?? []} keyField="city" />
          </div>

          {/* Forecasts */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Top 30-day revenue forecasts</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b"><th className="p-2">Type</th><th className="p-2">Entity</th><th className="p-2 text-right">Exp. clicks</th><th className="p-2 text-right">Exp. conv.</th><th className="p-2 text-right">Exp. revenue</th><th className="p-2 text-right">Confidence</th></tr></thead>
                <tbody>
                  {(data?.forecasts30d ?? []).slice(0, 30).map((f, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 text-xs">{f.entity_type}</td>
                      <td className="p-2 text-xs font-mono truncate max-w-[200px]">{f.entity_key}</td>
                      <td className="p-2 text-right">{f.expected_clicks}</td>
                      <td className="p-2 text-right">{f.expected_conversions}</td>
                      <td className="p-2 text-right">{fmtCents(f.expected_revenue_cents)}</td>
                      <td className="p-2 text-right">{pct(f.confidence)}</td>
                    </tr>
                  ))}
                  {(!data?.forecasts30d || data.forecasts30d.length === 0) && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No forecasts yet — run the loop to bootstrap.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
          </TabsContent>

          <TabsContent value="traffic" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Traffic Quality (7d, lp_funnel_events)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-3">{tqTotal.toLocaleString()} sessions classified</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MiniStat label="Verified human" value={`${tq.verified_user ?? 0}%`} />
                  <MiniStat label="Probable human" value={`${tq.probable_user ?? 0}%`} />
                  <MiniStat label="Crawler" value={`${tq.crawler ?? 0}%`} />
                  <MiniStat label="Bot" value={`${tq.bot ?? 0}%`} />
                  <MiniStat label="Pre-render (Pinterest/FB)" value={`${tq.pre_render ?? 0}%`} />
                  <MiniStat label="Single bounce" value={`${tq.single_bounce ?? 0}%`} />
                </div>
                <div className="mt-4 text-xs text-muted-foreground">
                  Human share: <span className="font-semibold">{humanPct.toFixed(1)}%</span> · Conversion rate is computed against qualified visitors only.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Top Products (14d, qualified traffic only)</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2">Product</th><th className="p-2 text-right">Views</th><th className="p-2 text-right">ATC</th><th className="p-2 text-right">CO</th><th className="p-2 text-right">Pur</th><th className="p-2 text-right">ATC %</th><th className="p-2 text-right">Pur %</th><th className="p-2 text-right">Pin clicks</th><th className="p-2 text-right">Verdict</th></tr></thead>
                  <tbody>
                    {(data?.topProductsByConversion ?? []).map((p, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2 text-xs font-mono truncate max-w-[180px]">{p.product_id}</td>
                        <td className="p-2 text-right">{p.views}</td>
                        <td className="p-2 text-right">{p.atc}</td>
                        <td className="p-2 text-right">{p.checkout}</td>
                        <td className="p-2 text-right">{p.purchases}</td>
                        <td className="p-2 text-right">{p.atc_rate}%</td>
                        <td className="p-2 text-right">{p.purchase_rate}%</td>
                        <td className="p-2 text-right">{p.pinterest_clicks}</td>
                        <td className="p-2 text-right"><VerdictBadge v={p.verdict} /></td>
                      </tr>
                    ))}
                    {!data?.topProductsByConversion?.length && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No PDP stats yet — run loop or aggregate_pdp_stats.</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pins">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Top Pins</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2">Pin</th><th className="p-2 text-right">Impressions</th><th className="p-2 text-right">Clicks</th><th className="p-2 text-right">Saves</th><th className="p-2 text-right">Outbound</th><th className="p-2 text-right">Conv. score</th></tr></thead>
                  <tbody>
                    {(data?.topPins ?? []).map((p, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2 text-xs font-mono truncate max-w-[160px]">{p.pin_id}</td>
                        <td className="p-2 text-right">{p.impressions ?? 0}</td>
                        <td className="p-2 text-right">{p.clicks ?? 0}</td>
                        <td className="p-2 text-right">{p.saves ?? 0}</td>
                        <td className="p-2 text-right">{p.outbound_clicks ?? 0}</td>
                        <td className="p-2 text-right">{Math.round(Number(p.conversion_score ?? 0) * 100) / 100}</td>
                      </tr>
                    ))}
                    {!data?.topPins?.length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No pin performance data yet.</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="opportunities">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Pinterest Revenue Opportunities</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2">Product</th><th className="p-2 text-right">Pin clicks</th><th className="p-2 text-right">Views</th><th className="p-2 text-right">ATC %</th><th className="p-2 text-right">Pur %</th><th className="p-2 text-right">Score</th><th className="p-2">Recommendations</th></tr></thead>
                  <tbody>
                    {opportunities.map((o, i) => (
                      <tr key={i} className="border-b align-top">
                        <td className="p-2 text-xs font-mono truncate max-w-[180px]">{o.product_id}</td>
                        <td className="p-2 text-right">{o.pinterest_clicks}</td>
                        <td className="p-2 text-right">{o.views}</td>
                        <td className="p-2 text-right">{o.atc_rate}%</td>
                        <td className="p-2 text-right">{o.purchase_rate}%</td>
                        <td className="p-2 text-right font-semibold">{o.opportunity_score}</td>
                        <td className="p-2">
                          <ul className="text-xs list-disc ml-4 space-y-0.5">
                            {(o.recommendations ?? []).map((r: string, j: number) => <li key={j}>{r}</li>)}
                          </ul>
                        </td>
                      </tr>
                    ))}
                    {opportunities.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No opportunities surfaced yet.</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Active Alerts</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2">Severity</th><th className="p-2">Title</th><th className="p-2">Detected</th></tr></thead>
                  <tbody>
                    {(data?.alerts ?? []).map((a, i) => (
                      <tr key={i} className="border-b align-top">
                        <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${a.severity === "P1" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700"}`}>{a.severity}</span></td>
                        <td className="p-2">
                          <div className="font-medium">{a.title}</div>
                          <div className="text-xs text-muted-foreground">{a.description}</div>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{a.last_detected_at ? new Date(a.last_detected_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                    {!data?.alerts?.length && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No active alerts. ✓</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function VerdictBadge({ v }: { v: string }) {
  const cls = v === "pinterest_winner" || v === "winner" ? "bg-emerald-500/15 text-emerald-700"
    : v === "pinterest_loser" || v === "bounce" ? "bg-destructive/15 text-destructive"
    : v === "viewed_but_no_atc" ? "bg-amber-500/15 text-amber-700"
    : "bg-muted";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] ${cls}`}>{v}</span>;
}

function RankCard({ title, rows }: { title: string; rows: any[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-xs">
          <thead><tr className="border-b text-left"><th className="p-2">Key</th><th className="p-2 text-right">Score</th><th className="p-2 text-right">Rev</th><th className="p-2 text-right">Tier</th></tr></thead>
          <tbody>
            {rows.slice(0, 10).map((r, i) => (
              <tr key={i} className="border-b">
                <td className="p-2 font-mono truncate max-w-[140px]">{r.entity_key}</td>
                <td className="p-2 text-right">{Math.round(r.opportunity_score)}</td>
                <td className="p-2 text-right">{fmtCents(r.revenue_cents_30d)}</td>
                <td className="p-2 text-right">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.rank_tier === "winner" ? "bg-emerald-500/15 text-emerald-700" : r.rank_tier === "loser" ? "bg-destructive/15 text-destructive" : "bg-muted"}`}>{r.rank_tier}</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No data yet</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function GeoCard({ title, rows, keyField }: { title: string; rows: any[]; keyField: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="p-2">{keyField}</th><th className="p-2 text-right">Clicks</th><th className="p-2 text-right">Revenue</th></tr></thead>
          <tbody>
            {rows.slice(0, 15).map((r, i) => (
              <tr key={i} className="border-b">
                <td className="p-2">{r[keyField]}</td>
                <td className="p-2 text-right">{r.clicks}</td>
                <td className="p-2 text-right">{fmtCents(r.revenue)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No US data yet</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}