import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Brain, Activity, Network, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Run = { id: string; kind: string; status: string; stats: any; duration_ms: number | null; steps_completed: number; created_at: string };
type RCA = { id: string; event_type: string; entity_type: string; entity_key: string | null; root_cause: string; confidence: number; recommended_actions: any[]; observed_change: any; created_at: string };
type DNA = { id: string; kind: string; scope: string; scope_key: string | null; traits: any; sample_size: number; confidence: number };
type Pattern = { id: string; pattern_key: string; hypothesis: string; lift: number; confidence: number; sample_size: number; status: string };
type Explanation = { id: string; subject_type: string; subject_key: string; question: string; answer_md: string; confidence: number; reasoning_quality: number };
type Score = { entity_type: string; entity_key: string; organic_intelligence: number; explanation_confidence: number; prediction_confidence: number; learning_stability: number; reasoning_quality: number };

export default function OrganicIntelligenceEnginePage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [rcas, setRcas] = useState<RCA[]>([]);
  const [dna, setDna] = useState<DNA[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [counts, setCounts] = useState<{ nodes: number; edges: number }>({ nodes: 0, edges: 0 });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, c, d, p, e, s, n, ed] = await Promise.all([
        supabase.from("oie_runs").select("*").order("created_at", { ascending: false }).limit(10),
        supabase.from("oie_root_cause_analyses").select("*").order("created_at", { ascending: false }).limit(25),
        supabase.from("oie_dna_profiles").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("oie_patterns").select("*").order("confidence", { ascending: false }).limit(25),
        supabase.from("oie_explanations").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("oie_intelligence_scores").select("*").order("organic_intelligence", { ascending: false }).limit(25),
        supabase.from("oie_graph_nodes").select("*", { count: "exact", head: true }),
        supabase.from("oie_graph_edges").select("*", { count: "exact", head: true }),
      ]);
      setRuns((r.data as any) || []);
      setRcas((c.data as any) || []);
      setDna((d.data as any) || []);
      setPatterns((p.data as any) || []);
      setExplanations((e.data as any) || []);
      setScores((s.data as any) || []);
      setCounts({ nodes: (n as any).count ?? 0, edges: (ed as any).count ?? 0 });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const trigger = async (action: string) => {
    setRunning(action);
    try {
      const { data, error } = await supabase.functions.invoke("organic-intelligence-engine", { body: { action } });
      if (error) throw error;
      toast.success(`OIE ${action} complete · ${JSON.stringify(data?.stats || {})}`);
      await load();
    } catch (e: any) { toast.error(e?.message || "Run failed"); }
    finally { setRunning(null); }
  };

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Organic Intelligence Engine</title></Helmet>
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Brain className="h-6 w-6" /> Organic Intelligence Engine</h1>
          <p className="text-sm text-muted-foreground">Reasoning layer on top of Organic Confidence, Sales Commander, AI CEO, Growth Lab. Answers WHY, not just WHAT.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => trigger("graph")} disabled={!!running}>Build graph</Button>
          <Button size="sm" variant="outline" onClick={() => trigger("rca")} disabled={!!running}>Root cause</Button>
          <Button size="sm" variant="outline" onClick={() => trigger("dna")} disabled={!!running}>DNA</Button>
          <Button size="sm" variant="outline" onClick={() => trigger("patterns")} disabled={!!running}>Patterns</Button>
          <Button size="sm" variant="outline" onClick={() => trigger("explain")} disabled={!!running}>Explain</Button>
          <Button size="sm" onClick={() => trigger("full")} disabled={!!running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />} Full cycle
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Nodes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold flex items-center gap-2"><Network className="h-4 w-4" />{counts.nodes}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Edges</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{counts.edges}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Root causes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{rcas.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">DNA profiles</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{dna.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Patterns</CardTitle></CardHeader><CardContent className="text-2xl font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" />{patterns.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Explanations</CardTitle></CardHeader><CardContent className="text-2xl font-semibold flex items-center gap-2"><Activity className="h-4 w-4" />{explanations.length}</CardContent></Card>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Root cause analyses</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm max-h-[28rem] overflow-auto">
              {rcas.length === 0 ? <span className="text-muted-foreground">No analyses yet.</span> : rcas.map((r) => (
                <div key={r.id} className="border rounded p-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={r.event_type.includes("drop") ? "destructive" : "default"}>{r.event_type}</Badge>
                    <span className="text-xs text-muted-foreground">{r.entity_type}:{r.entity_key}</span>
                    <span className="text-xs ml-auto">conf {(r.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="mt-1"><b>Cause:</b> {r.root_cause}</div>
                  <div className="text-xs text-muted-foreground">Δ {Number(r.observed_change?.delta ?? 0).toFixed(2)} on {r.observed_change?.metric}</div>
                  {r.recommended_actions?.[0] && (<div className="text-xs"><b>Action:</b> {r.recommended_actions[0].action} — {r.recommended_actions[0].reason}</div>)}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Discovered patterns</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm max-h-[28rem] overflow-auto">
              {patterns.length === 0 ? <span className="text-muted-foreground">No patterns yet.</span> : patterns.map((p) => (
                <div key={p.id} className="border rounded p-2">
                  <div className="flex items-center gap-2"><Badge variant="outline">{p.status}</Badge><span className="font-medium">{p.pattern_key}</span></div>
                  <div className="text-xs">{p.hypothesis}</div>
                  <div className="text-xs text-muted-foreground">lift {(p.lift * 100).toFixed(2)}% · conf {(p.confidence * 100).toFixed(0)}% · n={p.sample_size}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Success / Failure DNA</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm max-h-[28rem] overflow-auto">
              {dna.map((d) => (
                <div key={d.id} className="border rounded p-2">
                  <div className="flex items-center gap-2"><Badge variant={d.kind === "success" ? "default" : "destructive"}>{d.kind}</Badge><span className="font-medium">{d.scope}:{d.scope_key}</span></div>
                  <div className="text-xs text-muted-foreground">n={d.sample_size} · conf {(d.confidence * 100).toFixed(0)}%</div>
                  <pre className="text-xs whitespace-pre-wrap mt-1">{JSON.stringify(d.traits, null, 0)}</pre>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Top explanations</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm max-h-[28rem] overflow-auto">
              {explanations.map((e) => (
                <div key={e.id} className="border rounded p-2">
                  <div className="flex items-center gap-2"><Badge variant="outline">{e.question}</Badge><span className="font-medium">{e.subject_type}:{e.subject_key}</span><span className="text-xs ml-auto">RQ {(e.reasoning_quality * 100).toFixed(0)}</span></div>
                  <pre className="text-xs whitespace-pre-wrap mt-1">{e.answer_md}</pre>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Intelligence scores (top 25)</CardTitle></CardHeader>
            <CardContent className="text-xs overflow-auto">
              <table className="w-full">
                <thead><tr className="text-left text-muted-foreground"><th>Entity</th><th>OI</th><th>Explain</th><th>Predict</th><th>Stability</th><th>Reasoning</th></tr></thead>
                <tbody>{scores.map((s) => (
                  <tr key={s.entity_key} className="border-t"><td>{s.entity_type}:{s.entity_key}</td><td>{Number(s.organic_intelligence).toFixed(0)}</td><td>{s.explanation_confidence}</td><td>{s.prediction_confidence}</td><td>{s.learning_stability}</td><td>{s.reasoning_quality}</td></tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              {runs.map((r) => (
                <div key={r.id} className="flex justify-between">
                  <span>{r.kind} · {r.status}</span>
                  <span className="text-muted-foreground">{r.steps_completed} steps · {r.duration_ms ?? "—"}ms · {new Date(r.created_at).toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}