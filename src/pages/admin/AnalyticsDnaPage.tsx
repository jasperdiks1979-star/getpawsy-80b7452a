import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Activity } from "lucide-react";

interface Module { key: string; name: string; description: string | null; category: string; concept_count: number; avg_confidence: number; }
interface Concept { id: string; module_key: string; key: string; name: string; weight: number; confidence: number; evidence_count: number; version: number; }
interface Source { key: string; name: string; kind: string; trust_score: number; last_ingest_at: string | null; }
interface Anomaly { id: string; anomaly_type: string; severity: string; observed: number | null; expected: number | null; z_score: number | null; status: string; detected_at: string; }
interface Funnel { step: string; step_order: number; visitors: number; conversions: number; drop_rate: number | null; estimated_lost_revenue: number | null; }
interface Truth { id: string; metric_key: string; source_a: string; source_b: string; delta_pct: number | null; status: string; created_at: string; }

export default function AnalyticsDnaPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [concepts, setConcepts] = useState<Record<string, Concept[]>>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [funnel, setFunnel] = useState<Funnel[]>([]);
  const [truth, setTruth] = useState<Truth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: mods }, { data: cons }, { data: srcs }, { data: anom }, { data: fun }, { data: tv }] = await Promise.all([
        supabase.from("gad_modules").select("*").order("category"),
        supabase.from("gad_concepts").select("*").order("weight", { ascending: false }),
        supabase.from("gad_data_sources").select("*").order("trust_score", { ascending: false }),
        supabase.from("gad_anomalies").select("*").order("detected_at", { ascending: false }).limit(20),
        supabase.from("gad_funnel_snapshots").select("*").order("step_order").limit(20),
        supabase.from("gad_truth_validations").select("*").order("created_at", { ascending: false }).limit(20),
      ]);
      const grouped: Record<string, Concept[]> = {};
      (cons ?? []).forEach((c: any) => { (grouped[c.module_key] ||= []).push(c); });
      setModules((mods as Module[]) ?? []);
      setConcepts(grouped);
      setSources((srcs as Source[]) ?? []);
      setAnomalies((anom as Anomaly[]) ?? []);
      setFunnel((fun as Funnel[]) ?? []);
      setTruth((tv as Truth[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Analytics DNA…</div>;
  }

  const totalConcepts = modules.reduce((s, m) => s + m.concept_count, 0);
  const avgConf = modules.length ? modules.reduce((s, m) => s + Number(m.avg_confidence ?? 0), 0) / modules.length : 0;
  const avgTrust = sources.length ? sources.reduce((s, x) => s + Number(x.trust_score ?? 0), 0) / sources.length : 0;
  const openAnomalies = anomalies.filter(a => a.status === "open").length;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Genesis Analytics DNA</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Permanent trust layer · observes only · every AI engine consults before strategic, operational or creative decisions.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Modules</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{modules.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Avg Confidence</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{(avgConf * 100).toFixed(0)}%</div><Progress value={avgConf * 100} className="mt-2" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Source Trust</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{(avgTrust * 100).toFixed(0)}%</div><Progress value={avgTrust * 100} className="mt-2" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Open Anomalies</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{openAnomalies}</div></CardContent></Card>
      </div>

      <Tabs defaultValue={modules[0]?.key ?? "sources"}>
        <TabsList className="flex-wrap h-auto">
          {modules.map((m) => (
            <TabsTrigger key={m.key} value={m.key} className="text-xs">
              {m.name}<Badge variant="secondary" className="ml-2">{m.concept_count}</Badge>
            </TabsTrigger>
          ))}
          <TabsTrigger value="__sources" className="text-xs">Sources</TabsTrigger>
          <TabsTrigger value="__funnel" className="text-xs">Funnel</TabsTrigger>
          <TabsTrigger value="__truth" className="text-xs">Truth</TabsTrigger>
          <TabsTrigger value="__anomalies" className="text-xs">Anomalies</TabsTrigger>
        </TabsList>

        {modules.map((m) => (
          <TabsContent key={m.key} value={m.key} className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{m.name}</CardTitle><p className="text-sm text-muted-foreground">{m.description}</p></CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {(concepts[m.key] ?? []).map((c) => (
                    <div key={c.id} className="rounded-md border border-border bg-card/50 p-3 text-sm">
                      <div className="flex items-center justify-between"><span className="font-medium">{c.name}</span><Badge variant="outline">v{c.version}</Badge></div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>weight<Progress value={Number(c.weight) * 100} className="h-1 mt-1" /></div>
                        <div>conf<Progress value={Number(c.confidence) * 100} className="h-1 mt-1" /></div>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">evidence: {c.evidence_count}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="__sources" className="mt-4">
          <Card><CardHeader><CardTitle className="text-base">Data Source Trust</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sources.map((s) => (
                  <div key={s.key} className="flex items-center justify-between rounded border border-border bg-card/50 p-3 text-sm">
                    <div><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.kind} · last ingest {s.last_ingest_at ?? "never"}</div></div>
                    <Badge variant="secondary">{(Number(s.trust_score) * 100).toFixed(0)}%</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="__funnel" className="mt-4">
          <Card><CardHeader><CardTitle className="text-base">Funnel Snapshot</CardTitle></CardHeader>
            <CardContent>
              {funnel.length === 0 ? <p className="text-sm text-muted-foreground">No snapshots yet. Engines write via <code>GAD.recordMetric()</code> or pipeline ingest.</p> : (
                <div className="space-y-2">
                  {funnel.map((f) => (
                    <div key={f.step} className="rounded border border-border bg-card/50 p-3 text-sm">
                      <div className="flex items-center justify-between"><span className="font-medium">{f.step}</span><Badge variant="outline">{f.visitors} → {f.conversions}</Badge></div>
                      {f.drop_rate !== null && (<div className="mt-1 text-xs text-muted-foreground">drop {(Number(f.drop_rate) * 100).toFixed(1)}% · lost ≈ ${Number(f.estimated_lost_revenue ?? 0).toFixed(0)}</div>)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="__truth" className="mt-4">
          <Card><CardHeader><CardTitle className="text-base">Cross-Source Reconciliation</CardTitle></CardHeader>
            <CardContent>
              {truth.length === 0 ? <p className="text-sm text-muted-foreground">No validations yet.</p> : (
                <div className="space-y-2">
                  {truth.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded border border-border bg-card/50 p-3 text-sm">
                      <div><div className="font-medium">{t.metric_key}</div><div className="text-xs text-muted-foreground">{t.source_a} vs {t.source_b}</div></div>
                      <Badge variant={t.status === "match" ? "secondary" : t.status === "warn" ? "outline" : "destructive"}>
                        {t.status} · Δ {((Number(t.delta_pct ?? 0)) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="__anomalies" className="mt-4">
          <Card><CardHeader><CardTitle className="text-base">Anomalies</CardTitle></CardHeader>
            <CardContent>
              {anomalies.length === 0 ? <p className="text-sm text-muted-foreground">All clear.</p> : (
                <div className="space-y-2">
                  {anomalies.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded border border-border bg-card/50 p-3 text-sm">
                      <div><div className="font-medium">{a.anomaly_type}</div><div className="text-xs text-muted-foreground">{new Date(a.detected_at).toLocaleString()} · z={Number(a.z_score ?? 0).toFixed(2)}</div></div>
                      <Badge variant={a.severity === "critical" ? "destructive" : a.severity === "high" ? "destructive" : "secondary"}>{a.severity}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}