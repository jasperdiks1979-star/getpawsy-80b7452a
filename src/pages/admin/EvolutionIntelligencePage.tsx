import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Dash = {
  counts: { dna: number };
  revenue_cents: number;
  top_genes: Array<{ gene_dimension: string; gene_value: string; weight: number; sample_count: number; country: string }>;
  reports: Array<{ week_start: string; briefing: string }>;
  predicted_winners: Array<{ product_id: string; expected_roas: number; expected_revenue_cents: number; expected_profit_cents: number; rationale: string; reason_codes: string[] }>;
  runs: Array<{ id: string; action: string; status: string; started_at: string; duration_ms: number }>;
};

export default function EvolutionIntelligencePage() {
  const [data, setData] = useState<Dash | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data: d } = await supabase.functions.invoke("pei-evolution-engine", {
      body: { action: "dashboard" },
    });
    if (d) setData(d as Dash);
  };

  const run = async (action: string) => {
    setBusy(action);
    try {
      await supabase.functions.invoke("pei-evolution-engine", { body: { action } });
      await load();
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <Helmet>
        <title>Evolution Intelligence (PEI-V1) | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Evolution Intelligence Engine</h1>
            <p className="text-sm text-muted-foreground">PEI-V1 · Creative DNA · Thompson Sampling · Weekly evolution</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["snapshot_dna","rollup_attribution","update_weights","predict_winners","weekly_report","retire_stale","run_full"].map((a) => (
              <Button key={a} variant="outline" size="sm" disabled={busy === a} onClick={() => run(a)}>
                {busy === a ? "Running…" : a}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardHeader><CardTitle>DNA records</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{data?.counts.dna ?? "—"}</CardContent></Card>
          <Card><CardHeader><CardTitle>14d attributed revenue</CardTitle></CardHeader><CardContent className="text-3xl font-bold">${((data?.revenue_cents ?? 0) / 100).toFixed(0)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Predicted winners</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{data?.predicted_winners.length ?? 0}</CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Top genes (US)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {data?.top_genes?.map((g, i) => (
                <div key={i} className="flex justify-between border-b py-1">
                  <span>{g.gene_dimension}: <b>{g.gene_value}</b></span>
                  <span className="text-muted-foreground">w {g.weight.toFixed(2)} · n {g.sample_count}</span>
                </div>
              ))}
              {!data?.top_genes?.length && <p className="text-muted-foreground">No gene data yet — run update_weights.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Predicted winners (US, current season)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data?.predicted_winners?.map((p) => (
              <div key={p.product_id} className="border rounded p-2">
                <div className="flex justify-between font-medium">
                  <span>{p.product_id.slice(0, 8)}…</span>
                  <span>ROAS {p.expected_roas?.toFixed(1)} · ${(p.expected_revenue_cents/100).toFixed(0)} rev · ${(p.expected_profit_cents/100).toFixed(0)} profit</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.rationale}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Weekly evolution reports</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data?.reports?.map((r) => (
              <div key={r.week_start} className="border rounded p-2">
                <div className="font-medium">{r.week_start}</div>
                <p className="text-muted-foreground">{r.briefing}</p>
              </div>
            ))}
            {!data?.reports?.length && <p className="text-muted-foreground">No reports yet — run weekly_report.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {data?.runs?.map((r) => (
              <div key={r.id} className="flex justify-between">
                <span>{r.action}</span>
                <span className={r.status === "ok" ? "text-green-600" : r.status === "error" ? "text-red-600" : ""}>{r.status} · {r.duration_ms}ms · {new Date(r.started_at).toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}