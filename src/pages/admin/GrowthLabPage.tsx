import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Experiment = {
  id: string;
  name: string;
  hypothesis: string;
  category: string;
  status: string;
  outcome: string | null;
  winner: string | null;
  expected_revenue_cents: number;
  confidence_target: number;
  created_at: string;
};

type Knowledge = {
  id: string;
  pattern_key: string;
  pattern_type: string;
  verdict: string;
  confidence: number;
  revenue_delta_cents: number;
  lessons: string | null;
  created_at: string;
};

export default function GrowthLabPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: exp }, { data: kno }] = await Promise.all([
      supabase.from("growth_lab_experiments").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("growth_lab_knowledge").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setExperiments((exp ?? []) as Experiment[]);
    setKnowledge((kno ?? []) as Knowledge[]);
    const { data: s } = await supabase.functions.invoke("growth-lab-orchestrator", { body: { action: "summary" } });
    setSummary(s);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: "discover" | "analyse" | "run_full") => {
    setRunning(action);
    const { data, error } = await supabase.functions.invoke("growth-lab-orchestrator", { body: { action } });
    setRunning(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${action} complete`);
    console.log("growth-lab:", data);
    await load();
  };

  const total = experiments.length;
  const completed = experiments.filter((e) => e.status === "completed").length;
  const provenRate = summary?.provenRate ?? 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Growth Lab</h1>
          <p className="text-muted-foreground">Every recommendation becomes PROVEN or REJECTED.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => run("discover")} disabled={running !== null}>
            {running === "discover" ? "Discovering…" : "Discover experiments"}
          </Button>
          <Button variant="outline" onClick={() => run("analyse")} disabled={running !== null}>
            {running === "analyse" ? "Analysing…" : "Analyse results"}
          </Button>
          <Button onClick={() => run("run_full")} disabled={running !== null}>
            {running === "run_full" ? "Running…" : "Run full cycle"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle>Experiments</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{total}</CardContent></Card>
        <Card><CardHeader><CardTitle>Completed</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{completed}</CardContent></Card>
        <Card><CardHeader><CardTitle>Proven rate</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{(provenRate * 100).toFixed(1)}%</CardContent></Card>
        <Card><CardHeader><CardTitle>Revenue gain</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">€{(((summary?.revenueGainCents ?? 0) as number) / 100).toFixed(2)}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Active & recent experiments</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {experiments.length === 0 && <div className="text-sm text-muted-foreground">No experiments yet — click “Discover experiments”.</div>}
          {experiments.map((e) => (
            <div key={e.id} className="border rounded p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={e.outcome === "proven" ? "default" : "secondary"}>{e.status}</Badge>
                  {e.winner && <Badge variant="outline">Winner: {e.winner}</Badge>}
                  <span className="font-medium truncate">{e.name}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{e.hypothesis}</p>
              </div>
              <div className="text-xs text-muted-foreground text-right shrink-0">
                <div>{e.category}</div>
                <div>≥{(e.confidence_target * 100).toFixed(0)}% conf</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Knowledge base</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {knowledge.length === 0 && <div className="text-sm text-muted-foreground">No proven patterns yet.</div>}
          {knowledge.map((k) => (
            <div key={k.id} className="border rounded p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={k.verdict === "winner" ? "default" : "destructive"}>{k.verdict}</Badge>
                  <span className="font-medium truncate">{k.pattern_key}</span>
                </div>
                <p className="text-sm text-muted-foreground">{k.lessons}</p>
              </div>
              <div className="text-xs text-muted-foreground text-right shrink-0">
                <div>{(k.confidence * 100).toFixed(1)}% conf</div>
                <div>Δ €{(k.revenue_delta_cents / 100).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}