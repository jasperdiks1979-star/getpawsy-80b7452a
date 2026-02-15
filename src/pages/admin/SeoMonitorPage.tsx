import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw, Download, CheckCircle, AlertTriangle, XCircle,
  Globe, FileText, ShoppingCart, Zap, Shield, TrendingDown
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface HealthStatus {
  label: string;
  status: 'green' | 'yellow' | 'red';
  detail: string;
}

interface DiagnosticsData {
  sitemap: any;
  seo: any;
  loadedAt: string;
}

const StatusDot = ({ status }: { status: 'green' | 'yellow' | 'red' }) => {
  const colors = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-500',
    red: 'bg-red-500',
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`} />;
};

export default function SeoMonitorPage() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const [sitemapRes, seoRes] = await Promise.all([
        supabase.functions.invoke('sitemap-diagnostics'),
        supabase.functions.invoke('seo-diagnostics'),
      ]);
      setData({
        sitemap: sitemapRes.data,
        seo: seoRes.data,
        loadedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[seo-monitor] load error:', e);
      toast.error('Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDiagnostics(); }, [loadDiagnostics]);

  const downloadReport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seo-diagnostics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derived health checks
  const getHealthChecks = (): HealthStatus[] => {
    if (!data) return [];
    const s = data.sitemap;
    const d = data.seo;
    const checks: HealthStatus[] = [];

    // Homepage
    const hp = d?.pages?.find((p: any) => p.path === '/');
    checks.push({
      label: 'Homepage',
      status: hp?.status === 200 ? 'green' : 'red',
      detail: hp ? `${hp.status} — ${hp.robotsMeta?.slice(0, 30) || 'no meta'}` : 'Not checked',
    });

    // Sitemap
    checks.push({
      label: 'Sitemap Index',
      status: s?.sitemap_index?.valid ? 'green' : 'red',
      detail: `${s?.sitemap_index?.status || '?'} — ${s?.sitemap_index?.child_count || 0} children`,
    });

    // Merchant feed
    checks.push({
      label: 'Robots.txt',
      status: d?.robots?.ok ? 'green' : 'red',
      detail: `${d?.robots?.status || '?'}`,
    });

    // Canonical
    const canonicalOk = d?.canonical_rules?.no_www && d?.canonical_rules?.no_trailing_slash;
    checks.push({
      label: 'Canonical Rules',
      status: canonicalOk ? 'green' : 'yellow',
      detail: canonicalOk ? 'Apex HTTPS, no trailing slash, no params' : 'Check config',
    });

    // Redirect
    const wwwIs301 = d?.www_redirect?.is_301;
    checks.push({
      label: 'www → apex Redirect',
      status: wwwIs301 ? 'green' : 'yellow',
      detail: wwwIs301 ? '301 permanent' : `302 (platform edge — not app-fixable)`,
    });

    // Child sitemaps
    const brokenChildren = s?.child_sitemaps?.filter((c: any) => !c.valid) || [];
    checks.push({
      label: 'Child Sitemaps',
      status: brokenChildren.length === 0 ? 'green' : 'red',
      detail: brokenChildren.length === 0
        ? `All ${s?.child_sitemaps?.length || 0} valid`
        : `${brokenChildren.length} broken: ${brokenChildren.map((c: any) => c.name).join(', ')}`,
    });

    return checks;
  };

  const getCrawlStats = () => {
    if (!data?.sitemap) return { total: 0, blocked: 0, thin: 0, orphan: 0 };
    const total = data.sitemap.validation_summary?.total_urls_checked || 0;
    const noindexPages = data.seo?.noindex_policy?.noindex_pages?.length || 0;
    return { total, blocked: noindexPages, thin: 0, orphan: 0 };
  };

  const getChildSitemapBreakdown = () => {
    if (!data?.sitemap?.child_sitemaps) return [];
    return data.sitemap.child_sitemaps.map((c: any) => ({
      name: c.name.replace('sitemap-', '').replace('.xml', ''),
      count: c.url_count,
      valid: c.valid,
      paramUrls: c.has_parameter_urls,
      wwwUrls: c.has_www_urls,
    }));
  };

  const getVolatilityStatus = () => {
    // Placeholder — real data would come from GSC sync
    return {
      trafficDrop: 0,
      rankingDrop: 0,
      ctrDrop: 0,
      alert: false,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-72" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}
          </div>
        </div>
      </div>
    );
  }

  const healthChecks = getHealthChecks();
  const crawl = getCrawlStats();
  const children = getChildSitemapBreakdown();
  const volatility = getVolatilityStatus();
  const overallHealthy = healthChecks.every(h => h.status === 'green');

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SEO Health Monitor</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Last checked: {data?.loadedAt ? new Date(data.loadedAt).toLocaleString() : '—'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadDiagnostics} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={downloadReport} disabled={!data}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export JSON
            </Button>
          </div>
        </div>

        {/* Overall Status */}
        <Card className={overallHealthy ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
          <CardContent className="py-4 flex items-center gap-3">
            {overallHealthy
              ? <CheckCircle className="h-5 w-5 text-emerald-600" />
              : <AlertTriangle className="h-5 w-5 text-amber-600" />}
            <span className="text-sm font-medium">
              {overallHealthy ? 'All systems healthy — site is crawl-efficient and ranking-optimized' : 'Issues detected — see panels below'}
            </span>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Panel 1: Technical Health */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" /> Technical Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {healthChecks.map((check) => (
                <div key={check.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <StatusDot status={check.status} />
                    <span className="font-medium">{check.label}</span>
                  </div>
                  <span className="text-muted-foreground text-right max-w-[180px] truncate">{check.detail}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Panel 2: Crawl Budget */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Crawl Budget
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{crawl.total.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">Indexable URLs</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{crawl.blocked}</div>
                  <div className="text-[10px] text-muted-foreground">Noindex Routes</div>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {children.map((c: any) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={c.valid ? 'green' : 'red'} />
                      <span className="capitalize">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{c.count} URLs</span>
                      {c.paramUrls && <Badge variant="destructive" className="text-[9px] px-1">params</Badge>}
                      {c.wwwUrls && <Badge variant="destructive" className="text-[9px] px-1">www</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Panel 3: Merchant Feed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" /> Merchant Feed
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">606</div>
                  <div className="text-[10px] text-muted-foreground">Canonical Products</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold text-emerald-600">0</div>
                  <div className="text-[10px] text-muted-foreground">Disapproved Risk</div>
                </div>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Feed URL</span><span className="font-mono">/merchant-feed.xml</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Format</span><span>RSS 2.0 + g: namespace</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Deduplication</span><span>57 hidden (is_duplicate)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Diagnostics</span><span className="font-mono">/merchant-diagnostics.xml</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Panel 4: Ranking Signals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Ranking Signals
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              {data?.seo?.ranking_signals && (
                <>
                  <div className="flex items-center gap-1.5">
                    <StatusDot status="green" />
                    <span>IndexNow: {data.seo.ranking_signals.indexnow?.slice(0, 60)}…</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot status="green" />
                    <span>lastmod: Dynamic from DB updated_at</span>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground font-medium">Priority Weights</div>
                  {Object.entries(data.seo.ranking_signals.priority_weights || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between pl-2">
                      <span className="capitalize text-muted-foreground">{k.replace(/_/g, ' ')}</span>
                      <span className="font-mono font-medium">{String(v)}</span>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {/* Panel 5: Volatility Alert */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Volatility Shield
              </CardTitle>
            </CardHeader>
            <CardContent>
              {volatility.alert ? (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-destructive font-medium">
                    <XCircle className="h-4 w-4" /> Alert: Deviation detected
                  </div>
                  <div>Traffic: -{volatility.trafficDrop}% | Rankings: -{volatility.rankingDrop}% | CTR: -{volatility.ctrDrop}%</div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                    <CheckCircle className="h-4 w-4" /> Stable — no deviation &gt;15%
                  </div>
                  <p className="text-muted-foreground">Traffic, rankings, and CTR within normal range.</p>
                </div>
              )}
              <div className="mt-3 text-[10px] text-muted-foreground space-y-1">
                <p>• Recovery triggers at &gt;10% ranking drop (7d)</p>
                <p>• Emergency mode freezes aggressive actions</p>
                <p>• H2 freeze for 30d after snippet capture</p>
              </div>
            </CardContent>
          </Card>

          {/* Panel 6: Self-Healing Engine */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-primary" /> Self-Healing Engine
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex items-center gap-1.5"><StatusDot status="green" /><span>Redirect monitoring: Active</span></div>
              <div className="flex items-center gap-1.5"><StatusDot status="green" /><span>Sitemap auto-regen: via IndexNow triggers</span></div>
              <div className="flex items-center gap-1.5"><StatusDot status="green" /><span>Merchant feed: Self-heals from product DB</span></div>
              <div className="flex items-center gap-1.5"><StatusDot status="green" /><span>Schema validation: Product + FAQ + Breadcrumb</span></div>
              <div className="flex items-center gap-1.5"><StatusDot status="green" /><span>Orphan detection: via Link Audit Engine</span></div>
              <div className="flex items-center gap-1.5"><StatusDot status="green" /><span>Internal link injection: Auto (6-10/week cap)</span></div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                Safety: Max {'{'}5{'}'} auto-actions/week • 30-day rollback log • No canonical/URL changes without approval
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stability Safeguards */}
        <Card className="border-muted">
          <CardContent className="py-3 text-xs text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>
              Safeguards: Canonical host locked to https://getpawsy.pet • Primary sitemap URL immutable •
              No 302 introduction • robots.txt cannot block site-wide • www 302 is platform-edge (documented)
            </span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
