import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, RefreshCw, TrendingUp, TrendingDown, Trophy, Mic, Layers, Zap, Brain, FileText, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Dash = {
  ok: boolean;
  kpis7?: { clicks: number; atc: number; checkouts: number; purchases: number; revenue_cents: number };
  estimated_monthly_cents?: number;
  topPins?: any[];
  voiceRankings?: any[];
  categoryProfiles?: any[];
  revenueScores?: any[];
  trends?: any[];
  latestExecReport?: any;
  losers?: any[];
};

const cents = (c?: number) => `$${((Number(c ?? 0)) / 100).toFixed(2)}`;

const ACTION_FNS = [
  { id: "revenue-ai-orchestrator", label: "Run full loop", icon: Zap, variant: "default" as const },
  { id: "revenue-ai-perf-rollup", label: "Rollup pin performance", icon: RefreshCw },
  { id: "revenue-ai-winner-detect", label: "Detect winners", icon: Trophy },
  { id: "revenue-ai-winner-clone", label: "Clone winners", icon: Brain },
  { id: "revenue-ai-voice-allocator", label: "Re-rank voices", icon: Mic },
  { id: "revenue-ai-category-profile", label: "Refresh categories", icon: Layers },
  { id: "revenue-ai-trend-detect", label: "Detect trends", icon: TrendingUp },
  { id: "revenue-ai-revenue-score", label: "Recompute product scores", icon: RefreshCw },
  { id: "revenue-ai-loser-suppress", label: "Suppress losers", icon: ShieldAlert },
  { id: "revenue-ai-product-eliminator", label: "Eliminate products", icon: TrendingDown },
  { id: "revenue-ai-executive-report", label: "Build nightly report", icon: FileText },
];

export default function AutonomousRevenueAiPanel() {
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("revenue-ai-dashboard", { body: {} });
      if (error) throw error;
      setData(res as Dash);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load Autonomous Revenue AI");
    } finally {
      setLoading(false);
    }
  }

  async function run(fn: string) {
    setRunning(fn);
    try {
      const { data: res, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      toast.success(`${fn} complete`, { description: JSON.stringify(res).slice(0, 220) });
      await load();
    } catch (e: any) {
      toast.error(`${fn} failed`, { description: e?.message });
    } finally {
      setRunning(null);
    }
  }

  useEffect(() => { load(); }, []);

  const k = data?.kpis7;
  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Autonomous Revenue AI V1</h2>
          <p className="text-sm text-muted-foreground">Self-learning Pinterest engine. Optimizes for outbound clicks, ATC, checkout, purchases, and revenue.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Revenue 7d" value={cents(k?.revenue_cents)} />
        <Stat label="Purchases 7d" value={k?.purchases ?? 0} />
        <Stat label="Checkouts 7d" value={k?.checkouts ?? 0} />
        <Stat label="ATC 7d" value={k?.atc ?? 0} />
        <Stat label="Outbound clicks 7d" value={k?.clicks ?? 0} />
        <Stat label="Est. monthly" value={cents(data?.estimated_monthly_cents)} />
      </div>

      {/* Controls */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Engine controls</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ACTION_FNS.map(a => (
            <Button key={a.id} variant={a.variant ?? "secondary"} size="sm" disabled={running !== null} onClick={() => run(a.id)}>
              {running === a.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <a.icon className="h-3.5 w-3.5 mr-1.5" />}
              {a.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Voice rankings */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Mic className="h-4 w-4" /> Voice rankings</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="p-2">#</th><th className="p-2">Voice</th><th className="p-2 text-right">Pins</th><th className="p-2 text-right">Clicks</th><th className="p-2 text-right">Pur</th><th className="p-2 text-right">$/click</th><th className="p-2 text-right">Weight</th></tr></thead>
              <tbody>
                {(data?.voiceRankings ?? []).map((v: any) => (
                  <tr key={v.voice_id} className="border-b">
                    <td className="p-2">{v.ranking}</td>
                    <td className="p-2 font-mono text-xs">{v.voice_id}</td>
                    <td className="p-2 text-right">{v.n_pins}</td>
                    <td className="p-2 text-right">{v.outbound_clicks}</td>
                    <td className="p-2 text-right">{v.purchases}</td>
                    <td className="p-2 text-right">{cents(Math.round(Number(v.revenue_per_click) * 100))}</td>
                    <td className="p-2 text-right"><Badge variant={Number(v.allocation_weight) >= 1.5 ? "default" : Number(v.allocation_weight) <= 0.5 ? "destructive" : "secondary"}>{Number(v.allocation_weight).toFixed(2)}x</Badge></td>
                  </tr>
                ))}
                {!data?.voiceRankings?.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No voice data yet.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Top revenue products */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Trophy className="h-4 w-4" /> Top revenue products</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="p-2">Product</th><th className="p-2 text-right">Composite</th><th className="p-2">Tier</th><th className="p-2 text-right">×Publish</th></tr></thead>
              <tbody>
                {(data?.revenueScores ?? []).slice(0, 25).map((r: any) => (
                  <tr key={r.product_id} className="border-b">
                    <td className="p-2 font-mono text-xs truncate max-w-[200px]">{r.product_id}</td>
                    <td className="p-2 text-right">{Number(r.composite).toFixed(1)}</td>
                    <td className="p-2"><Badge variant={r.tier === "hero" ? "default" : r.tier === "tail" ? "destructive" : "secondary"}>{r.tier}</Badge></td>
                    <td className="p-2 text-right">{Number(r.publish_multiplier).toFixed(1)}x</td>
                  </tr>
                ))}
                {!data?.revenueScores?.length && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No scores yet. Run "Recompute product scores".</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Trends */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Category trends</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="p-2">Category</th><th className="p-2 text-right">7d Δ</th><th className="p-2">Direction</th><th className="p-2 text-right">Quota</th></tr></thead>
              <tbody>
                {(data?.trends ?? []).slice(0, 25).map((t: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{t.category}</td>
                    <td className="p-2 text-right">{(Number(t.pct_change_7d) * 100).toFixed(0)}%</td>
                    <td className="p-2"><Badge variant={t.direction === "rising" ? "default" : t.direction === "falling" ? "destructive" : "secondary"}>{t.direction}</Badge></td>
                    <td className="p-2 text-right">{Number(t.recommended_quota_multiplier).toFixed(2)}x</td>
                  </tr>
                ))}
                {!data?.trends?.length && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No trend data yet.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Losers */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Loser blocklist</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="p-2">Scope</th><th className="p-2">Key</th><th className="p-2">Reason</th><th className="p-2">Until</th></tr></thead>
              <tbody>
                {(data?.losers ?? []).slice(0, 25).map((l: any) => (
                  <tr key={l.id} className="border-b">
                    <td className="p-2">{l.scope}</td>
                    <td className="p-2 font-mono text-xs truncate max-w-[160px]">{l.key}</td>
                    <td className="p-2 text-xs text-muted-foreground">{l.reason}</td>
                    <td className="p-2 text-xs">{new Date(l.blocked_until).toLocaleDateString()}</td>
                  </tr>
                ))}
                {!data?.losers?.length && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No blocked patterns.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Executive report */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Latest executive report</CardTitle></CardHeader>
        <CardContent>
          {data?.latestExecReport ? (
            <>
              <div className="text-sm font-medium mb-1">{data.latestExecReport.headline_text}</div>
              <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-72 overflow-auto">{data.latestExecReport.full_markdown}</pre>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No report yet. Click "Build nightly report".</div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}