/**
 * Revenue Recovery — Wave A diagnostic dashboard.
 * Reads `rr_funnel_checks` (latest run) and shows a red/green strip across
 * every commercial step. No simulated values — empty means no data yet.
 */
import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";

type Check = {
  id: string;
  run_id: string;
  step: string;
  status: "green" | "yellow" | "red" | "skip";
  latency_ms: number | null;
  evidence: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

const statusStyle = {
  green: { cls: "bg-emerald-600", Icon: CheckCircle2, label: "OK" },
  yellow: { cls: "bg-amber-600", Icon: AlertTriangle, label: "Degraded" },
  red: { cls: "bg-destructive", Icon: XCircle, label: "Broken" },
  skip: { cls: "bg-muted", Icon: AlertTriangle, label: "Skipped" },
} as const;

export default function RevenueRecoveryPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rr_funnel_checks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    // Deduplicate to latest run.
    const latestRun = data?.[0]?.run_id;
    setChecks(((data ?? []) as Check[]).filter((c) => c.run_id === latestRun));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setRunning(true);
    try {
      await supabase.functions.invoke("rr-funnel-validator", { body: {} });
      await load();
    } finally {
      setRunning(false);
    }
  };

  const summary = {
    green: checks.filter((c) => c.status === "green").length,
    yellow: checks.filter((c) => c.status === "yellow").length,
    red: checks.filter((c) => c.status === "red").length,
  };

  return (
    <>
      <Helmet><title>Revenue Recovery | Admin</title></Helmet>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display font-bold">Revenue Recovery</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Wave A — Funnel Validator. Every step gets red/yellow/green from real database evidence only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-600">{summary.green} OK</Badge>
            <Badge className="bg-amber-600">{summary.yellow} Degraded</Badge>
            <Badge className="bg-destructive">{summary.red} Broken</Badge>
            <Button onClick={run} disabled={running} size="sm">
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Run validator
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Latest funnel checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!loading && checks.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No runs yet. Click <b>Run validator</b> to capture the current state.
              </p>
            )}
            {checks.map((c) => {
              const s = statusStyle[c.status];
              return (
                <div key={c.id} className="flex items-start gap-3 p-3 rounded border bg-card">
                  <div className={`p-1.5 rounded ${s.cls} text-white`}>
                    <s.Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-sm font-medium">{c.step}</code>
                      <span className="text-xs text-muted-foreground">{c.latency_ms ?? 0}ms</span>
                    </div>
                    {c.evidence && (
                      <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto">
                        {JSON.stringify(c.evidence, null, 0)}
                      </pre>
                    )}
                    {c.error_message && (
                      <p className="text-xs text-destructive mt-1">{c.error_message}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}