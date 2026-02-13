import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  AlertTriangle, CheckCircle2, RefreshCw,
  Shield, Zap, TrendingUp, Activity, Target, Gauge,
  Crosshair, Search, DollarSign, ListChecks, Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  generateMockCrawlMetrics, generateCrawlAlerts, calculateCrawlWasteScore,
  getMetricColor,
  type CrawlMetrics, type CrawlWasteScore, type CrawlAlert, type DuplicateUrlPattern,
} from '@/lib/crawl-diagnostics';
import {
  calculateAuthorityScore, calculateRankMomentum, generateHealingActions,
  calculateStability, generateMockAuthorityPages, generateMockRankPages,
  generateMockCommandCenterTrends,
  type AuthorityPageData, type AuthorityMetrics, type RankAccelerationPage,
  type RankAccelerationMetrics, type HealingAction, type CommandCenterTrend, type CommandCenterScores,
} from '@/lib/seo-command-center';
import {
  calculateTop10Metrics, calculateContentGapMetrics, calculateRevenueMetrics,
  generateActionQueue, generateMockTop10Pages, generateMockContentGaps, generateMockRevenuePages,
  type Top10AssaultPage, type Top10Metrics, type ContentGap, type ContentGapMetrics,
  type RevenuePageData, type RevenueMetrics, type GrowthScores, type ActionItem,
} from '@/lib/seo-growth-engine';

