import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Crown, Target, Link2, AlertTriangle, TrendingUp, Shield,
  Check, X, RefreshCw, ChevronRight, Layers, Lightbulb,
} from 'lucide-react';
import { useSeoDashboard } from '@/hooks/useSeoDashboard';
import {
  buildCornerstoneDominance,
  getAvailableClusters,
  type ClusterID,
  type CornerstoneDominanceProfile,
} from '@/lib/cornerstone-dominance-engine';

export default function ClusterDominance() {
  const { gscResult, loading, refetch } = useSeoDashboard();
  const clusters = useMemo(() => getAvailableClusters(), []);
  const [selectedCluster, setSelectedCluster] = useState<ClusterID>('cat-litter');

  const profile = useMemo(() => {
    if (!gscResult?.reports) return null;
    return buildCornerstoneDominance(selectedCluster, gscResult.reports);
  }, [gscResult, selectedCluster]);

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
        <title>Cluster Dominance | Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Crown className="h-6 w-6 text-amber-500" /> Cornerstone Domination
            </h1>
            <p className="text-sm text-muted-foreground">90-Day Controlled Authority Blueprint</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {clusters.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCluster(c.id)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    selectedCluster === c.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {c.label} ({c.guideCount})
                </button>
              ))}
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-md text-sm hover:bg-primary/20 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>

        {profile && (
          <>
            {/* KPI Progress */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-sm">90-Day Progress — {profile.clusterLabel}</h2>
                  <Badge variant={profile.kpiTracker.overallProgress >= 80 ? 'default' : profile.kpiTracker.overallProgress >= 40 ? 'secondary' : 'destructive'}>
                    {profile.kpiTracker.overallProgress}%
                  </Badge>
                </div>
                <Progress value={profile.kpiTracker.overallProgress} className="h-2 mb-4" />
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <KPITarget label="Cornerstone Top 15" hit={profile.kpiTracker.targets.cornerstoneTop15} value={`Pos ${profile.kpiTracker.cornerstonePosition.toFixed(0)}`} />
                  <KPITarget label="Cluster +10 Positions" hit={profile.kpiTracker.targets.clusterPositionImproved10} value={`Avg ${profile.kpiTracker.avgClusterPosition}`} />
                  <KPITarget label="Cornerstone ≥8 Inbound" hit={profile.kpiTracker.targets.cornerstoneInbound8Plus} value={`${profile.primaryCornerstone.inboundLinks} links`} />
                  <KPITarget label="Snippet Triggered" hit={profile.kpiTracker.targets.snippetTriggered} value={profile.kpiTracker.snippetOpportunityDetected ? 'Yes' : 'No'} />
                  <KPITarget label="Zero Cannibalization" hit={profile.kpiTracker.targets.zeroCannibalization} value={`${profile.kpiTracker.cannibalizationConflicts} issues`} />
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="cornerstone" className="space-y-4">
              <TabsList className="grid grid-cols-5 w-full max-w-2xl">
                <TabsTrigger value="cornerstone">Cornerstone</TabsTrigger>
                <TabsTrigger value="supports">Supports</TabsTrigger>
                <TabsTrigger value="gaps">Micro-Gaps</TabsTrigger>
                <TabsTrigger value="loop">Authority Loop</TabsTrigger>
                <TabsTrigger value="plan">Weekly Plan</TabsTrigger>
              </TabsList>

              {/* CORNERSTONE TAB */}
              <TabsContent value="cornerstone">
                <CornerstoneCard profile={profile} />
              </TabsContent>

              {/* SUPPORTS TAB */}
              <TabsContent value="supports">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Support Guides ({profile.supportGuides.length})</CardTitle>
                    <CardDescription>Each must link to cornerstone, a sibling, and have micro-intent H3</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-2">
                        {profile.supportGuides
                          .sort((a, b) => b.complianceScore - a.complianceScore)
                          .map(s => (
                            <div key={s.slug} className="flex items-center justify-between py-3 px-3 border rounded-lg">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px]">{s.role}</Badge>
                                  <span className="font-mono text-xs truncate">{s.slug}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <ComplianceDot ok={s.linksToCornerstone} label="→ Cornerstone" />
                                  <ComplianceDot ok={s.linksSiblingSupport} label="→ Sibling" />
                                  <ComplianceDot ok={s.hasMicroIntentH3} label="H3 Micro" />
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-right">
                                  <p className="font-medium">{s.avgPosition.toFixed(0)}</p>
                                  <p className="text-[10px] text-muted-foreground">pos</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-medium">{s.impressions}</p>
                                  <p className="text-[10px] text-muted-foreground">imp</p>
                                </div>
                                <div className="text-right min-w-[45px]">
                                  <Progress value={s.complianceScore} className="h-1.5 w-10" />
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.complianceScore}%</p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* MICRO-GAPS TAB */}
              <TabsContent value="gaps">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-amber-500" /> Micro-Intent Expansion Gaps
                    </CardTitle>
                    <CardDescription>Suggested 800–1200 word micro guides for {profile.clusterLabel}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {profile.microIntentGaps.map((gap, i) => (
                        <div key={i} className="flex items-center justify-between py-3 px-3 border rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{gap.suggestedTitle}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Target KW: {gap.targetKeyword}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{gap.estimatedDifficulty}</Badge>
                            {gap.exists ? (
                              <Badge className="bg-green-500/10 text-green-700 text-xs">
                                <Check className="h-3 w-3 mr-1" /> Covered
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                <X className="h-3 w-3 mr-1" /> Gap
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* AUTHORITY LOOP TAB */}
              <TabsContent value="loop">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Authority Loop Structure</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <LoopStat label="Micro → Support (Hub)" value={profile.authorityLoop.microToSupport} icon={<ChevronRight className="h-4 w-4" />} />
                      <LoopStat label="Support → Cornerstone" value={profile.authorityLoop.supportToCornerstone} icon={<ChevronRight className="h-4 w-4" />} />
                      <LoopStat label="Cornerstone → Support" value={profile.authorityLoop.cornerstoneToSupport} icon={<ChevronRight className="h-4 w-4" />} />
                      <div className="pt-3 border-t">
                        <Badge variant={profile.authorityLoop.overallHealthy ? 'default' : 'destructive'}>
                          {profile.authorityLoop.overallHealthy ? '✓ Loop Healthy' : '⚠ Issues Detected'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Issues</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {profile.authorityLoop.circularLinks.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-red-600 mb-1">Circular Links</p>
                          {profile.authorityLoop.circularLinks.map((c, i) => (
                            <p key={i} className="text-xs font-mono text-muted-foreground">{c}</p>
                          ))}
                        </div>
                      )}
                      {profile.authorityLoop.maxOutboundExceeded.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-orange-600 mb-1">Max Outbound Exceeded ({'>'}8)</p>
                          {profile.authorityLoop.maxOutboundExceeded.map((s, i) => (
                            <p key={i} className="text-xs font-mono text-muted-foreground">{s}</p>
                          ))}
                        </div>
                      )}
                      {profile.cannibalizationRisks.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-red-600 mb-1">Cannibalization Risks</p>
                          {profile.cannibalizationRisks.map((c, i) => (
                            <div key={i} className="mb-2">
                              <p className="text-xs font-medium">"{c.keyword}"</p>
                              <p className="text-[10px] text-muted-foreground">{c.slugs.join(', ')}</p>
                              <p className="text-[10px] text-orange-600">{c.resolution}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {profile.authorityLoop.circularLinks.length === 0 &&
                       profile.authorityLoop.maxOutboundExceeded.length === 0 &&
                       profile.cannibalizationRisks.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No issues detected.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* WEEKLY PLAN TAB */}
              <TabsContent value="plan">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Weekly Link Plan</CardTitle>
                    <CardDescription>
                      {profile.weeklyPlan.totalInjections} injections (max {6}/week) · Authority Score: {profile.weeklyPlan.clusterAuthorityScore}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {profile.weeklyPlan.cornerstoneLinks.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Crown className="h-3 w-3 text-amber-500" /> To Cornerstone
                          </p>
                          {profile.weeklyPlan.cornerstoneLinks.map((l, i) => (
                            <LinkRow key={i} link={l} />
                          ))}
                        </div>
                      )}
                      {profile.weeklyPlan.supportRotationLinks.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Layers className="h-3 w-3" /> To Support (Rotation)
                          </p>
                          {profile.weeklyPlan.supportRotationLinks.map((l, i) => (
                            <LinkRow key={i} link={l} />
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}

// ============= SUB-COMPONENTS =============

function KPITarget({ label, hit, value }: { label: string; hit: boolean; value: string }) {
  return (
    <div className={`p-3 rounded-lg border ${hit ? 'bg-green-500/5 border-green-300' : 'bg-muted/50 border-border'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {hit ? <Check className="h-3.5 w-3.5 text-green-600" /> : <X className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function CornerstoneCard({ profile }: { profile: CornerstoneDominanceProfile }) {
  const cs = profile.primaryCornerstone;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" /> {cs.title}
        </CardTitle>
        <CardDescription className="font-mono text-xs">{cs.slug}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Avg Position" value={cs.avgPosition.toFixed(1)} />
          <StatCard label="Impressions" value={cs.impressions.toLocaleString()} />
          <StatCard label="Inbound Links" value={cs.inboundLinks.toString()} subtitle={`Target: ≥${8}`} />
          <StatCard label="Cross-Cluster" value={cs.crossClusterLinks.toString()} subtitle="Target: ≥1" />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Completion Score</span>
            <Badge variant={cs.status === 'healthy' ? 'default' : cs.status === 'needs_work' ? 'secondary' : 'destructive'}>
              {cs.status}
            </Badge>
          </div>
          <Progress value={cs.completionScore} className="h-2" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <ComplianceDot ok={cs.hasComparisonTable} label="Comparison Table" />
          <ComplianceDot ok={cs.hasFAQBlock} label="FAQ Block (5Q)" />
          <ComplianceDot ok={cs.hasSnippetH2} label="Snippet-Ready H2" />
          <ComplianceDot ok={cs.hasYearReference} label="Year 2026" />
        </div>

        {cs.inboundSlugs.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Inbound Links ({cs.inboundSlugs.length})</p>
            <div className="flex flex-wrap gap-1">
              {cs.inboundSlugs.map(slug => (
                <Badge key={slug} variant="outline" className="text-[10px] font-mono">{slug}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <div className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function LoopStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground flex items-center gap-1">{icon} {label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function LinkRow({ link }: { link: { sourceSlug: string; targetSlug: string; anchorText: string; anchorType: string; reason: string } }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
      <div className="flex-1 min-w-0">
        <span className="font-mono text-xs text-muted-foreground">{link.sourceSlug}</span>
        <span className="mx-2 text-muted-foreground">→</span>
        <span className="font-mono text-xs">{link.targetSlug}</span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">{link.anchorType}</Badge>
        <span className="text-xs text-muted-foreground truncate max-w-[120px]">"{link.anchorText}"</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="p-3 border rounded-lg">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
