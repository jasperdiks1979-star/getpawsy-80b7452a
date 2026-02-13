import { useState, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Eye, Target, Zap, ShieldAlert, TrendingUp, TrendingDown,
  Link2, FileText, AlertTriangle, RefreshCw, Search, Lock,
} from 'lucide-react';
import { useSeoDashboard } from '@/hooks/useSeoDashboard';
import {
  buildSnippetTracking,
  generateSnippetSuggestions,
  generateSnippetWeeklyReport,
  type SnippetGuideTracking,
  type SnippetFlag,
} from '@/lib/snippet-monitor-engine';
import {
  generateCompoundingPlan,
  calculateCompoundingStats,
  calculate60DayProjection,
} from '@/lib/authority-compounding-engine';

// ============= HELPERS =============

const flagLabels: Record<SnippetFlag, { label: string; color: string }> = {
  SNIPPET_OPPORTUNITY: { label: 'Snippet Opp.', color: 'bg-green-500/10 text-green-700 border-green-300' },
  PAA_GROWTH: { label: 'PAA Growth', color: 'bg-blue-500/10 text-blue-700 border-blue-300' },
  H2_FROZEN: { label: 'H2 Frozen', color: 'bg-orange-500/10 text-orange-700 border-orange-300' },
  CTR_REWRITE_NEEDED: { label: 'CTR Rewrite', color: 'bg-red-500/10 text-red-700 border-red-300' },
  APPROACHING_TOP_15: { label: 'Near Top 15', color: 'bg-purple-500/10 text-purple-700 border-purple-300' },
};

const snippetStatusColors: Record<string, string> = {
  captured: 'bg-green-500/10 text-green-700',
  opportunity: 'bg-amber-500/10 text-amber-700',
  not_eligible: 'bg-muted text-muted-foreground',
  unknown: 'bg-muted text-muted-foreground',
};

const paaStatusColors: Record<string, string> = {
  growing: 'bg-green-500/10 text-green-700',
  stable: 'bg-blue-500/10 text-blue-700',
  declining: 'bg-red-500/10 text-red-700',
  none: 'bg-muted text-muted-foreground',
};

