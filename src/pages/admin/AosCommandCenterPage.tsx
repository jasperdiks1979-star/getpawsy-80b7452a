import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Activity, Brain, Loader2, Network, Workflow } from "lucide-react";

type R = Record<string, any>;

export default function AosCommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [engines, setEngines] = useState<R[]>([]);
  const [events, setEvents] = useState<R[]>([]);
  const [tasks, setTasks] = useState<R[]>([]);
  const [knowledge, setKnowledge] = useState<R[]>([]);
  const [health, setHealth] = useState<R | null>(null);
  const [strategy, setStrategy] = useState<R | null>(null);
  const [twin, setTwin] = useState<R[]>([]);
  const [consensus, setConsensus] = useState<R[]>([]);
  const [runs, setRuns] = useState<R[]>([]);

  async function load() {
    setLoading(true);
    const [e, ev, t, k, h, s, tw, c, r] = await Promise.all([
      supabase.from("aos_engine_registry").select("*").order("engine_key"),
      supabase.from("aos_events").select("*").order("sequence_no", { ascending: false }).limit(100),
      supabase.from("aos_tasks").select("*").order("priority", { ascending: false }).limit(50),
      supabase.from("aos_knowledge").select("*").is("superseded_at", null).order("created_at", { ascending: false }).limit(40),
      supabase.from("aos_health_snapshots").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("aos_daily_strategy").select("*").order("strategy_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("aos_digital_twin_snapshots").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("aos_consensus_decisions").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("aos_orchestrator_runs").select("*").order("started_at", { ascending: false }).limit(20),
    ]);
    setEngines(e.data ?? []);
    setEvents(ev.data ?? []);
    setTasks(t.data ?? []);
    setKnowledge(k.data ?? []);
    setHealth(h.data ?? null);
    setStrategy(s.data ?? null);
    setTwin(tw.data ?? []);
    setConsensus(c.data ?? []);
    setRuns(r.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function runOnce() {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("aos-orchestrator", { body: { trigger: "manual" } });
    setRunning(false);
    if (error) { toast.error("AOS run failed: " + error.message); return; }
    toast.success(`AOS run: ${data?.tasks ?? 0} tasks · health ${(((data?.health ?? 0)) * 100).toFixed(1)}`);
    load();
  }

  return (
    <div className="container py-6 space-y-6">
      <Helmet>
        <title>AI Operating System | GetPawsy</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" /> AI Operating System
          </h1>
          <p className="text-sm text-muted-foreground">Central nervous system above every engine.</p>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <Badge variant={(health.overall_score ?? 0) >= 0.75 ? "default" : (health.overall_score ?? 0) >= 0.5 ? "secondary" : "destructive"}>
              Overall {(health.overall_score * 100).toFixed(0)}
            </Badge>
          )}
          <Button onClick={runOnce} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
            Run AOS
          </Button>
        </div>
      </div>

      {strategy && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Workflow className="h-4 w-4" /> Today's Strategy</CardTitle></CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm">{strategy.briefing_md}</pre>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="engines">
        <TabsList>
          <TabsTrigger value="engines">Engines</TabsTrigger>
          <TabsTrigger value="events">Event Bus</TabsTrigger>
          <TabsTrigger value="tasks">Task Queue</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="twin">Digital Twin</TabsTrigger>
          <TabsTrigger value="consensus">Consensus</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="engines">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Network className="h-4 w-4" /> Engine Registry</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loading ? <Loader2 className="animate-spin" /> : engines.map(e => (
                <div key={e.id} className="flex items-center justify-between border rounded p-3">
                  <div>
                    <div className="font-medium">{e.display_name} <span className="text-xs text-muted-foreground">({e.engine_key})</span></div>
                    <div className="text-xs text-muted-foreground">{e.category} · weight {e.weight} · trust {(Number(e.trust_score) * 100).toFixed(0)}</div>
                  </div>
                  <Badge variant={e.health === "ok" ? "default" : "destructive"}>{e.health}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader><CardTitle>Unified Event Bus</CardTitle></CardHeader>
            <CardContent className="text-xs font-mono max-h-[600px] overflow-auto space-y-1">
              {events.map(e => (
                <div key={e.id} className="border-b py-1">#{e.sequence_no} · {e.event_type} · {e.source_engine ?? "—"} · {e.severity} · {new Date(e.occurred_at).toLocaleString()}</div>
              ))}
              {events.length === 0 && <p className="text-muted-foreground">No events yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardHeader><CardTitle>Global Task Queue</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-auto">
              {tasks.map(t => (
                <div key={t.id} className="flex justify-between border rounded p-2 text-sm">
                  <div>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.category} · owner {t.owner_engine ?? "—"} · {t.status}</div>
                  </div>
                  <Badge variant={t.priority >= 90 ? "destructive" : t.priority >= 50 ? "secondary" : "outline"}>P{t.priority}</Badge>
                </div>
              ))}
              {tasks.length === 0 && <p className="text-muted-foreground text-sm">No tasks queued.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge">
          <Card>
            <CardHeader><CardTitle>Shared Knowledge (active versions)</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-auto">
              {knowledge.map(k => (
                <div key={k.id} className="border rounded p-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{k.topic} / {k.key}</span>
                    <Badge variant="outline">v{k.version} · {(Number(k.confidence) * 100).toFixed(0)}%</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{k.publisher_engine} · {k.kind}</div>
                </div>
              ))}
              {knowledge.length === 0 && <p className="text-muted-foreground text-sm">No knowledge published yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <Card>
            <CardHeader><CardTitle>System Health Score</CardTitle></CardHeader>
            <CardContent>
              {!health ? <p className="text-sm text-muted-foreground">No snapshots yet.</p> : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[["AI", health.ai_health], ["Business", health.business_health], ["Traffic", health.traffic_health], ["Creative", health.creative_health], ["Revenue", health.revenue_health], ["Tracking", health.tracking_health], ["Infra", health.infra_health], ["CX", health.cx_health]].map(([l, v]: any) => (
                    <div key={l} className="border rounded p-3">
                      <div className="text-xs text-muted-foreground">{l}</div>
                      <div className="text-xl font-semibold">{(Number(v ?? 0) * 100).toFixed(0)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="twin">
          <Card>
            <CardHeader><CardTitle>Digital Twin Predictions</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-auto">
              {twin.map(t => (
                <div key={t.id} className="border rounded p-2 text-sm">
                  <div className="flex justify-between">
                    <span>{t.horizon}</span>
                    <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
                  </div>
                  <pre className="text-xs">{JSON.stringify(t.predicted)}</pre>
                </div>
              ))}
              {twin.length === 0 && <p className="text-muted-foreground text-sm">No predictions yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consensus">
          <Card>
            <CardHeader><CardTitle>Consensus Decisions</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-auto">
              {consensus.map(d => (
                <div key={d.id} className="border rounded p-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{d.topic}</span>
                    <Badge variant={d.status === "resolved" ? "default" : "secondary"}>{d.status}</Badge>
                  </div>
                  {d.final_verdict && <div className="text-xs">→ {d.final_verdict} — {d.rationale}</div>}
                </div>
              ))}
              {consensus.length === 0 && <p className="text-muted-foreground text-sm">No consensus decisions yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardHeader><CardTitle>Orchestrator Runs</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-auto">
              {runs.map(r => (
                <div key={r.id} className="border rounded p-2 text-sm">
                  <div className="flex justify-between">
                    <span>{new Date(r.started_at).toLocaleString()} · {r.trigger}</span>
                    <Badge variant={r.status === "ok" ? "default" : "secondary"}>{r.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    tasks {r.tasks_scheduled} · health {(Number(r.health_score ?? 0) * 100).toFixed(0)}
                  </div>
                </div>
              ))}
              {runs.length === 0 && <p className="text-muted-foreground text-sm">No runs yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}