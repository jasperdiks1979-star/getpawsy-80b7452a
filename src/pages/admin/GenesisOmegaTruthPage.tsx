import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";

interface Snapshot {
  id: string; run_at: string;
  total_metrics: number; canonical_count: number; derived_count: number;
  experimental_count: number; deprecated_count: number; broken_count: number;
  unknown_count: number; conflict_count: number; resolved_count: number;
  data_integrity: number; revenue_integrity: number; analytics_integrity: number;
  financial_integrity: number; ai_integrity: number; operational_integrity: number;
  overall_truth_score: number; fingerprint: string; executive_report: any;
}
interface Metric { metric_key: string; display_name: string; domain: string; status: string; canonical_source: string; confidence: number; }
interface Conflict { id: string; metric_key: string; source_a: string; source_b: string; value_a: number; value_b: number; delta_pct: number; severity: string; status: string; explanation: string; detected_at: string; }

export default function GenesisOmegaTruthPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const [{ data: s }, { data: m }, { data: c }] = await Promise.all([
      supabase.from("genesis_truth_snapshots").select("*").order("run_at", { ascending: false }).limit(1),
      supabase.from("genesis_truth_metrics").select("*").order("domain"),
      supabase.from("genesis_truth_conflicts").select("*").order("detected_at", { ascending: false }).limit(50),
    ]);
    setSnap(((s?.[0] as unknown) as Snapshot) ?? null);
    setMetrics((m as unknown as Metric[]) ?? []);
    setConflicts((c as unknown as Conflict[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const run = async () => {
    setRunning(true); setErr(null);
    try {
      const { error } = await supabase.functions.invoke("genesis-omega-truth");
      if (error) throw error;
      await load();
    } catch (e: any) { setErr(e.message ?? String(e)); }
    finally { setRunning(false); }
  };

  const statusColor = (s: string) => ({
    canonical: "default", derived: "secondary", experimental: "outline",
    deprecated: "destructive", broken: "destructive", unknown: "outline",
  } as any)[s] ?? "outline";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7" /> Genesis Ω.3 — Unified Truth Platform
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            One certified truth for every number inside Genesis. Metrics not certified here may not drive dashboards, AI, reports or automation.
          </p>
        </div>
        <Button onClick={run} disabled={running} size="lg">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          Run Truth Audit
        </Button>
      </div>

      {err && <Card className="border-destructive"><CardContent className="pt-4 text-destructive">{err}</CardContent></Card>}

      {snap && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Stat label="Truth Score" value={`${snap.overall_truth_score}/100`} accent />
            <Stat label="Canonical" value={snap.canonical_count} />
            <Stat label="Experimental" value={snap.experimental_count} />
            <Stat label="Deprecated" value={snap.deprecated_count} />
            <Stat label="Broken" value={snap.broken_count} />
            <Stat label="Conflicts" value={snap.conflict_count} />
          </div>

          <Card>
            <CardHeader><CardTitle>Integrity by Domain</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-6 gap-3 text-sm">
              <Domain label="Data" v={snap.data_integrity} />
              <Domain label="Revenue" v={snap.revenue_integrity} />
              <Domain label="Analytics" v={snap.analytics_integrity} />
              <Domain label="Financial" v={snap.financial_integrity} />
              <Domain label="AI" v={snap.ai_integrity} />
              <Domain label="Operational" v={snap.operational_integrity} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Certification Fingerprint</CardTitle></CardHeader>
            <CardContent className="text-xs font-mono break-all">
              SHA-256: {snap.fingerprint} · run {new Date(snap.run_at).toLocaleString()}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Live Conflicts ({conflicts.length})</CardTitle></CardHeader>
        <CardContent>
          {!conflicts.length ? <p className="text-sm text-muted-foreground">No disagreements detected.</p> : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs bg-muted"><tr>
                  <th className="p-2 text-left">Metric</th><th className="p-2 text-left">A</th><th className="p-2 text-left">B</th>
                  <th className="p-2 text-right">Δ%</th><th className="p-2 text-left">Severity</th><th className="p-2 text-left">Status</th>
                </tr></thead>
                <tbody>
                  {conflicts.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-2 font-mono">{c.metric_key}</td>
                      <td className="p-2">{c.source_a}: {Number(c.value_a).toLocaleString()}</td>
                      <td className="p-2">{c.source_b}: {Number(c.value_b).toLocaleString()}</td>
                      <td className="p-2 text-right">{c.delta_pct?.toFixed?.(1) ?? "—"}%</td>
                      <td className="p-2"><Badge variant={c.severity === "high" ? "destructive" : "outline"}>{c.severity}</Badge></td>
                      <td className="p-2"><Badge variant={c.status === "open" ? "destructive" : "secondary"}>{c.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Certified Metric Registry ({metrics.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="text-xs bg-muted sticky top-0"><tr>
                <th className="p-2 text-left">Metric</th><th className="p-2 text-left">Domain</th>
                <th className="p-2 text-left">Status</th><th className="p-2 text-left">Canonical Source</th>
                <th className="p-2 text-right">Confidence</th>
              </tr></thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.metric_key} className="border-t">
                    <td className="p-2"><div className="font-medium">{m.display_name}</div><div className="text-xs font-mono text-muted-foreground">{m.metric_key}</div></td>
                    <td className="p-2 text-muted-foreground">{m.domain}</td>
                    <td className="p-2"><Badge variant={statusColor(m.status)}>{m.status}</Badge></td>
                    <td className="p-2 font-mono text-xs">{m.canonical_source}</td>
                    <td className="p-2 text-right">{m.confidence}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {!snap && !running && (
        <Card><CardContent className="pt-6 text-muted-foreground">No truth snapshot yet — run the first audit.</CardContent></Card>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary" : undefined}>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
function Domain({ label, v }: { label: string; v: number }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{v}/100</div>
    </div>
  );
}