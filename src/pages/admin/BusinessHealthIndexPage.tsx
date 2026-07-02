import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity, TrendingUp, TrendingDown, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Sub = {
  subscore_key: string; category: string; label: string; score: number; weight: number;
  confidence: number; evidence: Record<string, unknown>; note: string;
};
type Priority = { key: string; label: string; category: string; score: number; confidence: number; weight: number; gap_points: number; revenue_impact_est: number; note: string };
type Snapshot = {
  id: string; captured_at: string; overall_score: number; confidence: number;
  status: string; trend: number | null; yesterday_score: number | null;
  simulation: any; priorities: Priority[]; executive_summary: any; sha256: string | null;
};
type Briefing = {
  briefing_date: string; overall_score: number; yesterday_score: number | null; trend: number | null;
  top_opportunity: string | null; top_threat: string | null;
  top_revenue_leak: string | null; top_revenue_opportunity: string | null; highest_roi: string | null;
  critical_alerts: any[]; expected_revenue_today: number | null; expected_profit_today: number | null; confidence: number | null;
};

function statusFor(score: number) {
  if (score >= 85) return { label: "🟢 EXCELLENT", cls: "bg-emerald-600" };
  if (score >= 70) return { label: "🟢 HEALTHY", cls: "bg-emerald-500" };
  if (score >= 50) return { label: "🟡 WATCH", cls: "bg-amber-500" };
  if (score >= 30) return { label: "🔴 CRITICAL", cls: "bg-red-600" };
  return { label: "🚨 EMERGENCY", cls: "bg-red-800" };
}
function scoreColor(n: number) {
  if (n >= 80) return "text-emerald-600";
  if (n >= 60) return "text-emerald-500";
  if (n >= 40) return "text-amber-600";
  return "text-red-600";
}

