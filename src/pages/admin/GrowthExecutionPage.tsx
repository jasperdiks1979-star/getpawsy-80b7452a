import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import {
  runGrowthEngineV3,
  type GrowthEngineV3Result,
} from '@/lib/seo-growth-engine-v3';
import { classifyRankingZones } from '@/lib/ranking-zones';
import { prepareBacklinkAssets, type BacklinkDominationResult } from '@/lib/backlink-domination';
import { toast } from 'sonner';

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

  // Process data through V3 engine
  const result: GrowthEngineV3Result | null = useMemo(() => {
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

    return runGrowthEngineV3(Array.from(slugMap.values()));
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
              SEO Growth Execution Layer
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              V3 Engine — Orphan eradication, position push, authority hubs & backlink prep
            </p>
          </div>
          {backlinkResult && (
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download className="h-4 w-4 mr-1" /> Export Backlink CSV
            </Button>
          )}
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard label="Total Pages" value={gscData?.length || 0} icon={Search} />
          <MetricCard label="Orphans" value={result?.orphanFix.totalOrphans || 0} icon={AlertTriangle} color="red" />
          <MetricCard label="Pos 11-30" value={result?.position1130.length || 0} icon={ArrowUp} color="amber" />
          <MetricCard label="Zero-Click" value={result?.ctrBoosts.length || 0} icon={MousePointerClick} color="red" />
          <MetricCard label="Product Wins" value={result?.productQuickWins.length || 0} icon={Package} color="blue" />
          <MetricCard label="Link Assets" value={backlinkResult?.totalAssets || 0} icon={Link} color="green" />
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
                  <p className="font-medium">{result.forecast.estimatedRankingLift90Days}</p>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-muted-foreground text-xs">CTR Improvement</p>
                  <p className="font-medium">{result.forecast.projectedCtrImprovement}</p>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-muted-foreground text-xs">Click Growth</p>
                  <p className="font-medium">{result.forecast.projectedClickGrowth}</p>
                </div>
              </div>
            </CardContent>
          </Card>
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

        {/* Phase 2: Position 11-30 Push */}
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

        {/* JSON Output */}
        {result && (
          <Section title="Phase 8 — Structured Growth Report (JSON)">
            <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[300px]">
              {JSON.stringify({
                orphanReductionForecast: {
                  current: result.orphanFix.totalOrphans,
                  target: Math.max(0, result.orphanFix.totalOrphans - Math.round(result.orphanFix.totalOrphans * 0.84)),
                  breakdown: result.orphanFix.breakdown,
                },
                projectedImpressionGrowth: '+35-50% in 90 days with orphan fix + internal linking',
                projectedTraffic90Days: result.forecast.projectedClickGrowth,
                quickWinURLList: result.position1130.slice(0, 10).map(p => p.slug),
                backlinkPriorityList: backlinkResult?.assets.slice(0, 10).map(a => ({
                  slug: a.slug, score: a.priorityScore, position: a.position
                })) || [],
                technicalFixSummary: {
                  orphansToFix: result.orphanFix.totalOrphans,
                  titlesToOptimize: result.position1130.length + result.ctrBoosts.length,
                  productSeoMissing: result.productQuickWins.length,
                  hubsCreated: result.authorityHubs.hubs.length,
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
