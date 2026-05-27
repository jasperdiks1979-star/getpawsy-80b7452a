import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Loader2, RefreshCw, RotateCcw, ExternalLink, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

interface StatusResponse {
  ok: boolean;
  stripe: {
    hasStripeKey: boolean;
    hasLiveKey: boolean;
    hasPublishableKey: boolean;
    publishableMode: string;
    mode: 'test' | 'live' | 'unknown';
    source: string;
    keyPrefix: string | null;
    hasWebhookSecret: boolean;
    hasServiceRoleKey?: boolean;
    lastStripeErrorCode?: string | null;
    lastStripeErrorMessage?: string | null;
    lastStripeErrorAt?: string | null;
  };
  diagnostics?: {
    mode: string;
    hasStripeLiveKey: boolean;
    hasWebhookSecret: boolean;
    hasServiceRoleKey: boolean;
    lastStripeErrorCode: string | null;
    lastStripeErrorMessage: string | null;
    lastSmokeTestStatus: string | null;
  };
  funnel: {
    counts: Record<string, number>;
    botCount: number;
    duplicateKeys: number;
    addToCart: number;
    checkoutClick: number;
    checkoutRedirectSuccess: number;
    checkoutError: number;
    atcToCheckoutRatio: number | null;
    checkoutSuccessRatio: number | null;
    botFilteredPct: number;
    totalEvents: number;
  };
  latestSmokeTest: any;
}

interface VerifyResponse {
  ok: boolean;
  sessionId: string;
  sessionPrefix: string;
  sessionMode: string;
  mode: string;
  paymentStatus: string;
  sessionStatus: string;
  paymentIntentId: string | null;
  amountTotal: number | null;
  smokeTestRow: any;
  funnelSteps: string[];
  funnelDuplicates: number;
  botEvents: number;
  checklist: Record<string, boolean>;
  webhookEventId?: string | null;
  webhookEventCorrelationDetail?: string | null;
  botFalsePositiveDetail?: string | null;
}

interface LastError {
  action: string;
  status: number | null;
  body: string;
  timestamp: string;
}

interface ExtractedError {
  message: string;
  status: number | null;
  body: string;
}

/**
 * supabase.functions.invoke wraps non-2xx in FunctionsHttpError with the raw
 * Response on `.context`. Parse the JSON body so the toast shows the real
 * backend message instead of "non-2xx status code".
 */
