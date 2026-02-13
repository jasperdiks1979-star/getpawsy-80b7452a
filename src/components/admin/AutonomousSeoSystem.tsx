import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Brain, Shield, Zap, Crosshair, Layers, HeartPulse, Lock,
  RefreshCw, CheckCircle2, AlertTriangle, Clock, RotateCcw,
  TrendingUp, Activity, Gauge,
} from 'lucide-react';
import {
  calculateUnifiedScore, generateAutonomousActions, generateVelocityTargets,
  generateClusterDominance, runHealthChecks, getRecoveryStatus, getSafetyMetrics, getActionLog,
  type AICoreAnalysis, type AutonomousAction, type VelocityTarget,
  type ClusterDominanceData, type HealthCheck, type RecoveryStatus,
  type SafetyMetrics, type ActionLogEntry,
} from '@/lib/seo-autonomous-engine';

// ============= SCORE RING =============
function ScoreRing({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? 'hsl(var(--chart-2))' : score >= 50 ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold">{score}</span>
        </div>
      </div>
      <span className="text-[10px] font-medium text-muted-foreground text-center max-w-[80px]">{label}</span>
    </div>
  );
}

const statusIcon = (s: string) => {
  if (s === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (s === 'queued' || s === 'executing') return <Clock className="h-3.5 w-3.5 text-blue-500" />;
  if (s === 'pending_approval') return <Lock className="h-3.5 w-3.5 text-amber-500" />;
  if (s === 'rolled_back') return <RotateCcw className="h-3.5 w-3.5 text-red-500" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
};

const zoneColor = (z: string) => {
  if (z === 'top10_assault') return 'destructive' as const;
  if (z === 'momentum_push') return 'default' as const;
  return 'secondary' as const;
};

export function AutonomousSeoSystem() {
  const [loading, setLoading] = useState(true);
  const [core, setCore] = useState<AICoreAnalysis | null>(null);
  const [actions, setActions] = useState<AutonomousAction[]>([]);
  const [velocityTargets, setVelocityTargets] = useState<VelocityTarget[]>([]);
  const [clusters, setClusters] = useState<ClusterDominanceData[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [safety, setSafety] = useState<SafetyMetrics | null>(null);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);

  const loadData = () => {
    setLoading(true);
    setCore(calculateUnifiedScore());
    setActions(generateAutonomousActions());
    setVelocityTargets(generateVelocityTargets());
    setClusters(generateClusterDominance());
    setHealthChecks(runHealthChecks());
    setRecovery(getRecoveryStatus());
    setSafety(getSafetyMetrics());
    setActionLog(getActionLog());
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  if (loading || !core || !recovery || !safety) {
    return <div className="flex items-center justify-center p-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  const autoActions = actions.filter(a => a.permission === 'auto');
  const manualActions = actions.filter(a => a.permission === 'manual');

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Brain className="h-7 w-7 text-primary" /> Autonomous SEO AI
          </h1>
          <p className="text-sm text-muted-foreground">Enterprise Semi-Autonomous Growth Engine — Safe Mode Active</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={core.status === 'optimal' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : core.status === 'healthy' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}>
            {core.status.toUpperCase()} — Score {core.unifiedScore}
          </Badge>
          {recovery.active && <Badge variant="destructive">RECOVERY MODE</Badge>}
          <Badge variant="outline" className="text-[10px]">
            {safety.actionsThisWeek}/{safety.maxActionsPerWeek} actions/wk
          </Badge>
          <Button onClick={loadData} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
        </div>
      </div>

      {/* Recovery Alert */}
      {recovery.active && (
        <Alert variant="destructive">
          <HeartPulse className="h-4 w-4" />
          <AlertTitle>Recovery Mode Active</AlertTitle>
          <AlertDescription className="text-xs">
            Triggers: {recovery.triggers.join(', ')} — Non-critical actions paused. Recovery progress: {recovery.recoveryProgress}%
          </AlertDescription>
        </Alert>
      )}

      {/* AI Core Score Rings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4" /> Central AI Core — Unified SEO Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-10 gap-3">
            <ScoreRing score={core.gscHealth} label="GSC" />
            <ScoreRing score={core.crawlHealth} label="Crawl" />
            <ScoreRing score={core.indexationHealth} label="Index" />
            <ScoreRing score={core.rankingVelocity} label="Velocity" />
            <ScoreRing score={core.ctrPerformance} label="CTR" />
            <ScoreRing score={core.linkGraphStrength} label="Links" />
            <ScoreRing score={core.revenueOverlay} label="Revenue" />
            <ScoreRing score={core.conversionHealth} label="Conv" />
            <ScoreRing score={core.canonicalIntegrity} label="Canonical" />
            <ScoreRing score={core.duplicateSuppression} label="Dedup" />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="actions" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="actions" className="text-xs py-2 gap-1 flex-1 min-w-[70px]">
            <Zap className="h-3.5 w-3.5 hidden sm:block" /> Actions
          </TabsTrigger>
          <TabsTrigger value="velocity" className="text-xs py-2 gap-1 flex-1 min-w-[70px]">
            <Crosshair className="h-3.5 w-3.5 hidden sm:block" /> Velocity
          </TabsTrigger>
          <TabsTrigger value="clusters" className="text-xs py-2 gap-1 flex-1 min-w-[70px]">
            <Layers className="h-3.5 w-3.5 hidden sm:block" /> Clusters
          </TabsTrigger>
          <TabsTrigger value="healing" className="text-xs py-2 gap-1 flex-1 min-w-[70px]">
            <HeartPulse className="h-3.5 w-3.5 hidden sm:block" /> Healing
          </TabsTrigger>
          <TabsTrigger value="safety" className="text-xs py-2 gap-1 flex-1 min-w-[70px]">
            <Shield className="h-3.5 w-3.5 hidden sm:block" /> Safety
          </TabsTrigger>
        </TabsList>

        {/* ========== AUTONOMOUS ACTIONS ========== */}
        <TabsContent value="actions" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Auto-Executed</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{autoActions.filter(a => a.status === 'completed').length}</p>
              <p className="text-[10px] text-muted-foreground">this cycle</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Queued</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{autoActions.filter(a => a.status === 'queued').length}</p>
              <p className="text-[10px] text-muted-foreground">awaiting execution</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Pending Approval</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{manualActions.filter(a => a.status === 'pending_approval').length}</p>
              <p className="text-[10px] text-muted-foreground">manual required</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Weekly Budget</p>
              <p className="text-2xl font-bold mt-1">{safety.actionsThisWeek}/{safety.maxActionsPerWeek}</p>
              <p className="text-[10px] text-muted-foreground">actions used</p>
            </CardContent></Card>
          </div>

          {/* Auto-allowed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-emerald-500" /> Auto-Allowed Actions</CardTitle>
              <CardDescription className="text-xs">Executed automatically within safety thresholds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {autoActions.map(a => (
                <div key={a.id} className="border rounded-lg p-3 flex items-start gap-3">
                  {statusIcon(a.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className="text-[9px]">{a.type.replace(/_/g, ' ')}</Badge>
                      <Badge variant={a.impact === 'high' ? 'destructive' : 'secondary'} className="text-[9px]">{a.impact}</Badge>
                      <Badge variant={a.status === 'completed' ? 'default' : 'outline'} className="text-[9px]">{a.status.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-sm font-medium">{a.description}</p>
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">{a.target}</span>
                  </div>
                  {a.rollbackAvailable && a.status === 'completed' && (
                    <Button variant="ghost" size="sm" className="text-[10px] h-7"><RotateCcw className="h-3 w-3 mr-1" /> Rollback</Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Manual-required */}
          {manualActions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Lock className="h-4 w-4 text-amber-500" /> Manual Approval Required</CardTitle>
                <CardDescription className="text-xs">These actions require explicit admin approval before execution</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {manualActions.map(a => (
                  <div key={a.id} className="border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-3">
                    {statusIcon(a.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className="text-[9px] border-amber-300">{a.type.replace(/_/g, ' ')}</Badge>
                        <Badge variant="destructive" className="text-[9px]">MANUAL</Badge>
                      </div>
                      <p className="text-sm font-medium">{a.description}</p>
                      <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">{a.target}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" className="text-[10px] h-7">Approve</Button>
                      <Button variant="ghost" size="sm" className="text-[10px] h-7">Dismiss</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ========== VELOCITY BOOSTER ========== */}
        <TabsContent value="velocity" className="space-y-4 mt-4">
          {(['top10_assault', 'momentum_push', 'snippet_rewrite'] as const).map(zone => {
            const zoneTargets = velocityTargets.filter(t => t.zone === zone);
            const zoneLabel = zone === 'top10_assault' ? 'Top 10 Assault (Pos 8–20)' : zone === 'momentum_push' ? 'Momentum Push (Pos 15–40)' : 'Snippet Rewrite (High Imp + Low CTR)';
            return (
              <Card key={zone}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Badge variant={zoneColor(zone)} className="text-[10px]">{zoneLabel}</Badge>
                    <span className="text-muted-foreground font-normal">({zoneTargets.length} pages)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {zoneTargets.map(t => (
                    <div key={t.url} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs truncate">{t.url}</p>
                          <p className="text-[11px] text-muted-foreground">"{t.keyword}" — Est. {t.estimatedWeeksToTarget}w to target</p>
                        </div>
                        <span className={`text-sm font-bold ${t.velocityScore >= 70 ? 'text-emerald-600' : t.velocityScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                          {t.velocityScore}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[11px]">
                        <div><span className="text-muted-foreground">Pos:</span> <span className="font-bold">{t.currentPosition}</span></div>
                        <div><span className="text-muted-foreground">Imp:</span> <span className="font-bold">{t.impressions}</span></div>
                        <div><span className="text-muted-foreground">CTR:</span> <span className={`font-bold ${t.ctr < 2 ? 'text-red-600' : ''}`}>{t.ctr}%</span></div>
                        <div><span className="text-muted-foreground">ETA:</span> <span className="font-bold">{t.estimatedWeeksToTarget}w</span></div>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1 border-t">
                        {t.queuedActions.map(a => (
                          <span key={a} className="text-[9px] bg-muted px-1.5 py-0.5 rounded">{a}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ========== CLUSTER DOMINATION ========== */}
        <TabsContent value="clusters" className="space-y-4 mt-4">
          {clusters.map(c => (
            <Card key={c.name} className={c.status === 'dominant' ? 'border-emerald-200 dark:border-emerald-800' : c.status === 'weak' ? 'border-red-200 dark:border-red-800' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="h-4 w-4" /> {c.name}
                    <Badge variant="outline" className="text-[9px]">Tier {c.tier}</Badge>
                  </CardTitle>
                  <Badge variant={c.status === 'dominant' ? 'default' : c.status === 'growing' ? 'secondary' : 'destructive'} className="text-[10px]">
                    {c.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
                  {[
                    { label: 'Pages', value: c.pages },
                    { label: 'Avg Pos', value: c.avgPosition },
                    { label: 'Impressions', value: c.totalImpressions.toLocaleString() },
                    { label: 'Int Links', value: c.internalLinks },
                    { label: 'Thin Nodes', value: c.thinNodes },
                    { label: 'Authority', value: c.authorityScore },
                  ].map(m => (
                    <div key={m.label}>
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      <p className="text-sm font-bold">{m.value}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Queued Actions:</p>
                  <div className="flex flex-wrap gap-1">
                    {c.actions.map(a => (
                      <span key={a} className="text-[10px] bg-muted px-2 py-0.5 rounded">{a}</span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ========== SELF-HEALING ========== */}
        <TabsContent value="healing" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><HeartPulse className="h-4 w-4" /> Health Checks</CardTitle>
              <CardDescription className="text-xs">Continuous monitoring — triggers Recovery Mode on failure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {healthChecks.map(h => (
                <div key={h.metric} className="border rounded-lg p-3 flex items-center gap-3">
                  {h.status === 'pass' ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" /> :
                   h.status === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" /> :
                   <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{h.metric}</p>
                      <Badge variant={h.status === 'pass' ? 'default' : h.status === 'warning' ? 'secondary' : 'destructive'} className="text-[9px]">{h.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{h.description}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold">{h.value}{h.metric.includes('Ratio') || h.metric.includes('Waste') ? '%' : ''}</p>
                    <p className="text-[10px] text-muted-foreground">threshold: {h.threshold}{h.metric.includes('Ratio') || h.metric.includes('Waste') ? '%' : ''}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {recovery.active && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-red-600 flex items-center gap-2"><Activity className="h-4 w-4" /> Recovery Mode Active</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-medium mb-1">Recovery Progress</p>
                  <Progress value={recovery.recoveryProgress} className="h-2" />
                  <p className="text-[10px] text-muted-foreground mt-1">{recovery.recoveryProgress}% complete</p>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Actions In Progress:</p>
                    {recovery.actionsInProgress.map(a => (
                      <div key={a} className="text-xs flex items-center gap-1"><Zap className="h-3 w-3 text-blue-500" /> {a}</div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Paused Actions:</p>
                    {recovery.pausedActions.map(a => (
                      <div key={a} className="text-xs flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" /> {a}</div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ========== ENTERPRISE SAFETY ========== */}
        <TabsContent value="safety" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Actions This Week</p>
              <p className="text-2xl font-bold mt-1">{safety.actionsThisWeek}/{safety.maxActionsPerWeek}</p>
              <Progress value={(safety.actionsThisWeek / safety.maxActionsPerWeek) * 100} className="h-1.5 mt-2" />
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Rollback Memory</p>
              <p className="text-2xl font-bold mt-1">{safety.rollbackMemoryDays}d</p>
              <p className="text-[10px] text-muted-foreground">{safety.rollbacksAvailable} available</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Total Logged</p>
              <p className="text-2xl font-bold mt-1">{safety.changesLoggedTotal}</p>
              <p className="text-[10px] text-muted-foreground">all changes tracked</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Priority</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">Stability</p>
              <p className="text-[10px] text-muted-foreground">stability &gt; speed</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Action Audit Log</CardTitle>
              <CardDescription className="text-xs">Complete history of all autonomous actions — 30-day rollback window</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2">Time</th>
                    <th className="text-left py-2 px-2">Action</th>
                    <th className="text-left py-2 px-2">Target</th>
                    <th className="text-center py-2 px-2">Mode</th>
                    <th className="text-center py-2 px-2">Status</th>
                    <th className="text-center py-2 px-2">Rollback</th>
                  </tr></thead>
                  <tbody>
                    {actionLog.map(l => (
                      <tr key={l.id} className="border-b">
                        <td className="py-2 px-2 text-muted-foreground">{new Date(l.timestamp).toLocaleDateString()}</td>
                        <td className="py-2 px-2">
                          <p className="font-medium">{l.actionType.replace(/_/g, ' ')}</p>
                          <p className="text-[10px] text-muted-foreground">{l.details}</p>
                        </td>
                        <td className="py-2 px-2 font-mono text-[11px] max-w-[120px] truncate">{l.target}</td>
                        <td className="text-center py-2 px-2">
                          <Badge variant={l.permission === 'auto' ? 'default' : 'outline'} className="text-[9px]">{l.permission}</Badge>
                        </td>
                        <td className="text-center py-2 px-2">
                          <div className="flex items-center justify-center gap-1">{statusIcon(l.status)}<span className="text-[10px]">{l.status}</span></div>
                        </td>
                        <td className="text-center py-2 px-2">
                          {l.canRollback ? (
                            <Button variant="ghost" size="sm" className="text-[10px] h-6"><RotateCcw className="h-3 w-3" /></Button>
                          ) : l.rolledBackAt ? (
                            <span className="text-[10px] text-muted-foreground">rolled back</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Safety Rules */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Lock className="h-4 w-4" /> Enterprise Safety Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium mb-2 text-emerald-600">✅ Auto-Allowed (Under Thresholds)</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Meta description updates</li>
                    <li>• Title A/B rotation (1 per 14 days)</li>
                    <li>• FAQ schema addition</li>
                    <li>• Internal link injection (max 2/page/14d)</li>
                    <li>• Sitemap regeneration</li>
                    <li>• Parameter URL noindex</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium mb-2 text-amber-600">🔒 Manual Approval Required</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Redirects (301/302)</li>
                    <li>• Canonical changes</li>
                    <li>• Content rewrites &gt;20%</li>
                    <li>• URL structure changes</li>
                  </ul>
                  <div className="mt-3 p-2 bg-muted rounded text-[10px]">
                    <p className="font-medium">Hard Limits:</p>
                    <p>• Max 5 auto-actions per week</p>
                    <p>• 30-day rollback memory</p>
                    <p>• No mass updates</p>
                    <p>• Stability &gt; Speed</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
