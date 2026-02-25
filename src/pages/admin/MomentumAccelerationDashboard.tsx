import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Zap, Target, AlertTriangle, TrendingUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
// Layout removed — AdminLayout provides admin shell
import { useGuidesList } from '@/hooks/useGuides';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { selectAccelerationTargets, generateWeeklyInjectionPlan, shouldTriggerCTRMomentum, shouldTriggerSnippetAcceleration, analyzeImpressionDelta, calculateVolatilityScore, assessVolatilityRisk, calculate45DayProgress } from '@/lib/momentum-acceleration-engine';

const SIMULATED_METRICS: Record<string, { position: number; impressions: number; ctr: number; previousWeekImpressions: number }> = {
  'best-dog-bed-2026': { position: 22, impressions: 180, ctr: 1.2, previousWeekImpressions: 140 },
  'best-cat-litter-box-2026': { position: 18, impressions: 220, ctr: 1.8, previousWeekImpressions: 175 },
  'best-orthopedic-dog-bed': { position: 45, impressions: 65, ctr: 0.8, previousWeekImpressions: 60 },
  'best-odor-control-litter-box': { position: 38, impressions: 85, ctr: 0.9, previousWeekImpressions: 70 },
};

const MomentumAccelerationDashboard = () => {
  const { data: allGuides } = useGuidesList();
  const [cycleStartDate] = useState(new Date('2026-02-13').toISOString());

  const analysis = useMemo(() => {
    if (!allGuides) return null;

    const dogBedsPages = allGuides
      .filter(g => ['best-dog-bed-2026', 'best-orthopedic-dog-bed'].includes(g.slug))
      .map(g => {
        const m = SIMULATED_METRICS[g.slug];
        return { slug: g.slug, position: m?.position || 50, impressions: m?.impressions || 0 };
      });

    const catLitterPages = allGuides
      .filter(g => ['best-cat-litter-box-2026', 'best-odor-control-litter-box'].includes(g.slug))
      .map(g => {
        const m = SIMULATED_METRICS[g.slug];
        return { slug: g.slug, position: m?.position || 50, impressions: m?.impressions || 0 };
      });

    const targets = selectAccelerationTargets(dogBedsPages, catLitterPages);
    const weeklyPlan1 = generateWeeklyInjectionPlan(1);
    const weeklyPlan2 = generateWeeklyInjectionPlan(2);

    const dogBedsMetrics = targets.dogBeds ? SIMULATED_METRICS[targets.dogBeds.slug] : null;
    const catLitterMetrics = targets.catLitter ? SIMULATED_METRICS[targets.catLitter.slug] : null;

    const dogBedsDelta = targets.dogBeds && dogBedsMetrics ? analyzeImpressionDelta(dogBedsMetrics.previousWeekImpressions, dogBedsMetrics.impressions) : null;
    const catLitterDelta = targets.catLitter && catLitterMetrics ? analyzeImpressionDelta(catLitterMetrics.previousWeekImpressions, catLitterMetrics.impressions) : null;

    const volatilityScore = calculateVolatilityScore([22, 23, 21, 22, 24, 23, 22], [150, 160, 170, 180, 175, 180, 180], [1.0, 1.1, 1.2, 1.3, 1.2, 1.2, 1.2]);
    const volatilityRisk = assessVolatilityRisk(volatilityScore);
    const progress45day = calculate45DayProgress(cycleStartDate, 0, 0, 7);

    return {
      targets,
      weeklyPlan1,
      weeklyPlan2,
      dogBedsMetrics,
      catLitterMetrics,
      dogBedsDelta,
      catLitterDelta,
      volatilityScore,
      volatilityRisk,
      progress45day,
      dogBeedsCTRMomentum: targets.dogBeds && dogBedsMetrics ? shouldTriggerCTRMomentum(dogBedsMetrics.position) : false,
      catLitterCTRMomentum: targets.catLitter && catLitterMetrics ? shouldTriggerCTRMomentum(catLitterMetrics.position) : false,
      dogBedsSnippet: targets.dogBeds && dogBedsMetrics ? shouldTriggerSnippetAcceleration(dogBedsMetrics.position) : false,
      catLitterSnippet: targets.catLitter && catLitterMetrics ? shouldTriggerSnippetAcceleration(catLitterMetrics.position) : false,
    };
  }, [allGuides, cycleStartDate]);

  if (!analysis) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <>
      <Helmet><meta name="robots" content="noindex, follow" /><title>Momentum Acceleration Dashboard | Admin</title></Helmet>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/dashboard/guides-seo" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="w-6 h-6 text-yellow-400" />Momentum Acceleration — 45-Day Sprint</h1>
            <p className="text-muted-foreground text-sm">Controlled ranking acceleration with weekly injection limits</p>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">🚀 Acceleration Mode: ACTIVE</Badge>
          <Badge variant="outline" className="text-xs">Cycle Progress: {analysis.progress45day.progressPercent}%</Badge>
        </div>

        <Card className="mb-8 border-t-4 border-t-blue-500">
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Target className="w-5 h-5" />14-Day Priority Rotation</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 p-4 rounded-lg border border-blue-500/20">
                <div className="font-medium text-sm flex items-center justify-between"><span>🐕 Dog Beds</span>{analysis.targets.dogBeds ? <Badge variant="outline" className="text-xs font-mono">{analysis.targets.dogBeds.currentPosition}</Badge> : <Badge variant="outline" className="text-xs">No target</Badge>}</div>
                {analysis.targets.dogBeds ? (
                  <>
                    <Link to={`/guides/${analysis.targets.dogBeds.slug}`} className="text-sm text-primary hover:underline font-mono">/{analysis.targets.dogBeds.slug}</Link>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-muted-foreground">Position</div><div className="font-bold">{analysis.targets.dogBeds.currentPosition}</div></div>
                      <div><div className="text-muted-foreground">Impressions</div><div className="font-bold">{analysis.targets.dogBeds.currentImpressions}</div></div>
                      <div><div className="text-muted-foreground">CTR</div><div className="font-bold">{analysis.targets.dogBeds.currentCTR}%</div></div>
                    </div>
                  </>
                ) : <div className="text-xs text-muted-foreground">No pages in position &lt;30</div>}
              </div>

              <div className="space-y-3 p-4 rounded-lg border border-amber-500/20">
                <div className="font-medium text-sm flex items-center justify-between"><span>🐱 Cat Litter</span>{analysis.targets.catLitter ? <Badge variant="outline" className="text-xs font-mono">{analysis.targets.catLitter.currentPosition}</Badge> : <Badge variant="outline" className="text-xs">No target</Badge>}</div>
                {analysis.targets.catLitter ? (
                  <>
                    <Link to={`/guides/${analysis.targets.catLitter.slug}`} className="text-sm text-primary hover:underline font-mono">/{analysis.targets.catLitter.slug}</Link>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-muted-foreground">Position</div><div className="font-bold">{analysis.targets.catLitter.currentPosition}</div></div>
                      <div><div className="text-muted-foreground">Impressions</div><div className="font-bold">{analysis.targets.catLitter.currentImpressions}</div></div>
                      <div><div className="text-muted-foreground">CTR</div><div className="font-bold">{analysis.targets.catLitter.currentCTR}%</div></div>
                    </div>
                  </>
                ) : <div className="text-xs text-muted-foreground">No pages in position &lt;30</div>}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5" />Week 1: Build Authority</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm grid gap-2">
                <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/30"><CheckCircle2 className="w-4 h-4 text-green-500" /><span>{analysis.weeklyPlan1.contextualLinks} contextual links</span></div>
                <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/30">{analysis.weeklyPlan1.comparisonTable && <CheckCircle2 className="w-4 h-4 text-green-500" />}<span>Add comparison table</span></div>
                <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/30"><CheckCircle2 className="w-4 h-4 text-green-500" /><span>Add {analysis.weeklyPlan1.faqQuestionsToAdd} FAQ questions</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="w-5 h-5" />Week 2: Momentum Push</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm grid gap-2">
                <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/30"><CheckCircle2 className="w-4 h-4 text-green-500" /><span>{analysis.weeklyPlan2.contextualLinks} contextual links</span></div>
                <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/30">{analysis.weeklyPlan2.introClarity && <CheckCircle2 className="w-4 h-4 text-green-500" />}<span>Improve intro clarity</span></div>
                <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/30">{analysis.weeklyPlan2.snippetAnswer && <CheckCircle2 className="w-4 h-4 text-green-500" />}<span>Add snippet answer (45–55 words)</span></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-yellow-500" />Volatility Monitor</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-muted-foreground mb-2">Volatility Score</div>
                <div className="text-3xl font-bold mb-2">{analysis.volatilityScore}</div>
                <Progress value={analysis.volatilityScore} className="h-2 mb-3" />
                <Badge variant={analysis.volatilityRisk.riskLevel === 'low' ? 'outline' : analysis.volatilityRisk.riskLevel === 'medium' ? 'secondary' : 'destructive'}>{analysis.volatilityRisk.riskLevel.toUpperCase()}</Badge>
              </div>
              <div className="text-sm text-muted-foreground space-y-2">
                <div className="p-3 rounded bg-muted/30">
                  <div className="font-medium text-foreground mb-1">Recommendation</div>
                  {analysis.volatilityRisk.recommendation}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Target className="w-5 h-5" />45-Day Target Progress</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">Timeline</span><span className="text-xs text-muted-foreground">{analysis.progress45day.daysElapsed} of 45 days</span></div>
                <Progress value={analysis.progress45day.progressPercent} className="h-2" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {[{ label: '2 pages Top 20', met: analysis.progress45day.targets.top20Met }, { label: '1 page Top 15', met: analysis.progress45day.targets.top15Met }, { label: 'Avg inbound ≥8', met: analysis.progress45day.targets.inboundLinksMet }, { label: 'Volatility ≤40', met: analysis.progress45day.targets.volatilityMet }].map((target, i) => (
                  <div key={i} className={`flex items-center gap-2 py-2 px-3 rounded ${target.met ? 'bg-green-500/10' : 'bg-muted/30'}`}>{target.met ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-muted-foreground" />}<span className={target.met ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>{target.label}</span></div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex gap-3 flex-wrap">
          <Link to="/admin/cluster-war-dashboard" className="text-sm text-primary hover:underline">Cluster War Dashboard</Link>
          <Link to="/admin/dog-beds-cluster" className="text-sm text-primary hover:underline">Dog Beds Cluster</Link>
          <Link to="/admin/cat-litter-cluster" className="text-sm text-primary hover:underline">Cat Litter Cluster</Link>
        </div>
      </div>
    </>
  );
};

export default MomentumAccelerationDashboard;
