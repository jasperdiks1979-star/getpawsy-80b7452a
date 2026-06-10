import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, TrendingUp, MapPin, Target, RefreshCw, Play } from "lucide-react";
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
};

function fmtCents(c: number) { return `$${(Number(c || 0) / 100).toFixed(2)}`; }
function pct(n: number) { return `${(Number(n || 0) * 100).toFixed(1)}%`; }

export default function RevenueAiPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("pinterest-revenue-ai", { body: { action: "dashboard" } });
      if (error) throw error;
      setData(res);
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
        <>
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
        </>
      )}
    </div>
  );
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