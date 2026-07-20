import { useState, useEffect, useCallback } from 'react';
import { SeoUrlChecker } from '@/components/admin/SeoUrlChecker';
import { MerchantCleanupDiagnostics } from '@/components/admin/MerchantCleanupDiagnostics';
import { RefreshFeedAfterPublishCard } from '@/components/admin/RefreshFeedAfterPublishCard';
import { MerchantApiProbePanel } from '@/components/admin/MerchantApiProbePanel';
import { FeedStatusCard } from '@/components/admin/FeedStatusCard';
import { ReportReleaseCard } from '@/components/admin/ReportReleaseCard';
import { ReleaseTimelineCard } from '@/components/admin/ReleaseTimelineCard';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { toast } from 'sonner';
import {
  Database,
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
  Bug,
  ChevronDown,
  ChevronUp,
  Copy,
  ShieldAlert,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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

interface DebugReport {
  runId: string;
  timestamp: string;
  mode: string;
  envConfigStatus: Record<string, boolean>;
  productsTableProbe: {
    totalRows: number;
    activeRows: number;
    rowsWithPriceGt0: number;
    activeAndPriced: number;
    rowsWithImage: number;
    rowsWithSlug: number;
    errors: string[];
  };
  merchantFeedProbe: {
    itemCount: number;
    firstItemIds: string[];
    error?: string;
    flag?: string;
  };
  sourceEnumeration: {
    table: string;
    query: string;
    rawCount: number;
    rawCountError: string | null;
    zeroReasonChecks: Record<string, unknown> | null;
  };
  eligibilityBreakdown: Record<string, number>;
  eligibilityFiltering: {
    eligibleCount: number;
    failureBuckets: Array<{
      reason: string;
      count: number;
      examples: Array<Record<string, unknown>>;
    }>;
  };
  payloadBuild: { payloadItemsBuilt: number; explanation: string };
  googleApiStage: Record<string, unknown>;
  pipeline: {
    rawCount: number;
    activeCount: number;
    pricedCount: number;
    eligibleCount: number;
    payloadBuiltCount: number;
    sentCount: number;
  };
  topFailureReasons: Array<{ reason: string; count: number }>;
  minimumViableExport: {
    possible: boolean;
    sampleProducts: Array<Record<string, unknown>>;
    explanation: string;
  };
}

interface LiveSyncResult {
  ok: boolean;
  runId: string;
  timestamp?: string;
  mode_effective: string;
  durationMs?: number;
  compliance_safe?: boolean;
  rawCount: number;
  eligibleCountBeforeLimit?: number;
  maxExportProducts?: number;
  eligibleCount: number;
  payloadBuiltCount: number;
  payloadBuiltCountAfterLimit?: number;
  skippedDueToMerchantCap?: number;
  attemptedSendCount: number;
  successCount: number;
  errorCount: number;
  successProductIds?: string[];
  failedProductIds?: string[];
  skippedReasons: Record<string, number>;
  topErrors: Array<{ offerId: string; status?: number; reason: string }>;
  sourceQuery: string;
  merchantCapNote?: string | null;
  complianceSummary?: {
    total_products_processed: number;
    sanitized_titles_count: number;
    sanitized_descriptions_count: number;
    removed_promotional_phrases_count: number;
    products_blocked_for_compliance: number;
    blocked_reasons: Record<string, number>;
    final_export_count: number;
  };
  googleStatusSummary: {
    totalProducts: number;
    productsWithIssues: number;
    issuesSummary: Record<string, number>;
  } | null;
  error?: string;
}

type SyncPhase = 'idle' | 'preparing' | 'sending' | 'awaiting' | 'completed';

export default function MerchantIntegrationPage() {
  const { invokeFunction, refreshSessionIfNeeded } = useAuthenticatedFetch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<MerchantStatus | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [debugging, setDebugging] = useState(false);
  const [debugReport, setDebugReport] = useState<DebugReport | null>(null);
  const [showFullReport, setShowFullReport] = useState(false);
  const [liveSyncResult, setLiveSyncResult] = useState<LiveSyncResult | null>(null);
  const [showLiveErrors, setShowLiveErrors] = useState(false);
  const [showLiveFullResponse, setShowLiveFullResponse] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const [reachability, setReachability] = useState<{ testing: boolean; result: null | { reachable: boolean; latencyMs?: number; error?: string } }>({ testing: false, result: null });
  const [titleOptRunning, setTitleOptRunning] = useState(false);
  const [titleOptReport, setTitleOptReport] = useState<any>(null);
  const [feedOptRunning, setFeedOptRunning] = useState(false);
  const [feedOptReport, setFeedOptReport] = useState<any>(null);
  const [trafficRunning, setTrafficRunning] = useState(false);
  const [trafficReport, setTrafficReport] = useState<any>(null);

  const testReachability = useCallback(async () => {
    setReachability({ testing: true, result: null });
    try {
      const { data } = await invokeFunction<{ ok: boolean; reachable: boolean; latencyMs?: number; error?: string }>(
        'merchant-reachability',
        { silent: true }
      );
      setReachability({ testing: false, result: data ? { reachable: data.reachable, latencyMs: data.latencyMs, error: data.error } : { reachable: false, error: 'No response' } });
    } catch {
      setReachability({ testing: false, result: { reachable: false, error: 'Request failed' } });
    }
  }, [invokeFunction]);

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
      const { data } = await invokeFunction<{ ok: boolean; authUrl: string; error?: string }>('merchant-oauth-start');
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
    setLiveSyncResult(null);
    setSyncPhase('preparing');
    try {
      const session = await refreshSessionIfNeeded();
      if (!session?.access_token) {
        toast.error('Session expired. Please log in again.');
        setSyncing(false);
        setSyncPhase('idle');
        return;
      }
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300_000);
      setSyncPhase('sending');
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/merchant-sync`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': anonKey,
          },
          body: JSON.stringify({ mode: 'live' }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      setSyncPhase('awaiting');
      
      // Handle non-JSON responses (e.g. HTML error pages, empty responses)
      const responseText = await res.text();
      let data: LiveSyncResult;
      try {
        data = JSON.parse(responseText) as LiveSyncResult;
      } catch {
        const truncated = responseText.substring(0, 200);
        const errMsg = res.ok
          ? `Invalid response from sync (not JSON): ${truncated}`
          : `Sync failed (HTTP ${res.status}): ${truncated}`;
        toast.error(errMsg);
        setLiveSyncResult({
          ok: false, runId: '', mode_effective: 'live', rawCount: 0,
          eligibleCount: 0, payloadBuiltCount: 0, attemptedSendCount: 0,
          successCount: 0, errorCount: 0, skippedReasons: {},
          topErrors: [], sourceQuery: '', googleStatusSummary: null,
          error: errMsg,
        });
        setSyncPhase('completed');
        setSyncing(false);
        return;
      }
      
      setLiveSyncResult(data);
      setSyncPhase('completed');
      if (data.ok) {
        const label = data.errorCount > 0 ? 'LIVE sync completed with warnings' : 'LIVE sync completed';
        toast.success(`${label}: ${data.successCount} sent, ${data.errorCount} errors`);
      } else {
        toast.error(data.error || 'Sync failed');
      }
      await Promise.all([fetchStatus(), fetchLogs()]);
    } catch (e) {
      const err = e as Error;
      const msg = err.name === 'AbortError'
        ? 'Sync timed out (>5 min). The sync may still be running on the server — check logs.'
        : `Sync request failed: ${err.message || 'Network error'}`;
      toast.error(msg);
      setLiveSyncResult({
        ok: false, runId: '', mode_effective: 'live', rawCount: 0,
        eligibleCount: 0, payloadBuiltCount: 0, attemptedSendCount: 0,
        successCount: 0, errorCount: 0, skippedReasons: {},
        topErrors: [], sourceQuery: '', googleStatusSummary: null,
        error: msg,
      });
      setSyncPhase('completed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDebugDryRun = async () => {
    setDebugging(true);
    setDebugReport(null);
    try {
      const { data, error } = await invokeFunction<{ ok: boolean; report: DebugReport; error?: string }>(
        'merchant-debug-sync',
        { silent: true, body: { mode: 'dryrun' } }
      );
      if (data?.ok && data.report) {
        setDebugReport(data.report);
        toast.success('Debug report generated');
        await fetchLogs();
      } else {
        toast.error(data?.error || error?.message || 'Debug run failed');
      }
    } catch {
      toast.error('Debug request failed');
    } finally {
      setDebugging(false);
    }
  };

  const copyReport = () => {
    if (debugReport) {
      navigator.clipboard.writeText(JSON.stringify(debugReport, null, 2));
      toast.success('Report copied to clipboard');
    }
  };

  const copyLiveResult = () => {
    if (liveSyncResult) {
      navigator.clipboard.writeText(JSON.stringify(liveSyncResult, null, 2));
      toast.success('Result copied to clipboard');
    }
  };

  const downloadJson = (data: object, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('JSON downloaded');
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('nl-NL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const tokenAge = status?.tokenCreatedAt
    ? Math.round((Date.now() - new Date(status.tokenCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const missingEnvKeys = debugReport
    ? Object.entries(debugReport.envConfigStatus).filter(([, v]) => !v).map(([k]) => k)
    : [];
  const canLiveSync = !debugReport || (debugReport.pipeline.eligibleCount > 0 && missingEnvKeys.length === 0);

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
        <MerchantApiProbePanel />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Google Merchant Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              OAuth2 integration — products pushed via Content API.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/integrations/merchant/review-checklist')}>
              <ClipboardList className="h-4 w-4 mr-1" />
              Review Checklist
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/integrations/merchant/settings')}>
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </Button>
          </div>
        </div>

        {/* Post-publish quick action — refresh GMC feed and validate */}
        <RefreshFeedAfterPublishCard />

        {/* Report a release → auto-runs sync + feed validation, persisted to release_reports */}
        <ReportReleaseCard />

        {/* Per-release status timeline: record / merchant-sync / validate-merchant-feed */}
        <ReleaseTimelineCard />

        {/* At-a-glance feed status (last sync + live validation) */}
        <FeedStatusCard />

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
                  <Badge variant="default" className="mt-1"><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</Badge>
                ) : (
                  <Badge variant="destructive" className="mt-1"><XCircle className="h-3 w-3 mr-1" /> Disconnected</Badge>
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
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(status.lastErrorAt ?? null)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button onClick={handleConnect} disabled={connecting} variant="outline">
                {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                {status?.connected ? 'Reconnect' : 'Connect Google Merchant'}
              </Button>

              {status?.connected && (
                <div className="relative">
                  <Button onClick={handleSync} disabled={syncing || !canLiveSync}>
                    {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Run Sync Now (LIVE)
                  </Button>
                  {!canLiveSync && debugReport && (
                    <p className="text-xs text-destructive mt-1 absolute whitespace-nowrap">
                      {debugReport.pipeline.eligibleCount === 0
                        ? '0 eligible — run Dry Run to see why'
                        : `Missing: ${missingEnvKeys.join(', ')}`}
                    </p>
                  )}
                </div>
              )}

              <Button onClick={handleDebugDryRun} disabled={debugging} variant="secondary">
                {debugging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bug className="h-4 w-4 mr-2" />}
                Dry Run (Explain 0)
              </Button>

              <Button onClick={testReachability} disabled={reachability.testing} variant="secondary">
                {reachability.testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                Test Connection
              </Button>
            </div>

            {reachability.result && (
              <div className={`p-3 rounded-md text-sm flex items-start gap-2 ${reachability.result.reachable ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                {reachability.result.reachable ? (
                  <><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>Reachable ✅ {reachability.result.latencyMs != null && <span className="text-muted-foreground">({reachability.result.latencyMs}ms)</span>}</span></>
                ) : (
                  <><XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" /><span>Blocked ❌ <span className="text-muted-foreground">{reachability.result.error}</span></span></>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync Phase Indicator */}
        {syncing && syncPhase !== 'idle' && (
          <Card className="border-primary/50">
            <CardContent className="py-4 px-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {syncPhase === 'preparing' && 'Preparing payload…'}
                    {syncPhase === 'sending' && 'Sending to Google Merchant Center…'}
                    {syncPhase === 'awaiting' && 'Awaiting API response…'}
                  </p>
                  <div className="flex gap-4 mt-2">
                    {(['preparing', 'sending', 'awaiting', 'completed'] as SyncPhase[]).map((phase, i) => {
                      const phaseOrder = { idle: -1, preparing: 0, sending: 1, awaiting: 2, completed: 3 };
                      const current = phaseOrder[syncPhase];
                      const thisPhase = phaseOrder[phase];
                      const isDone = thisPhase < current;
                      const isActive = thisPhase === current;
                      return (
                        <div key={phase} className="flex items-center gap-1 text-xs">
                          {isDone ? (
                            <CheckCircle2 className="h-3 w-3 text-primary" />
                          ) : isActive ? (
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          ) : (
                            <Clock className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className={isDone || isActive ? 'text-foreground' : 'text-muted-foreground'}>
                            {['Prepare', 'Send', 'Await', 'Done'][i]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Live Sync Result Panel */}
        {liveSyncResult && (
          <Card className={liveSyncResult.mode_effective === 'dryrun' ? 'border-amber-500/50' : liveSyncResult.errorCount > 0 ? 'border-destructive/50' : 'border-primary/50'}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Sync Result
                  {liveSyncResult.mode_effective === 'dryrun' && (
                    <Badge variant="outline" className="text-amber-600 border-amber-500 ml-2 text-sm font-bold">DRY RUN</Badge>
                  )}
                  {liveSyncResult.mode_effective === 'live' && (
                    <Badge variant="default" className="ml-2 text-sm">LIVE</Badge>
                  )}
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={copyLiveResult}>
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadJson(liveSyncResult, `merchant-sync-${liveSyncResult.mode_effective}-${liveSyncResult.runId.slice(0, 8)}.json`)}>
                    <Database className="h-4 w-4 mr-1" /> Download JSON
                  </Button>
                </div>
              </div>
              <CardDescription>
                Run ID: {liveSyncResult.runId}
                {liveSyncResult.timestamp && <> • {formatDate(liveSyncResult.timestamp)}</>}
                {liveSyncResult.durationMs != null && <> • {(liveSyncResult.durationMs / 1000).toFixed(1)}s</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status banner */}
              {liveSyncResult.mode_effective === 'live' && liveSyncResult.ok && (
                <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${liveSyncResult.errorCount > 0 ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
                  {liveSyncResult.errorCount > 0 ? (
                    <><AlertTriangle className="h-4 w-4 text-amber-600" /><span className="font-medium">LIVE sync completed with warnings</span></>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 text-primary" /><span className="font-medium">LIVE sync completed</span></>
                  )}
                </div>
              )}

              {/* Zero-sent warning for live mode */}
              {liveSyncResult.mode_effective === 'live' && liveSyncResult.ok && liveSyncResult.attemptedSendCount === 0 && liveSyncResult.eligibleCount > 0 && (
                <div className="p-3 bg-destructive/10 rounded-md text-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Warning: 0 products sent despite {liveSyncResult.eligibleCount} eligible</p>
                    <p className="text-muted-foreground text-xs mt-1">This may indicate a token issue or API failure. Check the full response for details.</p>
                  </div>
                </div>
              )}

              {/* Merchant cap notice */}
              {liveSyncResult.merchantCapNote && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-700">{liveSyncResult.merchantCapNote}</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Eligible before cap: {liveSyncResult.eligibleCountBeforeLimit ?? '?'} · 
                      Max export: {liveSyncResult.maxExportProducts ?? '?'} · 
                      Skipped: {liveSyncResult.skippedDueToMerchantCap ?? 0}
                    </p>
                  </div>
                </div>
              )}

              {/* Funnel counters */}
              <div className="grid grid-cols-3 md:grid-cols-7 gap-2 text-center">
                {[
                  { label: 'Raw (DB)', value: liveSyncResult.rawCount },
                  { label: 'Eligible', value: liveSyncResult.eligibleCountBeforeLimit ?? liveSyncResult.eligibleCount },
                  { label: 'Cap', value: liveSyncResult.maxExportProducts ?? '∞' },
                  { label: 'Exported', value: liveSyncResult.payloadBuiltCount },
                  { label: 'Sent', value: liveSyncResult.attemptedSendCount },
                  { label: 'Success', value: liveSyncResult.successCount, color: 'text-primary' },
                  { label: 'Errors', value: liveSyncResult.errorCount, color: liveSyncResult.errorCount > 0 ? 'text-destructive' : undefined },
                ].map((s) => (
                  <div key={s.label} className="p-2 rounded-md bg-muted/50">
                    <p className={`text-xl font-bold ${s.color || ''}`}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Google API Status Summary */}
              {liveSyncResult.googleStatusSummary && (
                <div className="p-3 bg-muted/50 rounded-md space-y-1">
                  <p className="text-sm font-medium flex items-center gap-1"><Database className="h-4 w-4" /> Google Merchant Status</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Total in Merchant:</span> <span className="font-mono font-bold">{liveSyncResult.googleStatusSummary.totalProducts}</span></div>
                    <div><span className="text-muted-foreground">With issues:</span> <span className={`font-mono font-bold ${liveSyncResult.googleStatusSummary.productsWithIssues > 0 ? 'text-destructive' : ''}`}>{liveSyncResult.googleStatusSummary.productsWithIssues}</span></div>
                  </div>
                  {Object.keys(liveSyncResult.googleStatusSummary.issuesSummary).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(liveSyncResult.googleStatusSummary.issuesSummary).slice(0, 8).map(([issue, count]) => (
                        <Badge key={issue} variant="secondary" className="text-[10px]">{issue}: {count}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Compliance Summary */}
              {liveSyncResult.complianceSummary && (
                <div className="p-3 bg-muted/50 rounded-md space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Compliance Safe Mode {liveSyncResult.compliance_safe ? 'ON' : 'OFF'}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Titles sanitized:</span> <span className="font-mono font-bold">{liveSyncResult.complianceSummary.sanitized_titles_count}</span></div>
                    <div><span className="text-muted-foreground">Descriptions sanitized:</span> <span className="font-mono font-bold">{liveSyncResult.complianceSummary.sanitized_descriptions_count}</span></div>
                    <div><span className="text-muted-foreground">Phrases removed:</span> <span className="font-mono font-bold">{liveSyncResult.complianceSummary.removed_promotional_phrases_count}</span></div>
                    <div><span className="text-muted-foreground">Blocked:</span> <span className={`font-mono font-bold ${liveSyncResult.complianceSummary.products_blocked_for_compliance > 0 ? 'text-destructive' : ''}`}>{liveSyncResult.complianceSummary.products_blocked_for_compliance}</span></div>
                  </div>
                  {Object.keys(liveSyncResult.complianceSummary.blocked_reasons).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(liveSyncResult.complianceSummary.blocked_reasons).map(([reason, count]) => (
                        <Badge key={reason} variant="destructive" className="text-xs">{reason}: {count}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Skipped reasons */}
              {liveSyncResult.skippedReasons && Object.keys(liveSyncResult.skippedReasons).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Skipped Reasons</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(liveSyncResult.skippedReasons).map(([reason, count]) => (
                      <Badge key={reason} variant="secondary" className="text-xs">
                        {reason.replace(/_/g, ' ')}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors expandable */}
              {liveSyncResult.errorCount > 0 && liveSyncResult.topErrors.length > 0 && (
                <Collapsible open={showLiveErrors} onOpenChange={setShowLiveErrors}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive text-xs">
                      {showLiveErrors ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                      View {liveSyncResult.topErrors.length} error(s) • {liveSyncResult.failedProductIds?.length ?? liveSyncResult.errorCount} failed products
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-2">
                      {liveSyncResult.topErrors.map((err, i) => (
                        <div key={i} className="p-2 bg-destructive/5 rounded text-xs font-mono">
                          <span className="text-muted-foreground">#{err.offerId?.slice(0, 8)}</span>
                          {err.status && <span className="ml-2 text-destructive">HTTP {err.status}</span>}
                          <p className="text-muted-foreground mt-1 break-all">{err.reason}</p>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* DRY RUN warning */}
              {liveSyncResult.mode_effective === 'dryrun' && (
                <div className="p-3 bg-amber-500/10 rounded-md text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-amber-700">Dry run — nothing sent to Google</span>
                </div>
              )}

              {/* Full response toggle */}
              <Collapsible open={showLiveFullResponse} onOpenChange={setShowLiveFullResponse}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs">
                    {showLiveFullResponse ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    {showLiveFullResponse ? 'Hide' : 'View'} Full Response
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto max-h-[400px] overflow-y-auto font-mono whitespace-pre-wrap mt-2">
                    {JSON.stringify(liveSyncResult, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        )}

        {/* Debug Summary Panel */}
        {debugReport && (
          <Card className="border-amber-500/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2 text-amber-600">
                  <Bug className="h-5 w-5" />
                  Debug Summary — Dry Run
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={copyReport}>
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadJson(debugReport, `merchant-dryrun-${debugReport.runId.slice(0, 8)}.json`)}>
                    <Database className="h-4 w-4 mr-1" /> Download JSON
                  </Button>
                </div>
              </div>
              <CardDescription>Run ID: {debugReport.runId} • {formatDate(debugReport.timestamp)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pipeline Funnel */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
                {[
                  { label: 'Total (DB)', value: debugReport.productsTableProbe.totalRows },
                  { label: 'Active', value: debugReport.pipeline.activeCount },
                  { label: 'Priced', value: debugReport.pipeline.pricedCount },
                  { label: 'Raw (query)', value: debugReport.pipeline.rawCount },
                  { label: 'Eligible', value: debugReport.pipeline.eligibleCount },
                  { label: 'Sent (dry)', value: debugReport.pipeline.sentCount },
                ].map((s) => (
                  <div key={s.label} className="p-2 rounded-md bg-muted/50">
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {debugReport.sourceEnumeration.zeroReasonChecks && (
                <div className="p-3 bg-destructive/10 rounded-md text-sm space-y-1">
                  <p className="font-medium text-destructive">⚠ rawCount = 0 — Root Cause:</p>
                  {Object.entries(debugReport.sourceEnumeration.zeroReasonChecks).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-mono">{Array.isArray(v) ? v.join('; ') : String(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={`p-3 rounded-md text-sm ${debugReport.merchantFeedProbe.itemCount > 0 ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                <p className="font-medium">
                  merchant-feed.xml: {debugReport.merchantFeedProbe.itemCount} items
                  {debugReport.merchantFeedProbe.flag && <span className="text-destructive ml-2">⚠ {debugReport.merchantFeedProbe.flag}</span>}
                </p>
                {debugReport.merchantFeedProbe.firstItemIds.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">First IDs: {debugReport.merchantFeedProbe.firstItemIds.join(', ')}</p>
                )}
                {debugReport.merchantFeedProbe.error && (
                  <p className="text-xs text-destructive mt-1">{debugReport.merchantFeedProbe.error}</p>
                )}
              </div>

              {debugReport.topFailureReasons.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Top Failure Reasons</p>
                  <div className="space-y-1">
                    {debugReport.topFailureReasons.map((r) => (
                      <div key={r.reason} className="flex items-center justify-between text-sm py-1 border-b border-border/30">
                        <span className="text-muted-foreground">{r.reason.replace(/_/g, ' ')}</span>
                        <Badge variant="secondary" className="text-xs">{r.count}×</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <ShieldAlert className="h-4 w-4" /> Environment Config
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(debugReport.envConfigStatus).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground font-mono">{k}</span>
                      <span className={v ? 'text-primary' : 'text-destructive font-bold'}>{v ? '✓' : '✗ MISSING'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {debugReport.minimumViableExport && (
                <div className={`p-3 rounded-md text-sm ${debugReport.minimumViableExport.possible ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                  <p className="font-medium">{debugReport.minimumViableExport.possible ? '✅ Minimum Viable Export possible' : '❌ Minimum Viable Export NOT possible'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{debugReport.minimumViableExport.explanation}</p>
                </div>
              )}

              <p className="text-sm text-muted-foreground">{debugReport.payloadBuild.explanation}</p>

              <Collapsible open={showFullReport} onOpenChange={setShowFullReport}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs">
                    {showFullReport ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    {showFullReport ? 'Hide' : 'View'} Full Debug Report
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto max-h-[500px] overflow-y-auto font-mono whitespace-pre-wrap mt-2">
                    {JSON.stringify(debugReport, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        )}

        {/* Title Optimizer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Google Shopping Title Optimizer
            </CardTitle>
            <CardDescription>AI-powered title optimization: Primary Keyword + Product Type + Key Feature + Target Animal (70–120 chars)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                disabled={titleOptRunning}
                onClick={async () => {
                  setTitleOptReport(null);
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token;
                    if (!token) { setTitleOptReport({ _testError: 'Not authenticated. Please log in first.' }); toast.error('Not authenticated'); return; }
                    const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/optimize-product-titles`, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dryRun: true, limit: 1 }),
                    });
                    const text = await res.text();
                    let data: any;
                    try { data = JSON.parse(text); } catch { setTitleOptReport({ _testError: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` }); toast.error('Unexpected response from function'); return; }
                    if (!res.ok || !data.success) {
                      setTitleOptReport({ _testError: data.error || `HTTP ${res.status}`, _httpStatus: res.status, _responseBody: text.slice(0, 500) });
                      toast.error(`Test failed: ${data.error || `HTTP ${res.status}`}`);
                    } else {
                      setTitleOptReport({ _testSuccess: true, _httpStatus: res.status, ...data });
                      toast.success('Function reachable ✓');
                    }
                  } catch (err: any) { setTitleOptReport({ _testError: err.message || 'Network error' }); toast.error(`Test failed: ${err.message}`); }
                }}
              >
                <Bug className="h-4 w-4 mr-1" />
                Test Function
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={titleOptRunning}
                onClick={async () => {
                  setTitleOptRunning(true); setTitleOptReport(null);
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token;
                    if (!token) throw new Error('Not authenticated');
                    const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/optimize-product-titles`, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dryRun: true, limit: 20 }),
                    });
                    const data = await res.json().catch(() => ({ success: false, error: 'Invalid response' }));
                    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
                    setTitleOptReport(data);
                    toast.success(`Preview: ${data.optimizedCount ?? 0} titles generated`);
                  } catch (err: any) { setTitleOptReport({ _testError: err.message }); toast.error(err.message); } finally { setTitleOptRunning(false); }
                }}
              >
                {titleOptRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Bug className="h-4 w-4 mr-1" />}
                Preview (20 products)
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={titleOptRunning}
                onClick={async () => {
                  setTitleOptRunning(true); setTitleOptReport(null);
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token;
                    if (!token) throw new Error('Not authenticated');
                    const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/optimize-product-titles`, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dryRun: true, limit: 20, shortTitlesOnly: true }),
                    });
                    const data = await res.json().catch(() => ({ success: false, error: 'Invalid response' }));
                    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
                    setTitleOptReport(data);
                    toast.success(`Preview: ${data.optimizedCount ?? 0} short titles generated`);
                  } catch (err: any) { setTitleOptReport({ _testError: err.message }); toast.error(err.message); } finally { setTitleOptRunning(false); }
                }}
              >
                {titleOptRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Preview Short Titles (&lt;70 chars)
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={titleOptRunning}
                onClick={async () => {
                  if (!confirm('This will rewrite ALL active product titles using AI. Continue?')) return;
                  setTitleOptRunning(true); setTitleOptReport(null);
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token;
                    if (!token) throw new Error('Not authenticated');
                    const CHUNK = 50;
                    let totalOpt = 0, totalUpd = 0, totalErr = 0, totalFb = 0, totalProducts = 0;
                    let allResults: any[] = [];
                    let chunk = 0;
                    let hasMore = true;
                    let lastCharStats: any = null;
                    while (hasMore) {
                      toast.info(`Processing batch ${chunk + 1}...`);
                      const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/optimize-product-titles`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dryRun: false, limit: CHUNK, offset: chunk * CHUNK }),
                      });
                      const data = await res.json().catch(() => ({ success: false, error: 'Invalid response' }));
                      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
                      totalOpt += data.optimizedCount || 0;
                      totalUpd += data.updatedCount || 0;
                      totalErr += data.errorCount || 0;
                      totalFb += data.fallbackCount || 0;
                      totalProducts += data.totalProducts || 0;
                      if (data.results) allResults.push(...data.results);
                      if (data.charStats) lastCharStats = data.charStats;
                      hasMore = (data.totalProducts || 0) >= CHUNK;
                      chunk++;
                      setTitleOptReport({ totalProducts, optimizedCount: totalOpt, updatedCount: totalUpd, errorCount: totalErr, fallbackCount: totalFb, dryRun: false, charStats: lastCharStats, results: allResults.slice(0, 20), _chunksCompleted: chunk });
                    }
                    toast.success(`Done! ${totalUpd} titles updated across ${chunk} batches.`);
                  } catch (err: any) { setTitleOptReport((prev: any) => ({ ...prev, _testError: err.message })); toast.error(err.message); } finally { setTitleOptRunning(false); }
                }}
              >
                {titleOptRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Optimize All Titles
              </Button>
            </div>

            {titleOptReport?._testError && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-sm space-y-1">
                <p className="font-medium text-destructive">❌ Error</p>
                <p className="text-xs text-muted-foreground font-mono break-all">{titleOptReport._testError}</p>
                {titleOptReport._httpStatus !== undefined && <p className="text-xs text-muted-foreground">HTTP Status: {titleOptReport._httpStatus}</p>}
                {titleOptReport._responseBody && <p className="text-xs text-muted-foreground font-mono break-all">Response: {titleOptReport._responseBody}</p>}
                {titleOptReport._httpStatus === 401 && <p className="text-xs text-destructive font-medium">⚠️ Authorization failed. Make sure you are logged in as an admin.</p>}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setTitleOptReport(null)}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Dismiss & Retry
                </Button>
              </div>
            )}
            {titleOptReport?._testSuccess && (
              <div className="p-3 bg-primary/10 border border-primary/30 rounded text-sm space-y-1">
                <p className="font-medium text-primary">✅ Function Reachable (HTTP {titleOptReport._httpStatus})</p>
                <p className="text-xs text-muted-foreground">Products found: {titleOptReport.totalProducts ?? 0}</p>
                <p className="text-xs text-muted-foreground">AI available: {titleOptReport.debug?.aiAvailable ? '✓' : '✗ (fallback mode)'}</p>
              </div>
            )}

            {titleOptReport && !titleOptReport._testError && !titleOptReport._testSuccess && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-2 bg-muted rounded text-center">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-bold">{titleOptReport.totalProducts ?? 0}</p>
                  </div>
                  <div className="p-2 bg-muted rounded text-center">
                    <p className="text-xs text-muted-foreground">Fetched</p>
                    <p className="text-lg font-bold">{titleOptReport.filteredCount ?? titleOptReport.totalProducts ?? 0}</p>
                  </div>
                  <div className="p-2 bg-primary/10 rounded text-center">
                    <p className="text-xs text-muted-foreground">Optimized</p>
                    <p className="text-lg font-bold">{titleOptReport.optimizedCount ?? 0}</p>
                  </div>
                  <div className="p-2 bg-muted rounded text-center">
                    <p className="text-xs text-muted-foreground">Updated</p>
                    <p className="text-lg font-bold">{titleOptReport.updatedCount ?? 0}</p>
                  </div>
                  <div className="p-2 bg-destructive/10 rounded text-center">
                    <p className="text-xs text-muted-foreground">Errors</p>
                    <p className="text-lg font-bold">{titleOptReport.errorCount ?? 0}</p>
                  </div>
                </div>
                {titleOptReport.fallbackCount > 0 && (
                  <Badge variant="outline" className="text-xs">⚠️ {titleOptReport.fallbackCount} titles used fallback (no AI)</Badge>
                )}
                {titleOptReport.charStats && (
                  <div className="p-3 bg-muted/50 rounded text-xs space-y-1">
                    <p className="font-medium text-sm">Character Length Stats</p>
                    <div className="flex flex-wrap gap-3">
                      <span>Avg: <strong>{titleOptReport.charStats.avgLength}</strong></span>
                      <span>Min: <strong>{titleOptReport.charStats.minLength}</strong></span>
                      <span>Max: <strong>{titleOptReport.charStats.maxLength}</strong></span>
                      <span className="text-primary">In range (70–120): <strong>{titleOptReport.charStats.inRange}</strong></span>
                      <span className="text-amber-600">Too short: <strong>{titleOptReport.charStats.tooShort}</strong></span>
                      <span className="text-destructive">Too long: <strong>{titleOptReport.charStats.tooLong}</strong></span>
                    </div>
                  </div>
                )}
                {titleOptReport.dryRun && (
                  <Badge variant="outline" className="text-xs">🔍 Dry Run — no changes applied</Badge>
                )}
                {titleOptReport.results?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Results ({titleOptReport.results.length})</p>
                    {titleOptReport.results.map((s: any) => (
                      <div key={s.id} className="p-2 border border-border/50 rounded text-xs space-y-1">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="font-medium text-foreground">{s.category || 'Unknown'}</span>
                          {s.usedAI && <Badge variant="secondary" className="text-[10px] px-1">AI</Badge>}
                          {s.usedFallback && <Badge variant="outline" className="text-[10px] px-1">Fallback</Badge>}
                          {!s.ok && <Badge variant="destructive" className="text-[10px] px-1">Failed</Badge>}
                        </div>
                        <div className="text-destructive/70 line-through">{s.original || '(empty)'} <span className="no-underline text-muted-foreground">({s.original?.length || 0} chars)</span></div>
                        {s.optimized ? (
                          <div className="text-primary font-medium">{s.optimized} <span className="font-normal text-muted-foreground">({s.charCount} chars)</span></div>
                        ) : (
                          <div className="text-destructive text-xs">{s.reason}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {titleOptReport.debug && (
                  <div className="p-2 bg-muted/30 rounded text-xs text-muted-foreground">
                    <span>Debug: {titleOptReport.debug.fetchedCount} fetched | AI: {titleOptReport.debug.aiAvailable ? '✓' : '✗'} | Missing fields: {titleOptReport.debug.missingFieldsRate}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Google Merchant Feed Optimizer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5" />
              Google Merchant Feed Optimizer
            </CardTitle>
            <CardDescription>Enrich products with product_type, google_product_category, and custom labels for better Shopping visibility</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={feedOptRunning}
                onClick={async () => {
                  setFeedOptRunning(true);
                  setFeedOptReport(null);
                  const endpoint = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/optimize-merchant-feed`;
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token;
                    if (!token) throw new Error('Not authenticated');
                    const res = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dryRun: true, limit: 20 }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
                    setFeedOptReport(json);
                    toast.success(`Preview: ${json?.enrichedCount ?? 0} products enriched`);
                  } catch (err: any) {
                    setFeedOptReport({ _error: err.message });
                    toast.error(err.message);
                  } finally {
                    setFeedOptRunning(false);
                  }
                }}
              >
                {feedOptRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Bug className="h-4 w-4 mr-1" />}
                Preview Feed Optimization (20)
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={feedOptRunning}
                onClick={async () => {
                  if (!confirm('This will enrich ALL active products with Google Shopping attributes in chunks of 50. Continue?')) return;
                  setFeedOptRunning(true);
                  setFeedOptReport(null);
                  const endpoint = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/optimize-merchant-feed`;
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token;
                    if (!token) throw new Error('Not authenticated');

                    const CHUNK = 50;
                    let totalEnriched = 0, totalUpdated = 0, totalErrors = 0, totalProducts = 0;
                    let allSamples: any[] = [];
                    let chunkIndex = 0;
                    let hasMore = true;

                    while (hasMore) {
                      toast.info(`Processing chunk ${chunkIndex + 1}...`);
                      const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dryRun: false, limit: CHUNK, offset: chunkIndex * CHUNK }),
                      });
                      const json = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

                      totalEnriched += json.enrichedCount || 0;
                      totalUpdated += json.updatedCount || 0;
                      totalErrors += json.errorCount || 0;
                      totalProducts += json.totalProducts || 0;
                      if (json.samples) allSamples.push(...json.samples);

                      hasMore = (json.totalProducts || 0) >= CHUNK;
                      chunkIndex++;

                      setFeedOptReport({
                        totalProducts, enrichedCount: totalEnriched, updatedCount: totalUpdated,
                        errorCount: totalErrors, dryRun: false, samples: allSamples.slice(0, 10),
                        _chunksCompleted: chunkIndex,
                      });
                    }
                    toast.success(`Done! ${totalUpdated} products enriched across ${chunkIndex} chunks.`);
                  } catch (err: any) {
                    setFeedOptReport((prev: any) => ({ ...prev, _error: err.message }));
                    toast.error(err.message);
                  } finally {
                    setFeedOptRunning(false);
                  }
                }}
              >
                {feedOptRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Optimize Entire Feed
              </Button>
            </div>

            {feedOptReport?._error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-sm">
                <p className="font-medium text-destructive">❌ {feedOptReport._error}</p>
              </div>
            )}

            {feedOptReport && !feedOptReport._error && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-2 bg-muted rounded text-center">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-bold">{feedOptReport.totalProducts}</p>
                  </div>
                  <div className="p-2 bg-primary/10 rounded text-center">
                    <p className="text-xs text-muted-foreground">Enriched</p>
                    <p className="text-lg font-bold">{feedOptReport.enrichedCount}</p>
                  </div>
                  <div className="p-2 bg-muted rounded text-center">
                    <p className="text-xs text-muted-foreground">Updated</p>
                    <p className="text-lg font-bold">{feedOptReport.updatedCount}</p>
                  </div>
                  <div className="p-2 bg-destructive/10 rounded text-center">
                    <p className="text-xs text-muted-foreground">Errors</p>
                    <p className="text-lg font-bold">{feedOptReport.errorCount}</p>
                  </div>
                </div>
                {feedOptReport.dryRun && (
                  <Badge variant="outline" className="text-xs">🔍 Dry Run — no changes applied</Badge>
                )}
                {feedOptReport.samples?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Sample Results</p>
                    {feedOptReport.samples.slice(0, 5).map((s: any) => (
                      <div key={s.id} className="p-3 border border-border/50 rounded text-xs space-y-1">
                        <div className="font-medium text-foreground">{s.name}</div>
                        <div className="text-muted-foreground">Category: {s.category || '—'}</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                          <div><span className="text-muted-foreground">product_type:</span> <span className="text-primary">{s.product_type}</span></div>
                          <div><span className="text-muted-foreground">google_category:</span> <span className="text-primary">{s.google_product_category}</span></div>
                          <div><span className="text-muted-foreground">animal:</span> <Badge variant="secondary" className="text-xs">{s.custom_label_0}</Badge></div>
                          <div><span className="text-muted-foreground">price:</span> <Badge variant="secondary" className="text-xs">{s.custom_label_1}</Badge></div>
                          <div><span className="text-muted-foreground">margin:</span> <Badge variant="secondary" className="text-xs">{s.custom_label_2}</Badge></div>
                          <div><span className="text-muted-foreground">shipping:</span> <Badge variant="secondary" className="text-xs">{s.custom_label_3}</Badge></div>
                          <div><span className="text-muted-foreground">group:</span> <Badge variant="secondary" className="text-xs">{s.custom_label_4}</Badge></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Google Shopping Traffic Engine */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Google Shopping Traffic Engine
            </CardTitle>
            <CardDescription>Detect high-potential products and boost visibility with custom_label_5 (high_visibility), custom_label_6 (bestseller_candidate), custom_label_7 (high_search_demand)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={trafficRunning}
                onClick={async () => {
                  setTrafficRunning(true);
                  setTrafficReport(null);
                  const endpoint = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/shopping-traffic-engine`;
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token;
                    if (!token) throw new Error('Not authenticated');
                    const res = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dryRun: true, limit: 20 }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
                    setTrafficReport(json);
                    toast.success(`Preview: ${json?.totalProducts ?? 0} products analyzed`);
                  } catch (err: any) {
                    setTrafficReport({ _error: err.message });
                    toast.error(err.message);
                  } finally {
                    setTrafficRunning(false);
                  }
                }}
              >
                {trafficRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Bug className="h-4 w-4 mr-1" />}
                Preview Traffic Boost (20)
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={trafficRunning}
                onClick={async () => {
                  if (!confirm('This will score ALL active products and assign traffic labels. Continue?')) return;
                  setTrafficRunning(true);
                  setTrafficReport(null);
                  const endpoint = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/shopping-traffic-engine`;
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token;
                    if (!token) throw new Error('Not authenticated');
                    const res = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dryRun: false, limit: 500 }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
                    setTrafficReport(json);
                    toast.success(`Done! ${json?.updatedCount ?? 0} products updated with traffic labels.`);
                  } catch (err: any) {
                    setTrafficReport({ _error: err.message });
                    toast.error(err.message);
                  } finally {
                    setTrafficRunning(false);
                  }
                }}
              >
                {trafficRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Activate Traffic Engine
              </Button>
            </div>

            {trafficReport?._error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-sm">
                <p className="font-medium text-destructive">❌ {trafficReport._error}</p>
              </div>
            )}

            {trafficReport && !trafficReport._error && (
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-3">
                  <div className="p-2 bg-muted rounded text-center">
                    <p className="text-xs text-muted-foreground">Total Analyzed</p>
                    <p className="text-lg font-bold">{trafficReport.totalProducts}</p>
                  </div>
                  <div className="p-2 bg-primary/10 rounded text-center">
                    <p className="text-xs text-muted-foreground">High Visibility</p>
                    <p className="text-lg font-bold text-primary">{trafficReport.highVisibilityCount}</p>
                  </div>
                  <div className="p-2 bg-primary/10 rounded text-center">
                    <p className="text-xs text-muted-foreground">Bestseller Candidates</p>
                    <p className="text-lg font-bold text-primary">{trafficReport.bestsellerCandidateCount}</p>
                  </div>
                  <div className="p-2 bg-primary/10 rounded text-center">
                    <p className="text-xs text-muted-foreground">High Demand</p>
                    <p className="text-lg font-bold text-primary">{trafficReport.highSearchDemandCount}</p>
                  </div>
                  <div className="p-2 bg-muted rounded text-center">
                    <p className="text-xs text-muted-foreground">Updated</p>
                    <p className="text-lg font-bold">{trafficReport.updatedCount}</p>
                  </div>
                </div>
                {trafficReport.dryRun && (
                  <Badge variant="outline" className="text-xs">🔍 Dry Run — no changes applied</Badge>
                )}
                {trafficReport.samples?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Top 5 Products by Score</p>
                    {trafficReport.samples.map((s: any) => (
                      <div key={s.id} className="p-3 border border-border/50 rounded text-xs space-y-1">
                        <div className="font-medium text-foreground">{s.name}</div>
                        <div className="text-muted-foreground">${s.price} · {s.category || '—'}</div>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">vis: {s.visibilityScore}</Badge>
                          <Badge variant="secondary" className="text-xs">bs: {s.bestsellerScore}</Badge>
                          <Badge variant="secondary" className="text-xs">demand: {s.demandScore}</Badge>
                          {s.custom_label_5 && <Badge className="text-xs bg-green-600">⚡ {s.custom_label_5}</Badge>}
                          {s.custom_label_6 && <Badge className="text-xs bg-blue-600">🏆 {s.custom_label_6}</Badge>}
                          {s.custom_label_7 && <Badge className="text-xs bg-orange-600">🔥 {s.custom_label_7}</Badge>}
                        </div>
                        {s.reasons?.length > 0 && (
                          <div className="text-muted-foreground mt-1">Reasons: {s.reasons.join(', ')}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
              <CardDescription>{formatDate(status.lastSync.completedAt || status.lastSync.startedAt)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={status.lastSync.status === 'completed' ? 'default' : 'destructive'} className="mt-1">{status.lastSync.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Products</p>
                  <p className="text-2xl font-bold">{status.lastSync.totalProducts ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">With Issues</p>
                  <p className="text-2xl font-bold text-destructive">{status.lastSync.productsWithIssues ?? '—'}</p>
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
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Type</th>
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Status</th>
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Products</th>
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Issues</th>
                      <th className="pb-2 text-xs text-muted-foreground font-medium">Top Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const topIssue = log.issues_summary
                        ? Object.entries(log.issues_summary).filter(([k]) => !k.startsWith('_')).sort(([, a], [, b]) => b - a)[0]
                        : null;
                      return (
                        <tr key={log.id} className="border-b border-border/50">
                          <td className="py-2 text-muted-foreground">{formatDate(log.completed_at || log.started_at)}</td>
                          <td className="py-2">
                            <Badge variant={log.sync_type === 'debug_dry_run' ? 'outline' : 'secondary'} className="text-xs">
                              {log.sync_type === 'debug_dry_run' ? '🔍 debug' : log.sync_type}
                            </Badge>
                          </td>
                          <td className="py-2">
                            <Badge
                              variant={log.status === 'completed' ? 'default' : log.status === 'running' ? 'secondary' : 'destructive'}
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
        {logs[0]?.issues_summary && Object.keys(logs[0].issues_summary).filter(k => !k.startsWith('_')).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Issues Breakdown (Last Sync)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(logs[0].issues_summary)
                  .filter(([k]) => !k.startsWith('_'))
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 20)
                  .map(([key, count]) => {
                    const [severity, ...descParts] = key.split(':');
                    const desc = descParts.join(':');
                    return (
                      <div key={key} className="flex items-center justify-between text-sm py-1 border-b border-border/30">
                        <div className="flex items-center gap-2">
                          <Badge variant={severity === 'error' ? 'destructive' : 'secondary'} className="text-xs">{severity}</Badge>
                          <span className="text-muted-foreground truncate max-w-[400px]">{desc || key}</span>
                        </div>
                        <span className="font-mono text-xs">{count}×</span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Merchant Cleanup Diagnostics */}
        <MerchantCleanupDiagnostics />

        {/* SEO Crawl Status Checker */}
        <SeoUrlChecker />
      </div>
    </>
  );
}
