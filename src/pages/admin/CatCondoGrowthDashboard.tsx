import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, Crown, TrendingUp, Target, Eye, MousePointerClick,
  Zap, ShieldCheck, ExternalLink, ArrowUpRight, ArrowDownRight, Minus,
  BarChart3, FileText, Link2, Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Cat condo niche query filters
const NICHE_QUERIES = [
  'cat condo', 'cat condos', 'large cat condo', 'modern cat condo',
  'wooden cat condo', 'multi cat condo', 'cat condo vs cat tree',
  'cat condo for large cats', 'indoor cat condo', 'cat tree condo',
  'cat house condo', 'cat condos for sale', 'cat condo tree',
  'big cat condo', 'small cat condo', 'cat condo tower',
  'cat condo indoor', 'cat condo for heavy cats', 'cat condo for small apartments',
  'cat condo with scratching post', 'best cat condo',
];

const COLLECTION_URLS = [
  '/collections/cat-condos',
  '/collections/large-cat-condos',
  '/collections/modern-cat-condos',
  '/collections/multi-cat-condos',
  '/collections/wooden-cat-condos',
];

const PILLAR_URL = 'https://getpawsy.pet/collections/cat-condos';

interface GscRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
  sync_date: string;
}

const CatCondoGrowthDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch GSC data for cat condo queries
  const { data: gscData = [], isLoading: gscLoading } = useQuery({
    queryKey: ['cat-condo-gsc'],
    queryFn: async () => {
      // Build ILIKE conditions for all niche queries
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, position, ctr, sync_date')
        .or(NICHE_QUERIES.map(q => `query.ilike.%${q}%`).join(','))
        .order('impressions', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as GscRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch seo_collections for cat condos
  const { data: collections = [] } = useQuery({
    queryKey: ['cat-condo-collections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seo_collections')
        .select('slug, name, primary_keyword, is_active, product_keyword_filter')
        .in('slug', COLLECTION_URLS.map(u => u.replace('/collections/', '')))
        .order('display_order');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch indexing submissions for cat condo URLs
  const { data: indexingLogs = [] } = useQuery({
    queryKey: ['cat-condo-indexing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('indexing_submissions')
        .select('url, status, submitted_at')
        .or(COLLECTION_URLS.map(u => `url.ilike.%${u}%`).join(','))
        .order('submitted_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  // Analytics computations
  const analytics = useMemo(() => {
    if (!gscData.length) return null;

    // Deduplicate queries (take the highest-impression variant)
    const queryMap = new Map<string, GscRow>();
    gscData.forEach(row => {
      const key = row.query.toLowerCase().trim();
      const existing = queryMap.get(key);
      if (!existing || row.impressions > existing.impressions) {
        queryMap.set(key, row);
      }
    });
    const uniqueQueries = Array.from(queryMap.values());

    const totalImpressions = uniqueQueries.reduce((s, r) => s + r.impressions, 0);
    const totalClicks = uniqueQueries.reduce((s, r) => s + r.clicks, 0);
    const avgPosition = uniqueQueries.length > 0
      ? uniqueQueries.reduce((s, r) => s + r.position * r.impressions, 0) / Math.max(totalImpressions, 1)
      : 0;
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    // Position distribution
    const top5 = uniqueQueries.filter(r => r.position <= 5).length;
    const top10 = uniqueQueries.filter(r => r.position <= 10).length;
    const top20 = uniqueQueries.filter(r => r.position <= 20).length;
    const pos4to15 = uniqueQueries.filter(r => r.position >= 4 && r.position <= 15);
    const highImpLowCtr = uniqueQueries.filter(r => r.impressions >= 5 && r.ctr < 0.015);
    const newLongtails = uniqueQueries.filter(r => r.query.split(' ').length >= 4 && r.impressions >= 1);

    // Authority score (0-100)
    const posScore = Math.min(40, (top10 / Math.max(uniqueQueries.length, 1)) * 40 * 5);
    const impScore = Math.min(30, (totalImpressions / 10000) * 30);
    const coverageScore = Math.min(30, (collections.length / 5) * 30);
    const authorityScore = Math.round(posScore + impScore + coverageScore);

    // Opportunities
    const rankingPushOpportunities = pos4to15
      .filter(r => r.impressions >= 10)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    const ctrOpportunities = highImpLowCtr
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    const contentOpportunities = newLongtails
      .filter(r => !uniqueQueries.some(q => q.query !== r.query && r.query.includes(q.query) && q.position < 20))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    return {
      totalImpressions,
      totalClicks,
      avgPosition,
      avgCtr,
      top5,
      top10,
      top20,
      totalQueries: uniqueQueries.length,
      authorityScore,
      rankingPushOpportunities,
      ctrOpportunities,
      contentOpportunities,
      allQueries: uniqueQueries.sort((a, b) => b.impressions - a.impressions),
    };
  }, [gscData, collections]);

  const targets60Day = analytics ? {
    impressions10k: analytics.totalImpressions >= 10000,
    top5Keywords3: analytics.top5 >= 3,
    authorityScore80: analytics.authorityScore >= 80,
    avgPositionUnder30: analytics.avgPosition <= 30,
    ctrAbove2: analytics.avgCtr >= 2,
  } : null;

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, follow" />
        <title>Cat Condo Growth Loop | Admin</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Crown className="w-6 h-6 text-amber-500" />
              Cat Condo — Autonomous Growth Loop
            </h1>
            <p className="text-muted-foreground text-sm">
              Niche domination engine · Target: 10,000+ impressions in 60 days
            </p>
          </div>
        </div>

        {gscLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !analytics ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No GSC data found for cat condo queries. Run a GSC sync to populate data.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Authority Score
                  </div>
                  <div className="text-2xl font-bold text-primary">{analytics.authorityScore}</div>
                  <Progress value={analytics.authorityScore} className="h-1.5 mt-1" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Impressions
                  </div>
                  <div className="text-2xl font-bold">{analytics.totalImpressions.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">target: 10,000</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MousePointerClick className="w-3 h-3" /> Clicks
                  </div>
                  <div className="text-2xl font-bold">{analytics.totalClicks}</div>
                  <div className="text-xs text-muted-foreground">CTR: {analytics.avgCtr.toFixed(2)}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" /> Avg Position
                  </div>
                  <div className="text-2xl font-bold">{analytics.avgPosition.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">target: ≤30</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Top 10
                  </div>
                  <div className="text-2xl font-bold">{analytics.top10}</div>
                  <div className="text-xs text-muted-foreground">of {analytics.totalQueries} queries</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Target className="w-3 h-3" /> Top 5
                  </div>
                  <div className="text-2xl font-bold">{analytics.top5}</div>
                  <div className="text-xs text-muted-foreground">target: ≥3</div>
                </CardContent>
              </Card>
            </div>

            {/* 60-Day Targets */}
            {targets60Day && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    60-Day Domination Targets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                      { label: '10K+ Impressions', met: targets60Day.impressions10k },
                      { label: '3+ Keywords Top 5', met: targets60Day.top5Keywords3 },
                      { label: 'Authority Score ≥ 80', met: targets60Day.authorityScore80 },
                      { label: 'Avg Position ≤ 30', met: targets60Day.avgPositionUnder30 },
                      { label: 'CTR ≥ 2%', met: targets60Day.ctrAbove2 },
                    ].map(t => (
                      <div key={t.label} className="flex items-center gap-2 text-sm">
                        <div className={`w-3 h-3 rounded-full ${t.met ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                        <span>{t.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabbed Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Decision Engine</TabsTrigger>
                <TabsTrigger value="rankings">All Queries</TabsTrigger>
                <TabsTrigger value="collections">Collections</TabsTrigger>
                <TabsTrigger value="indexing">Indexing</TabsTrigger>
                <TabsTrigger value="rules">Growth Rules</TabsTrigger>
              </TabsList>

              {/* Decision Engine */}
              <TabsContent value="overview" className="space-y-6">
                {/* Ranking Push Opportunities */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      Ranking Push Targets (Pos 4–15, High Impressions)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.rankingPushOpportunities.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No queries in position 4-15 yet. Keep building authority.</p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.rankingPushOpportunities.map(q => (
                          <div key={q.query} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                            <div>
                              <span className="font-medium text-sm">{q.query}</span>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {q.impressions} imp · {q.clicks} clicks · CTR {(q.ctr * 100).toFixed(2)}%
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                Pos {q.position.toFixed(1)}
                              </Badge>
                              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                                → Expand +300w
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* CTR Recovery */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MousePointerClick className="w-4 h-4 text-blue-500" />
                      CTR Optimizer Targets (High Impressions, CTR &lt; 1.5%)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.ctrOpportunities.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No CTR recovery opportunities detected.</p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.ctrOpportunities.map(q => (
                          <div key={q.query} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                            <div>
                              <span className="font-medium text-sm">{q.query}</span>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {q.impressions} imp · CTR {(q.ctr * 100).toFixed(2)}%
                              </div>
                            </div>
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                              → Rewrite Title
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* New Content Ideas */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-green-500" />
                      New Longtail Content Opportunities
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.contentOpportunities.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No new longtail queries detected yet. Continue building impressions.</p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.contentOpportunities.map(q => (
                          <div key={q.query} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                            <div>
                              <span className="font-medium text-sm">{q.query}</span>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {q.impressions} imp · Pos {q.position.toFixed(1)}
                              </div>
                            </div>
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                              → Create Article
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* All Queries */}
              <TabsContent value="rankings">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">All Cat Condo Queries ({analytics.totalQueries})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Query</th>
                            <th className="text-right px-3 py-3 font-medium text-muted-foreground">Impressions</th>
                            <th className="text-right px-3 py-3 font-medium text-muted-foreground">Clicks</th>
                            <th className="text-right px-3 py-3 font-medium text-muted-foreground">CTR</th>
                            <th className="text-right px-3 py-3 font-medium text-muted-foreground">Position</th>
                            <th className="text-center px-3 py-3 font-medium text-muted-foreground">Zone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.allQueries.slice(0, 50).map(q => {
                            const zone = q.position <= 5 ? 'top5' :
                              q.position <= 10 ? 'top10' :
                              q.position <= 20 ? 'strike' :
                              q.position <= 50 ? 'build' : 'deep';
                            const zoneBadge = {
                              top5: <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Top 5</Badge>,
                              top10: <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Top 10</Badge>,
                              strike: <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">Strike Zone</Badge>,
                              build: <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">Building</Badge>,
                              deep: <Badge variant="outline" className="text-[10px]">Deep</Badge>,
                            }[zone];

                            return (
                              <tr key={`${q.query}-${q.page}`} className="border-b border-border/50 hover:bg-muted/20">
                                <td className="px-4 py-2.5 font-medium">{q.query}</td>
                                <td className="text-right px-3 py-2.5 font-mono text-xs">{q.impressions}</td>
                                <td className="text-right px-3 py-2.5 font-mono text-xs">{q.clicks}</td>
                                <td className="text-right px-3 py-2.5 font-mono text-xs">{(q.ctr * 100).toFixed(2)}%</td>
                                <td className="text-right px-3 py-2.5 font-mono text-xs">{q.position.toFixed(1)}</td>
                                <td className="text-center px-3 py-2.5">{zoneBadge}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Collections Status */}
              <TabsContent value="collections">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Link2 className="w-4 h-4" />
                      Collection Hub Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {collections.map(c => (
                        <div key={c.slug} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{c.name}</span>
                              {c.slug === 'cat-condos' && (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">Pillar</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              /{c.slug} · Keyword: {c.primary_keyword}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={c.is_active ? 'default' : 'outline'} className="text-[10px]">
                              {c.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <Link
                              to={`/collections/${c.slug}`}
                              className="text-muted-foreground hover:text-primary"
                              target="_blank"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 p-4 border border-dashed border-primary/30 rounded-lg">
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-1">
                        <Link2 className="w-4 h-4 text-primary" />
                        Internal Link Architecture
                      </h4>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>• All sub-collections link back to <code className="bg-muted px-1 rounded">/collections/cat-condos</code> (pillar)</p>
                        <p>• Pillar page links down to all 4 sub-category pages</p>
                        <p>• Breadcrumb hierarchy: Home → Cat Furniture → Cat Condos → [Sub-category]</p>
                        <p>• Internal linking engine auto-injects contextual links from blog posts</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Indexing Status */}
              <TabsContent value="indexing">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Indexing Submissions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {indexingLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No indexing submissions yet for cat condo URLs. URLs will be auto-submitted during the next pipeline run.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {indexingLogs.map(log => (
                          <div key={log.url + log.submitted_at} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                            <div>
                              <span className="font-medium text-sm">{new URL(log.url).pathname}</span>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {new Date(log.submitted_at).toLocaleDateString()}
                              </div>
                            </div>
                            <Badge variant={log.status === 'accepted' ? 'default' : 'outline'} className="text-[10px]">
                              {log.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Growth Rules */}
              <TabsContent value="rules">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                      Autonomous Growth Rules
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        { rule: 'Minimum 500 words per new page', status: 'enforced' },
                        { rule: 'No keyword stuffing (max 2% density)', status: 'enforced' },
                        { rule: 'No duplicate topics or cannibalization', status: 'enforced' },
                        { rule: 'Mobile performance ≥ 95', status: 'enforced' },
                        { rule: 'All new content links to pillar /collections/cat-condos', status: 'enforced' },
                        { rule: 'FAQ schema validated before deploy', status: 'enforced' },
                        { rule: 'No exact-match anchor repeated on same page', status: 'enforced' },
                        { rule: 'Content freeze after entering Snippet Zone', status: 'armed' },
                        { rule: 'Auto-rollback on ≥10% impression drop', status: 'armed' },
                        { rule: 'IndexNow submission on content update', status: 'active' },
                      ].map(r => (
                        <div key={r.rule} className="flex items-center justify-between">
                          <span className="text-sm">{r.rule}</span>
                          <Badge 
                            variant={r.status === 'enforced' ? 'default' : 'outline'}
                            className={`text-[10px] ${
                              r.status === 'enforced' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                              r.status === 'active' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                              'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {r.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </>
  );
};

export default CatCondoGrowthDashboard;
