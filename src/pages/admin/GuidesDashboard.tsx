import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowUp, ArrowDown, Minus, AlertTriangle, CheckCircle, 
  TrendingUp, BarChart3, FlaskConical, Map, Shield, Link2, Zap 
} from 'lucide-react';
import { getExperimentsSummary } from '@/lib/guide-experiments';
import { fetchGSCMetricsForGuides, type GSCGuideReport } from '@/lib/gsc';
import { evaluateGuideAlerts, type GuideHealthStatus } from '@/lib/guide-monitoring';
import { getScalingSummary, getWeeklySchedule, checkCannibalization, SCALING_GUIDES } from '@/lib/guide-scaling-150';
import { detectBoostTargets, getBoostSummary, type RankBoostTarget } from '@/lib/rank-push-engine';
import { getLinkMatrixSummary, analyzeInternalLinks, type LinkAnalysis } from '@/lib/internal-link-matrix';

export default function GuidesDashboard() {
  const [gscData, setGscData] = useState<GSCGuideReport[]>([]);
  const [healthStatuses, setHealthStatuses] = useState<GuideHealthStatus[]>([]);
  const [boostTargets, setBoostTargets] = useState<RankBoostTarget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await fetchGSCMetricsForGuides();
      setGscData(data);
      setHealthStatuses(evaluateGuideAlerts(data));
      setBoostTargets(detectBoostTargets(data));
      setLoading(false);
    }
    load();
  }, []);

  const experiments = getExperimentsSummary();
  const scaling = getScalingSummary();
  const schedule = getWeeklySchedule();
  const cannibalization = checkCannibalization();
  const boostSummary = getBoostSummary(boostTargets);
  const linkSummary = getLinkMatrixSummary();
  const linkAnalyses = analyzeInternalLinks();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Guides SEO Dashboard</h1>
          <p className="text-muted-foreground">A/B experiments, GSC monitoring, alerts, rank boost, link matrix & 150 scaling plan</p>
        </div>

        <Tabs defaultValue="experiments" className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="experiments"><FlaskConical className="h-4 w-4 mr-1" />A/B Tests</TabsTrigger>
            <TabsTrigger value="monitoring"><BarChart3 className="h-4 w-4 mr-1" />GSC</TabsTrigger>
            <TabsTrigger value="alerts"><AlertTriangle className="h-4 w-4 mr-1" />Alerts</TabsTrigger>
            <TabsTrigger value="boost"><Zap className="h-4 w-4 mr-1" />Rank Boost</TabsTrigger>
            <TabsTrigger value="links"><Link2 className="h-4 w-4 mr-1" />Link Matrix</TabsTrigger>
            <TabsTrigger value="scaling"><Map className="h-4 w-4 mr-1" />150-Plan</TabsTrigger>
          </TabsList>

          {/* TAB 1: A/B EXPERIMENTS */}
          <TabsContent value="experiments" className="space-y-4">
            <Alert>
              <FlaskConical className="h-4 w-4" />
              <AlertTitle>Experiment Rules</AlertTitle>
              <AlertDescription className="text-xs">Min 150 impressions/variant · Min 10 days · Winner at ≥12% CTR uplift · Week-based rotation (no cloaking)</AlertDescription>
            </Alert>
            <div className="grid gap-4">
              {experiments.map(exp => (
                <Card key={exp.slug}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-medium">{exp.slug}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant={exp.status === 'running' ? 'default' : 'secondary'}>{exp.status}</Badge>
                        <Badge variant="outline">Active: {exp.currentVariant}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <p className="font-medium text-muted-foreground">Variant A</p>
                        <p className="text-xs">{exp.variantA.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Impr: {exp.metrics.A.impressions} | CTR: {exp.metrics.A.ctr.toFixed(2)}%
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-muted-foreground">Variant B</p>
                        <p className="text-xs">{exp.variantB.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Impr: {exp.metrics.B.impressions} | CTR: {exp.metrics.B.ctr.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <div className="text-xs p-2 rounded bg-muted">
                      <strong>Decision:</strong> {exp.decision.reason}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* TAB 2: GSC MONITORING */}
          <TabsContent value="monitoring" className="space-y-4">
            {loading ? (
              <p className="text-muted-foreground">Loading GSC data...</p>
            ) : (
              <div className="grid gap-4">
                {gscData.map(report => {
                  const d7 = report.periods['7d'];
                  return (
                    <Card key={report.slug}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{report.slug}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-4 text-center text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Impressions (7d)</p>
                            <p className="text-lg font-bold">{d7?.impressions ?? '—'}</p>
                            {report.delta7d && <DeltaBadge value={report.delta7d.impressions} suffix="" />}
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Clicks (7d)</p>
                            <p className="text-lg font-bold">{d7?.clicks ?? '—'}</p>
                            {report.delta7d && <DeltaBadge value={report.delta7d.clicks} suffix="" />}
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">CTR (7d)</p>
                            <p className="text-lg font-bold">{d7 ? `${d7.ctr.toFixed(2)}%` : '—'}</p>
                            {report.delta7d && <DeltaBadge value={report.delta7d.ctr} suffix="%" />}
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Avg Position</p>
                            <p className="text-lg font-bold">{d7?.avgPosition ?? '—'}</p>
                            {report.delta7d && <DeltaBadge value={report.delta7d.position} suffix="" inverted />}
                          </div>
                        </div>
                        {report.topQueries.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Top Queries</p>
                            <div className="flex flex-wrap gap-1">
                              {report.topQueries.slice(0, 5).map(q => (
                                <Badge key={q.query} variant="outline" className="text-xs">
                                  {q.query} (pos {q.position})
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 3: ALERTS */}
          <TabsContent value="alerts" className="space-y-4">
            {healthStatuses.map(status => (
              <Card key={status.slug}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{status.slug}</CardTitle>
                    <Badge variant={status.status === 'healthy' ? 'default' : status.status === 'attention' ? 'secondary' : 'destructive'}>
                      {status.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {status.alerts.map((alert, i) => (
                    <Alert key={i} variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
                      <AlertTitle className="text-sm">{alert.title}</AlertTitle>
                      <AlertDescription className="text-xs">{alert.description}</AlertDescription>
                    </Alert>
                  ))}
                  {status.alerts.length === 0 && (
                    <p className="text-xs text-muted-foreground">No alerts — guide is healthy.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* TAB 4: RANK BOOST TARGETS */}
          <TabsContent value="boost" className="space-y-4">
            <div className="grid grid-cols-5 gap-4">
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.total}</p><p className="text-xs text-muted-foreground">Total Targets</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.pending}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.boosted}</p><p className="text-xs text-muted-foreground">Boosted</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.graduated}</p><p className="text-xs text-muted-foreground">Graduated</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.avgPosition}</p><p className="text-xs text-muted-foreground">Avg Position</p></CardContent></Card>
            </div>

            {boostTargets.length === 0 && !loading && (
              <Alert>
                <AlertTitle>No boost targets detected</AlertTitle>
                <AlertDescription className="text-xs">No queries found in position 20–40 with ≥150 impressions. Data will populate as GSC metrics accumulate.</AlertDescription>
              </Alert>
            )}

            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {boostTargets.map((target, i) => (
                  <Card key={i}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{target.query}</p>
                          <p className="text-xs text-muted-foreground">{target.slug}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant={target.status === 'graduated' ? 'default' : target.status === 'boosted' ? 'secondary' : 'outline'}>
                            {target.status}
                          </Badge>
                          <Badge variant="outline">Pos {target.avgPosition}</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-center mb-2">
                        <div><span className="text-muted-foreground">Impr:</span> {target.impressions28d}</div>
                        <div><span className="text-muted-foreground">Clicks:</span> {target.clicks28d}</div>
                        <div><span className="text-muted-foreground">CTR:</span> {target.ctr.toFixed(2)}%</div>
                      </div>
                      <div className="space-y-1">
                        {target.boostActions.map((action, j) => (
                          <div key={j} className="text-xs flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] shrink-0">{action.type}</Badge>
                            <span className="truncate text-muted-foreground">{action.description}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* TAB 5: LINK AUTHORITY FLOW */}
          <TabsContent value="links" className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{linkSummary.totalGuides}</p><p className="text-xs text-muted-foreground">Total Guides</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{linkSummary.avgLinkStrength}</p><p className="text-xs text-muted-foreground">Avg Strength</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold text-destructive">{linkSummary.orphanCount}</p><p className="text-xs text-muted-foreground">Orphans</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{linkSummary.overusedAnchors.length}</p><p className="text-xs text-muted-foreground">Overused Anchors</p></CardContent></Card>
            </div>

            {/* Cluster Health */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(linkSummary.clusterHealth).map(([cluster, health]) => (
                <Card key={cluster}>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{cluster}</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <div className="flex justify-between"><span>Avg Inbound:</span><span className="font-medium">{health.avgInbound}</span></div>
                    <div className="flex justify-between"><span>Avg Strength:</span><span className="font-medium">{health.avgStrength}</span></div>
                    <div className="flex justify-between"><span>Orphans:</span><span className={health.orphans > 0 ? 'text-destructive font-medium' : ''}>{health.orphans}</span></div>
                    <div className="flex justify-between"><span>Cross-cluster:</span><span className={health.crossClusterPercent > 20 ? 'text-destructive font-medium' : ''}>{health.crossClusterPercent}%</span></div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Orphan Alerts */}
            {linkSummary.orphanCount > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Orphan Pages ({linkSummary.orphanCount})</AlertTitle>
                <AlertDescription className="text-xs">
                  {linkSummary.orphans.slice(0, 10).join(', ')}{linkSummary.orphans.length > 10 && ` +${linkSummary.orphans.length - 10} more`}
                </AlertDescription>
              </Alert>
            )}

            {/* Top guides by strength */}
            <ScrollArea className="h-[400px]">
              <div className="space-y-1">
                {linkAnalyses
                  .sort((a, b) => b.linkStrengthScore - a.linkStrengthScore)
                  .map(a => (
                    <div key={a.slug} className="flex items-center gap-2 text-xs p-2 rounded border">
                      <Badge variant={a.role === 'cornerstone' ? 'default' : a.role === 'hub' ? 'secondary' : 'outline'} className="text-[10px] shrink-0">{a.role}</Badge>
                      <span className="font-medium truncate flex-1">{a.slug}</span>
                      <span className="text-muted-foreground shrink-0">↓{a.inboundCount}/{a.targetInbound}</span>
                      <span className={`font-bold shrink-0 ${a.linkStrengthScore >= 70 ? 'text-green-600' : a.linkStrengthScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {a.linkStrengthScore}
                      </span>
                      {a.isOrphan && <Badge variant="destructive" className="text-[10px]">orphan</Badge>}
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* TAB 6: 150-GUIDE SCALING */}
          <TabsContent value="scaling" className="space-y-4">
            <div className="grid grid-cols-5 gap-4">
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{scaling.total}</p><p className="text-xs text-muted-foreground">Total Guides</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{scaling.byCluster['cat-litter']}</p><p className="text-xs text-muted-foreground">Cat Litter</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{scaling.byCluster['cat-furniture']}</p><p className="text-xs text-muted-foreground">Cat Furniture</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{scaling.byCluster['dog-beds']}</p><p className="text-xs text-muted-foreground">Dog Beds</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{scaling.byCluster['micro-intent']}</p><p className="text-xs text-muted-foreground">Micro-Intent</p></CardContent></Card>
            </div>

            {/* Difficulty breakdown */}
            <div className="grid grid-cols-3 gap-4">
              <Card><CardContent className="pt-4 text-center"><p className="text-xl font-bold text-green-600">{scaling.byDifficulty.low}</p><p className="text-xs text-muted-foreground">Low Difficulty</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-xl font-bold text-yellow-600">{scaling.byDifficulty.medium}</p><p className="text-xs text-muted-foreground">Medium</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-xl font-bold text-red-600">{scaling.byDifficulty.high}</p><p className="text-xs text-muted-foreground">High</p></CardContent></Card>
            </div>

            {cannibalization.length > 0 && (
              <Alert variant="destructive">
                <Shield className="h-4 w-4" />
                <AlertTitle>Cannibalization Issues ({cannibalization.length})</AlertTitle>
                <AlertDescription>
                  {cannibalization.map(c => (
                    <div key={c.keyword} className="text-xs mt-1"><strong>"{c.keyword}"</strong> → {c.slugs.join(', ')}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            {cannibalization.length === 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>No Cannibalization Detected</AlertTitle>
                <AlertDescription className="text-xs">All {scaling.total} guides have unique primary keywords.</AlertDescription>
              </Alert>
            )}

            <ScrollArea className="h-[600px]">
              {schedule.map(week => (
                <div key={week.week} className="mb-6">
                  <h3 className="font-semibold text-sm mb-2">
                    {week.label} <span className="text-muted-foreground font-normal">({week.guides.length} guides — {week.focus})</span>
                  </h3>
                  <div className="space-y-1">
                    {week.guides.map(g => (
                      <div key={g.slug} className="flex items-center gap-2 text-xs p-2 rounded border">
                        <Badge variant="outline" className="text-[10px] shrink-0">{g.cluster}</Badge>
                        <Badge variant={g.role === 'cornerstone' ? 'default' : g.role === 'hub' ? 'secondary' : 'outline'} className="text-[10px] shrink-0">{g.role}</Badge>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${g.difficulty === 'high' ? 'border-red-500' : g.difficulty === 'medium' ? 'border-yellow-500' : ''}`}>{g.difficulty}</Badge>
                        <span className="font-medium truncate flex-1">{g.title}</span>
                        <span className="text-muted-foreground shrink-0">P{g.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DeltaBadge({ value, suffix, inverted = false }: { value: number; suffix: string; inverted?: boolean }) {
  const isPositive = inverted ? value < 0 : value > 0;
  if (value === 0) return <span className="text-xs text-muted-foreground flex items-center justify-center gap-0.5"><Minus className="h-3 w-3" />0{suffix}</span>;
  return (
    <span className={`text-xs flex items-center justify-center gap-0.5 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(suffix === '%' ? 2 : 0)}{suffix}
    </span>
  );
}
