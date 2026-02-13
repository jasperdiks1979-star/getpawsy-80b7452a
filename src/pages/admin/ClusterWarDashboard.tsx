import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Swords, Shield, Target, AlertTriangle, Link2, Zap, Lock } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useGuidesList } from '@/hooks/useGuides';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DOG_BEDS_CLUSTER,
  CAT_LITTER_CLUSTER,
  ALL_CLUSTERS,
  calculateClusterMetrics,
  detectCrossClusterCannibalization,
  validateCrossClusterLinks,
  generateWeeklyWarPlan,
  CLUSTER_WAR_SAFETY,
  type ClusterWarMetrics,
} from '@/lib/cluster-war-engine';

// Combined link maps from both cluster dashboards
const COMBINED_LINK_MAP: Record<string, string[]> = {
  // Dog Beds
  'best-dog-bed-2026': ['best-orthopedic-dog-bed', 'calming-dog-bed-anxiety', 'outdoor-dog-games-2026', 'best-orthopedic-dog-bed-2026', 'dog-bed-for-large-breeds', 'best-cat-litter-box-2026'],
  'best-orthopedic-dog-bed': ['best-dog-bed-2026', 'dog-bed-for-large-breeds', 'outdoor-dog-games-2026'],
  'best-orthopedic-dog-bed-2026': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'calming-dog-bed-anxiety': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'dog-bed-for-large-breeds': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'memory-foam-vs-standard-dog-bed': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'best-outdoor-dog-bed': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026', 'machine-washable-dog-bed-guide', 'dog-bed-size-chart-guide'],
  'best-dog-bed-for-small-dogs': ['best-dog-bed-2026', 'calming-dog-bed-anxiety', 'dog-bed-for-anxiety', 'machine-washable-dog-bed-guide', 'dog-bed-size-chart-guide', 'best-orthopedic-dog-bed'],
  'dog-bed-buying-guide': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'dog-bed-for-anxiety', 'best-outdoor-dog-bed', 'dog-bed-size-chart-guide', 'best-dog-bed-under-100', 'machine-washable-dog-bed-guide', 'dog-bed-for-large-breeds'],
  'best-dog-bed-under-100': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'calming-dog-bed-anxiety', 'dog-bed-size-chart-guide', 'dog-bed-for-large-breeds'],
  'dog-bed-for-anxiety': ['best-dog-bed-2026', 'calming-dog-bed-anxiety', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'machine-washable-dog-bed-guide': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'dog-bed-size-chart-guide': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'calming-dog-bed-anxiety', 'dog-bed-for-large-breeds', 'dog-bed-for-anxiety'],
  // Cat Litter
  'best-cat-litter-box-2026': ['best-cat-litter-box-furniture-enclosures-2026', 'best-self-cleaning-litter-box-2026', 'best-extra-large-litter-boxes', 'best-litter-boxes-multi-cat', 'how-many-litter-boxes-per-cat', 'litter-box-placement-guide', 'best-litter-box-senior-cats', 'best-dog-bed-2026'],
  'best-extra-large-litter-boxes': ['best-cat-litter-box-2026', 'best-litter-boxes-multi-cat', 'best-litter-box-senior-cats'],
  'best-odor-control-litter-box': ['best-cat-litter-box-2026', 'best-cat-litter-box-furniture-enclosures-2026', 'best-high-sided-litter-box', 'best-self-cleaning-litter-box-2026', 'best-litter-box-studio-apartment', 'best-litter-boxes-multi-cat'],
  'best-litter-box-small-apartments': ['best-cat-litter-box-2026', 'best-litter-box-studio-apartment', 'best-cat-litter-box-furniture-enclosures-2026', 'best-odor-control-litter-box'],
  'how-many-litter-boxes-per-cat': ['best-cat-litter-box-2026', 'best-litter-boxes-multi-cat', 'litter-box-placement-guide'],
  'covered-vs-open-litter-box': ['best-cat-litter-box-2026', 'best-high-sided-litter-box', 'best-litter-boxes-multi-cat', 'best-odor-control-litter-box', 'how-many-litter-boxes-per-cat'],
  'best-cat-litter-box-furniture-enclosures-2026': ['best-cat-litter-box-2026', 'best-litter-box-small-apartments'],
  'best-self-cleaning-litter-box-2026': ['best-cat-litter-box-2026', 'best-litter-boxes-multi-cat'],
  'best-litter-box-senior-cats': ['best-cat-litter-box-2026', 'best-extra-large-litter-boxes'],
  'best-litter-box-kittens': ['best-cat-litter-box-2026', 'covered-vs-open-litter-box'],
  'best-low-tracking-litter-box': ['best-cat-litter-box-2026', 'covered-vs-open-litter-box', 'best-high-sided-litter-box'],
  'automatic-vs-manual-litter-box': ['best-cat-litter-box-2026', 'best-self-cleaning-litter-box-2026'],
  'litter-box-placement-guide': ['best-cat-litter-box-2026', 'how-many-litter-boxes-per-cat', 'best-litter-box-small-apartments'],
  'best-litter-box-odor-bathroom': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'litter-box-odor-control-tips'],
  'litter-box-for-studio-apartment': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'best-high-sided-litter-box'],
  'best-litter-box-for-multiple-cats': ['best-cat-litter-box-2026', 'how-many-litter-boxes-per-cat', 'best-extra-large-litter-boxes', 'best-high-sided-litter-box', 'best-odor-control-litter-box', 'litter-box-for-studio-apartment'],
  'top-rated-litter-box-under-100': ['best-cat-litter-box-2026', 'best-high-sided-litter-box', 'best-odor-control-litter-box', 'best-litter-box-for-multiple-cats'],
  'high-sided-litter-box-guide': ['best-cat-litter-box-2026', 'covered-vs-open-litter-box', 'best-extra-large-litter-boxes', 'best-litter-box-for-multiple-cats'],
  'litter-box-odor-control-tips': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'covered-vs-open-litter-box', 'best-litter-box-for-multiple-cats'],
  'best-litter-box-studio-apartment': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'best-litter-box-small-apartments'],
  'best-litter-boxes-multi-cat': ['best-cat-litter-box-2026', 'how-many-litter-boxes-per-cat', 'best-extra-large-litter-boxes'],
  'best-litter-box-under-100': ['best-cat-litter-box-2026', 'best-high-sided-litter-box', 'best-odor-control-litter-box'],
  'best-high-sided-litter-box': ['best-cat-litter-box-2026', 'covered-vs-open-litter-box', 'best-extra-large-litter-boxes'],
  'cat-litter-box-odor-solutions': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'litter-box-odor-control-tips'],
};

