import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowUp, ArrowDown, Minus, AlertTriangle, CheckCircle, 
  TrendingUp, BarChart3, FlaskConical, Map, Shield 
} from 'lucide-react';
import { getExperimentsSummary, type GuideExperiment, type ExperimentDecision } from '@/lib/guide-experiments';
import { fetchGSCMetricsForGuides, type GSCGuideReport } from '@/lib/gsc';
import { evaluateGuideAlerts, type GuideHealthStatus } from '@/lib/guide-monitoring';
import { getScalingSummary, getWeeklySchedule, checkCannibalization, SCALING_GUIDES } from '@/lib/guide-scaling-100';

export default function GuidesDashboard() {
  const [gscData, setGscData] = useState<GSCGuideReport[]>([]);
  const [healthStatuses, setHealthStatuses] = useState<GuideHealthStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await fetchGSCMetricsForGuides();
      setGscData(data);
      setHealthStatuses(evaluateGuideAlerts(data));
      setLoading(false);
    }
    load();
  }, []);

  const experiments = getExperimentsSummary();
  const scaling = getScalingSummary();
  const schedule = getWeeklySchedule();
  const cannibalization = checkCannibalization();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Guides SEO Dashboard</h1>
          <p className="text-muted-foreground">A/B experiments, GSC monitoring, alerts & scaling roadmap</p>
        </div>

        <Tabs defaultValue="experiments" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-xl">
            <TabsTrigger value="experiments"><FlaskConical className="h-4 w-4 mr-1" />A/B Tests</TabsTrigger>
            <TabsTrigger value="monitoring"><BarChart3 className="h-4 w-4 mr-1" />GSC</TabsTrigger>
            <TabsTrigger value="alerts"><AlertTriangle className="h-4 w-4 mr-1" />Alerts</TabsTrigger>
            <TabsTrigger value="scaling"><Map className="h-4 w-4 mr-1" />100-Plan</TabsTrigger>
          </TabsList>

          {/* TAB 1: A/B EXPERIMENTS */}
          <TabsContent value="experiments" className="space-y-4">
            <div className="grid gap-4">
              {experiments.map(exp => (
                <Card key={exp.slug}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-medium">{exp.slug}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant={exp.status === 'running' ? 'default' : 'secondary'}>
                          {exp.status}
                        </Badge>
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
                          Impr: {exp.metrics.A.impressions} | Clicks: {exp.metrics.A.clicks} | CTR: {exp.metrics.A.ctr.toFixed(2)}%
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-muted-foreground">Variant B</p>
                        <p className="text-xs">{exp.variantB.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Impr: {exp.metrics.B.impressions} | Clicks: {exp.metrics.B.clicks} | CTR: {exp.metrics.B.ctr.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <div className="text-xs p-2 rounded bg-muted">
                      <strong>Decision:</strong> {exp.decision.reason}
                      {exp.decision.winner && <> → Winner: <strong>{exp.decision.winner}</strong> ({exp.decision.uplift.toFixed(1)}% uplift)</>}
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
                            {report.delta7d && (
                              <DeltaBadge value={report.delta7d.impressions} suffix="" />
                            )}
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
                      {status.status === 'healthy' && <CheckCircle className="h-3 w-3 mr-1" />}
                      {status.status === 'attention' && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {status.status === 'critical' && <AlertTriangle className="h-3 w-3 mr-1" />}
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

          {/* TAB 4: 100-GUIDE SCALING */}
          <TabsContent value="scaling" className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{scaling.total}</p>
                  <p className="text-xs text-muted-foreground">Total Guides</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{scaling.byCluster['cat-litter']}</p>
                  <p className="text-xs text-muted-foreground">Cat Litter</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{scaling.byCluster['cat-furniture']}</p>
                  <p className="text-xs text-muted-foreground">Cat Furniture</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{scaling.byCluster['dog-beds']}</p>
                  <p className="text-xs text-muted-foreground">Dog Beds</p>
                </CardContent>
              </Card>
            </div>

            {/* Cannibalization */}
            {cannibalization.length > 0 && (
              <Alert variant="destructive">
                <Shield className="h-4 w-4" />
                <AlertTitle>Cannibalization Issues ({cannibalization.length})</AlertTitle>
                <AlertDescription>
                  {cannibalization.map(c => (
                    <div key={c.keyword} className="text-xs mt-1">
                      <strong>"{c.keyword}"</strong> → {c.slugs.join(', ')}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            {cannibalization.length === 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>No Cannibalization Detected</AlertTitle>
                <AlertDescription className="text-xs">All 100 guides have unique primary keywords.</AlertDescription>
              </Alert>
            )}

            {/* Weekly Schedule */}
            <ScrollArea className="h-[600px]">
              {schedule.map(week => (
                <div key={week.week} className="mb-6">
                  <h3 className="font-semibold text-sm mb-2">
                    {week.label} <span className="text-muted-foreground font-normal">({week.guides.length} guides — {week.focus})</span>
                  </h3>
                  <div className="space-y-1">
                    {week.guides.map(g => (
                      <div key={g.slug} className="flex items-center gap-2 text-xs p-2 rounded border">
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {g.cluster}
                        </Badge>
                        <Badge variant={g.role === 'cornerstone' ? 'default' : g.role === 'hub' ? 'secondary' : 'outline'} className="text-[10px] shrink-0">
                          {g.role}
                        </Badge>
                        <span className="font-medium truncate flex-1">{g.title}</span>
                        <span className="text-muted-foreground shrink-0">P{g.priority}</span>
                        <span className="text-muted-foreground shrink-0">{g.internalLinksTarget} links</span>
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

// ============= HELPER COMPONENTS =============

function DeltaBadge({ value, suffix, inverted = false }: { value: number; suffix: string; inverted?: boolean }) {
  const isPositive = inverted ? value < 0 : value > 0;
  const isNegative = inverted ? value > 0 : value < 0;

  if (value === 0) return <span className="text-xs text-muted-foreground flex items-center justify-center gap-0.5"><Minus className="h-3 w-3" />0{suffix}</span>;
  
  return (
    <span className={`text-xs flex items-center justify-center gap-0.5 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(suffix === '%' ? 2 : 0)}{suffix}
    </span>
  );
}
