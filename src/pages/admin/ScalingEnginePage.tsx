import { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw, Download, Rocket, Brain, FileText, Target,
  TrendingUp, Shield, Calendar, Zap, BookOpen, HelpCircle,
  ShoppingCart, BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/* ── Types ── */
interface PhaseTask {
  task: string;
  slug: string;
  rankingUplift: string;
  trafficImpact: string;
  revenueImpact: string;
  risk: 'Low' | 'Medium' | 'High';
}

interface ContentItem {
  keyword: string;
  intent: string;
  difficulty: 'Low' | 'Medium' | 'High';
  linkingPlan: string;
  monetization: string;
  timeToRank: string;
}

interface StrategicAction {
  rank: number;
  slug: string;
  action: string;
  impactScore: number;
  components: string;
}

const riskBadge = (r: string) => {
  if (r === 'High') return 'bg-red-500/10 text-red-700 border-red-500/20';
  if (r === 'Medium') return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
  return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
};

const diffBadge = (d: string) => riskBadge(d);

/* ── Analysis Engine ── */
function buildScalingPlan(rows: any[]) {
  if (!rows.length) return { phase1: [], phase2: [], phase3: [], contentQueue: { cornerstoneTargets: [], clusterSupportPages: [], longTailArticles: [], commercialIntentPages: [], faqSnippetTargets: [] }, strategic: [] };

  const avgCtr = rows.reduce((s, r) => s + (r.ctr || 0), 0) / rows.length;
  const phase1: PhaseTask[] = [];
  const phase2: PhaseTask[] = [];
  const phase3: PhaseTask[] = [];
  const cornerstones: ContentItem[] = [];
  const clusters: ContentItem[] = [];
  const longTails: ContentItem[] = [];
  const commercial: ContentItem[] = [];
  const faqTargets: ContentItem[] = [];

  for (const r of rows) {
    const pos = r.position ?? 100;
    const imp = r.impressions ?? 0;
    const ctr = r.ctr ?? 0;
    const clicks = r.clicks ?? 0;
    const kw = r.keyword || r.slug || '/';
    const slug = r.slug || kw;

    // Phase 1: Acceleration (pos 8-20, growing)
    if (pos >= 8 && pos <= 20 && imp > 20) {
      phase1.push({
        task: pos <= 12
          ? `Title A/B + FAQ schema for "${kw}"`
          : `Content expansion (+800w) + 3 internal links for "${kw}"`,
        slug,
        rankingUplift: `+${Math.round((20 - pos) * 1.5)}%`,
        trafficImpact: `+${Math.round(imp * 0.35)} visits/mo`,
        revenueImpact: clicks > 5 ? 'Medium' : 'Low',
        risk: 'Low',
      });
    }

    // Phase 2: Authority expansion (pos 20-40, thin coverage)
    if (pos > 20 && pos <= 40 && imp > 10) {
      phase2.push({
        task: `Create supporting guide for "${kw}" cluster`,
        slug,
        rankingUplift: `+${Math.round(Math.min(25, imp * 0.3))}%`,
        trafficImpact: `+${Math.round(imp * 0.2)} visits/mo`,
        revenueImpact: 'Low',
        risk: 'Low',
      });

      // Content queue: cluster support
      clusters.push({
        keyword: kw,
        intent: pos > 30 ? 'informational' : 'commercial investigation',
        difficulty: pos > 35 ? 'High' : 'Medium',
        linkingPlan: `Link to cornerstone + 2 related guides`,
        monetization: 'Product block + related items widget',
        timeToRank: pos > 30 ? '60-90 days' : '30-60 days',
      });
    }

    // Phase 3: Revenue optimization (pos <=10, high traffic)
    if (pos <= 10 && clicks > 3) {
      phase3.push({
        task: `Revenue optimize "${kw}" — add product blocks + CTAs`,
        slug,
        rankingUplift: 'Maintain',
        trafficImpact: `${clicks} clicks/mo baseline`,
        revenueImpact: 'High',
        risk: 'Low',
      });
    }

    // CTR below benchmark → FAQ snippet target
    if (imp > 40 && ctr < avgCtr * 0.6) {
      faqTargets.push({
        keyword: kw,
        intent: 'informational',
        difficulty: 'Low',
        linkingPlan: 'Add FAQ schema to existing page',
        monetization: 'CTR improvement → more organic clicks',
        timeToRank: '7-14 days',
      });
    }

    // Long-tail detection (multi-word, low competition signals)
    if (kw.split(/\s+/).length >= 4 && imp > 5 && pos > 15) {
      longTails.push({
        keyword: kw,
        intent: kw.includes('best') || kw.includes('buy') ? 'commercial' : 'informational',
        difficulty: 'Low',
        linkingPlan: 'Link to parent cornerstone + 1 product',
        monetization: 'Affiliate/product link in content',
        timeToRank: '21-45 days',
      });
    }

    // Commercial intent detection
    if ((kw.includes('best') || kw.includes('review') || kw.includes('vs') || kw.includes('buy')) && imp > 15) {
      commercial.push({
        keyword: kw,
        intent: 'commercial investigation',
        difficulty: pos > 25 ? 'Medium' : 'Low',
        linkingPlan: 'Comparison table + product grid + cornerstone link',
        monetization: 'Direct product links + comparison CTA',
        timeToRank: pos > 25 ? '45-90 days' : '14-30 days',
      });
    }

    // Cornerstone candidates (high impression, broad terms)
    if (imp > 80 && kw.split(/\s+/).length <= 3 && pos > 10) {
      cornerstones.push({
        keyword: kw,
        intent: 'pillar',
        difficulty: pos > 20 ? 'High' : 'Medium',
        linkingPlan: '5-8 cluster articles linking in + product grid',
        monetization: 'Hub page with category products + guides',
        timeToRank: '60-120 days',
      });
    }
  }

  // Build strategic actions
  const allTasks = [
    ...phase1.map(t => ({ ...t, phase: 'Acceleration', weight: 1.5 })),
    ...phase2.map(t => ({ ...t, phase: 'Authority', weight: 1.0 })),
    ...phase3.map(t => ({ ...t, phase: 'Revenue', weight: 1.8 })),
  ];

  const strategic: StrategicAction[] = allTasks
    .map((t) => {
      const rankProb = t.risk === 'Low' ? 0.8 : t.risk === 'Medium' ? 0.5 : 0.3;
      const revMult = t.revenueImpact === 'High' ? 3 : t.revenueImpact === 'Medium' ? 2 : 1;
      const authScore = t.phase === 'Authority' ? 1.5 : 1;
      return {
        rank: 0,
        slug: t.slug,
        action: t.task,
        impactScore: Math.round(rankProb * revMult * authScore * (t as any).weight * 100),
        components: `Rank:${rankProb} × Rev:${revMult} × Auth:${authScore}`,
      };
    })
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 15)
    .map((a, i) => ({ ...a, rank: i + 1 }));

  return {
    phase1: phase1.sort((a, b) => parseFloat(b.rankingUplift) - parseFloat(a.rankingUplift)).slice(0, 15),
    phase2: phase2.slice(0, 15),
    phase3: phase3.slice(0, 15),
    contentQueue: {
      cornerstoneTargets: cornerstones.slice(0, 8),
      clusterSupportPages: clusters.slice(0, 12),
      longTailArticles: longTails.slice(0, 10),
      commercialIntentPages: commercial.slice(0, 8),
      faqSnippetTargets: faqTargets.slice(0, 10),
    },
    strategic,
  };
}

