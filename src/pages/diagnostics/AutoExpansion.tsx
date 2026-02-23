import { useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Helmet } from 'react-helmet-async';
import { buildExpansionEngineState, type KeywordCluster } from '@/lib/auto-expansion-engine';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain, TrendingUp, AlertTriangle, Target, Zap, BarChart3,
  ArrowUp, Clock, CheckCircle, Pause, Layers, Link2, Search,
} from 'lucide-react';

const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const usd = (n: number) => `$${n.toLocaleString()}`;

const TYPE_COLORS: Record<string, string> = {
  emerging: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  weak: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  cannibalized: 'bg-red-500/10 text-red-600 border-red-500/20',
  revenue_weighted: 'bg-green-500/10 text-green-600 border-green-500/20',
};

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  active: Zap, queued: Clock, paused: Pause, completed: CheckCircle, retired: AlertTriangle,
};

export default function AutoExpansion() {
  const state = useMemo(() => buildExpansionEngineState(), []);
  const { clusters, executionQueue, cannibalizationAlerts, selfLearningCycle, summary } = state;

  return (
    <Layout>
      <Helmet>
        <title>Auto-Expansion Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            AI Auto-Expansion Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Autonomous topical authority expansion · Revenue-weighted cluster scoring · Self-learning loop
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard icon={Layers} label="Total Clusters" value={summary.totalClusters} />
          <SummaryCard icon={Zap} label="Active" value={summary.activeClusters} color="text-green-500" />
          <SummaryCard icon={TrendingUp} label="90d Revenue Pot." value={usd(summary.totalRevenuePotential90d)} color="text-primary" />
          <SummaryCard icon={Target} label="Fastest Scaling" value={summary.fastestScalingCluster} small />
          <SummaryCard icon={AlertTriangle} label="Cannibalization" value={summary.cannibalizationCount} color={summary.cannibalizationCount > 0 ? 'text-red-500' : 'text-green-500'} />
        </div>

        {/* Top 10 Clusters Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Top 10 Cluster Opportunities</CardTitle>
            <CardDescription>Ranked by ExpansionScore = (Impressions × IntentWeight × RevenuePotential) ÷ CompetitionDensity</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">Cluster</th>
                    <th className="text-center py-2 px-1">Type</th>
                    <th className="text-right py-2 px-1">Impr.</th>
                    <th className="text-right py-2 px-1">Avg Pos</th>
                    <th className="text-right py-2 px-1">Exp. Score</th>
                    <th className="text-right py-2 px-1">Rev @5</th>
                    <th className="text-right py-2 px-1">Rev @3</th>
                    <th className="text-center py-2 px-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {clusters.slice(0, 10).map((c, i) => {
                    const StatusIcon = STATUS_ICON[c.status] || Clock;
                    return (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-2 font-bold text-muted-foreground">{i + 1}</td>
                        <td className="py-2 px-2">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{c.queries[0]?.query}</div>
                        </td>
                        <td className="py-2 px-1 text-center">
                          <Badge variant="outline" className={`text-[9px] ${TYPE_COLORS[c.clusterType]}`}>
                            {c.clusterType.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-2 px-1 text-right font-mono">{fmt(c.totalImpressions)}</td>
                        <td className="py-2 px-1 text-right font-mono">{c.avgPosition.toFixed(1)}</td>
                        <td className="py-2 px-1 text-right">
                          <span className="font-bold text-primary">{c.expansionScore}</span>
                        </td>
                        <td className="py-2 px-1 text-right font-mono text-green-600">{usd(c.revenueProjection.rank5.revenue30d)}/mo</td>
                        <td className="py-2 px-1 text-right font-mono text-green-700 font-bold">{usd(c.revenueProjection.rank3.revenue30d)}/mo</td>
                        <td className="py-2 px-1 text-center">
                          <StatusIcon className={`h-3.5 w-3.5 mx-auto ${c.status === 'active' ? 'text-green-500' : 'text-muted-foreground'}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Execution Queue */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Execution Queue</CardTitle>
              <CardDescription>Max 3 clusters live · Highest ExpansionScore first</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {executionQueue.slice(0, 8).map((q, i) => {
                  const StatusIcon = STATUS_ICON[q.status] || Clock;
                  return (
                    <div key={q.clusterId} className="flex items-center justify-between py-2 px-3 rounded-lg border text-xs hover:bg-muted/30">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${q.status === 'active' ? 'text-green-500' : 'text-muted-foreground'}`} />
                        <div>
                          <div className="font-medium">{q.clusterName}</div>
                          {q.startedAt && <div className="text-[10px] text-muted-foreground">Started {new Date(q.startedAt).toLocaleDateString()}</div>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary">{q.expansionScore}</div>
                        <div className="text-[10px] text-muted-foreground">{usd(q.revenuePotential)} 90d</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Revenue Simulation */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> 90-Day Revenue Simulation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {clusters.slice(0, 5).map(c => (
                  <div key={c.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">{c.name}</span>
                      <Badge variant="outline" className="text-[9px]">{c.intentType}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="text-center p-1.5 rounded bg-muted/50">
                        <div className="text-muted-foreground">@Rank 8</div>
                        <div className="font-bold">{usd(c.revenueProjection.rank8.revenue90d)}</div>
                        <div className="text-muted-foreground">{c.revenueProjection.rank8.monthlyClicks} clicks/mo</div>
                      </div>
                      <div className="text-center p-1.5 rounded bg-primary/5 border border-primary/10">
                        <div className="text-muted-foreground">@Rank 5</div>
                        <div className="font-bold text-primary">{usd(c.revenueProjection.rank5.revenue90d)}</div>
                        <div className="text-muted-foreground">{c.revenueProjection.rank5.monthlyClicks} clicks/mo</div>
                      </div>
                      <div className="text-center p-1.5 rounded bg-green-500/5 border border-green-500/10">
                        <div className="text-muted-foreground">@Rank 3</div>
                        <div className="font-bold text-green-600">{usd(c.revenueProjection.rank3.revenue90d)}</div>
                        <div className="text-muted-foreground">{c.revenueProjection.rank3.monthlyClicks} clicks/mo</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Cannibalization Alerts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Cannibalization Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cannibalizationAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No cannibalization detected ✓</p>
              ) : (
                <div className="space-y-2">
                  {cannibalizationAlerts.map((a, i) => (
                    <div key={i} className="border border-red-500/20 bg-red-500/5 rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{a.query}</span>
                        <Badge variant="destructive" className="text-[9px]">{a.severity}</Badge>
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        {a.pages.length} URLs competing · {fmt(a.impressions)} impressions
                      </div>
                      <div className="mt-1 text-[10px] font-medium text-red-600">Fix: {a.fix}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Self-Learning Loop */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4" /> Self-Learning Loop (14-day cycle)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cycle</span>
                  <span className="font-bold">#{selfLearningCycle.cycleNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Run</span>
                  <span>{new Date(selfLearningCycle.lastRun).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next Run</span>
                  <span className="text-primary font-medium">{new Date(selfLearningCycle.nextRun).toLocaleDateString()}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Recent Adjustments</div>
                  {selfLearningCycle.adjustments.map((adj, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-1 text-[11px]">
                      <ArrowUp className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                      <span>{adj}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Structural Blueprint (Top 3) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Structural Blueprint — Top 3 Clusters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {clusters.slice(0, 3).map(c => (
                <div key={c.id} className="border rounded-lg p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold">{c.name}</h3>
                    <Badge variant="outline" className={`text-[9px] mt-1 ${TYPE_COLORS[c.clusterType]}`}>
                      {c.clusterType.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {c.suggestedActions.map((a, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <CheckCircle className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium">{a.type.replace(/_/g, ' ')}</span>
                          <span className="text-muted-foreground ml-1">— {a.description}</span>
                          <Badge variant="secondary" className="text-[8px] ml-1">+{a.estimatedImpact}%</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground border-t pt-2">
                    Queries: {c.queries.map(q => q.query).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon: Icon, label, value, color, small }: {
  icon: typeof Brain; label: string; value: string | number; color?: string; small?: boolean;
}) {
  return (
    <div className="border rounded-lg p-3 text-center">
      <Icon className={`h-4 w-4 mx-auto mb-1 ${color || 'text-muted-foreground'}`} />
      <div className={`font-bold ${small ? 'text-xs' : 'text-lg'}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
