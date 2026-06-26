import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ClassRow = { functional_class: string; n: number };
type RunRow = { id: string; run_type: string; status: string; totals: any; started_at: string; finished_at: string | null };
type Attrib = { feature_group: string; feature_value: string; lift_pct: number; sample_size: number; confidence: number; reliability: string };
type Insight = { id: string; kind: string; headline: string; detail: string | null; confidence: number; sample_size: number; reliability: string; created_at: string };

export default function PinterestCreativeIntelV2Page() {
  const [coverage, setCoverage] = useState<{ classified: number; total: number }>({ classified: 0, total: 0 });
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [winners, setWinners] = useState<Attrib[]>([]);
  const [losers, setLosers] = useState<Attrib[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [learnRuns, setLearnRuns] = useState<RunRow[]>([]);
  const [learnBusy, setLearnBusy] = useState(false);
  const [perfCount, setPerfCount] = useState(0);

  async function load() {
    const sb = supabase as any;
    const [{ count: classified }, { count: total }, { data: rows }, { data: runRows }, { data: attrib }, { data: ins }, { data: lr }, { count: pc }] = await Promise.all([
      sb.from("pcie2_product_understanding").select("*", { count: "exact", head: true }),
      sb.from("products").select("*", { count: "exact", head: true }).eq("status", "active"),
      sb.from("pcie2_product_understanding").select("functional_class"),
      sb.from("pcie2_runs").select("*").order("started_at", { ascending: false }).limit(10),
      sb.from("pcie2_feature_attribution").select("feature_group,feature_value,lift_pct,sample_size,confidence,reliability").eq("window_days", 30),
      sb.from("pcie2_insights").select("*").order("created_at", { ascending: false }).limit(20),
      sb.from("pcie2_learning_runs").select("*").order("started_at", { ascending: false }).limit(10),
      sb.from("pcie2_pin_performance").select("*", { count: "exact", head: true }),
    ]);
    setCoverage({ classified: classified ?? 0, total: total ?? 0 });
    const tally = new Map<string, number>();
    (rows ?? []).forEach((r: any) => tally.set(r.functional_class, (tally.get(r.functional_class) ?? 0) + 1));
    setClasses([...tally.entries()].map(([functional_class, n]) => ({ functional_class, n })).sort((a, b) => b.n - a.n));
    setRuns((runRows as any) ?? []);
    const reliable = ((attrib as any[]) ?? []).filter(a => a.reliability !== 'insufficient');
    setWinners([...reliable].sort((a, b) => b.lift_pct - a.lift_pct).slice(0, 8));
    setLosers([...reliable].sort((a, b) => a.lift_pct - b.lift_pct).slice(0, 8));
    setInsights((ins as any) ?? []);
    setLearnRuns((lr as any) ?? []);
    setPerfCount(pc ?? 0);
  }

  useEffect(() => { load(); }, []);

  async function runClassifier() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pcie2-product-classifier", {
        body: { limit: 100, useAI: true, onlyMissing: true },
      });
      if (error) throw error;
      toast.success(`Classified ${data?.totals?.processed ?? 0} products`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Classifier failed");
    } finally {
      setBusy(false);
    }
  }

  async function runLearning() {
    setLearnBusy(true);
    try {
      const sync = await supabase.functions.invoke("pcie2-performance-sync", { body: {} });
      if (sync.error) throw sync.error;
      const learn = await supabase.functions.invoke("pcie2-learning-engine", { body: {} });
      if (learn.error) throw learn.error;
      toast.success(`Learning run complete (${(learn.data as any)?.rows ?? 0} snapshots)`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Learning run failed");
    } finally {
      setLearnBusy(false);
    }
  }

  const pct = coverage.total ? Math.round((coverage.classified / coverage.total) * 100) : 0;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Pinterest Creative Intelligence V2</h1>
        <p className="text-sm text-muted-foreground">Wave 1 — Creative Memory + Product Understanding. Publishing is gated by <code>pcie2_publish_enabled</code> (off).</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Product Classification Coverage</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-3xl font-semibold">{coverage.classified} / {coverage.total} <span className="text-base text-muted-foreground">({pct}%)</span></div>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <Badge key={c.functional_class} variant="secondary">{c.functional_class}: {c.n}</Badge>
            ))}
          </div>
          <Button onClick={runClassifier} disabled={busy}>{busy ? "Classifying…" : "Run Classifier (batch 100)"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {runs.length === 0 && <div className="text-muted-foreground">No runs yet.</div>}
            {runs.map((r) => (
              <div key={r.id} className="flex justify-between border-b pb-1">
                <span>{r.run_type} · {r.status}</span>
                <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                <span>{JSON.stringify(r.totals)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wave 1.5 — Performance Learning Layer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {perfCount} pin-performance snapshots indexed. Nightly cron retrains feature attribution and writes confidence-scored insights.
            </div>
            <Button onClick={runLearning} disabled={learnBusy}>{learnBusy ? "Running…" : "Run Sync + Learn now"}</Button>
          </div>

          {insights.length === 0 ? (
            <div className="text-sm text-muted-foreground">Insufficient evidence — no insights yet. Run a learning cycle once pins have performance data.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {insights.slice(0, 6).map(i => (
                <div key={i.id} className="flex items-start gap-2 border-b pb-1">
                  <Badge variant={i.kind === 'winner' ? 'default' : i.kind === 'loser' ? 'destructive' : 'secondary'}>{i.kind}</Badge>
                  <div className="flex-1">
                    <div>{i.headline}</div>
                    <div className="text-xs text-muted-foreground">conf {Math.round(i.confidence * 100)}% · n={i.sample_size} · {i.reliability}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium mb-1">Winning patterns</div>
              {winners.length === 0 && <div className="text-xs text-muted-foreground">Insufficient evidence.</div>}
              {winners.map((w, i) => (
                <div key={i} className="text-xs flex justify-between border-b py-1">
                  <span>{w.feature_group}: {w.feature_value}</span>
                  <span className="text-green-600">+{w.lift_pct}% · n={w.sample_size}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Weakest patterns</div>
              {losers.length === 0 && <div className="text-xs text-muted-foreground">Insufficient evidence.</div>}
              {losers.map((w, i) => (
                <div key={i} className="text-xs flex justify-between border-b py-1">
                  <span>{w.feature_group}: {w.feature_value}</span>
                  <span className="text-red-600">{w.lift_pct}% · n={w.sample_size}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Recent learning runs</div>
            {learnRuns.length === 0 && <div className="text-xs text-muted-foreground">No runs yet.</div>}
            {learnRuns.map(r => (
              <div key={r.id} className="text-xs flex justify-between border-b py-1">
                <span>{r.run_type} · {r.status}</span>
                <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                <span className="font-mono">{JSON.stringify(r.totals)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}