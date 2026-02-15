import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, Loader2, ArrowLeft, Download, FileArchive, ShieldCheck, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { getConsent } from '@/lib/cookieConsent';
import { SITE_URL } from '@/lib/constants';

interface HealthCheck {
  url: string;
  label: string;
  status: number | null;
  contentType: string | null;
  bodyPreview: string | null;
  ok: boolean;
  loading: boolean;
  error: string | null;
}

interface ErrorLog {
  id: string;
  error_message: string;
  error_type: string;
  page_url: string | null;
  component_name: string | null;
  created_at: string;
}

const CHECKS = [
  { url: '/', label: 'Homepage' },
  { url: '/sitemap.xml', label: 'Sitemap XML' },
  { url: '/merchant-feed.xml', label: 'Merchant Feed XML' },
  { url: '/robots.txt', label: 'Robots.txt' },
];

export default function DiagnosticsPage() {
  const { isAdmin, session } = useAuth();
  const [checks, setChecks] = useState<HealthCheck[]>(
    CHECKS.map(c => ({ ...c, status: null, contentType: null, bodyPreview: null, ok: false, loading: false, error: null }))
  );
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  const runCheck = async (index: number) => {
    const check = checks[index];
    setChecks(prev => prev.map((c, i) => i === index ? { ...c, loading: true, error: null } : c));

    try {
      const baseUrl = window.location.origin;
      const url = `${baseUrl}${check.url}`;
      const res = await fetch(url, { cache: 'no-store' });
      const ct = res.headers.get('content-type') || 'unknown';
      const text = await res.text();
      const preview = text.substring(0, 300);

      let isOk = res.status === 200;
      if (check.url.endsWith('.xml')) {
        isOk = isOk && (ct.includes('xml') || ct.includes('text/xml') || text.trimStart().startsWith('<?xml'));
      }

      setChecks(prev => prev.map((c, i) => i === index ? {
        ...c, status: res.status, contentType: ct, bodyPreview: preview, ok: isOk, loading: false, error: null
      } : c));
    } catch (err: any) {
      setChecks(prev => prev.map((c, i) => i === index ? {
        ...c, status: null, contentType: null, bodyPreview: null, ok: false, loading: false, error: err.message
      } : c));
    }
  };

  const runAllChecks = async () => {
    setRunningAll(true);
    await Promise.all(checks.map((_, i) => runCheck(i)));
    setRunningAll(false);
  };

  const loadErrors = async () => {
    setLoadingErrors(true);
    try {
      const { data } = await supabase
        .from('frontend_error_logs')
        .select('id, error_message, error_type, page_url, component_name, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      setErrors(data || []);
    } catch {
      // silent
    }
    setLoadingErrors(false);
  };

  const downloadBundle = async () => {
    setExportState('generating');
    setExportError(null);

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/export-diagnostics`, {
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.status === 429) {
        throw new Error('Rate limited — wacht 60 seconden en probeer opnieuw.');
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('Geen toegang. Ben je ingelogd als admin?');
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disposition = res.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] || 'getpawsy-diagnostics.zip';
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportState('done');
      toast.success('Diagnostics bundle gedownload!');
    } catch (err: any) {
      setExportState('error');
      setExportError(err.message);
      toast.error(`Export mislukt: ${err.message}`);
    }
  };

  useEffect(() => {
    runAllChecks();
    loadErrors();
  }, []);

  if (!isAdmin) return <Navigate to="/" replace />;

  const allGreen = checks.every(c => c.ok);

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/dashboard">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">Site Diagnostics</h1>
        <Badge variant={allGreen ? 'default' : 'destructive'}>
          {allGreen ? '✅ All Healthy' : '⚠️ Issues Detected'}
        </Badge>
      </div>

      {/* Diagnostics Export */}
      <Card className="mb-6 border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            Diagnostics Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Download een complete diagnostics bundle (.zip) met logs, config, routes, sitemap/feed checks. 
            <br />
            <span className="text-xs">Bevat geen secrets, API keys of klantdata. Veilig om te delen met ChatGPT.</span>
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={downloadBundle}
              disabled={exportState === 'generating'}
              size="lg"
              className="gap-2"
            >
              {exportState === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : exportState === 'done' ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Download ready — klik opnieuw
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download diagnostics bundle (.zip)
                </>
              )}
            </Button>
            {exportState === 'error' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-destructive">{exportError}</span>
                <Button size="sm" variant="outline" onClick={downloadBundle}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Domain & DNS Info */}
      <DomainDnsCard />

      {/* Consent & Tracking Diagnostics */}
      <ConsentDiagnosticsCard />

      {/* Health Checks */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Health Checks</CardTitle>
          <Button size="sm" onClick={runAllChecks} disabled={runningAll}>
            <RefreshCw className={`h-4 w-4 mr-1 ${runningAll ? 'animate-spin' : ''}`} />
            Run All
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {checks.map((check, i) => (
            <div key={check.url} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {check.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : check.ok ? (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  ) : check.error || check.status !== null ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-accent-foreground" />
                  )}
                  <span className="font-medium">{check.label}</span>
                  <code className="text-xs text-muted-foreground">{check.url}</code>
                </div>
                <Button size="sm" variant="ghost" onClick={() => runCheck(i)} disabled={check.loading}>
                  Re-check
                </Button>
              </div>
              {(check.status !== null || check.error) && (
                <div className="text-xs space-y-1 text-muted-foreground">
                  {check.status !== null && <p>Status: <span className={check.status === 200 ? 'text-primary' : 'text-destructive'}>{check.status}</span></p>}
                  {check.contentType && <p>Content-Type: <code>{check.contentType}</code></p>}
                  {check.error && <p className="text-destructive">Error: {check.error}</p>}
                  {check.bodyPreview && (
                    <details>
                      <summary className="cursor-pointer">Body preview</summary>
                      <pre className="mt-1 p-2 bg-muted rounded text-[10px] overflow-x-auto whitespace-pre-wrap">{check.bodyPreview}</pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recent Errors */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Errors (last 50)</CardTitle>
          <Button size="sm" variant="outline" onClick={loadErrors} disabled={loadingErrors}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loadingErrors ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <p className="text-muted-foreground text-sm">No errors recorded.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {errors.map(e => (
                <div key={e.id} className="border rounded p-3 text-xs">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-destructive">{e.error_type}</span>
                    <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1">{e.error_message.substring(0, 200)}</p>
                  {e.page_url && <p className="text-muted-foreground mt-1">Page: {e.page_url}</p>}
                  {e.component_name && <p className="text-muted-foreground">Component: {e.component_name}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---- Consent & Tracking Diagnostics Sub-component ---- */
function ConsentDiagnosticsCard() {
  const consent = getConsent();
  const gtagLoaded = typeof window !== 'undefined' && typeof window.gtag === 'function';
  const pinterestLoaded = typeof window !== 'undefined' && typeof (window as any).pintrk === 'function';
  const swRegistered = 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;

  const XML_ENDPOINTS = ['/sitemap.xml', '/merchant-feed.xml', '/sitemap_index.xml'];
  const [xmlResults, setXmlResults] = useState<Record<string, { status: number; contentType: string; cacheControl: string } | null>>({});
  const [checking, setChecking] = useState(false);

  const checkXml = async () => {
    setChecking(true);
    const results: typeof xmlResults = {};
    await Promise.all(XML_ENDPOINTS.map(async (ep) => {
      try {
        const res = await fetch(ep, { method: 'HEAD', cache: 'no-store' });
        results[ep] = {
          status: res.status,
          contentType: res.headers.get('content-type') || '—',
          cacheControl: res.headers.get('cache-control') || '—',
        };
      } catch {
        results[ep] = null;
      }
    }));
    setXmlResults(results);
    setChecking(false);
  };

  useEffect(() => { checkXml(); }, []);

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Consent &amp; Tracking Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="border rounded-lg p-3">
            <p className="text-muted-foreground text-xs mb-1">Consent</p>
            <Badge variant={consent === 'all' ? 'default' : 'secondary'}>{consent ?? 'none'}</Badge>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-muted-foreground text-xs mb-1">gtag loaded</p>
            <Badge variant={gtagLoaded ? 'default' : 'destructive'}>{gtagLoaded ? 'yes' : 'no'}</Badge>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-muted-foreground text-xs mb-1">Pinterest loaded</p>
            <Badge variant={pinterestLoaded ? 'default' : 'secondary'}>{pinterestLoaded ? 'yes' : 'no'}</Badge>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-muted-foreground text-xs mb-1">Service Worker</p>
            <Badge variant={swRegistered ? 'default' : 'secondary'}>{swRegistered ? 'active' : 'none'}</Badge>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">XML Endpoint Checks</p>
            <Button size="sm" variant="outline" onClick={checkXml} disabled={checking}>
              <RefreshCw className={`h-3 w-3 mr-1 ${checking ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          <div className="space-y-2">
            {XML_ENDPOINTS.map(ep => {
              const r = xmlResults[ep];
              return (
                <div key={ep} className="border rounded p-2 text-xs flex items-center justify-between gap-2">
                  <code>{ep}</code>
                  {r ? (
                    <span className="flex items-center gap-2">
                      <Badge variant={r.status === 200 ? 'default' : 'destructive'}>{r.status}</Badge>
                      <span className="text-muted-foreground truncate max-w-[180px]">{r.contentType}</span>
                      <span className="text-muted-foreground truncate max-w-[180px]">{r.cacheControl}</span>
                    </span>
                  ) : r === null ? (
                    <span className="text-destructive">failed</span>
                  ) : (
                    <span className="text-muted-foreground">…</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---- Domain & DNS Info Sub-component ---- */
function DomainDnsCard() {
  const DNS_RECORDS = [
    { type: 'A', name: '@', value: '185.158.133.1', note: 'Root domain' },
    { type: 'A', name: 'www', value: '185.158.133.1', note: 'WWW subdomain (301 → apex)' },
    { type: 'TXT', name: '_lovable', value: 'lovable_verify=...', note: 'Domain verification' },
    { type: 'TXT', name: '_lovable.www', value: 'lovable_verify=...', note: 'WWW verification' },
  ];

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Domain &amp; DNS Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="border rounded-lg p-3">
            <p className="text-muted-foreground text-xs mb-1">Canonical Domain (SITE_URL)</p>
            <code className="text-sm font-medium">{SITE_URL}</code>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-muted-foreground text-xs mb-1">Current Host</p>
            <code className="text-sm font-medium">{window.location.hostname}</code>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Expected DNS Records (Cloudflare — DNS Only / Grey Cloud)</p>
          <div className="space-y-1">
            {DNS_RECORDS.map((r, i) => (
              <div key={i} className="border rounded p-2 text-xs flex items-center gap-3">
                <Badge variant="secondary" className="font-mono">{r.type}</Badge>
                <code className="font-medium min-w-[80px]">{r.name}</code>
                <span className="text-muted-foreground">→</span>
                <code className="text-primary">{r.value}</code>
                <span className="text-muted-foreground ml-auto">{r.note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
          <p><strong>Lovable Settings:</strong> Set <code>getpawsy.pet</code> as Primary domain, <code>www.getpawsy.pet</code> as alias.</p>
          <p><strong>GSC Sitemap:</strong> Submit only <code>https://getpawsy.pet/sitemap.xml</code> (sitemap index). No www variant needed.</p>
          <p><strong>MX/TXT mail records:</strong> Keep untouched. Only modify A and TXT _lovable records.</p>
          <p><strong>No client-side redirects:</strong> Domain normalization is handled server-side (nginx 301).</p>
        </div>
      </CardContent>
    </Card>
  );
}
