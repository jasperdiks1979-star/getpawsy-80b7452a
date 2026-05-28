import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  CrawlMetrics,
  CrawlWasteScore,
  DuplicateUrlPattern,
  OrphanPage,
  PriorityPageStatus,
  TrendDataPoint,
  CrawlAlert,
} from '@/lib/crawl-diagnostics';
import {
  calculateCrawlWasteScore,
  generateCrawlAlerts,
  getMetricColor,
  getScoreSeverityColor,
  generateMockCrawlMetrics,
  generateMockTrendData,
} from '@/lib/crawl-diagnostics';

export function CrawlDiagnosticsDashboard() {
  const [metrics, setMetrics] = useState<CrawlMetrics | null>(null);
  const [wasteScore, setWasteScore] = useState<CrawlWasteScore | null>(null);
  const [alerts, setAlerts] = useState<CrawlAlert[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [duplicatePatterns, setDuplicatePatterns] = useState<DuplicateUrlPattern[]>([]);
  const [orphanPages, setOrphanPages] = useState<OrphanPage[]>([]);
  const [priorityPages, setPriorityPages] = useState<PriorityPageStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOrphans, setShowOrphans] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // For now, use mock data
      // In production, this would call an edge function to aggregate real data
      const mockMetrics = generateMockCrawlMetrics();
      const mockTrends = generateMockTrendData();

      setMetrics(mockMetrics);
      setWasteScore(calculateCrawlWasteScore(mockMetrics));
      setAlerts(generateCrawlAlerts(mockMetrics));
      setTrendData(mockTrends);

      // Mock duplicate patterns
      setDuplicatePatterns([
        {
          pattern: '?category=',
          count: 142,
          frequency: 'high',
          canonicalTarget: '/products',
          mismatchCount: 8,
        },
        {
          pattern: '?sort=',
          count: 87,
          frequency: 'medium',
          canonicalTarget: '/products',
          mismatchCount: 3,
        },
        {
          pattern: '?lang=',
          count: 23,
          frequency: 'low',
          canonicalTarget: null,
          mismatchCount: 5,
        },
        {
          pattern: '?utm_',
          count: 12,
          frequency: 'low',
          canonicalTarget: null,
          mismatchCount: 2,
        },
      ]);

      // Mock orphan pages
      setOrphanPages([
        {
          url: '/guides/indoor-cat-tree-benefits',
          type: 'guide',
          lastCrawled: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          isIndexed: true,
          internalLinkCount: 0,
          crawlDepth: 3,
        },
        {
          url: '/products/premium-cat-tree-xl',
          type: 'product',
          lastCrawled: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          isIndexed: false,
          internalLinkCount: 1,
          crawlDepth: 4,
        },
        {
          url: '/guides/cat-tree-safety-tips',
          type: 'guide',
          lastCrawled: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          isIndexed: true,
          internalLinkCount: 0,
          crawlDepth: 3,
        },
      ]);

      // Mock priority pages
      setPriorityPages([
        {
          url: '/products/best-seller-cat-tree',
          type: 'product',
          lastCrawled: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          isIndexed: true,
          canonicalUrl: '/products/best-seller-cat-tree',
          structuredDataDetected: true,
          internalLinkCount: 12,
        },
        {
          url: '/guides/best-cat-trees-2026',
          type: 'guide',
          lastCrawled: new Date().toISOString(),
          isIndexed: true,
          canonicalUrl: '/guides/best-cat-trees-2026',
          structuredDataDetected: true,
          internalLinkCount: 8,
        },
        {
          url: '/cat-trees-condos',
          type: 'category',
          lastCrawled: new Date().toISOString(),
          isIndexed: true,
          canonicalUrl: '/cat-trees-condos',
          structuredDataDetected: false,
          internalLinkCount: 6,
        },
      ]);
    } catch (err) {
      console.error('Error loading crawl diagnostics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !metrics || !wasteScore) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading crawl diagnostics...</p>
        </div>
      </div>
    );
  }

  const scoreColor =
    wasteScore.severity === 'healthy' ? 'text-green-600' : wasteScore.severity === 'warning' ? 'text-yellow-600' : 'text-red-600';
  const scoreBgColor =
    wasteScore.severity === 'healthy'
      ? 'bg-green-50 dark:bg-green-950'
      : wasteScore.severity === 'warning'
        ? 'bg-yellow-50 dark:bg-yellow-950'
        : 'bg-red-50 dark:bg-red-950';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Crawl Diagnostics</h1>
          <p className="text-muted-foreground">
            Monitor crawl efficiency, indexation health, and duplicate suppression
          </p>
        </div>
        <Button onClick={loadDashboardData} disabled={loading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Crawl Waste Score - Hero */}
      <Card className={scoreBgColor}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Crawl Waste Score</CardTitle>
          <CardDescription>
            Aggregate health metric based on duplicates, parameters, indexation ratio, and orphans
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className={`text-6xl font-bold ${scoreColor}`}>{wasteScore.score}</div>
            <div className="flex-1 space-y-2">
              <Badge
                variant={
                  wasteScore.severity === 'healthy'
                    ? 'default'
                    : wasteScore.severity === 'warning'
                      ? 'secondary'
                      : 'destructive'
                }
              >
                {wasteScore.severity === 'healthy' ? '✓ Healthy' : wasteScore.severity === 'warning' ? '⚠ Warning' : '✗ Critical'}
              </Badge>
              <div className="text-sm space-y-1">
                {wasteScore.reasons.map((reason, i) => (
                  <p key={i} className="text-muted-foreground">
                    • {reason}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Core Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard
          label="Indexed Pages"
          value={metrics.totalIndexedPages}
          subtext={`${metrics.indexedCrawledRatio.toFixed(1)}% of crawled`}
          icon="📊"
          color={getMetricColor(metrics.indexedCrawledRatio, { healthy: 70, warning: 60 })}
        />
        <MetricCard
          label="Crawled (30d)"
          value={metrics.totalCrawledPages}
          subtext="last month"
          icon="🔍"
          color="gray"
        />
        <MetricCard
          label="Duplicates"
          value={`${metrics.duplicateUrlPercentage.toFixed(1)}%`}
          subtext={`${Math.round(metrics.totalCrawledPages * (metrics.duplicateUrlPercentage / 100))} URLs`}
          icon="📋"
          color={getMetricColor(metrics.duplicateUrlPercentage, { healthy: 3, warning: 5 })}
        />
        <MetricCard
          label="Orphan Pages"
          value={metrics.orphanPageCount}
          subtext="no inbound links"
          icon="🔗"
          color={getMetricColor(metrics.orphanPageCount, { healthy: 5, warning: 10 })}
        />
        <MetricCard
          label="Avg Crawl Depth"
          value={metrics.avgCrawlDepth.toFixed(1)}
          subtext="target: ≤3"
          icon="📐"
          color={getMetricColor(metrics.avgCrawlDepth, { healthy: 2.5, warning: 3 })}
        />
      </div>

      {/* Additional Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard
          label="Parameters"
          value={metrics.parameterUrlCrawlCount}
          subtext={`${((metrics.parameterUrlCrawlCount / metrics.totalCrawledPages) * 100).toFixed(1)}% of crawl`}
          icon="⚙️"
          color={getMetricColor(
            (metrics.parameterUrlCrawlCount / metrics.totalCrawledPages) * 100,
            { healthy: 10, warning: 15 }
          )}
        />
        <MetricCard
          label="Crawled ≠ Indexed"
          value={metrics.crawledNotIndexedCount}
          subtext="not indexed"
          icon="❌"
          color="gray"
        />
        <MetricCard
          label="Alt Canonicals"
          value={metrics.alternativeCanonicalCount}
          subtext="check these"
          icon="🏷️"
          color={metrics.alternativeCanonicalCount > 0 ? 'yellow' : 'green'}
        />
        <MetricCard
          label="Zero Links"
          value={metrics.pagesWithZeroLinks}
          subtext="no internal links"
          icon="🚫"
          color={getMetricColor(metrics.pagesWithZeroLinks, { healthy: 5, warning: 10 })}
        />
        <MetricCard
          label="Index Ratio"
          value={`${metrics.indexedCrawledRatio.toFixed(1)}%`}
          subtext="target: ≥70%"
          icon="📈"
          color={getMetricColor(metrics.indexedCrawledRatio, { healthy: 70, warning: 60 })}
        />
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Crawl Diagnostics Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map(alert => (
                <Alert
                  key={alert.id}
                  className={
                    alert.severity === 'critical'
                      ? 'border-red-500 bg-red-50 dark:bg-red-950'
                      : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'
                  }
                >
                  <AlertTriangle
                    className={`h-4 w-4 ${
                      alert.severity === 'critical' ? 'text-red-600' : 'text-yellow-600'
                    }`}
                  />
                  <AlertTitle>{alert.title}</AlertTitle>
                  <AlertDescription>{alert.description}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Duplicate URL Monitor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Duplicate & Parameter Monitor</CardTitle>
            <CardDescription>Patterns in crawl activity that waste budget</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDuplicates(!showDuplicates)}
          >
            {showDuplicates ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          {showDuplicates ? (
            <div className="space-y-4">
              {duplicatePatterns.map(pattern => (
                <div key={pattern.pattern} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-mono font-semibold text-sm">{pattern.pattern}</p>
                      <p className="text-xs text-muted-foreground">
                        {pattern.count} crawls • Frequency: <span className="font-medium">{pattern.frequency}</span>
                      </p>
                    </div>
                    <Badge variant={pattern.frequency === 'high' ? 'destructive' : 'secondary'}>
                      {pattern.frequency}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Canonical Target:</span>
                      <p className="font-mono text-xs mt-1">
                        {pattern.canonicalTarget || 'Not configured'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Canonical Mismatches:</span>
                      <p className="font-semibold text-xs mt-1">{pattern.mismatchCount} URLs</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <p>Click "Show Details" to view duplicate and parameter patterns</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orphan & Depth Analysis */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Orphan & Depth Analysis</CardTitle>
            <CardDescription>Pages with low link support or excessive crawl depth</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOrphans(!showOrphans)}
          >
            {showOrphans ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          {showOrphans ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">URL</th>
                    <th className="text-center py-2 px-3">Type</th>
                    <th className="text-center py-2 px-3">Links</th>
                    <th className="text-center py-2 px-3">Depth</th>
                    <th className="text-center py-2 px-3">Indexed</th>
                    <th className="text-center py-2 px-3">Last Crawled</th>
                  </tr>
                </thead>
                <tbody>
                  {orphanPages.map(page => (
                    <tr key={page.url} className="border-b">
                      <td className="py-2 px-3 font-mono text-xs">{page.url}</td>
                      <td className="text-center py-2 px-3">
                        <Badge variant="outline" className="text-xs">
                          {page.type}
                        </Badge>
                      </td>
                      <td className="text-center py-2 px-3">
                        <span className={page.internalLinkCount === 0 ? 'text-red-600 font-bold' : ''}>
                          {page.internalLinkCount}
                        </span>
                      </td>
                      <td className="text-center py-2 px-3">{page.crawlDepth}</td>
                      <td className="text-center py-2 px-3">
                        {page.isIndexed ? (
                          <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-destructive mx-auto" />
                        )}
                      </td>
                      <td className="text-center py-2 px-3 text-xs text-muted-foreground">
                        {new Date(page.lastCrawled || '').toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <p>Click "Show Details" to view orphan and depth analysis</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Priority Index Watch */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Priority Index Watch</CardTitle>
          <CardDescription>Status of money pages and top-priority URLs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {priorityPages.map(page => (
              <div key={page.url} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-sm truncate">{page.url}</p>
                    <p className="text-xs text-muted-foreground">
                      Last crawled:{' '}
                      {page.lastCrawled
                        ? new Date(page.lastCrawled).toLocaleDateString()
                        : 'Never'}
                    </p>
                  </div>
                  <Badge
                    variant={page.isIndexed ? 'default' : 'destructive'}
                    className="ml-2 flex-shrink-0"
                  >
                    {page.isIndexed ? 'Indexed' : 'Not Indexed'}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm pt-2 border-t">
                  <div>
                    <span className="text-xs text-muted-foreground">Type</span>
                    <p className="font-medium capitalize">{page.type}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Internal Links</span>
                    <p className="font-bold text-lg">{page.internalLinkCount}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Structured Data</span>
                    <p className="font-medium">
                      {page.structuredDataDetected ? '✓ Yes' : '✗ No'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 30-Day Trend Graph */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">30-Day Crawl Trends</CardTitle>
          <CardDescription>Weekly patterns in crawl volume, indexation, and duplicates</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                interval={Math.floor(trendData.length / 5)}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => value.toLocaleString()} />
              <Legend />
              <Line
                type="monotone"
                dataKey="crawlVolume"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                name="Crawl Volume"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="indexedGrowth"
                stroke="#10b981"
                strokeWidth={2}
                name="Indexed Growth"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="duplicateCount"
                stroke="#ef4444"
                strokeWidth={2}
                name="Duplicates"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="parameterCrawls"
                stroke="#f59e0b"
                strokeWidth={2}
                name="Parameter Crawls"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Impact Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Crawl Waste Impact Breakdown</CardTitle>
          <CardDescription>How each factor contributes to your crawl waste score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <ImpactItem
              label="Duplicate URLs"
              value={wasteScore.duplicateImpact}
              max={25}
              color="hsl(0, 84%, 60%)"
            />
            <ImpactItem
              label="Parameter Crawling"
              value={wasteScore.parameterImpact}
              max={20}
              color="hsl(38, 92%, 50%)"
            />
            <ImpactItem
              label="Low Index Ratio"
              value={wasteScore.indexRatioImpact}
              max={30}
              color="hsl(48, 96%, 53%)"
            />
            <ImpactItem
              label="Orphan Pages"
              value={wasteScore.orphanImpact}
              max={15}
              color="hsl(217, 91%, 60%)"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============= HELPER COMPONENTS =============

function MetricCard({
  label,
  value,
  subtext,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: string;
  color: 'green' | 'yellow' | 'red' | 'gray';
}) {
  const colorClass =
    color === 'green'
      ? 'text-green-600'
      : color === 'yellow'
        ? 'text-yellow-600'
        : color === 'red'
          ? 'text-red-600'
          : 'text-gray-600';

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{icon}</span>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      </CardContent>
    </Card>
  );
}

function ImpactItem({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const percentage = (value / max) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-bold" style={{ color }}>
          {value}/{max}
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}
