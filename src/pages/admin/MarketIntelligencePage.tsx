import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AudienceIntelligenceTab } from "@/components/admin/market-intelligence/tabs/AudienceIntelligenceTab";
import { useToast } from "@/components/ui/use-toast";
import DataQualityWarning from "@/components/admin/analytics/DataQualityWarning";
import { MarketIntelligenceEngine } from "@/components/admin/market-intelligence/MarketIntelligenceEngine";
import { MarketCompetitorPanel } from "@/components/admin/market-intelligence/MarketCompetitorPanel";
import { MarketSignalPanel } from "@/components/admin/market-intelligence/MarketSignalPanel";
import { MarketTrendsPanel } from "@/components/admin/market-intelligence/MarketTrendsPanel";
import { MarketRecommendationsPanel } from "@/components/admin/market-intelligence/MarketRecommendationsPanel";
import { MarketGapActionsPanel } from "@/components/admin/market-intelligence/MarketGapActionsPanel";
import {
  fetchMarketHealth,
  fetchTrends,
  fetchEmergingTrends,
  fetchOpportunities,
  fetchCompetitorInsights,
  fetchRecommendations,
  fetchFirstSalePlan,
  fetchRecentAutopilotActions,
  promoteRecommendationToAutopilot,
  type MiRecommendation,
} from "@/lib/marketIntelligence";

const US_HOLIDAYS: { name: string; date: string }[] = [
  { name: "Independence Day", date: `${new Date().getFullYear()}-07-04` },
  { name: "Halloween",        date: `${new Date().getFullYear()}-10-31` },
  { name: "Thanksgiving",     date: `${new Date().getFullYear()}-11-27` },
  { name: "Black Friday",     date: `${new Date().getFullYear()}-11-28` },
  { name: "Cyber Monday",     date: `${new Date().getFullYear()}-12-01` },
  { name: "Christmas",        date: `${new Date().getFullYear()}-12-25` },
];

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground tracking-wider">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function HealthGrid() {
  const { data, isLoading } = useQuery({ queryKey: ["mi-health"], queryFn: fetchMarketHealth });
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <Stat label="Active trends" value={data.trends} />
      <Stat label="Signals 24h" value={data.signals_24h} />
      <Stat label="Open opportunities" value={data.opportunities_open} />
      <Stat label="Competitor obs" value={data.competitor_obs} />
      <Stat label="Pending recs" value={data.recommendations_pending} />
      <Stat
        label="Avg AI confidence"
        value={data.avg_recommendation_confidence !== null
          ? `${Math.round(data.avg_recommendation_confidence * 100)}%`
          : "—"}
      />
    </div>
  );
}

