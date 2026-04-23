import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle2, XCircle, Rocket } from 'lucide-react';
import { toast } from 'sonner';

type Phase = 'idle' | 'syncing' | 'validating' | 'done' | 'error';

interface SyncSummary {
  successCount: number;
  errorCount: number;
  attemptedSendCount: number;
}

interface ValidateSummary {
  totalItemsInFeed: number;
  ok: number;
  fail: number;
}

/**
 * One-click admin action to run after publishing site changes.
 * 1) Triggers `merchant-sync` (live) — pushes the latest product data to GMC.
 * 2) Then runs `validate-merchant-feed` to confirm the public feed is healthy.
 *
 * Designed for the post-publish workflow: lets the operator verify in one
 * step that GMC sees the freshly published contact + policy pages.
 */
export function RefreshFeedAfterPublishCard() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [syncResult, setSyncResult] = useState<SyncSummary | null>(null);
  const [validateResult, setValidateResult] = useState<ValidateSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const callFn = async (name: string, body: Record<string, unknown> = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/${name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }
    );
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${name}: invalid response (${res.status})`);
    }
    if (!res.ok) {
      const msg = (json as { error?: string })?.error || `${name} failed (${res.status})`;
      throw new Error(msg);
    }
    return json as Record<string, unknown>;
  };

  const handleRefresh = async () => {
    setPhase('syncing');
    setSyncResult(null);
    setValidateResult(null);
    setErrorMsg(null);
    try {
      // 1) Push fresh data to Google Merchant Center
      const sync = await callFn('merchant-sync', { mode: 'live' });
      const summary: SyncSummary = {
        successCount: Number(sync.successCount ?? 0),
        errorCount: Number(sync.errorCount ?? 0),
        attemptedSendCount: Number(sync.attemptedSendCount ?? 0),
      };
      setSyncResult(summary);

      // 2) Validate the public feed reflects the latest changes
      setPhase('validating');
      const val = await callFn('validate-merchant-feed', {});
      const summary2: ValidateSummary = {
        totalItemsInFeed: Number(val.totalItemsInFeed ?? 0),
        ok: Number(
          (val.summary as { ok?: number } | undefined)?.ok ?? 0
        ),
        fail: Number(
          (val.summary as { fail?: number } | undefined)?.fail ?? 0
        ),
      };
      setValidateResult(summary2);

      setPhase('done');
      toast.success(
        `Feed refreshed — ${summary.successCount} synced, ${summary2.totalItemsInFeed} items live`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setPhase('error');
      toast.error(msg);
    }
  };

  const busy = phase === 'syncing' || phase === 'validating';

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          Refresh feed after publishing
        </CardTitle>
        <CardDescription>
          Run this right after clicking <strong>Publish</strong>. Pushes the latest
          product data to Google Merchant Center and validates the live feed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleRefresh}
          disabled={busy}
          size="lg"
          className="w-full sm:w-auto"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {phase === 'syncing' && 'Syncing to Merchant Center…'}
          {phase === 'validating' && 'Validating live feed…'}
          {phase === 'idle' && 'Refresh feed now'}
          {phase === 'done' && 'Run again'}
          {phase === 'error' && 'Retry'}
        </Button>

        {(syncResult || validateResult || errorMsg) && (
          <div className="space-y-2 text-sm">
            {syncResult && (
              <div className="flex items-center gap-2">
                {syncResult.errorCount === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-muted-foreground">Merchant sync:</span>
                <Badge variant="secondary">
                  {syncResult.successCount}/{syncResult.attemptedSendCount} sent
                </Badge>
                {syncResult.errorCount > 0 && (
                  <Badge variant="destructive">{syncResult.errorCount} errors</Badge>
                )}
              </div>
            )}
            {validateResult && (
              <div className="flex items-center gap-2">
                {validateResult.fail === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-muted-foreground">Feed validation:</span>
                <Badge variant="secondary">
                  {validateResult.totalItemsInFeed} items live
                </Badge>
                <Badge variant={validateResult.fail === 0 ? 'default' : 'destructive'}>
                  {validateResult.ok} ok / {validateResult.fail} fail
                </Badge>
              </div>
            )}
            {errorMsg && (
              <p className="text-destructive text-xs font-mono">{errorMsg}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}