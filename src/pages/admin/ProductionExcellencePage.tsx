import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TRPE } from "@/lib/trpe/client";

type Row = Record<string, any>;

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    healthy: "default",
    meeting: "default",
    pass: "default",
    degraded: "secondary",
    warning: "secondary",
    queued: "secondary",
    breach: "destructive",
    critical: "destructive",
    failed: "destructive",
    open: "destructive",
  };
  return <Badge variant={(map[status ?? ""] as any) ?? "outline"}>{(status ?? "unknown").toUpperCase()}</Badge>;
}

export default function ProductionExcellencePage() {
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<Row[]>([]);
  const [reliability, setReliability] = useState<Row[]>([]);
  const [slos, setSlos] = useState<Row[]>([]);
  const [integrity, setIntegrity] = useState<Row[]>([]);
  const [incidents, setIncidents] = useState<Row[]>([]);
  const [changes, setChanges] = useState<Row[]>([]);
  const [healing, setHealing] = useState<Row[]>([]);
  const [verif, setVerif] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const [{ data: h }, { data: r }, { data: s }, { data: i }, { data: inc }, { data: ch }, { data: he }, { data: vr }, { data: ru }] =
      await Promise.all([
        supabase.from("trpe_health_snapshots").select("*").order("captured_at", { ascending: false }).limit(30),
        supabase.from("trpe_reliability_metrics").select("*").order("created_at", { ascending: false }).limit(30),
        supabase.from("trpe_slos").select("*").order("name"),
        supabase.from("trpe_integrity_checks").select("*").order("ran_at", { ascending: false }).limit(30),
        supabase.from("trpe_incidents").select("*").order("detected_at", { ascending: false }).limit(30),
        supabase.from("trpe_changes").select("*").order("created_at", { ascending: false }).limit(30),
        supabase.from("trpe_self_healing_actions").select("*").order("created_at", { ascending: false }).limit(30),
        supabase.from("trpe_verification_runs").select("*").order("ran_at", { ascending: false }).limit(30),
        supabase.from("trpe_runs").select("*").order("started_at", { ascending: false }).limit(10),
      ]);
    setHealth(h ?? []);
    setReliability(r ?? []);
    setSlos(s ?? []);
    setIntegrity(i ?? []);
    setIncidents(inc ?? []);
    setChanges(ch ?? []);
    setHealing(he ?? []);
    setVerif(vr ?? []);
    setRuns(ru ?? []);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const runCycle = async () => {
    setRunning(true);
    try {
      const res: any = await TRPE.runCycle();
      toast.success(`Cycle complete: ${JSON.stringify(res.summary)}`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Cycle failed");
    } finally {
      setRunning(false);
    }
  };

  const latestBySub: Record<string, Row> = {};
  for (const row of health) if (!latestBySub[row.subsystem]) latestBySub[row.subsystem] = row;
  const subsystems = Object.values(latestBySub);
  const overall = subsystems.length
    ? Math.round(subsystems.reduce((a, s) => a + Number(s.health_score ?? 0), 0) / subsystems.length)
    : 0;

  return (
    <>
      <Helmet>
        <title>Production Excellence | GetPawsy Admin</title>
      </Helmet>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Production Excellence (TRPE)</h1>
            <p className="text-muted-foreground">Trust · Reliability · Production health, SLOs, incidents and change management.</p>
          </div>
          <Button onClick={runCycle} disabled={running}>{running ? "Running…" : "Run cycle"}</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardHeader><CardTitle>Overall Health</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{overall}</CardContent></Card>
          <Card><CardHeader><CardTitle>Subsystems</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{subsystems.length}</CardContent></Card>
          <Card><CardHeader><CardTitle>Open Incidents</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{incidents.filter(i => i.status !== "resolved").length}</CardContent></Card>
          <Card><CardHeader><CardTitle>SLO Breaches</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{slos.filter(s => s.status === "breach").length}</CardContent></Card>
          <Card><CardHeader><CardTitle>Last Run</CardTitle></CardHeader><CardContent className="text-sm">{runs[0]?.started_at ? new Date(runs[0].started_at).toLocaleString() : "—"}</CardContent></Card>
        </div>

        <Tabs defaultValue="health">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="reliability">Reliability</TabsTrigger>
            <TabsTrigger value="slos">SLOs</TabsTrigger>
            <TabsTrigger value="integrity">Integrity</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="changes">Changes</TabsTrigger>
            <TabsTrigger value="healing">Self-Healing</TabsTrigger>
            <TabsTrigger value="verif">Verification</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
          </TabsList>

          <TabsContent value="health">
            <Card><CardContent className="p-4 space-y-2">
              {subsystems.map((s) => (
                <div key={s.subsystem} className="flex items-center justify-between border-b py-2 text-sm">
                  <span className="font-mono">{s.subsystem}</span>
                  <span>{s.health_score}</span>
                  <StatusBadge status={s.status} />
                </div>
              ))}
              {!subsystems.length && <div className="text-muted-foreground text-sm">No snapshots yet — run a cycle.</div>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="reliability">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              {reliability.map((r) => (
                <div key={r.id} className="border-b py-2 grid grid-cols-2 md:grid-cols-6 gap-2">
                  <span className="font-mono">{r.subsystem}</span>
                  <span>avail {(Number(r.availability) * 100).toFixed(1)}%</span>
                  <span>fail {(Number(r.failure_rate) * 100).toFixed(1)}%</span>
                  <span>mtbf {r.mtbf_minutes ?? "—"}m</span>
                  <span>mttr {r.mttr_minutes ?? "—"}m</span>
                  <span>budget {(Number(r.error_budget_remaining) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="slos">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              {slos.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b py-2">
                  <span className="font-mono">{s.name}</span>
                  <span>{s.metric} · target {s.target} · current {s.current_value ?? "—"}</span>
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="integrity">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              {integrity.map((c) => (
                <div key={c.id} className="flex items-center justify-between border-b py-2">
                  <span className="font-mono">{c.check_name}</span>
                  <span>{c.found_count}</span>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="incidents">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              {incidents.map((i) => (
                <div key={i.id} className="border-b py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{i.title}</span>
                    <StatusBadge status={i.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">sev {i.severity} · {i.subsystem ?? "—"} · {new Date(i.detected_at).toLocaleString()}</div>
                </div>
              ))}
              {!incidents.length && <div className="text-muted-foreground">No incidents.</div>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="changes">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              {changes.map((c) => (
                <div key={c.id} className="border-b py-2 flex items-center justify-between">
                  <span>{c.title}</span>
                  <span className="text-xs">risk {c.risk}</span>
                  <StatusBadge status={c.status} />
                </div>
              ))}
              {!changes.length && <div className="text-muted-foreground">No changes registered.</div>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="healing">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              {healing.map((h) => (
                <div key={h.id} className="border-b py-2 flex items-center justify-between">
                  <span className="font-mono">{h.subsystem}</span>
                  <span>{h.action}</span>
                  <StatusBadge status={h.status} />
                </div>
              ))}
              {!healing.length && <div className="text-muted-foreground">No self-healing actions.</div>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="verif">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              {verif.map((v) => (
                <div key={v.id} className="border-b py-2 flex items-center justify-between">
                  <span className="font-mono">{v.journey}</span>
                  <span>{v.duration_ms}ms</span>
                  <StatusBadge status={v.status} />
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="runs">
            <Card><CardContent className="p-4 space-y-2 text-sm">
              {runs.map((r) => (
                <div key={r.id} className="border-b py-2">
                  <div className="flex items-center justify-between">
                    <span>{r.cycle}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <pre className="text-xs text-muted-foreground overflow-hidden">{JSON.stringify(r.summary)}</pre>
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}