const MetricCard = ({ label, value, target, suffix }: { label: string; value: number | string; target?: string; suffix?: string }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-2xl font-bold">{value}{suffix}</div>
    {target && <div className="text-xs text-muted-foreground">{target}</div>}
  </div>
);

const ClusterColumn = ({ metrics, color }: { metrics: ClusterWarMetrics; color: string }) => (
  <Card className={`border-t-4 ${color}`}>
    <CardHeader className="pb-2">
      <CardTitle className="text-lg flex items-center justify-between">
        <span>{metrics.clusterName}</span>
        <Badge variant="outline" className="font-mono text-xs">{metrics.clusterScore}/100</Badge>
      </CardTitle>
      <div className="text-xs text-muted-foreground font-mono">/{metrics.cornerstone}</div>
    </CardHeader>
    <CardContent>
      <Progress value={metrics.clusterScore} className="h-2 mb-4" />
      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Total Guides" value={metrics.totalGuides} target={`${metrics.supportCount}S · ${metrics.microCount}M`} />
        <MetricCard label="Cornerstone Inbound" value={metrics.cornerstoneInbound} target={metrics.clusterId === 'cat-litter' ? 'target: ≥14' : 'target: ≥12'} />
        <MetricCard label="Avg Inbound" value={metrics.avgInboundLinks} target="target: ≥10" />
        <MetricCard label="Cannibalization" value={metrics.cannibalizationScore} target={metrics.cannibalizationScore === 0 ? '✅ Clean' : '⚠️ Overlaps'} />
        <MetricCard label="Snippet" value={metrics.snippetDetected ? '✅ Detected' : '—'} target="monitoring" />
      </div>
    </CardContent>
  </Card>
);