export default function BusinessHealthIndexPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [range, setRange] = useState<"7"|"30"|"90"|"365">("30");
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: snap } = await supabase
      .from("bhi_snapshots").select("*")
      .order("captured_at", { ascending: false }).limit(1).maybeSingle();
    if (snap) {
      setSnapshot(snap as unknown as Snapshot);
      const { data: subRows } = await supabase
        .from("bhi_subscores").select("*")
        .eq("snapshot_id", (snap as { id: string }).id);
      setSubs((subRows ?? []) as Sub[]);
    }
    const days = Number(range);
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    const { data: hist } = await supabase
      .from("bhi_snapshots").select("id,captured_at,overall_score,confidence,status,trend,yesterday_score,simulation,priorities,executive_summary,sha256")
      .gte("captured_at", since)
      .order("captured_at", { ascending: true });
    setHistory((hist ?? []) as unknown as Snapshot[]);
    const today = new Date().toISOString().slice(0, 10);
    const { data: b } = await supabase
      .from("bhi_briefings").select("*").eq("briefing_date", today).maybeSingle();
    setBriefing((b ?? null) as Briefing | null);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const compute = useCallback(async () => {
    setComputing(true);
    const { error } = await supabase.functions.invoke("bhi-compute", { body: {} });
    if (error) toast.error(`BHI compute failed: ${error.message}`);
    else { toast.success("Business Health Index recomputed"); await load(); }
    setComputing(false);
  }, [load]);

  const grouped = useMemo(() => {
    const g: Record<string, Sub[]> = {};
    for (const s of subs) (g[s.category] ??= []).push(s);
    return g;
  }, [subs]);

  const overall = snapshot?.overall_score ?? 0;
  const status = statusFor(overall);
  const trend = snapshot?.trend;
  const criticalAlerts = (briefing?.critical_alerts ?? []) as any[];

  return (
    <div className="container py-6 space-y-6">
      <Helmet>
        <title>Business Health Index — GENESIS Ω</title>
        <meta name="description" content="Single executive KPI for GetPawsy business health, evidence-based and continuously updated." />
      </Helmet>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="w-6 h-6" /> Business Health Index</h1>
          <p className="text-sm text-muted-foreground">GENESIS Ω · Single executive KPI · evidence-based · never fabricated</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={compute} disabled={computing}>
            <Sparkles className="w-4 h-4 mr-2" />{computing ? "Computing…" : "Recompute BHI"}
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </div>

      {/* Hero score */}
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <div className="text-sm uppercase tracking-widest text-muted-foreground">Business Health Index</div>
          <div className={`text-7xl font-black ${scoreColor(overall)}`}>{overall.toFixed(1)}<span className="text-3xl text-muted-foreground"> / 100</span></div>
          <div className="flex items-center justify-center gap-3">
            <Badge className={status.cls}>{status.label}</Badge>
            {trend != null && (
              <Badge variant="outline" className={trend >= 0 ? "text-emerald-600" : "text-red-600"}>
                {trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1 inline" /> : <TrendingDown className="w-3 h-3 mr-1 inline" />}
                {trend >= 0 ? "+" : ""}{trend} vs prior
              </Badge>
            )}
            {snapshot && (
              <span className="text-xs text-muted-foreground">Confidence {snapshot.confidence.toFixed(0)}% · {new Date(snapshot.captured_at).toLocaleString()}</span>
            )}
          </div>
          {snapshot?.sha256 && (
            <div className="text-[10px] text-muted-foreground font-mono">sha256:{snapshot.sha256.slice(0, 16)}…</div>
          )}
        </CardContent>
      </Card>

      {/* Executive briefing */}
      {briefing && (
        <Card>
          <CardHeader><CardTitle>Good morning, Jasper</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Top opportunity:</span> {briefing.top_opportunity ?? "—"}</div>
            <div><span className="text-muted-foreground">Top threat:</span> {briefing.top_threat ?? "—"}</div>
            <div><span className="text-muted-foreground">Biggest revenue leak:</span> {briefing.top_revenue_leak ?? "—"}</div>
            <div><span className="text-muted-foreground">Biggest revenue opportunity:</span> {briefing.top_revenue_opportunity ?? "—"}</div>
            <div><span className="text-muted-foreground">Highest ROI:</span> {briefing.highest_roi ?? "—"}</div>
            <div><span className="text-muted-foreground">Confidence:</span> {briefing.confidence?.toFixed(0) ?? "—"}%</div>
            <div><span className="text-muted-foreground">Expected revenue today:</span> ${briefing.expected_revenue_today?.toFixed(2) ?? "—"}</div>
            <div><span className="text-muted-foreground">Expected profit today:</span> ${briefing.expected_profit_today?.toFixed(2) ?? "—"}</div>
          </CardContent>
        </Card>
      )}

      {/* Critical alerts */}
      {criticalAlerts.length > 0 && (
        <Card className="border-red-500">
          <CardHeader><CardTitle className="text-red-600 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Critical alerts ({criticalAlerts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {criticalAlerts.map((a) => (
              <div key={a.key} className="flex justify-between border-b pb-1">
                <div><strong>{a.label}</strong> <span className="text-muted-foreground">— {a.note}</span></div>
                <div className="text-red-600 font-bold">{a.score}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Sub-indices grouped */}
      <Card>
        <CardHeader><CardTitle>Executive Sub-Indices</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat}>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">{cat}</div>
              <div className="grid md:grid-cols-3 gap-2">
                {list.sort((a, b) => b.weight - a.weight).map((s) => (
                  <div key={s.subscore_key} className="border rounded p-3 space-y-1">
                    <div className="flex justify-between items-baseline">
                      <div className="font-medium text-sm">{s.label}</div>
                      <div className={`text-lg font-bold ${scoreColor(s.score)}`}>
                        {s.confidence === 0 ? <span className="text-muted-foreground text-xs">UNKNOWN</span> : s.score.toFixed(0)}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{s.note}</div>
                    <div className="text-[10px] text-muted-foreground">weight {s.weight} · confidence {s.confidence.toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Priorities */}
      {snapshot?.priorities && snapshot.priorities.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Auto-Prioritized Actions (by weighted gap)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {snapshot.priorities.slice(0, 10).map((p, i) => (
              <div key={p.key} className="flex justify-between border-b pb-2 text-sm">
                <div>
                  <div className="font-medium">{i + 1}. {p.label} <Badge variant="outline" className="ml-2 text-[10px]">{p.category}</Badge></div>
                  <div className="text-xs text-muted-foreground">{p.note}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${scoreColor(p.score)}`}>{p.score}</div>
                  <div className="text-[11px] text-muted-foreground">+{p.gap_points} pts · ~${p.revenue_impact_est}/day</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Simulation */}
      {snapshot?.simulation?.scenarios && (
        <Card>
          <CardHeader><CardTitle>Company Simulation</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3 text-sm">
            {snapshot.simulation.scenarios.map((s: any) => (
              <div key={s.name} className="border rounded p-3">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">Revenue ×{s.multiplier_on_revenue}</div>
                <div className="text-xs">Expected BHI lift: +{s.expected_lift_bhi.toFixed(1)}</div>
                {s.profit_lift_usd_30d != null && (<div className="text-xs">Profit lift ~${s.profit_lift_usd_30d}/30d</div>)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Business Timeline</CardTitle>
            <div className="flex gap-1">
              {(["7","30","90","365"] as const).map((r) => (
                <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>{r}d</Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No snapshots yet in this range. Click Recompute to seed.</div>
          ) : (
            <div className="space-y-1 text-xs max-h-64 overflow-y-auto font-mono">
              {history.slice().reverse().map((h) => (
                <div key={h.id} className="flex justify-between border-b py-1">
                  <span>{new Date(h.captured_at).toLocaleString()}</span>
                  <span className={scoreColor(h.overall_score)}>{h.overall_score.toFixed(1)}</span>
                  <span className="text-muted-foreground">{h.status}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}