import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, CheckCircle, XCircle, AlertTriangle, Copy, RefreshCw,
  Wifi, WifiOff, Clock, Shield, Zap, ExternalLink, FileText,
} from 'lucide-react';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PingResult {
  engine: string;
  sitemapUrl: string;
  status: 'success' | 'timeout' | 'http_error';
  httpStatus?: number;
  duration_ms: number;
  error?: string;
}

interface PingLogEntry {
  id: string;
  engine: string;
  sitemap_url: string;
  status: string;
  http_status: number | null;
  duration_ms: number;
  error_message: string | null;
  reason: string | null;
  created_at: string;
}

const SITEMAP_OPTIONS = [
  { value: 'https://getpawsy.pet/sitemap.xml', label: '/sitemap.xml (index)' },
  { value: 'https://getpawsy.pet/sitemap-pages.xml', label: '/sitemap-pages.xml' },
  { value: 'https://getpawsy.pet/sitemap-products-1.xml', label: '/sitemap-products-1.xml' },
  { value: 'https://getpawsy.pet/sitemap-collections.xml', label: '/sitemap-collections.xml' },
  { value: 'https://getpawsy.pet/sitemap-guides.xml', label: '/sitemap-guides.xml' },
  { value: 'https://getpawsy.pet/sitemap-blog.xml', label: '/sitemap-blog.xml' },
];

const CHILD_SITEMAPS = [
  'sitemap-pages.xml',
  'sitemap-products-1.xml',
  'sitemap-collections.xml',
  'sitemap-guides.xml',
  'sitemap-blog.xml',
];