const ClusterWarDashboard = () => {
  const { data: allGuides } = useGuidesList();

  const analysis = useMemo(() => {
    if (!allGuides) return null;

    const existingSlugs = new Set(allGuides.map(g => g.slug));
    const guideKeywords: Record<string, string[]> = {};
    allGuides.forEach(g => { guideKeywords[g.slug] = g.keywords; });

    const dogBedsMetrics = calculateClusterMetrics(DOG_BEDS_CLUSTER, COMBINED_LINK_MAP, guideKeywords, existingSlugs);
    const catLitterMetrics = calculateClusterMetrics(CAT_LITTER_CLUSTER, COMBINED_LINK_MAP, guideKeywords, existingSlugs);

    const crossCannibalization = detectCrossClusterCannibalization(guideKeywords);
    const linkViolations = validateCrossClusterLinks(COMBINED_LINK_MAP);
    const weeklyPlan = generateWeeklyWarPlan(1, 0, 0, null);

    // 90-day targets
    const targets = {
      bothTop15: false,
      avgInbound10: dogBedsMetrics.avgInboundLinks >= 10 && catLitterMetrics.avgInboundLinks >= 10,
      snippetPerCluster: dogBedsMetrics.snippetDetected && catLitterMetrics.snippetDetected,
      zeroCannibalization: crossCannibalization.length === 0,
      stableGrowth: true,
    };

    return { dogBedsMetrics, catLitterMetrics, crossCannibalization, linkViolations, weeklyPlan, targets };
  }, [allGuides]);

  if (!analysis) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <meta name="robots" content="noindex, follow" />
        <title>Cluster War Dashboard | Admin</title>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/dashboard/guides-seo" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Swords className="w-6 h-6 text-red-500" />
              Cluster War — Dog Beds vs Cat Litter
            </h1>
            <p className="text-muted-foreground text-sm">Cross-cluster strategy, keyword firewalls & authority isolation</p>
          </div>
        </div>

        {/* Side-by-side Cluster Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <ClusterColumn metrics={analysis.dogBedsMetrics} color="border-t-blue-500" />
          <ClusterColumn metrics={analysis.catLitterMetrics} color="border-t-amber-500" />
        </div>

        {/* 90-Day Objectives */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5" />
              90-Day War Objectives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Both cornerstones Top 15', met: analysis.targets.bothTop15 },
                { label: 'Avg inbound ≥ 10', met: analysis.targets.avgInbound10 },
                { label: '1 snippet per cluster', met: analysis.targets.snippetPerCluster },
                { label: 'Zero cross-cannibalization', met: analysis.targets.zeroCannibalization },
                { label: 'Stable ranking growth', met: analysis.targets.stableGrowth },
              ].map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${t.met ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  <span>{t.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Keyword Firewall */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-500" />
              Keyword Firewall — Cross-Cluster Cannibalization
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analysis.crossCannibalization.length === 0 ? (
              <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                No cross-cluster keyword conflicts detected. Firewall holding.
              </div>
            ) : (
              <div className="space-y-2">
                {analysis.crossCannibalization.map((conflict, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm py-2 border-b border-border/30 last:border-0">
                    <Badge variant={conflict.severity === 'high' ? 'destructive' : 'outline'} className="text-[10px] flex-shrink-0">
                      {conflict.severity}
                    </Badge>
                    <div>
                      <span className="font-mono text-xs">{conflict.keyword}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="font-medium">{conflict.slug1}</span>
                      <Badge variant="outline" className="mx-1 text-[9px]">{conflict.cluster1}</Badge>
                      <span className="text-muted-foreground">vs</span>
                      <span className="font-medium ml-1">{conflict.slug2}</span>
                      <Badge variant="outline" className="ml-1 text-[9px]">{conflict.cluster2}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cross-Cluster Link Violations */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-500" />
              Cross-Cluster Link Audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analysis.linkViolations.length === 0 ? (
              <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                Cross-cluster linking within limits. Cornerstone↔Cornerstone bridge active.
              </div>
            ) : (
              <div className="space-y-2">
                {analysis.linkViolations.map((v, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm py-2 border-b border-border/30 last:border-0">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-foreground">{v.violation}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {v.sourceSlug} <span className="text-muted-foreground">({v.sourceCluster})</span> → {v.targetSlug} <span className="text-muted-foreground">({v.targetCluster})</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly War Cycle */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Weekly War Cycle — Week {analysis.weeklyPlan.weekNumber}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  Dog Beds
                </div>
                <div className="text-sm text-muted-foreground pl-5">{analysis.weeklyPlan.dogBedsAction}</div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  Cat Litter
                </div>
                <div className="text-sm text-muted-foreground pl-5">{analysis.weeklyPlan.catLitterAction}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Max Injections</div>
                <div className="font-mono font-bold">{analysis.weeklyPlan.totalInjections}/6</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Cornerstone Reinforced</div>
                <div className="font-mono font-bold text-xs">{analysis.weeklyPlan.cornerstoneReinforced || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Balance</div>
                <Badge variant={analysis.weeklyPlan.balanceCheck === 'balanced' ? 'outline' : 'destructive'} className="text-[10px]">
                  {analysis.weeklyPlan.balanceCheck}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Safety Limits */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="w-5 h-5 text-muted-foreground" />
              Safety Limits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {[
                { label: 'Max outbound/article', value: CLUSTER_WAR_SAFETY.maxOutboundPerArticle },
                { label: 'Max cross-cluster links/support', value: CLUSTER_WAR_SAFETY.maxCrossClusterLinksPerSupport },
                { label: 'Max exact anchor repetition', value: CLUSTER_WAR_SAFETY.maxExactAnchorRepetition },
                { label: 'Max weekly injections', value: CLUSTER_WAR_SAFETY.maxWeeklyInjections },
                { label: 'Max structural edits/14d', value: CLUSTER_WAR_SAFETY.maxStructuralEditsPerPagePer14Days },
                { label: 'No slug changes', value: '✅' },
                { label: 'No mass rewrites', value: '✅' },
                { label: 'Manual approval', value: '✅' },
              ].map((rule, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30">
                  <span className="text-muted-foreground text-xs">{rule.label}</span>
                  <span className="font-mono font-bold text-xs">{rule.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Snippet Territory */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-500" />
              Snippet Territory Control
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {ALL_CLUSTERS.map(cluster => (
                <div key={cluster.id} className="space-y-2">
                  <div className="font-medium text-sm">{cluster.name}</div>
                  <div className="text-xs text-muted-foreground">Target H2:</div>
                  <div className="text-sm font-mono bg-muted/30 px-3 py-2 rounded">{cluster.snippetTarget}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px]">{cluster.snippetStructure}</Badge>
                    <span className="text-muted-foreground">answer structure</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="mt-6 flex gap-3 flex-wrap">
          <Link to="/admin/dog-beds-cluster" className="text-sm text-primary hover:underline">→ Dog Beds Cluster Detail</Link>
          <Link to="/admin/cat-litter-cluster" className="text-sm text-primary hover:underline">→ Cat Litter Cluster Detail</Link>
          <Link to="/admin/internal-link-log" className="text-sm text-primary hover:underline">→ Internal Link Log</Link>
          <Link to="/admin/snippet-monitor" className="text-sm text-primary hover:underline">→ Snippet Monitor</Link>
        </div>
      </div>
    </Layout>
  );
};

export default ClusterWarDashboard;
