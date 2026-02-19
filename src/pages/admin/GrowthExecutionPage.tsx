import { useState, useMemo } from 'react';
import { useSeoFeatureFlags } from '@/hooks/useSeoFeatureFlags';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Target, TrendingUp, Link, Package, AlertTriangle, Download,
  Rocket, Search, Eye, MousePointerClick, ArrowUp, Zap, ChevronDown, ChevronUp,
  Crosshair, FileText, BookOpen, Globe,
} from 'lucide-react';
import {
  runGrowthEngineV4,
  type GrowthEngineV4Result,
} from '@/lib/seo-growth-engine-v4';
import { classifyRankingZones } from '@/lib/ranking-zones';
import { prepareBacklinkAssets, type BacklinkDominationResult } from '@/lib/backlink-domination';
import { runHyperAggressiveEngine, HYPER_AGGRESSIVE_DEFAULTS, type HyperAggressiveResult } from '@/lib/hyper-aggressive-engine';
import { runDominanceMode, type DominanceModeResult } from '@/lib/dominance-mode-engine';
import { runContentDominance, type ContentDominanceResult } from '@/lib/content-dominance-engine';
import { runGrowthDomination, type GrowthDominationResult } from '@/lib/growth-domination-engine';
import { runEnterpriseExpansion, type EnterpriseExpansionResult } from '@/lib/enterprise-expansion-engine';
import { runAlgorithmImmunityStack, type AlgorithmImmunityStackResult } from '@/lib/algorithm-immunity-engine';
import { runIntelligenceStack, type IntelligenceStackResult } from '@/lib/intelligence-domination-engine';
import { runAutonomousSeoGrowth, type AutonomousSeoResult } from '@/lib/autonomous-seo-growth-engine';
import { runRevenueMarketCapture, type RevenueMarketCaptureResult } from '@/lib/revenue-market-capture-engine';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Crown, Shield, Flame } from 'lucide-react';

// ============= METRIC CARD =============

