import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type BrainRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  predictions_computed: number;
  winners_amplified: number;
  drafts_enqueued: number;
  products_discovered: number;
  errors: number;
  summary: Record<string, unknown>;
};

type Prediction = {
  pin_id: string;
  product_id: string | null;
  winner_p: number;
  revenue_p: number;
  viral_p: number;
  computed_at: string;
};

type Tier = {
  product_id: string;
  product_slug: string | null;
  revenue_bucket: string | null;
  hidden_opportunity: boolean | null;
  discovery_source: string | null;
};

const fmt = (n: number) => n.toLocaleString();
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export default function PinterestBrainPage() {
  const [runs, setRuns] = useState<BrainRun[]>([]);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: r }, { data: p }, { data: t }] = await Promise.all([
      supabase.from("pinterest_brain_runs").select("*").order("started_at", { ascending: false }).limit(14),
      supabase.from("pinterest_pin_predictions").select("pin_id, product_id, winner_p, revenue_p, viral_p, computed_at").order("computed_at", { ascending: false }).limit(200),
      supabase.from("pinterest_product_tiers").select("product_id, product_slug, revenue_bucket, hidden_opportunity, discovery_source").not("revenue_bucket", "is", null).limit(500),
    ]);
    setRuns((r ?? []) as BrainRun[]);
    setPreds((p ?? []) as Prediction[]);
    setTiers((t ?? []) as Tier[]);
  }

  useEffect(() => { load(); }, []);

  async function runBrain(dry: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-growth-brain", { body: { dry_run: dry } });
      if (error) throw error;
      toast.success(`${dry ? "Dry run" : "Brain run"} complete: ${data?.predictions_computed ?? 0} predictions, ${data?.winners_amplified ?? 0} amplified, ${data?.drafts_enqueued ?? 0} drafts`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const buckets = ["viral_winner", "revenue_winner", "emerging", "hidden_opportunity", "underperformer"] as const;
  const bucketLabels: Record<string, string> = {
    viral_winner: "Viral Winners",
    revenue_winner: "Revenue Winners",
    emerging: "Emerging Products",
    hidden_opportunity: "Hidden Opportunities",
    underperformer: "Underperformers",
  };
  const bucketCounts = buckets.reduce<Record<string, number>>((acc, b) => {
    acc[b] = tiers.filter((t) => t.revenue_bucket === b || (b === "hidden_opportunity" && t.hidden_opportunity)).length;
    return acc;
  }, {});

  const topPins = preds.slice(0, 20);
  const lastRun = runs[0];

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pinterest AI Growth Brain</h1>
          <p className="text-muted-foreground text-sm mt-1">Autonomous revenue-optimizing meta-orchestrator. Runs nightly at 02:45 UTC.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => runBrain(true)}>Dry run</Button>
          <Button disabled={busy} onClick={() => runBrain(false)}>Run brain now</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {buckets.map((b) => (
          <Card key={b}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{bucketLabels[b]}</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{fmt(bucketCounts[b] ?? 0)}</div></CardContent>
          </Card>
        ))}
      </div>

      {lastRun && (
        <Card>
          <CardHeader><CardTitle>Last Run</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div><div className="text-muted-foreground">Started</div><div>{new Date(lastRun.started_at).toLocaleString()}</div></div>
            <div><div className="text-muted-foreground">Predictions</div><div className="font-semibold">{lastRun.predictions_computed}</div></div>
            <div><div className="text-muted-foreground">Winners amplified</div><div className="font-semibold">{lastRun.winners_amplified}</div></div>
            <div><div className="text-muted-foreground">Drafts enqueued</div><div className="font-semibold">{lastRun.drafts_enqueued}</div></div>
            <div><div className="text-muted-foreground">Products discovered</div><div className="font-semibold">{lastRun.products_discovered}</div></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Top 20 Pins by Winner Probability</CardTitle></CardHeader>
        <CardContent>
          {topPins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No predictions yet. Click "Run brain now" to generate.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-2">Pin</th><th>Winner</th><th>Revenue</th><th>Viral</th><th>Computed</th></tr>
                </thead>
                <tbody>
                  {topPins.map((p) => (
                    <tr key={`${p.pin_id}-${p.computed_at}`} className="border-t border-border">
                      <td className="py-2 font-mono text-xs">{p.pin_id.slice(0, 12)}</td>
                      <td><Badge variant={p.winner_p > 0.7 ? "default" : "secondary"}>{pct(p.winner_p)}</Badge></td>
                      <td><Badge variant={p.revenue_p > 0.7 ? "default" : "secondary"}>{pct(p.revenue_p)}</Badge></td>
                      <td><Badge variant={p.viral_p > 0.7 ? "default" : "secondary"}>{pct(p.viral_p)}</Badge></td>
                      <td className="text-muted-foreground">{new Date(p.computed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Brain Runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-2">Started</th><th>Predictions</th><th>Amplified</th><th>Drafts</th><th>Discovered</th><th>Errors</th></tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2">{new Date(r.started_at).toLocaleString()}</td>
                      <td>{r.predictions_computed}</td>
                      <td>{r.winners_amplified}</td>
                      <td>{r.drafts_enqueued}</td>
                      <td>{r.products_discovered}</td>
                      <td>{r.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}