import { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RefreshCw, Download, Target, TrendingUp, DollarSign, Shield,
  Zap, Search, Link2, FileText, BarChart3, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/* ── Types ── */
interface Gap {
  query: string;
  slug: string;
  impressions: number;
  ctr: number;
  position: number;
  gapType: 'quick_win' | 'authority' | 'ctr_optimization' | 'internal_link';
  gapScore: number;
  trafficUplift: number;
  priority: 'Low' | 'Medium' | 'High';
  action: string;
}

interface RevenueOpp {
  slug: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  category: 'high_traffic_low_conv' | 'high_margin_med_traffic' | 'ranking_acceleration' | 'hidden_revenue';
  revenueScore: number;
  conversionUplift: number;
  revenueDelta: 'low' | 'medium' | 'high';
  action: string;
}

interface StrategicAction {
  rank: number;
  slug: string;
  action: string;
  expectedImpact: string;
  combinedScore: number;
  source: string;
}

const priorityColor = (p: string) => {
  if (p === 'High') return 'bg-red-500/10 text-red-700 border-red-500/20';
  if (p === 'Medium') return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
  return 'bg-muted text-muted-foreground';
};

const gapTypeLabel = (t: string) => {
  const map: Record<string, string> = {
    quick_win: 'Quick Win',
    authority: 'Authority Gap',
    ctr_optimization: 'CTR Gap',
    internal_link: 'Link Gap',
  };
  return map[t] || t;
};

const gapTypeIcon = (t: string) => {
  if (t === 'quick_win') return <Zap className="h-3 w-3" />;
  if (t === 'authority') return <FileText className="h-3 w-3" />;
  if (t === 'ctr_optimization') return <Search className="h-3 w-3" />;
  return <Link2 className="h-3 w-3" />;
};

const categoryLabel = (c: string) => {
  const map: Record<string, string> = {
    high_traffic_low_conv: 'High Traffic / Low Conv',
    high_margin_med_traffic: 'High Margin',
    ranking_acceleration: 'Ranking Accel',
    hidden_revenue: 'Hidden Revenue',
  };
  return map[c] || c;
};

/* ── Analysis Engine ── */
function analyzeGaps(rows: any[]): Gap[] {
  if (!rows?.length) return [];
  const avgCtr = rows.reduce((s, r) => s + (r.ctr || 0), 0) / rows.length;
  const gaps: Gap[] = [];

  for (const r of rows) {
    const pos = r.position ?? 100;
    const imp = r.impressions ?? 0;
    const ctr = r.ctr ?? 0;
    const slug = r.slug || r.keyword || '/';

    // Quick Win: pos 11-20, decent impressions
    if (pos >= 11 && pos <= 20 && imp > 20) {
      const score = Math.min(95, Math.round(50 + (imp / 10) + (20 - pos) * 3));
      gaps.push({
        query: r.keyword || slug,
        slug,
        impressions: imp,
        ctr,
        position: pos,
        gapType: 'quick_win',
        gapScore: score,
        trafficUplift: Math.round(Math.min(300, imp * 0.4)),
        priority: score > 75 ? 'High' : score > 50 ? 'Medium' : 'Low',
        action: pos > 15
          ? `Content expansion (+800 words) + 3 internal links`
          : `Title refinement + FAQ schema + 2 internal links`,
      });
    }
    // CTR Optimization: high impressions, low CTR
    else if (imp > 50 && ctr < avgCtr * 0.6 && pos <= 30) {
      const score = Math.min(90, Math.round(40 + imp / 5));
      gaps.push({
        query: r.keyword || slug,
        slug,
        impressions: imp,
        ctr,
        position: pos,
        gapType: 'ctr_optimization',
        gapScore: score,
        trafficUplift: Math.round(imp * (avgCtr - ctr)),
        priority: score > 70 ? 'High' : 'Medium',
        action: `Meta title rewrite (benefit-driven) + meta description (emotion+urgency)`,
      });
    }
    // Authority Gap: pos 20-30, some impressions
    else if (pos > 20 && pos <= 30 && imp > 10) {
      const score = Math.min(80, Math.round(30 + imp / 8));
      gaps.push({
        query: r.keyword || slug,
        slug,
        impressions: imp,
        ctr,
        position: pos,
        gapType: 'authority',
        gapScore: score,
        trafficUplift: Math.round(imp * 0.25),
        priority: score > 60 ? 'Medium' : 'Low',
        action: `Create supporting guide (+1,500 words) targeting this cluster`,
      });
    }
    // Internal Link Gap: decent position but low clicks
    else if (pos <= 15 && imp > 30 && (r.clicks ?? 0) < 3) {
      gaps.push({
        query: r.keyword || slug,
        slug,
        impressions: imp,
        ctr,
        position: pos,
        gapType: 'internal_link',
        gapScore: Math.min(70, Math.round(35 + imp / 10)),
        trafficUplift: Math.round(imp * 0.15),
        priority: 'Medium',
        action: `Add 3-5 internal links from top traffic guides`,
      });
    }
  }

  return gaps.sort((a, b) => b.gapScore - a.gapScore);
}

function analyzeRevenue(rows: any[]): RevenueOpp[] {
  if (!rows?.length) return [];
  const opps: RevenueOpp[] = [];
  const avgCtr = rows.reduce((s, r) => s + (r.ctr || 0), 0) / rows.length;

  for (const r of rows) {
    const pos = r.position ?? 100;
    const imp = r.impressions ?? 0;
    const clicks = r.clicks ?? 0;
    const ctr = r.ctr ?? 0;
    const slug = r.slug || r.keyword || '/';

    // High Traffic / Low Conversion: lots of clicks but guide pages
    if (clicks > 5 && slug.includes('/') && !slug.includes('product')) {
      opps.push({
        slug, impressions: imp, clicks, ctr, position: pos,
        category: 'high_traffic_low_conv',
        revenueScore: Math.min(90, Math.round(40 + clicks * 3)),
        conversionUplift: Math.round(Math.min(50, clicks * 2)),
        revenueDelta: clicks > 20 ? 'high' : clicks > 10 ? 'medium' : 'low',
        action: 'Add product block + improve CTA placement + related products widget',
      });
    }
    // Ranking Acceleration: revenue-relevant pages in striking distance
    else if (pos >= 8 && pos <= 20 && imp > 30) {
      opps.push({
        slug, impressions: imp, clicks, ctr, position: pos,
        category: 'ranking_acceleration',
        revenueScore: Math.min(95, Math.round(55 + (20 - pos) * 4)),
        conversionUplift: Math.round(Math.min(80, imp * 0.3)),
        revenueDelta: pos <= 12 ? 'high' : 'medium',
        action: 'Content expansion + FAQ schema + internal link boost from top guides',
      });
    }
    // Hidden Revenue: guide pages with traffic but no monetization signals
    else if (imp > 40 && ctr > avgCtr && pos <= 15) {
      opps.push({
        slug, impressions: imp, clicks, ctr, position: pos,
        category: 'hidden_revenue',
        revenueScore: Math.min(85, Math.round(45 + imp / 5)),
        conversionUplift: Math.round(imp * 0.1),
        revenueDelta: 'medium',
        action: 'Add product recommendations + trust signals + FAQ expansion',
      });
    }
  }

  return opps.sort((a, b) => b.revenueScore - a.revenueScore);
}

function buildPriorityMatrix(gaps: Gap[], opps: RevenueOpp[]): StrategicAction[] {
  const actions: StrategicAction[] = [];

  // Top gaps
  gaps.slice(0, 8).forEach((g) => {
    actions.push({
      rank: 0,
      slug: g.slug,
      action: g.action,
      expectedImpact: `+${g.trafficUplift} visits/mo`,
      combinedScore: g.gapScore * 1.2,
      source: `Gap: ${gapTypeLabel(g.gapType)}`,
    });
  });

  // Top revenue opportunities
  opps.slice(0, 8).forEach((o) => {
    actions.push({
      rank: 0,
      slug: o.slug,
      action: o.action,
      expectedImpact: `${o.revenueDelta} revenue delta`,
      combinedScore: o.revenueScore * 1.3,
      source: `Revenue: ${categoryLabel(o.category)}`,
    });
  });

  // Dedupe by slug, keep highest score
  const seen = new Map<string, StrategicAction>();
  actions.forEach((a) => {
    const existing = seen.get(a.slug);
    if (!existing || a.combinedScore > existing.combinedScore) {
      seen.set(a.slug, a);
    }
  });

  return Array.from(seen.values())
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 10)
    .map((a, i) => ({ ...a, rank: i + 1 }));
}

