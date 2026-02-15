import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

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
  const { isAdmin } = useAuth();
  const [checks, setChecks] = useState<HealthCheck[]>(
    CHECKS.map(c => ({ ...c, status: null, contentType: null, bodyPreview: null, ok: false, loading: false, error: null }))
  );
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [runningAll, setRunningAll] = useState(false);

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
