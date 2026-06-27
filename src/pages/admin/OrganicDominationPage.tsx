import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Run = { id: string; mode: string; status: string; counters: Record<string, number>; started_at: string; finished_at: string | null };
type Dna = { family_key: string; display_name: string; evidence_score: number; sample_count: number; status: string };
type Gap = { id: string; category_key: string; keyword: string | null; opportunity_score: number; demand_score: number; competition_score: number; recommended_dna: string | null };
type Rec = { id: string; subject_type: string; recommendation: string; why: string; confidence: number };
type Score = { pin_ref: string; product_id: string | null; quality_score: number; organic_confidence: number };

export default function OrganicDominationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [dna, setDna] = useState<Dna[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [r, d, g, rc, s] = await Promise.all([
      supabase.from("ode_runs").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("ode_visual_dna").select("family_key,display_name,evidence_score,sample_count,status").order("evidence_score", { ascending: false }),
      supabase.from("ode_market_gaps").select("id,category_key,keyword,opportunity_score,demand_score,competition_score,recommended_dna").eq("status", "open").order("opportunity_score", { ascending: false }).limit(25),
      supabase.from("ode_recommendations").select("id,subject_type,recommendation,why,confidence").eq("status", "open").order("confidence", { ascending: false }).limit(20),
      supabase.from("ode_pin_quality_scores").select("pin_ref,product_id,quality_score,organic_confidence").order("quality_score", { ascending: false }).limit(25),
    ]);
    setRuns((r.data as Run[]) ?? []);
    setDna((d.data as Dna[]) ?? []);
    setGaps((g.data as Gap[]) ?? []);
    setRecs((rc.data as Rec[]) ?? []);
    setScores((s.data as Score[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const run = async (action: string) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("organic-domination-engine", { body: { action } });
      if (error) throw error;
      toast.success(`${action} ok`, { description: JSON.stringify((data as { counters?: unknown })?.counters ?? data).slice(0, 200) });
      await load();
    } catch (e) {
      toast.error(`${action} failed`, { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const last = runs[0];

  return (
    <div className="p-4 space-y-4 max-w-6xl">
      <Helmet><title>ODE — Organic Domination Engine</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <header>
        <h1 className="text-2xl font-semibold">Phase 13 — Organic Domination Engine</h1>
        <p className="text-sm text-muted-foreground">
          Continuous organic learning. Distills public Pinterest signals + verified organic evidence into Visual DNA,
          market gaps, pin quality scores, and causal recommendations. Paid signals are excluded by design.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!!busy} onClick={() => run("full")}>Run full cycle</Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("harvest")}>Harvest</Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("dna")}>Distill DNA</Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("gaps")}>Detect gaps</Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("score")}>Score pins</Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("evolve")}>Evolve</Button>
      </div>

      {last && (
        <Card>
          <CardHeader><CardTitle>Last run · {new Date(last.started_at).toLocaleString()} · {last.mode}</CardTitle></CardHeader>
          <CardContent className="text-sm flex flex-wrap gap-2">
            <Badge variant={last.status === "ok" ? "default" : "destructive"}>{last.status}</Badge>
            {Object.entries(last.counters ?? {}).map(([k, v]) => (
              <Badge key={k} variant="outline">{k}: {String(v)}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Visual DNA families</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {dna.length === 0 && <div className="text-muted-foreground">No DNA yet — run full cycle.</div>}
            {dna.map((f) => (
              <div key={f.family_key} className="flex justify-between border-b py-1">
                <span><Badge variant={f.status === "active" ? "default" : "secondary"} className="mr-2">{f.status}</Badge>{f.display_name}</span>
                <span className="text-muted-foreground">ev {Number(f.evidence_score).toFixed(0)} · n={f.sample_count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top market gaps</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {gaps.length === 0 && <div className="text-muted-foreground">No gaps yet.</div>}
            {gaps.map((g) => (
              <div key={g.id} className="flex justify-between border-b py-1">
                <span>{g.keyword ?? g.category_key} <span className="text-xs text-muted-foreground">({g.recommended_dna})</span></span>
                <span className="text-muted-foreground">opp {Math.round(Number(g.opportunity_score))} · dem {Math.round(Number(g.demand_score))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Top pin quality scores (organic-only)</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          {scores.length === 0 && <div className="text-muted-foreground">No scores yet.</div>}
          {scores.map((s) => (
            <div key={s.pin_ref} className="flex justify-between border-b py-1">
              <span className="truncate max-w-[60%]">{s.pin_ref}</span>
              <span className="text-muted-foreground">qs {Math.round(Number(s.quality_score))} · oc {Math.round(Number(s.organic_confidence))}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Causal recommendations</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {recs.length === 0 && <div className="text-muted-foreground">No recommendations yet.</div>}
          {recs.map((r) => (
            <div key={r.id} className="border rounded p-2">
              <div className="font-medium">{r.recommendation} <Badge variant="outline" className="ml-2">conf {Math.round(Number(r.confidence))}</Badge></div>
              <div className="text-xs text-muted-foreground">Why: {r.why}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}