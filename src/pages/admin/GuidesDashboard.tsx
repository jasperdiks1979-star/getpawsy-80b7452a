import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowUp, ArrowDown, Minus, AlertTriangle, CheckCircle, 
  TrendingUp, BarChart3, FlaskConical, Map, Shield, Link2, Zap, RefreshCw, Bug, Activity, Wifi, WifiOff, Search, Crown 
} from 'lucide-react';
import { getExperimentsSummary } from '@/lib/guide-experiments';
import { fetchGSCMetricsForGuides, triggerGSCSync, runGSCDiagnostic, type GSCGuideReport, type GSCFetchResult, type GSCDiagnosticResult } from '@/lib/gsc';
import { evaluateGuideAlerts, type GuideHealthStatus } from '@/lib/guide-monitoring';
import { getScalingSummary, getWeeklySchedule, checkCannibalization, SCALING_GUIDES } from '@/lib/guide-scaling-150';
import { detectBoostTargetsAdaptive, getBoostSummary, type RankBoostTarget, type BoostEngineResult } from '@/lib/rank-push-engine';
import { getLinkMatrixSummary, analyzeInternalLinks, type LinkAnalysis } from '@/lib/internal-link-matrix';
import { runOrphanRepair, detectOrphans, type RepairResult } from '@/lib/orphan-repair-engine';
import { runLinkMatrixOptimizer, type LinkMatrixOptimizerResult } from '@/lib/link-matrix-optimizer';
import { runAccelerationEngine, type AccelerationReport } from '@/lib/rank-acceleration-engine';
import { runGapHijackEngine, type GapHijackReport, type GapQuery } from '@/lib/gap-hijack-engine';
import { runDominanceEngine, type DominanceReport } from '@/lib/dominance-engine';

