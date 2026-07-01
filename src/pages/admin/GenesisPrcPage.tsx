import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ShieldCheck, AlertTriangle, XCircle, HelpCircle } from "lucide-react";

type Report = any;

const statusBadge = (s: string) => {
  if (s === "healthy") return <Badge className="bg-emerald-600"><ShieldCheck className="w-3 h-3 mr-1" />healthy</Badge>;
  if (s === "warning") return <Badge className="bg-amber-600"><AlertTriangle className="w-3 h-3 mr-1" />warning</Badge>;
  if (s === "critical") return <Badge className="bg-destructive"><XCircle className="w-3 h-3 mr-1" />critical</Badge>;
  return <Badge variant="secondary"><HelpCircle className="w-3 h-3 mr-1" />{s}</Badge>;
};

const scoreColor = (n: number) =>
  n >= 80 ? "text-emerald-600" : n >= 60 ? "text-amber-600" : "text-destructive";

export default function GenesisPrcPage() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true); setError(null);
    const { data, error } = await supabase.functions.invoke("genesis-prc-orchestrator", { body: {} });
    setRunning(false);
    if (error) { setError(error.message); return; }
    setReport(data);
  };

  return (
    <>
      <Helmet><title>Genesis PRC | Admin</title></Helmet>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold">Genesis Production Recovery Cycle</h1>
            <p className="text-muted-foreground text-sm">
              Autonomous orchestrator that invokes every existing Genesis engine and returns one executive report.
              No new infra, no synthetic data.
            </p>
          </div>
          <Button onClick={run} disabled={running} size="lg">
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Run GPRC cycle
          </Button>
        </div>

        {error && <div className="p-4 border rounded bg-destructive/10 text-destructive text-sm">{error}</div>}

        {report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                ["Overall", report.overall_health_score],
                ["Revenue", report.readiness?.revenue],
                ["Traffic", report.readiness?.traffic],
                ["Conversion", report.readiness?.conversion],
                ["Checkout", report.readiness?.checkout],
                ["Pinterest", report.readiness?.pinterest],
              ].map(([label, val]) => (
                <Card key={String(label)}>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{label as string}</CardTitle></CardHeader>
                  <CardContent><div className={`text-3xl font-bold ${scoreColor(Number(val) || 0)}`}>{val ?? "—"}</div></CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle>First Sale Prediction</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><div className="text-muted-foreground">Probability</div><div className="text-2xl font-bold">{report.first_sale?.probability_pct}%</div></div>
                <div><div className="text-muted-foreground">ETA (days)</div><div className="text-2xl font-bold">{report.first_sale?.eta_days ?? "—"}</div></div>
                <div><div className="text-muted-foreground">Confidence</div><div className="text-2xl font-bold">{Math.round((report.first_sale?.confidence ?? 0) * 100)}%</div></div>
                <div><div className="text-muted-foreground">Paid orders 14d</div><div className="text-2xl font-bold">{report.orders_14d?.paid}</div></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Funnel (14 days, canonical_events)</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
                {Object.entries(report.funnel_14d ?? {}).map(([k, v]) => (
                  <div key={k} className="p-3 border rounded">
                    <div className="text-muted-foreground text-xs">{k}</div>
                    <div className="text-xl font-semibold">{v as number}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Subsystem Health</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(report.subsystems ?? []).map((s: any) => (
                  <div key={s.name} className="flex items-start justify-between border-b pb-2 gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        {statusBadge(s.status)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">reuses: {s.reuses}</div>
                      {s.blocks?.length > 0 && (
                        <div className="text-xs text-destructive mt-1">blocks: {s.blocks.join(", ")}</div>
                      )}
                    </div>
                    <pre className="text-[10px] text-muted-foreground overflow-x-auto max-w-md">{JSON.stringify(s.evidence, null, 0)}</pre>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top Bottlenecks</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(report.top_bottlenecks ?? []).map((b: any, i: number) => (
                  <div key={i} className="p-3 border rounded flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2"><span className="font-semibold">#{i + 1}</span>{statusBadge(b.status)}<span>{b.area}</span></div>
                      <div className="text-xs text-muted-foreground">reuses: {b.reuses}</div>
                    </div>
                    <pre className="text-[10px] text-muted-foreground overflow-x-auto max-w-md">{JSON.stringify(b.evidence, null, 0)}</pre>
                  </div>
                ))}
                {(report.top_bottlenecks ?? []).length === 0 && <div className="text-muted-foreground">No bottlenecks — system healthy.</div>}
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Repairs completed</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {(report.repairs_completed ?? []).map((r: any, i: number) => (
                    <div key={i} className="flex justify-between border-b pb-1"><code>{r.engine}</code><span className="text-muted-foreground text-xs">{JSON.stringify(r.result)}</span></div>
                  ))}
                  {(report.repairs_completed ?? []).length === 0 && <div className="text-muted-foreground">None invoked.</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Repairs skipped</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {(report.repairs_skipped ?? []).map((r: any, i: number) => (
                    <div key={i} className="border-b pb-1"><code className="font-medium">{r.engine}</code><div className="text-muted-foreground text-xs">{r.reason}</div></div>
                  ))}
                  {(report.repairs_skipped ?? []).length === 0 && <div className="text-muted-foreground">None.</div>}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}