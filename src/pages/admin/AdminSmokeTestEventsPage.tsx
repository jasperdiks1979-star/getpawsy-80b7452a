import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronRight, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const EXPECTED_STEPS = [
  'checkout_click',
  'checkout_redirect_attempt',
  'checkout_redirect_success',
  'payment_success',
] as const;

type ExpectedStep = (typeof EXPECTED_STEPS)[number];

interface SmokeRun {
  id: string;
  stripe_session_id: string | null;
  payment_intent_id: string | null;
  mode: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  webhook_received_at: string | null;
  webhook_event_id: string | null;
  refunded_at: string | null;
  refund_id: string | null;
  created_at: string;
}

interface FunnelEvent {
  id: string;
  session_id: string | null;
  stripe_session_id: string | null;
  step: string;
  source: string | null;
  source_component: string | null;
  event_source: string | null;
  is_bot: boolean | null;
  bot_reason: string | null;
  idempotency_key: string | null;
  value: number | null;
  currency: string | null;
  error_reason: string | null;
  metadata: any;
  created_at: string;
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { hour12: false });
}

function StepBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${ok ? 'bg-green-600/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

export default function AdminSmokeTestEventsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<SmokeRun[]>([]);
  const [eventsByRun, setEventsByRun] = useState<Record<string, FunnelEvent[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: runRows, error: runErr } = await supabase
        .from('smoke_test_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (runErr) throw runErr;
      const list = (runRows ?? []) as SmokeRun[];
      setRuns(list);

      const sessionIds = list.map((r) => r.stripe_session_id).filter((x): x is string => !!x);
      if (sessionIds.length === 0) {
        setEventsByRun({});
        return;
      }

      const { data: evRows, error: evErr } = await supabase
        .from('checkout_funnel_events')
        .select('id, session_id, stripe_session_id, step, source, source_component, event_source, is_bot, bot_reason, idempotency_key, value, currency, error_reason, metadata, created_at')
        .in('stripe_session_id', sessionIds)
        .order('created_at', { ascending: true });
      if (evErr) throw evErr;

      const grouped: Record<string, FunnelEvent[]> = {};
      for (const ev of (evRows ?? []) as FunnelEvent[]) {
        const key = ev.stripe_session_id ?? '';
        if (!key) continue;
        (grouped[key] ??= []).push(ev);
      }
      setEventsByRun(grouped);
    } catch (e: any) {
      toast({ title: 'Failed to load smoke test events', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const summaries = useMemo(() => {
    return runs.map((run) => {
      const sessionId = run.stripe_session_id ?? '';
      const events = eventsByRun[sessionId] ?? [];
      const seen = new Set(events.map((e) => e.step));
      const missing = EXPECTED_STEPS.filter((s) => !seen.has(s));
      const botEvents = events.filter((e) => e.is_bot === true);
      const duplicates = (() => {
        const counts = new Map<string, number>();
        for (const e of events) {
          const k = e.idempotency_key ?? `${e.step}-${e.created_at}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        return [...counts.values()].filter((c) => c > 1).length;
      })();
      return { run, events, missing, botEvents, duplicates };
    });
  }, [runs, eventsByRun]);

  return (
    <div className="container max-w-6xl py-10 space-y-6">
      <Helmet>
        <title>Admin · Smoke Test Funnel Events</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Smoke test funnel events</h1>
          <p className="text-sm text-muted-foreground">
            All <code>checkout_funnel_events</code> grouped by Stripe smoke test session, with missing steps surfaced.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/payments">
              <ExternalLink className="h-4 w-4 mr-2" />
              Payments
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Expected funnel steps</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {EXPECTED_STEPS.map((s) => (
            <Badge key={s} variant="secondary" className="font-mono text-xs">{s}</Badge>
          ))}
        </CardContent>
      </Card>

      {loading && runs.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading smoke test runs…
        </div>
      )}

      {!loading && runs.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No smoke test runs found yet. Trigger one from <Link to="/admin/payments" className="text-primary underline">/admin/payments</Link>.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {summaries.map(({ run, events, missing, botEvents, duplicates }) => {
          const isOpen = expanded[run.id] ?? false;
          const sessionPrefix = run.stripe_session_id ? `${run.stripe_session_id.slice(0, 18)}…` : '—';
          const allOk = missing.length === 0 && botEvents.length === 0 && duplicates === 0;
          return (
            <Card key={run.id}>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setExpanded((p) => ({ ...p, [run.id]: !isOpen }))}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2 min-w-0">
                    {isOpen ? <ChevronDown className="h-4 w-4 mt-1 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-1 shrink-0" />}
                    <div className="min-w-0">
                      <CardTitle className="text-base font-mono truncate">{sessionPrefix}</CardTitle>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <span>{fmtTime(run.created_at)}</span>
                        <span>mode={run.mode ?? '—'}</span>
                        <span>status={run.status ?? '—'}</span>
                        <span>
                          amount={run.amount_cents != null ? `${(run.amount_cents / 100).toFixed(2)} ${run.currency ?? ''}` : '—'}
                        </span>
                        <span>events={events.length}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge
                      variant={allOk ? 'default' : 'secondary'}
                      className={allOk ? 'bg-green-600 text-white hover:bg-green-700' : ''}
                    >
                      {allOk ? 'COMPLETE' : 'INCOMPLETE'}
                    </Badge>
                    {missing.length > 0 && (
                      <span className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {missing.length} missing
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {EXPECTED_STEPS.map((step) => (
                    <StepBadge key={step} ok={!missing.includes(step as ExpectedStep)} label={step} />
                  ))}
                </div>
              </CardHeader>

              {isOpen && (
                <CardContent className="space-y-4 border-t pt-4">
                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    <div>Session: <code className="font-mono">{run.stripe_session_id ?? '—'}</code></div>
                    <div>Payment intent: <code className="font-mono">{run.payment_intent_id ?? '—'}</code></div>
                    <div>Webhook received: {fmtTime(run.webhook_received_at)}</div>
                    <div>Webhook event id: <code className="font-mono">{run.webhook_event_id ?? '—'}</code></div>
                    <div>Refunded: {fmtTime(run.refunded_at)}</div>
                    <div>Refund id: <code className="font-mono">{run.refund_id ?? '—'}</code></div>
                  </div>

                  {missing.length > 0 && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                      <div className="font-medium text-destructive mb-1">Missing steps</div>
                      <div className="flex flex-wrap gap-1.5">
                        {missing.map((m) => (
                          <Badge key={m} variant="destructive" className="font-mono text-xs">{m}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {botEvents.length > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
                      <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                        {botEvents.length} event(s) flagged as bot
                      </div>
                      <ul className="space-y-0.5">
                        {botEvents.map((e) => (
                          <li key={e.id}><code>{e.step}</code> — {e.bot_reason ?? 'no reason'}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-medium mb-2">Events ({events.length})</div>
                    {events.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">No events recorded for this session.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground border-b">
                            <tr className="text-left">
                              <th className="py-1.5 pr-3">Time</th>
                              <th className="py-1.5 pr-3">Step</th>
                              <th className="py-1.5 pr-3">Source</th>
                              <th className="py-1.5 pr-3">Component</th>
                              <th className="py-1.5 pr-3">Origin</th>
                              <th className="py-1.5 pr-3">Bot</th>
                              <th className="py-1.5 pr-3">Idempotency</th>
                            </tr>
                          </thead>
                          <tbody>
                            {events.map((e) => {
                              const isExpected = (EXPECTED_STEPS as readonly string[]).includes(e.step);
                              return (
                                <tr key={e.id} className="border-b last:border-0 align-top">
                                  <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{fmtTime(e.created_at)}</td>
                                  <td className="py-1.5 pr-3">
                                    <code className={isExpected ? 'text-foreground' : 'text-muted-foreground'}>{e.step}</code>
                                    {e.error_reason && <div className="text-destructive">{e.error_reason}</div>}
                                  </td>
                                  <td className="py-1.5 pr-3 text-muted-foreground">{e.source ?? '—'}</td>
                                  <td className="py-1.5 pr-3 text-muted-foreground">{e.source_component ?? '—'}</td>
                                  <td className="py-1.5 pr-3 text-muted-foreground">{e.event_source ?? '—'}</td>
                                  <td className="py-1.5 pr-3">
                                    {e.is_bot ? (
                                      <span className="text-amber-600" title={e.bot_reason ?? ''}>yes</span>
                                    ) : (
                                      <span className="text-muted-foreground">no</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3 font-mono text-muted-foreground truncate max-w-[180px]">
                                    {e.idempotency_key ?? '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}