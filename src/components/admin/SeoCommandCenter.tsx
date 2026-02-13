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
  AlertTriangle, CheckCircle2, Eye, EyeOff, AlertCircle, RefreshCw,
  Shield, Zap, Link2, TrendingUp, Activity, Target, Gauge,
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
  const strokeColor = severity === 'healthy' || severity === 'strong' || severity === 'accelerating'
    ? 'hsl(var(--chart-2))' : severity === 'warning' || severity === 'moderate' || severity === 'steady'
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

      setCrawlMetrics(cm);
      setWasteScore(ws);
      setAlerts(al);
      setAuthorityPages(ap);
      setAuthorityMetrics(am);
      setRankPages(rp);
      setRankMetrics(rm);
      setHealingActions(ha);
      setTrends(tr);
      setScores({
        crawlHealth: 100 - ws.score,
        authorityStrength: am.overallScore,
        rankingMomentum: rm.momentumScore,
        stability,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const top20Push = useMemo(() =>
    rankPages.filter(p => p.pushPriority === 'high').sort((a, b) => a.avgPosition - b.avgPosition),
    [rankPages]
  );

  if (loading || !crawlMetrics || !wasteScore || !authorityMetrics || !rankMetrics || !scores) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const stabilityColor = scores.stability === 'Stable' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
    : scores.stability === 'Growth Phase' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">SEO Command Center</h1>
          <p className="text-sm text-muted-foreground">Crawl · Authority · Ranking · Self-Healing</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={stabilityColor}>{scores.stability}</Badge>
          <Button onClick={loadData} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Output Panel — Score Rings */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex flex-col items-center relative">
              <ScoreRing score={scores.crawlHealth} label="Crawl Health" severity={wasteScore.severity === 'healthy' ? 'healthy' : wasteScore.severity} />
            </div>
            <div className="flex flex-col items-center relative">
              <ScoreRing score={scores.authorityStrength} label="Authority" severity={authorityMetrics.severity} />
            </div>
            <div className="flex flex-col items-center relative">
              <ScoreRing score={scores.rankingMomentum} label="Momentum" severity={rankMetrics.severity} />
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center h-[100px]">
                <div className="text-center">
                  <Activity className={`h-10 w-10 mx-auto mb-2 ${scores.stability === 'Stable' ? 'text-emerald-500' : scores.stability === 'Growth Phase' ? 'text-blue-500' : 'text-red-500'}`} />
                  <span className="text-lg font-bold">{scores.stability}</span>
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
      <Tabs defaultValue="crawl" className="w-full">
        <TabsList className="w-full grid grid-cols-5 h-auto">
          <TabsTrigger value="crawl" className="text-xs py-2 gap-1">
            <Gauge className="h-3.5 w-3.5 hidden sm:block" /> Crawl
          </TabsTrigger>
          <TabsTrigger value="authority" className="text-xs py-2 gap-1">
            <Shield className="h-3.5 w-3.5 hidden sm:block" /> Authority
          </TabsTrigger>
          <TabsTrigger value="rank" className="text-xs py-2 gap-1">
            <Target className="h-3.5 w-3.5 hidden sm:block" /> Rank
          </TabsTrigger>
          <TabsTrigger value="healing" className="text-xs py-2 gap-1">
            <Zap className="h-3.5 w-3.5 hidden sm:block" /> Healing
          </TabsTrigger>
          <TabsTrigger value="trends" className="text-xs py-2 gap-1">
            <TrendingUp className="h-3.5 w-3.5 hidden sm:block" /> Trends
          </TabsTrigger>
        </TabsList>

        {/* ========== SECTION 1: CRAWL DIAGNOSTICS ========== */}
        <TabsContent value="crawl" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Indexed Pages" value={crawlMetrics.totalIndexedPages.toLocaleString()} subtext={`${crawlMetrics.indexedCrawledRatio.toFixed(1)}% ratio`} color={getMetricColor(crawlMetrics.indexedCrawledRatio, { healthy: 70, warning: 60 })} />
            <MetricCard label="Crawled (30d)" value={crawlMetrics.totalCrawledPages.toLocaleString()} subtext="total crawls" color="gray" />
            <MetricCard label="Duplicates" value={`${crawlMetrics.duplicateUrlPercentage.toFixed(1)}%`} subtext={`${Math.round(crawlMetrics.totalCrawledPages * crawlMetrics.duplicateUrlPercentage / 100)} URLs`} color={getMetricColor(crawlMetrics.duplicateUrlPercentage, { healthy: 3, warning: 5 })} />
            <MetricCard label="Orphans" value={crawlMetrics.orphanPageCount} subtext="no inbound links" color={getMetricColor(crawlMetrics.orphanPageCount, { healthy: 5, warning: 10 })} />
            <MetricCard label="Avg Depth" value={crawlMetrics.avgCrawlDepth.toFixed(1)} subtext="target: ≤3" color={getMetricColor(crawlMetrics.avgCrawlDepth, { healthy: 2.5, warning: 3 })} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Param Crawls" value={crawlMetrics.parameterUrlCrawlCount} subtext={`${((crawlMetrics.parameterUrlCrawlCount / crawlMetrics.totalCrawledPages) * 100).toFixed(1)}%`} color={getMetricColor((crawlMetrics.parameterUrlCrawlCount / crawlMetrics.totalCrawledPages) * 100, { healthy: 10, warning: 15 })} />
            <MetricCard label="Not Indexed" value={crawlMetrics.crawledNotIndexedCount} subtext="crawled but missed" color="gray" />
            <MetricCard label="Alt Canonicals" value={crawlMetrics.alternativeCanonicalCount} subtext="mismatches" color={crawlMetrics.alternativeCanonicalCount > 0 ? 'yellow' : 'green'} />
            <MetricCard label="Zero Links" value={crawlMetrics.pagesWithZeroLinks} subtext="isolated pages" color={getMetricColor(crawlMetrics.pagesWithZeroLinks, { healthy: 5, warning: 10 })} />
            <MetricCard label="Waste Score" value={`${wasteScore.score}/100`} subtext={wasteScore.severity} color={wasteScore.severity === 'healthy' ? 'green' : wasteScore.severity === 'warning' ? 'yellow' : 'red'} />
          </div>

          {/* Duplicate Pattern Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Parameter & Duplicate Patterns</CardTitle>
            </CardHeader>
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
                        <td className="text-center py-2 px-2">
                          <Badge variant={d.frequency === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">{d.frequency}</Badge>
                        </td>
                        <td className="text-center py-2 px-2 font-mono text-[11px]">{d.canonicalTarget || '—'}</td>
                        <td className="text-center py-2 px-2">
                          <span className={d.mismatchCount > 3 ? 'text-red-600 font-bold' : ''}>{d.mismatchCount}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== SECTION 2: AUTHORITY CONCENTRATION ========== */}
        <TabsContent value="authority" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Authority Score" value={authorityMetrics.overallScore} subtext={authorityMetrics.severity} color={authorityMetrics.severity === 'strong' ? 'green' : authorityMetrics.severity === 'moderate' ? 'yellow' : 'red'} />
            <MetricCard label="Avg Inbound" value={authorityMetrics.avgInboundLinks} subtext="links per page" color={authorityMetrics.avgInboundLinks >= 4 ? 'green' : 'yellow'} />
            <MetricCard label="Guides <4 Links" value={authorityMetrics.guidesBelow4Links} subtext="need link boost" color={getMetricColor(authorityMetrics.guidesBelow4Links, { healthy: 2, warning: 5 })} />
            <MetricCard label="Products <2 Links" value={authorityMetrics.productsBelow2Links} subtext="need link boost" color={getMetricColor(authorityMetrics.productsBelow2Links, { healthy: 3, warning: 8 })} />
          </div>

          {/* Tier Coverage */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Authority Tier Coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Tier 1 (Homepage, Categories, Pillar Guides)', value: authorityMetrics.tier1Coverage, target: '≥8 links' },
                { label: 'Tier 2 (Top 20 Products)', value: authorityMetrics.tier2Coverage, target: '≥2 links' },
                { label: 'Tier 3 (Supporting Guides)', value: authorityMetrics.tier3Coverage, target: '≥4 links' },
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

          {/* Authority Page List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Page Authority Map</CardTitle>
            </CardHeader>
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
                        <td className="text-center py-2 px-2">
                          <Badge variant="outline" className="text-[10px]">T{p.tier}</Badge>
                        </td>
                        <td className="text-center py-2 px-2 font-bold">{p.inboundLinks}</td>
                        <td className="text-center py-2 px-2">{p.crawlDepth}</td>
                        <td className="text-center py-2 px-2">
                          <span className={p.authorityScore >= 60 ? 'text-emerald-600' : p.authorityScore >= 35 ? 'text-amber-600' : 'text-red-600'}>
                            {p.authorityScore}
                          </span>
                        </td>
                        <td className="text-center py-2 px-2">
                          {p.isOrphan ? (
                            <Badge variant="destructive" className="text-[10px]">Orphan</Badge>
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== SECTION 3: RANK ACCELERATION ========== */}
        <TabsContent value="rank" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Momentum" value={rankMetrics.momentumScore} subtext={rankMetrics.severity} color={rankMetrics.severity === 'accelerating' ? 'green' : rankMetrics.severity === 'steady' ? 'yellow' : 'red'} />
            <MetricCard label="Top 20 Candidates" value={rankMetrics.top20Candidates} subtext="ready to push" color={rankMetrics.top20Candidates > 3 ? 'green' : 'yellow'} />
            <MetricCard label="Strike Zone" value={rankMetrics.pagesInStrikeZone} subtext="positions 11–40" color="gray" />
            <MetricCard label="Low CTR / High Imp" value={rankMetrics.lowCtrHighImpressions} subtext="needs CTR fix" color={getMetricColor(rankMetrics.lowCtrHighImpressions, { healthy: 2, warning: 5 })} />
          </div>

          {/* Top 20 Push List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4" /> Top 20 Push List
              </CardTitle>
              <CardDescription className="text-xs">High-priority pages closest to breaking into Top 20</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {top20Push.map(p => (
                <div key={p.url} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs truncate">{p.url}</p>
                      <p className="text-[11px] text-muted-foreground">"{p.keyword}"</p>
                    </div>
                    <Badge variant={p.pushPriority === 'high' ? 'destructive' : 'secondary'} className="text-[10px] flex-shrink-0">
                      {p.pushPriority}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px]">
                    <div><span className="text-muted-foreground">Pos:</span> <span className="font-bold">{p.avgPosition.toFixed(1)}</span></div>
                    <div><span className="text-muted-foreground">Imp:</span> <span className="font-bold">{p.impressions}</span></div>
                    <div><span className="text-muted-foreground">CTR:</span> <span className={`font-bold ${p.ctr < 1 ? 'text-red-600' : ''}`}>{p.ctr}%</span></div>
                    <div><span className="text-muted-foreground">Links:</span> <span className="font-bold">{p.internalLinks}</span></div>
                  </div>
                  {p.suggestions.length > 0 && (
                    <div className="pt-1 border-t space-y-1">
                      {p.suggestions.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px]">
                          <Badge variant="outline" className="text-[9px] flex-shrink-0">{s.impact}</Badge>
                          <span className="text-muted-foreground">{s.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* All Tracked Pages */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">All Tracked Pages (Pos 11–40)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2">URL</th>
                    <th className="text-center py-2 px-2">Keyword</th>
                    <th className="text-center py-2 px-2">Pos</th>
                    <th className="text-center py-2 px-2">Imp</th>
                    <th className="text-center py-2 px-2">CTR</th>
                    <th className="text-center py-2 px-2">Links</th>
                  </tr></thead>
                  <tbody>
                    {rankPages.sort((a, b) => a.avgPosition - b.avgPosition).map(p => (
                      <tr key={p.url} className="border-b">
                        <td className="py-2 px-2 font-mono text-[11px] max-w-[150px] truncate">{p.url}</td>
                        <td className="text-center py-2 px-2 text-[11px]">{p.keyword}</td>
                        <td className="text-center py-2 px-2 font-bold">{p.avgPosition.toFixed(1)}</td>
                        <td className="text-center py-2 px-2">{p.impressions}</td>
                        <td className={`text-center py-2 px-2 ${p.ctr < 1 ? 'text-red-600 font-bold' : ''}`}>{p.ctr}%</td>
                        <td className="text-center py-2 px-2">{p.internalLinks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== SECTION 4: SELF-HEALING ========== */}
        <TabsContent value="healing" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" /> Self-Healing Action Queue
              </CardTitle>
              <CardDescription className="text-xs">
                Recommended optimizations — no automatic changes without approval
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {healingActions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  No healing actions needed — system is healthy
                </p>
              ) : (
                healingActions.map(action => (
                  <div key={action.id} className={`border rounded-lg p-4 ${
                    action.severity === 'critical' ? 'border-red-300 bg-red-50/50 dark:bg-red-950/30' : 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/30'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={action.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">
                            {action.severity}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">{action.type.replace(/_/g, ' ')}</Badge>
                        </div>
                        <p className="text-sm font-medium">{action.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                        {action.affectedUrls.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {action.affectedUrls.map(u => (
                              <span key={u} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{u}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">
                        Pending
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== SECTION 5: TRENDS ========== */}
        <TabsContent value="trends" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">30-Day Crawl & Indexation Trends</CardTitle>
            </CardHeader>
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
                  <Line type="monotone" dataKey="parameterCrawls" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} name="Params" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Authority & Ranking Momentum</CardTitle>
            </CardHeader>
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
