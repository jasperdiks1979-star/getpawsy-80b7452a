import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Score = {
  product_id: string;
  opportunity_score: number;
  tier: string;
  projected_revenue_cents: number;
  projected_ctr: number;
  projected_conversion: number;
  projected_margin: number;
  demand_score: number;
  trend_score: number;
  inventory_safety_score: number;
  diversity_score: number;
  confidence: number;
  block_reasons: string[];
  computed_at: string;
};
type Meeting = {
  meeting_date: string;
  products_evaluated: number;
  winners_selected: number;
  hidden_gems: number;
  expected_total_revenue_cents: number;
  briefing: string;
};

const pct = (n: number) => `${Math.round((n ?? 0) * 100)}%`;
const usd = (c: number) => `$${((c ?? 0) / 100).toFixed(0)}`;

export default function PieEnginePage() {
  const [rows, setRows] = useState<Score[]>([]);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: s }, { data: m }] = await Promise.all([
      supabase
        .from("pie_product_scores")
        .select("*")
        .order("opportunity_score", { ascending: false })
        .limit(200),
      supabase
        .from("pie_daily_meetings")
        .select("*")
        .order("meeting_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setRows((s ?? []) as Score[]);
    setMeeting((m ?? null) as any);
  }

  useEffect(() => { load(); }, []);

  async function run(action: string, dry = false) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pie-engine", {
        body: { action, dry_run: dry },
      });
      if (error) throw error;
      toast.success(`${action}: ${data?.score?.scored ?? data?.decide?.decisions ?? "ok"}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tiers = ["all", "winner", "high_opp", "watch", "neutral", "skip"];
  const filtered = filter === "all" ? rows : rows.filter((r) => r.tier === filter);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <Helmet>
        <title>Product Intelligence Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Product Intelligence Engine (PIE)</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Phase 4. Continuously scored Opportunity per product → decides WHAT
            PCIE-V2 should promote. Nightly at 02:15 UTC.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" disabled={busy} onClick={() => run("score_all")}>
            Score all
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => run("decide")}>
            Decide
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => run("daily_meeting")}>
            Daily meeting
          </Button>
          <Button disabled={busy} onClick={() => run("run_full")}>
            Run full
          </Button>
        </div>
      </div>

      {meeting && (
        <Card>
          <CardHeader>
            <CardTitle>Daily AI Meeting — {meeting.meeting_date}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">{meeting.briefing}</p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Evaluated: <b>{meeting.products_evaluated}</b></span>
              <span>Winners: <b>{meeting.winners_selected}</b></span>
              <span>Hidden gems: <b>{meeting.hidden_gems}</b></span>
              <span>Expected revenue: <b>{usd(meeting.expected_total_revenue_cents)}</b></span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        {tiers.map((t) => (
          <Button
            key={t}
            variant={filter === t ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(t)}
          >
            {t} ({t === "all" ? rows.length : rows.filter((r) => r.tier === t).length})
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top {Math.min(filtered.length, 100)} by Opportunity Score</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scores yet. Click <b>Run full</b>.
            </p>
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
                    <th>CTR</th>
                    <th>CVR</th>
                    <th>Demand</th>
                    <th>Trend</th>
                    <th>Inv. safety</th>
                    <th>Diversity</th>
                    <th>Conf</th>
                    <th>Blocks</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((r, i) => (
                    <tr key={r.product_id} className="border-t border-border">
                      <td className="py-2">{i + 1}</td>
                      <td className="font-mono">{r.product_id.slice(0, 8)}</td>
                      <td>
                        <Badge variant={r.opportunity_score >= 65 ? "default" : "secondary"}>
                          {r.opportunity_score.toFixed(1)}
                        </Badge>
                      </td>
                      <td><Badge variant="outline">{r.tier}</Badge></td>
                      <td>{pct(r.projected_margin)}</td>
                      <td>{pct(r.projected_ctr)}</td>
                      <td>{pct(r.projected_conversion)}</td>
                      <td>{pct(r.demand_score)}</td>
                      <td>{pct(r.trend_score)}</td>
                      <td>{pct(r.inventory_safety_score)}</td>
                      <td>{pct(r.diversity_score)}</td>
                      <td>{pct(r.confidence)}</td>
                      <td className="text-amber-600">
                        {r.block_reasons?.length ? r.block_reasons.join(", ") : "—"}
                      </td>
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