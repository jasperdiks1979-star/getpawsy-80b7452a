import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, ShieldCheck, TrendingUp, AlertTriangle, Sparkles } from "lucide-react";

type Cls = "winner" | "growing" | "stable" | "weak" | "dead" | "needs_replacement";
type Pin = {
  pin_id: string; product_id: string | null; title: string | null; description: string | null;
  hook: string | null; board_id: string | null; board_name: string | null;
  impressions: number; clicks: number; saves: number; ctr: number; age_days: number;
  quality_score: number; trust_score: number; distribution_score: number; us_reach_score: number;
  growth_score: number; classification: Cls; confidence: number;
};
type Payload = {
  ok: boolean;
  generated_at: string;
  classification_counts: Record<Cls, number>;
  pins_top: Pin[];
  root_causes: { pin_id: string; growth_score: number; classification: Cls; causes: { cause: string; evidence: string; confidence: number; impact: string; fix: string }[] }[];
  evolution: { pin_id: string; base_growth_score: number; predicted_lift: number; vary: string[] }[];
  diversity: { dupTitles: number; dupProducts: number; titleDiversity: number; boardDiversity: number; uniqueBoards: number };
  keywords: { top: { keyword: string; score: number; ctr_observed: number | null; used_count: number; niche: string | null }[]; coverage: number };
  boards: { board_id: string; board_name: string; classification: string; us_share_30d: number; revenue_cents_30d: number; clicks_30d: number; publish_weight: number; recommendations: string[] }[];
  publishing_strategy: { pins_per_day: number; gap_minutes: number; best_hours_utc: { utc_hour: number; ctr: number; impr: number }[]; us_zone_recommendation: string };
  simulation: Record<"current" | "improved" | "aggressive" | "seasonal", { impressions: number; clicks: number; saves: number; purchases: number; revenue_cents: number }>;
  learning: { sample_size: number; winners: number; winning_hooks: (string | null)[]; winning_boards: (string | null)[]; last_updated: string };
  executive: { overall_health: number; growth_score: number; distribution_score: number; creative_diversity: number; us_readiness: number; keyword_coverage: number; board_quality: number; publishing_quality: number; predicted_monthly_visitors: number; predicted_monthly_revenue_cents: number };
  opportunities: { pin_id: string; growth_score: number; est_revenue_lift_cents: number; action: string }[];
  risks: { pin_id: string; growth_score: number; reason: string; action: string }[];
  improvements: { pin_id: string; predicted_lift_pts: number; est_revenue_impact_cents: number; action: string }[];
  methodology: Record<string, unknown>;
};

