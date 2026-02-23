import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  TrendingUp, DollarSign, Target, Calendar, Zap, AlertTriangle, CheckCircle,
  BarChart3, ArrowUpRight, ArrowRight, Shield
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  simulateRevenue, SCENARIOS, DEFAULT_BASELINE,
  scoreCluster, CLUSTER_DEFINITIONS, generate90DayPlan,
  BREAKOUT_KEYWORDS,
  type BaselineMetrics, type RevenueSimulationResult, type AuthorityCluster,
} from "@/lib/growth-intelligence";

export function GrowthIntelligenceDashboard() {
  const [baseline, setBaseline] = useState<BaselineMetrics>(DEFAULT_BASELINE);
  const [blogPosts, setBlogPosts] = useState<{ slug: string; title: string; category: string }[]>([]);
  const [collections, setCollections] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("blog_posts").select("slug, title, category").eq("is_published", true),
      supabase.from("seo_collections").select("slug, name").eq("is_active", true),
    ]).then(([blogRes, collRes]) => {
      if (blogRes.data) setBlogPosts(blogRes.data);
      if (collRes.data) setCollections(collRes.data);
    });
  }, []);

  const simResults = useMemo(
    () => SCENARIOS.map(s => simulateRevenue(baseline, s)),
    [baseline]
  );

  const clusters = useMemo(
    () => CLUSTER_DEFINITIONS.map(def => scoreCluster(def, blogPosts, collections)),
    [blogPosts, collections]
  );

  const plan = useMemo(() => generate90DayPlan(), []);

  const highestRoiCluster = useMemo(() => {
    const sorted = [...clusters].sort((a, b) => {
      // Prioritize clusters with low authority but high potential (most gaps to close)
      const aScore = (100 - a.authorityScore) * (a.collections + 1);
      const bScore = (100 - b.authorityScore) * (b.collections + 1);
      return bScore - aScore;
    });
    return sorted[0];
  }, [clusters]);

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Growth Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Revenue simulation · Authority mapping · 90-day SERP domination
        </p>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Blog Posts"
          value={blogPosts.length.toString()}
        />
        <KpiCard
          icon={<Target className="h-4 w-4" />}
          label="SEO Collections"
          value={collections.length.toString()}
        />
        <KpiCard
          icon={<Zap className="h-4 w-4" />}
          label="Authority Clusters"
          value={clusters.length.toString()}
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Highest ROI Cluster"
          value={highestRoiCluster?.name || '—'}
          highlight
        />
      </div>

      <Tabs defaultValue="revenue" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="revenue">Revenue Simulation</TabsTrigger>
          <TabsTrigger value="authority">Authority Map</TabsTrigger>
          <TabsTrigger value="execution">90-Day Plan</TabsTrigger>
          <TabsTrigger value="keywords">Breakout Keywords</TabsTrigger>
        </TabsList>

        {/* TAB 1: REVENUE SIMULATION */}
        <TabsContent value="revenue" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" /> Baseline Metrics
              </CardTitle>
              <CardDescription>Adjust to match your current US Google organic data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MetricInput label="Impressions (28d)" value={baseline.impressions}
                  onChange={v => setBaseline(b => ({ ...b, impressions: v }))} />
                <MetricInput label="Avg Position" value={baseline.avgPosition}
                  onChange={v => setBaseline(b => ({ ...b, avgPosition: v }))} />
                <MetricInput label="CTR (%)" value={baseline.ctr * 100} step={0.1}
                  onChange={v => setBaseline(b => ({ ...b, ctr: v / 100 }))} />
                <MetricInput label="Indexed Pages" value={baseline.indexedPages}
                  onChange={v => setBaseline(b => ({ ...b, indexedPages: v }))} />
                <MetricInput label="CVR (%)" value={baseline.conversionRate * 100} step={0.1}
                  onChange={v => setBaseline(b => ({ ...b, conversionRate: v / 100 }))} />
                <MetricInput label="AOV ($)" value={baseline.aov}
                  onChange={v => setBaseline(b => ({ ...b, aov: v }))} />
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-3 gap-4">
            {simResults.map(r => (
              <ScenarioCard key={r.scenario.name} result={r} />
            ))}
          </div>

          {/* Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Delta Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scenario</TableHead>
                    <TableHead className="text-right">Traffic Δ</TableHead>
                    <TableHead className="text-right">Conversions Δ</TableHead>
                    <TableHead className="text-right">Monthly Rev Δ</TableHead>
                    <TableHead className="text-right">6-Month Lift</TableHead>
                    <TableHead className="text-right">ROI Multiple</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simResults.map(r => (
                    <TableRow key={r.scenario.name}>
                      <TableCell className="font-medium">{r.scenario.label}</TableCell>
                      <TableCell className="text-right text-green-600">+{r.trafficDelta}</TableCell>
                      <TableCell className="text-right text-green-600">+{r.conversionDelta}</TableCell>
                      <TableCell className="text-right text-green-600">+${r.monthlyRevenueDelta.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">+${r.sixMonthCumulativeLift.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-bold">{r.roiMultiple}x</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: AUTHORITY MAP */}
        <TabsContent value="authority" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            {clusters.map(c => (
              <ClusterCard key={c.name} cluster={c} />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Authority Scoring Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cluster</TableHead>
                    <TableHead>Namespace</TableHead>
                    <TableHead className="text-right">Blogs</TableHead>
                    <TableHead className="text-right">Collections</TableHead>
                    <TableHead className="text-right">Pillar %</TableHead>
                    <TableHead className="text-right">Link Score</TableHead>
                    <TableHead className="text-right">Authority</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...clusters].sort((a, b) => b.authorityScore - a.authorityScore).map(c => (
                    <TableRow key={c.name}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{c.namespace.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{c.blogPosts}</TableCell>
                      <TableCell className="text-right">{c.collections}</TableCell>
                      <TableCell className="text-right">{c.pillarCoverage}%</TableCell>
                      <TableCell className="text-right">{c.internalLinkScore}</TableCell>
                      <TableCell className="text-right font-bold">{c.authorityScore}</TableCell>
                      <TableCell>
                        {c.authorityScore >= 70 ? (
                          <Badge className="bg-green-100 text-green-700">Strong</Badge>
                        ) : c.authorityScore >= 50 ? (
                          <Badge className="bg-yellow-100 text-yellow-700">Growing</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700">Weak</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: 90-DAY PLAN */}
        <TabsContent value="execution" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <PhaseCard phase="Optimize" weeks="1–4" color="blue"
              items={['Rewrite 20 page titles', 'Add FAQ schema', 'Fix CWV', 'Add comparison tables']} />
            <PhaseCard phase="Publish" weeks="5–8" color="green"
              items={['24 new high-intent posts', '8 buyer guides', '8 comparisons', '8 problem-solving']} />
            <PhaseCard phase="Authority" weeks="9–12" color="purple"
              items={['Medium articles', 'Pinterest pins', 'Refresh 30 posts', 'Reddit engagement']} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" /> Weekly Execution Calendar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {plan.map(w => (
                  <div key={w.week} className="border rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant={w.phase === 'Optimize' ? 'default' : w.phase === 'Publish' ? 'secondary' : 'outline'}>
                        Week {w.week}
                      </Badge>
                      <span className="font-semibold text-sm">{w.phase} Phase</span>
                    </div>
                    <ul className="space-y-1 ml-4">
                      {w.tasks.map((t, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <ArrowRight className="h-3 w-3 mt-1 shrink-0" />
                          {t}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {w.kpis.map((k, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{k}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: BREAKOUT KEYWORDS */}
        <TabsContent value="keywords" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" /> Top 10 Breakout Keywords
              </CardTitle>
              <CardDescription>
                Keywords with highest revenue potential based on volume × CTR delta × CVR
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Cluster</TableHead>
                    <TableHead>Intent</TableHead>
                    <TableHead className="text-right">Est. Volume</TableHead>
                    <TableHead className="text-right">Current Pos</TableHead>
                    <TableHead className="text-right">Target Pos</TableHead>
                    <TableHead className="text-right">Potential Traffic</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BREAKOUT_KEYWORDS.sort((a, b) => b.potentialTraffic - a.potentialTraffic).map(kw => (
                    <TableRow key={kw.keyword}>
                      <TableCell className="font-medium">{kw.keyword}</TableCell>
                      <TableCell><Badge variant="outline">{kw.cluster}</Badge></TableCell>
                      <TableCell>
                        <Badge className={
                          kw.intent === 'commercial' ? 'bg-green-100 text-green-700' :
                          kw.intent === 'comparison' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }>{kw.intent}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{kw.estimatedVolume.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{kw.currentPosition ?? '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{kw.targetPosition}</TableCell>
                      <TableCell className="text-right font-bold text-green-600">+{kw.potentialTraffic}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Highest ROI Cluster */}
          {highestRoiCluster && (
            <Card className="border-2 border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" /> #1 Cluster to Attack First
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="text-xl font-bold">{highestRoiCluster.name}</h3>
                    <p className="text-muted-foreground">
                      Authority: {highestRoiCluster.authorityScore}/100 · 
                      {highestRoiCluster.gaps.length} gaps to close · 
                      {highestRoiCluster.collections} collections
                    </p>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {highestRoiCluster.gaps.map((g, i) => (
                        <Badge key={i} variant="destructive" className="text-xs">{g}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============= SUB-COMPONENTS =============

function KpiCard({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          {icon} {label}
        </div>
        <div className="text-lg font-bold truncate">{value}</div>
      </CardContent>
    </Card>
  );
}

function MetricInput({ label, value, onChange, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1"
      />
    </div>
  );
}

function ScenarioCard({ result }: { result: RevenueSimulationResult }) {
  const s = result.scenario;
  const color = s.name === 'conservative' ? 'border-blue-200' :
    s.name === 'aggressive' ? 'border-yellow-200' : 'border-green-200';

  return (
    <Card className={`${color} border-2`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          {s.name === 'breakout' && <Zap className="h-4 w-4 text-green-500" />}
          {s.label}
        </CardTitle>
        <CardDescription className="text-xs">{s.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Traffic</span>
          <span className="font-medium">{result.currentTraffic} → {result.projectedTraffic}
            <span className="text-green-600 ml-1">(+{result.trafficDelta})</span>
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Conversions</span>
          <span className="font-medium">{result.currentConversions} → {result.projectedConversions}
            <span className="text-green-600 ml-1">(+{result.conversionDelta})</span>
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Monthly Rev</span>
          <span className="font-bold">${result.currentMonthlyRevenue} → ${result.projectedMonthlyRevenue}
          </span>
        </div>
        <div className="border-t pt-2 mt-2">
          <div className="flex justify-between text-sm">
            <span>6-Month Lift</span>
            <span className="font-bold text-green-600">+${result.sixMonthCumulativeLift.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>ROI Multiple</span>
            <span className="font-bold text-primary">{result.roiMultiple}x</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ClusterCard({ cluster }: { cluster: AuthorityCluster }) {
  const statusColor = cluster.authorityScore >= 70 ? 'text-green-600' :
    cluster.authorityScore >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{cluster.name}</CardTitle>
          <span className={`text-2xl font-bold ${statusColor}`}>{cluster.authorityScore}</span>
        </div>
        <Badge variant="outline" className="w-fit capitalize">{cluster.namespace.replace('_', ' ')}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <div className="font-semibold">{cluster.blogPosts}</div>
            <div className="text-xs text-muted-foreground">Posts</div>
          </div>
          <div>
            <div className="font-semibold">{cluster.collections}</div>
            <div className="text-xs text-muted-foreground">Collections</div>
          </div>
          <div>
            <div className="font-semibold">{cluster.guides}</div>
            <div className="text-xs text-muted-foreground">Guides</div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>Pillar Coverage</span><span>{cluster.pillarCoverage}%</span>
          </div>
          <Progress value={cluster.pillarCoverage} className="h-1.5" />
        </div>

        <div className="flex gap-2 flex-wrap">
          {cluster.hasComparison ? (
            <Badge className="bg-green-100 text-green-700 text-xs">✓ Comparison</Badge>
          ) : (
            <Badge className="bg-red-100 text-red-700 text-xs">✗ Comparison</Badge>
          )}
          {cluster.hasBest2026 ? (
            <Badge className="bg-green-100 text-green-700 text-xs">✓ Best 2026</Badge>
          ) : (
            <Badge className="bg-red-100 text-red-700 text-xs">✗ Best 2026</Badge>
          )}
          {cluster.hasBuyerGuide ? (
            <Badge className="bg-green-100 text-green-700 text-xs">✓ Buyer Guide</Badge>
          ) : (
            <Badge className="bg-red-100 text-red-700 text-xs">✗ Buyer Guide</Badge>
          )}
        </div>

        {cluster.gaps.length > 0 && (
          <div className="border-t pt-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">Gaps:</div>
            {cluster.gaps.map((g, i) => (
              <div key={i} className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {g}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PhaseCard({ phase, weeks, color, items }: {
  phase: string; weeks: string; color: string; items: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {phase === 'Optimize' && <Shield className="h-4 w-4 text-blue-500" />}
          {phase === 'Publish' && <ArrowUpRight className="h-4 w-4 text-green-500" />}
          {phase === 'Authority' && <Zap className="h-4 w-4 text-purple-500" />}
          Phase: {phase}
        </CardTitle>
        <CardDescription>Weeks {weeks}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-sm flex items-center gap-2">
              <CheckCircle className="h-3 w-3 text-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
