import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Play, RefreshCw, AlertTriangle, CheckCircle2, Save, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Diag {
  ok: boolean;
  now?: string;
  ready_to_publish?: number;
  will_publish_next_tick?: boolean;
  queued_total?: number;
  pipeline_report?: {
    draft_count: number;
    approved_count: number;
    queued_count: number;
    blocked_by_qa: number;
    missing_board: number;
    missing_score: number;
  };
  candidate_count?: number;
  warmup?: {
    active: boolean;
    daily_cap_used: number;
    daily_cap_max: number;
    min_gap_minutes: number;
    last_posted_at: string | null;
    minutes_since_last_post: number | null;
    minutes_remaining_for_gap: number;
    next_allowed_publish_at: string;
    us_score_threshold: number;
    per_category_daily_cap?: number;
  };
  per_category?: { cap: number; used_24h: Record<string, number> };
  gating?: { blocked: boolean; reason: string | null };
  flags?: Record<string, boolean | string | null>;
  next_eligible_pin?: {
    id: string;
    status: string;
    approved_at: string | null;
    board_id: string | null;
    scheduled_at: string | null;
    destination_url: string | null;
    destination_url_ok: boolean;
    image_url: string | null;
    image_url_ok: boolean;
    us_score: number;
    rejection_reason: string | null;
    eligible: boolean;
    ineligibility_reasons: string[];
  } | null;
}

