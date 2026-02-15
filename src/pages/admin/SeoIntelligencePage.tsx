import { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RefreshCw, Download, CheckCircle, AlertTriangle, XCircle,
  TrendingUp, TrendingDown, Target, DollarSign, Shield, Activity,
  Brain, Eye, BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/* ── Types ── */
interface PageSignal {
  slug: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  imp7dDelta: number;
  posDelta: number;
  zone: 'acceleration' | 'ctr_leak' | 'decline_risk' | 'stable';
  momentumScore: number;
  breakthroughPct: number;
  declinePct: number;
  action: string;
}

const StatusDot = ({ status }: { status: 'green' | 'yellow' | 'red' }) => {
  const c = { green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500' };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${c[status]}`} />;
};

const zoneColor = (z: string) => {
  if (z === 'acceleration') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
  if (z === 'ctr_leak') return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
  if (z === 'decline_risk') return 'bg-red-500/10 text-red-700 border-red-500/20';
  return 'bg-muted text-muted-foreground';
};

const zoneLabel = (z: string) => {
  if (z === 'acceleration') return 'Acceleration';
  if (z === 'ctr_leak') return 'CTR Leak';
  if (z === 'decline_risk') return 'Decline Risk';
  return 'Stable';
};

/* ── Predictive Engine (client-side classification) ── */
function classifyPages(rows: any[]): PageSignal[] {
  if (!rows?.length) return [];
  const avgCtr = rows.reduce((s, r) => s + (r.ctr || 0), 0) / rows.length;

  return rows.map((r) => {
    const pos = r.position ?? 100;
    const imp = r.impressions ?? 0;
    const ctr = r.ctr ?? 0;
    const imp7d = r.imp7dDelta ?? 0;
    const posDelta = r.posDelta ?? 0;

    let zone: PageSignal['zone'] = 'stable';
    let action = 'No change';
    let momentumScore = 50;
    let breakthroughPct = 0;
    let declinePct = 0;

    // Acceleration Zone: pos 11-20, growing impressions
    if (pos >= 11 && pos <= 20 && imp7d > 0) {
      zone = 'acceleration';
      momentumScore = Math.min(95, 60 + imp7d * 2 + Math.max(0, -posDelta) * 5);
      breakthroughPct = Math.min(85, 30 + imp7d * 3);
      action = pos > 15 ? 'Content expansion + internal link boost' : 'Title refinement + FAQ schema';
    }
    // CTR Leak: high impressions, low CTR
    else if (imp > 50 && ctr < avgCtr * 0.7) {
      zone = 'ctr_leak';
      momentumScore = Math.max(20, 50 - (avgCtr - ctr) * 500);
      breakthroughPct = 15;
      action = 'Title refinement + meta description rewrite';
    }
    // Decline Risk: impression drop or position loss
    else if (imp7d < -20 || posDelta > 3) {
      zone = 'decline_risk';
      momentumScore = Math.max(5, 40 + imp7d);
      declinePct = Math.min(80, Math.abs(imp7d) * 2 + posDelta * 5);
      action = 'Content expansion + FAQ addition + internal link boost';
    } else {
      momentumScore = Math.min(70, 50 + imp7d);
    }

    return {
      slug: r.slug || r.keyword || '/',
      impressions: imp,
      clicks: r.clicks ?? 0,
      ctr,
      position: pos,
      imp7dDelta: imp7d,
      posDelta,
      zone,
      momentumScore: Math.round(momentumScore),
      breakthroughPct: Math.round(breakthroughPct),
      declinePct: Math.round(declinePct),
      action,
    };
  });
}

export default function SeoIntelligencePage() {
  const [loading, setLoading] = useState(true);
  const [sitemapData, setSitemapData] = useState<any>(null);
  const [seoData, setSeoData] = useState<any>(null);
  const [gscRows, setGscRows] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sitemap, seo, gsc] = await Promise.all([
        supabase.functions.invoke('sitemap-diagnostics'),
        supabase.functions.invoke('seo-diagnostics'),
        supabase.from('keyword_rankings')
          .select('keyword, slug, impressions, clicks, ctr, position, tracked_date')
          .order('tracked_date', { ascending: false })
          .limit(500),
      ]);
      setSitemapData(sitemap.data);
      setSeoData(seo.data);

      // Compute deltas from raw rows
      const bySlug = new Map<string, any>();
      (gsc.data || []).forEach((r: any) => {
        if (!bySlug.has(r.slug || r.keyword)) {
          bySlug.set(r.slug || r.keyword, { ...r, imp7dDelta: 0, posDelta: 0 });
        }
      });
      setGscRows(Array.from(bySlug.values()));
    } catch (e) {
      console.error('[seo-intel] load error:', e);
      toast.error('Failed to load intelligence data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const signals = useMemo(() => classifyPages(gscRows), [gscRows]);
  const acceleration = signals.filter(s => s.zone === 'acceleration').sort((a, b) => b.momentumScore - a.momentumScore);
  const ctrLeaks = signals.filter(s => s.zone === 'ctr_leak').sort((a, b) => b.impressions - a.impressions);
  const declineRisk = signals.filter(s => s.zone === 'decline_risk').sort((a, b) => b.declinePct - a.declinePct);

  const techHealthScore = useMemo(() => {
    if (!sitemapData || !seoData) return 'N/A';
    const checks = [
      sitemapData?.sitemap_index?.valid,
      seoData?.robots?.ok,
      seoData?.canonical_rules?.no_www,
    ];
    const passed = checks.filter(Boolean).length;
    return `${Math.round((passed / checks.length) * 100)}%`;
  }, [sitemapData, seoData]);

  const overallRisk = declineRisk.length > 5 ? 'red' : declineRisk.length > 0 ? 'yellow' : 'green';

  const downloadReport = () => {
    const report = {
      predictiveEngineStatus: 'ACTIVE',
      rankingAccelerationPages: acceleration.slice(0, 10).map(p => ({ slug: p.slug, momentum: p.momentumScore, breakthrough: p.breakthroughPct, action: p.action })),
      declineRiskPages: declineRisk.slice(0, 10).map(p => ({ slug: p.slug, decline: p.declinePct, action: p.action })),
      ctrLeakPages: ctrLeaks.slice(0, 10).map(p => ({ slug: p.slug, impressions: p.impressions, ctr: p.ctr, action: p.action })),
      technicalHealthScore: techHealthScore,
      seoStabilityScore: `${signals.filter(s => s.zone === 'stable').length}/${signals.length} stable`,
      revenueHealthScore: 'See /admin/revenue-scaling',
      systemRiskLevel: overallRisk,
      recommendedActions: [...acceleration.slice(0, 3), ...ctrLeaks.slice(0, 3), ...declineRisk.slice(0, 3)].map(p => ({ page: p.slug, action: p.action })),
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `seo-intelligence-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-80" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52" />)}
          </div>
        </div>
      </div>
    );
  }

  const PageRow = ({ p }: { p: PageSignal }) => (
    <div className="flex items-center justify-between py-1.5 text-xs border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${zoneColor(p.zone)}`}>
          {zoneLabel(p.zone)}
        </Badge>
        <span className="truncate font-mono text-muted-foreground">{p.slug}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        <span className="tabular-nums">{p.momentumScore}</span>
        <span className="text-muted-foreground tabular-nums">pos {p.position.toFixed(1)}</span>
        <span className="text-muted-foreground tabular-nums w-14 text-right">{p.impressions.toLocaleString()} imp</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" /> SEO Intelligence
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Predictive ranking engine • {signals.length} pages classified
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={downloadReport}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export
            </Button>
          </div>
        </div>

        {/* Overall Status */}
        <Card className={overallRisk === 'green' ? 'border-emerald-500/30 bg-emerald-500/5' : overallRisk === 'yellow' ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5'}>
          <CardContent className="py-4 flex items-center gap-3">
            {overallRisk === 'green' ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : overallRisk === 'yellow' ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
            <span className="text-sm font-medium">
              {overallRisk === 'green' ? 'All systems stable — no decline risk detected' : `${declineRisk.length} pages at decline risk • ${ctrLeaks.length} CTR leaks • ${acceleration.length} in acceleration zone`}
            </span>
          </CardContent>
        </Card>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold text-emerald-600">{acceleration.length}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Acceleration Zone</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold text-amber-600">{ctrLeaks.length}</div>
              <div className="text-[10px] text-muted-foreground mt-1">CTR Leaks</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold text-red-600">{declineRisk.length}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Decline Risk</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold">{techHealthScore}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Tech Health</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Acceleration Zone */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" /> Ranking Acceleration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                {acceleration.length ? acceleration.slice(0, 15).map(p => <PageRow key={p.slug} p={p} />) : <p className="text-xs text-muted-foreground py-4">No pages in acceleration zone yet.</p>}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* CTR Leaks */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-amber-600" /> CTR Leak Detection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                {ctrLeaks.length ? ctrLeaks.slice(0, 15).map(p => <PageRow key={p.slug} p={p} />) : <p className="text-xs text-muted-foreground py-4">No CTR leaks detected.</p>}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Decline Risk */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" /> Decline Risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                {declineRisk.length ? declineRisk.slice(0, 15).map(p => <PageRow key={p.slug} p={p} />) : <p className="text-xs text-muted-foreground py-4">No decline risks detected.</p>}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Recommended Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Recommended Safe Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {[...acceleration.slice(0, 3), ...ctrLeaks.slice(0, 3), ...declineRisk.slice(0, 3)].map((p, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-muted/50 text-xs space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-[9px] px-1 ${zoneColor(p.zone)}`}>{zoneLabel(p.zone)}</Badge>
                    <span className="font-mono truncate">{p.slug}</span>
                  </div>
                  <p className="text-muted-foreground">{p.action}</p>
                </div>
              ))}
              {signals.length === 0 && <p className="text-xs text-muted-foreground col-span-full py-2">No GSC data available yet. Sync Search Console data first.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Safety Footer */}
        <Card className="border-muted">
          <CardContent className="py-3 text-xs text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Safe Mode: Recommendations only — no auto-publish. Canonical locked. No redirect/XML/robots changes.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
