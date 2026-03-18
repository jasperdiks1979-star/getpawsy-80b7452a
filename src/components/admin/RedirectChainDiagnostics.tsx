import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw,
  Globe, ExternalLink, ArrowRight, Shield,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RedirectHop {
  url: string;
  status: number | null;
  location: string | null;
  error?: string;
}

interface RedirectCheckResult {
  chain: RedirectHop[];
  finalStatus: number | null;
  finalUrl: string;
  is301: boolean;
  hopCount: number;
  apexStatus: number | null;
  apexOk: boolean;
  error?: string;
}

interface HealthEndpoint {
  path: string;
  label: string;
  status: number | null;
  ok: boolean;
}

export default function RedirectChainDiagnostics() {
  const [result, setResult] = useState<RedirectCheckResult | null>(null);
  const [endpoints, setEndpoints] = useState<HealthEndpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/site-monitor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ source: 'redirect-diagnostics' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Parse redirect chain from site-monitor response
      const wwwRedirect = data.results?.wwwRedirect;
      const redirectChain = data.results?.redirectChain;

      if (redirectChain) {
        setResult({
          chain: redirectChain.hops || [],
          finalStatus: redirectChain.finalStatus,
          finalUrl: redirectChain.finalUrl || 'https://getpawsy.pet/',
          is301: wwwRedirect?.status === 301,
          hopCount: redirectChain.hopCount || (redirectChain.hops?.length ?? 0),
          apexStatus: data.results?.homepage?.status,
          apexOk: data.results?.homepage?.ok,
        });
      } else {
        // Fallback to basic wwwRedirect data
        setResult({
          chain: [{
            url: 'https://www.getpawsy.pet/',
            status: wwwRedirect?.status,
            location: wwwRedirect?.location,
          }],
          finalStatus: wwwRedirect?.status,
          finalUrl: wwwRedirect?.location || 'unknown',
          is301: wwwRedirect?.status === 301,
          hopCount: 1,
          apexStatus: data.results?.homepage?.status,
          apexOk: data.results?.homepage?.ok,
        });
      }

      // Parse endpoint health
      const eps: HealthEndpoint[] = [
        { path: '/', label: 'Homepage', status: data.results?.homepage?.status, ok: data.results?.homepage?.ok },
        { path: '/sitemap.xml', label: 'Sitemap', status: data.results?.sitemap?.status, ok: data.results?.sitemap?.ok },
        { path: '/robots.txt', label: 'Robots.txt', status: data.results?.robots?.status, ok: data.results?.robots?.ok },
        { path: '/merchant-feed.xml', label: 'Merchant Feed', status: data.results?.merchantFeed?.status, ok: data.results?.merchantFeed?.ok },
      ];
      setEndpoints(eps);
      setLastChecked(new Date().toISOString());
    } catch (err: any) {
      setResult({
        chain: [],
        finalStatus: null,
        finalUrl: '',
        is301: false,
        hopCount: 0,
        apexStatus: null,
        apexOk: false,
        error: err.message,
      });
      toast.error(`Check failed: ${err.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { runCheck(); }, [runCheck]);

  const wwwIs301 = result?.is301 === true;
  const singleHop = result ? result.hopCount <= 1 : false;
  const apexOk = result?.apexOk === true;
  const allGood = wwwIs301 && singleHop && apexOk;

  return (
    <Card className={`mb-6 ${allGood ? 'border-primary/20' : 'border-destructive/40 bg-destructive/5'}`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Redirect &amp; Headers Diagnostics
        </CardTitle>
        <div className="flex items-center gap-2">
          {result && (
            <Badge variant={allGood ? 'default' : 'destructive'}>
              {allGood ? '✅ All OK' : '⚠️ Issues'}
            </Badge>
          )}
          <Button size="sm" variant="ghost" onClick={runCheck} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && !result ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : result?.error && result.chain.length === 0 ? (
          <div className="text-sm text-destructive">Error: {result.error}</div>
        ) : result ? (
          <>
            {/* ── Redirect Chain Visualization ── */}
            <div>
              <p className="text-sm font-medium mb-2">WWW → Apex Redirect Chain</p>
              <div className="border rounded-lg p-3 space-y-2">
                {/* Chain visualization */}
                <div className="flex flex-wrap items-center gap-1 text-xs font-mono">
                  <span className="bg-muted px-2 py-1 rounded">www.getpawsy.pet</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant={wwwIs301 ? 'default' : 'destructive'} className="font-mono">
                    {result.chain[0]?.status ?? 'err'}
                  </Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="bg-muted px-2 py-1 rounded">getpawsy.pet</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant={apexOk ? 'default' : 'destructive'} className="font-mono">
                    {result.apexStatus ?? 'err'}
                  </Badge>
                </div>

                {/* Details */}
                <div className="text-xs space-y-1 text-muted-foreground mt-2">
                  <div className="flex items-center gap-2">
                    {wwwIs301 ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                    <span>WWW redirect status: <strong className={wwwIs301 ? 'text-green-600' : 'text-red-500'}>{result.chain[0]?.status ?? 'error'}</strong> {wwwIs301 ? '(permanent)' : '(NOT permanent — SEO risk!)'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {singleHop ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                    <span>Hops: <strong>{result.hopCount}</strong> {singleHop ? '(single hop ✓)' : '(multiple hops — latency risk!)'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apexOk ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                    <span>Apex response: <strong>{result.apexStatus ?? 'error'}</strong></span>
                  </div>
                  {result.chain[0]?.location && (
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Location header: <code className="bg-muted px-1 rounded">{result.chain[0].location}</code></span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Canonical redirect alert ── */}
            {!wwwIs301 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      www → apex redirect is not permanent yet
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expected behavior is a single-hop <code className="bg-muted px-1 rounded">301</code> redirect from
                      <code className="bg-muted px-1 rounded ml-1">https://www.getpawsy.pet/*</code> to
                      <code className="bg-muted px-1 rounded ml-1">https://getpawsy.pet/:path</code>.
                    </p>
                  </div>
                </div>

                <div className="text-xs space-y-2 text-muted-foreground">
                  <p className="font-medium text-foreground">Required Cloudflare cleanup:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Keep exactly one Redirect Rule for <code className="bg-muted px-1 rounded">www.getpawsy.pet</code> → apex with status <code className="bg-muted px-1 rounded">301</code></li>
                    <li>Remove conflicting Page Rules, Bulk Redirects, Transform Rules, and Workers</li>
                    <li>Purge cache after the rule is updated to eliminate stale 302 responses</li>
                  </ul>
                </div>
              </div>
            )}

            {/* ── Endpoint Health ── */}
            {endpoints.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Endpoint Health</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {endpoints.map(ep => (
                    <div key={ep.path} className="border rounded-lg p-2 text-xs">
                      <div className="flex items-center gap-1 mb-1">
                        {ep.ok ? <CheckCircle className="h-3 w-3 text-green-600" /> : <XCircle className="h-3 w-3 text-red-500" />}
                        <span className="font-medium">{ep.label}</span>
                      </div>
                      <code className="text-muted-foreground">{ep.status ?? 'err'}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Summary one-liner ── */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono">
              <span className="text-muted-foreground">Chain: </span>
              www.getpawsy.pet{' '}
              <span className={wwwIs301 ? 'text-green-600' : 'text-red-500'}>
                {result.chain[0]?.status ?? '?'}
              </span>
              {' → '}getpawsy.pet{' '}
              <span className={apexOk ? 'text-green-600' : 'text-red-500'}>
                {result.apexStatus ?? '?'}
              </span>
            </div>

            {lastChecked && (
              <p className="text-[10px] text-muted-foreground">
                Laatst gecontroleerd: {new Date(lastChecked).toLocaleString()}
              </p>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