export default function CronPublisherPanel() {
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [dailyCap, setDailyCap] = useState<string>('');
  const [perCatCap, setPerCatCap] = useState<string>('');
  const [usThreshold, setUsThreshold] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<any>(null);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['pinterest-cron-diagnostic'],
    queryFn: async (): Promise<Diag> => {
      const { data, error } = await supabase.functions.invoke('pinterest-cron-diagnostic', { body: {} });
      if (error) throw error;
      return data as Diag;
    },
    refetchInterval: 30_000,
  });

  // Load current runtime settings to prefill inputs
  useEffect(() => {
    (async () => {
      const { data: rt } = await supabase
        .from('pinterest_runtime_settings')
        .select('daily_pin_cap, per_category_daily_cap, us_score_threshold')
        .eq('id', 1)
        .maybeSingle();
      if (rt) {
        setDailyCap(String((rt as any).daily_pin_cap ?? ''));
        setPerCatCap(String((rt as any).per_category_daily_cap ?? ''));
        setUsThreshold(String((rt as any).us_score_threshold ?? ''));
      }
    })();
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const updates: Record<string, number> = {};
      const d = Number(dailyCap), p = Number(perCatCap), u = Number(usThreshold);
      if (Number.isFinite(d) && d > 0) updates.daily_pin_cap = Math.floor(d);
      if (Number.isFinite(p) && p > 0) updates.per_category_daily_cap = Math.floor(p);
      if (Number.isFinite(u) && u >= 0 && u <= 1) updates.us_score_threshold = u;
      if (Object.keys(updates).length === 0) {
        toast({ title: 'Nothing to save', description: 'Provide valid numbers' });
        return;
      }
      const { error } = await supabase
        .from('pinterest_runtime_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      toast({ title: 'Saved', description: 'Runtime settings updated' });
      await refetch();
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const runCronNow = async () => {
    setRunning(true);
    setLastRun(null);
    try {
      const beforeQueued = data?.queued_total ?? null;
      const { data: res, error } = await supabase.functions.invoke('pinterest-cron-worker', { body: {} });
      if (error) throw error;
      const r = res as any;
      // Refetch diagnostic to capture the new queued count
      const refreshed = await refetch();
      const afterQueued = (refreshed.data as Diag | undefined)?.queued_total ?? null;
      const posted = (r?.results || []).filter((x: any) => x.status === 'posted');
      setLastRun({
        ok: r?.ok,
        message: r?.message || (posted.length ? `Posted ${posted.length}` : 'Skipped'),
        processed: r?.processed ?? 0,
        results: r?.results ?? [],
        before_queued: beforeQueued,
        after_queued: afterQueued,
        external_id: posted[0]?.externalId || null,
        error: r?.error || null,
      });
      if (posted.length > 0) {
        toast({ title: 'Cron published', description: `Pinterest pin: ${posted[0].externalId}` });
      } else {
        toast({ title: 'Cron skipped', description: r?.message || r?.error || 'No pin published' });
      }
    } catch (e) {
      toast({ title: 'Cron run failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const refreshFailedQueue = async () => {
    setRefreshing(true);
    setLastRefresh(null);
    try {
      const beforeQueued = data?.queued_total ?? null;
      const { data: res, error } = await supabase.functions.invoke('pinterest-refresh-failed-queue', {
        body: { limit: 10, run_cron: true },
      });
      if (error) throw error;
      const r = res as any;
      await refetch();
      setLastRefresh({
        ok: r?.ok,
        message: r?.message,
        scanned: r?.scanned,
        failing_total: r?.failing_total,
        processed: r?.processed,
        refreshed: r?.refreshed,
        passed_qa: r?.passed_qa,
        requeued: r?.requeued,
        still_failing: r?.still_failing,
        before_queued: beforeQueued ?? r?.before_queued,
        after_queued: r?.after_queued,
        published_pin_id: r?.published_pin_id,
        report: r?.report ?? [],
      });
      toast({
        title: 'Refresh complete',
        description: `Refreshed ${r?.refreshed ?? 0} · passed QA ${r?.passed_qa ?? 0} · requeued ${r?.requeued ?? 0} · still failing ${r?.still_failing ?? 0}`,
      });
    } catch (e) {
      toast({ title: 'Refresh failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  const w = data?.warmup;
  const blocked = !!data?.gating?.blocked;
  const willPublish = !!data?.will_publish_next_tick;

  return (
    <Card className="mb-4 border-dashed">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Cron Publisher Diagnostic</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" variant="secondary" onClick={refreshFailedQueue} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Refresh Failed Queue
          </Button>
          <Button size="sm" onClick={runCronNow} disabled={running}>
            {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
            Run cron publisher now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!data ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className={`rounded border px-3 py-2 ${blocked ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
              {blocked ? <AlertTriangle className="inline h-4 w-4 mr-1" /> : <CheckCircle2 className="inline h-4 w-4 mr-1" />}
              <strong>{blocked ? 'Cron is gated' : 'Cron is open'}:</strong>{' '}
              {data.gating?.reason || 'No active gate — next tick will attempt publish.'}
            </div>

            <div className={`rounded border px-3 py-2 ${willPublish ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
              <strong>Will publish next tick:</strong>{' '}
              <Badge variant={willPublish ? 'default' : 'destructive'}>{willPublish ? 'yes' : 'no'}</Badge>
              {!willPublish && data.next_eligible_pin?.ineligibility_reasons?.length ? (
                <span className="ml-2 text-xs">({data.next_eligible_pin.ineligibility_reasons.join(' · ')})</span>
              ) : null}
            </div>

            <div className="rounded border p-3 space-y-2">
              <div className="font-medium text-sm">Runtime caps & threshold</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                <div>
                  <Label className="text-xs">daily_pin_cap</Label>
                  <Input type="number" min={1} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">per_category_daily_cap</Label>
                  <Input type="number" min={1} value={perCatCap} onChange={(e) => setPerCatCap(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">us_score_threshold (0–1)</Label>
                  <Input type="number" step="0.05" min={0} max={1} value={usThreshold} onChange={(e) => setUsThreshold(e.target.value)} />
                </div>
                <Button onClick={saveSettings} disabled={savingSettings} size="sm">
                  {savingSettings ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  Save settings
                </Button>
              </div>
              {data.per_category && (
                <div className="text-xs text-muted-foreground">
                  Per-category 24h usage (cap {data.per_category.cap}):{' '}
                  {Object.entries(data.per_category.used_24h).length === 0
                    ? 'none yet'
                    : Object.entries(data.per_category.used_24h)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ')}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Queued total" value={data.queued_total ?? 0} />
              <Metric label="Ready to publish" value={data.ready_to_publish ?? 0} ok={(data.ready_to_publish ?? 0) > 0} />
              <Metric label="Daily cap" value={`${w?.daily_cap_used ?? 0} / ${w?.daily_cap_max ?? 0}`} ok={(w?.daily_cap_used ?? 0) < (w?.daily_cap_max ?? 0)} />
              <Metric label="Min-gap remaining" value={`${w?.minutes_remaining_for_gap ?? 0}m`} ok={(w?.minutes_remaining_for_gap ?? 0) === 0} />
              <Metric label="Min-gap setting" value={`${w?.min_gap_minutes ?? 0}m`} />
              <Metric label="US score threshold" value={w?.us_score_threshold ?? '—'} />
              <Metric label="Last posted" value={w?.last_posted_at ? new Date(w.last_posted_at).toLocaleTimeString() : '—'} />
              <Metric label="Next allowed" value={w?.next_allowed_publish_at ? new Date(w.next_allowed_publish_at).toLocaleTimeString() : '—'} />
            </div>

            {data.pipeline_report && (
              <div className="rounded border p-3">
                <div className="font-medium mb-2 text-sm">Pipeline report</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Metric label="Drafts" value={data.pipeline_report.draft_count} />
                  <Metric label="Approved" value={data.pipeline_report.approved_count} ok={data.pipeline_report.approved_count > 0} />
                  <Metric label="Queued" value={data.pipeline_report.queued_count} ok={data.pipeline_report.queued_count > 0} />
                  <Metric label="Blocked by QA" value={data.pipeline_report.blocked_by_qa} ok={data.pipeline_report.blocked_by_qa === 0} />
                  <Metric label="Missing board" value={data.pipeline_report.missing_board} ok={data.pipeline_report.missing_board === 0} />
                  <Metric label="Missing score" value={data.pipeline_report.missing_score} ok={data.pipeline_report.missing_score === 0} />
                </div>
              </div>
            )}

            <div className="rounded border p-3">
              <div className="font-medium mb-1">Next eligible pin</div>
              {data.next_eligible_pin ? (
                <div className="space-y-1 text-xs">
                  <Row k="pin id" v={data.next_eligible_pin.id} mono />
                  <Row k="status" v={data.next_eligible_pin.status} />
                  <Row k="approved_at" v={data.next_eligible_pin.approved_at || '—'} />
                  <Row k="board_id" v={data.next_eligible_pin.board_id || '—'} mono />
                  <Row k="scheduled_at" v={data.next_eligible_pin.scheduled_at || '—'} />
                  <Row k="destination_url" v={`${data.next_eligible_pin.destination_url_ok ? '✓' : '✗'} ${(data.next_eligible_pin.destination_url || '').slice(0, 80)}…`} />
                  <Row k="image_url" v={`${data.next_eligible_pin.image_url_ok ? '✓' : '✗'} ${(data.next_eligible_pin.image_url || '').slice(0, 80)}…`} />
                  <Row k="us_score" v={`${data.next_eligible_pin.us_score} (threshold ${w?.us_score_threshold})`} />
                  <Row k="rejection_reason" v={data.next_eligible_pin.rejection_reason || '—'} />
                  <Row k="eligible" v={
                    <Badge variant={data.next_eligible_pin.eligible ? 'default' : 'destructive'}>
                      {data.next_eligible_pin.eligible ? 'true' : 'false'}
                    </Badge>
                  } />
                  {data.next_eligible_pin.ineligibility_reasons.length > 0 && (
                    <Row k="why not" v={data.next_eligible_pin.ineligibility_reasons.join(' · ')} />
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No queued candidate matched cron selection.</div>
              )}
            </div>

            {lastRun && (
              <div className="rounded border p-3 text-xs">
                <div className="font-medium mb-1">Last manual cron run</div>
                <Row k="ok" v={String(lastRun.ok)} />
                <Row k="processed" v={lastRun.processed} />
                <Row k="message" v={lastRun.message || '—'} />
                <Row k="before queued" v={lastRun.before_queued ?? '—'} />
                <Row k="after queued" v={lastRun.after_queued ?? '—'} />
                <Row k="pinterest_pin_id" v={lastRun.external_id || '—'} mono />
                {lastRun.error && <Row k="error" v={lastRun.error} />}
              </div>
            )}

            {lastRefresh && (
              <div className="rounded border p-3 text-xs space-y-1">
                <div className="font-medium mb-1">Last failed-queue refresh</div>
                <Row k="ok" v={String(lastRefresh.ok)} />
                <Row k="message" v={lastRefresh.message || '—'} />
                <Row k="scanned" v={lastRefresh.scanned} />
                <Row k="failing total" v={lastRefresh.failing_total} />
                <Row k="processed" v={lastRefresh.processed} />
                <Row k="pins refreshed" v={lastRefresh.refreshed} />
                <Row k="pins passed QA" v={lastRefresh.passed_qa} />
                <Row k="pins requeued" v={lastRefresh.requeued} />
                <Row k="still failing" v={lastRefresh.still_failing} />
                <Row k="before queued" v={lastRefresh.before_queued ?? '—'} />
                <Row k="after queued" v={lastRefresh.after_queued ?? '—'} />
                <Row k="published pin id" v={lastRefresh.published_pin_id || '—'} mono />
                {Array.isArray(lastRefresh.report) && lastRefresh.report.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-muted-foreground">Per-pin report ({lastRefresh.report.length})</summary>
                    <div className="mt-2 max-h-72 overflow-auto space-y-1">
                      {lastRefresh.report.map((rr: any, i: number) => (
                        <div key={i} className="border rounded px-2 py-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              rr.status === 'refreshed' ? 'default'
                              : rr.status === 'still_failing' || rr.status === 'regen_failed' ? 'destructive'
                              : 'secondary'
                            }>{rr.status}</Badge>
                            <span className="font-mono">{rr.product_slug || '—'}</span>
                          </div>
                          <div className="text-muted-foreground">
                            old <span className="font-mono">{(rr.old_pin_id || '').slice(0, 8)}</span>
                            {' → '}
                            new <span className="font-mono">{(rr.new_pin_id || '—').slice(0, 8)}</span>
                            {' · qa: '}{(rr.qa_failures || []).join(',') || 'none'}
                            {rr.post_qa_failures?.length ? ` · post: ${rr.post_qa_failures.join(',')}` : ''}
                            {rr.extra_failures?.length ? ` · extra: ${rr.extra_failures.join(',')}` : ''}
                            {rr.reason ? ` · ${rr.reason}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, ok }: { label: string; value: any; ok?: boolean }) {
  return (
    <div className="rounded border px-2 py-1.5 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-mono ${ok === false ? 'text-amber-700' : ok === true ? 'text-emerald-700' : ''}`}>{String(value)}</div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: any; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? 'font-mono break-all' : 'break-all'}>{v}</span>
    </div>
  );
}