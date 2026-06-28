import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GAEE } from "@/lib/gaee/client";

type Row = Record<string, any>;

export default function EvolutionEnginePage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [runs, setRuns] = useState<Row[]>([]);
  const [proposals, setProposals] = useState<Row[]>([]);
  const [sims, setSims] = useState<Row[]>([]);
  const [rollouts, setRollouts] = useState<Row[]>([]);
  const [reflections, setReflections] = useState<Row[]>([]);
  const [threats, setThreats] = useState<Row[]>([]);
  const [scorecards, setScorecards] = useState<Row[]>([]);
  const [observations, setObservations] = useState<Row[]>([]);
  const [status, setStatus] = useState<any>(null);

  const refresh = async () => {
    const [r, p, s, ro, rf, t, sc, ob] = await Promise.all([
      supabase.from("gaee_runs").select("*").order("started_at", { ascending: false }).limit(20),
      supabase.from("gaee_proposals").select("*").order("evolution_score", { ascending: false }).limit(100),
      supabase.from("gaee_simulations").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("gaee_rollouts").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("gaee_reflections").select("*").order("created_at", { ascending: false }).limit(12),
      supabase.from("gaee_competitive_threats").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("gaee_scorecards").select("*").order("period", { ascending: false }).limit(12),
      supabase.from("gaee_observations").select("*").order("observed_at", { ascending: false }).limit(50),
    ]);
    setRuns(r.data ?? []);
    setProposals(p.data ?? []);
    setSims(s.data ?? []);
    setRollouts(ro.data ?? []);
    setReflections(rf.data ?? []);
    setThreats(t.data ?? []);
    setScorecards(sc.data ?? []);
    setObservations(ob.data ?? []);
    try { setStatus(await GAEE.status()); } catch { /* noop */ }
  };

  useEffect(() => { refresh(); }, []);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    try { const out = await fn(); toast.success(`${label} ok`); console.log(label, out); await refresh(); }
    catch (e: any) { toast.error(`${label} failed: ${e.message ?? e}`); }
    finally { setBusy(null); }
  };

  const decide = async (id: string, approve: boolean) => {
    await run(approve ? "approve" : "reject", () => approve ? GAEE.approve(id) : GAEE.reject(id));
  };

  const latest = scorecards[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Autonomous Evolution Engine</h1>
          <p className="text-sm text-muted-foreground">Observe → Reason → Propose → Simulate → Approve → Roll out → Learn → Update Genesis.</p>
        </div>
        <div className="flex gap-2">
          <Button disabled={!!busy} onClick={() => run("cycle", () => GAEE.runCycle("manual"))}>Run cycle</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => run("reflect", () => GAEE.reflect())}>Monthly reflection</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => run("scorecard", () => GAEE.scorecard())}>Refresh scorecard</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          ["Open proposals", status?.open_proposals ?? proposals.filter(p => p.status === "proposed").length],
          ["Approved", proposals.filter(p => p.status === "approved").length],
          ["Rollouts", rollouts.length],
          ["Threats open", threats.filter(t => t.status === "open").length],
          ["Overall score", latest?.overall ?? "—"],
          ["Last run", status?.last_run?.status ?? "—"],
        ].map(([k, v]) => (
          <Card key={k as string}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="text-xl font-semibold">{String(v)}</div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="proposals">
        <TabsList className="flex-wrap">
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
          <TabsTrigger value="simulations">Simulations</TabsTrigger>
          <TabsTrigger value="rollouts">Rollouts</TabsTrigger>
          <TabsTrigger value="observations">Observations</TabsTrigger>
          <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
          <TabsTrigger value="reflections">Reflections</TabsTrigger>
          <TabsTrigger value="threats">Competitive</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="proposals">
          <Card><CardHeader><CardTitle>Ranked proposals</CardTitle></CardHeader><CardContent>
            <div className="space-y-3">
              {proposals.map((p) => (
                <div key={p.id} className="border rounded p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{p.title}</div>
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline">{p.domain}</Badge>
                      <Badge>{p.change_type}</Badge>
                      <Badge variant="secondary">score {p.evolution_score}</Badge>
                      <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "outline"}>{p.status}</Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{p.rationale}</div>
                  <div className="text-xs grid grid-cols-2 md:grid-cols-4 gap-2 text-muted-foreground">
                    <span>ROI {p.expected_roi}</span><span>Risk {p.risk}</span>
                    <span>Conf {p.confidence}</span><span>ΔComplexity {p.complexity_delta}</span>
                  </div>
                  {(p.status === "proposed" || p.status === "needs_review") && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decide(p.id, true)}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decide(p.id, false)}>Reject</Button>
                    </div>
                  )}
                </div>
              ))}
              {!proposals.length && <div className="text-sm text-muted-foreground">No proposals yet. Run a cycle.</div>}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="simulations">
          <Card><CardContent className="p-4 overflow-auto">
            <pre className="text-xs">{JSON.stringify(sims.slice(0, 20), null, 2)}</pre>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="rollouts">
          <Card><CardContent className="p-4 space-y-2">
            {rollouts.map(r => (
              <div key={r.id} className="flex justify-between border-b py-2 text-sm">
                <span>{r.proposal_id?.slice(0, 8)} • {r.stage} • {r.traffic_pct}%</span>
                <Badge variant="outline">{r.status}</Badge>
              </div>
            ))}
            {!rollouts.length && <div className="text-sm text-muted-foreground">No rollouts yet.</div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="observations">
          <Card><CardContent className="p-4 overflow-auto">
            <pre className="text-xs">{JSON.stringify(observations, null, 2)}</pre>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="scorecard">
          <Card><CardContent className="p-4 overflow-auto">
            <pre className="text-xs">{JSON.stringify(scorecards, null, 2)}</pre>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reflections">
          <Card><CardContent className="p-4 space-y-3">
            {reflections.map(r => (
              <div key={r.id} className="border rounded p-3">
                <div className="font-medium">{r.period}</div>
                <div className="text-sm text-muted-foreground">{r.narrative}</div>
              </div>
            ))}
            {!reflections.length && <div className="text-sm text-muted-foreground">No reflections yet.</div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="threats">
          <Card><CardContent className="p-4 space-y-2">
            {threats.map(t => (
              <div key={t.id} className="border-b py-2">
                <div className="font-medium text-sm">{t.threat}</div>
                <div className="text-xs text-muted-foreground">Mitigation: {t.mitigation ?? "—"}</div>
              </div>
            ))}
            {!threats.length && <div className="text-sm text-muted-foreground">No threats tracked.</div>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card><CardContent className="p-4 overflow-auto">
            <pre className="text-xs">{JSON.stringify(runs, null, 2)}</pre>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}