export default function GuidesDashboard() {
  const [searchParams] = useSearchParams();
  const isDebug = searchParams.get('debug') === 'true';

  const [gscResult, setGscResult] = useState<GSCFetchResult | null>(null);
  const [healthStatuses, setHealthStatuses] = useState<GuideHealthStatus[]>([]);
  const [boostResult, setBoostResult] = useState<BoostEngineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [repairRunning, setRepairRunning] = useState(false);
  const [diagnostic, setDiagnostic] = useState<GSCDiagnosticResult | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [optimizerResult, setOptimizerResult] = useState<LinkMatrixOptimizerResult | null>(null);
  const [accelReport, setAccelReport] = useState<AccelerationReport | null>(null);
  const [gapReport, setGapReport] = useState<GapHijackReport | null>(null);
  const [dominanceReport, setDominanceReport] = useState<DominanceReport | null>(null);

  const loadData = async () => {
    setLoading(true);
    const result = await fetchGSCMetricsForGuides();
    setGscResult(result);
    setHealthStatuses(evaluateGuideAlerts(result.reports));
    setBoostResult(detectBoostTargetsAdaptive(result.reports));
    setOptimizerResult(runLinkMatrixOptimizer());
    const accelR = runAccelerationEngine(result.reports);
    setAccelReport(accelR);
    const gapR = runGapHijackEngine(result.reports);
    setGapReport(gapR);
    setDominanceReport(runDominanceEngine(gapR, accelR));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    const result = await triggerGSCSync();
    setSyncMessage(result.message);
    setSyncing(false);
    if (result.success) await loadData();
  };

  const handleDiagnostic = async () => {
    setDiagRunning(true);
    const result = await runGSCDiagnostic();
    setDiagnostic(result);
    setDiagRunning(false);
  };

  const boostTargets = boostResult?.targets || [];
  const gscData = gscResult?.reports || [];
  const experiments = getExperimentsSummary();
  const scaling = getScalingSummary();
  const schedule = getWeeklySchedule();
  const cannibalization = checkCannibalization();
  const boostSummary = getBoostSummary(boostTargets);
  const linkSummary = getLinkMatrixSummary();
  const linkAnalyses = analyzeInternalLinks();
  const liveOrphans = detectOrphans();

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Guides SEO Dashboard</h1>
            <p className="text-muted-foreground">
              Growth Mode: <Badge variant={boostResult?.mode === 'early' ? 'secondary' : 'default'} className="ml-1">{boostResult?.mode?.toUpperCase() || 'DETECTING'}</Badge>
              {boostResult && <span className="ml-2 text-xs">({boostResult.totalImpressions} total impressions)</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDiagnostic} disabled={diagRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-muted disabled:opacity-50">
              <Activity className={`h-3.5 w-3.5 ${diagRunning ? 'animate-pulse' : ''}`} />
              {diagRunning ? 'Testing...' : 'GSC Diagnostic'}
            </button>
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Force GSC Sync'}
            </button>
          </div>
        </div>

        {syncMessage && (
          <Alert variant={syncMessage.includes('failed') ? 'destructive' : 'default'}>
            <AlertDescription className="text-xs">{syncMessage}</AlertDescription>
          </Alert>
        )}

        {/* GSC Connection Health Widget */}
        {diagnostic && (
          <Card className={diagnostic.status === 'OK' ? 'border-green-500/50' : diagnostic.status === 'ERROR' ? 'border-destructive' : 'border-yellow-500/50'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {diagnostic.connected ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-destructive" />}
                GSC Connection Health
                <Badge variant={diagnostic.status === 'OK' ? 'default' : diagnostic.status === 'ERROR' ? 'destructive' : 'secondary'}>
                  {diagnostic.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><span className="text-muted-foreground">Property:</span> <span className="font-mono">{diagnostic.property}</span></div>
                <div><span className="text-muted-foreground">Type:</span> {diagnostic.propertyType}</div>
                <div><span className="text-muted-foreground">Service Account:</span> <span className="font-mono truncate block max-w-[200px]">{diagnostic.serviceAccountEmail}</span></div>
                <div><span className="text-muted-foreground">Rows:</span> {diagnostic.rowsFetched ?? '—'}</div>
              </div>
              {diagnostic.issue && (
                <Alert variant="destructive" className="mt-2">
                  <AlertTitle className="text-xs">Error</AlertTitle>
                  <AlertDescription className="text-xs">{diagnostic.issue}</AlertDescription>
                  {diagnostic.fix_recommendation && <p className="text-xs mt-1 font-medium">Fix: {diagnostic.fix_recommendation}</p>}
                </Alert>
              )}
              {diagnostic.possible_causes && (
                <div className="mt-2 p-2 rounded bg-muted">
                  <p className="font-medium mb-1">Possible causes:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {diagnostic.possible_causes.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {diagnostic.sampleRows && diagnostic.sampleRows.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium mb-1">Sample data:</p>
                  {diagnostic.sampleRows.map((r, i) => (
                    <div key={i} className="font-mono text-[10px] text-muted-foreground">{r.page} — impr:{r.impressions} clicks:{r.clicks} pos:{r.position}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Status bar */}
        {gscResult && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Status: <Badge variant={gscResult.status === 'ready' ? 'default' : 'secondary'} className="text-[10px]">{gscResult.status}</Badge></span>
            {gscResult.lastSyncedAt && <span>Last sync: {new Date(gscResult.lastSyncedAt).toLocaleString()}</span>}
            <span>Rows: {gscResult.totalRows}</span>
            <span>Orphans: <span className={liveOrphans.length > 0 ? 'text-destructive font-medium' : ''}>{liveOrphans.length}</span></span>
          </div>
        )}

        {/* Debug Panel */}
        {isDebug && (
          <Card className="border-dashed border-yellow-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5"><Bug className="h-4 w-4" />Debug Panel</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1 font-mono">
              <div>GSC Status: {gscResult?.status || 'loading'}</div>
              <div>GSC Message: {gscResult?.statusMessage || '—'}</div>
              <div>Last Sync: {gscResult?.lastSyncedAt || 'never'}</div>
              <div>Total DB Rows: {gscResult?.totalRows || 0}</div>
              <div>Guide Reports: {gscResult?.reports.length || 0}</div>
              <div>Growth Mode: {boostResult?.mode || 'unknown'} (total impr: {boostResult?.totalImpressions || 0})</div>
              <div>Rank Boost Targets: {boostTargets.length}</div>
              <div>Live Orphan Count: {liveOrphans.length}</div>
              <div>Repair Result: {repairResult ? `${repairResult.orphansBefore}→${repairResult.orphansAfter}` : 'not run'}</div>
              <div>Weak Guides: {optimizerResult?.summary.weakCount || 0}</div>
              <div>Cornerstones At Risk: {optimizerResult?.summary.cornerstonesAtRisk || 0}</div>
              <div>Avg Strength: {optimizerResult?.summary.avgStrength || 0}</div>
              <div>Diag Status: {diagnostic?.status || 'not run'}</div>
              <div>Scaling Guides Total: {SCALING_GUIDES.length}</div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="experiments" className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="experiments"><FlaskConical className="h-4 w-4 mr-1" />A/B Tests</TabsTrigger>
            <TabsTrigger value="monitoring"><BarChart3 className="h-4 w-4 mr-1" />GSC</TabsTrigger>
            <TabsTrigger value="alerts"><AlertTriangle className="h-4 w-4 mr-1" />Alerts</TabsTrigger>
            <TabsTrigger value="boost"><Zap className="h-4 w-4 mr-1" />Rank Boost</TabsTrigger>
            <TabsTrigger value="links"><Link2 className="h-4 w-4 mr-1" />Link Matrix</TabsTrigger>
            <TabsTrigger value="scaling"><Map className="h-4 w-4 mr-1" />150-Plan</TabsTrigger>
            <TabsTrigger value="acceleration"><TrendingUp className="h-4 w-4 mr-1" />Acceleration</TabsTrigger>
            <TabsTrigger value="gap-hijack"><Search className="h-4 w-4 mr-1" />Gap Hijack</TabsTrigger>
            <TabsTrigger value="dominance"><Crown className="h-4 w-4 mr-1" />Dominance</TabsTrigger>
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
                        <p className="text-xs text-muted-foreground mt-1">Impr: {exp.metrics.A.impressions} | CTR: {exp.metrics.A.ctr.toFixed(2)}%</p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-muted-foreground">Variant B</p>
                        <p className="text-xs">{exp.variantB.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">Impr: {exp.metrics.B.impressions} | CTR: {exp.metrics.B.ctr.toFixed(2)}%</p>
                      </div>
                    </div>
                    <div className="text-xs p-2 rounded bg-muted"><strong>Decision:</strong> {exp.decision.reason}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* TAB 2: GSC MONITORING */}
          <TabsContent value="monitoring" className="space-y-4">
            {loading ? (
              <div className="space-y-4">{[1, 2, 3].map(i => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-24 w-full" /></CardContent></Card>)}</div>
            ) : gscResult?.status === 'no_sync' ? (
              <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Waiting for GSC Sync</AlertTitle><AlertDescription className="text-xs">{gscResult.statusMessage}</AlertDescription></Alert>
            ) : gscResult?.status === 'no_data' ? (
              <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>No Guide Data</AlertTitle><AlertDescription className="text-xs">{gscResult.statusMessage}</AlertDescription></Alert>
            ) : (
              <div className="grid gap-4">
                {gscData.map(report => {
                  const d7 = report.periods['7d'];
                  return (
                    <Card key={report.slug}>
                      <CardHeader className="pb-3"><CardTitle className="text-base">{report.slug}</CardTitle></CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-4 text-center text-sm">
                          <div><p className="text-muted-foreground text-xs">Impressions</p><p className="text-lg font-bold">{d7?.impressions ?? <EmptyMetric reason="Not indexed yet" />}</p>{report.delta7d && <DeltaBadge value={report.delta7d.impressions} suffix="" />}</div>
                          <div><p className="text-muted-foreground text-xs">Clicks</p><p className="text-lg font-bold">{d7?.clicks ?? <EmptyMetric reason="No impressions yet" />}</p>{report.delta7d && <DeltaBadge value={report.delta7d.clicks} suffix="" />}</div>
                          <div><p className="text-muted-foreground text-xs">CTR</p><p className="text-lg font-bold">{d7 ? `${d7.ctr.toFixed(2)}%` : <EmptyMetric reason="No impressions yet" />}</p>{report.delta7d && <DeltaBadge value={report.delta7d.ctr} suffix="%" />}</div>
                          <div><p className="text-muted-foreground text-xs">Avg Position</p><p className="text-lg font-bold">{d7?.avgPosition ?? <EmptyMetric reason="Not indexed yet" />}</p>{report.delta7d && <DeltaBadge value={report.delta7d.position} suffix="" inverted />}</div>
                        </div>
                        {report.topQueries.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Top Queries</p>
                            <div className="flex flex-wrap gap-1">
                              {report.topQueries.slice(0, 5).map(q => (
                                <Badge key={q.query} variant="outline" className="text-xs">{q.query} (pos {q.position.toFixed(1)})</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {report.topQueries.length === 0 && d7 && <p className="text-xs text-muted-foreground mt-2">No query-level data yet.</p>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 3: ALERTS */}
          <TabsContent value="alerts" className="space-y-4">
            {loading ? (
              <div className="space-y-4">{[1,2].map(i => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}</div>
            ) : healthStatuses.length === 0 ? (
              <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>No Data</AlertTitle><AlertDescription className="text-xs">Sync GSC data first to generate health alerts.</AlertDescription></Alert>
            ) : (
              healthStatuses.map(status => (
                <Card key={status.slug}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{status.slug}</CardTitle>
                      <Badge variant={status.status === 'healthy' ? 'default' : status.status === 'attention' ? 'secondary' : 'destructive'}>{status.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {status.alerts.map((alert, i) => (
                      <Alert key={i} variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
                        <AlertTitle className="text-sm">{alert.title}</AlertTitle>
                        <AlertDescription className="text-xs">{alert.description}</AlertDescription>
                      </Alert>
                    ))}
                    {status.alerts.length === 0 && <p className="text-xs text-muted-foreground">No alerts — guide is healthy.</p>}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* TAB 4: RANK BOOST TARGETS (Adaptive) */}
          <TabsContent value="boost" className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-5 gap-4">{[1,2,3,4,5].map(i => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}</div>
            ) : (
              <>
                {/* Mode indicator */}
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertTitle className="flex items-center gap-2">
                    {boostResult?.mode === 'early' ? '🚀 Early Growth Mode' : '📈 Standard Mode'}
                  </AlertTitle>
                  <AlertDescription className="text-xs">
                    {boostResult?.mode === 'early'
                      ? `Domain has ${boostResult.totalImpressions} impressions (<1000). Using aggressive thresholds: position 10–60, ≥10 impressions.`
                      : `Domain has ${boostResult?.totalImpressions || 0} impressions. Using standard thresholds: position 15–40, ≥150 impressions.`}
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-5 gap-4">
                  <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.total}</p><p className="text-xs text-muted-foreground">Total Targets</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.pending}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.boosted}</p><p className="text-xs text-muted-foreground">Boosted</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.graduated}</p><p className="text-xs text-muted-foreground">Graduated</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{boostSummary.avgPosition || '—'}</p><p className="text-xs text-muted-foreground">Avg Position</p></CardContent></Card>
                </div>

                {boostTargets.length === 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>No boost targets</AlertTitle>
                    <AlertDescription className="text-xs">
                      {gscResult?.status === 'no_sync' ? 'Waiting for GSC sync.' : gscResult?.status === 'no_data' ? 'GSC data synced but no guide pages matched.' : 'No queries found matching current mode thresholds.'}
                    </AlertDescription>
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
                              <Badge variant={target.status === 'graduated' ? 'default' : target.status === 'boosted' ? 'secondary' : 'outline'}>{target.status}</Badge>
                              <Badge variant="outline">Pos {target.avgPosition}</Badge>
                              <Badge variant="outline" className="text-[10px]">Score: {target.priorityScore}</Badge>
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
              </>
            )}
          </TabsContent>

          {/* TAB 5: LINK MATRIX + OPTIMIZER + ORPHAN REPAIR */}
          <TabsContent value="links" className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{linkSummary.totalGuides}</p><p className="text-xs text-muted-foreground">Total Guides</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{optimizerResult?.summary.avgStrength || linkSummary.avgLinkStrength}</p><p className="text-xs text-muted-foreground">Avg Strength</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold text-destructive">{liveOrphans.length}</p><p className="text-xs text-muted-foreground">Orphans</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold text-yellow-600">{optimizerResult?.summary.weakCount || 0}</p><p className="text-xs text-muted-foreground">Weak Guides</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold text-destructive">{optimizerResult?.summary.cornerstonesAtRisk || 0}</p><p className="text-xs text-muted-foreground">CS at Risk</p></CardContent></Card>
            </div>

            {/* Cornerstone Authority */}
            {optimizerResult && optimizerResult.cornerstoneAuthority.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">🏛️ Cornerstone Authority</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {optimizerResult.cornerstoneAuthority.map(cs => (
                    <div key={cs.slug} className="flex items-center gap-3 text-xs p-2 rounded border">
                      <span className="font-medium truncate flex-1">{cs.slug}</span>
                      <Badge variant={cs.atRisk ? 'destructive' : 'default'} className="text-[10px]">{cs.atRisk ? 'AT RISK' : 'HEALTHY'}</Badge>
                      <span className="text-muted-foreground">↓{cs.inboundTotal}</span>
                      <span className="text-muted-foreground">Sub:{cs.subguidePercent}%</span>
                      <span className="text-muted-foreground">Cross:{cs.crossClusterPercent}%</span>
                      {cs.risks.length > 0 && <span className="text-destructive text-[10px]">{cs.risks[0]}</span>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Weak Guides — Link Injection Plans */}
            {optimizerResult && optimizerResult.weakGuides.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">⚠️ Weak Guides — Auto Link Plan ({optimizerResult.weakGuides.length})</CardTitle>
                  <CardDescription className="text-xs">Guides with strength score &lt; 20. Each shows recommended link sources.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {optimizerResult.weakGuides.slice(0, 15).map(plan => (
                        <div key={plan.weakSlug} className="p-2 rounded border space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{plan.role}</Badge>
                            <span className="font-medium text-xs truncate flex-1">{plan.weakSlug}</span>
                            <span className="text-xs text-muted-foreground">Score: {plan.strengthScore}</span>
                          </div>
                          <div className="pl-4 space-y-0.5">
                            {plan.recommendedLinks.map((link, i) => (
                              <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Badge variant="outline" className="text-[8px] px-1">{link.anchorType}</Badge>
                                <span>from <span className="font-mono">{link.fromSlug}</span></span>
                                <span className="italic">"{link.anchorText}"</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Orphan Repair Panel */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">🔧 Orphan Repair Engine</CardTitle>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Force recalculation of link matrix + orphan counts
                        setOptimizerResult(runLinkMatrixOptimizer());
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-muted"
                    >
                      Recalculate Authority Map
                    </button>
                    <button
                      onClick={() => {
                        setRepairRunning(true);
                        setTimeout(() => {
                          const result = runOrphanRepair();
                          setRepairResult(result);
                          // Re-run optimizer after repair to sync counts
                          setOptimizerResult(runLinkMatrixOptimizer());
                          setRepairRunning(false);
                        }, 100);
                      }}
                      disabled={repairRunning}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {repairRunning ? 'Running...' : repairResult ? 'Re-run Repair' : 'Run Repair'}
                    </button>
                  </div>
                </div>
              </CardHeader>
              {repairResult && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center p-3 rounded bg-muted"><p className="text-2xl font-bold text-destructive">{repairResult.orphansBefore}</p><p className="text-[10px] text-muted-foreground">Before</p></div>
                    <div className="text-center p-3 rounded bg-muted"><p className={`text-2xl font-bold ${repairResult.orphansAfter < 20 ? 'text-green-600' : 'text-destructive'}`}>{repairResult.orphansAfter}</p><p className="text-[10px] text-muted-foreground">After</p></div>
                    <div className="text-center p-3 rounded bg-muted"><p className="text-2xl font-bold">{repairResult.totalInjections}</p><p className="text-[10px] text-muted-foreground">Links Injected</p></div>
                    <div className="text-center p-3 rounded bg-muted"><p className="text-2xl font-bold">{repairResult.avgInboundAfter}</p><p className="text-[10px] text-muted-foreground">Avg Inbound</p></div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold mb-2">Cluster Authority Scores</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(repairResult.clusterAuthority).map(([cluster, score]) => (
                        <div key={cluster} className="text-center p-2 rounded border">
                          <p className={`text-xl font-bold ${score >= 60 ? 'text-green-600' : score >= 40 ? 'text-yellow-600' : 'text-destructive'}`}>{score}</p>
                          <p className="text-[10px] text-muted-foreground">{cluster}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-muted-foreground">View Repair Log ({repairResult.log.length} entries)</summary>
                    <ScrollArea className="h-[200px] mt-2">
                      <pre className="text-[10px] whitespace-pre-wrap p-2 rounded bg-muted">{repairResult.log.join('\n')}</pre>
                    </ScrollArea>
                  </details>
                </CardContent>
              )}
            </Card>

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

            {/* Full guide list */}
            <ScrollArea className="h-[400px]">
              <div className="space-y-1">
                {linkAnalyses.sort((a, b) => b.linkStrengthScore - a.linkStrengthScore).map(a => (
                  <div key={a.slug} className="flex items-center gap-2 text-xs p-2 rounded border">
                    <Badge variant={a.role === 'cornerstone' ? 'default' : a.role === 'hub' ? 'secondary' : 'outline'} className="text-[10px] shrink-0">{a.role}</Badge>
                    <span className="font-medium truncate flex-1">{a.slug}</span>
                    <span className="text-muted-foreground shrink-0">↓{a.inboundCount}/{a.targetInbound}</span>
                    <span className={`font-bold shrink-0 ${a.linkStrengthScore >= 70 ? 'text-green-600' : a.linkStrengthScore >= 40 ? 'text-yellow-600' : 'text-destructive'}`}>{a.linkStrengthScore}</span>
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

            <div className="grid grid-cols-3 gap-4">
              <Card><CardContent className="pt-4 text-center"><p className="text-xl font-bold text-green-600">{scaling.byDifficulty.low}</p><p className="text-xs text-muted-foreground">Low Difficulty</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-xl font-bold text-yellow-600">{scaling.byDifficulty.medium}</p><p className="text-xs text-muted-foreground">Medium</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><p className="text-xl font-bold text-red-600">{scaling.byDifficulty.high}</p><p className="text-xs text-muted-foreground">High</p></CardContent></Card>
            </div>

            {cannibalization.length > 0 ? (
              <Alert variant="destructive">
                <Shield className="h-4 w-4" />
                <AlertTitle>Cannibalization Issues ({cannibalization.length})</AlertTitle>
                <AlertDescription>
                  {cannibalization.map(c => <div key={c.keyword} className="text-xs mt-1"><strong>"{c.keyword}"</strong> → {c.slugs.join(', ')}</div>)}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert><CheckCircle className="h-4 w-4" /><AlertTitle>No Cannibalization Detected</AlertTitle><AlertDescription className="text-xs">All {scaling.total} guides have unique primary keywords.</AlertDescription></Alert>
            )}

            <ScrollArea className="h-[600px]">
              {schedule.map(week => (
                <div key={week.week} className="mb-6">
                  <h3 className="font-semibold text-sm mb-2">{week.label} <span className="text-muted-foreground font-normal">({week.guides.length} guides — {week.focus})</span></h3>
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

          {/* TAB 7: ACCELERATION ENGINE */}
          <TabsContent value="acceleration" className="space-y-4">
            {!accelReport ? (
              <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Loading</AlertTitle><AlertDescription className="text-xs">Acceleration engine is computing...</AlertDescription></Alert>
            ) : (
              <>
                {/* Mode + Summary */}
                <Alert>
                  <TrendingUp className="h-4 w-4" />
                  <AlertTitle>{accelReport.mode === 'early' ? '🚀 Early Acceleration Mode' : '📈 Standard Acceleration Mode'}</AlertTitle>
                  <AlertDescription className="text-xs">
                    {accelReport.totalImpressions} total impressions · {accelReport.summary.totalCandidates} boost candidates · {accelReport.summary.linksInjected} links planned · {accelReport.summary.titleTestsActive} title tests
                  </AlertDescription>
                </Alert>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{accelReport.summary.totalCandidates}</p><p className="text-[10px] text-muted-foreground">Boost Candidates</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{accelReport.summary.linksInjected}</p><p className="text-[10px] text-muted-foreground">Links Planned</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{accelReport.summary.titleTestsActive}</p><p className="text-[10px] text-muted-foreground">Title Tests</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{accelReport.summary.freshnessUpdatesQueued}</p><p className="text-[10px] text-muted-foreground">Freshness Queue</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{accelReport.summary.crawlsPinged}</p><p className="text-[10px] text-muted-foreground">Crawl Pings</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className={`text-2xl font-bold ${accelReport.summary.safetyViolations > 0 ? 'text-destructive' : ''}`}>{accelReport.summary.safetyViolations}</p><p className="text-[10px] text-muted-foreground">Safety Issues</p></CardContent></Card>
                </div>

                {/* Safety Status */}
                <Card className={accelReport.safetyStatus.violations.length > 0 ? 'border-destructive' : 'border-green-500/50'}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Safety Status
                      <Badge variant={accelReport.safetyStatus.violations.length > 0 ? 'destructive' : 'default'}>
                        {accelReport.safetyStatus.violations.length > 0 ? 'VIOLATIONS' : 'SAFE'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <div className="grid grid-cols-4 gap-3">
                      <div><span className="text-muted-foreground">Max links/page:</span> {accelReport.safetyStatus.maxLinksPerPage30d}/10</div>
                      <div><span className="text-muted-foreground">Exact anchor %:</span> {accelReport.safetyStatus.exactAnchorPercent}%</div>
                      <div><span className="text-muted-foreground">Canonicals modified:</span> {accelReport.safetyStatus.canonicalsModified ? 'YES ⚠️' : 'No ✓'}</div>
                      <div><span className="text-muted-foreground">robots.txt modified:</span> {accelReport.safetyStatus.robotsTxtModified ? 'YES ⚠️' : 'No ✓'}</div>
                    </div>
                    {accelReport.safetyStatus.violations.map((v, i) => (
                      <Alert key={i} variant="destructive" className="mt-1"><AlertDescription className="text-xs">{v}</AlertDescription></Alert>
                    ))}
                  </CardContent>
                </Card>

                {/* Boost Candidates */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">🎯 Boost Candidates ({accelReport.candidates.length})</CardTitle></CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {accelReport.candidates.map((c, i) => (
                          <div key={i} className="p-3 rounded border space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-sm">{c.query}</p>
                                <p className="text-[10px] text-muted-foreground">{c.slug}</p>
                              </div>
                              <div className="flex gap-1.5">
                                <Badge variant="outline" className="text-[10px]">Pos {c.position}</Badge>
                                <Badge variant="outline" className="text-[10px]">{c.impressions} impr</Badge>
                                <Badge variant="outline" className="text-[10px]">CTR {c.ctr.toFixed(2)}%</Badge>
                                <Badge variant="secondary" className="text-[10px]">Score: {c.priorityScore}</Badge>
                              </div>
                            </div>
                            <div className="space-y-0.5">
                              {c.boostActions.map((a, j) => (
                                <div key={j} className="text-[10px] flex items-center gap-2">
                                  <Badge variant={a.status === 'applied' ? 'default' : 'outline'} className="text-[8px] px-1">{a.type}</Badge>
                                  <span className="text-muted-foreground truncate">{a.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Link Boost Plans */}
                {accelReport.linkBoostPlans.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">🔗 Link Boost Plans ({accelReport.linkBoostPlans.length})</CardTitle></CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[250px]">
                        <div className="space-y-2">
                          {accelReport.linkBoostPlans.map((plan, i) => (
                            <div key={i} className="p-2 rounded border">
                              <p className="font-medium text-xs mb-1">→ {plan.targetSlug}</p>
                              <div className="pl-3 space-y-0.5">
                                {plan.links.map((l, j) => (
                                  <div key={j} className="text-[10px] text-muted-foreground">
                                    <Badge variant="outline" className="text-[8px] px-1 mr-1">{l.anchorType}</Badge>
                                    from <span className="font-mono">{l.fromSlug}</span> — "{l.anchorText}"
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Title Tests */}
                {accelReport.activeTitleTests.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">🧪 Title A/B Tests ({accelReport.activeTitleTests.length})</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {accelReport.activeTitleTests.map((test, i) => (
                        <div key={i} className="p-2 rounded border space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-xs">{test.slug}</span>
                            <Badge variant={test.status === 'running' ? 'default' : 'secondary'} className="text-[10px]">{test.status}</Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Original: {test.originalTitle}</p>
                          {test.variants.map(v => (
                            <div key={v.id} className="text-[10px] pl-3 flex items-center gap-2">
                              <Badge variant="outline" className="text-[8px] px-1">{v.type}</Badge>
                              <span className="truncate">{v.title}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Freshness Queue */}
                {accelReport.freshnessQueue.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">🌿 Freshness Queue ({accelReport.freshnessQueue.length})</CardTitle></CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {accelReport.freshnessQueue.map((f, i) => (
                            <div key={i} className="p-2 rounded border">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-xs">{f.slug}</span>
                                <span className="text-[10px] text-muted-foreground">Due: {f.nextUpdateDue}</span>
                              </div>
                              <div className="pl-3 space-y-0.5">
                                {f.updates.map((u, j) => (
                                  <div key={j} className="text-[10px] text-muted-foreground">
                                    <Badge variant="outline" className="text-[8px] px-1 mr-1">{u.type}</Badge>
                                    {u.description}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
          {/* TAB 8: GAP HIJACK */}
          <TabsContent value="gap-hijack" className="space-y-4">
            {!gapReport ? (
              <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Loading</AlertTitle><AlertDescription className="text-xs">Gap analysis computing...</AlertDescription></Alert>
            ) : (
              <>
                {/* Summary KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{gapReport.totalGapQueries}</p><p className="text-[10px] text-muted-foreground">Total Gaps</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-destructive">{gapReport.criticalCount}</p><p className="text-[10px] text-muted-foreground">Critical (No Page)</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-yellow-600">{gapReport.weakCount}</p><p className="text-[10px] text-muted-foreground">Weak Coverage</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-600">{gapReport.opportunityCount}</p><p className="text-[10px] text-muted-foreground">Opportunities</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{gapReport.cannibalizationRisks.length}</p><p className="text-[10px] text-muted-foreground">Cannibal Risks</p></CardContent></Card>
                </div>

                {gapReport.totalGapQueries === 0 && (
                  <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>No gaps detected</AlertTitle><AlertDescription className="text-xs">Either no GSC query data available or all queries are ranking well (position ≤ 20). Sync GSC data first.</AlertDescription></Alert>
                )}

                {/* Cannibalization Warnings */}
                {gapReport.cannibalizationRisks.length > 0 && (
                  <Alert variant="destructive">
                    <Shield className="h-4 w-4" />
                    <AlertTitle>Cannibalization Risks ({gapReport.cannibalizationRisks.length})</AlertTitle>
                    <AlertDescription className="text-xs space-y-1">
                      {gapReport.cannibalizationRisks.map((r, i) => <div key={i}>{r}</div>)}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Top 5 Hijack Targets */}
                {gapReport.top5HijackTargets.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">🎯 Top 5 Hijack Targets</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {gapReport.top5HijackTargets.map((gap, i) => (
                        <GapCard key={i} gap={gap} rank={i + 1} />
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Full Gap List */}
                {gapReport.gaps.length > 5 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">📋 All Gap Queries ({gapReport.gaps.length})</CardTitle></CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-2">
                          {gapReport.gaps.slice(5).map((gap, i) => (
                            <GapCard key={i} gap={gap} />
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
          {/* TAB 9: DOMINANCE MODE */}
          <TabsContent value="dominance" className="space-y-4">
            {!dominanceReport ? (
              <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Loading</AlertTitle><AlertDescription className="text-xs">Dominance engine computing...</AlertDescription></Alert>
            ) : (
              <>
                {/* Phase & Metrics KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dominanceReport.phase}</p><p className="text-[10px] text-muted-foreground">Current Phase</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-600">{dominanceReport.metrics.guidesUnderPosition30}</p><p className="text-[10px] text-muted-foreground">Guides Under Pos 30</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dominanceReport.metrics.cornerstonesUnderPosition20}</p><p className="text-[10px] text-muted-foreground">Cornerstones Under Pos 20</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dominanceReport.metrics.backlinkAssetsCreated}</p><p className="text-[10px] text-muted-foreground">Backlink Assets</p></CardContent></Card>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dominanceReport.hijackGuidesCreated.length}</p><p className="text-[10px] text-muted-foreground">Hijack Guides Ready</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dominanceReport.boostInjections}</p><p className="text-[10px] text-muted-foreground">Boost Injections</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dominanceReport.ctrTests.length}</p><p className="text-[10px] text-muted-foreground">CTR Tests Active</p></CardContent></Card>
                  <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dominanceReport.freshnessUpdatesApplied}</p><p className="text-[10px] text-muted-foreground">Freshness Updates</p></CardContent></Card>
                </div>

                {/* Safety */}
                {dominanceReport.safetyViolations.length > 0 && (
                  <Alert variant="destructive">
                    <Shield className="h-4 w-4" />
                    <AlertTitle>Safety Violations ({dominanceReport.safetyViolations.length})</AlertTitle>
                    <AlertDescription className="text-xs space-y-1">
                      {dominanceReport.safetyViolations.map((v, i) => <div key={i}>{v}</div>)}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Hijack Guides */}
                {dominanceReport.hijackGuidesCreated.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">🎯 Hijack Guides ({dominanceReport.hijackGuidesCreated.length})</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {dominanceReport.hijackGuidesCreated.map((g, i) => (
                        <div key={i} className="p-3 rounded border flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm font-mono">{g.slug}</p>
                            <p className="text-[10px] text-muted-foreground">Query: {g.query} · {g.impressions} impr · Score: {g.priorityScore}</p>
                          </div>
                          <div className="flex gap-1.5">
                            <Badge variant={g.status === 'published' ? 'default' : 'outline'} className="text-[10px]">{g.status}</Badge>
                            {g.schemaAttached?.map(s => <Badge key={s} variant="outline" className="text-[8px]">{s}</Badge>)}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Cluster Authority Scores */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">📊 Cluster Authority Scores</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {dominanceReport.clusterScores.map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded border">
                          <div>
                            <p className="font-medium text-sm capitalize">{c.cluster.replace(/-/g, ' ')}</p>
                            <p className="text-[10px] text-muted-foreground">{c.guidesCount} guides · Avg pos {c.avgPosition} · Avg impr {c.avgImpressions}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${c.score >= c.target ? 'text-green-600' : 'text-yellow-600'}`}>{c.score}</span>
                            <span className="text-[10px] text-muted-foreground">/ {c.target}</span>
                            <Badge variant={c.delta >= 0 ? 'default' : 'outline'} className="text-[10px]">
                              {c.delta >= 0 ? '+' : ''}{c.delta}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Backlink Assets */}
                {dominanceReport.backlinkAssets.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">🔗 Backlink Assets ({dominanceReport.backlinkAssets.length})</CardTitle></CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {dominanceReport.backlinkAssets.map((a, i) => (
                            <div key={i} className="p-2 rounded border">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-[8px]">{a.assetType}</Badge>
                                <span className="text-[10px] text-muted-foreground">{a.slug} · Pos {a.position} · {a.impressions} impr</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground italic">{a.content.slice(0, 150)}...</p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Micro-Guide Triggers */}
                {dominanceReport.microGuidesTriggered.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">🌱 Cluster Expansion Targets</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {dominanceReport.microGuidesTriggered.map((m, i) => (
                        <div key={i} className="p-2 rounded border">
                          <p className="text-sm font-medium">{m.parentSlug}</p>
                          <p className="text-[10px] text-muted-foreground mb-1">{m.reason}</p>
                          <div className="flex gap-1 flex-wrap">
                            {m.suggestedSlugs.map(s => <Badge key={s} variant="outline" className="text-[8px] font-mono">{s}</Badge>)}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function EmptyMetric({ reason }: { reason: string }) {
  return <span className="text-xs text-muted-foreground font-normal" title={reason}>—</span>;
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

function GapCard({ gap, rank }: { gap: GapQuery; rank?: number }) {
  const gapColor = gap.gapType === 'GAP_CRITICAL' ? 'text-destructive' : gap.gapType === 'GAP_WEAK' ? 'text-yellow-600' : 'text-green-600';
  const gapLabel = gap.gapType === 'GAP_CRITICAL' ? 'CRITICAL' : gap.gapType === 'GAP_WEAK' ? 'WEAK' : 'OPPORTUNITY';

  return (
    <div className="p-3 rounded border space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {rank && <span className="text-lg font-bold text-muted-foreground">#{rank}</span>}
          <div>
            <p className="font-medium text-sm">{gap.query}</p>
            <p className="text-[10px] text-muted-foreground">
              Match: {gap.matchType} {gap.matchedSlug ? `→ ${gap.matchedSlug}` : '(no page)'}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Badge variant="outline" className={`text-[10px] ${gapColor}`}>{gapLabel}</Badge>
          <Badge variant="outline" className="text-[10px]">Pos {gap.avgPosition.toFixed(1)}</Badge>
          <Badge variant="outline" className="text-[10px]">{gap.impressions} impr</Badge>
          <Badge variant="secondary" className="text-[10px]">Score: {gap.priorityScore}</Badge>
        </div>
      </div>

      {/* SERP Pattern */}
      <div className="flex gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[8px]">{gap.serpPattern.contentLengthEstimate}</Badge>
        {gap.serpPattern.hasComparisonTable && <Badge variant="outline" className="text-[8px]">📊 Table</Badge>}
        {gap.serpPattern.hasReviewSchema && <Badge variant="outline" className="text-[8px]">⭐ Review</Badge>}
        {gap.serpPattern.titleStyle.map(s => <Badge key={s} variant="outline" className="text-[8px]">{s}</Badge>)}
        <Badge variant="outline" className="text-[8px]">FAQ×{gap.serpPattern.faqCountEstimate}</Badge>
      </div>

      {/* Actions */}
      <div className="text-[10px] space-y-0.5 pl-2 border-l-2 border-muted">
        {gap.gapType === 'GAP_CRITICAL' && gap.hijackPlan.recommendedSlug && (
          <>
            <p><strong>Slug:</strong> <span className="font-mono">{gap.hijackPlan.recommendedSlug}</span></p>
            <p><strong>H1:</strong> {gap.hijackPlan.suggestedH1}</p>
            {gap.hijackPlan.suggestedH2s && <p><strong>H2s:</strong> {gap.hijackPlan.suggestedH2s.join(' · ')}</p>}
            {gap.hijackPlan.internalLinkTargets && gap.hijackPlan.internalLinkTargets.length > 0 && (
              <p><strong>Link to:</strong> {gap.hijackPlan.internalLinkTargets.join(', ')}</p>
            )}
          </>
        )}
        {gap.gapType === 'GAP_WEAK' && (
          <>
            {gap.hijackPlan.contentExpansion && <p>{gap.hijackPlan.contentExpansion}</p>}
            {gap.hijackPlan.titleOptimization && <p><strong>Title:</strong> {gap.hijackPlan.titleOptimization}</p>}
            {gap.hijackPlan.linkBoostPlan && <p><strong>Links:</strong> {gap.hijackPlan.linkBoostPlan}</p>}
          </>
        )}
        {gap.gapType === 'GAP_OPPORTUNITY' && gap.hijackPlan.quickWins && (
          <>
            {gap.hijackPlan.quickWins.map((w, i) => <p key={i}>• {w}</p>)}
            {gap.hijackPlan.ctrOptimization && <p><strong>CTR:</strong> {gap.hijackPlan.ctrOptimization}</p>}
          </>
        )}
      </div>
    </div>
  );
}