export default function SitemapPingPage() {
  const { invokeFunction } = useAuthenticatedFetch();
  const [sitemapUrl, setSitemapUrl] = useState(SITEMAP_OPTIONS[0].value);
  const [forceRun, setForceRun] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [lastResult, setLastResult] = useState<{ overallStatus: string; results: PingResult[]; summary: Record<string, number>; cached?: boolean; reason?: string } | null>(null);
  const [history, setHistory] = useState<PingLogEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await invokeFunction<{ ok: boolean; logs: PingLogEntry[] }>('sitemap-ping', {
      body: JSON.stringify({ action: 'history' }),
      silent: true,
    });
    if (data?.ok) setHistory(data.logs || []);
    setLoadingHistory(false);
  }, [invokeFunction]);

  const fetchStatus = useCallback(async () => {
    const { data } = await invokeFunction<{ ok: boolean } & Record<string, unknown>>('sitemap-ping', {
      body: JSON.stringify({ action: 'status' }),
      silent: true,
    });
    if (data?.ok) setStatus(data);
  }, [invokeFunction]);

  useEffect(() => {
    fetchHistory();
    fetchStatus();
  }, [fetchHistory, fetchStatus]);

  const handlePing = async () => {
    setPinging(true);
    const { data, error } = await invokeFunction<{ ok: boolean; overallStatus?: string; results?: PingResult[]; summary?: Record<string, number>; cached?: boolean; reason?: string }>('sitemap-ping', {
      body: JSON.stringify({ action: 'ping', sitemapUrl, force: forceRun }),
      silent: true,
    });

    if (error || !data?.ok) {
      toast.error(data?.reason || error?.message || 'Ping failed');
      setLastResult(null);
    } else if (data.cached) {
      toast.info('Idempotency: already pinged successfully within 10 minutes');
      setLastResult({ overallStatus: 'cached', results: [], summary: {}, cached: true, reason: data.reason });
    } else {
      setLastResult({
        overallStatus: data.overallStatus || 'unknown',
        results: data.results || [],
        summary: data.summary || {},
      });
      toast.success(`Ping complete: ${data.summary?.succeeded || 0}/${data.summary?.total || 0} succeeded`);
      fetchHistory();
      fetchStatus();
    }
    setPinging(false);
  };

  const copyPingUrl = (engine: string) => {
    const url = engine === 'indexnow'
      ? 'https://api.indexnow.org/indexnow'
      : 'https://www.bing.com/indexnow';
    navigator.clipboard.writeText(url);
    toast.success(`${engine} IndexNow URL copied`);
  };

  const overallBadge = lastResult?.overallStatus;

  return (
    <>
      <Helmet><title>Sitemap Ping | GetPawsy Admin</title></Helmet>
      <div className="container py-8 space-y-6 max-w-4xl">
        <div>
         <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wifi className="h-6 w-6 text-primary" />
            Indexing Accelerator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Notify search engines via IndexNow API. Google/Bing sitemap ping endpoints are deprecated — discovery happens via IndexNow + Search Console.
          </p>
        </div>

        {/* Status bar */}
        {status && (
          <div className="flex flex-wrap gap-3 text-xs">
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {(status as any).hourlyPingCount || 0}/{(status as any).maxPerHour || 12} pings/hr
            </Badge>
          </div>
        )}

        {/* Sitemap Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Sitemap Status</CardTitle>
            </div>
            <CardDescription>Current sitemap index and child sitemaps.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground">Index URL</span>
                <p className="text-sm font-mono">https://getpawsy.pet/sitemap.xml</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                  <a href="https://getpawsy.pet/sitemap.xml" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" /> Open
                  </a>
                </Button>
              </div>
            </div>
            <div className="border-t pt-2">
              <span className="text-xs text-muted-foreground block mb-1.5">Child Sitemaps ({CHILD_SITEMAPS.length})</span>
              <div className="grid gap-1">
                {CHILD_SITEMAPS.map(name => (
                  <div key={name} className="flex items-center justify-between px-2 py-1 rounded bg-muted/30 text-xs font-mono">
                    <span>/{name}</span>
                    <a
                      href={`https://getpawsy.pet/${name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t pt-2 text-[10px] text-muted-foreground">
              Sitemaps are generated at build time by <code>generate-sitemaps.mjs</code> and served as static XML files with <code>Content-Type: application/xml</code>.
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ping Controls</CardTitle>
            <CardDescription>Select sitemap target and run. Rate limit: 6 pings/hour per engine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 min-w-[200px]">
                <label className="text-xs text-muted-foreground">Sitemap URL</label>
                <Select value={sitemapUrl} onValueChange={setSitemapUrl}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SITEMAP_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer select-none pb-1">
                <Switch checked={forceRun} onCheckedChange={setForceRun} className="scale-75 origin-left" />
                <span className="text-[10px] text-muted-foreground">Force (ignore cache)</span>
              </label>

              <Button onClick={handlePing} disabled={pinging} size="sm" className="gap-1.5">
                {pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Ping Now
              </Button>
            </div>

            {/* Copy URL helpers */}
            <div className="flex gap-2 text-[10px]">
              <button onClick={() => copyPingUrl('indexnow')} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                <Copy className="h-3 w-3" /> Copy IndexNow API URL
              </button>
              <button onClick={() => copyPingUrl('bing')} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                <Copy className="h-3 w-3" /> Copy Bing IndexNow URL
              </button>
            </div>

            {/* Result */}
            {lastResult && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={overallBadge === 'ok' ? 'outline' : overallBadge === 'cached' ? 'secondary' : overallBadge === 'warning' ? 'outline' : 'destructive'}
                    className={cn(
                      'text-xs gap-1',
                      overallBadge === 'ok' && 'border-green-500 text-green-600',
                      overallBadge === 'warning' && 'border-yellow-500 text-yellow-600',
                    )}
                  >
                    {overallBadge === 'ok' ? <CheckCircle className="h-3 w-3" /> :
                     overallBadge === 'cached' ? <Clock className="h-3 w-3" /> :
                     overallBadge === 'warning' ? <AlertTriangle className="h-3 w-3" /> :
                     <XCircle className="h-3 w-3" />}
                    {overallBadge === 'ok' ? 'All Succeeded' :
                     overallBadge === 'cached' ? 'Cached (skipped)' :
                     overallBadge === 'warning' ? 'Partial Success' : 'Failed'}
                  </Badge>
                  {lastResult.cached && (
                    <span className="text-xs text-muted-foreground">{lastResult.reason}</span>
                  )}
                </div>

                {lastResult.results.length > 0 && (
                  <div className="space-y-1 text-xs font-mono">
                    {lastResult.results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-muted/30">
                        {r.status === 'success' ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" /> :
                         r.status === 'circuit_open' ? <WifiOff className="h-3 w-3 text-destructive shrink-0" /> :
                         <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                        <span className="font-medium w-12">{r.engine}</span>
                        <span className="text-muted-foreground">{r.status}</span>
                        {r.httpStatus && <Badge variant="outline" className="text-[8px] h-3.5 px-1">{r.httpStatus}</Badge>}
                        <span className="text-muted-foreground">{r.duration_ms}ms</span>
                        {r.attempt > 1 && <span className="text-yellow-500">retry #{r.attempt}</span>}
                        {r.error && <span className="text-destructive truncate max-w-[200px]" title={r.error}>{r.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Ping History</CardTitle>
                <CardDescription>Last 20 ping events across all engines.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchHistory} disabled={loadingHistory}>
                <RefreshCw className={cn("h-3.5 w-3.5", loadingHistory && "animate-spin")} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : history.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">No pings recorded yet.</p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-0.5 font-mono text-[11px]">
                  {history.slice(0, 20).map(entry => (
                    <div key={entry.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50">
                      {entry.status === 'success' ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" /> :
                       entry.status === 'circuit_open' ? <WifiOff className="h-3 w-3 text-muted-foreground shrink-0" /> :
                       <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                      <span className="text-muted-foreground/60 w-24 shrink-0">
                        {new Date(entry.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="font-medium w-12 shrink-0">{entry.engine}</span>
                      <Badge variant={entry.status === 'success' ? 'outline' : 'destructive'} className="text-[8px] h-3.5 px-1 shrink-0">
                        {entry.status}
                      </Badge>
                      {entry.http_status && <span className="text-muted-foreground">{entry.http_status}</span>}
                      <span className="text-muted-foreground">{entry.duration_ms}ms</span>
                      {entry.reason && <span className="text-muted-foreground/60">{entry.reason}</span>}
                      {entry.error_message && <span className="text-destructive truncate max-w-[150px]" title={entry.error_message}>{entry.error_message}</span>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
