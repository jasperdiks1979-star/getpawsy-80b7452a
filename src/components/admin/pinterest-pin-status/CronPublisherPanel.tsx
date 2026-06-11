import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Diag {
  ok: boolean;
  now?: string;
  ready_to_publish?: number;
  queued_total?: number;
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
  };
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

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['pinterest-cron-diagnostic'],
    queryFn: async (): Promise<Diag> => {
      const { data, error } = await supabase.functions.invoke('pinterest-cron-diagnostic', { body: {} });
      if (error) throw error;
      return data as Diag;
    },
    refetchInterval: 30_000,
  });

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

  const w = data?.warmup;
  const blocked = !!data?.gating?.blocked;

  return (
    <Card className="mb-4 border-dashed">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Cron Publisher Diagnostic</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
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