/* ── Component ── */
export default function ScalingEnginePage() {
  const [loading, setLoading] = useState(true);
  const [gscRows, setGscRows] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('keyword_rankings')
        .select('keyword, slug, impressions, clicks, ctr, position, tracked_date')
        .order('tracked_date', { ascending: false })
        .limit(900);

      const byKey = new Map<string, any>();
      (data || []).forEach((r: any) => {
        const k = r.slug || r.keyword;
        if (!byKey.has(k)) byKey.set(k, r);
      });
      setGscRows(Array.from(byKey.values()));
    } catch (e) {
      console.error('[scaling-engine] error:', e);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const plan = useMemo(() => buildScalingPlan(gscRows), [gscRows]);
  const cq = plan.contentQueue;
  const totalContent = cq.cornerstoneTargets.length + cq.clusterSupportPages.length + cq.longTailArticles.length + cq.commercialIntentPages.length + cq.faqSnippetTargets.length;
  const riskLevel = plan.phase1.length === 0 && gscRows.length === 0 ? 'no_data' : plan.phase1.length > 10 ? 'elevated' : 'stable';

  const downloadReport = () => {
    const report = {
      '90DayScalingPlan': { phase1: plan.phase1, phase2: plan.phase2, phase3: plan.phase3 },
      contentVelocityQueue: cq,
      topStrategicActions: plan.strategic,
      systemRiskLevel: riskLevel,
      recommendedNext7DayFocus: plan.strategic[0]?.slug || 'Sync GSC data first',
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `scaling-engine-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-96" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}
          </div>
        </div>
      </div>
    );
  }

  const PhasePanel = ({ tasks, icon, label }: { tasks: PhaseTask[]; icon: React.ReactNode; label: string }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">{icon} {label} ({tasks.length} tasks)</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          {tasks.length ? tasks.map((t, i) => (
            <div key={i} className="py-2 text-xs border-b border-border/40 last:border-0 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-foreground">{t.task}</span>
                <Badge variant="outline" className={`text-[9px] px-1 shrink-0 ${riskBadge(t.risk)}`}>{t.risk}</Badge>
              </div>
              <div className="flex gap-3 text-muted-foreground">
                <span>↑ {t.rankingUplift}</span>
                <span>{t.trafficImpact}</span>
                <span>Rev: {t.revenueImpact}</span>
              </div>
            </div>
          )) : <p className="text-xs text-muted-foreground py-4">No tasks for this phase yet.</p>}
        </ScrollArea>
      </CardContent>
    </Card>
  );

  const ContentList = ({ items, icon, label }: { items: ContentItem[]; icon: React.ReactNode; label: string }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">{icon} {label} ({items.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-56">
          {items.length ? items.map((c, i) => (
            <div key={i} className="py-2 text-xs border-b border-border/40 last:border-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground truncate">{c.keyword}</span>
                <Badge variant="outline" className={`text-[9px] px-1 ${diffBadge(c.difficulty)}`}>{c.difficulty}</Badge>
                <Badge variant="outline" className="text-[9px] px-1">{c.intent}</Badge>
              </div>
              <div className="text-muted-foreground">{c.monetization} • {c.timeToRank}</div>
            </div>
          )) : <p className="text-xs text-muted-foreground py-4">None detected.</p>}
        </ScrollArea>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" /> 90-Day Scaling Engine
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {gscRows.length} keywords • {totalContent} content opportunities • {plan.strategic.length} strategic actions
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={downloadReport}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export JSON
            </Button>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-primary">{plan.phase1.length}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Acceleration Tasks</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-amber-600">{plan.phase2.length}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Authority Tasks</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-emerald-600">{plan.phase3.length}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Revenue Tasks</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold">{totalContent}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Content Queue</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold">{plan.strategic.length}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Strategic Actions</div>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="roadmap">
          <TabsList>
            <TabsTrigger value="roadmap"><Calendar className="h-3.5 w-3.5 mr-1.5" /> 90-Day Roadmap</TabsTrigger>
            <TabsTrigger value="content"><BookOpen className="h-3.5 w-3.5 mr-1.5" /> Content Velocity</TabsTrigger>
            <TabsTrigger value="priority"><BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Priority Matrix</TabsTrigger>
          </TabsList>

          {/* 90-Day Roadmap */}
          <TabsContent value="roadmap" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <PhasePanel tasks={plan.phase1} icon={<Rocket className="h-4 w-4 text-primary" />} label="Phase 1: Acceleration (Day 1–30)" />
              <PhasePanel tasks={plan.phase2} icon={<TrendingUp className="h-4 w-4 text-amber-600" />} label="Phase 2: Authority (Day 31–60)" />
              <PhasePanel tasks={plan.phase3} icon={<Target className="h-4 w-4 text-emerald-600" />} label="Phase 3: Revenue (Day 61–90)" />
            </div>
          </TabsContent>

          {/* Content Velocity */}
          <TabsContent value="content" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ContentList items={cq.cornerstoneTargets} icon={<FileText className="h-4 w-4 text-primary" />} label="Cornerstone Targets" />
              <ContentList items={cq.clusterSupportPages} icon={<Zap className="h-4 w-4 text-amber-600" />} label="Cluster Support Pages" />
              <ContentList items={cq.commercialIntentPages} icon={<ShoppingCart className="h-4 w-4 text-emerald-600" />} label="Commercial Intent Pages" />
              <ContentList items={cq.longTailArticles} icon={<BookOpen className="h-4 w-4" />} label="Long-Tail Articles" />
            </div>
            <ContentList items={cq.faqSnippetTargets} icon={<HelpCircle className="h-4 w-4 text-primary" />} label="FAQ Snippet Targets" />
          </TabsContent>

          {/* Priority Matrix */}
          <TabsContent value="priority" className="mt-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Top 15 Actions by Impact Score (Rank × Revenue × Authority)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {plan.strategic.map((a) => (
                    <div key={a.rank} className="flex items-start gap-3 p-2.5 rounded-lg bg-background text-xs">
                      <span className="text-lg font-bold text-primary w-6 text-right shrink-0">#{a.rank}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono truncate">{a.slug}</span>
                          <Badge variant="outline" className="text-[9px] px-1">Score: {a.impactScore}</Badge>
                        </div>
                        <p className="text-muted-foreground mt-0.5">{a.action}</p>
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0">{a.components}</span>
                    </div>
                  ))}
                  {plan.strategic.length === 0 && <p className="text-xs text-muted-foreground py-2">No GSC data — sync Search Console first.</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Safety Footer */}
        <Card className="border-muted">
          <CardContent className="py-3 text-xs text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Safe Mode: Recommendations only — no auto-publish. No DNS/canonical/redirect/XML changes. Velocity guardrail: max 12 cluster pages/30 days.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