function FirstSalePlan() {
  const { data, isLoading } = useQuery({ queryKey: ["mi-first-sale-plan"], queryFn: () => fetchFirstSalePlan(15) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>First Sale AI — Today's Ranked Plan</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2">Composite</th>
                  <th className="text-right p-2">Prob</th>
                  <th className="text-right p-2">Rev</th>
                  <th className="text-right p-2">Pin</th>
                  <th className="text-right p-2">Google</th>
                  <th className="text-right p-2">Impulse</th>
                  <th className="text-right p-2">Urgency</th>
                  <th className="text-right p-2">Conf</th>
                  <th className="text-right p-2">Est. €</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((row, idx) => (
                  <tr key={row.product_id} className="border-t">
                    <td className="p-2 text-muted-foreground">{idx + 1}</td>
                    <td className="p-2">
                      <Link to={`/admin/product-intelligence-v3?product=${row.product_id}`} className="hover:underline">
                        {row.title ?? row.handle ?? row.product_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-2 text-right font-semibold">{row.composite_score.toFixed(1)}</td>
                    <td className="p-2 text-right">{row.lane_probability.toFixed(0)}</td>
                    <td className="p-2 text-right">{row.lane_revenue.toFixed(0)}</td>
                    <td className="p-2 text-right">{row.lane_pinterest.toFixed(0)}</td>
                    <td className="p-2 text-right">{row.lane_google.toFixed(0)}</td>
                    <td className="p-2 text-right">{row.lane_impulse.toFixed(0)}</td>
                    <td className="p-2 text-right">{row.lane_urgency.toFixed(0)}</td>
                    <td className="p-2 text-right">{Math.round(row.min_confidence)}%</td>
                    <td className="p-2 text-right">€{row.expected_revenue_eur.toFixed(0)}</td>
                  </tr>
                ))}
                {!data?.length && (
                  <tr><td colSpan={11} className="p-4 text-center text-muted-foreground text-sm">No scored products yet — run Product Intelligence and Pinterest Growth first.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendRadar() {
  const top = useQuery({ queryKey: ["mi-trends-top"], queryFn: () => fetchTrends(20) });
  const emerging = useQuery({ queryKey: ["mi-trends-emerging"], queryFn: () => fetchEmergingTrends(20) });
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Trend Radar — Highest Score</CardTitle></CardHeader>
        <CardContent>
          {top.isLoading ? <Skeleton className="h-32" /> : (
            <ul className="space-y-2 text-sm">
              {(top.data ?? []).slice(0, 12).map(t => (
                <li key={t.id} className="flex items-center justify-between gap-3 border-b pb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t.trend_type}</Badge>
                    <span>{t.term}</span>
                    {t.category && <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    score {Number(t.score).toFixed(1)} · m {Number(t.momentum).toFixed(1)}
                  </div>
                </li>
              ))}
              {!top.data?.length && <li className="text-muted-foreground text-sm">No trends yet.</li>}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Emerging — Highest Momentum</CardTitle></CardHeader>
        <CardContent>
          {emerging.isLoading ? <Skeleton className="h-32" /> : (
            <ul className="space-y-2 text-sm">
              {(emerging.data ?? []).slice(0, 12).map(t => (
                <li key={t.id} className="flex items-center justify-between gap-3 border-b pb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t.trend_type}</Badge>
                    <span>{t.term}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    m {Number(t.momentum).toFixed(1)} · src {t.source}
                  </div>
                </li>
              ))}
              {!emerging.data?.length && <li className="text-muted-foreground text-sm">No emerging signals.</li>}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OpportunityList() {
  const { data, isLoading } = useQuery({ queryKey: ["mi-opps"], queryFn: () => fetchOpportunities(25) });
  return (
    <Card>
      <CardHeader><CardTitle>Open Opportunities</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (
          <ul className="space-y-2 text-sm">
            {(data ?? []).map(o => (
              <li key={o.id} className="flex items-center justify-between gap-3 border-b pb-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{o.type}</Badge>
                  <span>{o.title}</span>
                </div>
                <div className="text-xs text-muted-foreground">score {Number(o.score).toFixed(1)}</div>
              </li>
            ))}
            {!data?.length && <li className="text-muted-foreground text-sm">No open opportunities.</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CompetitorPatterns() {
  const { data, isLoading } = useQuery({ queryKey: ["mi-comp-insights"], queryFn: () => fetchCompetitorInsights(20) });
  return (
    <Card>
      <CardHeader><CardTitle>Competitor Patterns (Latest)</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Competitor</th>
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2">Price</th>
                  <th className="text-right p-2">Rating</th>
                  <th className="text-right p-2">Reviews</th>
                  <th className="text-left p-2">Captured</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2"><Badge variant="secondary">{c.competitor}</Badge></td>
                    <td className="p-2">{c.title ?? c.product_handle ?? "—"}</td>
                    <td className="p-2 text-right">{c.price ? `$${Number(c.price).toFixed(2)}` : "—"}</td>
                    <td className="p-2 text-right">{c.rating ?? "—"}</td>
                    <td className="p-2 text-right">{c.review_count ?? "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{new Date(c.captured_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {!data?.length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-sm">No competitor data yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendedActions() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["mi-recs"], queryFn: () => fetchRecommendations(20) });
  const queue = async (rec: MiRecommendation) => {
    try {
      await promoteRecommendationToAutopilot(rec);
      toast({ title: "Queued in Autopilot", description: rec.action });
      refetch();
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Recommended Actions (AI)</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (
          <ul className="space-y-2 text-sm">
            {(data ?? []).map(r => (
              <li key={r.id} className="flex items-start justify-between gap-3 border-b pb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.target_type}</Badge>
                    <span className="font-medium">{r.action}</span>
                    {r.confidence !== null && (
                      <span className="text-xs text-muted-foreground">{Math.round(r.confidence * 100)}%</span>
                    )}
                  </div>
                  {r.reasoning && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.reasoning}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => queue(r)}>Queue</Button>
              </li>
            ))}
            {!data?.length && <li className="text-muted-foreground text-sm">No pending recommendations.</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AutopilotHistory() {
  const { data, isLoading } = useQuery({ queryKey: ["mi-autopilot"], queryFn: () => fetchRecentAutopilotActions(15) });
  return (
    <Card>
      <CardHeader><CardTitle>Autopilot — Recent Actions</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (
          <ul className="space-y-2 text-sm">
            {(data ?? []).map(a => (
              <li key={a.id} className="flex items-center justify-between gap-3 border-b pb-1">
                <div className="flex items-center gap-2">
                  <Badge variant={a.status === "executed" ? "default" : "secondary"}>{a.status}</Badge>
                  <span>{a.kind}</span>
                  <Badge variant="outline" className="text-[10px]">{a.priority}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.expected_revenue_eur ? `€${a.expected_revenue_eur} est` : ""} · {new Date(a.created_at).toLocaleString()}
                </div>
              </li>
            ))}
            {!data?.length && <li className="text-muted-foreground text-sm">No autopilot actions yet.</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HolidayCountdown() {
  const upcoming = US_HOLIDAYS
    .map(h => ({ ...h, days: daysUntil(h.date) }))
    .filter(h => h.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4);
  return (
    <Card>
      <CardHeader><CardTitle>US Holiday Countdown</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {upcoming.map(h => (
            <div key={h.name} className="border rounded-md p-3">
              <div className="text-xs text-muted-foreground">{h.name}</div>
              <div className="text-2xl font-semibold">{h.days}d</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketIntelligencePage() {
  return (
    <>
      <Helmet>
        <title>Market Intelligence OS — Genesis V3.3 | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Market Intelligence OS</h1>
            <p className="text-sm text-muted-foreground">Genesis V3.3 — derived from Product Intelligence, Pinterest Growth, Canonical Analytics, and external trend signals. No fabricated metrics.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/admin/growth-command-center">Growth Command</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/admin/product-intelligence-v3">PI V3</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/admin/pinterest-growth">Pinterest Growth</Link></Button>
          </div>
        </div>
        <DataQualityWarning />
        <HealthGrid />
        <Tabs defaultValue="executive" className="w-full">
          <TabsList>
            <TabsTrigger value="executive">Executive</TabsTrigger>
            <TabsTrigger value="audience">Audience</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="competitors">Competitors</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="engine">Engine</TabsTrigger>
          </TabsList>
          <TabsContent value="executive" className="space-y-4 mt-4">
            <FirstSalePlan />
            <div className="grid md:grid-cols-2 gap-4">
              <OpportunityList />
              <HolidayCountdown />
            </div>
            <RecommendedActions />
            <AutopilotHistory />
          </TabsContent>
          <TabsContent value="trends" className="space-y-4 mt-4">
            <TrendRadar />
            <MarketTrendsPanel />
            <MarketSignalPanel />
          </TabsContent>
          <TabsContent value="competitors" className="space-y-4 mt-4">
            <CompetitorPatterns />
            <MarketCompetitorPanel />
          </TabsContent>
          <TabsContent value="actions" className="space-y-4 mt-4">
            <MarketGapActionsPanel />
            <MarketRecommendationsPanel />
          </TabsContent>
          <TabsContent value="engine" className="space-y-4 mt-4">
            <MarketIntelligenceEngine />
          </TabsContent>
          <TabsContent value="audience" className="space-y-4 mt-4">
            <AudienceIntelligenceTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}