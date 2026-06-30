import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Sparkles, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

type GenomeRow = {
  trait_dim: string;
  trait_value: string;
  sample_n: number;
  wins: number;
  losses: number;
  purchases: number;
  winner_wilson: number;
  loser_wilson: number;
  net_score: number;
};

type Learning = {
  id: string;
  gene_type: string | null;
  gene_value: string | null;
  insight: string | null;
  delta_weight: number | null;
  confidence: number | null;
  created_at: string;
};

type Snapshot = { taken_at: string; snapshot: any };

type Prediction = {
  creative_id: string;
  predicted_value: number;
  confidence: number;
  created_at: string;
};

export function CreativeIntelligenceV4Card() {
  const [winners, setWinners] = useState<GenomeRow[]>([]);
  const [losers, setLosers] = useState<GenomeRow[]>([]);
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [predicted, setPredicted] = useState<Prediction[]>([]);
  const [purchaseP, setPurchaseP] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [w, l, le, sn, pr, mem] = await Promise.all([
      supabase.from("gv4_genome_v" as never).select("*").order("net_score", { ascending: false }).limit(10),
      supabase.from("gv4_genome_v" as never).select("*").order("net_score", { ascending: true }).limit(10),
      supabase.from("gcd_learnings").select("id,gene_type,gene_value,insight,delta_weight,confidence,created_at")
        .gte("created_at", since).order("created_at", { ascending: false }).limit(15),
      supabase.from("pei_weight_snapshots" as never).select("taken_at, snapshot").order("taken_at", { ascending: false }).limit(7),
      supabase.from("gcd_predictions").select("creative_id,predicted_value,confidence,created_at")
        .eq("prediction_type", "purchase_probability").order("created_at", { ascending: false }).limit(20),
      supabase.from("gv36_first_sale_memory" as never).select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setWinners((w.data as any) ?? []);
    setLosers((l.data as any) ?? []);
    setLearnings((le.data as any) ?? []);
    setSnapshots((sn.data as any) ?? []);
    setPredicted((pr.data as any) ?? []);
    const m = (mem.data as any) ?? null;
    setPurchaseP(m?.bayes_p ?? m?.purchase_probability ?? null);
  }

  useEffect(() => { void load(); }, []);

  async function runFn(name: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(name);
      if (error) throw error;
      toast.success(name, { description: JSON.stringify(data).slice(0, 160) });
      await load();
    } catch (e: any) {
      toast.error(name, { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  const topPred = predicted.slice(0, 5);
  const bottomPred = [...predicted].sort((a, b) => a.predicted_value - b.predicted_value).slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4" /> Creative Intelligence (V4)
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={loading} onClick={() => runFn("cie-v4-dna-backfill")}>
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null} Tag DNA
          </Button>
          <Button size="sm" disabled={loading} onClick={() => runFn("cie-v4-learn")}>
            <Sparkles className="h-3 w-3 mr-1" /> Learn now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <section>
            <h3 className="text-xs font-semibold mb-2 flex items-center gap-1 text-emerald-500">
              <TrendingUp className="h-3 w-3" /> Winner DNA
            </h3>
            <ul className="space-y-1 text-xs">
              {winners.map((g) => (
                <li key={`${g.trait_dim}:${g.trait_value}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <Badge variant="secondary" className="mr-1">{g.trait_dim}</Badge>{g.trait_value}
                  </span>
                  <span className="font-mono text-emerald-500">+{g.net_score.toFixed(2)} <span className="text-muted-foreground">n={g.sample_n}</span></span>
                </li>
              ))}
              {!winners.length && <li className="text-muted-foreground">No winning traits yet — run Learn.</li>}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-semibold mb-2 flex items-center gap-1 text-red-500">
              <TrendingDown className="h-3 w-3" /> Loser DNA
            </h3>
            <ul className="space-y-1 text-xs">
              {losers.map((g) => (
                <li key={`${g.trait_dim}:${g.trait_value}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <Badge variant="outline" className="mr-1">{g.trait_dim}</Badge>{g.trait_value}
                  </span>
                  <span className="font-mono text-red-500">{g.net_score.toFixed(2)} <span className="text-muted-foreground">n={g.sample_n}</span></span>
                </li>
              ))}
              {!losers.length && <li className="text-muted-foreground">No losing traits yet.</li>}
            </ul>
          </section>
        </div>

        <section>
          <h3 className="text-xs font-semibold mb-2">Emerging patterns (24h)</h3>
          <ul className="space-y-1 text-xs">
            {learnings.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <Badge variant="secondary" className="mr-1">{l.gene_type}</Badge>
                  {l.gene_value} — {l.insight}
                </span>
                <span className="font-mono text-muted-foreground">
                  Δ {l.delta_weight?.toFixed(2)} · c={Number(l.confidence ?? 0).toFixed(2)}
                </span>
              </li>
            ))}
            {!learnings.length && <li className="text-muted-foreground">No new learnings yet.</li>}
          </ul>
        </section>

        <div className="grid grid-cols-2 gap-4">
          <section>
            <h3 className="text-xs font-semibold mb-2">Predicted winners</h3>
            <ul className="space-y-1 text-xs">
              {topPred.map((p) => (
                <li key={p.creative_id} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px]">{p.creative_id.slice(0, 8)}</span>
                  <span className="font-mono text-emerald-500">{(p.predicted_value * 100).toFixed(0)}%</span>
                </li>
              ))}
              {!topPred.length && <li className="text-muted-foreground">No drafts predicted.</li>}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-semibold mb-2">Predicted failures</h3>
            <ul className="space-y-1 text-xs">
              {bottomPred.map((p) => (
                <li key={p.creative_id} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px]">{p.creative_id.slice(0, 8)}</span>
                  <span className="font-mono text-red-500">{(p.predicted_value * 100).toFixed(0)}%</span>
                </li>
              ))}
              {!bottomPred.length && <li className="text-muted-foreground">No drafts predicted.</li>}
            </ul>
          </section>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Evolution snapshots</div>
            <div className="font-mono text-sm">{snapshots.length}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Tracked traits</div>
            <div className="font-mono text-sm">{winners.length + losers.length}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Purchase probability</div>
            <div className="font-mono text-sm">{purchaseP != null ? `${(Number(purchaseP) * 100).toFixed(1)}%` : "—"}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CreativeIntelligenceV4Card;