import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Target, Shield, Zap, Calendar, BarChart3, Users, DollarSign } from "lucide-react";
import {
  CLUSTER_PROFILES,
  SCENARIOS,
  projectClusterRevenue,
  COMPETITOR_DATA,
  simulateMarketShare,
  NINETY_DAY_ROADMAP,
  type ClusterProjection,
} from "@/lib/cluster-revenue-engine";

function fmt$(n: number) { return '$' + n.toLocaleString(); }
function fmtN(n: number) { return n.toLocaleString(); }

function RevenueTable({ projections }: { projections: ClusterProjection[] }) {
  return (
    <div className="overflow-x-auto border rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 text-left">
            <th className="p-3 font-semibold">Scenario</th>
            <th className="p-3 font-semibold">Search Vol</th>
            <th className="p-3 font-semibold">Est. Clicks</th>
            <th className="p-3 font-semibold">Est. Orders</th>
            <th className="p-3 font-semibold">Mo. 1</th>
            <th className="p-3 font-semibold">Mo. 2</th>
            <th className="p-3 font-semibold">Mo. 3</th>
            <th className="p-3 font-semibold">90-Day Total</th>
          </tr>
        </thead>
        <tbody>
          {projections.map((p, i) => (
            <tr key={p.scenario} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
              <td className="p-3 font-medium">
                <Badge variant={i === 0 ? 'secondary' : i === 1 ? 'default' : 'destructive'}>
                  {p.scenario}
                </Badge>
              </td>
              <td className="p-3">{fmtN(p.totalMonthlySearchVolume)}</td>
              <td className="p-3">{fmtN(p.estimatedClicks)}</td>
              <td className="p-3">{fmtN(p.estimatedOrders)}</td>
              <td className="p-3">{fmt$(p.month1Revenue)}</td>
              <td className="p-3">{fmt$(p.month2Revenue)}</td>
              <td className="p-3 font-semibold">{fmt$(p.month3Revenue)}</td>
              <td className="p-3 font-bold text-primary">{fmt$(p.ninetyDayTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompetitorMatrix({ clusterId }: { clusterId: string }) {
  const data = COMPETITOR_DATA[clusterId];
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="p-3 font-semibold">Domain</th>
              <th className="p-3 font-semibold">DA</th>
              <th className="p-3 font-semibold">Content</th>
              <th className="p-3 font-semibold">Links</th>
              <th className="p-3 font-semibold">Schema</th>
              <th className="p-3 font-semibold">FAQ</th>
              <th className="p-3 font-semibold">Tables</th>
              <th className="p-3 font-semibold">Intent Gap</th>
            </tr>
          </thead>
          <tbody>
            {data.competitors.map((c, i) => (
              <tr key={c.domain} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                <td className="p-3 font-medium">{c.domain}</td>
                <td className="p-3">{c.estimatedDA}</td>
                <td className="p-3"><Badge variant={c.contentDepth === 'deep' ? 'default' : c.contentDepth === 'moderate' ? 'secondary' : 'outline'}>{c.contentDepth}</Badge></td>
                <td className="p-3"><Badge variant={c.internalLinkStrength === 'strong' ? 'default' : c.internalLinkStrength === 'moderate' ? 'secondary' : 'outline'}>{c.internalLinkStrength}</Badge></td>
                <td className="p-3">{c.structuredData ? '✅' : '❌'}</td>
                <td className="p-3">{c.faqPresence ? '✅' : '❌'}</td>
                <td className="p-3">{c.comparisonTables ? '✅' : '❌'}</td>
                <td className="p-3"><Badge variant={c.commercialIntentGap === 'high' ? 'destructive' : c.commercialIntentGap === 'medium' ? 'secondary' : 'outline'}>{c.commercialIntentGap}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" />Weaknesses</CardTitle></CardHeader>
          <CardContent><ul className="text-xs space-y-1 text-muted-foreground">{data.weaknesses.map((w, i) => <li key={i}>• {w}</li>)}</ul></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" />Attack Opportunities</CardTitle></CardHeader>
          <CardContent><ul className="text-xs space-y-1 text-muted-foreground">{data.attackOpportunities.map((a, i) => <li key={i}>• {a}</li>)}</ul></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4" />Quick-Win Keywords (pos 8–20)</CardTitle></CardHeader>
          <CardContent><div className="flex flex-wrap gap-1">{data.quickWinKeywords.map(k => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" />Long-Tail Targets</CardTitle></CardHeader>
          <CardContent><div className="flex flex-wrap gap-1">{data.longTailKeywords.map(k => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}</div></CardContent>
        </Card>
      </div>
    </div>
  );
}

function RoadmapSection() {
  const months = [NINETY_DAY_ROADMAP.month1, NINETY_DAY_ROADMAP.month2, NINETY_DAY_ROADMAP.month3];
  return (
    <div className="space-y-6">
      {months.map((m, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-3">
              <Badge variant={i === 0 ? 'secondary' : i === 1 ? 'default' : 'destructive'}>Month {i + 1}</Badge>
              <span className="text-lg">{m.title}</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{m.focus}</p>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Execution Tasks</h4>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  {m.tasks.map((t, j) => <li key={j} className="flex items-start gap-1.5"><span className="text-primary mt-0.5">▸</span>{t}</li>)}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Target KPIs</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{m.kpis.indexedPages}</div>
                    <div className="text-[10px] text-muted-foreground">Indexed Pages</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{m.kpis.keywordsTop20}</div>
                    <div className="text-[10px] text-muted-foreground">Keywords Top 20</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{m.kpis.keywordsTop10}</div>
                    <div className="text-[10px] text-muted-foreground">Keywords Top 10</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{fmtN(m.kpis.organicClicks)}</div>
                    <div className="text-[10px] text-muted-foreground">Organic Clicks</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ClusterRevenueEngine() {
  const allProjections = CLUSTER_PROFILES.map(cluster =>
    SCENARIOS.map(scenario => projectClusterRevenue(cluster, scenario))
  );
  const combinedSixMonth = allProjections.flat().filter(p => p.scenario === 'Moderate').reduce((s, p) => s + p.ninetyDayTotal * 2, 0);
  const marketSim = simulateMarketShare();

  return (
    <>
      <Helmet>
        <title>Cluster Revenue Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Multi-Cluster Revenue Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Revenue simulation, competitor attack model, and 90-day execution roadmap across 3 clusters.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center"><DollarSign className="w-5 h-5 mx-auto text-primary mb-1" /><div className="text-2xl font-bold">{fmt$(combinedSixMonth)}</div><div className="text-[10px] text-muted-foreground">6-Month Projected (Moderate)</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><Users className="w-5 h-5 mx-auto text-primary mb-1" /><div className="text-2xl font-bold">3</div><div className="text-[10px] text-muted-foreground">Active Clusters</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><BarChart3 className="w-5 h-5 mx-auto text-primary mb-1" /><div className="text-2xl font-bold">{marketSim.revenueGrowthPct}%</div><div className="text-[10px] text-muted-foreground">Revenue Growth Potential</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><Calendar className="w-5 h-5 mx-auto text-primary mb-1" /><div className="text-2xl font-bold">80</div><div className="text-[10px] text-muted-foreground">Target Indexed Pages (90d)</div></CardContent></Card>
        </div>

        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList>
            <TabsTrigger value="revenue">Revenue Projections</TabsTrigger>
            <TabsTrigger value="competitors">Competitor Attack</TabsTrigger>
            <TabsTrigger value="roadmap">90-Day Roadmap</TabsTrigger>
            <TabsTrigger value="market">Market Share</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="space-y-6">
            {CLUSTER_PROFILES.map((cluster, idx) => (
              <Card key={cluster.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{cluster.name}</span>
                    <Badge variant="outline">AOV: {fmt$(cluster.aov)}</Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{cluster.primaryKeywords.length} tracked keywords · {fmtN(cluster.primaryKeywords.reduce((s, k) => s + k.monthlyVolume, 0))} total monthly search volume</p>
                </CardHeader>
                <CardContent>
                  <RevenueTable projections={allProjections[idx]} />
                </CardContent>
              </Card>
            ))}
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader><CardTitle>Combined 6-Month Revenue Projection</CardTitle></CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-3 gap-4">
                  {['Conservative', 'Moderate', 'Aggressive'].map(label => {
                    const total = allProjections.flat().filter(p => p.scenario === label).reduce((s, p) => s + p.ninetyDayTotal * 2, 0);
                    return (
                      <div key={label} className="bg-card border rounded-xl p-4 text-center">
                        <div className="text-sm font-medium mb-1">{label}</div>
                        <div className="text-2xl font-bold text-primary">{fmt$(total)}</div>
                        <div className="text-[10px] text-muted-foreground">6-month projected</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="competitors" className="space-y-6">
            {CLUSTER_PROFILES.map(cluster => (
              <Card key={cluster.id}>
                <CardHeader><CardTitle>{cluster.name} — Competitor Attack Model</CardTitle></CardHeader>
                <CardContent><CompetitorMatrix clusterId={cluster.id} /></CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="roadmap">
            <RoadmapSection />
          </TabsContent>

          <TabsContent value="market" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>6-Month Market Share Simulation</CardTitle>
                <p className="text-sm text-muted-foreground">If 15 keywords reach top 3, 30 reach top 10, CTR improves 12%, CVR improves 1%</p>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-primary">{marketSim.revenueGrowthPct}%</div>
                    <div className="text-xs text-muted-foreground">Revenue Growth</div>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-primary">{marketSim.organicTrafficGrowthPct}%</div>
                    <div className="text-xs text-muted-foreground">Traffic Growth</div>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold">{fmt$(marketSim.currentMonthlyRevenue)}</div>
                    <div className="text-xs text-muted-foreground">Current Mo. Revenue</div>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-primary">{fmt$(marketSim.projectedMonthlyRevenue)}</div>
                    <div className="text-xs text-muted-foreground">Projected Mo. Revenue</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="bg-card border rounded-xl p-4">
                    <div className="text-sm font-semibold mb-1">Market Share Shift</div>
                    <p className="text-xs text-muted-foreground">{marketSim.marketShareShift}</p>
                  </div>
                  <div className="bg-card border rounded-xl p-4">
                    <div className="text-sm font-semibold mb-1">Scaling Recommendation</div>
                    <p className="text-xs text-muted-foreground">{marketSim.scalingRecommendation}</p>
                  </div>
                  <div className="bg-card border rounded-xl p-4">
                    <div className="text-sm font-semibold mb-1">Risk Analysis</div>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      <li>• Algorithm volatility — mitigated by EEAT depth and multi-cluster diversification</li>
                      <li>• Competitor response — 60-day lag expected before major competitors react</li>
                      <li>• Content quality decay — prevented by editorial standards and expert tone enforcement</li>
                      <li>• Indexing delays — mitigated by GSC crawl acceleration and sitemap segmentation</li>
                    </ul>
                  </div>
                  <div className="bg-primary/5 border-primary/20 border rounded-xl p-4">
                    <div className="text-sm font-semibold mb-1">Break-Even Timeline</div>
                    <p className="text-xs text-muted-foreground">At moderate scenario projections, content investment break-even is estimated at Month 3–4 assuming $2,000/month content production cost. ROI accelerates significantly after Month 4 as indexed content compounds organic traffic.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