export default function SnippetMonitor() {
  const { gscResult, loading, refetch } = useSeoDashboard();

  const tracking = useMemo(() => {
    if (!gscResult?.reports?.length) return [];
    return buildSnippetTracking(gscResult.reports);
  }, [gscResult]);

  const suggestions = useMemo(() => generateSnippetSuggestions(tracking), [tracking]);
  const weeklyReport = useMemo(() => generateSnippetWeeklyReport(tracking), [tracking]);
  const compoundingStats = useMemo(() => calculateCompoundingStats(), []);
  const projection = useMemo(() => calculate60DayProjection(), []);

  const compoundingPlan = useMemo(() => {
    if (!gscResult?.reports?.length) return null;
    return generateCompoundingPlan(gscResult.reports);
  }, [gscResult]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-72" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Helmet>
        <title>Snippet & PAA Monitor | Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Snippet & PAA Monitor</h1>
            <p className="text-sm text-muted-foreground">Slow Authority Compounding · Snippet Dominance Tracking</p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-md text-sm hover:bg-primary/20 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPICard
            label="Total Impressions"
            value={weeklyReport.totalImpressions.toLocaleString()}
            icon={<Eye className="h-4 w-4" />}
          />
          <KPICard
            label="Avg Position"
            value={weeklyReport.avgPosition.toFixed(1)}
            icon={<Target className="h-4 w-4" />}
          />
          <KPICard
            label="Snippet Opps"
            value={weeklyReport.snippetOpportunities.toString()}
            icon={<Zap className="h-4 w-4" />}
            highlight={weeklyReport.snippetOpportunities > 0}
          />
          <KPICard
            label="PAA Growth"
            value={weeklyReport.paaGrowthPages.toString()}
            icon={<TrendingUp className="h-4 w-4" />}
            highlight={weeklyReport.paaGrowthPages > 0}
          />
          <KPICard
            label="Avg Inbound"
            value={compoundingStats.avgInboundLinks.toFixed(1)}
            icon={<Link2 className="h-4 w-4" />}
            subtitle={`Target: 6.0`}
          />
          <KPICard
            label="Near Top 15"
            value={weeklyReport.pagesApproachingTop15.length.toString()}
            icon={<Search className="h-4 w-4" />}
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="tracking" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-xl">
            <TabsTrigger value="tracking">Tracking</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
            <TabsTrigger value="compounding">Authority</TabsTrigger>
            <TabsTrigger value="report">Weekly Report</TabsTrigger>
          </TabsList>

          {/* TRACKING TAB */}
          <TabsContent value="tracking">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Guide Snippet & PAA Tracking</CardTitle>
                <CardDescription>{tracking.length} guides with GSC data</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {tracking.map(t => (
                      <TrackingRow key={t.slug} tracking={t} />
                    ))}
                    {tracking.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No GSC data available. Ensure sync is active.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SUGGESTIONS TAB */}
          <TabsContent value="suggestions">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Optimization Suggestions</CardTitle>
                <CardDescription>Safe, manual-approval-only actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {suggestions.map((s, i) => (
                    <div key={i} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-sm">{s.title}</h3>
                        <Badge variant={s.priority === 'high' ? 'destructive' : s.priority === 'medium' ? 'default' : 'secondary'}>
                          {s.priority}
                        </Badge>
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {s.actions.map((a, j) => (
                          <li key={j} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            {a}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-orange-600 flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" /> {s.safetyNote}
                      </p>
                    </div>
                  ))}
                  {suggestions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No suggestions at this time. All pages are stable.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* COMPOUNDING TAB */}
          <TabsContent value="compounding">
            <div className="grid gap-4 md:grid-cols-2">
              {/* 60-Day Projection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">60-Day Projection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <ProjectionRow label="Current Avg Inbound" value={projection.currentAvgInbound.toFixed(1)} />
                    <ProjectionRow label="Target Avg Inbound" value={projection.targetAvgInbound.toString()} />
                    <ProjectionRow label="Weeks Remaining" value={projection.weeksRemaining.toString()} />
                    <ProjectionRow label="Links Per Week" value={projection.linksPerWeek.toString()} />
                    <ProjectionRow label="Projected Completion" value={projection.projectedCompletion} />
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm font-medium">Status</span>
                      <Badge variant={projection.onTrack ? 'default' : 'destructive'}>
                        {projection.onTrack ? 'On Track' : 'Behind Schedule'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cluster Authority Health */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Cluster Authority Health</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {compoundingStats.clusterBreakdown.map(c => (
                      <div key={c.cluster} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="text-sm font-medium capitalize">{c.cluster.replace(/-/g, ' ')}</p>
                          <p className="text-xs text-muted-foreground">{c.guideCount} guides · avg {c.avgInbound} inbound</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.weakGuides > 0 && (
                            <Badge variant="destructive" className="text-xs">{c.weakGuides} weak</Badge>
                          )}
                          <span className="text-sm font-bold">{c.authorityScore}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Weekly Plan */}
              {compoundingPlan && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg">This Week's Link Plan</CardTitle>
                    <CardDescription>
                      {compoundingPlan.totalNewLinks} links suggested (max 6/week)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[...compoundingPlan.impressionTargets, ...compoundingPlan.underSupportedTargets].map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <div className="flex-1">
                            <span className="font-mono text-xs text-muted-foreground">{s.sourceSlug}</span>
                            <span className="mx-2 text-muted-foreground">→</span>
                            <span className="font-mono text-xs">{s.targetSlug}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{s.anchorType}</Badge>
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">"{s.anchorText}"</span>
                          </div>
                        </div>
                      ))}
                      {compoundingPlan.totalNewLinks === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No link suggestions this week.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* WEEKLY REPORT TAB */}
          <TabsContent value="report">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Weekly Summary — {weeklyReport.weekOf}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ProjectionRow label="Total Impressions" value={weeklyReport.totalImpressions.toLocaleString()} />
                  <ProjectionRow label="Avg Position" value={weeklyReport.avgPosition.toFixed(1)} />
                  <ProjectionRow label="Snippets Detected" value={weeklyReport.snippetsDetected.toString()} />
                  <ProjectionRow label="Snippet Opportunities" value={weeklyReport.snippetOpportunities.toString()} />
                  <ProjectionRow label="PAA Growth Pages" value={weeklyReport.paaGrowthPages.toString()} />
                  <ProjectionRow label="Avg Inbound Links" value={weeklyReport.avgInboundLinks.toFixed(1)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Position & CTR Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Position Changes</p>
                    <div className="flex gap-3">
                      <StatBadge label="Improved" value={weeklyReport.positionChangeSummary.improved} color="text-green-700 bg-green-500/10" />
                      <StatBadge label="Stable" value={weeklyReport.positionChangeSummary.stable} color="text-blue-700 bg-blue-500/10" />
                      <StatBadge label="Declined" value={weeklyReport.positionChangeSummary.declined} color="text-red-700 bg-red-500/10" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">CTR Distribution</p>
                    <div className="flex gap-3">
                      <StatBadge label="CTR ≥ 3%" value={weeklyReport.ctrSummary.above3} color="text-green-700 bg-green-500/10" />
                      <StatBadge label="1–3%" value={weeklyReport.ctrSummary.between1and3} color="text-blue-700 bg-blue-500/10" />
                      <StatBadge label="< 1%" value={weeklyReport.ctrSummary.below1} color="text-red-700 bg-red-500/10" />
                    </div>
                  </div>
                  {weeklyReport.pagesApproachingTop15.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Pages Approaching Top 15</p>
                      <div className="flex flex-wrap gap-1">
                        {weeklyReport.pagesApproachingTop15.map(slug => (
                          <Badge key={slug} variant="outline" className="text-xs font-mono">{slug}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ============= SUB-COMPONENTS =============

function KPICard({ label, value, icon, subtitle, highlight }: {
  label: string; value: string; icon: React.ReactNode; subtitle?: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-primary/30 bg-primary/5' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-xl font-bold">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function TrackingRow({ tracking: t }: { tracking: SnippetGuideTracking }) {
  return (
    <div className="flex items-center justify-between py-3 px-3 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs truncate">{t.slug}</span>
          {t.h2Frozen && <Lock className="h-3 w-3 text-orange-500" />}
        </div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {t.flags.map(f => (
            <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded border ${flagLabels[f].color}`}>
              {flagLabels[f].label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="text-right">
          <p className="font-medium">{t.avgPosition.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">pos</p>
        </div>
        <div className="text-right">
          <p className="font-medium">{t.impressions}</p>
          <p className="text-xs text-muted-foreground">imp</p>
        </div>
        <div className="text-right">
          <p className="font-medium">{t.ctr.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">CTR</p>
        </div>
        <Badge className={`text-[10px] ${snippetStatusColors[t.snippetStatus]}`} variant="outline">
          {t.snippetStatus === 'captured' ? '✓ Snippet' : t.snippetStatus === 'opportunity' ? '⚡ Opp' : '—'}
        </Badge>
        <Badge className={`text-[10px] ${paaStatusColors[t.paaStatus]}`} variant="outline">
          {t.paaStatus === 'growing' ? '↑ PAA' : t.paaStatus === 'stable' ? '= PAA' : t.paaStatus === 'declining' ? '↓ PAA' : '—'}
        </Badge>
      </div>
    </div>
  );
}

function ProjectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`px-3 py-1.5 rounded-md ${color}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px]">{label}</p>
    </div>
  );
}
