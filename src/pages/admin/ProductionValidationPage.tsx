import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  target_url: string;
  git_commit: string | null;
  analytics_version: string | null;
  duration_ms: number | null;
  passed_count: number;
  failed_count: number;
  warning_count: number;
  verified_events: number;
  failed_events: number;
  trigger_source: string;
};

type Check = {
  id: string;
  run_id: string;
  category: string;
  name: string;
  status: string;
  severity: string;
  duration_ms: number | null;
  details: Record<string, unknown>;
};

function StatusBadge({ status }: { status: string }) {
  const v = status === "pass" ? "default" : status === "warning" || status === "warn" ? "secondary" : "destructive";
  return <Badge variant={v as any}>{status.toUpperCase()}</Badge>;
}

export default function ProductionValidationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("production_validation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(25);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRuns((data ?? []) as Run[]);
    if (data && data[0] && !selectedRun) setSelectedRun(data[0] as Run);
  }, [selectedRun]);

  const loadChecks = useCallback(async (runId: string) => {
    const { data, error } = await supabase
      .from("production_validation_checks")
      .select("*")
      .eq("run_id", runId)
      .order("category", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setChecks((data ?? []) as Check[]);
  }, []);

  useEffect(() => { void loadRuns(); }, [loadRuns]);
  useEffect(() => { if (selectedRun) void loadChecks(selectedRun.id); }, [selectedRun, loadChecks]);

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("production-validation-runner", {
      body: { trigger: "manual" },
    });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Validation ${data?.status ?? "complete"} (${data?.passed} passed, ${data?.failed} failed)`);
    await loadRuns();
  };

  const latest = runs[0];
  const overall = latest?.status ?? "unknown";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Production Validation</h1>
          <p className="text-muted-foreground">Continuous proof that analytics work on getpawsy.pet.</p>
        </div>
        <Button onClick={runNow} disabled={running}>{running ? "Running…" : "Run validation now"}</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle>Overall Health</CardTitle></CardHeader>
          <CardContent><StatusBadge status={overall} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Last run</CardTitle></CardHeader>
          <CardContent className="text-sm">{latest?.started_at ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Analytics version</CardTitle></CardHeader>
          <CardContent className="text-sm">{latest?.analytics_version ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Duration</CardTitle></CardHeader>
          <CardContent className="text-sm">{latest?.duration_ms ? `${latest.duration_ms} ms` : "—"}</CardContent></Card>
      </div>

      <Alert>
        <AlertDescription>
          Target: <strong>https://getpawsy.pet</strong>. Never validates localhost, preview, or mocked events.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle>Validation history</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div>Loading…</div> : (
            <div className="space-y-2">
              {runs.map(r => (
                <button key={r.id}
                  onClick={() => setSelectedRun(r)}
                  className={`w-full text-left p-3 border rounded-md flex items-center justify-between hover:bg-accent ${selectedRun?.id === r.id ? "bg-accent" : ""}`}>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} />
                    <span className="text-sm">{new Date(r.started_at).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">{r.trigger_source}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.passed_count} pass · {r.warning_count} warn · {r.failed_count} fail · {r.duration_ms ?? 0}ms
                  </div>
                </button>
              ))}
              {runs.length === 0 && <div className="text-sm text-muted-foreground">No runs yet — click “Run validation now”.</div>}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRun && (
        <Card>
          <CardHeader><CardTitle>Checks for {new Date(selectedRun.started_at).toLocaleString()}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {checks.map(c => (
                <div key={c.id} className="flex items-center justify-between border-b py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={c.status} />
                    <span className="font-mono text-xs text-muted-foreground">{c.category}</span>
                    <span>{c.name}</span>
                  </div>
                  <pre className="text-xs text-muted-foreground max-w-xl overflow-hidden text-ellipsis">
                    {JSON.stringify(c.details)}
                  </pre>
                </div>
              ))}
              {checks.length === 0 && <div className="text-sm text-muted-foreground">No checks recorded.</div>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}