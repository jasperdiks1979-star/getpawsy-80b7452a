import { useState, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, Loader2, ArrowLeft, Download, FileArchive, ShieldCheck, Globe, Activity, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { getConsent } from '@/lib/cookieConsent';
import { SITE_URL } from '@/lib/constants';

const WebVitalsDashboard = lazy(() => import('@/components/admin/WebVitalsDashboard'));
const CwvValidationModule = lazy(() => import('@/components/admin/CwvValidationModule'));
const CwvTrendDashboard = lazy(() => import('@/components/admin/CwvTrendDashboard'));
const RedirectChainDiagnostics = lazy(() => import('@/components/admin/RedirectChainDiagnostics'));

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
  const [jsonExportState, setJsonExportState] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [jsonExportError, setJsonExportError] = useState<string | null>(null);

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

  const downloadFullJson = async () => {
    setJsonExportState('generating');
    setJsonExportError(null);

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/full-diagnostics`, {
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

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
      a.download = 'getpawsy-system-diagnostics.json';
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setJsonExportState('done');
      toast.success('Full System Diagnostics JSON gedownload!');
    } catch (err: any) {
      setJsonExportState('error');
      setJsonExportError(err.message);
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

      {/* Automated Monitoring Status */}
      <MonitoringStatusCard />

      {/* Robots Integrity Status */}
      <RobotsIntegrityCard />

      {/* WWW Redirect Advisory */}
      <WwwRedirectAdvisory />

      {/* Full System Diagnostics JSON */}
      <Card className="mb-6 border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-5 w-5" />
            Full System Diagnostics (JSON)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Download 1 compleet JSON bestand met alle statuschecks, headers, sitemap info, merchant feed analyse, en performance data.
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={downloadFullJson}
              disabled={jsonExportState === 'generating'}
              size="lg"
              className="gap-2"
            >
              {jsonExportState === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : jsonExportState === 'done' ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Gedownload — klik opnieuw
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download Full Diagnostics (JSON)
                </>
              )}
            </Button>
            {jsonExportState === 'error' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-destructive">{jsonExportError}</span>
                <Button size="sm" variant="outline" onClick={downloadFullJson}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Diagnostics Export (ZIP) */}
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

      {/* Quick Links to Sub-Reports */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Diagnostic Sub-Reports</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link to="/admin/redirect-check">
            <Button variant="outline" size="sm" className="gap-2">
              <Globe className="h-4 w-4" /> Redirect &amp; Cache Check
            </Button>
          </Link>
          <Link to="/admin/feed-gap-report">
            <Button variant="outline" size="sm" className="gap-2">
              <AlertTriangle className="h-4 w-4" /> Feed Gap Report
            </Button>
          </Link>
          <Link to="/admin/feed-insights">
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" /> Feed Insights
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* CWV Validation Module */}
      <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
        <CwvValidationModule />
      </Suspense>

      {/* LCP Investigation Events */}
      <LCPEventsCard />

      {/* CWV Field Data Trends (30 days) */}
      <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
        <CwvTrendDashboard />
      </Suspense>

      {/* Web Vitals Field Data */}
      <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
        <WebVitalsDashboard />
      </Suspense>

      {/* Redirect Chain Diagnostics */}
      <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
        <RedirectChainDiagnostics />
      </Suspense>

      {/* SEO Redirect Advisory */}
      <Card className="mb-6 border-amber-500/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-amber-500" />
            SEO Redirect Note: www → apex 302
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            The <code className="text-xs bg-muted px-1 rounded">www.getpawsy.pet → getpawsy.pet</code> redirect returns <strong>302</strong> instead of 301.
            This is a <strong>platform-level</strong> behavior from the hosting edge and <strong>cannot be changed</strong> per-project.
          </p>
          <div className="bg-muted rounded-lg p-3 space-y-1">
            <p className="font-medium">Why this is acceptable:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Google treats 302 = 301 when canonical signals are consistent</li>
              <li>All canonical tags → <code className="text-xs">https://getpawsy.pet</code> ✅</li>
              <li>All sitemap URLs use apex domain only ✅</li>
              <li>All internal links use apex domain ✅</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            No action required. GSC "Page with redirect" for www URLs is expected and benign.
          </p>
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

  const XML_ENDPOINTS = ['/sitemap.xml', '/merchant-feed.xml', '/merchant-diagnostics.xml', '/sitemap_index.xml'];
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

/* ---- Automated Monitoring Status Sub-component ---- */
function MonitoringStatusCard() {
  const [latestCheck, setLatestCheck] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningManual, setRunningManual] = useState(false);

  const loadChecks = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('site_health_checks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data && data.length > 0) {
        setLatestCheck(data[0]);
        setHistory(data);
      }
    } catch {
      // silent
    }
    setLoading(false);
  };

  const runManualCheck = async () => {
    setRunningManual(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/site-monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'manual' }),
      });
      if (res.ok) {
        toast.success('Monitoring check voltooid!');
        await loadChecks();
      } else {
        toast.error('Check mislukt');
      }
    } catch {
      toast.error('Check mislukt');
    }
    setRunningManual(false);
  };

  useEffect(() => { loadChecks(); }, []);

  const results = latestCheck?.results as Record<string, any> | undefined;
  const warnings = (latestCheck?.warnings as string[]) || [];

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Automated Monitoring
          {latestCheck && (
            <Badge variant={latestCheck.all_healthy ? 'default' : 'destructive'} className="ml-2">
              {latestCheck.all_healthy ? '✅ All Healthy' : `⚠️ ${warnings.length} Warning(s)`}
            </Badge>
          )}
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={loadChecks} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={runManualCheck} disabled={runningManual}>
            {runningManual ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Activity className="h-3 w-3 mr-1" />}
            Run Now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !latestCheck ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !latestCheck ? (
          <p className="text-sm text-muted-foreground">Geen monitoring data. Klik "Run Now" om te starten.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Laatste check: {new Date(latestCheck.created_at).toLocaleString()} · Type: {latestCheck.check_type} · Elke 10 min automatisch
            </p>

            {/* Endpoint results grid */}
            {results && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(results).map(([key, val]: [string, any]) => (
                  <div key={key} className="border rounded-lg p-2 text-xs">
                    <p className="font-medium mb-1">{key}</p>
                    <div className="flex items-center gap-1">
                      {val.ok ? (
                        <CheckCircle className="h-3 w-3 text-primary" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive" />
                      )}
                      <span>{val.status || 'err'}</span>
                      {val.ttfb_ms && <span className="text-muted-foreground">· {val.ttfb_ms}ms</span>}
                    </div>
                    {val.contentType && (
                      <p className="text-muted-foreground truncate mt-0.5">{val.contentType}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="bg-destructive/10 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Warnings
                </p>
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-destructive">{w}</p>
                ))}
              </div>
            )}

            {/* History */}
            {history.length > 1 && (
              <details>
                <summary className="text-xs text-muted-foreground cursor-pointer">Laatste {history.length} checks</summary>
                <div className="mt-2 space-y-1">
                  {history.map((h, i) => (
                    <div key={h.id} className="text-xs flex items-center gap-2 border-b pb-1">
                      {h.all_healthy ? (
                        <CheckCircle className="h-3 w-3 text-primary" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive" />
                      )}
                      <span>{new Date(h.created_at).toLocaleString()}</span>
                      <span className="text-muted-foreground">{h.check_type}</span>
                      {(h.warnings as string[])?.length > 0 && (
                        <span className="text-destructive">{(h.warnings as string[]).length} warning(s)</span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---- Robots Integrity Card Sub-component ---- */
function RobotsIntegrityCard() {
  const [data, setData] = useState<{ ok: boolean; missingDirectives: string[]; bodySnippet: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data: checks } = await supabase
        .from('site_health_checks')
        .select('results')
        .order('created_at', { ascending: false })
        .limit(1);
      const ri = (checks?.[0]?.results as any)?.robotsIntegrity;
      if (ri) setData(ri);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return null;
  if (!data) return null;

  return (
    <Card className={`mb-6 ${data.ok ? 'border-primary/20' : 'border-destructive/50 bg-destructive/5'}`}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {data.ok ? (
              <CheckCircle className="h-4 w-4 text-primary" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <span className="text-sm font-medium">
              Robots.txt Integrity: {data.ok ? 'Valid ✅' : 'FAILED ❌'}
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {!data.ok && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-destructive font-medium">Missing required directives:</p>
            {data.missingDirectives.map((d, i) => (
              <p key={i} className="text-xs text-destructive font-mono">• {d}</p>
            ))}
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">Fetched body snippet</summary>
              <pre className="mt-1 p-2 bg-muted rounded text-[10px] overflow-x-auto whitespace-pre-wrap">{data.bodySnippet}</pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---- WWW Redirect Advisory Sub-component ---- */
function WwwRedirectAdvisory() {
  const [chain, setChain] = useState<{ hops: any[]; finalStatus: number | null; finalUrl: string; hopCount: number; error?: string } | null>(null);
  const [wwwStatus, setWwwStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data: checks } = await supabase
        .from('site_health_checks')
        .select('results')
        .order('created_at', { ascending: false })
        .limit(1);
      const r = checks?.[0]?.results as any;
      if (r?.redirectChain) setChain(r.redirectChain);
      if (r?.wwwRedirect) setWwwStatus(r.wwwRedirect.status);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading || !chain) return null;

  const is301 = wwwStatus === 301;

  return (
    <Card className={`mb-6 ${is301 ? 'border-primary/20' : 'border-amber-500/50 bg-amber-500/5'}`}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {is301 ? (
              <CheckCircle className="h-4 w-4 text-primary" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            <span className="text-sm font-medium">
              WWW → Apex Redirect: {is301 ? '301 ✅' : `${wwwStatus ?? 'unknown'} ⚠️`}
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {!is301 && (
          <div className="bg-amber-500/10 rounded-lg p-3 text-xs space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              www → apex returns {wwwStatus ?? '?'} due to Lovable edge/CDN layer.
            </p>
            <p className="text-muted-foreground">
              Ensure <code className="bg-muted px-1 rounded">getpawsy.pet</code> is <strong>Primary</strong> and <code className="bg-muted px-1 rounded">www.getpawsy.pet</code> is <strong>Alias</strong> in Lovable Domains. In Cloudflare set records to <strong>DNS-only (grey cloud)</strong>.
            </p>
          </div>
        )}

        {/* Redirect chain log */}
        <details>
          <summary className="text-xs text-muted-foreground cursor-pointer">
            Redirect chain ({chain.hopCount} hop{chain.hopCount !== 1 ? 's' : ''}) → {chain.finalUrl}
          </summary>
          <div className="mt-2 space-y-1">
            {chain.hops.map((hop: any, i: number) => (
              <div key={i} className="text-xs flex items-center gap-2 border-b pb-1">
                <Badge variant={hop.status >= 300 && hop.status < 400 ? 'secondary' : hop.status === 200 ? 'default' : 'destructive'} className="font-mono text-[10px]">
                  {hop.status}
                </Badge>
                <code className="truncate max-w-[300px]">{hop.url}</code>
                {hop.location && (
                  <span className="text-muted-foreground">→ <code className="truncate max-w-[200px]">{hop.location}</code></span>
                )}
              </div>
            ))}
            {chain.error && <p className="text-xs text-destructive">{chain.error}</p>}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/* ---- WWW Redirect Warning Sub-component ---- */
function WwwRedirectWarning() {
  const [status, setStatus] = useState<number | string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const check = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/full-diagnostics`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const diag = await res.json();
      setStatus(diag.crawlConfig?.wwwRedirectStatus ?? "unknown");
    } catch (err: any) {
      setStatus(`error: ${err.message}`);
    }
    setChecked(true);
    setLoading(false);
  };

  useEffect(() => { check(); }, []);

  const is301 = status === 301;

  if (!checked && !loading) return null;

  return (
    <Card className={`mb-6 ${is301 ? 'border-primary/20' : 'border-destructive/50 bg-destructive/5'}`}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : is301 ? (
              <CheckCircle className="h-4 w-4 text-primary" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <span className="text-sm font-medium">
              WWW → Apex Redirect: {loading ? 'Checking…' : is301 ? '301 ✅' : `${status} ❌`}
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={check} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {checked && !is301 && !loading && (
          <p className="text-xs text-destructive mt-2">
            CRITICAL: www redirect is not 301 (SEO consolidation risk). Check domain settings.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---- LCP Events Diagnostics Card ---- */
function LCPEventsCard() {
  const [events, setEvents] = useState<any[]>([]);
  
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('getpawsy_lcp_events');
      if (raw) setEvents(JSON.parse(raw));
    } catch { /* silent */ }
  }, []);

  const slowEvents = events.filter(e => e.lcpMs > 4000);
  const productVariants = events
    .filter(e => e.route.startsWith('/products'))
    .sort((a, b) => b.lcpMs - a.lcpMs)
    .slice(0, 5);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          LCP Investigation Events (Session)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No LCP events captured yet. Navigate to pages with <code>?debugVitals=1</code> to start collecting.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex gap-4 text-sm">
              <span>Total: <strong>{events.length}</strong></span>
              <span className={slowEvents.length > 0 ? 'text-destructive' : 'text-primary'}>
                Slow (&gt;4s): <strong>{slowEvents.length}</strong>
              </span>
            </div>

            {/* Worst /products variants */}
            {productVariants.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Top 5 Worst /products Variants</h4>
                <div className="space-y-1">
                  {productVariants.map((ev, i) => (
                    <div key={i} className="flex justify-between text-xs border rounded p-2">
                      <code className="truncate max-w-[200px]">{ev.route}</code>
                      <span className={ev.lcpMs > 4000 ? 'text-destructive font-bold' : ev.lcpMs > 2500 ? 'text-yellow-600' : 'text-primary'}>
                        {Math.round(ev.lcpMs)}ms
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent events table */}
            <details>
              <summary className="text-sm cursor-pointer font-medium">All events ({events.length})</summary>
              <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                {events.map((ev, i) => (
                  <div key={i} className="text-xs border rounded p-2 flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <code className="block truncate">{ev.route}</code>
                      <span className="text-muted-foreground">{ev.element || 'n/a'}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={ev.lcpMs > 4000 ? 'text-destructive font-bold' : ev.lcpMs > 2500 ? 'text-yellow-600' : 'text-primary'}>
                        {Math.round(ev.lcpMs)}ms
                      </span>
                      <div className="text-muted-foreground">{ev.deviceHint}</div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
