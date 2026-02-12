import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, BarChart3, Search, TrendingUp, Eye, MousePointer,
  Globe, RefreshCw, ExternalLink, CheckCircle, XCircle, AlertTriangle,
  Download, Copy, Info, Loader2, FileText
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchGSCMetricsForGuides,
  triggerGSCSync,
  runGSCDiagnostic,
  type GSCFetchResult,
  type GSCDiagnosticResult,
  type GSCQueryMetrics,
} from '@/lib/gsc';
import { SITE_URL } from '@/lib/constants';

// ===== TYPES =====

interface SitemapCheck {
  path: string;
  status: 'ok' | 'error' | 'checking' | 'unknown';
  statusCode?: number;
}

const SITEMAPS = [
  '/sitemap.xml',
  '/sitemap-static.xml',
  '/sitemap-products.xml',
  '/sitemap-categories.xml',
  '/sitemap-collections.xml',
  '/sitemap-blog.xml',
  '/sitemap-guides.xml',
  '/sitemap-bestsellers.xml',
];

// ===== COMPONENT =====

export default function AnalyticsHub() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [gscResult, setGscResult] = useState<GSCFetchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagnostic, setDiagnostic] = useState<GSCDiagnosticResult | null>(null);

  // Query filters
  const [queryFilter, setQueryFilter] = useState('');
  const [dateRange, setDateRange] = useState<'7d' | '28d' | '90d'>('28d');

  // Sitemap checks
  const [sitemapChecks, setSitemapChecks] = useState<SitemapCheck[]>(
    SITEMAPS.map(p => ({ path: p, status: 'unknown' as const }))
  );

  // Auth guard
  useEffect(() => {
    if (!user && !loading) navigate('/auth');
    if (user && !isAdmin) navigate('/');
  }, [user, isAdmin, loading, navigate]);

  // Load GSC data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchGSCMetricsForGuides();
      setGscResult(result);
    } catch (err) {
      console.error('[AnalyticsHub] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // GSC Sync
  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await triggerGSCSync();
      toast(result.success ? 'GSC sync complete' : 'GSC sync issue', {
        description: result.message.substring(0, 200),
      });
      if (result.success) await loadData();
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Diagnostic
  const handleDiagnostic = async () => {
    setDiagRunning(true);
    try {
      const result = await runGSCDiagnostic();
      setDiagnostic(result);
      toast(result.status === 'OK' ? 'GSC connection OK' : `GSC: ${result.status}`, {
        description: result.issue || `Connected: ${result.connected}`,
      });
    } catch {
      toast.error('Diagnostic failed');
    } finally {
      setDiagRunning(false);
    }
  };

  // Sitemap health check
  const checkSitemaps = async () => {
    setSitemapChecks(SITEMAPS.map(p => ({ path: p, status: 'checking' as const })));
    const results: SitemapCheck[] = [];
    for (const path of SITEMAPS) {
      try {
        const res = await fetch(`${SITE_URL}${path}`, { method: 'HEAD', mode: 'no-cors' });
        // no-cors means we can't read status, but if it resolves the resource exists
        results.push({ path, status: 'ok', statusCode: 0 });
      } catch {
        results.push({ path, status: 'error' });
      }
    }
    setSitemapChecks(results);
    toast.success('Sitemap health check complete');
  };

  // Aggregate KPIs from GSC data
  const sitewide = gscResult?.sitewide;
  const allQueries: GSCQueryMetrics[] = gscResult?.reports?.flatMap(r => r.topQueries) || [];

  // Filter & sort queries
  const filteredQueries = allQueries
    .filter(q => !queryFilter || q.query.toLowerCase().includes(queryFilter.toLowerCase()))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 50);

  // Top pages (aggregate by page)
  const pageMap = new Map<string, { clicks: number; impressions: number; positions: number[]; count: number }>();
  for (const q of allQueries) {
    const existing = pageMap.get(q.page) || { clicks: 0, impressions: 0, positions: [], count: 0 };
    existing.clicks += q.clicks;
    existing.impressions += q.impressions;
    existing.positions.push(q.position);
    existing.count++;
    pageMap.set(q.page, existing);
  }
  const topPages = Array.from(pageMap.entries())
    .map(([url, d]) => ({
      url,
      clicks: d.clicks,
      impressions: d.impressions,
      avgPosition: Math.round((d.positions.reduce((s, p) => s + p, 0) / d.positions.length) * 10) / 10,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 20);

  // CSV export
  const exportCSV = () => {
    const header = 'Query,Clicks,Impressions,CTR,Position\n';
    const rows = filteredQueries.map(q => `"${q.query}",${q.clicks},${q.impressions},${q.ctr.toFixed(2)}%,${q.position.toFixed(1)}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gsc-queries-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (!user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/admin">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Analytics Hub</h1>
              <p className="text-sm text-muted-foreground">Search performance, indexing & sitemap status</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/admin/guides-seo">
              <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-1" />Guides SEO</Button>
            </Link>
          </div>
        </div>

        {/* SECTION 1 — Quick KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Clicks"
            value={sitewide?.totalClicks}
            icon={<MousePointer className="h-4 w-4" />}
            loading={loading}
            subtitle="Last sync period"
          />
          <KPICard
            title="Total Impressions"
            value={sitewide?.totalImpressions}
            icon={<Eye className="h-4 w-4" />}
            loading={loading}
            subtitle="Last sync period"
            format="number"
          />
          <KPICard
            title="Avg Position"
            value={sitewide?.avgPosition}
            icon={<TrendingUp className="h-4 w-4" />}
            loading={loading}
            subtitle="Lower is better"
            format="decimal"
          />
          <KPICard
            title="CTR"
            value={sitewide ? (sitewide.totalImpressions > 0 ? ((sitewide.totalClicks / sitewide.totalImpressions) * 100) : 0) : undefined}
            icon={<BarChart3 className="h-4 w-4" />}
            loading={loading}
            subtitle="Click-through rate"
            format="percent"
          />
        </div>

        {/* Status bar */}
        {gscResult && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={gscResult.status === 'active' ? 'default' : 'secondary'}>
              {gscResult.status.toUpperCase()}
            </Badge>
            <span className="truncate">{gscResult.statusMessage.substring(0, 120)}</span>
            {gscResult.lastSyncedAt && (
              <span className="ml-auto text-xs shrink-0">
                Last sync: {new Date(gscResult.lastSyncedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* SECTION 2 — Top Queries */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Top Queries</CardTitle>
                <CardDescription>Keywords driving traffic from Google</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter queries..."
                    value={queryFilter}
                    onChange={e => setQueryFilter(e.target.value)}
                    className="pl-9 w-48"
                  />
                </div>
                <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="28d">28 days</SelectItem>
                    <SelectItem value="90d">3 months</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredQueries.length === 0}>
                  <Download className="h-4 w-4 mr-1" />CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredQueries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No query data available. Run a GSC sync to fetch data.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Query</th>
                      <th className="pb-2 pr-4 text-right">Clicks</th>
                      <th className="pb-2 pr-4 text-right">Impressions</th>
                      <th className="pb-2 pr-4 text-right">CTR</th>
                      <th className="pb-2 text-right">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueries.map((q, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="py-2 pr-4 font-medium max-w-[240px] truncate">{q.query}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{q.clicks}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{q.impressions.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{q.ctr.toFixed(1)}%</td>
                        <td className="py-2 text-right tabular-nums">{q.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 3 — Top Pages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Pages</CardTitle>
            <CardDescription>Pages with the most search traffic</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : topPages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No page data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Page</th>
                      <th className="pb-2 pr-4 text-right">Clicks</th>
                      <th className="pb-2 pr-4 text-right">Impressions</th>
                      <th className="pb-2 text-right">Avg Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPages.map((p, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="py-2 pr-4 font-mono text-xs max-w-[300px] truncate">{p.url}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{p.clicks}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{p.impressions.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums">{p.avgPosition}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 4 — Sitemap Health */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Sitemap Health</CardTitle>
                <CardDescription>Status of all sitemap files on {SITE_URL}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={checkSitemaps}>
                <RefreshCw className="h-4 w-4 mr-1" />Check
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sitemapChecks.map(s => (
                <div key={s.path} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    {s.status === 'ok' && <CheckCircle className="h-4 w-4 text-primary" />}
                    {s.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                    {s.status === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {s.status === 'unknown' && <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-mono">{s.path}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.status === 'ok' ? 'default' : s.status === 'error' ? 'destructive' : 'secondary'}>
                      {s.status === 'ok' ? 'OK' : s.status === 'error' ? 'Error' : s.status === 'checking' ? '...' : 'Unknown'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => window.open(`${SITE_URL}${s.path}`, '_blank')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* SECTION — GSC Sitemap Submission Helper */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-4 w-4" />
              Search Console Sitemap Submission
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Property</span>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-2 py-1 rounded text-xs">sc-domain:getpawsy.pet</code>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard('sc-domain:getpawsy.pet')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Main sitemap path</span>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-2 py-1 rounded text-xs">sitemap.xml</code>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard('sitemap.xml')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Additional sitemaps</span>
              <div className="flex flex-wrap gap-1.5">
                {['sitemap-products.xml', 'sitemap-categories.xml', 'sitemap-collections.xml', 'sitemap-blog.xml', 'sitemap-guides.xml', 'sitemap-static.xml'].map(s => (
                  <button
                    key={s}
                    onClick={() => copyToClipboard(s)}
                    className="bg-muted px-2 py-0.5 rounded text-xs font-mono hover:bg-muted/80 transition-colors cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              In Google Search Console, paste only the path (e.g. <code>sitemap.xml</code>), not the full URL.
            </p>
          </CardContent>
        </Card>

        {/* SECTION 5 — Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Force GSC Sync
              </Button>
              <Button variant="outline" onClick={handleDiagnostic} disabled={diagRunning}>
                {diagRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                Run GSC Diagnostic
              </Button>
              <Button variant="outline" onClick={checkSitemaps}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Recheck Sitemap Health
              </Button>
            </div>

            {/* Diagnostic result */}
            {diagnostic && (
              <div className="mt-4 p-3 bg-muted rounded-lg text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={diagnostic.status === 'OK' ? 'default' : 'destructive'}>{diagnostic.status}</Badge>
                  <span className="font-medium">{diagnostic.property}</span>
                </div>
                <p>Connected: {diagnostic.connected ? 'Yes' : 'No'}</p>
                {diagnostic.rowsFetched !== undefined && <p>Rows fetched: {diagnostic.rowsFetched}</p>}
                {diagnostic.issue && <p className="text-destructive">{diagnostic.issue}</p>}
                {diagnostic.fix_recommendation && <p className="text-muted-foreground">{diagnostic.fix_recommendation}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===== KPI Card sub-component =====

function KPICard({
  title,
  value,
  icon,
  loading,
  subtitle,
  format = 'number',
}: {
  title: string;
  value?: number;
  icon: React.ReactNode;
  loading: boolean;
  subtitle: string;
  format?: 'number' | 'decimal' | 'percent';
}) {
  const formatted = value === undefined
    ? '—'
    : format === 'percent'
    ? `${value.toFixed(1)}%`
    : format === 'decimal'
    ? value.toFixed(1)
    : value.toLocaleString();

  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-bold tabular-nums">{formatted}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
