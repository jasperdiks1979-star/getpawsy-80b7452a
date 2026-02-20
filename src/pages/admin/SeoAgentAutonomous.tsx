import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, Brain, Crown, TrendingUp, Target, Eye, MousePointerClick,
  Zap, ShieldCheck, Sparkles, BarChart3, FileText, Link2, AlertTriangle,
  ArrowUpRight, Layers, Search, Bot
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { detectNiches, type GscQueryRow, type NicheCluster, type NicheDetectionReport } from '@/lib/seo-niche-engine';

const SeoAgentAutonomous = () => {
  const [activeTab, setActiveTab] = useState('niches');

  const { data: gscData = [], isLoading } = useQuery({
    queryKey: ['seo-agent-gsc-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, position, ctr, sync_date')
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as GscQueryRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: collections = [] } = useQuery({
    queryKey: ['seo-agent-collections'],
    queryFn: async () => {
      const { data } = await supabase
        .from('seo_collections')
        .select('slug, name, is_active, primary_keyword')
        .eq('is_active', true);
      return data || [];
    },
  });

  const report: NicheDetectionReport | null = useMemo(() => {
    if (!gscData.length) return null;
    return detectNiches(gscData);
  }, [gscData]);

  const topNiche = report?.activeNiche;

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Autonomous SEO Agent | Admin</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" />
              Autonomous SEO Agent
            </h1>
            <p className="text-muted-foreground text-sm">
              Self-learning niche detection · Data-driven expansion · Continuous optimization
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !report ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No GSC data available. Run a GSC sync to populate query data.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Active Expansion Niche Hero */}
            {topNiche && (
              <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
                <CardContent className="py-5 px-6">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-500" />
                        Active Expansion Niche
                      </div>
                      <h2 className="text-xl font-bold">{topNiche.niche.label}</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Growth Score: <span className="font-bold text-primary">{topNiche.growthScore}</span> · 
                        {topNiche.queries.length} queries · {topNiche.totalImpressions.toLocaleString()} impressions
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{topNiche.queriesInStrikeZone}</div>
                        <div className="text-[10px] text-muted-foreground">Strike Zone</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{topNiche.queriesTop5}</div>
                        <div className="text-[10px] text-muted-foreground">Top 5</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{topNiche.avgCtr.toFixed(1)}%</div>
                        <div className="text-[10px] text-muted-foreground">CTR</div>
                      </div>
                      <Badge
                        className={`text-xs ${topNiche.hasPillar
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}
                      >
                        {topNiche.hasPillar ? 'Pillar Active' : 'Needs Pillar'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard icon={Layers} label="Niches Detected" value={report.clusters.length} />
              <KpiCard icon={Search} label="Total Queries" value={gscData.length} />
              <KpiCard
                icon={Eye}
                label="Total Impressions"
                value={report.clusters.reduce((s, c) => s + c.totalImpressions, 0).toLocaleString()}
              />
              <KpiCard
                icon={Target}
                label="Strike Zone KWs"
                value={report.clusters.reduce((s, c) => s + c.queriesInStrikeZone, 0)}
              />
              <KpiCard
                icon={Sparkles}
                label="Emerging Niches"
                value={report.emergingNiches.length}
              />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="niches">Niche Rankings</TabsTrigger>
                <TabsTrigger value="expansion">Expansion Engine</TabsTrigger>
                <TabsTrigger value="emerging">Emerging Niches</TabsTrigger>
                <TabsTrigger value="rules">Agent Rules</TabsTrigger>
              </TabsList>

              {/* Niche Rankings */}
              <TabsContent value="niches" className="space-y-3">
                {report.clusters.map((cluster, i) => (
                  <NicheCard key={cluster.niche.id} cluster={cluster} rank={i + 1} isActive={i === 0} />
                ))}
              </TabsContent>

              {/* Expansion Engine Decisions */}
              <TabsContent value="expansion" className="space-y-5">
                {report.clusters.slice(0, 3).map(cluster => (
                  <ExpansionCard key={cluster.niche.id} cluster={cluster} collections={collections} />
                ))}
              </TabsContent>

              {/* Emerging Niches */}
              <TabsContent value="emerging">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      Emerging Niche Signals (Uncategorized Queries)
                    </CardTitle>
                    <CardDescription>
                      High-impression query clusters not matching any known niche — candidates for new expansion verticals.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {report.emergingNiches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No emerging niche signals detected yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {report.emergingNiches.map(e => (
                          <div key={e.keyword} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                            <span className="font-medium text-sm">{e.keyword}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{e.impressions} imp</span>
                              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                                Investigate
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 text-xs text-muted-foreground">
                      {report.uncategorized.length} uncategorized queries · {report.uncategorized.reduce((s, r) => s + r.impressions, 0)} total impressions
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Agent Rules */}
              <TabsContent value="rules">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                      Self-Learning Agent Rules
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { rule: 'Never create thin content (<600 words)', status: 'enforced' },
                        { rule: 'No keyword stuffing (max 2% density)', status: 'enforced' },
                        { rule: 'Prevent duplicate pillar creation (cannibalization check)', status: 'enforced' },
                        { rule: 'Validate JSON-LD before deployment', status: 'enforced' },
                        { rule: 'Prevent parameter URL indexing', status: 'enforced' },
                        { rule: 'Mobile performance ≥ 95', status: 'enforced' },
                        { rule: 'Canonical integrity preserved', status: 'enforced' },
                        { rule: 'No fake reviews or aggregate ratings', status: 'enforced' },
                        { rule: 'Auto-submit updated URLs via IndexNow', status: 'active' },
                        { rule: 'Retry failed index submissions after 24h', status: 'active' },
                        { rule: '14-day feedback loop: compare predicted vs actual lift', status: 'armed' },
                        { rule: 'Auto-adjust growth score weights every 14 days', status: 'armed' },
                        { rule: 'Consolidate/redirect weak pages on cannibalization detect', status: 'armed' },
                      ].map(r => (
                        <div key={r.rule} className="flex items-center justify-between">
                          <span className="text-sm">{r.rule}</span>
                          <Badge
                            variant="outline"
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

// ============= SUB-COMPONENTS =============

function KpiCard({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Icon className="w-3 h-3" /> {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function NicheCard({ cluster, rank, isActive }: { cluster: NicheCluster; rank: number; isActive: boolean }) {
  return (
    <Card className={isActive ? 'border-primary/30' : ''}>
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {rank}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{cluster.niche.label}</span>
                {isActive && (
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                    Active
                  </Badge>
                )}
                {cluster.hasPillar && (
                  <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">
                    Pillar ✓
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {cluster.queries.length} queries · {cluster.totalImpressions.toLocaleString()} imp ·
                Pos {cluster.avgPosition.toFixed(1)} · CTR {cluster.avgCtr.toFixed(2)}%
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <div className="font-bold text-primary">{cluster.growthScore}</div>
              <div className="text-[10px] text-muted-foreground">Score</div>
            </div>
            <div className="text-center">
              <div className="font-bold">{cluster.queriesInStrikeZone}</div>
              <div className="text-[10px] text-muted-foreground">4–15</div>
            </div>
            <div className="text-center">
              <div className="font-bold">{cluster.highImpLowCtr}</div>
              <div className="text-[10px] text-muted-foreground">CTR Gap</div>
            </div>
            <div className="text-center">
              <div className="font-bold">{cluster.longtailCount}</div>
              <div className="text-[10px] text-muted-foreground">Longtail</div>
            </div>
            <div className="w-24">
              <Progress value={cluster.growthScore} className="h-2" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpansionCard({ cluster, collections }: { cluster: NicheCluster; collections: any[] }) {
  const hasCollection = collections.some(c =>
    cluster.niche.pillarUrl?.includes(c.slug)
  );

  // Determine expansion actions
  const actions: { action: string; type: string }[] = [];

  if (!cluster.hasPillar && !hasCollection) {
    actions.push({ action: `Create 800–1200w pillar page for "${cluster.niche.label}"`, type: 'create' });
    actions.push({ action: 'Add FAQ schema + ProductCollection schema', type: 'create' });
    actions.push({ action: 'Build internal link blocks', type: 'create' });
  }

  if (cluster.queriesInStrikeZone > 0) {
    actions.push({ action: `Expand content +300 words for ${cluster.queriesInStrikeZone} strike-zone keywords`, type: 'expand' });
    actions.push({ action: 'Add 3 contextual internal links to pillar', type: 'link' });
  }

  if (cluster.highImpLowCtr > 0) {
    actions.push({ action: `Rewrite titles for ${cluster.highImpLowCtr} low-CTR pages`, type: 'ctr' });
    actions.push({ action: 'Improve meta descriptions with commercial hooks', type: 'ctr' });
  }

  if (cluster.longtailCount > 0) {
    actions.push({ action: `Generate ${Math.min(3, cluster.longtailCount)} supporting articles (600–900w each)`, type: 'content' });
    actions.push({ action: 'Submit new URLs for indexing', type: 'index' });
  }

  const typeColors: Record<string, string> = {
    create: 'bg-green-500/20 text-green-400 border-green-500/30',
    expand: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    ctr: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    content: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    link: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    index: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          {cluster.niche.label}
          <Badge variant="outline" className="text-[10px] font-mono">Score: {cluster.growthScore}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expansion actions needed — this niche is stable.</p>
        ) : (
          <div className="space-y-2">
            {actions.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <span className="text-sm">{a.action}</span>
                <Badge className={`text-[10px] ${typeColors[a.type] || ''}`}>
                  {a.type}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SeoAgentAutonomous;
