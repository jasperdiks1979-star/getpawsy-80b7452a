import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Brain, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Strategy = { dimension: string; key: string; score: number; samples: number };
type Metric = {
  decision_id: string;
  impressions: number;
  clicks: number;
  saves: number;
  ctr: number;
  reward: number;
  pin_count: number;
  snapshot_day: string;
};

export function GrowthLearningPanel() {
  const { toast } = useToast();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<"snap" | "learn" | null>(null);

  async function load() {
    setLoading(true);
    const [s, m] = await Promise.all([
      supabase
        .from("growth_strategy_scores")
        .select("dimension, key, score, samples")
        .order("score", { ascending: false })
        .limit(60),
      supabase
        .from("growth_decision_metrics")
        .select("decision_id, impressions, clicks, saves, ctr, reward, pin_count, snapshot_day")
        .order("snapshot_day", { ascending: false })
        .limit(20),
    ]);
    if (s.data) setStrategies(s.data as unknown as Strategy[]);
    if (m.data) setMetrics(m.data as unknown as Metric[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function run(fn: "growth-perf-snapshot" | "growth-learning-loop") {
    setRunning(fn === "growth-perf-snapshot" ? "snap" : "learn");
    const { data, error } = await supabase.functions.invoke(fn, { body: {} });
    setRunning(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    const r = data as { ok: boolean; message?: string };
    toast({ title: r.ok ? "Done" : "Issue", description: r.message ?? "", variant: r.ok ? "default" : "destructive" });
    load();
  }

  if (loading) {
    return <Card className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading learning data…</Card>;
  }

  const byDim = new Map<string, Strategy[]>();
  for (const s of strategies) {
    const arr = byDim.get(s.dimension) ?? [];
    arr.push(s);
    byDim.set(s.dimension, arr);
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5" /> Learning loop
            </h2>
            <p className="text-sm text-muted-foreground">
              EWMA-weighted reward per strategy. Higher = better real US performance.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => run("growth-perf-snapshot")} disabled={running !== null}>
              {running === "snap" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
              Snapshot performance
            </Button>
            <Button size="sm" onClick={() => run("growth-learning-loop")} disabled={running !== null}>
              {running === "learn" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              Run learning loop
            </Button>
          </div>
        </div>

        {byDim.size === 0 ? (
          <p className="text-sm text-muted-foreground">No strategy scores yet. Run snapshot + learning after pins have data.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from(byDim.entries()).map(([dim, items]) => {
              const sorted = [...items].sort((a, b) => Number(b.score) - Number(a.score));
              const top = sorted.slice(0, 5);
              const bottom = sorted.slice(-3).reverse();
              return (
                <div key={dim} className="border rounded p-3">
                  <div className="font-medium text-sm uppercase tracking-wide text-muted-foreground mb-2">{dim}</div>
                  <div className="space-y-1">
                    {top.map((s) => (
                      <div key={s.key} className="flex items-center justify-between text-sm">
                        <span className="truncate flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                          {s.key}
                        </span>
                        <Badge variant="outline">{Number(s.score).toFixed(2)} · n={s.samples}</Badge>
                      </div>
                    ))}
                    {bottom.length > 0 && top.length >= 5 && (
                      <>
                        <div className="h-px bg-border my-2" />
                        {bottom.map((s) => (
                          <div key={s.key} className="flex items-center justify-between text-sm">
                            <span className="truncate flex items-center gap-1">
                              <TrendingDown className="h-3 w-3 text-destructive" />
                              {s.key}
                            </span>
                            <Badge variant="outline">{Number(s.score).toFixed(2)} · n={s.samples}</Badge>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-3">Recent performance snapshots</h3>
        {metrics.length === 0 ? (
          <p className="text-sm text-muted-foreground">No snapshots yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Day</th>
                  <th className="py-2 pr-3">Pins</th>
                  <th className="py-2 pr-3">Impr</th>
                  <th className="py-2 pr-3">Clicks</th>
                  <th className="py-2 pr-3">Saves</th>
                  <th className="py-2 pr-3">CTR</th>
                  <th className="py-2">Reward</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.decision_id + m.snapshot_day} className="border-t">
                    <td className="py-2 pr-3">{m.snapshot_day}</td>
                    <td className="py-2 pr-3">{m.pin_count}</td>
                    <td className="py-2 pr-3">{m.impressions}</td>
                    <td className="py-2 pr-3">{m.clicks}</td>
                    <td className="py-2 pr-3">{m.saves}</td>
                    <td className="py-2 pr-3">{(Number(m.ctr) * 100).toFixed(2)}%</td>
                    <td className="py-2 font-medium">{Number(m.reward).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}