// ============= METRIC CARD =============
function MetricCard({ label, value, subtext, color }: {
  label: string; value: string | number; subtext: string;
  color: 'green' | 'yellow' | 'red' | 'gray';
}) {
  const cls = color === 'green' ? 'text-emerald-600 dark:text-emerald-400'
    : color === 'yellow' ? 'text-amber-600 dark:text-amber-400'
    : color === 'red' ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground';
  return (
    <Card className="min-w-0">
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-2xl font-bold ${cls} mt-1`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtext}</p>
      </CardContent>
    </Card>
  );
}

// ============= SCORE RING =============
function ScoreRing({ score, label, size = 100, severity }: {
  score: number; label: string; size?: number; severity: string;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const strokeColor = severity === 'healthy' || severity === 'strong' || severity === 'accelerating' || severity === 'scaling'
    ? 'hsl(var(--chart-2))' : severity === 'warning' || severity === 'moderate' || severity === 'steady' || severity === 'opportunity'
    ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none"
          stroke="hsl(var(--muted))" strokeWidth="8" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={strokeColor} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-2xl font-bold">{score}</span>
      </div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function getGrowthSeverity(score: number): string {
  return score >= 65 ? 'scaling' : score >= 40 ? 'opportunity' : 'leakage';
}
function getGrowthColor(score: number): 'green' | 'yellow' | 'red' {
  return score >= 65 ? 'green' : score >= 40 ? 'yellow' : 'red';
}

// ============= MAIN COMPONENT =============
export function SeoCommandCenter() {
  const [loading, setLoading] = useState(true);
  const [crawlMetrics, setCrawlMetrics] = useState<CrawlMetrics | null>(null);
  const [wasteScore, setWasteScore] = useState<CrawlWasteScore | null>(null);
  const [alerts, setAlerts] = useState<CrawlAlert[]>([]);
  const [authorityPages, setAuthorityPages] = useState<AuthorityPageData[]>([]);
  const [authorityMetrics, setAuthorityMetrics] = useState<AuthorityMetrics | null>(null);
  const [rankPages, setRankPages] = useState<RankAccelerationPage[]>([]);
  const [rankMetrics, setRankMetrics] = useState<RankAccelerationMetrics | null>(null);
  const [healingActions, setHealingActions] = useState<HealingAction[]>([]);
  const [trends, setTrends] = useState<CommandCenterTrend[]>([]);
  const [scores, setScores] = useState<CommandCenterScores | null>(null);
  // Growth Engine state
  const [top10Pages, setTop10Pages] = useState<Top10AssaultPage[]>([]);
  const [top10Metrics, setTop10Metrics] = useState<Top10Metrics | null>(null);
  const [contentGaps, setContentGaps] = useState<ContentGap[]>([]);
  const [gapMetrics, setGapMetrics] = useState<ContentGapMetrics | null>(null);
  const [revenuePages, setRevenuePages] = useState<RevenuePageData[]>([]);
  const [revMetrics, setRevMetrics] = useState<RevenueMetrics | null>(null);
  const [growthScores, setGrowthScores] = useState<GrowthScores | null>(null);
  const [actionQueue, setActionQueue] = useState<ActionItem[]>([]);

  const [duplicates] = useState<DuplicateUrlPattern[]>([
    { pattern: '?category=', count: 142, frequency: 'high', canonicalTarget: '/products', mismatchCount: 8 },
    { pattern: '?sort=', count: 87, frequency: 'medium', canonicalTarget: '/products', mismatchCount: 3 },
    { pattern: '?lang=', count: 23, frequency: 'low', canonicalTarget: null, mismatchCount: 5 },
    { pattern: '?utm_', count: 12, frequency: 'low', canonicalTarget: null, mismatchCount: 2 },
  ]);

  const loadData = async () => {
    setLoading(true);
    try {
      const cm = generateMockCrawlMetrics();
      const ws = calculateCrawlWasteScore(cm);
      const al = generateCrawlAlerts(cm);
      const ap = generateMockAuthorityPages();
      const am = calculateAuthorityScore(ap);
      const rp = generateMockRankPages();
      const rm = calculateRankMomentum(rp);
      const ha = generateHealingActions(cm);
      const tr = generateMockCommandCenterTrends();
      const stability = calculateStability(100 - ws.score, am.overallScore, rm.momentumScore);

      // Growth Engine data
      const t10 = generateMockTop10Pages();
      const t10m = calculateTop10Metrics(t10);
      const cg = generateMockContentGaps();
      const cgm = calculateContentGapMetrics(cg);
      const rv = generateMockRevenuePages();
      const rvm = calculateRevenueMetrics(rv);
      const aq = generateActionQueue(t10, cg, rv);
      const gs: GrowthScores = {
        rankingMomentum: t10m.assaultScore,
        contentExpansion: cgm.expansionScore,
        revenueLeverage: rvm.leverageScore,
      };

      setCrawlMetrics(cm); setWasteScore(ws); setAlerts(al);
      setAuthorityPages(ap); setAuthorityMetrics(am);
      setRankPages(rp); setRankMetrics(rm);
      setHealingActions(ha); setTrends(tr);
      setScores({ crawlHealth: 100 - ws.score, authorityStrength: am.overallScore, rankingMomentum: rm.momentumScore, stability });
      setTop10Pages(t10); setTop10Metrics(t10m);
      setContentGaps(cg); setGapMetrics(cgm);
      setRevenuePages(rv); setRevMetrics(rvm);
      setGrowthScores(gs); setActionQueue(aq);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const top20Push = useMemo(() =>
    rankPages.filter(p => p.pushPriority === 'high').sort((a, b) => a.avgPosition - b.avgPosition),
    [rankPages]
  );
  const assaultList = useMemo(() =>
    top10Pages.filter(p => p.isPriority).sort((a, b) => b.momentumScore - a.momentumScore).slice(0, 15),
    [top10Pages]
  );

  if (loading || !crawlMetrics || !wasteScore || !authorityMetrics || !rankMetrics || !scores || !top10Metrics || !gapMetrics || !revMetrics || !growthScores) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const stabilityColor = scores.stability === 'Stable' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
    : scores.stability === 'Growth Phase' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';

  const actionTypeIcon = (t: string) => {
    if (t === 'ranking_push') return <Crosshair className="h-3.5 w-3.5 text-red-500" />;
    if (t === 'content_expansion') return <Search className="h-3.5 w-3.5 text-blue-500" />;
    if (t === 'internal_link_boost') return <TrendingUp className="h-3.5 w-3.5 text-amber-500" />;
    return <DollarSign className="h-3.5 w-3.5 text-emerald-500" />;
  };

  const flagLabel = (f: string | null) => {
    if (f === 'high_traffic_low_conv') return { text: 'High Traffic / Low Conv', variant: 'destructive' as const };
    if (f === 'low_traffic_high_conv') return { text: 'Hidden Gem', variant: 'default' as const };
    if (f === 'top_revenue_low_vis') return { text: 'Revenue / Low Vis', variant: 'secondary' as const };
    if (f === 'high_vis_zero_clicks') return { text: 'Zero Clicks', variant: 'destructive' as const };
    return null;
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">SEO Command Center</h1>
          <p className="text-sm text-muted-foreground">Crawl · Authority · Ranking · Growth · Revenue</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={stabilityColor}>{scores.stability}</Badge>
          <Button onClick={loadData} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Score Rings — 7 scores */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-4">
            <div className="flex flex-col items-center relative">
              <ScoreRing score={scores.crawlHealth} label="Crawl" severity={wasteScore.severity === 'healthy' ? 'healthy' : wasteScore.severity} size={80} />
            </div>
            <div className="flex flex-col items-center relative">
              <ScoreRing score={scores.authorityStrength} label="Authority" severity={authorityMetrics.severity} size={80} />
            </div>
            <div className="flex flex-col items-center relative">
              <ScoreRing score={scores.rankingMomentum} label="Momentum" severity={rankMetrics.severity} size={80} />
            </div>
            <div className="flex flex-col items-center relative">
              <ScoreRing score={growthScores.rankingMomentum} label="Rank Push" severity={getGrowthSeverity(growthScores.rankingMomentum)} size={80} />
            </div>
            <div className="flex flex-col items-center relative">
              <ScoreRing score={growthScores.contentExpansion} label="Content" severity={getGrowthSeverity(growthScores.contentExpansion)} size={80} />
            </div>
            <div className="flex flex-col items-center relative">
              <ScoreRing score={growthScores.revenueLeverage} label="Revenue" severity={getGrowthSeverity(growthScores.revenueLeverage)} size={80} />
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center h-[80px]">
                <div className="text-center">
                  <Activity className={`h-8 w-8 mx-auto mb-1 ${scores.stability === 'Stable' ? 'text-emerald-500' : scores.stability === 'Growth Phase' ? 'text-blue-500' : 'text-red-500'}`} />
                  <span className="text-sm font-bold">{scores.stability}</span>
                </div>
              </div>
              <span className="text-xs font-medium text-muted-foreground">Stability</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 3).map(a => (
            <Alert key={a.id} variant={a.severity === 'critical' ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">{a.title}</AlertTitle>
              <AlertDescription className="text-xs">{a.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Tabbed Sections */}
      <Tabs defaultValue="top10" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="top10" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <Crosshair className="h-3.5 w-3.5 hidden sm:block" /> Top 10
          </TabsTrigger>
          <TabsTrigger value="gaps" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <Search className="h-3.5 w-3.5 hidden sm:block" /> Gaps
          </TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <DollarSign className="h-3.5 w-3.5 hidden sm:block" /> Revenue
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <ListChecks className="h-3.5 w-3.5 hidden sm:block" /> Actions
          </TabsTrigger>
          <TabsTrigger value="crawl" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <Gauge className="h-3.5 w-3.5 hidden sm:block" /> Crawl
          </TabsTrigger>
          <TabsTrigger value="authority" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <Shield className="h-3.5 w-3.5 hidden sm:block" /> Auth
          </TabsTrigger>
          <TabsTrigger value="healing" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <Zap className="h-3.5 w-3.5 hidden sm:block" /> Heal
          </TabsTrigger>
          <TabsTrigger value="trends" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <TrendingUp className="h-3.5 w-3.5 hidden sm:block" /> Trends
          </TabsTrigger>
        </TabsList>

        {/* ========== TOP 10 ASSAULT ========== */}
        <TabsContent value="top10" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Assault Score" value={top10Metrics.assaultScore} subtext={getGrowthSeverity(top10Metrics.assaultScore)} color={getGrowthColor(top10Metrics.assaultScore)} />
            <MetricCard label="Priority Pages" value={top10Metrics.priorityPages} subtext={`of ${top10Metrics.totalTracked} tracked`} color={top10Metrics.priorityPages > 5 ? 'green' : 'yellow'} />
            <MetricCard label="Avg Position" value={top10Metrics.avgPositionAll} subtext="across all tracked" color={top10Metrics.avgPositionAll < 15 ? 'green' : 'yellow'} />
            <MetricCard label="Schema Coverage" value={`${top10Metrics.pagesWithSchema}/${top10Metrics.totalTracked}`} subtext={`${top10Metrics.pagesWithoutSchema} missing`} color={top10Metrics.pagesWithoutSchema > 3 ? 'red' : 'green'} />
          </div>

          {/* Assault List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Crosshair className="h-4 w-4" /> Top 10 Assault List
              </CardTitle>
              <CardDescription className="text-xs">Priority pages for Top 10 push (pos 5–20, imp&gt;50)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {assaultList.map(p => (
                <div key={p.url} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs truncate">{p.url}</p>
                      <p className="text-[11px] text-muted-foreground">"{p.keyword}"</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-bold ${p.momentumScore >= 70 ? 'text-emerald-600' : p.momentumScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {p.momentumScore}
                      </span>
                      {!p.hasSchema && <Badge variant="outline" className="text-[9px]">No Schema</Badge>}
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-[11px]">
                    <div><span className="text-muted-foreground">Pos:</span> <span className="font-bold">{p.avgPosition.toFixed(1)}</span></div>
                    <div><span className="text-muted-foreground">Imp:</span> <span className="font-bold">{p.impressions}</span></div>
                    <div><span className="text-muted-foreground">CTR:</span> <span className={`font-bold ${p.ctr < 2 ? 'text-red-600' : ''}`}>{p.ctr}%</span></div>
                    <div><span className="text-muted-foreground">Links:</span> <span className="font-bold">{p.internalLinks}</span></div>
                    <div><span className="text-muted-foreground">Words:</span> <span className="font-bold">{p.wordCount.toLocaleString()}</span></div>
                  </div>
                  {p.boostRecommendations.length > 0 && (
                    <div className="pt-1 border-t space-y-1">
                      {p.boostRecommendations.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px]">
                          <Badge variant={r.impact === 'high' ? 'destructive' : 'outline'} className="text-[9px] flex-shrink-0">{r.impact}</Badge>
                          <span className="text-muted-foreground">{r.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== CONTENT GAP HUNTER ========== */}
        <TabsContent value="gaps" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Expansion Score" value={gapMetrics.expansionScore} subtext={getGrowthSeverity(gapMetrics.expansionScore)} color={getGrowthColor(gapMetrics.expansionScore)} />
            <MetricCard label="Total Gaps" value={gapMetrics.totalGaps} subtext="opportunities found" color="gray" />
            <MetricCard label="New Pages" value={gapMetrics.newPageCandidates} subtext="candidates" color={gapMetrics.newPageCandidates > 5 ? 'red' : 'yellow'} />
            <MetricCard label="FAQ Gaps" value={gapMetrics.faqGaps} subtext="missing FAQ clusters" color={getMetricColor(gapMetrics.faqGaps, { healthy: 2, warning: 4 })} />
          </div>

          {/* Gaps grouped by category */}
          {['Cat Trees', 'Dog Beds', 'Cat Litter', 'Dog Activities'].map(cat => {
            const catGaps = contentGaps.filter(g => g.category === cat);
            if (catGaps.length === 0) return null;
            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{cat} — {catGaps.length} Gaps</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {catGaps.map(g => (
                    <div key={g.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className="text-[9px]">{g.type.replace(/_/g, ' ')}</Badge>
                            <Badge variant={g.action === 'new_page' ? 'destructive' : g.action === 'expand' ? 'secondary' : 'outline'} className="text-[9px]">
                              {g.action.replace('_', ' ')}
                            </Badge>
                            <Badge variant={g.priority === 'high' ? 'destructive' : 'secondary'} className="text-[9px]">{g.priority}</Badge>
                          </div>
                          <p className="text-sm font-medium">{g.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold">{g.impressions > 0 ? `${g.impressions} imp` : '—'}</p>
                          <p className="text-[10px] text-muted-foreground">{g.searchVolume > 0 ? `~${g.searchVolume} vol` : ''}</p>
                        </div>
                      </div>
                      {g.relatedKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {g.relatedKeywords.map(k => (
                            <span key={k} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{k}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ========== REVENUE INTELLIGENCE ========== */}
        <TabsContent value="revenue" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Revenue Score" value={revMetrics.leverageScore} subtext={getGrowthSeverity(revMetrics.leverageScore)} color={getGrowthColor(revMetrics.leverageScore)} />
            <MetricCard label="Est. Revenue" value={`$${revMetrics.totalEstRevenue.toLocaleString()}`} subtext="tracked products" color="gray" />
            <MetricCard label="Avg Conv Rate" value={`${revMetrics.avgConvRate}%`} subtext="across products" color={revMetrics.avgConvRate >= 2.5 ? 'green' : 'yellow'} />
            <MetricCard label="Flagged Issues" value={revMetrics.highTrafficLowConv + revMetrics.highVisZeroClicks} subtext="need attention" color={getMetricColor(revMetrics.highTrafficLowConv + revMetrics.highVisZeroClicks, { healthy: 2, warning: 4 })} />
          </div>

          {/* Flagged pages first */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Flame className="h-4 w-4" /> Revenue Priority Flags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {revenuePages.filter(p => p.flag).map(p => {
                  const fl = flagLabel(p.flag);
                  return (
                    <div key={p.url} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs truncate">{p.url}</p>
                          <p className="text-[11px] text-muted-foreground">{p.category} · "{p.keyword}"</p>
                        </div>
                        {fl && <Badge variant={fl.variant} className="text-[9px] flex-shrink-0">{fl.text}</Badge>}
                      </div>
                      <div className="grid grid-cols-5 gap-2 text-[11px] mt-2">
                        <div><span className="text-muted-foreground">Pos:</span> <span className="font-bold">{p.avgPosition.toFixed(1)}</span></div>
                        <div><span className="text-muted-foreground">Clicks:</span> <span className="font-bold">{p.clicks}</span></div>
                        <div><span className="text-muted-foreground">CTR:</span> <span className="font-bold">{p.ctr}%</span></div>
                        <div><span className="text-muted-foreground">Conv:</span> <span className={`font-bold ${p.conversionRate < 1 ? 'text-red-600' : ''}`}>{p.conversionRate}%</span></div>
                        <div><span className="text-muted-foreground">Rev:</span> <span className="font-bold">${p.revenue}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Full table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">All Product Pages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2">URL</th>
                    <th className="text-center py-2 px-2">Pos</th>
                    <th className="text-center py-2 px-2">Imp</th>
                    <th className="text-center py-2 px-2">CTR</th>
                    <th className="text-center py-2 px-2">Links</th>
                    <th className="text-center py-2 px-2">Conv%</th>
                    <th className="text-center py-2 px-2">Rev</th>
                  </tr></thead>
                  <tbody>
                    {revenuePages.sort((a, b) => b.revenue - a.revenue).map(p => (
                      <tr key={p.url} className="border-b">
                        <td className="py-2 px-2 font-mono text-[11px] max-w-[150px] truncate">{p.url}</td>
                        <td className="text-center py-2 px-2 font-bold">{p.avgPosition.toFixed(1)}</td>
                        <td className="text-center py-2 px-2">{p.impressions}</td>
                        <td className={`text-center py-2 px-2 ${p.ctr < 2 ? 'text-red-600' : ''}`}>{p.ctr}%</td>
                        <td className="text-center py-2 px-2">{p.internalLinks}</td>
                        <td className={`text-center py-2 px-2 ${p.conversionRate < 1 ? 'text-red-600 font-bold' : ''}`}>{p.conversionRate}%</td>
                        <td className="text-center py-2 px-2 font-bold">${p.revenue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== ACTION QUEUE ========== */}
        <TabsContent value="actions" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> Weekly Action Queue
              </CardTitle>
              <CardDescription className="text-xs">
                8 prioritized actions — manual approval required before execution
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {actionQueue.map(a => (
                <div key={a.id} className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{actionTypeIcon(a.type)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-[9px]">{a.type.replace(/_/g, ' ')}</Badge>
                        <Badge variant={a.priority === 'high' ? 'destructive' : 'secondary'} className="text-[9px]">{a.priority}</Badge>
                      </div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{a.targetUrl}</span>
                        <span className="text-[10px] text-emerald-600 font-medium">↑ {a.expectedImpact}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">Pending</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== CRAWL DIAGNOSTICS ========== */}
        <TabsContent value="crawl" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Indexed Pages" value={crawlMetrics.totalIndexedPages.toLocaleString()} subtext={`${crawlMetrics.indexedCrawledRatio.toFixed(1)}% ratio`} color={getMetricColor(crawlMetrics.indexedCrawledRatio, { healthy: 70, warning: 60 })} />
            <MetricCard label="Crawled (30d)" value={crawlMetrics.totalCrawledPages.toLocaleString()} subtext="total crawls" color="gray" />
            <MetricCard label="Duplicates" value={`${crawlMetrics.duplicateUrlPercentage.toFixed(1)}%`} subtext={`${Math.round(crawlMetrics.totalCrawledPages * crawlMetrics.duplicateUrlPercentage / 100)} URLs`} color={getMetricColor(crawlMetrics.duplicateUrlPercentage, { healthy: 3, warning: 5 })} />
            <MetricCard label="Orphans" value={crawlMetrics.orphanPageCount} subtext="no inbound links" color={getMetricColor(crawlMetrics.orphanPageCount, { healthy: 5, warning: 10 })} />
            <MetricCard label="Waste Score" value={`${wasteScore.score}/100`} subtext={wasteScore.severity} color={wasteScore.severity === 'healthy' ? 'green' : wasteScore.severity === 'warning' ? 'yellow' : 'red'} />
          </div>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Parameter & Duplicate Patterns</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2">Pattern</th>
                    <th className="text-center py-2 px-2">Crawls</th>
                    <th className="text-center py-2 px-2">Frequency</th>
                    <th className="text-center py-2 px-2">Canonical</th>
                    <th className="text-center py-2 px-2">Mismatches</th>
                  </tr></thead>
                  <tbody>
                    {duplicates.map(d => (
                      <tr key={d.pattern} className="border-b">
                        <td className="py-2 px-2 font-mono">{d.pattern}</td>
                        <td className="text-center py-2 px-2">{d.count}</td>
                        <td className="text-center py-2 px-2"><Badge variant={d.frequency === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">{d.frequency}</Badge></td>
                        <td className="text-center py-2 px-2 font-mono text-[11px]">{d.canonicalTarget || '—'}</td>
                        <td className="text-center py-2 px-2"><span className={d.mismatchCount > 3 ? 'text-red-600 font-bold' : ''}>{d.mismatchCount}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== AUTHORITY ========== */}
        <TabsContent value="authority" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Authority Score" value={authorityMetrics.overallScore} subtext={authorityMetrics.severity} color={authorityMetrics.severity === 'strong' ? 'green' : authorityMetrics.severity === 'moderate' ? 'yellow' : 'red'} />
            <MetricCard label="Avg Inbound" value={authorityMetrics.avgInboundLinks} subtext="links per page" color={authorityMetrics.avgInboundLinks >= 4 ? 'green' : 'yellow'} />
            <MetricCard label="Guides <4 Links" value={authorityMetrics.guidesBelow4Links} subtext="need boost" color={getMetricColor(authorityMetrics.guidesBelow4Links, { healthy: 2, warning: 5 })} />
            <MetricCard label="Products <2 Links" value={authorityMetrics.productsBelow2Links} subtext="need boost" color={getMetricColor(authorityMetrics.productsBelow2Links, { healthy: 3, warning: 8 })} />
          </div>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Tier Coverage</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Tier 1 (Pillars)', value: authorityMetrics.tier1Coverage, target: '≥8 links' },
                { label: 'Tier 2 (Products)', value: authorityMetrics.tier2Coverage, target: '≥2 links' },
                { label: 'Tier 3 (Support)', value: authorityMetrics.tier3Coverage, target: '≥4 links' },
              ].map(t => (
                <div key={t.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{t.label}</span>
                    <span className="font-bold">{t.value}% <span className="text-muted-foreground font-normal">({t.target})</span></span>
                  </div>
                  <Progress value={t.value} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Page Authority Map</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2">URL</th>
                    <th className="text-center py-2 px-2">Tier</th>
                    <th className="text-center py-2 px-2">Inbound</th>
                    <th className="text-center py-2 px-2">Depth</th>
                    <th className="text-center py-2 px-2">Score</th>
                    <th className="text-center py-2 px-2">Status</th>
                  </tr></thead>
                  <tbody>
                    {authorityPages.sort((a, b) => b.authorityScore - a.authorityScore).map(p => (
                      <tr key={p.url} className="border-b">
                        <td className="py-2 px-2 font-mono text-[11px] max-w-[200px] truncate">{p.url}</td>
                        <td className="text-center py-2 px-2"><Badge variant="outline" className="text-[10px]">T{p.tier}</Badge></td>
                        <td className="text-center py-2 px-2 font-bold">{p.inboundLinks}</td>
                        <td className="text-center py-2 px-2">{p.crawlDepth}</td>
                        <td className="text-center py-2 px-2">
                          <span className={p.authorityScore >= 60 ? 'text-emerald-600' : p.authorityScore >= 35 ? 'text-amber-600' : 'text-red-600'}>{p.authorityScore}</span>
                        </td>
                        <td className="text-center py-2 px-2">
                          {p.isOrphan ? <Badge variant="destructive" className="text-[10px]">Orphan</Badge> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== SELF-HEALING ========== */}
        <TabsContent value="healing" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> Self-Healing Action Queue</CardTitle>
              <CardDescription className="text-xs">Recommended optimizations — no automatic changes without approval</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {healingActions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  No healing actions needed
                </p>
              ) : healingActions.map(action => (
                <div key={action.id} className={`border rounded-lg p-4 ${action.severity === 'critical' ? 'border-red-300 bg-red-50/50 dark:bg-red-950/30' : 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/30'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={action.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">{action.severity}</Badge>
                        <Badge variant="outline" className="text-[10px]">{action.type.replace(/_/g, ' ')}</Badge>
                      </div>
                      <p className="text-sm font-medium">{action.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                      {action.affectedUrls.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {action.affectedUrls.map(u => <span key={u} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{u}</span>)}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">Pending</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== TRENDS ========== */}
        <TabsContent value="trends" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">30-Day Crawl & Indexation</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.floor(trends.length / 5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="crawlVolume" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} name="Crawl Vol" />
                  <Line type="monotone" dataKey="indexedGrowth" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} name="Indexed" />
                  <Line type="monotone" dataKey="duplicateCount" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="Duplicates" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Authority & Ranking Momentum</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.floor(trends.length / 5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="authorityScore" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} name="Authority" />
                  <Line type="monotone" dataKey="top20Candidates" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Top 20 Candidates" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