const clsColor: Record<Cls, string> = {
  winner: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  growing: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  stable: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  weak: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  dead: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  needs_replacement: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

const fmtCents = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function Score({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  const color = value >= 75 ? "text-emerald-600" : value >= 50 ? "text-sky-600" : value >= 30 ? "text-amber-600" : "text-rose-600";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{Math.round(value)}{suffix}</div>
    </div>
  );
}

export default function PinterestGrowthPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);

  const run = async () => {
    setLoading(true); setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("pinterest-growth-engine", { body: {} });
    if (err) setError(err.message); else setData(res as Payload);
    setLoading(false);
  };
  useEffect(() => { run(); }, []);

  const counts = data?.classification_counts;
  const total = useMemo(() => counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0, [counts]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pinterest Growth Engine</h1>
          <p className="text-sm text-muted-foreground">Phase 6 — autonomous, read-only growth intelligence (no Pinterest mutations).</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Read-only</Badge>
          <Button onClick={run} disabled={loading} size="sm" variant="outline">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Re-run
          </Button>
        </div>
      </header>

      {error && <Card className="border-rose-500/40"><CardContent className="p-4 text-sm text-rose-700">{error}</CardContent></Card>}
      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analysing pins…</div>
      )}

      {data && (
        <>
          {/* Module 10 — Executive */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Score label="Health" value={data.executive.overall_health} />
            <Score label="Distribution" value={data.executive.distribution_score} />
            <Score label="US Readiness" value={data.executive.us_readiness} />
            <Score label="Creative Diversity" value={data.executive.creative_diversity} />
            <Score label="Board Quality" value={data.executive.board_quality} />
          </section>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Predicted monthly visitors</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{data.executive.predicted_monthly_visitors.toLocaleString()}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Predicted monthly revenue</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{fmtCents(data.executive.predicted_monthly_revenue_cents)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pins analysed</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{total.toLocaleString()}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Winners / Dead</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">
                <span className="text-emerald-600">{counts?.winner ?? 0}</span> / <span className="text-rose-600">{(counts?.dead ?? 0) + (counts?.needs_replacement ?? 0)}</span>
              </CardContent></Card>
          </section>

          <Tabs defaultValue="ranking" className="w-full">
            <TabsList className="flex w-full flex-wrap">
              <TabsTrigger value="ranking">Ranking</TabsTrigger>
              <TabsTrigger value="causes">Root Causes</TabsTrigger>
              <TabsTrigger value="evolution">Evolution</TabsTrigger>
              <TabsTrigger value="rotation">Rotation</TabsTrigger>
              <TabsTrigger value="keywords">Keywords</TabsTrigger>
              <TabsTrigger value="boards">Boards</TabsTrigger>
              <TabsTrigger value="strategy">Strategy</TabsTrigger>
              <TabsTrigger value="simulation">Simulation</TabsTrigger>
              <TabsTrigger value="learning">Learning</TabsTrigger>
              <TabsTrigger value="command">Command</TabsTrigger>
            </TabsList>

            <TabsContent value="ranking">
              <Card><CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Pin</TableHead><TableHead>Class</TableHead><TableHead>Score</TableHead>
                    <TableHead>Impr</TableHead><TableHead>CTR</TableHead><TableHead>US</TableHead><TableHead>Qual</TableHead><TableHead>Conf</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.pins_top.slice(0, 100).map(p => (
                      <TableRow key={p.pin_id}>
                        <TableCell className="max-w-[260px] truncate text-xs">{p.title ?? p.pin_id}</TableCell>
                        <TableCell><Badge variant="outline" className={clsColor[p.classification]}>{p.classification}</Badge></TableCell>
                        <TableCell className="font-semibold">{p.growth_score}</TableCell>
                        <TableCell>{p.impressions.toLocaleString()}</TableCell>
                        <TableCell>{(p.ctr * 100).toFixed(2)}%</TableCell>
                        <TableCell>{p.us_reach_score}</TableCell>
                        <TableCell>{p.quality_score}</TableCell>
                        <TableCell>{p.confidence.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="causes">
              <div className="space-y-3">
                {data.root_causes.slice(0, 40).map(rc => (
                  <Card key={rc.pin_id}>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm">Pin {rc.pin_id} <Badge variant="outline" className={clsColor[rc.classification]}>{rc.classification}</Badge></CardTitle>
                      <span className="text-xs text-muted-foreground">score {rc.growth_score}</span>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {rc.causes.map((c, i) => (
                        <div key={i} className="rounded-md border p-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{c.cause}</span>
                            <span className="text-xs text-muted-foreground">impact: {c.impact} · conf {(c.confidence * 100).toFixed(0)}%</span>
                          </div>
                          <div className="text-xs text-muted-foreground">Evidence: {c.evidence}</div>
                          <div className="text-xs">Fix: {c.fix}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="evolution">
              <Card><CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Pin</TableHead><TableHead>Base</TableHead><TableHead>Predicted lift</TableHead><TableHead>Vary</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.evolution.map(e => (
                      <TableRow key={e.pin_id}>
                        <TableCell className="text-xs">{e.pin_id}</TableCell>
                        <TableCell>{e.base_growth_score}</TableCell>
                        <TableCell className="font-semibold text-emerald-600">+{e.predicted_lift}</TableCell>
                        <TableCell className="text-xs">{e.vary.join(", ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="rotation">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Score label="Title diversity" value={data.diversity.titleDiversity} suffix="%" />
                <Score label="Board diversity" value={data.diversity.boardDiversity} suffix="%" />
                <Score label="Duplicate titles" value={data.diversity.dupTitles} />
                <Score label="Over-pinned products" value={data.diversity.dupProducts} />
              </div>
            </TabsContent>

            <TabsContent value="keywords">
              <Card><CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Keyword</TableHead><TableHead>Niche</TableHead><TableHead>Score</TableHead><TableHead>CTR</TableHead><TableHead>Used</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.keywords.top.map(k => (
                      <TableRow key={k.keyword}>
                        <TableCell className="text-sm">{k.keyword}</TableCell>
                        <TableCell className="text-xs">{k.niche ?? "—"}</TableCell>
                        <TableCell>{k.score?.toFixed?.(2) ?? k.score}</TableCell>
                        <TableCell>{k.ctr_observed != null ? `${(k.ctr_observed * 100).toFixed(2)}%` : "—"}</TableCell>
                        <TableCell>{k.used_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="boards">
              <Card><CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Board</TableHead><TableHead>Class</TableHead><TableHead>US%</TableHead><TableHead>Clicks 30d</TableHead><TableHead>Revenue 30d</TableHead><TableHead>Recommendations</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.boards.slice(0, 50).map(b => (
                      <TableRow key={b.board_id}>
                        <TableCell className="text-sm">{b.board_name}</TableCell>
                        <TableCell><Badge variant="outline">{b.classification}</Badge></TableCell>
                        <TableCell>{((b.us_share_30d ?? 0) * 100).toFixed(0)}%</TableCell>
                        <TableCell>{b.clicks_30d ?? 0}</TableCell>
                        <TableCell>{fmtCents(b.revenue_cents_30d ?? 0)}</TableCell>
                        <TableCell className="text-xs">{b.recommendations.join("; ") || "Hold"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="strategy">
              <Card><CardContent className="space-y-3 p-4 text-sm">
                <div>Pins / day: <b>{data.publishing_strategy.pins_per_day}</b> · Gap: <b>{data.publishing_strategy.gap_minutes} min</b></div>
                <div className="text-muted-foreground">{data.publishing_strategy.us_zone_recommendation}</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                  {data.publishing_strategy.best_hours_utc.map(h => (
                    <div key={h.utc_hour} className="rounded border p-2 text-center">
                      <div className="text-xs text-muted-foreground">UTC {h.utc_hour}:00</div>
                      <div className="font-semibold">{(h.ctr * 100).toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="simulation">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                {(Object.entries(data.simulation) as ["current" | "improved" | "aggressive" | "seasonal", typeof data.simulation.current][]).map(([k, v]) => (
                  <Card key={k}><CardHeader className="pb-2"><CardTitle className="text-sm capitalize">{k}</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <div>Impr: <b>{v.impressions.toLocaleString()}</b></div>
                      <div>Clicks: <b>{v.clicks.toLocaleString()}</b></div>
                      <div>Purchases: <b>{v.purchases}</b></div>
                      <div>Revenue: <b>{fmtCents(v.revenue_cents)}</b></div>
                    </CardContent></Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="learning">
              <Card><CardContent className="space-y-3 p-4 text-sm">
                <div>Sample size: <b>{data.learning.sample_size}</b> · Winners: <b>{data.learning.winners}</b></div>
                <div><span className="text-muted-foreground">Winning hooks:</span> {data.learning.winning_hooks.filter(Boolean).join(" · ") || "—"}</div>
                <div><span className="text-muted-foreground">Winning boards:</span> {data.learning.winning_boards.filter(Boolean).join(" · ") || "—"}</div>
                <div className="text-xs text-muted-foreground">Last updated {new Date(data.learning.last_updated).toLocaleString()}</div>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="command">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Top 20 opportunities</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    {data.opportunities.map(o => (<div key={o.pin_id} className="flex justify-between gap-2"><span className="truncate">{o.pin_id}</span><span className="text-emerald-600">+{fmtCents(o.est_revenue_lift_cents)}</span></div>))}
                  </CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Top 20 risks</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    {data.risks.map(r => (<div key={r.pin_id} className="flex justify-between gap-2"><span className="truncate">{r.pin_id}</span><span className="text-rose-600">{r.reason}</span></div>))}
                  </CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> Top 20 improvements</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    {data.improvements.map(i => (<div key={i.pin_id} className="flex justify-between gap-2"><span className="truncate">{i.pin_id}</span><span className="text-sky-600">+{i.predicted_lift_pts}pt · {fmtCents(i.est_revenue_impact_cents)}</span></div>))}
                  </CardContent></Card>
              </div>
            </TabsContent>
          </Tabs>

          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Methodology & Safety</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <pre className="whitespace-pre-wrap">{JSON.stringify(data.methodology, null, 2)}</pre>
              <div className="mt-2">Generated {new Date(data.generated_at).toLocaleString()}</div>
            </CardContent></Card>
        </>
      )}
    </div>
  );
}