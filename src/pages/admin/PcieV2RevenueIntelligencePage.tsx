import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Snapshot = {
  snapshot_date: string;
  top_dna: any[]; worst_dna: any[];
  winning_hooks: any[]; winning_scenes: any[];
  winning_emotions: any[]; winning_typography: any[];
  revenue_per_style: any[]; ctr_per_hook: any[]; roas_per_family: any[];
  learning_speed: number; mutation_rate: number;
  totals: { impressions: number; outbound: number; revenue_cents: number; creatives: number };
};

export default function PcieV2RevenueIntelligencePage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [lineage, setLineage] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, r, t, l] = await Promise.all([
      supabase.from("pcie_v2_revenue_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("pcie_v2_evolution_runs").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("pcie_v2_trend_signals").select("*").order("detected_at", { ascending: false }).limit(20),
      supabase.from("pcie_v2_evolution_lineage").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setSnap((s.data as any) ?? null);
    setRuns((r.data as any) ?? []);
    setTrends((t.data as any) ?? []);
    setLineage((l.data as any) ?? []);
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pcie-v2-revenue-intelligence", { body: {} });
      if (error) throw error;
      toast.success(`Evolution run complete: ${data?.winners ?? 0} winners, ${data?.mutations_queued ?? 0} mutations queued`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    } finally { setBusy(false); }
  };

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">PCIE-V2 Revenue Intelligence</h1>
          <p className="text-muted-foreground">Self-improving creative AI optimized for revenue, not aesthetics.</p>
        </div>
        <Button onClick={runNow} disabled={busy}>{busy ? "Running…" : "Run evolution now"}</Button>
      </div>

      {snap && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Creatives evaluated</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{snap.totals?.creatives ?? 0}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Impressions</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{(snap.totals?.impressions ?? 0).toLocaleString()}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Outbound clicks</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{(snap.totals?.outbound ?? 0).toLocaleString()}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Revenue (7d)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(snap.totals?.revenue_cents ?? 0)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Learning / Mutation</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{(snap.learning_speed ?? 0).toFixed(2)} / {(snap.mutation_rate ?? 0).toFixed(2)}</CardContent></Card>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle>Top DNA</CardTitle></CardHeader><CardContent className="space-y-2 text-xs max-h-96 overflow-auto">
          {(snap?.top_dna ?? []).map((d, i) => (
            <div key={i} className="border-b pb-2"><div className="font-mono">{d.fingerprint}</div><div className="text-muted-foreground">score {Number(d.score).toFixed(1)}</div></div>
          ))}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Worst DNA</CardTitle></CardHeader><CardContent className="space-y-2 text-xs max-h-96 overflow-auto">
          {(snap?.worst_dna ?? []).map((d, i) => (
            <div key={i} className="border-b pb-2"><div className="font-mono">{d.fingerprint}</div><div className="text-muted-foreground">score {Number(d.score).toFixed(1)}</div></div>
          ))}
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { title: "Winning hooks", rows: snap?.winning_hooks },
          { title: "Winning scenes", rows: snap?.winning_scenes },
          { title: "Winning emotions", rows: snap?.winning_emotions },
          { title: "Winning typography", rows: snap?.winning_typography },
          { title: "Revenue per style", rows: snap?.revenue_per_style },
          { title: "CTR per hook", rows: snap?.ctr_per_hook },
        ].map((b) => (
          <Card key={b.title}><CardHeader><CardTitle className="text-base">{b.title}</CardTitle></CardHeader><CardContent className="space-y-1 text-xs">
            {(b.rows ?? []).map((r: any, i: number) => (
              <div key={i} className="flex justify-between"><span className="font-mono">{r.value}</span><span>{Number(r.avg_score ?? 0).toFixed(1)} · n={r.samples}</span></div>
            ))}
            {(!b.rows || b.rows.length === 0) && <div className="text-muted-foreground">No data yet</div>}
          </CardContent></Card>
        ))}
      </div>

      <Card><CardHeader><CardTitle>Trend signals</CardTitle></CardHeader><CardContent className="space-y-1 text-xs">
        {trends.map((t) => (
          <div key={t.id} className="flex items-center gap-2"><Badge variant="outline">{t.trend_type}</Badge><span className="font-mono">{t.trend_key}</span><span className="text-muted-foreground">infl {Number(t.influence).toFixed(2)} · conf {Number(t.confidence).toFixed(2)}</span></div>
        ))}
        {trends.length === 0 && <div className="text-muted-foreground">No trends detected yet — run evolution.</div>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Latest evolution lineage</CardTitle></CardHeader><CardContent className="space-y-2 text-xs max-h-96 overflow-auto">
        {lineage.map((l) => (
          <div key={l.id} className="border-b pb-2">
            <div>parent <span className="font-mono">{l.parent_creative_id?.slice(0, 8)}</span> → child <span className="font-mono">{l.child_creative_id?.slice(0, 8)}</span></div>
            <div className="text-muted-foreground">mutated: {Object.keys(l.mutated_traits ?? {}).join(", ") || "—"}</div>
            <div className="text-muted-foreground">{l.rationale}</div>
          </div>
        ))}
        {lineage.length === 0 && <div className="text-muted-foreground">No mutations yet.</div>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Recent runs</CardTitle></CardHeader><CardContent className="space-y-1 text-xs">
        {runs.map((r) => (
          <div key={r.id} className="flex justify-between border-b py-1">
            <span>{new Date(r.started_at).toLocaleString()} · {r.status}</span>
            <span>eval {r.creatives_evaluated} · win {r.winners_selected} · mut {r.mutations_queued} · ret {r.losers_retired}</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}