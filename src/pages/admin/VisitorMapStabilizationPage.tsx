import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, PlayCircle } from "lucide-react";
import { toast } from "sonner";

type Run = {
  id: string;
  ran_at: string;
  status: "pass" | "warn" | "fail" | "error";
  duration_ms: number | null;
  checks: Array<{ name: string; status: string; detail?: string }>;
  incidents: Array<Record<string, unknown>>;
  metrics: Record<string, unknown>;
};

const badgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pass: "default",
  warn: "secondary",
  fail: "destructive",
  error: "destructive",
};

export default function VisitorMapStabilizationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("stabilization_runs" as any)
      .select("*")
      .eq("monitor", "visitor-world-map-pro")
      .gte("ran_at", since)
      .order("ran_at", { ascending: false })
      .limit(48);
    if (error) toast.error(error.message);
    else setRuns(((data ?? []) as unknown) as Run[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runNow = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke(
      "visitor-map-stabilization-monitor",
      { body: {} },
    );
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Snapshot recorded");
      load();
    }
  };

  const stats = useMemo(() => {
    const total = runs.length;
    const pass = runs.filter((r) => r.status === "pass").length;
    const drift = runs.filter((r) => r.status !== "pass").length;
    const incidents = runs.reduce((n, r) => n + (r.incidents?.length ?? 0), 0);
    const overall: "PASS" | "FAIL" | "PENDING" =
      total >= 24 && drift === 0 ? "PASS" : total < 24 ? "PENDING" : "FAIL";
    return { total, pass, drift, incidents, overall };
  }, [runs]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visitor World Map Pro — Stabilization Monitor</h1>
          <p className="text-sm text-muted-foreground">
            Hourly automated checks. PASS requires 24 consecutive drift-free runs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={runNow} disabled={busy}>
            <PlayCircle className="h-4 w-4 mr-2" /> Run snapshot now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">24h Status</CardTitle></CardHeader>
          <CardContent>
            <Badge variant={stats.overall === "PASS" ? "default" : stats.overall === "FAIL" ? "destructive" : "secondary"}>
              {stats.overall}
            </Badge>
          </CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Runs (24h)</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.total} / 24</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Pass</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-green-600">{stats.pass}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Drift runs</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-destructive">{stats.drift}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Incidents</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.incidents}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Runs</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No runs yet. Click “Run snapshot now”.</div>
          ) : (
            <div className="space-y-3">
              {runs.map((r) => (
                <div key={r.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={badgeVariant[r.status] ?? "outline"}>{r.status.toUpperCase()}</Badge>
                      <span className="text-sm font-medium">{new Date(r.ran_at).toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">{r.duration_ms ?? 0} ms</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.incidents?.length ?? 0} incident{(r.incidents?.length ?? 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.checks?.map((c, i) => (
                      <Badge key={i} variant={badgeVariant[c.status] ?? "outline"} className="text-[10px]">
                        {c.name}:{c.status}
                      </Badge>
                    ))}
                  </div>
                  {r.incidents?.length ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-destructive">Incidents</summary>
                      <pre className="mt-2 whitespace-pre-wrap bg-muted p-2 rounded">
                        {JSON.stringify(r.incidents, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}