import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { toast } from 'sonner';
import {
  RefreshCw,
  Link2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MerchantStatus {
  connected: boolean;
  merchantCenterId: string | null;
  tokenCreatedAt: string | null;
  tokenRefreshedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSync: {
    status: string;
    startedAt: string;
    completedAt: string | null;
    totalProducts: number | null;
    productsWithIssues: number | null;
    errorMessage: string | null;
  } | null;
}

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  total_products: number | null;
  products_with_issues: number | null;
  issues_summary: Record<string, number> | null;
  account_info: { name?: string; id?: string; websiteUrl?: string } | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export default function MerchantIntegrationPage() {
  const { invokeFunction } = useAuthenticatedFetch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<MerchantStatus | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    const { data } = await invokeFunction<{ ok: boolean; status: MerchantStatus }>(
      'merchant-status',
      { silent: true }
    );
    if (data?.ok) setStatus(data.status);
  }, [invokeFunction]);

  const fetchLogs = useCallback(async () => {
    const { data } = await invokeFunction<{ ok: boolean; logs: SyncLog[] }>(
      'merchant-summary',
      { silent: true }
    );
    if (data?.ok) setLogs(data.logs);
  }, [invokeFunction]);

  useEffect(() => {
    Promise.all([fetchStatus(), fetchLogs()]).finally(() => setLoading(false));

    // Check URL params for callback result
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') {
      toast.success('Google Merchant Center connected!');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('error')) {
      toast.error(`Connection failed: ${params.get('error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchStatus, fetchLogs]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data } = await invokeFunction<{ ok: boolean; authUrl: string; error?: string }>(
        'merchant-oauth-start'
      );
      if (data?.ok && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error(data?.error || 'Failed to start OAuth flow');
        setConnecting(false);
      }
    } catch {
      toast.error('Failed to start connection');
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await invokeFunction<{ ok: boolean; summary?: any; error?: string }>(
        'merchant-sync',
        { method: 'POST' }
      );
      if (data?.ok) {
        toast.success(
          `Sync complete: ${data.summary?.totalProducts ?? 0} products, ${data.summary?.productsWithIssues ?? 0} with issues`
        );
        await Promise.all([fetchStatus(), fetchLogs()]);
      } else {
        toast.error(data?.error || error?.message || 'Sync failed');
      }
    } catch {
      toast.error('Sync request failed');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const tokenAge = status?.tokenCreatedAt
    ? Math.round((Date.now() - new Date(status.tokenCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Merchant Center Integration | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Google Merchant Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              OAuth2 integration — no service account keys required.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/integrations/merchant/settings')}>
            <Settings className="h-4 w-4 mr-1" />
            Settings
          </Button>
        </div>

        {/* Connection Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                {status?.connected ? (
                  <Badge variant="default" className="mt-1">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="mt-1">
                    <XCircle className="h-3 w-3 mr-1" /> Disconnected
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Merchant ID</p>
                <p className="text-sm font-mono mt-1">{status?.merchantCenterId || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Token Age</p>
                <p className="text-sm mt-1">{tokenAge !== null ? `${tokenAge} days` : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Refreshed</p>
                <p className="text-sm mt-1">{formatDate(status?.tokenRefreshedAt ?? null)}</p>
              </div>
            </div>

            {status?.lastError && (
              <div className="p-3 bg-destructive/10 rounded-md text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Last Error</p>
                    <p className="text-muted-foreground">{status.lastError}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(status.lastErrorAt ?? null)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleConnect} disabled={connecting} variant="outline">
                {connecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                {status?.connected ? 'Reconnect' : 'Connect Google Merchant'}
              </Button>

              {status?.connected && (
                <Button onClick={handleSync} disabled={syncing}>
                  {syncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Run Sync Now
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Last Sync Summary */}
        {status?.lastSync && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Last Sync
              </CardTitle>
              <CardDescription>
                {formatDate(status.lastSync.completedAt || status.lastSync.startedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge
                    variant={status.lastSync.status === 'completed' ? 'default' : 'destructive'}
                    className="mt-1"
                  >
                    {status.lastSync.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Products</p>
                  <p className="text-2xl font-bold">{status.lastSync.totalProducts ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">With Issues</p>
                  <p className="text-2xl font-bold text-destructive">
                    {status.lastSync.productsWithIssues ?? '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sync History */}
        {logs.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Sync History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Date</th>
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Status</th>
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Products</th>
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Issues</th>
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Top Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const topIssue = log.issues_summary
                        ? Object.entries(log.issues_summary).sort(([, a], [, b]) => b - a)[0]
                        : null;
                      return (
                        <tr key={log.id} className="border-b border-border/50">
                          <td className="py-2 text-muted-foreground">
                            {formatDate(log.completed_at || log.started_at)}
                          </td>
                          <td className="py-2">
                            <Badge
                              variant={
                                log.status === 'completed'
                                  ? 'default'
                                  : log.status === 'running'
                                  ? 'secondary'
                                  : 'destructive'
                              }
                              className="text-xs"
                            >
                              {log.status}
                            </Badge>
                          </td>
                          <td className="py-2">{log.total_products ?? '—'}</td>
                          <td className="py-2">{log.products_with_issues ?? '—'}</td>
                          <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                            {topIssue ? `${topIssue[0]} (${topIssue[1]}×)` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Issues Breakdown from last sync */}
        {logs[0]?.issues_summary && Object.keys(logs[0].issues_summary).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Issues Breakdown (Last Sync)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(logs[0].issues_summary)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 20)
                  .map(([key, count]) => {
                    const [severity, ...descParts] = key.split(':');
                    const desc = descParts.join(':');
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between text-sm py-1 border-b border-border/30"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={severity === 'error' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {severity}
                          </Badge>
                          <span className="text-muted-foreground truncate max-w-[400px]">
                            {desc}
                          </span>
                        </div>
                        <span className="font-mono text-xs">{count}×</span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
