import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Target, AlertTriangle, Layers, Brain, Calendar, Globe } from "lucide-react";
import { toast } from "sonner";

type Snapshot = {
  generated_at: string;
  data_freshness_minutes: number;
  overview: {
    market_score: number;
    us_opportunity_score: number;
    competition_level: string;
    demand_trend: string;
    market_confidence: number;
    top_opportunities: any[];
    top_threats: any[];
    emerging_count: number;
    declining_count: number;
  };
  trends: { clusters: any[]; trending_products: any[] };
  keywords: any[];
  competitors: { patterns: any[]; opportunities: any[] };
  visual_trends: { dna_samples: any[] };
  categories: any[];
  seasonal: any[];
  content_gaps: any[];
  us_market: { boards: any[] };
  product_match: any[];
  recommendations: any[];
  counts: Record<string, number>;
};

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

export default function PinterestMarketIntelligencePage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("pinterest-market-intelligence");
      if (error) throw error;
      setData(res as Snapshot);
    } catch (e: any) {
      setErr(e?.message || "Failed");
      toast.error("Failed to load market intelligence", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <Helmet>
        <title>Pinterest Market Intelligence | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5" /> Pinterest Market Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only aggregator. Trends · Keywords · Competitors · Gaps · Products. Recommendations flow to Execution Center.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null} Refresh
        </Button>
      </header>

      {err && <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div>}

      {!data && loading && (
        <div className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading market intelligence…
        </div>
      )}

      {data && (
        <>
          {/* Module 1 — Overview */}
          <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Stat label="Market Score" value={data.overview.market_score} hint="Composite 0–100" />
            <Stat label="US Opportunity" value={data.overview.us_opportunity_score} />
            <Stat label="Demand Trend" value={<span className="capitalize text-base">{data.overview.demand_trend}</span>}
              hint={`Competition: ${data.overview.competition_level}`} />
            <Stat label="Confidence" value={`${data.overview.market_confidence}%`}
              hint={`Updated ${new Date(data.generated_at).toLocaleTimeString()}`} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-4 w-4" /> Top Opportunities</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {data.overview.top_opportunities.slice(0, 20).map((o: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate">{o.title ?? o.label ?? o.keyword ?? "—"}</span>
                    <Badge variant="secondary">{Math.round(Number(o.impact_score ?? o.score ?? 0))}</Badge>
                  </div>
                ))}
                {!data.overview.top_opportunities.length && <p className="text-muted-foreground">No opportunities yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Threats & Declining</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {data.overview.top_threats.slice(0, 20).map((t: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate">{t.label ?? t.keyword ?? "—"}</span>
                    <Badge variant="outline">{t.status ?? "decl"}</Badge>
                  </div>
                ))}
                {!data.overview.top_threats.length && <p className="text-muted-foreground">No declining signals.</p>}
              </CardContent>
            </Card>
          </div>

          {/* Modules 2-3 — Trends & Keywords */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Trend Clusters</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {data.trends.clusters.slice(0, 15).map((c: any) => (
                  <div key={c.id} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate font-medium">{c.label}</span>
                    <span className="flex gap-2 text-muted-foreground font-mono">
                      <Badge variant="outline">{c.status}</Badge>
                      <span>s {Number(c.signal_score).toFixed(0)}</span>
                      <span>v {Number(c.velocity).toFixed(2)}</span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top Keywords (Pinterest Intent)</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs max-h-96 overflow-auto">
                {data.keywords.slice(0, 25).map((k: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate">{k.keyword ?? k.term}</span>
                    <span className="font-mono text-muted-foreground">{Math.round(Number(k.trend_score ?? k.score ?? 0))}</span>
                  </div>
                ))}
                {!data.keywords.length && <p className="text-muted-foreground">No keyword trends yet.</p>}
              </CardContent>
            </Card>
          </div>

          {/* Modules 4 + 8 — Competitors + Gaps */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /> Competitor Patterns</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {data.competitors.patterns.slice(0, 12).map((p: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate"><Badge variant="outline" className="mr-2">{p.pattern_type}</Badge>{p.pattern_value}</span>
                    <span className="font-mono">{Math.round(Number(p.avg_success ?? 0))}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Content Gaps</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs max-h-96 overflow-auto">
                {data.content_gaps.slice(0, 25).map((g: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate">{g.title ?? g.label}</span>
                    <Badge variant="secondary">{Math.round(Number(g.impact_score ?? 0))}</Badge>
                  </div>
                ))}
                {!data.content_gaps.length && <p className="text-muted-foreground">No gaps detected.</p>}
              </CardContent>
            </Card>
          </div>

          {/* Modules 7, 9, 10 — Seasonal, US Market, Product Match */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Seasonal</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs max-h-72 overflow-auto">
                {data.seasonal.slice(0, 15).map((s: any, i: number) => (
                  <div key={i} className="flex justify-between border-b py-1">
                    <span className="truncate">{s.keyword ?? s.label}</span>
                    <span className="font-mono text-muted-foreground">{Math.round(Number(s.score ?? 0))}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> US Boards</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs max-h-72 overflow-auto">
                {data.us_market.boards.slice(0, 15).map((b: any) => (
                  <div key={b.id ?? b.board_id} className="flex justify-between border-b py-1">
                    <span className="truncate">{b.board_name ?? b.name ?? b.board_id}</span>
                    <span className="font-mono text-muted-foreground">${Math.round(Number(b.revenue ?? 0))}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top Products (Pinterest Match)</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs max-h-72 overflow-auto">
                {data.product_match.slice(0, 15).map((p: any) => (
                  <div key={p.product_id} className="flex justify-between border-b py-1">
                    <span className="truncate font-mono">#{p.rank} {p.product_id.slice(0, 8)}</span>
                    <span className="font-mono text-muted-foreground">
                      {p.pinterest_score ?? "—"} / {Number(p.composite_score).toFixed(1)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pending Recommendations → Execution Center</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs max-h-96 overflow-auto">
              {data.recommendations.slice(0, 30).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-2 border-b py-1">
                  <div className="min-w-0">
                    <Badge variant="outline" className="mr-2 capitalize">{r.target_type}</Badge>
                    <span className="font-medium">{r.action}</span>
                    <span className="text-muted-foreground ml-2 truncate">{r.reasoning}</span>
                  </div>
                  <span className="font-mono shrink-0">{Math.round((r.confidence ?? 0) * 100)}%</span>
                </div>
              ))}
              {!data.recommendations.length && (
                <p className="text-muted-foreground">No pending recommendations.</p>
              )}
            </CardContent>
          </Card>

          <footer className="text-xs text-muted-foreground">
            counts: {Object.entries(data.counts).map(([k, v]) => `${k}=${v}`).join(" · ")}
          </footer>
        </>
      )}
    </div>
  );
}