/* ── Component ── */
export default function CompetitiveIntelligencePage() {
  const [loading, setLoading] = useState(true);
  const [gscRows, setGscRows] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('keyword_rankings')
        .select('keyword, slug, impressions, clicks, ctr, position, tracked_date')
        .order('tracked_date', { ascending: false })
        .limit(800);

      // Dedupe by slug
      const bySlug = new Map<string, any>();
      (data || []).forEach((r: any) => {
        const key = r.slug || r.keyword;
        if (!bySlug.has(key)) bySlug.set(key, r);
      });
      setGscRows(Array.from(bySlug.values()));
    } catch (e) {
      console.error('[comp-intel] load error:', e);
      toast.error('Failed to load intelligence data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const gaps = useMemo(() => analyzeGaps(gscRows), [gscRows]);
  const quickWins = gaps.filter(g => g.gapType === 'quick_win');
  const authorityGaps = gaps.filter(g => g.gapType === 'authority');
  const ctrGaps = gaps.filter(g => g.gapType === 'ctr_optimization');
  const linkGaps = gaps.filter(g => g.gapType === 'internal_link');

  const opps = useMemo(() => analyzeRevenue(gscRows), [gscRows]);
  const strategic = useMemo(() => buildPriorityMatrix(gaps, opps), [gaps, opps]);

  const riskLevel = gaps.filter(g => g.priority === 'High').length > 5 ? 'elevated' : 'stable';

  const downloadReport = () => {
    const report = {
      competitiveGaps: gaps.slice(0, 20).map(g => ({ query: g.query, slug: g.slug, gapType: g.gapType, score: g.gapScore, uplift: g.trafficUplift, priority: g.priority, action: g.action })),
      quickWins: quickWins.slice(0, 10).map(g => ({ query: g.query, slug: g.slug, score: g.gapScore, action: g.action })),
      authorityGaps: authorityGaps.slice(0, 10).map(g => ({ query: g.query, slug: g.slug, score: g.gapScore, action: g.action })),
      revenueOpportunities: opps.slice(0, 15).map(o => ({ slug: o.slug, category: o.category, score: o.revenueScore, delta: o.revenueDelta, action: o.action })),
      topStrategicActions: strategic,
      systemRiskLevel: riskLevel,
      next30DayPriorityFocus: strategic[0]?.slug || 'No data — sync GSC first',
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `competitive-intelligence-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-96" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" /> Competitive Intelligence
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {gaps.length} gaps • {opps.length} revenue opportunities • {strategic.length} strategic actions
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

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-primary">{quickWins.length}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Quick Wins</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-amber-600">{ctrGaps.length}</div>
            <div className="text-[10px] text-muted-foreground mt-1">CTR Gaps</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-orange-600">{authorityGaps.length}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Authority Gaps</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-emerald-600">{opps.length}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Revenue Opps</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-3xl font-bold">{linkGaps.length}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Link Gaps</div>
          </CardContent></Card>
        </div>

        {/* Top Strategic Actions */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Top 10 Strategic Actions (Revenue × Probability)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {strategic.map((a) => (
                <div key={a.rank} className="flex items-start gap-3 p-2.5 rounded-lg bg-background text-xs">
                  <span className="text-lg font-bold text-primary w-6 text-right shrink-0">#{a.rank}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono truncate">{a.slug}</span>
                      <Badge variant="outline" className="text-[9px] px-1">{a.source}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{a.action}</p>
                  </div>
                  <span className="text-muted-foreground shrink-0">{a.expectedImpact}</span>
                </div>
              ))}
              {strategic.length === 0 && <p className="text-xs text-muted-foreground py-2">No GSC data. Sync Search Console first.</p>}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Competitive Gaps */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="h-4 w-4 text-amber-600" /> Competitive Gaps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-72">
                {gaps.slice(0, 20).map((g, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-xs border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {gapTypeIcon(g.gapType)}
                      <Badge variant="outline" className={`text-[9px] px-1 shrink-0 ${priorityColor(g.priority)}`}>
                        {g.priority}
                      </Badge>
                      <span className="truncate font-mono text-muted-foreground">{g.query}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="tabular-nums font-medium">{g.gapScore}</span>
                      <span className="text-muted-foreground tabular-nums">pos {g.position.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
                {gaps.length === 0 && <p className="text-xs text-muted-foreground py-4">No gaps detected yet.</p>}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Revenue Opportunities */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600" /> Revenue Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-72">
                {opps.slice(0, 20).map((o, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-xs border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <TrendingUp className="h-3 w-3 shrink-0" />
                      <Badge variant="outline" className="text-[9px] px-1 shrink-0">{categoryLabel(o.category)}</Badge>
                      <span className="truncate font-mono text-muted-foreground">{o.slug}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="tabular-nums font-medium">{o.revenueScore}</span>
                      <Badge variant="outline" className={`text-[9px] px-1 ${o.revenueDelta === 'high' ? 'bg-emerald-500/10 text-emerald-700' : o.revenueDelta === 'medium' ? 'bg-amber-500/10 text-amber-700' : ''}`}>
                        {o.revenueDelta}
                      </Badge>
                    </div>
                  </div>
                ))}
                {opps.length === 0 && <p className="text-xs text-muted-foreground py-4">No revenue opportunities detected yet.</p>}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Safety Footer */}
        <Card className="border-muted">
          <CardContent className="py-3 text-xs text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Safe Mode: Recommendations only — no auto-publish. No DNS/canonical/redirect/XML changes.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
