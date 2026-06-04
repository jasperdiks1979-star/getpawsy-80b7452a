import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, LifeBuoy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

/**
 * Admin-only "Recover and requeue job" button.
 *
 * For a cinematic_ad_jobs row stuck in
 *   needs_admin_review | failed | timeout_after_8m | timeout_after_12m
 * this clears the worker/error/timeout/budget fields, sets status back to
 * render_queued, and dispatches the render-cinematic-ad.yml workflow.
 *
 * The job is NOT live-published. Render → validate → dry-run readiness only.
 */
export default function RecoverAndRequeueButton() {
  const [jobId, setJobId] = useState('');
  const [forceBudget, setForceBudget] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const onRecover = async () => {
    const id = jobId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      toast({ title: 'Job ID required (full UUID)', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('cinematic-ad-recover-requeue', {
        body: { job_id: id, force_budget: forceBudget },
      });
      if (error) throw error;
      setResult(data);
      const r = data as any;
      if (r?.ok) {
        toast({
          title: r.gh_dispatched ? 'Recover+requeue dispatched' : 'Recover+requeue (DB only)',
          description: r.message,
        });
      } else {
        toast({
          title: `Recover refused (${r?.reason ?? 'error'})`,
          description: `${r?.message ?? 'unknown'} · current_status=${r?.current_status ?? 'unknown'}`,
          variant: 'destructive',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Recover failed', description: msg, variant: 'destructive' });
      setResult({ ok: false, message: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-amber-300 bg-amber-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LifeBuoy className="h-4 w-4 text-amber-600" />
          Recover and requeue cinematic_ad_job
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Resets a job stuck in <code>needs_admin_review</code>, <code>failed</code>,{' '}
          <code>timeout_after_8m</code>, or <code>timeout_after_12m</code> back to{' '}
          <code>render_queued</code> and dispatches GitHub Actions render. Does NOT publish.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <Input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="cinematic_ad_jobs.id (full UUID)"
            className="font-mono text-xs max-w-[420px]"
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={forceBudget}
              onChange={(e) => setForceBudget(e.target.checked)}
            />
            Force 24h budget override
          </label>
          <Button size="sm" onClick={onRecover} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LifeBuoy className="h-4 w-4 mr-2" />}
            Recover and requeue job
          </Button>
        </div>
        {result && (
          <div className="rounded border bg-background p-2 text-xs space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={result.ok ? 'default' : 'destructive'}>
                {result.ok ? 'ok' : 'failed'}
              </Badge>
              {result.gh_dispatched ? (
                <Badge variant="secondary">workflow_dispatch</Badge>
              ) : null}
              {result.previous_status ? (
                <Badge variant="outline">prev: {result.previous_status}</Badge>
              ) : null}
              {result.new_status ? (
                <Badge variant="outline">now: {result.new_status}</Badge>
              ) : null}
              {result.current_status ? (
                <Badge variant="outline">current: {result.current_status}</Badge>
              ) : null}
            </div>
            <div className="text-muted-foreground">{result.message}</div>
            <details className="text-[10px]">
              <summary className="cursor-pointer">raw response</summary>
              <pre className="overflow-auto">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}