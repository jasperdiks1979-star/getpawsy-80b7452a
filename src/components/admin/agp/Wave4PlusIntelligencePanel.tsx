import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props { loading: boolean; onRun: (dry: boolean) => Promise<void> }

type Explanation = {
  subscore: string; prev_value: number | null; curr_value: number; abs_delta: number;
  pct_delta: number; reason: string; confidence: number; business_impact: string;
  root_cause: string; expected_trend: string;
};
type Priority = {
  id: string; title: string; description: string | null; priority_score: number;
  revenue_impact: number; pinterest_impact: number; seo_impact: number;
  difficulty: number; confidence: number; source: string;
};
type Opp = {
  product_id: string; rank: number | null; overall_score: number;
  revenue_potential: number; pinterest_potential: number; seo_potential: number;
  profit_potential: number; expected_monthly_rev_cents: number; expected_annual_rev_cents: number;
};
type Forecast = { metric: string; horizon_days: number; predicted: number; low: number; high: number; confidence: number };
type Insights = any;
type BusinessExp = { subscore: string; narrative_md: string; suggested_actions: any; expected_score_after: number | null };
type Accuracy = { metric: string; horizon_days: number; predicted: number; actual: number; pct_error: number };

export function Wave4PlusIntelligencePanel({ loading, onRun }: Props) {
  const [exps, setExps] = useState<Explanation[]>([]);
  const [pris, setPris] = useState<Priority[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [fcs, setFcs] = useState<Forecast[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [biz, setBiz] = useState<BusinessExp[]>([]);
  const [acc, setAcc] = useState<Accuracy[]>([]);

  async function load() {
    const [e, p, o, f, i, b, a] = await Promise.all([
      supabase.from("agp_score_explanations").select("*").order("day", { ascending: false }).limit(13),
      supabase.from("agp_action_priorities").select("*").order("priority_score", { ascending: false }).limit(20),
      supabase.from("agp_product_opportunity").select("*").order("overall_score", { ascending: false }).limit(20),
      supabase.from("agp_forecasts").select("*").order("day", { ascending: false }).limit(60),
      supabase.from("agp_daily_insights").select("*").order("day", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("agp_business_explanations").select("*").order("day", { ascending: false }).limit(13),
      supabase.from("agp_prediction_accuracy").select("*").order("day", { ascending: false }).limit(20),
    ]);
    setExps((e.data as any) ?? []);
    setPris((p.data as any) ?? []);
    setOpps((o.data as any) ?? []);
    setFcs((f.data as any) ?? []);
    setInsights(i.data ?? null);
    setBiz((b.data as any) ?? []);
    setAcc((a.data as any) ?? []);
  }

  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Wave 4A+ — Growth Intelligence Layer</CardTitle>
          <p className="text-xs text-muted-foreground">Explainers, priority engine, opportunity index, forecasts, self-improvement.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={async () => { await onRun(true); load(); }} disabled={loading}>Dry-run</Button>
          <Button size="sm" onClick={async () => { await onRun(false); load(); }} disabled={loading}>Run intelligence</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="explanations">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="explanations">Score explanations</TabsTrigger>
            <TabsTrigger value="business">Business narrative</TabsTrigger>
            <TabsTrigger value="priorities">Action priorities</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunity index</TabsTrigger>
            <TabsTrigger value="forecasts">Forecasts</TabsTrigger>
            <TabsTrigger value="insights">Daily insights</TabsTrigger>
            <TabsTrigger value="self">Self-improvement</TabsTrigger>
          </TabsList>

          <TabsContent value="explanations">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-2 text-xs">
              {exps.map(e => (
                <div key={e.subscore} className="rounded border p-2">
                  <div className="flex items-center justify-between">
                    <strong>{e.subscore}</strong>
                    <Badge variant={e.abs_delta > 0 ? "default" : e.abs_delta < 0 ? "destructive" : "secondary"}>
                      {e.abs_delta > 0 ? "+" : ""}{Number(e.abs_delta).toFixed(1)}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">prev {Number(e.prev_value ?? 0).toFixed(0)} → {Number(e.curr_value).toFixed(0)} ({Number(e.pct_delta).toFixed(0)}%)</div>
                  <div className="mt-1">{e.reason}</div>
                  <div className="text-muted-foreground text-[10px]">cause: {e.root_cause} · impact: {e.business_impact} · trend: {e.expected_trend} · conf {(Number(e.confidence) * 100).toFixed(0)}%</div>
                </div>
              ))}
              {!exps.length && <div className="text-muted-foreground">No explanations yet. Run intelligence.</div>}
            </div>
          </TabsContent>

          <TabsContent value="business">
            <div className="space-y-2 mt-2 text-xs">
              {biz.map(b => (
                <div key={b.subscore} className="rounded border p-2">
                  <div className="flex justify-between"><strong>{b.subscore}</strong><span className="text-muted-foreground">→ expected {Number(b.expected_score_after ?? 0).toFixed(0)}</span></div>
                  <div className="mt-1 whitespace-pre-wrap">{b.narrative_md}</div>
                  {Array.isArray(b.suggested_actions) && b.suggested_actions.length > 0 && (
                    <ul className="list-disc ml-4 mt-1">{b.suggested_actions.map((a: any, i: number) => <li key={i}>{typeof a === "string" ? a : JSON.stringify(a)}</li>)}</ul>
                  )}
                </div>
              ))}
              {!biz.length && <div className="text-muted-foreground">No business narrative yet.</div>}
            </div>
          </TabsContent>

          <TabsContent value="priorities">
            <table className="w-full text-xs mt-2">
              <thead><tr className="text-left text-muted-foreground"><th>#</th><th>Title</th><th>Rev</th><th>Pin</th><th>SEO</th><th>Diff</th><th>Conf</th><th>Score</th></tr></thead>
              <tbody>{pris.map((p, i) => (
                <tr key={p.id} className="border-t">
                  <td>{i + 1}</td>
                  <td className="py-1">{p.title}<div className="text-[10px] text-muted-foreground">{p.source}</div></td>
                  <td>{Number(p.revenue_impact).toFixed(0)}</td>
                  <td>{Number(p.pinterest_impact).toFixed(0)}</td>
                  <td>{Number(p.seo_impact).toFixed(0)}</td>
                  <td>{Number(p.difficulty).toFixed(0)}</td>
                  <td>{(Number(p.confidence) * 100).toFixed(0)}%</td>
                  <td><Badge>{Number(p.priority_score).toFixed(0)}</Badge></td>
                </tr>
              ))}{!pris.length && <tr><td colSpan={8} className="text-muted-foreground py-2">No priorities yet.</td></tr>}</tbody>
            </table>
          </TabsContent>

          <TabsContent value="opportunities">
            <table className="w-full text-xs mt-2">
              <thead><tr className="text-left text-muted-foreground"><th>Rank</th><th>Product</th><th>Overall</th><th>Rev pot.</th><th>Pin</th><th>SEO</th><th>Profit</th><th>Exp $/mo</th><th>Exp $/yr</th></tr></thead>
              <tbody>{opps.map(o => (
                <tr key={o.product_id} className="border-t">
                  <td>#{o.rank}</td>
                  <td className="font-mono text-[10px]">{o.product_id.slice(0, 8)}</td>
                  <td><Badge>{Number(o.overall_score).toFixed(0)}</Badge></td>
                  <td>{Number(o.revenue_potential).toFixed(0)}</td>
                  <td>{Number(o.pinterest_potential).toFixed(0)}</td>
                  <td>{Number(o.seo_potential).toFixed(0)}</td>
                  <td>{Number(o.profit_potential).toFixed(0)}</td>
                  <td>${(o.expected_monthly_rev_cents / 100).toFixed(0)}</td>
                  <td>${(o.expected_annual_rev_cents / 100).toFixed(0)}</td>
                </tr>
              ))}{!opps.length && <tr><td colSpan={9} className="text-muted-foreground py-2">No opportunity index yet.</td></tr>}</tbody>
            </table>
          </TabsContent>

          <TabsContent value="forecasts">
            <table className="w-full text-xs mt-2">
              <thead><tr className="text-left text-muted-foreground"><th>Metric</th><th>Horizon</th><th>Predicted</th><th>Low</th><th>High</th><th>Conf</th></tr></thead>
              <tbody>{fcs.map((f, i) => (
                <tr key={i} className="border-t">
                  <td>{f.metric}</td>
                  <td>{f.horizon_days}d</td>
                  <td>{Number(f.predicted).toFixed(1)}</td>
                  <td>{Number(f.low).toFixed(1)}</td>
                  <td>{Number(f.high).toFixed(1)}</td>
                  <td>{(Number(f.confidence) * 100).toFixed(0)}%</td>
                </tr>
              ))}{!fcs.length && <tr><td colSpan={6} className="text-muted-foreground py-2">No forecasts yet.</td></tr>}</tbody>
            </table>
          </TabsContent>

          <TabsContent value="insights">
            {insights ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-xs">
                <div className="rounded border p-2"><strong>Top wins</strong><pre className="whitespace-pre-wrap">{JSON.stringify(insights.top_wins, null, 2)}</pre></div>
                <div className="rounded border p-2"><strong>Top problems</strong><pre className="whitespace-pre-wrap">{JSON.stringify(insights.top_problems, null, 2)}</pre></div>
                <div className="rounded border p-2"><strong>Biggest opportunity</strong><pre className="whitespace-pre-wrap">{JSON.stringify(insights.biggest_opportunity, null, 2)}</pre></div>
                <div className="rounded border p-2"><strong>Biggest threat</strong><pre className="whitespace-pre-wrap">{JSON.stringify(insights.biggest_threat, null, 2)}</pre></div>
              </div>
            ) : <div className="text-muted-foreground text-xs mt-2">No insights yet.</div>}
          </TabsContent>

          <TabsContent value="self">
            <table className="w-full text-xs mt-2">
              <thead><tr className="text-left text-muted-foreground"><th>Metric</th><th>Horizon</th><th>Predicted</th><th>Actual</th><th>% Error</th></tr></thead>
              <tbody>{acc.map((a, i) => (
                <tr key={i} className="border-t">
                  <td>{a.metric}</td><td>{a.horizon_days}d</td>
                  <td>{Number(a.predicted).toFixed(1)}</td>
                  <td>{Number(a.actual).toFixed(1)}</td>
                  <td>{(Number(a.pct_error) * 100).toFixed(1)}%</td>
                </tr>
              ))}{!acc.length && <tr><td colSpan={5} className="text-muted-foreground py-2">No accuracy samples yet.</td></tr>}</tbody>
            </table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}