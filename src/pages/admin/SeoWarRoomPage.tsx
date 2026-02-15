import { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw, Download, Swords, Target, Link2, Shield,
  TrendingUp, TrendingDown, Zap, AlertTriangle, Crown,
  BarChart3, FileSearch, Crosshair
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/* ── Types ── */
type Zone = 'acceleration' | 'strike' | 'domination' | 'stagnation' | 'decline';

interface KeywordZone {
  keyword: string;
  slug: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  zone: Zone;
  revenueWeight: number;
  actionType: string;
  estimatedLift: string;
  risk: 'Low' | 'Medium' | 'High';
}

interface DominationTarget {
  keyword: string;
  slug: string;
  position: number;
  impressions: number;
  dominationScore: number;
  actions: string[];
  estimatedTimeToTop5: string;
  confidence: number;
}

interface LinkIssue { slug: string; issue: string; severity: string }

const zoneConfig: Record<Zone, { label: string; color: string; icon: typeof Swords }> = {
  domination: { label: 'Domination (1-4)', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', icon: Crown },
  strike: { label: 'Strike (4-8)', color: 'bg-primary/10 text-primary border-primary/20', icon: Crosshair },
  acceleration: { label: 'Acceleration (8-15)', color: 'bg-amber-500/10 text-amber-700 border-amber-500/20', icon: TrendingUp },
  stagnation: { label: 'Stagnation', color: 'bg-muted text-muted-foreground', icon: AlertTriangle },
  decline: { label: 'Decline', color: 'bg-red-500/10 text-red-700 border-red-500/20', icon: TrendingDown },
};

/* ── Engine ── */
function analyze(rows: any[]) {
  if (!rows.length) return empty();
  const avgCtr = rows.reduce((s, r) => s + (r.ctr || 0), 0) / rows.length;

  const zones: KeywordZone[] = [];
  const domTargets: DominationTarget[] = [];
  const underLinked: LinkIssue[] = [];
  const orphans: LinkIssue[] = [];
  const leaks: LinkIssue[] = [];
  const linkPlan: LinkIssue[] = [];
  const crawlWaste: string[] = [];

  for (const r of rows) {
    const pos = r.position ?? 100;
    const imp = r.impressions ?? 0;
    const clicks = r.clicks ?? 0;
    const ctr = r.ctr ?? 0;
    const kw = r.keyword || r.slug || '/';
    const slug = r.slug || kw;
    const revWeight = Math.min(10, Math.round((clicks * 0.5 + imp * 0.02) * 10) / 10);

    let zone: Zone = 'stagnation';
    let action = 'Monitor';
    let lift = '0%';
    let risk: 'Low' | 'Medium' | 'High' = 'Low';

    if (pos >= 1 && pos < 4) {
      zone = 'domination'; action = 'Entity reinforcement + defend'; lift = 'Maintain';
    } else if (pos >= 4 && pos < 8) {
      zone = 'strike'; action = 'Title CTR optimization + FAQ schema'; lift = `+${Math.round((8 - pos) * 3)}%`; risk = 'Low';
    } else if (pos >= 8 && pos <= 15) {
      zone = 'acceleration'; action = 'Internal link injection + content depth expansion'; lift = `+${Math.round((15 - pos) * 2)}%`; risk = 'Low';
    } else if (pos > 15 && pos <= 20 && imp > 15) {
      zone = 'acceleration'; action = 'Semantic enrichment + supporting cluster'; lift = `+${Math.round(imp * 0.15)}%`; risk = 'Medium';
    } else if (imp > 20 && ctr < avgCtr * 0.5) {
      zone = 'stagnation'; action = 'Title CTR optimization + FAQ schema expansion'; lift = `+${Math.round(avgCtr * 100)}% CTR`; risk = 'Medium';
    } else if (pos > 20) {
      zone = 'decline'; action = 'Content depth expansion + cannibalization check'; lift = 'Unknown'; risk = 'High';
    }

    zones.push({ keyword: kw, slug, position: pos, impressions: imp, clicks, ctr, zone, revenueWeight: revWeight, actionType: action, estimatedLift: lift, risk });

    // Top-20 Domination targets (pos 6-20)
    if (pos >= 6 && pos <= 20 && imp > 10) {
      const posW = Math.max(1, 21 - pos);
      const impV = Math.min(10, imp / 10);
      const dScore = Math.round(posW * impV * revWeight);
      const actions: string[] = [];
      if (pos > 12) actions.push('Add 3 internal links from top guides');
      if (ctr < avgCtr) actions.push(`Rewrite title: benefit-driven CTR boost`);
      if (pos > 8) actions.push('Add FAQ schema (3 questions)');
      actions.push('Semantic enrichment: add 2 related entity blocks');
      if (pos > 15) actions.push('Create supporting cluster article');

      domTargets.push({
        keyword: kw, slug, position: pos, impressions: imp,
        dominationScore: dScore,
        actions,
        estimatedTimeToTop5: pos <= 10 ? '14-30 days' : pos <= 15 ? '30-60 days' : '60-90 days',
        confidence: pos <= 10 ? 75 : pos <= 15 ? 55 : 35,
      });
    }

    // Link analysis
    if (clicks > 3 && pos > 12) {
      underLinked.push({ slug, issue: `${clicks} clicks but pos ${pos.toFixed(1)} — needs link equity`, severity: 'High' });
    }
    if (imp > 30 && clicks === 0) {
      orphans.push({ slug, issue: `${imp} impressions, 0 clicks — possibly orphaned or poorly linked`, severity: 'Medium' });
    }
    if (pos <= 5 && clicks < 2 && imp > 20) {
      leaks.push({ slug, issue: `Top 5 position but only ${clicks} clicks — authority leaking`, severity: 'High' });
    }
    if (pos > 12 && imp > 15 && revWeight > 3) {
      linkPlan.push({ slug, issue: `Inject 2-3 contextual links from top traffic pages`, severity: 'Medium' });
    }

    // Crawl waste
    if (imp === 0 && clicks === 0 && pos > 50) {
      crawlWaste.push(slug);
    }
  }

  // Sort domination targets
  domTargets.sort((a, b) => b.dominationScore - a.dominationScore);

  // 14-Day Attack Plan
  const topDom = domTargets.slice(0, 5);
  const highestRev = zones.sort((a, b) => b.revenueWeight - a.revenueWeight)[0];
  const fastestWin = zones.filter(z => z.zone === 'strike').sort((a, b) => a.position - b.position)[0];
  const undervalued = zones.filter(z => z.impressions > 40 && z.clicks < 3).sort((a, b) => b.impressions - a.impressions)[0];

  return {
    zones: zones.sort((a, b) => a.position - b.position),
    domTargets: domTargets.slice(0, 20),
    linkMap: {
      underLinkedPages: underLinked.slice(0, 15),
      orphanPages: orphans.slice(0, 10),
      authorityLeaks: leaks.slice(0, 10),
      internalLinkInjectionPlan: linkPlan.slice(0, 15),
    },
    crawl: {
      crawlWasteSources: crawlWaste.slice(0, 15),
      budgetOptimizationSuggestions: [
        crawlWaste.length > 5 ? 'Consider noindex on zero-traffic thin pages' : null,
        orphans.length > 3 ? 'Add internal links to orphan pages or consolidate' : null,
        'Ensure parameter URLs remain excluded from sitemap',
      ].filter(Boolean),
      sitemapHealthScore: crawlWaste.length > 10 ? 'Needs attention' : 'Healthy',
      crawlRiskLevel: crawlWaste.length > 15 ? 'elevated' : 'stable',
    },
    attackPlan: {
      top5ImmediateMoves: topDom.map(t => `${t.keyword}: ${t.actions[0]}`),
      highestRevenuePush: highestRev?.keyword || 'N/A',
      fastestRankingWin: fastestWin?.keyword || 'N/A',
      mostUndervaluedPage: undervalued?.slug || 'N/A',
      systemStabilityRisk: 'Low — recommendation only',
    },
  };
}

function empty() {
  return {
    zones: [], domTargets: [],
    linkMap: { underLinkedPages: [], orphanPages: [], authorityLeaks: [], internalLinkInjectionPlan: [] },
    crawl: { crawlWasteSources: [], budgetOptimizationSuggestions: [], sitemapHealthScore: 'N/A', crawlRiskLevel: 'no_data' },
    attackPlan: { top5ImmediateMoves: [], highestRevenuePush: 'N/A', fastestRankingWin: 'N/A', mostUndervaluedPage: 'N/A', systemStabilityRisk: 'No data' },
  };
}

/* ── Component ── */
export default function SeoWarRoomPage() {
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
      (data || []).forEach((r: any) => { const k = r.slug || r.keyword; if (!byKey.has(k)) byKey.set(k, r); });
      setGscRows(Array.from(byKey.values()));
    } catch (e) {
      console.error('[war-room]', e);
      toast.error('Failed to load data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const result = useMemo(() => analyze(gscRows), [gscRows]);
  const zoneCounts = useMemo(() => {
    const c: Record<Zone, number> = { domination: 0, strike: 0, acceleration: 0, stagnation: 0, decline: 0 };
    result.zones.forEach(z => c[z.zone]++);
    return c;
  }, [result.zones]);

  const overallRisk = result.zones.filter(z => z.zone === 'decline').length > 5 ? 'elevated' : 'stable';

  const exportJSON = () => {
    const report = {
      warRoomStatus: 'ACTIVE',
      top20DominationTargets: result.domTargets,
      keywordZoneBreakdown: result.zones.slice(0, 50),
      internalLinkWarMap: result.linkMap,
      crawlBudgetProtection: result.crawl,
      fourteenDayAttackPlan: result.attackPlan,
      overallRiskLevel: overallRisk,
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `seo-war-room-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-80" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
        </div>
      </div>
    );
  }

  const ZoneRow = ({ z }: { z: KeywordZone }) => {
    const cfg = zoneConfig[z.zone];
    return (
      <div className="flex items-center justify-between py-1.5 text-xs border-b border-border/40 last:border-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Badge variant="outline" className={`text-[9px] px-1 shrink-0 ${cfg.color}`}>{cfg.label.split(' ')[0]}</Badge>
          <span className="truncate font-mono text-muted-foreground">{z.keyword}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2 text-muted-foreground">
          <span className="tabular-nums">pos {z.position.toFixed(1)}</span>
          <span className="tabular-nums w-12 text-right">{z.impressions} imp</span>
        </div>
      </div>
    );
  };

  const IssueRow = ({ item }: { item: LinkIssue }) => (
    <div className="py-1.5 text-xs border-b border-border/40 last:border-0 space-y-0.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-[9px] px-1 ${item.severity === 'High' ? 'bg-red-500/10 text-red-700 border-red-500/20' : 'bg-amber-500/10 text-amber-700 border-amber-500/20'}`}>{item.severity}</Badge>
        <span className="font-mono truncate text-muted-foreground">{item.slug}</span>
      </div>
      <p className="text-muted-foreground pl-4">{item.issue}</p>
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
              <Swords className="h-6 w-6 text-primary" /> SEO War Room
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {result.zones.length} keywords tracked • {result.domTargets.length} domination targets
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportJSON}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export JSON
            </Button>
          </div>
        </div>

        {/* Zone Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(Object.entries(zoneConfig) as [Zone, typeof zoneConfig.domination][]).map(([key, cfg]) => (
            <Card key={key}>
              <CardContent className="py-4 text-center">
                <cfg.icon className={`h-5 w-5 mx-auto mb-1 ${cfg.color.includes('emerald') ? 'text-emerald-600' : cfg.color.includes('primary') ? 'text-primary' : cfg.color.includes('amber') ? 'text-amber-600' : cfg.color.includes('red') ? 'text-red-600' : 'text-muted-foreground'}`} />
                <div className="text-2xl font-bold">{zoneCounts[key]}</div>
                <div className="text-[10px] text-muted-foreground">{cfg.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 14-Day Attack Plan */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> 14-Day Attack Plan</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground mb-1">Top 5 Immediate Moves</div>
              {result.attackPlan.top5ImmediateMoves.length ? result.attackPlan.top5ImmediateMoves.map((m, i) => (
                <div key={i} className="py-1 text-foreground">#{i + 1} {m}</div>
              )) : <span className="text-muted-foreground">No data</span>}
            </div>
            <div className="space-y-2">
              <div><span className="text-muted-foreground">Highest Revenue Push:</span><br /><span className="font-medium">{result.attackPlan.highestRevenuePush}</span></div>
              <div><span className="text-muted-foreground">Fastest Ranking Win:</span><br /><span className="font-medium">{result.attackPlan.fastestRankingWin}</span></div>
            </div>
            <div className="space-y-2">
              <div><span className="text-muted-foreground">Most Undervalued:</span><br /><span className="font-medium font-mono">{result.attackPlan.mostUndervaluedPage}</span></div>
            </div>
            <div className="space-y-2">
              <div><span className="text-muted-foreground">Stability Risk:</span><br /><Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[9px]">{result.attackPlan.systemStabilityRisk}</Badge></div>
              <div><span className="text-muted-foreground">Crawl Risk:</span><br /><Badge variant="outline" className={`text-[9px] ${result.crawl.crawlRiskLevel === 'elevated' ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}`}>{result.crawl.crawlRiskLevel}</Badge></div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="domination">
          <TabsList>
            <TabsTrigger value="domination"><Crosshair className="h-3.5 w-3.5 mr-1" /> Domination</TabsTrigger>
            <TabsTrigger value="zones"><BarChart3 className="h-3.5 w-3.5 mr-1" /> Zones</TabsTrigger>
            <TabsTrigger value="links"><Link2 className="h-3.5 w-3.5 mr-1" /> Link Map</TabsTrigger>
            <TabsTrigger value="crawl"><FileSearch className="h-3.5 w-3.5 mr-1" /> Crawl</TabsTrigger>
          </TabsList>

          {/* Domination Targets */}
          <TabsContent value="domination" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Top-20 Domination Targets (Score = Pos × Imp × Revenue × Authority)</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  {result.domTargets.map((t, i) => (
                    <div key={i} className="py-2.5 border-b border-border/40 last:border-0 text-xs space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="text-lg font-bold text-primary w-6 text-right shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{t.keyword}</span>
                            <Badge variant="outline" className="text-[9px] px-1">Score: {t.dominationScore}</Badge>
                            <Badge variant="outline" className="text-[9px] px-1">pos {t.position.toFixed(1)}</Badge>
                            <Badge variant="outline" className="text-[9px] px-1">{t.confidence}% conf</Badge>
                          </div>
                          <div className="mt-1 space-y-0.5 text-muted-foreground">
                            {t.actions.map((a, j) => <div key={j}>• {a}</div>)}
                          </div>
                          <div className="mt-1 text-muted-foreground">Est. time to Top 5: {t.estimatedTimeToTop5}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!result.domTargets.length && <p className="text-xs text-muted-foreground py-4">No domination targets — sync GSC data first.</p>}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Keyword Zones */}
          <TabsContent value="zones" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {(['domination', 'strike', 'acceleration', 'stagnation', 'decline'] as Zone[]).map(zone => {
                const items = result.zones.filter(z => z.zone === zone);
                if (!items.length) return null;
                const cfg = zoneConfig[zone];
                return (
                  <Card key={zone}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <cfg.icon className="h-4 w-4" /> {cfg.label} ({items.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent><ScrollArea className="h-48">{items.slice(0, 20).map((z, i) => <ZoneRow key={i} z={z} />)}</ScrollArea></CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Internal Link War Map */}
          <TabsContent value="links" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {[
                { items: result.linkMap.underLinkedPages, label: 'Under-Linked Money Pages', icon: <AlertTriangle className="h-4 w-4 text-red-600" /> },
                { items: result.linkMap.orphanPages, label: 'Orphan Pages', icon: <FileSearch className="h-4 w-4 text-amber-600" /> },
                { items: result.linkMap.authorityLeaks, label: 'Authority Leaks', icon: <TrendingDown className="h-4 w-4 text-red-600" /> },
                { items: result.linkMap.internalLinkInjectionPlan, label: 'Link Injection Plan', icon: <Link2 className="h-4 w-4 text-primary" /> },
              ].map((section, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">{section.icon} {section.label} ({section.items.length})</CardTitle>
                  </CardHeader>
                  <CardContent><ScrollArea className="h-48">{section.items.length ? section.items.map((item, i) => <IssueRow key={i} item={item} />) : <p className="text-xs text-muted-foreground py-4">None detected.</p>}</ScrollArea></CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Crawl Budget */}
          <TabsContent value="crawl" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Crawl Waste Sources ({result.crawl.crawlWasteSources.length})</CardTitle></CardHeader>
                <CardContent><ScrollArea className="h-48 text-xs">
                  {result.crawl.crawlWasteSources.length ? result.crawl.crawlWasteSources.map((s, i) => <div key={i} className="py-1 font-mono text-muted-foreground border-b border-border/40">{s}</div>) : <p className="text-muted-foreground py-4">No crawl waste detected.</p>}
                </ScrollArea></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Budget Optimization</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-3">
                  <div><span className="text-muted-foreground">Sitemap Health:</span> <Badge variant="outline" className="text-[9px]">{result.crawl.sitemapHealthScore}</Badge></div>
                  <div><span className="text-muted-foreground">Crawl Risk:</span> <Badge variant="outline" className="text-[9px]">{result.crawl.crawlRiskLevel}</Badge></div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Suggestions:</span>
                    {result.crawl.budgetOptimizationSuggestions.map((s, i) => <div key={i} className="text-foreground">• {s}</div>)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Safety */}
        <Card className="border-muted">
          <CardContent className="py-3 text-xs text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" /> Safe Mode: Recommendations only — no auto-publish. No DNS/canonical/redirect/XML/payment changes.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
