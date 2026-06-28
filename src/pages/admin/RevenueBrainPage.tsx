import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { recordDecision } from "@/lib/governanceLedger";

type ScoreRow = {
  product_id: string;
  product_slug: string | null;
  score_0_1000: number;
  tier: string;
  components: Record<string, number> | null;
  bestseller_p: number | null;
  viral_p: number | null;
  repeat_p: number | null;
  computed_at: string;
};

type Forecast = { product_id: string; horizon: number; sessions: number; purchases: number; revenue_cents: number };

const pct = (n: number | null | undefined) => `${Math.round((Number(n ?? 0)) * 100)}%`;
const fmtUsd = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export default function RevenueBrainPage() {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [forecasts, setForecasts] = useState<Map<string, Forecast>>(new Map());
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    const [{ data: s }, { data: f }] = await Promise.all([
      supabase.from("pinterest_revenue_opportunity_scores").select("*").order("score_0_1000", { ascending: false }).limit(200),
      supabase.from("pinterest_revenue_forecasts").select("product_id, horizon, sessions, purchases, revenue_cents").eq("horizon", 30),
    ]);
    setRows((s ?? []) as ScoreRow[]);
    const m = new Map<string, Forecast>();
    for (const r of (f ?? []) as Forecast[]) m.set(r.product_id, r);
    setForecasts(m);
  }

  useEffect(() => { load(); }, []);

  async function run(action: "run_full" | "score" | "auto_promote", dry: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-revenue-brain", { body: { action, dry_run: dry } });
      if (error) throw error;
      toast.success(`${action}${dry ? " (dry)" : ""}: ${data?.products_scanned ?? data?.promoted ?? "ok"}`);
      await load();
      // Governance Ledger: log this strategic move once (deduped by run timestamp).
      if (!dry) {
        await recordDecision({
          sourceEngine: "revenue_ai",
          decisionType: `revenue_brain_${action}`,
          proposal: { action, products_scanned: data?.products_scanned, promoted: data?.promoted },
          expectedMetric: "revenue_cents",
          expectedValue: 0,
          confidence: 0.6,
          dedupeKey: `revenue_brain:${action}:${new Date().toISOString().slice(0,13)}`,
        });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = filter === "all" ? rows : rows.filter((r) => r.tier === filter);
  const tiers = ["all", "winner", "high_opp", "watch", "neutral", "skip"];
  const top100 = filtered.slice(0, 100);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Revenue Brain</h1>
          <p className="text-muted-foreground text-sm mt-1">Per-product RevenueOpportunityScore + auto-promotion. Runs nightly at 03:45 UTC.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" disabled={busy} onClick={() => run("run_full", true)}>Dry run</Button>
          <Button disabled={busy} onClick={() => run("run_full", false)}>Run brain now</Button>
          <Button variant="secondary" disabled={busy} onClick={() => run("auto_promote", false)}>Promote winners</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tiers.map((t) => (
          <Button key={t} variant={filter === t ? "default" : "outline"} size="sm" onClick={() => setFilter(t)}>
            {t} ({t === "all" ? rows.length : rows.filter((r) => r.tier === t).length})
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Top {top100.length} products by RevenueOpportunityScore</CardTitle></CardHeader>
        <CardContent>
          {top100.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scores yet. Click "Run brain now".</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">#</th>
                    <th>Product</th>
                    <th>Score</th>
                    <th>Tier</th>
                    <th>Margin</th>
                    <th>Trend</th>
                    <th>Comp</th>
                    <th>Saturation⁻¹</th>
                    <th>Sessions/30d</th>
                    <th>Revenue/30d</th>
                    <th>Bestseller</th>
                    <th>Viral</th>
                  </tr>
                </thead>
                <tbody>
                  {top100.map((r, i) => {
                    const f = forecasts.get(r.product_id);
                    const c = r.components ?? {};
                    return (
                      <tr key={r.product_id} className="border-t border-border">
                        <td className="py-2">{i + 1}</td>
                        <td className="font-mono">{r.product_slug ?? r.product_id.slice(0, 8)}</td>
                        <td><Badge variant={r.score_0_1000 >= 700 ? "default" : "secondary"}>{r.score_0_1000}</Badge></td>
                        <td><Badge variant="outline">{r.tier}</Badge></td>
                        <td>{pct(c.margin)}</td>
                        <td>{pct(c.trend_momentum)}</td>
                        <td>{pct(c.competitor_success)}</td>
                        <td>{pct(c.saturation_inverse)}</td>
                        <td>{f?.sessions ?? 0}</td>
                        <td>{f ? fmtUsd(f.revenue_cents) : "$0"}</td>
                        <td>{pct(r.bestseller_p)}</td>
                        <td>{pct(r.viral_p)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}