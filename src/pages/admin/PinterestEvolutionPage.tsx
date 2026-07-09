import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Brain, TrendingUp, Trophy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Version = {
  id: string;
  version: number;
  pins_analyzed: number;
  attributes_learned: number;
  first_pass_certification_rate: number | null;
  recovery_success_rate: number | null;
  organic_saves_per_pin: number | null;
  organic_clicks_per_pin: number | null;
  organic_purchases_per_pin: number | null;
  organic_revenue_per_pin: number | null;
  created_at: string;
};
type Effect = {
  id: string; attribute: string; value: string; metric: string;
  effect: number; sample_size: number; confidence: number; created_at: string;
};
type Memory = {
  id: string; kind: string; key: string; wins: number;
  organic_saves: number; organic_clicks: number; organic_purchases: number;
  organic_revenue: number; sample_size: number; confidence: number; last_updated: string;
};
type Recommendation = {
  id: string; directive: string; reason: string; metric: string;
  effect: number; confidence: number; priority: number; active: boolean;
};
type Run = {
  id: string; status: string; pins_analyzed: number; attributes_learned: number;
  recommendations_written: number; memory_updated: number;
  duration_ms: number | null; error: string | null; started_at: string;
};

const pct = (n: number | null) => n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const num = (n: number | null | undefined) => n == null ? "—" : Number(n).toFixed(2);

export default function PinterestEvolutionPage() {
  const [version, setVersion] = useState<Version | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [memory, setMemory] = useState<Memory[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: v }, { data: e }, { data: m }, { data: r }, { data: rn }] = await Promise.all([
        supabase.from("pinterest_evolution_versions").select("*").order("version", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("pinterest_evolution_attribute_effects").select("*").order("effect", { ascending: false }).limit(50),
        supabase.from("pinterest_evolution_memory").select("*").order("wins", { ascending: false }).limit(30),
        supabase.from("pinterest_evolution_recommendations").select("*").eq("active", true).order("priority", { ascending: true }).limit(20),
        supabase.from("pinterest_evolution_runs").select("*").order("started_at", { ascending: false }).limit(15),
      ]);
      setVersion(v as Version | null);
      setEffects((e as Effect[] | null) ?? []);
      setMemory((m as Memory[] | null) ?? []);
      setRecs((r as Recommendation[] | null) ?? []);
      setRuns((rn as Run[] | null) ?? []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const trigger = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-evolution-engine", { body: { trigger: "admin_ui" } });
      if (error) throw error;
      toast.success(`Evolution engine complete: v${(data as any)?.version ?? "?"} · ${(data as any)?.pins_analyzed ?? 0} pins`);
      await load();
    } catch (e: any) { toast.error(e?.message || "Evolution run failed"); }
    finally { setRunning(false); }
  };

  const winners = [...effects].filter(e => e.effect > 0).slice(0, 15);
  const losers = [...effects].sort((a, b) => a.effect - b.effect).filter(e => e.effect < 0).slice(0, 15);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Helmet><title>Pinterest Evolution Engine</title></Helmet>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Brain className="h-6 w-6" /> Pinterest Evolution Engine</h1>
          <p className="text-sm text-muted-foreground">Closed learning loop — real Pinterest performance biases every future creative. Organic-primary. Cron: 03:15 UTC daily.</p>
        </div>
        <Button onClick={trigger} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />} Run engine
        </Button>
      </header>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Current version</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">v{version?.version ?? "—"}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pins analysed</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{version?.pins_analyzed ?? 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Attributes learned</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{version?.attributes_learned ?? 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">First-pass cert.</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{pct(version?.first_pass_certification_rate ?? null)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Recovery success</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{pct(version?.recovery_success_rate ?? null)}</div></CardContent></Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-green-500" /> Top winning attributes</CardTitle></CardHeader>
              <CardContent>
                {winners.length === 0 ? <p className="text-sm text-muted-foreground">No signal yet — needs more published pins.</p> : (
                  <div className="space-y-1 text-xs">
                    {winners.map(w => (
                      <div key={w.id} className="flex justify-between gap-2 border-b border-border py-1">
                        <span className="truncate"><b>{w.attribute}</b>={w.value} <span className="text-muted-foreground">({w.metric})</span></span>
                        <span className="whitespace-nowrap"><Badge variant="default">+{(w.effect * 100).toFixed(1)}%</Badge> <span className="text-muted-foreground">n={w.sample_size} · c{w.confidence.toFixed(2)}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Biggest losing attributes</CardTitle></CardHeader>
              <CardContent>
                {losers.length === 0 ? <p className="text-sm text-muted-foreground">No negative signal yet.</p> : (
                  <div className="space-y-1 text-xs">
                    {losers.map(w => (
                      <div key={w.id} className="flex justify-between gap-2 border-b border-border py-1">
                        <span className="truncate"><b>{w.attribute}</b>={w.value} <span className="text-muted-foreground">({w.metric})</span></span>
                        <span className="whitespace-nowrap"><Badge variant="destructive">{(w.effect * 100).toFixed(1)}%</Badge> <span className="text-muted-foreground">n={w.sample_size}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Active recommendations (v{version?.version ?? "?"})</CardTitle></CardHeader>
            <CardContent>
              {recs.length === 0 ? <p className="text-sm text-muted-foreground">No active recommendations. Run the engine.</p> : (
                <div className="space-y-1 text-xs">
                  {recs.map(r => (
                    <div key={r.id} className="flex justify-between gap-2 border-b border-border py-1">
                      <span className="truncate">{r.directive}</span>
                      <span className="whitespace-nowrap text-muted-foreground">{r.reason} · c{r.confidence.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Creative memory (top winners)</CardTitle></CardHeader>
            <CardContent>
              {memory.length === 0 ? <p className="text-sm text-muted-foreground">Memory empty.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr><th className="py-1">Kind</th><th>Key</th><th>Wins</th><th>Saves</th><th>Clicks</th><th>Purchases</th><th>Revenue</th><th>n</th></tr>
                    </thead>
                    <tbody>
                      {memory.map(m => (
                        <tr key={m.id} className="border-t border-border">
                          <td className="py-1"><Badge variant="outline">{m.kind}</Badge></td>
                          <td className="max-w-[240px] truncate">{m.key}</td>
                          <td>{m.wins}</td>
                          <td>{num(m.organic_saves)}</td>
                          <td>{num(m.organic_clicks)}</td>
                          <td>{num(m.organic_purchases)}</td>
                          <td>€{num(m.organic_revenue)}</td>
                          <td>{m.sample_size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent engine runs</CardTitle></CardHeader>
            <CardContent>
              {runs.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr><th className="py-1">Started</th><th>Status</th><th>Pins</th><th>Attributes</th><th>Recs</th><th>Memory</th><th>Duration</th><th>Error</th></tr>
                    </thead>
                    <tbody>
                      {runs.map(r => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="py-1">{new Date(r.started_at).toLocaleString()}</td>
                          <td><Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge></td>
                          <td>{r.pins_analyzed}</td>
                          <td>{r.attributes_learned}</td>
                          <td>{r.recommendations_written}</td>
                          <td>{r.memory_updated}</td>
                          <td>{r.duration_ms ?? "—"}ms</td>
                          <td className="text-red-500 max-w-[200px] truncate">{r.error ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}