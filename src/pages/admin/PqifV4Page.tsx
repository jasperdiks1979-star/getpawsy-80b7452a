import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

type Report = {
  generated_at: string;
  publishing: { blocked: boolean; reasons: string[] };
  runs: Array<{ id: string; run_type: string; status: string; started_at: string; finished_at: string | null; summary: any }>;
  strategies_by_status: Record<string, number>;
  experiments_by_status: Record<string, number>;
  regeneration_by_status: Record<string, number>;
  retired_pins_total: number;
  recent_decisions: Array<{ decision_type: string; verdict: string; created_at: string }>;
  top_revenue_potential: Array<{ product_id: string; revenue_potential: number; rank: number }>;
};

export default function PqifV4Page() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase.functions.invoke("pqif-v4-report");
    if (error) { toast.error(error.message); return; }
    setReport(data as Report);
  }
  useEffect(() => { load(); }, []);

  async function runOrchestrator() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pqif-v4-orchestrator", { body: {} });
      if (error) throw error;
      toast.success(`Run ${data?.run_id?.slice(0,8)} complete`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  function downloadJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `pqif-v4-report-${new Date().toISOString().slice(0,10)}.json`; a.click();
  }

  return (
    <>
      <Helmet><title>PQIF v4 — Autonomous Growth AI | Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="space-y-6 p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">PQIF v4 — Autonomous Growth AI</h1>
            <p className="text-muted-foreground text-sm mt-1">Continuous learning, strategy generation, weak-pin retirement & regeneration. Publishing remains globally paused.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>Refresh</Button>
            <Button variant="outline" onClick={downloadJson} disabled={!report}>Download JSON</Button>
            <Button onClick={runOrchestrator} disabled={busy}>{busy ? "Running…" : "Run orchestrator"}</Button>
          </div>
        </div>

        {report && (
          <>
            <Card>
              <CardHeader><CardTitle>Safety</CardTitle></CardHeader>
              <CardContent>
                <Badge variant={report.publishing.blocked ? "default" : "destructive"}>
                  Publishing: {report.publishing.blocked ? "PAUSED (safe)" : "OPEN"}
                </Badge>
                <div className="text-xs text-muted-foreground mt-2">Reasons: {report.publishing.reasons.join(", ") || "none"}</div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Retired pins</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold">{report.retired_pins_total}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Regen queue</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold">{report.regeneration_by_status?.queued ?? 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Strategies proposed</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold">{report.strategies_by_status?.proposed ?? 0}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Experiments queued</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold">{report.experiments_by_status?.queued ?? 0}</div></CardContent></Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground"><tr><th>Type</th><th>Status</th><th>Started</th><th>Finished</th></tr></thead>
                  <tbody>
                    {report.runs.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-2">{r.run_type}</td>
                        <td><Badge variant={r.status === "ok" ? "secondary" : r.status === "error" ? "destructive" : "outline"}>{r.status}</Badge></td>
                        <td>{new Date(r.started_at).toLocaleString()}</td>
                        <td>{r.finished_at ? new Date(r.finished_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top revenue-potential products</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground"><tr><th>Rank</th><th>Product</th><th>Score</th></tr></thead>
                  <tbody>
                    {report.top_revenue_potential.map((p) => (
                      <tr key={p.product_id} className="border-t border-border">
                        <td className="py-2">{p.rank}</td>
                        <td className="font-mono text-xs">{p.product_id.slice(0,12)}</td>
                        <td className="font-semibold">{p.revenue_potential}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent decisions (evidence trail)</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1">
                  {report.recent_decisions.slice(0, 20).map((d, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-muted-foreground">{new Date(d.created_at).toLocaleTimeString()}</span>
                      <span className="font-mono">{d.decision_type}</span>
                      <Badge variant="outline">{d.verdict}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}