function MetricCard({ label, value, icon: Icon, color = 'primary' }: {
  label: string; value: string | number; icon: React.ElementType; color?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: 'text-primary bg-primary/10',
    green: 'text-green-600 bg-green-100',
    amber: 'text-amber-600 bg-amber-100',
    red: 'text-red-600 bg-red-100',
    blue: 'text-blue-600 bg-blue-100',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorMap[color] || colorMap.primary}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= COLLAPSIBLE SECTION =============

function Section({ title, badge, children, defaultOpen = false }: {
  title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="cursor-pointer py-3 px-4" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {open && <CardContent className="pt-0 px-4 pb-4">{children}</CardContent>}
    </Card>
  );
}

// ============= MAIN PAGE =============

export default function GrowthExecutionPage() {
  const { flags, setFlag, isLoading: flagsLoading } = useSeoFeatureFlags();
  // Fetch GSC data from keyword_rankings
  const { data: gscData, isLoading } = useQuery({
    queryKey: ['growth-engine-v3-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('keyword_rankings')
        .select('keyword, slug, impressions, clicks, ctr, position, tracked_date')
        .not('slug', 'is', null)
        .order('tracked_date', { ascending: false })
        .limit(1000);

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Process data through V4 engine
  const result: GrowthEngineV4Result | null = useMemo(() => {
    if (!gscData || gscData.length === 0) return null;

    // Dedupe by slug, keeping latest
    const slugMap = new Map<string, { slug: string; position: number; impressions: number; clicks: number; ctr: number }>();
    for (const row of gscData) {
      if (!row.slug) continue;
      const existing = slugMap.get(row.slug);
      if (!existing || (row.impressions || 0) > existing.impressions) {
        slugMap.set(row.slug, {
          slug: row.slug,
          position: row.position || 99,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
          ctr: (row.ctr || 0) * 100,
        });
      }
    }

    return runGrowthEngineV4(Array.from(slugMap.values()));
  }, [gscData]);

  // Ranking zones
  const zones = useMemo(() => {
    if (!gscData) return null;
    const slugMap = new Map<string, { slug: string; position: number; impressions: number; clicks: number; ctr: number }>();
    for (const row of gscData) {
      if (!row.slug) continue;
      if (!slugMap.has(row.slug)) {
        slugMap.set(row.slug, {
          slug: row.slug,
          position: row.position || 99,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
          ctr: (row.ctr || 0) * 100,
        });
      }
    }
    return classifyRankingZones(Array.from(slugMap.values()));
  }, [gscData]);

  // Backlink assets
  const backlinkResult: BacklinkDominationResult | null = useMemo(() => {
    if (!gscData) return null;
    const slugMap = new Map<string, { slug: string; position: number; impressions: number; clicks: number }>();
    for (const row of gscData) {
      if (!row.slug) continue;
      if (!slugMap.has(row.slug)) {
        slugMap.set(row.slug, {
          slug: row.slug,
          position: row.position || 99,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
        });
      }
    }
    return prepareBacklinkAssets(Array.from(slugMap.values()));
  }, [gscData]);

  // 🔥 Hyper Aggressive Mode
  const hyperEnabled = flags.hyper_aggressive;
  const setHyperEnabled = (v: boolean) => setFlag('hyper_aggressive', v);
  const hyperResult: HyperAggressiveResult | null = useMemo(() => {
    if (!hyperEnabled || !gscData) return null;
    const slugMap = new Map<string, { slug: string; position: number; impressions: number; clicks: number }>();
    for (const row of gscData) {
      if (!row.slug) continue;
      if (!slugMap.has(row.slug)) {
        slugMap.set(row.slug, {
          slug: row.slug,
          position: row.position || 99,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
        });
      }
    }
    return runHyperAggressiveEngine(Array.from(slugMap.values()));
  }, [gscData, hyperEnabled]);

  // 👑 DOMINANCE MODE
  const dominanceEnabled = flags.dominance_mode;
  const setDominanceEnabled = (v: boolean) => setFlag('dominance_mode', v);
  const dominanceResult: DominanceModeResult | null = useMemo(() => {
    if (!dominanceEnabled || !gscData) return null;
    const slugMap = new window.Map<string, { slug: string; position: number; impressions: number; clicks: number; ctr: number }>();
    for (const row of gscData) {
      if (!row.slug) continue;
      if (!slugMap.has(row.slug)) {
        slugMap.set(row.slug, {
          slug: row.slug,
          position: row.position || 99,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
          ctr: (row.ctr || 0) * 100,
        });
      }
    }
    return runDominanceMode(Array.from(slugMap.values()));
  }, [gscData, dominanceEnabled]);

  // 📡 CONTENT DOMINANCE MODE (real query-level data)
  const contentDominanceEnabled = flags.content_dominance;
  const setContentDominanceEnabled = (v: boolean) => setFlag('content_dominance', v);
  const { data: gscQueryData } = useQuery({
    queryKey: ['gsc-keywords-content-dominance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: contentDominanceEnabled,
  });

  const contentDominanceResult: ContentDominanceResult | null = useMemo(() => {
    if (!contentDominanceEnabled || !gscQueryData || gscQueryData.length === 0) return null;
    return runContentDominance(gscQueryData.map(r => ({
      query: r.query,
      page: r.page,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })));
  }, [gscQueryData, contentDominanceEnabled]);

  // 🔥 GROWTH DOMINATION STACK
  const dominationEnabled = flags.growth_domination;
  const setDominationEnabled = (v: boolean) => setFlag('growth_domination', v);
  const { data: gscDominationData } = useQuery({
    queryKey: ['gsc-keywords-domination'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: dominationEnabled,
  });

  const dominationResult: GrowthDominationResult | null = useMemo(() => {
    if (!dominationEnabled || !gscDominationData || gscDominationData.length === 0) return null;
    return runGrowthDomination(gscDominationData);
  }, [gscDominationData, dominationEnabled]);

  // 🏢 ENTERPRISE EXPANSION STACK
  const enterpriseEnabled = flags.enterprise_expansion;
  const setEnterpriseEnabled = (v: boolean) => setFlag('enterprise_expansion', v);
  const { data: gscEnterpriseData } = useQuery({
    queryKey: ['gsc-keywords-enterprise'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: enterpriseEnabled,
  });

  const enterpriseResult: EnterpriseExpansionResult | null = useMemo(() => {
    if (!enterpriseEnabled || !gscEnterpriseData || gscEnterpriseData.length === 0) return null;
    return runEnterpriseExpansion(gscEnterpriseData);
  }, [gscEnterpriseData, enterpriseEnabled]);

  // 🛡️ ALGORITHM IMMUNITY STACK
  const immunityEnabled = flags.algorithm_immunity;
  const setImmunityEnabled = (v: boolean) => setFlag('algorithm_immunity', v);
  const { data: gscImmunityData } = useQuery({
    queryKey: ['gsc-keywords-immunity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: immunityEnabled,
  });

  const immunityResult: AlgorithmImmunityStackResult | null = useMemo(() => {
    if (!immunityEnabled || !gscImmunityData || gscImmunityData.length === 0) return null;
    return runAlgorithmImmunityStack(gscImmunityData);
  }, [gscImmunityData, immunityEnabled]);

  // 🧠 INTELLIGENCE STACK
  const intelligenceEnabled = flags.intelligence_stack;
  const setIntelligenceEnabled = (v: boolean) => setFlag('intelligence_stack', v);
  const { data: gscIntelData } = useQuery({
    queryKey: ['gsc-keywords-intelligence'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: intelligenceEnabled,
  });

  const intelligenceResult: IntelligenceStackResult | null = useMemo(() => {
    if (!intelligenceEnabled || !gscIntelData || gscIntelData.length === 0) return null;
    return runIntelligenceStack(gscIntelData);
  }, [gscIntelData, intelligenceEnabled]);

  // 🔄 AUTONOMOUS SEO GROWTH LOOP
  const autonomousEnabled = flags.autonomous_growth_loop;
  const setAutonomousEnabled = (v: boolean) => setFlag('autonomous_growth_loop', v);
  const { data: gscAutoData } = useQuery({
    queryKey: ['gsc-keywords-autonomous'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: autonomousEnabled,
  });

  const autonomousResult: AutonomousSeoResult | null = useMemo(() => {
    if (!autonomousEnabled || !gscAutoData || gscAutoData.length === 0) return null;
    return runAutonomousSeoGrowth(gscAutoData);
  }, [gscAutoData, autonomousEnabled]);

  // 💰 REVENUE + MARKET CAPTURE + ALGORITHM SHIELD
  const revenueEngineEnabled = flags.revenue_market_capture;
  const setRevenueEngineEnabled = (v: boolean) => setFlag('revenue_market_capture', v);
  const { data: gscRevenueData } = useQuery({
    queryKey: ['gsc-keywords-revenue-capture'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: revenueEngineEnabled,
  });

  const revenueResult: RevenueMarketCaptureResult | null = useMemo(() => {
    if (!revenueEngineEnabled || !gscRevenueData || gscRevenueData.length === 0) return null;
    return runRevenueMarketCapture(gscRevenueData);
  }, [gscRevenueData, revenueEngineEnabled]);

  const downloadCsv = () => {
    if (!backlinkResult?.csvData) return;
    const blob = new Blob([backlinkResult.csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `getpawsy-backlink-targets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet><title>Growth Execution Layer | Admin</title></Helmet>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Rocket className="h-6 w-6 text-primary" />
              SEO Growth Engine V4
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Full Growth Execution Layer — GSC correction, orphan domination, zero-click attack & backlink prep
            </p>
          </div>
          {backlinkResult && (
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download className="h-4 w-4 mr-1" /> Export Backlink CSV
            </Button>
          )}
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <MetricCard label="Total Pages" value={gscData?.length || 0} icon={Search} />
          <MetricCard label="GSC Match %" value={result?.gscCorrection.matchRate ? `${result.gscCorrection.matchRate}%` : '—'} icon={Target} color="green" />
          <MetricCard label="Orphans" value={result ? `${result.orphanElimination.totalOrphansAfter}` : '—'} icon={AlertTriangle} color={result && result.orphanElimination.totalOrphansAfter < 10 ? 'green' : 'red'} />
          <MetricCard label="Pos 11-20 Push" value={result?.positionBoostV2.totalTargets || 0} icon={ArrowUp} color="amber" />
          <MetricCard label="Zero-Click" value={result?.zeroClickAttack.length || 0} icon={Crosshair} color="red" />
          <MetricCard label="CTR Recovery" value={result?.productRecovery.totalProducts || 0} icon={MousePointerClick} color="amber" />
          <MetricCard label="Product Wins" value={result?.productQuickWins.length || 0} icon={Package} color="blue" />
          <MetricCard label="Link Assets" value={result?.backlinkPrep.totalAssets || 0} icon={Link} color="green" />
          <MetricCard label="Auto-Links" value={result?.orphanElimination.totalInjectionsGenerated || 0} icon={Zap} color="primary" />
          <MetricCard label="Elimination %" value={result?.report.orphanEliminationRate || '—'} icon={TrendingUp} color="green" />
        </div>

        {/* Forecast */}
        {result && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> 90-Day Growth Forecast
              </h3>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-background">
                 <p className="text-muted-foreground text-xs">Ranking Lift</p>
                   <p className="font-medium">{result.report.estimatedRankingLift}</p>
                 </div>
                 <div className="p-3 rounded-lg bg-background">
                   <p className="text-muted-foreground text-xs">CTR Improvement</p>
                   <p className="font-medium">{result.report.projectedCtrImprovement}</p>
                 </div>
                 <div className="p-3 rounded-lg bg-background">
                   <p className="text-muted-foreground text-xs">Click Growth</p>
                   <p className="font-medium">{result.report.projectedTraffic90Days}</p>
                 </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* CTR Doubling Forecast Model */}
        {result && gscData && (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-green-600" /> Growth Forecast — 90-Day Plan
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-background border">
                  <p className="text-muted-foreground text-xs">Orphans</p>
                  <p className="text-lg font-bold text-green-600">{result.orphanElimination.totalOrphansBefore} → {result.orphanElimination.totalOrphansAfter}</p>
                  <p className="text-[10px] text-muted-foreground">{result.report.orphanEliminationRate} auto-linked</p>
                </div>
                <div className="p-3 rounded-lg bg-background border">
                  <p className="text-muted-foreground text-xs">Pos 11-20 Push</p>
                  <p className="text-lg font-bold text-primary">{result.positionBoostV2.totalTargets} URLs</p>
                  <p className="text-[10px] text-muted-foreground">Avg {result.positionBoostV2.avgCurrentPosition} → {result.positionBoostV2.projectedAvgPosition}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border">
                  <p className="text-muted-foreground text-xs">Product Recovery</p>
                  <p className="text-lg font-bold text-amber-600">{result.productRecovery.totalProducts} products</p>
                  <p className="text-[10px] text-muted-foreground">CTR {result.productRecovery.avgCtrBefore.toFixed(1)}% → {result.productRecovery.projectedAvgCtr.toFixed(1)}%</p>
                </div>
                <div className="p-3 rounded-lg bg-background border">
                  <p className="text-muted-foreground text-xs">Backlink Assets</p>
                  <p className="text-lg font-bold text-blue-600">{result.backlinkPrep.totalAssets}</p>
                  <p className="text-[10px] text-muted-foreground">Avg score: {result.backlinkPrep.avgPriorityScore}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border">
                  <p className="text-muted-foreground text-xs">90-Day Projection</p>
                  <p className="text-lg font-bold text-primary">{result.report.projectedTraffic90Days.split('→')[1]?.trim() || '—'}</p>
                  <p className="text-[10px] text-muted-foreground">{result.report.estimatedRankingLift}</p>
                </div>
              </div>
              <div className="mt-3 grid md:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded bg-background border">
                  <span className="font-medium">Phase 1 (0-30d):</span> Title optimization + zero-click attack on {result.zeroClickAttack.length + result.ctrBoosts.length} pages
                </div>
                <div className="p-2 rounded bg-background border">
                  <span className="font-medium">Phase 2 (30-60d):</span> Orphan elimination ({result.orphanElimination.totalOrphansBefore} → {result.orphanElimination.totalOrphansAfter}) + {result.orphanElimination.totalInjectionsGenerated} auto-links
                </div>
                <div className="p-2 rounded bg-background border">
                  <span className="font-medium">Phase 3 (60-90d):</span> Authority hub expansion + {result.backlinkPrep.totalAssets} backlink assets + {result.productRecovery.totalProducts} product recoveries
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* GSC Action Engine */}
        {result && gscData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Position 11-20 Opportunities */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowUp className="h-4 w-4 text-blue-500" /> Position 11–20 Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                {(() => {
                  const pos1120 = result.position1130.filter(p => p.position >= 11 && p.position <= 20);
                  return (
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {pos1120.length === 0 && <p className="text-xs text-muted-foreground">No pages in 11-20 range</p>}
                      {pos1120.slice(0, 10).map(p => (
                        <div key={p.slug} className="flex items-center justify-between text-xs p-1.5 rounded border">
                          <span className="font-mono text-primary truncate max-w-[60%]">/{p.slug}</span>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-[10px]">Pos {p.position}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{p.impressions} imp</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Zero Click Alerts */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-red-500" /> Zero Click Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {result.zeroClickAttack.length === 0 && <p className="text-xs text-muted-foreground">No zero-click pages</p>}
                  {result.zeroClickAttack.slice(0, 10).map(z => (
                    <div key={z.slug} className="flex items-center justify-between text-xs p-1.5 rounded border">
                      <span className="font-mono text-primary truncate max-w-[50%]">/{z.slug}</span>
                      <div className="flex gap-1">
                        <Badge variant="outline" className="text-[10px]">Pos {z.position}</Badge>
                        <Badge variant="destructive" className="text-[10px]">0 clicks</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* High Impression Low CTR */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-amber-500" /> High Impression Low CTR
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                {(() => {
                  const hiLowCtr = result.ctrBoosts.filter(b => b.impressions >= 10).slice(0, 10);
                  return (
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {hiLowCtr.length === 0 && <p className="text-xs text-muted-foreground">No pages found</p>}
                      {hiLowCtr.map(b => (
                        <div key={b.slug} className="flex items-center justify-between text-xs p-1.5 rounded border">
                          <span className="font-mono text-primary truncate max-w-[50%]">/{b.slug}</span>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-[10px]">{b.impressions} imp</Badge>
                            <Badge variant="secondary" className="text-[10px]">{b.modifier}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Orphan Recovery Progress */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" /> Orphan Recovery Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current orphans</span>
                    <span className="font-bold text-red-600">{result.orphanFix.totalOrphans}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Target</span>
                    <span className="font-bold text-green-600">&lt;10</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${Math.max(5, 100 - (result.orphanFix.totalOrphans / 123) * 100)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(result.orphanFix.breakdown).filter(([, v]) => v > 0).map(([type, count]) => (
                      <Badge key={type} variant="outline" className="text-[10px]">{type}: {count}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Authority Hub Score */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-purple-500" /> Authority Hub Score
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <div className="space-y-2">
                  {result.authorityHubs.hubs.map(hub => (
                    <div key={hub.hubSlug} className="p-2 rounded border text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{hub.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{hub.clusterPages.length} pages</Badge>
                      </div>
                      <div className="flex gap-2 text-muted-foreground">
                        <span>{hub.inboundLinks} in</span>
                        <span>{hub.outboundLinks} out</span>
                        <span>Depth: {hub.maxCrawlDepth}</span>
                      </div>
                    </div>
                  ))}
                  <div className="text-xs text-muted-foreground">
                    Total links: {result.authorityHubs.totalInternalLinks} | Avg/page: {result.authorityHubs.avgLinksPerPage}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Product SEO Completion */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-500" /> Product SEO Completion
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Optimized</span>
                    <span className="font-bold text-primary">{result.productQuickWins.length} / 50</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(result.productQuickWins.length / 50) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {result.productQuickWins.length} products with SEO intro + FAQ schema + guide links
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Phase 1: Orphan Eradication */}
        {result && (
          <Section title="Phase 1 — Orphan Eradication" badge={`${result.orphanFix.totalOrphans} found`} defaultOpen>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.entries(result.orphanFix.breakdown).filter(([, v]) => v > 0).map(([type, count]) => (
                  <Badge key={type} variant="outline">{type}: {count}</Badge>
                ))}
              </div>
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {result.orphanFix.remainingOrphans.slice(0, 30).map(o => (
                  <div key={o.slug} className="p-3 rounded-lg border bg-card text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-primary">/{o.slug}</span>
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-xs">{o.pageType}</Badge>
                        <Badge variant="outline" className="text-xs">{o.impressions} imp</Badge>
                      </div>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                      {o.fixActions.map((a, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <Zap className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* Zero-Click Attack */}
        {result && result.zeroClickAttack.length > 0 && (
          <Section title="Phase 3 — Zero-Click Attack" badge={`${result.zeroClickAttack.length} pages`}>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {result.zeroClickAttack.slice(0, 30).map(z => (
                <div key={z.slug} className="p-3 rounded-lg border bg-card text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-primary">/{z.slug}</span>
                    <div className="flex gap-1.5">
                      <Badge variant="outline" className="text-xs">Pos {z.position}</Badge>
                      <Badge variant="secondary" className="text-xs">{z.impressions} imp</Badge>
                      <Badge variant="destructive" className="text-xs">{z.modifier}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-through">{z.originalTitle}</p>
                  <p className="text-xs font-medium text-primary">{z.newTitle}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{z.newMeta}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Phase 4: Position 11-30 Push */}
        {result && result.position1130.length > 0 && (
          <Section title="Phase 2 — Position 11–30 Push" badge={`${result.position1130.length} targets`}>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {result.position1130.map(p => (
                <div key={p.slug} className="p-3 rounded-lg border bg-card text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-primary">/{p.slug}</span>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">Pos {p.position}</Badge>
                      <Badge variant="secondary" className="text-xs">{p.impressions} imp</Badge>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-0.5">Old title:</p>
                      <p className="line-through opacity-60">{p.oldTitle}</p>
                      <p className="text-muted-foreground mt-1 mb-0.5">New title:</p>
                      <p className="font-medium text-green-700">{p.newTitle}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Actions:</p>
                      <ul className="space-y-0.5">
                        {p.contentActions.slice(0, 3).map((a, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <ArrowUp className="h-3 w-3 mt-0.5 text-primary shrink-0" />{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Phase 3: Authority Hubs */}
        {result && (
          <Section title="Phase 3 — Authority Hubs" badge={`${result.authorityHubs.hubs.length} hubs`}>
            <div className="space-y-3">
              {result.authorityHubs.hubs.map(hub => (
                <div key={hub.hubSlug} className="p-4 rounded-lg border bg-card">
                  <h4 className="font-semibold text-sm mb-1">{hub.name}</h4>
                  <p className="text-xs text-muted-foreground mb-2">{hub.introText.slice(0, 200)}...</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">{hub.clusterPages.length} pages</Badge>
                    <Badge variant="outline" className="text-xs">{hub.inboundLinks} inbound</Badge>
                    <Badge variant="outline" className="text-xs">{hub.outboundLinks} outbound</Badge>
                    <Badge variant="secondary" className="text-xs">Depth: {hub.maxCrawlDepth}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {hub.clusterPages.slice(0, 8).map(p => (
                      <Badge key={p} variant="outline" className="text-[10px] font-mono">/{p}</Badge>
                    ))}
                    {hub.clusterPages.length > 8 && (
                      <Badge variant="secondary" className="text-[10px]">+{hub.clusterPages.length - 8} more</Badge>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">
                Total internal links: {result.authorityHubs.totalInternalLinks} | 
                Avg per page: {result.authorityHubs.avgLinksPerPage} | 
                Max depth: {result.authorityHubs.maxCrawlDepth}
              </div>
            </div>
          </Section>
        )}

        {/* Phase 4: CTR Boost */}
        {result && result.ctrBoosts.length > 0 && (
          <Section title="Phase 4 — CTR Zero-Click Boost" badge={`${result.ctrBoosts.length} pages`}>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {result.ctrBoosts.slice(0, 20).map(b => (
                <div key={b.slug} className="p-3 rounded-lg border bg-card text-sm flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-primary block truncate">/{b.slug}</span>
                    <p className="text-xs mt-0.5">
                      <span className="text-muted-foreground line-through">{b.currentTitle}</span>
                    </p>
                    <p className="text-xs font-medium text-green-700">{b.enhancedTitle}</p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-2">
                    <Badge variant="outline" className="text-xs">Pos {b.position}</Badge>
                    <Badge variant="secondary" className="text-xs">{b.modifier}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Phase 5: Product Quick Wins */}
        {result && result.productQuickWins.length > 0 && (
          <Section title="Phase 5 — Product Quick Wins" badge={`${result.productQuickWins.length} products`}>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {result.productQuickWins.map(pw => (
                <div key={pw.slug} className="p-3 rounded-lg border bg-card text-sm">
                  <span className="font-mono text-xs text-primary">/{pw.slug}</span>
                  <Badge variant="outline" className="text-xs ml-2">{pw.impressions} imp</Badge>
                  <p className="text-xs text-muted-foreground mt-1">{pw.seoIntro.slice(0, 120)}...</p>
                  <div className="flex gap-1 mt-1">
                    {pw.relatedGuides.map(g => (
                      <Badge key={g} variant="secondary" className="text-[10px]">→ {g}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Phase 6: Backlink Domination */}
        {backlinkResult && backlinkResult.assets.length > 0 && (
          <Section title="Phase 6 — Backlink Domination Prep" badge={`${backlinkResult.totalAssets} assets`}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Avg priority score: {backlinkResult.avgPriorityScore}</p>
              <Button variant="outline" size="sm" onClick={downloadCsv}>
                <Download className="h-3 w-3 mr-1" /> Download CSV
              </Button>
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {backlinkResult.assets.map(a => (
                <div key={a.slug} className="p-3 rounded-lg border bg-card text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-primary">/{a.slug}</span>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">Score: {a.priorityScore}</Badge>
                      <Badge variant="secondary" className="text-xs">{a.assetType}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{a.outreachSummary.slice(0, 150)}...</p>
                  <div className="flex flex-wrap gap-1">
                    {a.anchorVariations.slice(0, 4).map((anc, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">"{anc}"</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Phase 7: Ranking Zones Overview */}
        {zones && (
          <Section title="Ranking Zone Distribution" badge={`${zones.summary.greenCount + zones.summary.yellowCount + zones.summary.redCount + zones.summary.neutralCount} pages`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-xs text-green-700 font-medium">🟢 Green (1-10)</p>
                <p className="text-lg font-bold text-green-800">{zones.summary.greenCount}</p>
                <p className="text-[10px] text-green-600">{zones.summary.greenImpressions} imp</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-700 font-medium">🔵 Neutral (11-19)</p>
                <p className="text-lg font-bold text-blue-800">{zones.summary.neutralCount}</p>
                <p className="text-[10px] text-blue-600">{zones.summary.neutralImpressions} imp</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700 font-medium">🟡 Yellow (20-60)</p>
                <p className="text-lg font-bold text-amber-800">{zones.summary.yellowCount}</p>
                <p className="text-[10px] text-amber-600">{zones.summary.yellowImpressions} imp</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs text-red-700 font-medium">🔴 Red (70+)</p>
                <p className="text-lg font-bold text-red-800">{zones.summary.redCount}</p>
                <p className="text-[10px] text-red-600">{zones.summary.redImpressions} imp</p>
              </div>
            </div>
            {zones.priorityYellow.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2">Priority Yellow Pages (Top 10 by impressions):</p>
                <div className="space-y-1">
                  {zones.priorityYellow.map(p => (
                    <div key={p.slug} className="flex items-center justify-between text-xs p-2 rounded border">
                      <span className="font-mono text-primary">/{p.slug}</span>
                      <div className="flex gap-2">
                        <span>Pos {p.position}</span>
                        <span>{p.impressions} imp</span>
                        <span>{p.clicks} clicks</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* 🔥 HYPER AGGRESSIVE MODE */}
        <Card className={hyperEnabled ? 'border-red-500/50 bg-red-500/5' : 'border-border'}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔥</span>
                <CardTitle className="text-sm font-semibold">Hyper Aggressive Mode</CardTitle>
                <Badge variant={hyperEnabled ? 'destructive' : 'secondary'} className="text-xs">
                  {hyperEnabled ? 'ACTIVE' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Amazon-Level Domination</span>
                <Switch
                  checked={hyperEnabled}
                  onCheckedChange={(checked) => {
                    setHyperEnabled(checked);
                    toast[checked ? 'warning' : 'info'](
                      checked ? '🔥 Hyper Aggressive Mode activated' : 'Hyper Aggressive Mode deactivated'
                    );
                  }}
                />
              </div>
            </div>
          </CardHeader>
          {hyperEnabled && hyperResult && (
            <CardContent className="pt-0 px-4 pb-4 space-y-4">
              {/* Aggressiveness Meter */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Aggressiveness</span>
                    <span className="font-bold">{hyperResult.aggressivenessScore}/100</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${hyperResult.aggressivenessScore}%`,
                        background: `linear-gradient(90deg, hsl(var(--primary)), hsl(0 80% 50%))`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Impact Forecast */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="p-2 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">Impression Lift</p>
                  <p className="font-semibold text-primary">{hyperResult.projectedImpact.impressionLift}</p>
                </div>
                <div className="p-2 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">Position Lift</p>
                  <p className="font-semibold text-primary">{hyperResult.projectedImpact.positionLift}</p>
                </div>
                <div className="p-2 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">Click Growth</p>
                  <p className="font-semibold text-primary">{hyperResult.projectedImpact.clickGrowth}</p>
                </div>
                <div className="p-2 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">Time to Results</p>
                  <p className="font-semibold">{hyperResult.projectedImpact.timeToResults}</p>
                </div>
              </div>

              {/* Warnings */}
              {hyperResult.warnings.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-1">
                  {hyperResult.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-destructive">{w}</p>
                  ))}
                </div>
              )}

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-2">
                <MetricCard label="New Links" value={hyperResult.totalNewLinks} icon={Link} color="red" />
                <MetricCard label="New Content" value={`${hyperResult.totalNewContent} pages`} icon={Zap} color="amber" />
                <MetricCard label="Suppression" value={`${hyperResult.serpSuppression.length} targets`} icon={Target} color="primary" />
              </div>

              {/* Link Saturation */}
              <Section title="Link Saturation Matrix" badge={`${hyperResult.linkSaturation.length} pages`}>
                <div className="max-h-[250px] overflow-y-auto space-y-1">
                  {hyperResult.linkSaturation.slice(0, 15).map(ls => (
                    <div key={ls.sourceSlug} className="flex items-center justify-between text-xs p-2 rounded border">
                      <span className="font-mono text-primary">/{ls.sourceSlug}</span>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-[10px]">{ls.totalLinks} links</Badge>
                        <Badge variant="secondary" className="text-[10px]">{ls.density}/1k words</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* SERP Suppression */}
              {hyperResult.serpSuppression.length > 0 && (
                <Section title="SERP Suppression Targets" badge={`${hyperResult.serpSuppression.length} keywords`}>
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {hyperResult.serpSuppression.map(s => (
                      <div key={s.ourSlug} className="p-3 rounded-lg border bg-card text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs text-primary">/{s.ourSlug}</span>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs">Pos {s.ourPosition}</Badge>
                            <Badge
                              variant={s.aggressivenessScore >= 7 ? 'destructive' : 'secondary'}
                              className="text-xs"
                            >
                              🔥 {s.aggressivenessScore}/10
                            </Badge>
                          </div>
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          {s.suppressionActions.slice(0, 4).map((a, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <Zap className="h-3 w-3 mt-0.5 text-destructive shrink-0" />{a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Cluster Overbuild */}
              {hyperResult.clusterOverbuilds.length > 0 && (
                <Section title="Cluster Overbuild Plan" badge={`${hyperResult.totalNewContent} new pages`}>
                  <div className="space-y-3">
                    {hyperResult.clusterOverbuilds.map(co => (
                      <div key={co.cluster} className="p-3 rounded-lg border bg-card">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm">{co.cluster}</span>
                          <Badge variant="outline" className="text-xs">{co.currentPages} → {co.targetPages} pages</Badge>
                        </div>
                        <div className="space-y-1">
                          {co.contentCalendar.slice(0, 5).map(item => (
                            <div key={item.slug} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted">
                              <span className="font-mono text-primary truncate max-w-[50%]">/{item.slug}</span>
                              <div className="flex gap-2">
                                <Badge variant="secondary" className="text-[10px]">Week {item.week}</Badge>
                                <Badge variant="outline" className="text-[10px]">{item.wordCount}w</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* PageRank Funnels */}
              <Section title="PageRank Funnels" badge={`${hyperResult.pageRankFunnels.length} money pages`}>
                <div className="space-y-2">
                  {hyperResult.pageRankFunnels.map(f => (
                    <div key={f.moneyPage} className="p-3 rounded-lg border bg-card text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs text-primary font-bold">/{f.moneyPage}</span>
                        <Badge variant="outline" className="text-xs">{f.totalInboundLinks} inbound → {f.estimatedPageRankShare}% share</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {f.funnelSources.slice(0, 6).map(s => (
                          <Badge key={s.slug} variant="secondary" className="text-[10px] font-mono">← {s.slug}</Badge>
                        ))}
                        {f.funnelSources.length > 6 && (
                          <Badge variant="outline" className="text-[10px]">+{f.funnelSources.length - 6} more</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </CardContent>
          )}
        </Card>

        {/* 👑 DOMINANCE MODE */}
        <Card className={dominanceEnabled ? 'border-amber-500/50 bg-amber-500/5' : 'border-border'}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-sm font-semibold">Dominance Mode</CardTitle>
                <Badge variant={dominanceEnabled ? 'default' : 'secondary'} className="text-xs">
                  {dominanceEnabled ? 'ACTIVE' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Authority Expansion</span>
                <Switch
                  checked={dominanceEnabled}
                  onCheckedChange={(checked) => {
                    setDominanceEnabled(checked);
                    toast[checked ? 'warning' : 'info'](
                      checked ? '👑 Dominance Mode activated' : 'Dominance Mode deactivated'
                    );
                  }}
                />
              </div>
            </div>
          </CardHeader>
          {dominanceEnabled && dominanceResult && (
            <CardContent className="pt-0 px-4 pb-4 space-y-4">
              {/* KPI Widgets */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <MetricCard label="Authority Injection %" value={`${dominanceResult.kpis.authorityInjectionPct}%`} icon={Shield} color="green" />
                <MetricCard label="Backlink Velocity (30d)" value={dominanceResult.kpis.backlinkVelocity30d} icon={Flame} color="amber" />
                <MetricCard label="Money URL Avg Pos" value={dominanceResult.kpis.moneyUrlAvgPosition} icon={Target} color="primary" />
                <MetricCard label="CTR Lift %" value={`${dominanceResult.kpis.ctrLiftPct}%`} icon={MousePointerClick} color="blue" />
                <MetricCard label="Orphan Elimination %" value={`${dominanceResult.kpis.orphanEliminationPct}%`} icon={AlertTriangle} color="green" />
              </div>

              {/* 90-Day Forecast v2 */}
              <div className="p-4 rounded-lg border bg-background space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> 90-Day Dominance Forecast
                </h4>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">Avg Position</p>
                    <p className="text-lg font-bold">{dominanceResult.forecast90d.currentAvgPosition} → <span className="text-primary">{dominanceResult.forecast90d.projectedAvgPosition}</span></p>
                    <p className="text-[10px] text-muted-foreground">-{dominanceResult.forecast90d.positionLiftFromLinks} from link velocity</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">Impressions</p>
                    <p className="text-lg font-bold">{dominanceResult.forecast90d.currentImpressions.toLocaleString()} → <span className="text-primary">{dominanceResult.forecast90d.projectedImpressions.toLocaleString()}</span></p>
                    <p className="text-[10px] text-muted-foreground">+{dominanceResult.forecast90d.impressionGrowthPct}% growth</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">Clicks</p>
                    <p className="text-lg font-bold">{dominanceResult.forecast90d.currentClicks} → <span className="text-primary">{dominanceResult.forecast90d.projectedClicks}</span></p>
                    <p className="text-[10px] text-muted-foreground">+{Math.round(dominanceResult.forecast90d.ctrIncreaseFromRewrites * 100)}% CTR lift</p>
                  </div>
                </div>
              </div>

              {/* Money URL Table */}
              <Section title="Top 20 Money URLs" badge={`${dominanceResult.moneyUrls.length} targets`} defaultOpen>
                <div className="max-h-[600px] overflow-y-auto space-y-2">
                  {dominanceResult.moneyUrls.map((u, i) => (
                    <div key={u.slug} className="p-3 rounded-lg border bg-card text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                          <span className="font-mono text-xs text-primary truncate max-w-[200px]">/{u.slug}</span>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">Pos {u.position}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{u.impressions} imp</Badge>
                          <Badge variant="default" className="text-[10px]">{u.pageType}</Badge>
                          <Badge variant="outline" className="text-[10px]">Score: {u.authorityScore}</Badge>
                          <Badge variant={u.intentClassification === 'transactional' ? 'destructive' : u.intentClassification === 'commercial' ? 'default' : 'secondary'} className="text-[10px]">
                            {u.intentClassification}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">{u.suggestedAssetType}</Badge>
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-0.5">CTR Rewrite:</p>
                          <p className="line-through opacity-60">{u.ctrRewrite.originalTitle}</p>
                          <p className="font-medium text-primary">{u.ctrRewrite.newTitle}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{u.ctrRewrite.newMeta}</p>
                          {/* Trust Signals */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {u.trustSignals.map((ts, j) => (
                              <span key={j} className="inline-flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                {ts.icon} {ts.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Anchor Variations:</p>
                          <div className="flex flex-wrap gap-1">
                            {u.anchorVariations.map((a, j) => (
                              <Badge key={j} variant="outline" className="text-[10px]">"{a}"</Badge>
                            ))}
                          </div>
                          <p className="text-muted-foreground mt-1.5 mb-0.5">Weekly Backlink Plan:</p>
                          <div className="flex gap-1">
                            {u.weeklyBacklinkPlan.map((wb) => (
                              <span key={wb.week} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                W{wb.week}: {wb.count}× {wb.anchorType}
                              </span>
                            ))}
                          </div>
                          <p className="text-muted-foreground mt-1.5 mb-0.5">FAQ Schema ({u.faqSchema.length}):</p>
                          <div className="space-y-0.5">
                            {u.faqSchema.map((faq, j) => (
                              <p key={j} className="text-[10px] text-muted-foreground truncate">Q: {faq.question}</p>
                            ))}
                          </div>
                          <p className="text-muted-foreground mt-1 mb-0.5">Internal Injections: {u.internalInjections.length}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* 30-Day Backlink Attack Plan */}
              <Section title="30-Day Backlink Attack Plan" badge={`${dominanceResult.totalBacklinkPlacements} placements`}>
                <div className="space-y-3">
                  {dominanceResult.backlinkPlan.map(week => (
                    <div key={week.week} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">Week {week.week} — {week.label}</h4>
                        <Badge variant="secondary" className="text-xs">{week.totalPlacements} placements</Badge>
                      </div>
                      <div className="space-y-1">
                        {week.tasks.map((task, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted">
                            <span className="truncate max-w-[60%]">{task.description}</span>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="text-[10px]">{task.count}x</Badge>
                              <Badge variant="secondary" className="text-[10px]">{task.anchorType}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="p-3 rounded-lg bg-muted text-xs space-y-1">
                    <p className="font-semibold">Anchor Distribution Target:</p>
                    <div className="flex gap-3">
                      <span>Branded: {dominanceResult.anchorDistribution.branded}%</span>
                      <span>Partial: {dominanceResult.anchorDistribution.partial}%</span>
                      <span>Contextual: {dominanceResult.anchorDistribution.contextual}%</span>
                      <span>Exact: {dominanceResult.anchorDistribution.exact}%</span>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Orphan Impact */}
              <div className="p-3 rounded-lg border bg-muted text-sm flex items-center justify-between">
                <span>Orphan Reduction</span>
                <span className="font-bold">{dominanceResult.orphansReduced.before} → <span className="text-primary">{dominanceResult.orphansReduced.after}</span></span>
              </div>
            </CardContent>
          )}
        </Card>

        {/* 📡 CONTENT DOMINANCE MODE */}
        <Card className={contentDominanceEnabled ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border'}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-emerald-500" />
                <CardTitle className="text-sm font-semibold">Content Dominance Mode</CardTitle>
                <Badge variant={contentDominanceEnabled ? 'default' : 'secondary'} className="text-xs">
                  {contentDominanceEnabled ? 'ACTIVE' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Query-Driven Intelligence</span>
                <Switch checked={contentDominanceEnabled} onCheckedChange={(checked) => { setContentDominanceEnabled(checked); toast[checked ? 'success' : 'info'](checked ? '📡 Content Dominance Mode activated' : 'Content Dominance Mode deactivated'); }} />
              </div>
            </div>
          </CardHeader>
          {contentDominanceEnabled && contentDominanceResult && (
            <CardContent className="pt-0 px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard label="Real Queries" value={contentDominanceResult.systemSummary.totalRealQueries} icon={Search} color="green" />
                <MetricCard label="Total Impressions" value={contentDominanceResult.systemSummary.totalImpressions.toLocaleString()} icon={Eye} color="blue" />
                <MetricCard label="Breakout Targets" value={contentDominanceResult.systemSummary.breakoutTargetsDetected} icon={Rocket} color="amber" />
                <MetricCard label="Yellow Zone" value={contentDominanceResult.yellowZoneQueries.length} icon={Target} color="primary" />
              </div>
              <div className="p-3 rounded-lg border flex items-center justify-between" style={{ background: 'hsl(var(--primary) / 0.05)', borderColor: 'hsl(var(--primary) / 0.2)' }}>
                <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /><span className="text-sm font-medium">System: {contentDominanceResult.systemSummary.systemIntegrity}</span></div>
                <Badge variant={contentDominanceResult.systemSummary.safePushEnabled ? 'default' : 'destructive'} className="text-xs">Safe Push: {contentDominanceResult.systemSummary.safePushEnabled ? 'ON' : 'OFF'}</Badge>
              </div>

              {/* Breakout Blueprint */}
              <Section title={`Breakout Blueprint: ${contentDominanceResult.breakoutBlueprint.targetKeyword}`} badge={`Pos ${contentDominanceResult.breakoutBlueprint.currentPosition}`} defaultOpen>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Traffic Lift</p><p className="font-semibold text-primary">{contentDominanceResult.breakoutBlueprint.projectedTrafficLift}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Semantic Coverage</p><p className="font-semibold text-primary">{contentDominanceResult.breakoutBlueprint.semanticCoverageScore}/100</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Top 20 Probability</p><p className="font-semibold text-primary">{contentDominanceResult.breakoutBlueprint.estimatedTop20Probability}</p></div>
                  </div>
                  <p className="text-xs font-semibold">Guide Architecture ({contentDominanceResult.breakoutBlueprint.guideSections.length} sections):</p>
                  {contentDominanceResult.breakoutBlueprint.guideSections.map((s, i) => (
                    <div key={i} className="p-2 rounded border text-xs">
                      <div className="flex items-center justify-between mb-1"><span className="font-medium">{s.h2}</span><Badge variant="outline" className="text-[10px]">{s.targetWordCount}w</Badge></div>
                      <div className="flex flex-wrap gap-1">{s.h3s.map((h3, j) => <Badge key={j} variant="secondary" className="text-[10px]">H3: {h3}</Badge>)}</div>
                    </div>
                  ))}
                  <p className="text-xs font-semibold">Semantic Variants ({contentDominanceResult.breakoutBlueprint.semanticVariants.length}):</p>
                  <div className="flex flex-wrap gap-1">{contentDominanceResult.breakoutBlueprint.semanticVariants.map((v, i) => <Badge key={i} variant="outline" className="text-[10px]">{v}</Badge>)}</div>
                  <p className="text-xs font-semibold">FAQ Schema ({contentDominanceResult.breakoutBlueprint.faqEntries.length}):</p>
                  {contentDominanceResult.breakoutBlueprint.faqEntries.map((f, i) => <div key={i} className="p-2 rounded bg-muted text-xs"><p className="font-medium">Q: {f.question}</p><p className="text-muted-foreground mt-0.5">{f.answer.slice(0, 120)}...</p></div>)}
                  <p className="text-xs font-semibold">Internal Links ({contentDominanceResult.breakoutBlueprint.internalLinks.length}):</p>
                  {contentDominanceResult.breakoutBlueprint.internalLinks.map((l, i) => <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border"><span className="font-mono text-primary">{l.targetSlug}</span><Badge variant="outline" className="text-[10px]">"{l.anchorText}"</Badge></div>)}
                </div>
              </Section>

              {/* Topical Authority Map */}
              <Section title="Topical Authority Map" badge={`${contentDominanceResult.topicalAuthorityMap.totalPagesRequired} pages | ${(contentDominanceResult.topicalAuthorityMap.totalWordCount / 1000).toFixed(0)}k words`}>
                <div className="space-y-3">
                  {contentDominanceResult.topicalAuthorityMap.pillars.map(pillar => (
                    <div key={pillar.slug} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />{pillar.name}</h4>
                        <div className="flex gap-1"><Badge variant="outline" className="text-[10px]">{pillar.clusters.length} clusters</Badge><Badge variant="secondary" className="text-[10px]">Auth: {pillar.authorityProjection}</Badge></div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2">Cornerstone: {pillar.cornerstonePage} ({pillar.cornerstoneWordCount}w)</p>
                      <div className="space-y-1">{pillar.clusters.slice(0, 5).map(c => (
                        <div key={c.slug} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted">
                          <span className="truncate max-w-[45%]">{c.title}</span>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-[10px]">{c.wordCount}w</Badge>
                            <Badge variant={c.intent === 'commercial' ? 'default' : 'secondary'} className="text-[10px]">{c.intent}</Badge>
                            <Badge variant={c.priority === 'high' ? 'destructive' : 'outline'} className="text-[10px]">{c.priority}</Badge>
                          </div>
                        </div>
                      ))}{pillar.clusters.length > 5 && <p className="text-[10px] text-muted-foreground">+{pillar.clusters.length - 5} more</p>}</div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Links: {contentDominanceResult.topicalAuthorityMap.internalLinkGraph.length} total | Authority projection: {contentDominanceResult.topicalAuthorityMap.authorityScoreProjection}/100</p>
                </div>
              </Section>

              {/* 90-Day Roadmap */}
              <Section title="90-Day Dominance Roadmap">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Ranking Lift</p><p className="font-semibold text-primary text-[11px]">{contentDominanceResult.roadmap.expectedRankingLift}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Traffic Increase</p><p className="font-semibold text-primary text-[11px]">{contentDominanceResult.roadmap.expectedTrafficIncrease}</p></div>
                  </div>
                  {contentDominanceResult.roadmap.months.map(m => (
                    <div key={m.month} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2"><h4 className="text-sm font-semibold">Month {m.month} — {m.label}</h4><div className="flex gap-1"><Badge variant="outline" className="text-[10px]">{m.pillarPages} pillars</Badge><Badge variant="secondary" className="text-[10px]">{m.clusterArticles} clusters</Badge></div></div>
                      <div className="space-y-1 mb-2">{m.tasks.map((t, i) => <div key={i} className="flex items-start gap-1 text-xs"><Zap className="h-3 w-3 mt-0.5 text-primary shrink-0" /><span>{t}</span></div>)}</div>
                      <div className="flex flex-wrap gap-2">{m.targets.map((t, i) => <span key={i} className="text-[10px] bg-muted px-2 py-1 rounded">{t.metric}: {t.current} → {t.target}</span>)}</div>
                    </div>
                  ))}
                  <div className="p-3 rounded-lg bg-muted"><p className="text-xs font-semibold mb-2">Authority Growth:</p><div className="flex items-end gap-2 h-16">{contentDominanceResult.roadmap.authorityGrowthCurve.map(p => <div key={p.month} className="flex flex-col items-center flex-1"><div className="w-full bg-primary/70 rounded-t" style={{ height: `${p.score}%` }} /><span className="text-[10px] text-muted-foreground mt-1">M{p.month}: {p.score}</span></div>)}</div></div>
                </div>
              </Section>

              {/* Needle Movers */}
              {contentDominanceResult.needleMovers.length > 0 && (
                <Section title="Needle Movers" badge={`${contentDominanceResult.needleMovers.length} queries`}>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">{contentDominanceResult.needleMovers.map((q, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded border"><span className="font-mono text-primary truncate max-w-[50%]">{q.query}</span><div className="flex gap-1"><Badge variant="outline" className="text-[10px]">Pos {Math.round(q.position)}</Badge><Badge variant="secondary" className="text-[10px]">{q.impressions} imp</Badge></div></div>
                  ))}</div>
                </Section>
              )}

              {/* System JSON */}
              <Section title="Content Dominance Report (JSON)">
                <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[300px]">{JSON.stringify(contentDominanceResult.systemSummary, null, 2)}</pre>
              </Section>
            </CardContent>
          )}
        </Card>

        {/* 🧠 INTELLIGENCE + COMPETITIVE DOMINATION + CONVERSION AMPLIFICATION */}
        <Card className={intelligenceEnabled ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-border'}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crosshair className="h-5 w-5 text-cyan-500" />
                <CardTitle className="text-sm font-semibold">Intelligence + Domination Stack</CardTitle>
                <Badge variant={intelligenceEnabled ? 'default' : 'secondary'} className="text-xs">
                  {intelligenceEnabled ? 'ACTIVE' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Intent + Gap + CRO</span>
                <Switch checked={intelligenceEnabled} onCheckedChange={(checked) => { setIntelligenceEnabled(checked); toast[checked ? 'success' : 'info'](checked ? '🧠 Intelligence Stack activated' : 'Intelligence Stack deactivated'); }} />
              </div>
            </div>
          </CardHeader>
          {intelligenceEnabled && intelligenceResult && (
            <CardContent className="pt-0 px-4 pb-4 space-y-4">
              {/* System Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard label="Real Queries" value={intelligenceResult.systemSummary.totalRealQueries} icon={Search} color="green" />
                <MetricCard label="Intent Match" value={`${intelligenceResult.systemSummary.intentMatchScore}%`} icon={Target} color="primary" />
                <MetricCard label="Quick Wins" value={intelligenceResult.systemSummary.quickWinKeywordCount} icon={Zap} color="amber" />
                <MetricCard label="Growth Status" value={intelligenceResult.systemSummary.enterpriseGrowthStatus} icon={Crown} color="blue" />
              </div>

              {/* Phase 1: Intent Modeling */}
              <Section title="Phase 1 — Search Intent Modeling" badge={`${intelligenceResult.intent.intentClustersDetected} clusters | ${intelligenceResult.intent.mismatchedPages} mismatches`} defaultOpen>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Intent Match Avg</p><p className="font-bold text-lg text-primary">{intelligenceResult.intent.intentMatchScoreAverage}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Commercial Density</p><p className="font-bold text-lg">{intelligenceResult.intent.commercialDensityIndex}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Mismatched Pages</p><p className="font-bold text-lg">{intelligenceResult.intent.mismatchedPages}</p></div>
                  </div>

                  <p className="text-xs font-semibold">Intent Distribution:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(intelligenceResult.intent.intentDistribution).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="text-[10px]">{k}: {v}</Badge>
                    ))}
                  </div>

                  {intelligenceResult.intent.clusters.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">Top Intent Clusters:</p>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {intelligenceResult.intent.clusters.slice(0, 8).map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                            <span className="font-mono text-primary truncate max-w-[35%]">{c.theme}</span>
                            <div className="flex gap-1">
                              <Badge variant="secondary" className="text-[10px]">{c.intent}</Badge>
                              <Badge variant="outline" className="text-[10px]">{c.queries.length} queries</Badge>
                              <Badge variant="outline" className="text-[10px]">{c.totalImpressions} imp</Badge>
                              <Badge variant="outline" className="text-[10px]">Pos {c.avgPosition}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {intelligenceResult.intent.pageMatches.filter(p => p.mismatch).length > 0 && (
                    <>
                      <p className="text-xs font-semibold">⚠️ Intent Mismatches:</p>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {intelligenceResult.intent.pageMatches.filter(p => p.mismatch).slice(0, 5).map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border border-destructive/30">
                            <span className="font-mono truncate max-w-[40%]">{p.page.replace('https://getpawsy.pet', '')}</span>
                            <div className="flex gap-1">
                              <Badge variant="destructive" className="text-[10px]">Score {p.matchScore}%</Badge>
                              <Badge variant="outline" className="text-[10px]">{p.reason.slice(0, 30)}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* Phase 2: Competitive Gap Scanner */}
              <Section title="Phase 2 — Competitive Gap Scanner" badge={`${intelligenceResult.competitive.competitorGapsDetected} gaps | ${intelligenceResult.competitive.quickWinTargets.length} quick wins`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Takeover Prob</p><p className="font-bold text-lg text-primary">{intelligenceResult.competitive.takeoverProbability}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Gap Priority</p><p className="font-bold text-lg">{intelligenceResult.competitive.gapPriorityIndex}/100</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Total Gaps</p><p className="font-bold text-lg">{intelligenceResult.competitive.competitorGapsDetected}</p></div>
                  </div>

                  <p className="text-xs font-semibold">Gap Categories:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(intelligenceResult.competitive.categoryBreakdown).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="text-[10px]">{k.replace('_', ' ')}: {v}</Badge>
                    ))}
                  </div>

                  {intelligenceResult.competitive.quickWinTargets.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">🎯 Quick Win Targets:</p>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {intelligenceResult.competitive.quickWinTargets.slice(0, 10).map((g, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                            <span className="font-mono text-primary truncate max-w-[40%]">{g.keyword}</span>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="text-[10px]">Pos {g.position}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{g.gapCategory.replace('_', ' ')}</Badge>
                              <Badge variant="outline" className="text-[10px]">Score {g.takeoverScore}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{g.impressions} imp</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {intelligenceResult.competitive.authorityExpansionTargets.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">📈 Authority Expansion:</p>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {intelligenceResult.competitive.authorityExpansionTargets.slice(0, 5).map((g, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                            <span className="font-mono truncate max-w-[40%]">{g.keyword}</span>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="text-[10px]">Pos {g.position}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{g.impressions} imp</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* Phase 3: Conversion Amplifier */}
              <Section title="Phase 3 — Conversion Amplification" badge={`CVR ${(intelligenceResult.conversion.currentConversionEstimate * 100).toFixed(1)}% → ${(intelligenceResult.conversion.optimizedConversionEstimate * 100).toFixed(1)}%`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Current CVR</p><p className="font-bold text-lg">{(intelligenceResult.conversion.currentConversionEstimate * 100).toFixed(2)}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Optimized CVR</p><p className="font-bold text-lg text-primary">{(intelligenceResult.conversion.optimizedConversionEstimate * 100).toFixed(2)}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Rev/1K Visitors</p><p className="font-bold text-lg">${intelligenceResult.conversion.revenuePer1000Visitors}</p></div>
                  </div>

                  <p className="text-xs font-semibold">Friction Points:</p>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {intelligenceResult.conversion.frictionPoints.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span className="truncate max-w-[35%]">{f.area}</span>
                        <div className="flex gap-1">
                          <Badge variant={f.severity === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">{f.severity}</Badge>
                          <span className="text-muted-foreground truncate max-w-[200px]">{f.fix.slice(0, 45)}...</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs font-semibold">Revenue Scenarios:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {intelligenceResult.conversion.scenarios.map((s, i) => (
                      <div key={i} className="p-2 rounded-lg bg-background border text-xs text-center">
                        <p className="text-muted-foreground">+{s.liftPct}% CVR</p>
                        <p className="font-bold text-primary">${s.revPer1000}/1K</p>
                        <p className="text-muted-foreground">+${s.monthlyRevDelta}/mo</p>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs font-semibold">CRO Actions:</p>
                  <div className="flex flex-wrap gap-1">
                    {intelligenceResult.conversion.croActions.map((a, i) => <Badge key={i} variant="outline" className="text-[10px]">{a.slice(0, 55)}</Badge>)}
                  </div>
                </div>
              </Section>

              {/* Projections */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">90-Day Traffic Lift</p>
                  <p className="font-semibold text-primary text-sm">{intelligenceResult.systemSummary.projectedTrafficLift90Days}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">90-Day Revenue Lift</p>
                  <p className="font-semibold text-primary text-sm">{intelligenceResult.systemSummary.projectedRevenueLift90Days}</p>
                </div>
              </div>

              <Section title="System Report (JSON)">
                <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[300px]">{JSON.stringify(intelligenceResult.systemSummary, null, 2)}</pre>
              </Section>
            </CardContent>
          )}
        </Card>

        {/* 💰 REVENUE + MARKET CAPTURE + ALGORITHM SHIELD */}
        <Card className={revenueEngineEnabled ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border'}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-emerald-500" />
                <CardTitle className="text-sm font-semibold">Revenue + Market Capture + Algorithm Shield</CardTitle>
                <Badge variant={revenueEngineEnabled ? 'default' : 'secondary'} className="text-xs">
                  {revenueEngineEnabled ? 'ENTERPRISE' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Full Stack</span>
                <Switch checked={revenueEngineEnabled} onCheckedChange={(checked) => { setRevenueEngineEnabled(checked); toast[checked ? 'success' : 'info'](checked ? '💰 Revenue + Market Capture Engine activated' : 'Revenue Engine deactivated'); }} />
              </div>
            </div>
          </CardHeader>
          {revenueEngineEnabled && revenueResult && (
            <CardContent className="pt-0 px-4 pb-4 space-y-4">
              {/* System Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard label="Real Queries" value={revenueResult.systemSummary.totalRealQueries} icon={Search} color="green" />
                <MetricCard label="90d Revenue" value={revenueResult.systemSummary.projected90DayRevenueLift} icon={TrendingUp} color="primary" />
                <MetricCard label="Authority" value={`${revenueResult.systemSummary.authorityGrowthIndex}%`} icon={Crown} color="amber" />
                <MetricCard label="Stability" value={`${revenueResult.systemSummary.algorithmStabilityIndex}%`} icon={Shield} color="blue" />
              </div>

              {/* Phase 1: Revenue Engine */}
              <Section title="Phase 1 — Autonomous Revenue Engine" badge={`${revenueResult.revenueEngine.seoRevenueTargets.length} targets | CVR ${revenueResult.revenueEngine.currentConversionEstimate}% → ${revenueResult.revenueEngine.optimizedConversionEstimate}%`} defaultOpen>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Rev/1K Visitors</p><p className="font-bold text-lg text-primary">${revenueResult.revenueEngine.revenuePer1000Visitors}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">AOV Lift</p><p className="font-bold text-lg">{revenueResult.revenueEngine.aovLiftEstimate}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">90d Revenue</p><p className="font-bold text-lg">{revenueResult.revenueEngine.projectedRevenueLift90Days}</p></div>
                  </div>

                  <p className="text-xs font-semibold">🎯 Top SEO Revenue Targets:</p>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {revenueResult.revenueEngine.seoRevenueTargets.slice(0, 10).map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span className="font-mono text-primary truncate max-w-[35%]">{t.query}</span>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[10px]">Pos {t.position}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{t.impressions} imp</Badge>
                          <Badge variant="outline" className="text-[10px]">+{t.projectedCtrLift}% CTR</Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs font-semibold">🔧 CRO Improvements:</p>
                  <div className="max-h-[150px] overflow-y-auto space-y-1">
                    {revenueResult.revenueEngine.croImprovements.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span className="truncate max-w-[50%]">{c.fix}</span>
                        <div className="flex gap-1">
                          <Badge variant={c.impact === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">{c.impact}</Badge>
                          <Badge variant="outline" className="text-[10px]">+{c.projectedLift}%</Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs font-semibold">📈 AOV Strategies:</p>
                  <div className="space-y-1">
                    {revenueResult.revenueEngine.aovStrategies.map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span>{a.strategy}</span>
                        <Badge variant="outline" className="text-[10px]">+{a.projectedAovLift}% AOV</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              {/* Phase 2: Market Capture */}
              <Section title="Phase 2 — 12-Month Market Capture" badge={`${revenueResult.marketCapture.categoryHubs.length} hubs | ${revenueResult.marketCapture.totalClusterArticles} articles | ${revenueResult.marketCapture.marketShareProbability}% market share`}>
                <div className="space-y-3">
                  <p className="text-xs font-semibold">Category Authority Hubs:</p>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {revenueResult.marketCapture.categoryHubs.map((h, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span className="font-mono text-primary">{h.category}</span>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[10px]">{h.pillarWordCount}w pillar</Badge>
                          <Badge variant="secondary" className="text-[10px]">{h.clusterArticles} articles</Badge>
                          <Badge variant="outline" className="text-[10px]">{h.queriesSupporting} queries</Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs font-semibold">Quarterly Roadmap:</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {revenueResult.marketCapture.quarterlyPhases.map((p, i) => (
                      <div key={i} className="p-2 rounded-lg bg-background border text-xs">
                        <p className="font-bold text-primary">{p.quarter}: {p.label}</p>
                        {p.targets.map((t, j) => <p key={j} className="text-muted-foreground text-[10px]">• {t}</p>)}
                      </div>
                    ))}
                  </div>

                  <p className="text-xs font-semibold">12-Month Forecast:</p>
                  <div className="max-h-[120px] overflow-y-auto">
                    <div className="grid grid-cols-6 gap-1">
                      {revenueResult.marketCapture.trafficForecast12Month.map((m, i) => (
                        <div key={i} className="p-1.5 rounded border text-center text-[10px]">
                          <p className="font-bold">M{m.month}</p>
                          <p className="text-muted-foreground">{(m.traffic / 1000).toFixed(1)}K</p>
                          <p className="text-primary">${(m.revenue / 1000).toFixed(1)}K</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              {/* Phase 3: Algorithm Shield */}
              <Section title="Phase 3 — Core Update Shield" badge={`Immunity ${revenueResult.algorithmShield.immunityIndex}% | Stability ${revenueResult.algorithmShield.algorithmStabilityScore}% | ${revenueResult.algorithmShield.volatilityDetected ? '⚠️ VOLATILE' : '✅ STABLE'}`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Immunity</p><p className="font-bold text-lg text-primary">{revenueResult.algorithmShield.immunityIndex}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Trust Score</p><p className="font-bold text-lg">{revenueResult.algorithmShield.trustSignalScore}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Content Depth</p><p className="font-bold text-lg">{revenueResult.algorithmShield.contentDepthIndex}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Stability</p><p className="font-bold text-lg">{revenueResult.algorithmShield.algorithmStabilityScore}%</p></div>
                  </div>

                  <p className="text-xs font-semibold">Early Signals:</p>
                  <div className="flex flex-wrap gap-1">
                    {revenueResult.algorithmShield.earlySignals.map((s, i) => (
                      <Badge key={i} variant={s.status === 'normal' ? 'secondary' : s.status === 'warning' ? 'outline' : 'destructive'} className="text-[10px]">
                        {s.signal}: {s.value}
                      </Badge>
                    ))}
                  </div>

                  <p className="text-xs font-semibold">Adaptive Actions:</p>
                  <div className="max-h-[120px] overflow-y-auto space-y-1">
                    {revenueResult.algorithmShield.adaptiveActions.map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span className="truncate max-w-[50%]">{a.action}</span>
                        <Badge variant={a.status === 'applied' ? 'destructive' : a.status === 'monitoring' ? 'outline' : 'secondary'} className="text-[10px]">{a.status}</Badge>
                      </div>
                    ))}
                  </div>

                  {revenueResult.algorithmShield.risks.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">⚠️ Risk Scanner ({revenueResult.algorithmShield.risks.length} items):</p>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {revenueResult.algorithmShield.risks.slice(0, 8).map((r, i) => (
                          <div key={i} className="text-xs p-1.5 rounded border">
                            <div className="flex items-center gap-1">
                              <Badge variant={r.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">{r.severity}</Badge>
                              <Badge variant="outline" className="text-[10px]">{r.type.replace('_', ' ')}</Badge>
                              <span className="text-muted-foreground truncate">{r.description.slice(0, 60)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* System JSON */}
              <Section title="System Report (JSON)">
                <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[300px]">{JSON.stringify(revenueResult.systemSummary, null, 2)}</pre>
              </Section>
            </CardContent>
          )}
        </Card>

        {/* 🔄 AUTONOMOUS SEO GROWTH AI LOOP */}
        <Card className={autonomousEnabled ? 'border-orange-500/50 bg-orange-500/5' : 'border-border'}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-sm font-semibold">Autonomous SEO Growth Loop</CardTitle>
                <Badge variant={autonomousEnabled ? 'default' : 'secondary'} className="text-xs">
                  {autonomousEnabled ? 'RUNNING' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Self-Improving AI</span>
                <Switch checked={autonomousEnabled} onCheckedChange={(checked) => { setAutonomousEnabled(checked); toast[checked ? 'success' : 'info'](checked ? '🔄 Autonomous SEO Loop activated' : 'Autonomous Loop deactivated'); }} />
              </div>
            </div>
          </CardHeader>
          {autonomousEnabled && autonomousResult && (
            <CardContent className="pt-0 px-4 pb-4 space-y-4">
              {/* System Status */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard label="Real Queries" value={autonomousResult.systemSummary.totalRealQueries} icon={Search} color="green" />
                <MetricCard label="Velocity Index" value={`${autonomousResult.systemSummary.rankingVelocityIndex}%`} icon={TrendingUp} color="primary" />
                <MetricCard label="Traffic Accel" value={autonomousResult.systemSummary.trafficAccelerationRate} icon={ArrowUp} color="amber" />
                <MetricCard label="Revenue Accel" value={autonomousResult.systemSummary.revenueAccelerationRate} icon={Zap} color="blue" />
              </div>

              {/* Module 1: Query Intelligence */}
              <Section title="Module 1 — Query Intelligence" badge={`${autonomousResult.queryIntelligence.newQueriesDetected} queries | ${autonomousResult.queryIntelligence.semanticClusters.length} clusters`} defaultOpen>
                <div className="space-y-3">
                  <p className="text-xs font-semibold">Intent Distribution:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(autonomousResult.queryIntelligence.intentDistribution).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="text-[10px]">{k.replace('_', ' ')}: {v}</Badge>
                    ))}
                  </div>

                  {autonomousResult.queryIntelligence.emergingTopicSignals.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">🚀 Emerging Topics:</p>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {autonomousResult.queryIntelligence.emergingTopicSignals.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                            <span className="font-mono text-primary">{s.topic}</span>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="text-[10px]">{s.queryCount} queries</Badge>
                              <Badge variant="secondary" className="text-[10px]">Pos {s.avgPosition}</Badge>
                              <Badge variant="outline" className="text-[10px]">{s.totalImpressions} imp</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <p className="text-xs font-semibold">Semantic Clusters:</p>
                  <div className="max-h-[150px] overflow-y-auto space-y-1">
                    {autonomousResult.queryIntelligence.semanticClusters.slice(0, 8).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span className="font-mono truncate max-w-[35%]">{c.theme}</span>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[10px]">{c.queries.length} q</Badge>
                          <Badge variant="secondary" className="text-[10px]">Pos {c.avgPos}</Badge>
                          <Badge variant="outline" className="text-[10px]">{c.impressions} imp</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              {/* Module 2: Opportunity Detector */}
              <Section title="Module 2 — Opportunity Detector" badge={`${autonomousResult.opportunityDetector.totalOpportunities} opportunities | ${autonomousResult.opportunityDetector.cannibalizationFlags.length} cannibal risks`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Yellow Zone</p><p className="font-bold text-lg text-primary">{autonomousResult.opportunityDetector.yellowZoneTargets.length}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Expansion</p><p className="font-bold text-lg">{autonomousResult.opportunityDetector.expansionTargets.length}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Breakout</p><p className="font-bold text-lg">{autonomousResult.opportunityDetector.breakoutCandidates.length}</p></div>
                  </div>

                  {autonomousResult.opportunityDetector.yellowZoneTargets.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">🎯 Yellow Zone (Pos 11-20):</p>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {autonomousResult.opportunityDetector.yellowZoneTargets.slice(0, 10).map((t, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                            <span className="font-mono text-primary truncate max-w-[40%]">{t.query}</span>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="text-[10px]">Pos {Math.round(t.position * 10) / 10}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{t.impressions} imp</Badge>
                              <Badge variant="outline" className="text-[10px]">Score {t.score}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {autonomousResult.opportunityDetector.cannibalizationFlags.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">⚠️ Cannibalization Risks:</p>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {autonomousResult.opportunityDetector.cannibalizationFlags.slice(0, 5).map((f, i) => (
                          <div key={i} className="text-xs p-1.5 rounded border border-destructive/30">
                            <div className="flex items-center gap-1">
                              <Badge variant={f.risk === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">{f.risk}</Badge>
                              <span className="font-mono">{f.query}</span>
                            </div>
                            <p className="text-muted-foreground mt-1">{f.pages.length} pages competing</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* Module 3: Safe Optimizer */}
              <Section title="Module 3 — Safe Optimization Executor" badge={`${autonomousResult.safeOptimizer.pagesOptimized} pages | +${autonomousResult.safeOptimizer.projectedCTRIncrease}% CTR`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Pages Optimized</p><p className="font-bold text-lg text-primary">{autonomousResult.safeOptimizer.pagesOptimized}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">CTR Increase</p><p className="font-bold text-lg">+{autonomousResult.safeOptimizer.projectedCTRIncrease}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Rank Lift</p><p className="font-bold text-lg">+{autonomousResult.safeOptimizer.projectedRankingLift} pos</p></div>
                  </div>

                  <p className="text-xs font-semibold">Optimization Types:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(autonomousResult.safeOptimizer.optimizationTypeBreakdown).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="text-[10px]">{k.replace('_', ' ')}: {v}</Badge>
                    ))}
                  </div>

                  <p className="text-xs font-semibold">Top Actions:</p>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {autonomousResult.safeOptimizer.actions.slice(0, 8).map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span className="truncate max-w-[40%]">{a.description.slice(0, 50)}...</span>
                        <div className="flex gap-1">
                          <Badge variant={a.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">{a.priority}</Badge>
                          <Badge variant="outline" className="text-[10px]">{a.type.replace('_', ' ')}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              {/* Module 4: Authority Reinforcer */}
              <Section title="Module 4 — Internal Authority Reinforcer" badge={`Authority ${autonomousResult.authorityReinforcer.internalAuthorityScore}% | ${autonomousResult.authorityReinforcer.orphanPagesRemaining} orphans`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Authority Score</p><p className="font-bold text-lg text-primary">{autonomousResult.authorityReinforcer.internalAuthorityScore}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Link Health</p><p className="font-bold text-lg">{autonomousResult.authorityReinforcer.linkGraphHealth}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Orphans</p><p className="font-bold text-lg">{autonomousResult.authorityReinforcer.orphanPagesRemaining}</p></div>
                  </div>

                  <p className="text-xs font-semibold">Click Depth:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(autonomousResult.authorityReinforcer.clickDepthDistribution).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="text-[10px]">{k.replace('_', ' ')}: {v}</Badge>
                    ))}
                  </div>

                  {autonomousResult.authorityReinforcer.linkRecommendations.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">Link Recommendations:</p>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {autonomousResult.authorityReinforcer.linkRecommendations.slice(0, 6).map((r, i) => (
                          <div key={i} className="text-xs p-1.5 rounded border">
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-[10px]">{r.anchorType}</Badge>
                              <span className="text-muted-foreground truncate">{r.reason.slice(0, 60)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* Module 5: Feedback Loop */}
              <Section title="Module 5 — Performance Feedback Loop" badge={`Success ${autonomousResult.feedbackLoop.optimizationSuccessRate}% | ${autonomousResult.feedbackLoop.rankingVelocityTrend}`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Success Rate</p><p className="font-bold text-lg text-primary">{autonomousResult.feedbackLoop.optimizationSuccessRate}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Velocity</p><p className="font-bold text-lg">{autonomousResult.feedbackLoop.rankingVelocityTrend}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Traffic Rate</p><p className="font-bold text-lg">{autonomousResult.feedbackLoop.trafficGrowthRate}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Commercial %</p><p className="font-bold text-lg">{autonomousResult.feedbackLoop.conversionGrowthRate}%</p></div>
                  </div>

                  <p className="text-xs font-semibold">Tactics Effectiveness:</p>
                  <div className="max-h-[150px] overflow-y-auto space-y-1">
                    {autonomousResult.feedbackLoop.tacticsEffectiveness.map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span>{t.tactic}</span>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[10px]">{t.successRate}% success</Badge>
                          <Badge variant="secondary" className="text-[10px]">+{t.avgLift} pos avg</Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  {autonomousResult.feedbackLoop.rollbackActions.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">⚠️ Rollback Candidates:</p>
                      <div className="max-h-[100px] overflow-y-auto space-y-1">
                        {autonomousResult.feedbackLoop.rollbackActions.slice(0, 5).map((r, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground p-1 border rounded">{r}</p>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* System Report */}
              <Section title="System Report (JSON)">
                <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[300px]">{JSON.stringify(autonomousResult.systemSummary, null, 2)}</pre>
              </Section>
            </CardContent>
          )}
        </Card>

        {/* 🛡️ ALGORITHM IMMUNITY + ZERO-CLICK + CATEGORY DOMINANCE */}
        <Card className={immunityEnabled ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border'}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-500" />
                <CardTitle className="text-sm font-semibold">Algorithm Immunity Stack</CardTitle>
                <Badge variant={immunityEnabled ? 'default' : 'secondary'} className="text-xs">
                  {immunityEnabled ? 'ACTIVE' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Immunity + Zero-Click + Category</span>
                <Switch checked={immunityEnabled} onCheckedChange={(checked) => { setImmunityEnabled(checked); toast[checked ? 'success' : 'info'](checked ? '🛡️ Algorithm Immunity Stack activated' : 'Immunity Stack deactivated'); }} />
              </div>
            </div>
          </CardHeader>
          {immunityEnabled && immunityResult && (
            <CardContent className="pt-0 px-4 pb-4 space-y-4">
              {/* System Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard label="Real Queries" value={immunityResult.systemSummary.totalRealQueries} icon={Search} color="green" />
                <MetricCard label="Immunity Index" value={immunityResult.systemSummary.updateImmunityIndex} icon={Shield} color="primary" />
                <MetricCard label="Snippet Score" value={immunityResult.systemSummary.snippetCaptureScore} icon={Eye} color="amber" />
                <MetricCard label="SEO Status" value={immunityResult.systemSummary.enterpriseSEOStatus} icon={Crown} color="blue" />
              </div>

              {/* Phase 1: Algorithm Immunity */}
              <Section title="Phase 1 — Algorithm Update Immunity" badge={`Index: ${immunityResult.immunity.updateImmunityIndex}/100`} defaultOpen>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Intent Precision</p><p className="font-bold text-lg text-primary">{immunityResult.immunity.intentPrecisionScore}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Pages to Merge</p><p className="font-bold text-lg">{immunityResult.immunity.pagesMerged}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Thin Eliminated</p><p className="font-bold text-lg">{immunityResult.immunity.thinContentEliminated}</p></div>
                  </div>

                  {immunityResult.immunity.contentPruningCandidates.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">Content Pruning Candidates:</p>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {immunityResult.immunity.contentPruningCandidates.slice(0, 10).map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                            <span className="font-mono truncate max-w-[40%]">{c.page.replace('https://getpawsy.pet', '')}</span>
                            <div className="flex gap-1">
                              <Badge variant={c.issue === 'thin' ? 'destructive' : 'secondary'} className="text-[10px]">{c.issue}</Badge>
                              <Badge variant="outline" className="text-[10px]">{c.action}</Badge>
                              <Badge variant="outline" className="text-[10px]">{c.totalImpressions} imp</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <p className="text-xs font-semibold">Trust Actions:</p>
                  <div className="flex flex-wrap gap-1">
                    {immunityResult.immunity.trustActions.map((a, i) => <Badge key={i} variant="outline" className="text-[10px]">{a.slice(0, 50)}</Badge>)}
                  </div>

                  <p className="text-xs font-semibold">Spam Prevention:</p>
                  <div className="flex flex-wrap gap-1">
                    {immunityResult.immunity.spamSignalsPrevented.map((s, i) => <Badge key={i} variant="secondary" className="text-[10px]">{s.slice(0, 55)}</Badge>)}
                  </div>
                </div>
              </Section>

              {/* Phase 2: Zero-Click */}
              <Section title="Phase 2 — Zero-Click Snippet Capture" badge={`${immunityResult.zeroClick.snippetBlocksCreated} targets | CTR +${immunityResult.zeroClick.ctrLiftProjection}%`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Snippet Targets</p><p className="font-bold text-lg text-primary">{immunityResult.zeroClick.snippetBlocksCreated}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Featured Prob</p><p className="font-bold text-lg">{immunityResult.zeroClick.featuredSnippetProbability}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Capture Score</p><p className="font-bold text-lg">{immunityResult.zeroClick.zeroClickCaptureScore}/100</p></div>
                  </div>

                  {immunityResult.zeroClick.snippetTargets.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">Snippet Targets:</p>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {immunityResult.zeroClick.snippetTargets.slice(0, 10).map((t, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                            <span className="font-mono text-primary truncate max-w-[40%]">{t.query}</span>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="text-[10px]">Pos {t.position}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{t.snippetType}</Badge>
                              <Badge variant="outline" className="text-[10px]">{Math.round(t.captureProb * 100)}% prob</Badge>
                              <Badge variant="secondary" className="text-[10px]">{t.impressions} imp</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {immunityResult.zeroClick.paaTargets.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">PAA Targets:</p>
                      <div className="flex flex-wrap gap-1">
                        {immunityResult.zeroClick.paaTargets.map((p, i) => <Badge key={i} variant="outline" className="text-[10px]">{p}</Badge>)}
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* Phase 3: Category Dominance */}
              <Section title="Phase 3 — Category Dominance" badge={`${immunityResult.categoryDominance.categoryHubsPlanned} hubs | ${immunityResult.categoryDominance.supportArticlesPlanned} articles`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Authority Score</p><p className="font-bold text-lg text-primary">{immunityResult.categoryDominance.categoryAuthorityScoreProjection}/100</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Internal Links</p><p className="font-bold text-lg">{immunityResult.categoryDominance.internalLinksAdded}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Revenue Bridge</p><p className="font-bold text-lg">{immunityResult.categoryDominance.revenueBridgeStrength}/100</p></div>
                  </div>

                  <p className="text-xs font-semibold">Category Hubs:</p>
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {immunityResult.categoryDominance.hubs.map((h, i) => (
                      <div key={i} className="p-2 rounded border text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-primary">{h.category}</span>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-[10px]">{h.realQueries.length} queries</Badge>
                            <Badge variant="secondary" className="text-[10px]">{h.totalImpressions} imp</Badge>
                            <Badge variant="outline" className="text-[10px]">Auth {h.authorityScore}</Badge>
                          </div>
                        </div>
                        <p className="text-muted-foreground truncate">Pillar: {h.pillarTitle.slice(0, 70)}...</p>
                        <p className="text-muted-foreground">{h.supportingArticles.length} supporting articles | {h.internalLinks.length} links</p>
                        <div className="flex gap-1 flex-wrap">
                          {h.supportingArticles.slice(0, 3).map((s, j) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">{s.type}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              {/* Projections */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">6-Month Traffic Lift</p>
                  <p className="font-semibold text-primary text-sm">{immunityResult.systemSummary.projected6MonthTrafficLift}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">6-Month Revenue Lift</p>
                  <p className="font-semibold text-primary text-sm">{immunityResult.systemSummary.projected6MonthRevenueLift}</p>
                </div>
              </div>

              <Section title="System Report (JSON)">
                <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[300px]">{JSON.stringify(immunityResult.systemSummary, null, 2)}</pre>
              </Section>
            </CardContent>
          )}
        </Card>

        {/* 🏢 ENTERPRISE EXPANSION STACK */}
        <Card className={enterpriseEnabled ? 'border-purple-500/50 bg-purple-500/5' : 'border-border'}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-purple-500" />
                <CardTitle className="text-sm font-semibold">Enterprise Expansion Stack</CardTitle>
                <Badge variant={enterpriseEnabled ? 'default' : 'secondary'} className="text-xs">
                  {enterpriseEnabled ? 'DEPLOYED' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Authority + E-E-A-T + 6M Forecast</span>
                <Switch checked={enterpriseEnabled} onCheckedChange={(checked) => { setEnterpriseEnabled(checked); toast[checked ? 'success' : 'info'](checked ? '🏢 Enterprise Expansion Stack deployed' : 'Enterprise Stack deactivated'); }} />
              </div>
            </div>
          </CardHeader>
          {enterpriseEnabled && enterpriseResult && (
            <CardContent className="pt-0 px-4 pb-4 space-y-4">
              {/* System Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard label="Real Queries" value={enterpriseResult.systemSummary.totalRealQueries} icon={Search} color="green" />
                <MetricCard label="Authority Index" value={enterpriseResult.systemSummary.authorityGrowthIndex} icon={Crown} color="primary" />
                <MetricCard label="Enterprise Ready" value={enterpriseResult.systemSummary.enterpriseReadinessLevel} icon={Shield} color="amber" />
                <MetricCard label="Clusters" value={enterpriseResult.authorityExpansion.clustersCreated} icon={Target} color="blue" />
              </div>

              {/* Phase 1: Authority Expansion */}
              <Section title="Phase 1 — Authority Expansion" badge={`${enterpriseResult.authorityExpansion.pillarPagesPlanned} pillars + ${enterpriseResult.authorityExpansion.supportingArticlesPlanned} articles`} defaultOpen>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Authority Score</p><p className="font-bold text-lg text-primary">{enterpriseResult.authorityExpansion.topicalAuthorityScoreProjection}/100</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Internal Links</p><p className="font-bold text-lg">{enterpriseResult.authorityExpansion.internalLinkExpansionCount}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Orphan Forecast</p><p className="font-semibold text-xs text-primary">{enterpriseResult.authorityExpansion.orphanReductionForecast.slice(0, 40)}</p></div>
                  </div>

                  <p className="text-xs font-semibold">Topical Clusters:</p>
                  <div className="max-h-[250px] overflow-y-auto space-y-2">
                    {enterpriseResult.authorityExpansion.clusters.map((c, i) => (
                      <div key={i} className="p-2 rounded border text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-primary">{c.name}</span>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-[10px]">{c.realQueries.length} queries</Badge>
                            <Badge variant="secondary" className="text-[10px]">{c.totalImpressions} imp</Badge>
                            <Badge variant="outline" className="text-[10px]">Avg pos {c.avgPosition}</Badge>
                          </div>
                        </div>
                        <p className="text-muted-foreground">Pillar: {c.pillar.title.slice(0, 60)}...</p>
                        <p className="text-muted-foreground">{c.supporting.length} supporting articles planned</p>
                        {c.competitorGaps.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            <span className="text-destructive font-medium">Gaps:</span>
                            {c.competitorGaps.slice(0, 3).map((g, j) => <Badge key={j} variant="destructive" className="text-[10px]">{g}</Badge>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {enterpriseResult.authorityExpansion.lowCompetitionTargets.length > 0 && (
                    <>
                      <p className="text-xs font-semibold">Low-Competition High-Impression Targets:</p>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {enterpriseResult.authorityExpansion.lowCompetitionTargets.map((t, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                            <span className="font-mono text-primary truncate max-w-[50%]">{t.query}</span>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="text-[10px]">Pos {t.position}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{t.impressions} imp</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* Phase 2: E-E-A-T */}
              <Section title="Phase 2 — E-E-A-T Reinforcement" badge={`${enterpriseResult.eeat.eeatScoreBefore} → ${enterpriseResult.eeat.eeatScoreAfter}`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {enterpriseResult.eeat.dimensions.map((d, i) => (
                      <div key={i} className="p-2 rounded-lg bg-background border text-xs text-center">
                        <p className="text-muted-foreground text-[10px]">{d.name}</p>
                        <p className="font-bold">{d.scoreBefore} → <span className="text-primary">{d.scoreAfter}</span></p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Authority Signal</p><p className="font-bold text-primary">{enterpriseResult.eeat.authoritySignalStrength}/100</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Brand Entity</p><p className="font-bold text-primary">{enterpriseResult.eeat.brandEntityConfidence}/100</p></div>
                  </div>

                  <p className="text-xs font-semibold">Trust Page Audit:</p>
                  <div className="space-y-1">
                    {enterpriseResult.eeat.trustPageAudit.map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span className="font-mono">{t.page}</span>
                        <Badge variant={t.status === 'exists' ? 'default' : t.status === 'missing' ? 'destructive' : 'secondary'} className="text-[10px]">{t.status}</Badge>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs font-semibold">Structured Data:</p>
                  <div className="flex flex-wrap gap-1">
                    {enterpriseResult.eeat.structuredDataRecommendations.map((r, i) => <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>)}
                  </div>
                </div>
              </Section>

              {/* Phase 3: Revenue Forecast */}
              <Section title="Phase 3 — 6-Month Revenue Forecast" badge={`$${enterpriseResult.revenueForecast.projectedRevenueMonth6}/mo target`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Monthly Clicks</p><p className="font-bold">{enterpriseResult.revenueForecast.currentMetrics.totalClicks}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Avg Position</p><p className="font-bold">{enterpriseResult.revenueForecast.currentMetrics.avgPosition}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Avg CTR</p><p className="font-bold">{enterpriseResult.revenueForecast.currentMetrics.avgCtr}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Est. Revenue</p><p className="font-bold">${enterpriseResult.revenueForecast.currentMetrics.estimatedMonthlyRevenue}/mo</p></div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b"><th className="p-1.5 text-left">Scenario</th><th className="p-1.5 text-right">M1 Traffic</th><th className="p-1.5 text-right">M3 Traffic</th><th className="p-1.5 text-right">M6 Traffic</th><th className="p-1.5 text-right">M6 Revenue</th><th className="p-1.5 text-right">ROI</th><th className="p-1.5 text-right">Content</th></tr></thead>
                      <tbody>
                        {Object.values(enterpriseResult.revenueForecast.scenarios).map((s, i) => (
                          <tr key={i} className="border-b"><td className="p-1.5 font-medium">{s.label}</td><td className="p-1.5 text-right">{s.trafficMonth1}</td><td className="p-1.5 text-right">{s.trafficMonth3}</td><td className="p-1.5 text-right font-semibold text-primary">{s.trafficMonth6}</td><td className="p-1.5 text-right font-semibold">${s.revenueMonth6}</td><td className="p-1.5 text-right">{s.roiMultiplier}x</td><td className="p-1.5 text-right">{s.contentRequired} pcs</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Break-Even</p><p className="font-bold">Month {enterpriseResult.revenueForecast.breakEvenMonth}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Rank Velocity</p><p className="font-bold text-primary">{enterpriseResult.revenueForecast.rankingVelocityScore} pos/mo</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Breakout Prob</p><p className="font-bold">{Math.round(enterpriseResult.revenueForecast.breakoutProbability * 100)}%</p></div>
                  </div>
                </div>
              </Section>

              {/* Projections */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">6-Month Traffic</p>
                  <p className="font-semibold text-primary text-sm">{enterpriseResult.systemSummary.sixMonthTrafficProjection}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">6-Month Revenue</p>
                  <p className="font-semibold text-primary text-sm">{enterpriseResult.systemSummary.sixMonthRevenueProjection}</p>
                </div>
              </div>

              <Section title="Enterprise Report (JSON)">
                <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[300px]">{JSON.stringify(enterpriseResult.systemSummary, null, 2)}</pre>
              </Section>
            </CardContent>
          )}
        </Card>

        {/* 🔥 GROWTH DOMINATION STACK */}
        <Card className={dominationEnabled ? 'border-orange-500/50 bg-orange-500/5' : 'border-border'}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-sm font-semibold">Growth Domination Stack</CardTitle>
                <Badge variant={dominationEnabled ? 'default' : 'secondary'} className="text-xs">
                  {dominationEnabled ? 'FULL STACK ACTIVE' : 'OFF'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Buyer Intent + Semantic + CRO</span>
                <Switch checked={dominationEnabled} onCheckedChange={(checked) => { setDominationEnabled(checked); toast[checked ? 'success' : 'info'](checked ? '🔥 Growth Domination Stack activated' : 'Growth Domination Stack deactivated'); }} />
              </div>
            </div>
          </CardHeader>
          {dominationEnabled && dominationResult && (
            <CardContent className="pt-0 px-4 pb-4 space-y-4">
              {/* System Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard label="Real Queries" value={dominationResult.systemSummary.totalRealQueries} icon={Search} color="green" />
                <MetricCard label="Total Impressions" value={dominationResult.systemSummary.totalImpressions.toLocaleString()} icon={Eye} color="blue" />
                <MetricCard label="Yellow Zone (Query)" value={dominationResult.yellowZoneQueryLevel.length} icon={Target} color="amber" />
                <MetricCard label="Commercial Visibility" value={`${dominationResult.buyerIntent.commercialVisibilityScore}%`} icon={TrendingUp} color="primary" />
              </div>

              <div className="p-3 rounded-lg border flex items-center justify-between" style={{ background: 'hsl(var(--primary) / 0.05)', borderColor: 'hsl(var(--primary) / 0.2)' }}>
                <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /><span className="text-sm font-medium">System: {dominationResult.systemSummary.systemIntegrity}</span></div>
                <div className="flex gap-1">
                  <Badge className="text-[10px]">Intent: {dominationResult.systemSummary.buyerIntentPush}</Badge>
                  <Badge className="text-[10px]">Semantic: {dominationResult.systemSummary.semanticMode}</Badge>
                  <Badge className="text-[10px]">CRO: {dominationResult.systemSummary.conversionLayer}</Badge>
                </div>
              </div>

              {/* Phase 1: Buyer Intent */}
              <Section title="Phase 1 — US Buyer-Intent Product Push" badge={`${dominationResult.buyerIntent.highIntentKeywords.length} targets`} defaultOpen>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Revenue Lift</p><p className="font-semibold text-primary">{dominationResult.buyerIntent.projectedRevenueLift}</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Optimized Products</p><p className="font-semibold text-primary">{dominationResult.buyerIntent.optimizedProducts.length} pages</p></div>
                  </div>
                  <p className="text-xs font-semibold">Top Buyer-Intent Keywords:</p>
                  <div className="max-h-[250px] overflow-y-auto space-y-1">
                    {dominationResult.buyerIntent.highIntentKeywords.slice(0, 15).map((kw, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 rounded border">
                        <span className="font-mono text-primary truncate max-w-[40%]">{kw.query}</span>
                        <div className="flex gap-1">
                          <Badge variant={kw.intent === 'transactional' ? 'destructive' : 'default'} className="text-[10px]">{kw.intent}</Badge>
                          <Badge variant="outline" className="text-[10px]">Pos {Math.round(kw.position)}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{kw.impressions} imp</Badge>
                          <Badge variant="outline" className="text-[10px]">Score: {kw.priorityScore}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  {dominationResult.buyerIntent.optimizedProducts.length > 0 && (
                    <>
                      <p className="text-xs font-semibold mt-2">Product Optimizations:</p>
                      {dominationResult.buyerIntent.optimizedProducts.slice(0, 5).map((prod, i) => (
                        <div key={i} className="p-2 rounded border text-xs space-y-1">
                          <p className="font-mono text-primary">{prod.page}</p>
                          <p><span className="font-medium">New Title:</span> {prod.titleRewrite.slice(0, 60)}</p>
                          <p className="text-muted-foreground">{prod.metaRewrite.slice(0, 120)}...</p>
                          <div className="flex gap-1 flex-wrap">
                            {prod.trustBlocks.map((t, j) => <Badge key={j} variant="outline" className="text-[10px]">{t}</Badge>)}
                            {prod.comparisonTable && <Badge variant="destructive" className="text-[10px]">+ Comparison Table</Badge>}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </Section>

              {/* Phase 2: Semantic NLP */}
              <Section title="Phase 2 — Semantic NLP Optimization" badge={`${dominationResult.semanticNlp.targets.length} URLs`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Coverage Before</p><p className="font-bold text-lg">{dominationResult.semanticNlp.semanticCoverageScoreBefore}/100</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Coverage After</p><p className="font-bold text-lg text-primary">{dominationResult.semanticNlp.semanticCoverageScoreAfter}/100</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Authority</p><p className="font-bold text-lg">{dominationResult.semanticNlp.authorityProjection}/100</p></div>
                  </div>
                  <p className="text-xs">Depth Increase: <span className="font-semibold text-primary">{dominationResult.semanticNlp.topicalDepthIncrease}</span></p>

                  {dominationResult.semanticNlp.cannibalizationFixes.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-destructive">⚠ Cannibalization Detected ({dominationResult.semanticNlp.cannibalizationFixes.length}):</p>
                      {dominationResult.semanticNlp.cannibalizationFixes.slice(0, 5).map((fix, i) => (
                        <div key={i} className="p-2 rounded bg-destructive/5 border border-destructive/20 text-xs">
                          <p className="font-mono">"{fix.query}" → {fix.pages.length} pages</p>
                          <p className="text-muted-foreground">{fix.resolution.slice(0, 120)}</p>
                        </div>
                      ))}
                    </>
                  )}

                  {dominationResult.semanticNlp.thinContentDetected.length > 0 && (
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs">
                      <p className="font-semibold">Thin Content ({dominationResult.semanticNlp.thinContentDetected.length} pages):</p>
                      {dominationResult.semanticNlp.thinContentDetected.slice(0, 5).map((url, i) => (
                        <p key={i} className="font-mono text-muted-foreground">{url}</p>
                      ))}
                    </div>
                  )}

                  <p className="text-xs font-semibold">Top Semantic Targets:</p>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {dominationResult.semanticNlp.targets.slice(0, 8).map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span className="font-mono truncate max-w-[45%]">{t.url}</span>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[10px]">{t.currentDepthScore} → {t.optimizedDepthScore}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{t.queries.length} queries</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              {/* Phase 3: Conversion */}
              <Section title="Phase 3 — Conversion Maximization" badge={`${dominationResult.conversion.optimizedConversionEstimate}% CVR target`}>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Current CVR</p><p className="font-bold text-lg">{dominationResult.conversion.currentConversionEstimate}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Target CVR</p><p className="font-bold text-lg text-primary">{dominationResult.conversion.optimizedConversionEstimate}%</p></div>
                    <div className="p-2 rounded-lg bg-background border text-xs"><p className="text-muted-foreground">Rev / 1k Visitors</p><p className="font-bold text-lg">${dominationResult.conversion.expectedRevenuePer1000Visitors}</p></div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-destructive mb-1">Friction Points ({dominationResult.conversion.frictionPoints.length}):</p>
                      {dominationResult.conversion.frictionPoints.map((f, i) => (
                        <div key={i} className="flex items-start gap-1 text-xs mb-1"><AlertTriangle className="h-3 w-3 mt-0.5 text-destructive shrink-0" /><span>{f}</span></div>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-primary mb-1">Improvements ({dominationResult.conversion.improvements.length}):</p>
                      {dominationResult.conversion.improvements.map((imp, i) => (
                        <div key={i} className="flex items-start gap-1 text-xs mb-1"><Zap className="h-3 w-3 mt-0.5 text-primary shrink-0" /><span>{imp}</span></div>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs font-semibold">Cross-Sell Funnels:</p>
                  <div className="flex flex-wrap gap-1">
                    {dominationResult.conversion.crossSellOpportunities.map((cs, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{cs}</Badge>
                    ))}
                  </div>
                </div>
              </Section>

              {/* Yellow Zone Query Level */}
              {dominationResult.yellowZoneQueryLevel.length > 0 && (
                <Section title="Yellow Zone (Query-Level)" badge={`${dominationResult.yellowZoneQueryLevel.length} queries pos 11-30`}>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {dominationResult.yellowZoneQueryLevel.map((q, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 rounded border">
                        <span className="font-mono text-primary truncate max-w-[50%]">{q.query}</span>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[10px]">Pos {Math.round(q.position)}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{q.impressions} imp</Badge>
                          <Badge variant="outline" className="text-[10px]">{q.clicks} clicks</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Authority Growth Curve */}
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs font-semibold mb-2">90-Day Authority Growth:</p>
                <div className="flex items-end gap-2 h-16">
                  {dominationResult.systemSummary.authorityGrowthCurve.map(p => (
                    <div key={p.month} className="flex flex-col items-center flex-1">
                      <div className="w-full bg-primary/70 rounded-t" style={{ height: `${p.score}%` }} />
                      <span className="text-[10px] text-muted-foreground mt-1">M{p.month}: {p.score}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Projections */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">90-Day Traffic Lift</p>
                  <p className="font-semibold text-primary text-sm">{dominationResult.systemSummary.projected90DayTrafficLift}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border text-xs">
                  <p className="text-muted-foreground">90-Day Revenue Lift</p>
                  <p className="font-semibold text-primary text-sm">{dominationResult.systemSummary.projected90DayRevenueLift}</p>
                </div>
              </div>

              {/* Full JSON */}
              <Section title="Growth Domination Report (JSON)">
                <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[300px]">{JSON.stringify(dominationResult.systemSummary, null, 2)}</pre>
              </Section>
            </CardContent>
          )}
        </Card>

        {result && (
          <Section title="Growth Acceleration Report (JSON)" defaultOpen>
            <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[400px]">
              {JSON.stringify({
                mode: 'GROWTH_ACCELERATION_V4',
                timestamp: new Date().toISOString(),
                orphanElimination: {
                  before: result.orphanElimination.totalOrphansBefore,
                  after: result.orphanElimination.totalOrphansAfter,
                  autoLinksGenerated: result.orphanElimination.totalInjectionsGenerated,
                  eliminationRate: result.report.orphanEliminationRate,
                  byType: result.orphanElimination.byType,
                },
                positionBoostV2: {
                  totalTargets: result.positionBoostV2.totalTargets,
                  avgCurrentPosition: result.positionBoostV2.avgCurrentPosition,
                  projectedAvgPosition: result.positionBoostV2.projectedAvgPosition,
                  topTargets: result.positionBoostV2.targets.slice(0, 10).map(t => ({
                    slug: t.slug, position: t.position, impressions: t.impressions, lift: t.estimatedLift,
                  })),
                },
                productRecovery: {
                  totalProducts: result.productRecovery.totalProducts,
                  avgCtrBefore: `${result.productRecovery.avgCtrBefore.toFixed(1)}%`,
                  projectedAvgCtr: `${result.productRecovery.projectedAvgCtr.toFixed(1)}%`,
                },
                pagesUpgraded: {
                  zeroClickAttacked: result.zeroClickAttack.length,
                  position1130Pushed: result.position1130.length,
                  positionBoostedV2: result.positionBoostV2.totalTargets,
                  ctrBoosted: result.ctrBoosts.length,
                  productSeoOptimized: result.productQuickWins.length,
                  productRecovered: result.productRecovery.totalProducts,
                },
                authorityHubs: result.authorityHubs.hubs.map(h => ({
                  name: h.name, slug: h.hubSlug, pages: h.clusterPages.length, inbound: h.inboundLinks,
                })),
                backlinkAssets: {
                  total: result.backlinkPrep.totalAssets,
                  avgScore: result.backlinkPrep.avgPriorityScore,
                  topAssets: backlinkResult?.assets.slice(0, 10).map(a => ({
                    slug: a.slug, score: a.priorityScore, position: a.position,
                  })) || [],
                },
                forecast: {
                  orphanReduction: result.report.orphanReductionForecast,
                  impressionGrowth: result.report.projectedImpressionGrowth,
                  traffic90Days: result.report.projectedTraffic90Days,
                  rankingLift: result.report.estimatedRankingLift,
                  ctrImprovement: result.report.projectedCtrImprovement,
                },
                gscIntegrity: {
                  matchRate: `${result.gscCorrection.matchRate}%`,
                  unmatchedFixed: result.gscCorrection.unmatchedRows,
                  byType: result.gscCorrection.byType,
                },
                redirectVerification: {
                  wwwRedirect: '302 (platform constraint — mitigated via canonical + sitemap)',
                  canonicalDomain: 'https://getpawsy.pet',
                  cachePolicy: 'HTML: no-store | Assets: immutable 1yr',
                },
                zones: zones?.summary || null,
              }, null, 2)}
            </pre>
          </Section>
        )}

        {!result && !isLoading && (
          <Card>
            <CardContent className="p-8 text-center">
              <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No GSC Data Available</h3>
              <p className="text-sm text-muted-foreground">
                Run a GSC sync from the SEO Command Center first to populate ranking data.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
