import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2, RefreshCw, ShieldCheck, AlertTriangle, Globe, FileText, Truck, Image, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Helmet } from 'react-helmet-async';

interface HealthResult {
  ok: boolean;
  healthy: boolean;
  ts: string;
  siteReachable: boolean;
  policyPages: Record<string, boolean>;
  feedConsistency: {
    priceMatch: boolean;
    availabilityMatch: boolean;
    mismatches: Array<{ id: string; issue: string }>;
  };
  shippingClaims: Record<string, boolean>;
  imageHealth: {
    imagesReachable: boolean;
    encodingValid: boolean;
    issues: Array<{ id: string; issue: string }>;
  };
  categoryHealth: {
    missingCategories: number;
  };
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {ok ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" /> : <XCircle className="w-4 h-4 text-destructive shrink-0" />}
      <span className="text-sm">{label}</span>
    </div>
  );
}

export default function MerchantHealthPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/merchant-health`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Health check failed');
      setResult(json);
      setLastRun(json.ts);
      toast.success(json.healthy ? 'All checks passed' : 'Issues detected');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Load last check from logs on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('cron_job_logs')
        .select('details, completed_at')
        .eq('job_name', 'merchant-health-check')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.details) {
        setResult(data.details as unknown as HealthResult);
        setLastRun(data.completed_at);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <Helmet><meta name="robots" content="noindex,nofollow" /></Helmet>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Merchant Center Health
          </h1>
          <p className="text-muted-foreground text-sm">
            Anti-suspension shield — continuous compliance monitoring
            {lastRun && <span className="ml-2 text-xs">Last check: {new Date(lastRun).toLocaleString()}</span>}
          </p>
        </div>
        <Button onClick={runCheck} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Run Health Check
        </Button>
      </div>

      {result && (
        <>
          {/* Overall Status */}
          <div className={`rounded-xl p-5 border-2 ${result.healthy ? 'bg-green-50 dark:bg-green-950/20 border-green-300' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300'}`}>
            <div className="flex items-center gap-3">
              {result.healthy ? <ShieldCheck className="w-8 h-8 text-green-600" /> : <AlertTriangle className="w-8 h-8 text-amber-600" />}
              <div>
                <h2 className="text-lg font-bold">{result.healthy ? 'Store Compliant' : 'Issues Detected'}</h2>
                <p className="text-sm text-muted-foreground">
                  {result.healthy ? 'All merchant compliance checks passed.' : 'Fix issues below to prevent suspension.'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Site Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4" /> Site Status</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBadge ok={result.siteReachable} label="Site reachable" />
              </CardContent>
            </Card>

            {/* Policy Pages */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Policy Pages</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.entries(result.policyPages).map(([key, ok]) => (
                  <StatusBadge key={key} ok={ok} label={`/${key}`} />
                ))}
              </CardContent>
            </Card>

            {/* Shipping Claims */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> Shipping Claims</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.entries(result.shippingClaims).map(([key, ok]) => (
                  <StatusBadge key={key} ok={ok} label={key.replace(/([A-Z])/g, ' $1').trim()} />
                ))}
              </CardContent>
            </Card>

            {/* Feed Consistency */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Tag className="w-4 h-4" /> Feed Consistency</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBadge ok={result.feedConsistency.priceMatch} label="Price match" />
                <StatusBadge ok={result.feedConsistency.availabilityMatch} label="Availability match" />
                {result.feedConsistency.mismatches.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {result.feedConsistency.mismatches.map(m => (
                      <div key={m.id} className="truncate">⚠ {m.id.slice(0, 8)}… — {m.issue}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Image Health */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Image className="w-4 h-4" /> Image Health</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBadge ok={result.imageHealth.imagesReachable} label="Images reachable" />
                <StatusBadge ok={result.imageHealth.encodingValid} label="Encoding valid" />
                {result.imageHealth.issues.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {result.imageHealth.issues.map(i => (
                      <div key={i.id} className="truncate">⚠ {i.id.slice(0, 8)}… — {i.issue}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Health */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Tag className="w-4 h-4" /> Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBadge ok={result.categoryHealth.missingCategories === 0} label={`${result.categoryHealth.missingCategories} products missing category`} />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Click "Run Health Check" to scan your storefront for compliance issues.</p>
        </div>
      )}
    </div>
  );
}
