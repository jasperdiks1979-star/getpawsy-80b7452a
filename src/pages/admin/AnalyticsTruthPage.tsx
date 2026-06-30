import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, Info } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

type Snapshot = {
  id?: string;
  captured_at?: string;
  window_hours: number;
  trust_score: number;
  human_pct: number;
  bot_pct: number;
  pinterest_attribution_pct: number | null;
  direct_pct: number | null;
  total_events: number;
  total_sessions: number;
  human_sessions: number;
  bot_sessions: number;
  duplicate_events: number;
  missing_funnel_events: number;
  broken_funnels: number;
  top_sources: Array<{ source: string; count: number; share_pct: number }>;
  metric_explanations: Record<string, string>;
  issues: Array<{ code: string; severity: string; detail: string }>;
  repairs: Array<{ code: string; affected: number; detail: string }>;
};

function scoreColor(score: number) {
  if (score >= 85) return "text-emerald-600";
  if (score >= 65) return "text-amber-600";
  return "text-rose-600";
}

function Metric({ label, value, why }: { label: string; value: React.ReactNode; why?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {why && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground/70" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{why}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default function AnalyticsTruthPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(24);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("analytics_truth_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(20);
    setHistory((data as any) ?? []);
    if (data && data[0] && !snap) setSnap(data[0] as any);
  };

  useEffect(() => { loadHistory(); }, []);

  const run = async (persist: boolean) => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("analytics-truth-engine", {
        body: { hours, dryRun: !persist },
      });
      if (error) throw error;
      setSnap((data as any)?.snapshot ?? null);
      if (persist) await loadHistory();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            Analytics Truth — Genesis V5.4
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            One Data Trust Score for the entire pipeline. Reuses canonical_events, traffic classification and session quality — no duplicate analytics engines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1 text-sm bg-background"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={6}>Last 6h</option>
            <option value={24}>Last 24h</option>
            <option value={72}>Last 3d</option>
            <option value={168}>Last 7d</option>
          </select>
          <Button variant="outline" onClick={() => run(false)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Simulate
          </Button>
          <Button onClick={() => run(true)} disabled={loading}>
            Run &amp; persist
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-900 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {snap && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Data Trust Score</span>
                {snap.captured_at && (
                  <span className="text-xs text-muted-foreground font-normal">
                    {new Date(snap.captured_at).toLocaleString()} · {snap.window_hours}h window
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-4">
                <div className={`text-6xl font-bold tabular-nums ${scoreColor(snap.trust_score)}`}>
                  {snap.trust_score}
                </div>
                <div className="text-sm text-muted-foreground max-w-xl">
                  {snap.metric_explanations?.trust_score ?? "Score breakdown unavailable."}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
                <Metric label="Human %" value={`${snap.human_pct}%`} why={snap.metric_explanations.human_pct} />
                <Metric label="Bot %" value={`${snap.bot_pct}%`} why={snap.metric_explanations.bot_pct} />
                <Metric label="Pinterest attribution" value={`${snap.pinterest_attribution_pct ?? 0}%`} why={snap.metric_explanations.pinterest_attribution_pct} />
                <Metric label="Direct share" value={`${snap.direct_pct ?? 0}%`} why={snap.metric_explanations.direct_pct} />
                <Metric label="Events" value={snap.total_events} />
                <Metric label="Sessions" value={snap.total_sessions} />
                <Metric label="Duplicate events" value={snap.duplicate_events} why={snap.metric_explanations.duplicate_events} />
                <Metric label="Broken funnels" value={snap.broken_funnels} why={snap.metric_explanations.broken_funnels} />
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Top traffic sources</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {snap.top_sources.length === 0 && <p className="text-sm text-muted-foreground">No events in window.</p>}
                {snap.top_sources.map((s) => (
                  <div key={s.source} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.source}</span>
                    <span className="tabular-nums text-muted-foreground">{s.count} · {s.share_pct}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Issues &amp; repairs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {snap.issues.length === 0 && <p className="text-sm text-muted-foreground">No issues detected.</p>}
                {snap.issues.map((i) => (
                  <div key={i.code} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={i.severity === "critical" ? "destructive" : i.severity === "warn" ? "secondary" : "outline"}>
                        {i.severity}
                      </Badge>
                      <span className="font-medium">{i.code}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{i.detail}</p>
                  </div>
                ))}
                {snap.repairs.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-xs uppercase text-emerald-700 mb-1">Auto repairs</div>
                    {snap.repairs.map((r) => (
                      <div key={r.code} className="text-sm">
                        <span className="font-medium">{r.code}</span> · {r.affected} rows — {r.detail}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Recent snapshots</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">Captured</th>
                      <th className="py-1 pr-3">Window</th>
                      <th className="py-1 pr-3">Trust</th>
                      <th className="py-1 pr-3">Human %</th>
                      <th className="py-1 pr-3">Bot %</th>
                      <th className="py-1 pr-3">Pinterest %</th>
                      <th className="py-1 pr-3">Events</th>
                      <th className="py-1 pr-3">Broken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-t">
                        <td className="py-1 pr-3 whitespace-nowrap">{h.captured_at ? new Date(h.captured_at).toLocaleString() : "—"}</td>
                        <td className="py-1 pr-3">{h.window_hours}h</td>
                        <td className={`py-1 pr-3 font-semibold ${scoreColor(h.trust_score)}`}>{h.trust_score}</td>
                        <td className="py-1 pr-3">{h.human_pct}%</td>
                        <td className="py-1 pr-3">{h.bot_pct}%</td>
                        <td className="py-1 pr-3">{h.pinterest_attribution_pct ?? 0}%</td>
                        <td className="py-1 pr-3">{h.total_events}</td>
                        <td className="py-1 pr-3">{h.broken_funnels}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}