async function extractFnError(err: unknown): Promise<ExtractedError> {
  try {
    const ctx = (err as any)?.context;
    const status = (err as any)?.status ?? (ctx?.status ?? null);
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json().catch(() => null);
      if (body) {
        const code = body.code ? ` [${body.code}]` : '';
        return {
          message: `${body.message ?? body.error ?? 'Edge function error'}${code}`,
          status,
          body: JSON.stringify(body, null, 2),
        };
      }
      const text = await ctx.clone().text().catch(() => '');
      if (text) {
        return { message: text, status, body: text };
      }
    }
  } catch { /* fall through */ }
  const message = err instanceof Error ? err.message : String(err);
  return { message, status: null, body: message };
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive" />
      )}
      <span className={ok ? '' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [autoRetry, setAutoRetry] = useState<{ active: boolean; attempt: number; secondsLeft: number } | null>(null);
  const retryAbortRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-payments', {
        method: 'GET' as any,
      });
      if (error) throw error;
      setStatus(data as StatusResponse);
    } catch (e) {
      toast({ title: 'Failed to load status', description: await extractFnError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Auto-verify if redirected back from a successful smoke session
  useEffect(() => {
    const cs = params.get('cs');
    if (cs && params.get('smoke_test') === 'success') {
      void runVerify(cs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runVerify(sessionId: string) {
    setVerifying(true);
    retryAbortRef.current = false;
    try {
      const { data, error } = await supabase.functions.invoke(
        'admin-payments?action=smoke_test_verify',
        { body: { sessionId } },
      );
      if (error) throw error;
      const result = data as VerifyResponse;
      setVerifyResult(result);
      await fetchStatus();
      if (!result.checklist?.redirectSuccessLogged) {
        void pollForRedirectSuccess(sessionId);
      }
    } catch (e) {
      toast({ title: 'Verify failed', description: await extractFnError(e), variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  }

  async function pollForRedirectSuccess(sessionId: string) {
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const INTERVAL_MS = 15 * 1000; // 15 seconds
    const deadline = Date.now() + TIMEOUT_MS;
    let attempt = 0;
    setAutoRetry({ active: true, attempt: 0, secondsLeft: Math.ceil(TIMEOUT_MS / 1000) });
    while (Date.now() < deadline && !retryAbortRef.current) {
      const wait = Math.min(INTERVAL_MS, deadline - Date.now());
      await new Promise((r) => setTimeout(r, wait));
      if (retryAbortRef.current) break;
      attempt += 1;
      setAutoRetry({
        active: true,
        attempt,
        secondsLeft: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
      });
      try {
        const { data, error } = await supabase.functions.invoke(
          'admin-payments?action=smoke_test_verify',
          { body: { sessionId } },
        );
        if (error) throw error;
        const result = data as VerifyResponse;
        setVerifyResult(result);
        if (result.checklist?.redirectSuccessLogged) {
          toast({ title: 'Redirect success logged', description: `Confirmed after ${attempt} retr${attempt === 1 ? 'y' : 'ies'}.` });
          await fetchStatus();
          setAutoRetry(null);
          return;
        }
      } catch (e) {
        console.warn('[smoke-test] auto-retry verify failed:', e);
      }
    }
    setAutoRetry((prev) => (prev ? { ...prev, active: false } : prev));
    if (!retryAbortRef.current) {
      toast({
        title: 'Redirect success still missing',
        description: 'Auto-retry timed out after 5 minutes. Re-verify manually if needed.',
        variant: 'destructive',
      });
    }
  }

  async function runSmokeTest() {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'admin-payments?action=smoke_test_start',
        { body: {} },
      );
      if (error) throw error;
      const url = (data as any)?.url;
      const sessionId = (data as any)?.sessionId;
      if (!url) throw new Error('No checkout URL returned');
      toast({ title: 'Smoke test session created', description: `Opening ${sessionId?.slice(0, 12)}…` });
      // Open Stripe Checkout in same window so the success_url callback returns here
      window.location.href = url;
    } catch (e) {
      toast({ title: 'Smoke test failed', description: await extractFnError(e), variant: 'destructive' });
      setStarting(false);
    }
  }

  async function runRefund() {
    setRefunding(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'admin-payments?action=smoke_test_refund',
        { body: {} },
      );
      if (error) throw error;
      toast({ title: 'Refund issued', description: `Refund ${(data as any)?.refundId?.slice(0, 12)}…` });
      await fetchStatus();
    } catch (e) {
      toast({ title: 'Refund failed', description: await extractFnError(e), variant: 'destructive' });
    } finally {
      setRefunding(false);
    }
  }

  const mode = status?.stripe.mode ?? 'unknown';
  const isLive = mode === 'live';

  return (
    <div className="container max-w-5xl py-10 space-y-6">
      <Helmet>
        <title>Admin · Payments & Live Activation</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground text-sm">Live Stripe activation, smoke testing & production readiness.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </header>

      {/* Stripe mode */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Stripe configuration</CardTitle>
          <Badge variant={isLive ? 'default' : 'secondary'} className={isLive ? 'bg-green-600 text-white hover:bg-green-700' : ''}>
            {mode === 'live' ? 'LIVE MODE' : mode === 'test' ? 'TEST MODE' : 'NO KEY'}
          </Badge>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
          <StatusPill ok={!!status?.stripe.hasStripeKey} label={`Secret key configured (${status?.stripe.source ?? '—'})`} />
          <StatusPill ok={!!status?.stripe.hasLiveKey} label="STRIPE_SECRET_KEY_LIVE present" />
          <StatusPill ok={!!status?.stripe.hasWebhookSecret} label="STRIPE_WEBHOOK_SECRET present" />
          <StatusPill ok={!!status?.stripe.hasPublishableKey} label={`Publishable key (${status?.stripe.publishableMode ?? 'n/a'})`} />
          <div className="text-muted-foreground sm:col-span-2">
            Active key prefix: <code className="px-1 rounded bg-muted">{status?.stripe.keyPrefix ?? '—'}</code>
          </div>
        </CardContent>
      </Card>

      {/* Key rotation instructions (native secret modal flow) */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Safe diagnostics</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-2 text-sm">
          <div>mode: <strong className="uppercase">{status?.diagnostics?.mode ?? mode}</strong></div>
          <div>hasStripeLiveKey: <strong>{String(status?.diagnostics?.hasStripeLiveKey ?? status?.stripe.hasLiveKey ?? false)}</strong></div>
          <div>hasWebhookSecret: <strong>{String(status?.diagnostics?.hasWebhookSecret ?? status?.stripe.hasWebhookSecret ?? false)}</strong></div>
          <div>hasServiceRoleKey: <strong>{String(status?.diagnostics?.hasServiceRoleKey ?? status?.stripe.hasServiceRoleKey ?? false)}</strong></div>
          <div>lastSmokeTestStatus: <strong>{status?.diagnostics?.lastSmokeTestStatus ?? status?.latestSmokeTest?.status ?? '—'}</strong></div>
          <div>lastStripeErrorCode: <strong>{status?.diagnostics?.lastStripeErrorCode ?? '—'}</strong></div>
          <div className="sm:col-span-2 break-words">
            lastStripeErrorMessage: <strong className="font-mono text-xs">{status?.diagnostics?.lastStripeErrorMessage ?? '—'}</strong>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Rotate or set keys</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-3">
          <p className="text-muted-foreground">
            For security, raw Stripe keys are never accepted through this UI. Use Lovable's
            built-in secret form by sending one of these messages in the chat:
          </p>
          <ul className="space-y-2">
            <li><code className="px-2 py-1 rounded bg-muted">Update STRIPE_SECRET_KEY_LIVE</code> — sets the live secret key (must start with <code>sk_live_</code>)</li>
            <li><code className="px-2 py-1 rounded bg-muted">Update STRIPE_WEBHOOK_SECRET</code> — sets the live webhook signing secret</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Once <code>STRIPE_SECRET_KEY_LIVE</code> is set, this page and the checkout edge functions
            automatically prefer it over the test key.
          </p>
        </CardContent>
      </Card>

      {/* Smoke test */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Live checkout smoke test</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              Creates a real Stripe Checkout session for <strong>$0.50 USD</strong>. You will be redirected to Stripe to complete payment with a real card. Refund the charge from the section below once verified.
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={runSmokeTest} disabled={starting || !status?.stripe.hasStripeKey} size="lg">
              {starting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Run Live Checkout Smoke Test
            </Button>
            {status?.latestSmokeTest?.stripe_session_id && (
              <Button variant="outline" onClick={() => runVerify(status.latestSmokeTest.stripe_session_id)} disabled={verifying}>
                {verifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Re-verify last session
              </Button>
            )}
          </div>

          {verifyResult && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Session {verifyResult.sessionPrefix}…</div>
                  <div className="text-xs text-muted-foreground">
                    mode={verifyResult.sessionMode} · payment_status={verifyResult.paymentStatus} · status={verifyResult.sessionStatus}
                  </div>
                </div>
                <Badge variant={verifyResult.checklist.productionReady ? 'default' : 'secondary'}
                       className={verifyResult.checklist.productionReady ? 'bg-green-600 text-white' : ''}>
                  {verifyResult.checklist.productionReady ? 'PRODUCTION READY' : 'INCOMPLETE'}
                </Badge>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <StatusPill ok={verifyResult.checklist.liveStripeKeyActive} label="Live Stripe key active" />
                <StatusPill ok={verifyResult.checklist.liveCheckoutOpened} label="Live checkout session (cs_live_)" />
                <StatusPill ok={verifyResult.checklist.paymentCompleted} label="Payment completed" />
                <StatusPill ok={verifyResult.checklist.webhookReceived} label="Webhook received" />
                <StatusPill ok={verifyResult.checklist.funnelEventStored} label="Funnel event stored" />
                <StatusPill ok={verifyResult.checklist.redirectSuccessLogged} label="Redirect success logged" />
                <StatusPill ok={verifyResult.checklist.noDuplicateEvents} label="No duplicate events" />
                <StatusPill ok={verifyResult.checklist.noBotClassification} label="No bot classification" />
                <StatusPill
                  ok={verifyResult.checklist.webhookEventCorrelated}
                  label="Webhook event ↔ session correlated"
                />
                <StatusPill
                  ok={verifyResult.checklist.noBotFalsePositive}
                  label="No bot-detection false positive"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Funnel steps observed: <code>{verifyResult.funnelSteps.join(' → ') || '—'}</code>
              </div>
              {(verifyResult.webhookEventId || verifyResult.webhookEventCorrelationDetail) && (
                <div className="text-xs text-muted-foreground">
                  Webhook event:{' '}
                  <code>{verifyResult.webhookEventId ?? '—'}</code>
                  {verifyResult.webhookEventCorrelationDetail && (
                    <> · {verifyResult.webhookEventCorrelationDetail}</>
                  )}
                </div>
              )}
              {verifyResult.botFalsePositiveDetail && (
                <div className="text-xs text-destructive">
                  {verifyResult.botFalsePositiveDetail}
                </div>
              )}
              {autoRetry && !verifyResult.checklist.redirectSuccessLogged && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3 text-xs">
                  <div className="flex items-center gap-2">
                    {autoRetry.active && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span>
                      {autoRetry.active
                        ? `Waiting for redirect_success… attempt ${autoRetry.attempt}, ${Math.floor(autoRetry.secondsLeft / 60)}m ${autoRetry.secondsLeft % 60}s left`
                        : 'Auto-retry timed out after 5 minutes.'}
                    </span>
                  </div>
                  {autoRetry.active && (
                    <Button size="sm" variant="ghost" onClick={() => { retryAbortRef.current = true; setAutoRetry((p) => p ? { ...p, active: false } : p); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Refund */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Refund last smoke test</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Refunds the most recent <strong>paid</strong> smoke test payment intent. No effect on real customer orders.
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={refunding}>
                {refunding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Refund Last Smoke Test Payment
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Refund the last smoke test?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will issue a full refund on the most recent paid smoke-test payment intent.
                  Only affects internal admin-initiated test charges.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={runRefund}>Refund now</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Production readiness */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Production readiness</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>Stripe mode: <strong className="uppercase">{mode}</strong></div>
          <div>Webhook secret: <strong>{status?.stripe.hasWebhookSecret ? 'set' : 'missing'}</strong></div>
          <div>Latest smoke test status: <strong>{status?.latestSmokeTest?.status ?? '—'}</strong></div>
          <div>Latest payment success (24h): <strong>{status?.funnel.counts['payment_success'] ?? 0}</strong></div>
          <div>Funnel duplicate keys (24h): <strong>{status?.funnel.duplicateKeys ?? 0}</strong></div>
          <div>Bot filtered: <strong>{((status?.funnel.botFilteredPct ?? 0) * 100).toFixed(1)}%</strong></div>
          <div>Checkout success ratio: <strong>{status?.funnel.checkoutSuccessRatio != null ? (status.funnel.checkoutSuccessRatio * 100).toFixed(1) + '%' : '—'}</strong></div>
          <div>ATC → checkout ratio: <strong>{status?.funnel.atcToCheckoutRatio != null ? (status.funnel.atcToCheckoutRatio * 100).toFixed(1) + '%' : '—'}</strong></div>
          <div className="sm:col-span-2">
            <a href="/admin/funnel-health" className="text-primary inline-flex items-center gap-1 hover:underline">
              Open Funnel Health dashboard <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}