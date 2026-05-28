import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronRight, ExternalLink, Loader2, AlertTriangle, FileSpreadsheet, FileDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

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
  const [searchParams] = useSearchParams();
  const focusSession = searchParams.get('session');
  const focusKey = searchParams.get('key');
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<SmokeRun[]>([]);
  const [eventsByRun, setEventsByRun] = useState<Record<string, FunnelEvent[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const [csvGenerating, setCsvGenerating] = useState(false);
  // Filters — date range (local YYYY-MM-DD) and max number of runs.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [maxRuns, setMaxRuns] = useState(30);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('smoke_test_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(500, maxRuns || 30)));
      if (fromDate) {
        const fromIso = new Date(`${fromDate}T00:00:00`).toISOString();
        q = q.gte('created_at', fromIso);
      }
      if (toDate) {
        // Inclusive end-of-day
        const toIso = new Date(`${toDate}T23:59:59.999`).toISOString();
        q = q.lte('created_at', toIso);
      }
      const { data: runRows, error: runErr } = await q;
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
  }, [toast, fromDate, toDate, maxRuns]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const generateReport = useCallback(() => {
    setGenerating(true);
    try {
      // Filter metadata sheet — captures the active filter context.
      const filterRows = [
        { field: 'from_date', value: fromDate || '(none)' },
        { field: 'to_date', value: toDate || '(none)' },
        { field: 'max_runs', value: String(maxRuns) },
        { field: 'runs_in_report', value: String(runs.length) },
        { field: 'generated_at', value: new Date().toISOString() },
      ];

      // Sheet 1: Summary per run (incl. duplicate groups per session)
      const summaryRows = runs.map((run) => {
        const sessionId = run.stripe_session_id ?? '';
        const events = eventsByRun[sessionId] ?? [];
        const keyCounts = new Map<string, number>();
        for (const e of events) {
          if (!e.idempotency_key) continue;
          keyCounts.set(e.idempotency_key, (keyCounts.get(e.idempotency_key) ?? 0) + 1);
        }
        const dupGroups = [...keyCounts.values()].filter((c) => c > 1).length;
        const distinctKeys = keyCounts.size;
        const nullKeys = events.filter((e) => !e.idempotency_key).length;
        const seen = new Set(events.map((e) => e.step));
        const missing = EXPECTED_STEPS.filter((s) => !seen.has(s));
        return {
          stripe_session_id: sessionId,
          mode: run.mode ?? '',
          status: run.status ?? '',
          created_at: run.created_at,
          total_events: events.length,
          distinct_idempotency_keys: distinctKeys,
          null_keys: nullKeys,
          duplicate_groups: dupGroups,
          missing_steps: missing.join(','),
        };
      });

      // Sheet 2: Duplicate detail rows
      const dupRows: Array<Record<string, unknown>> = [];
      for (const run of runs) {
        const sessionId = run.stripe_session_id ?? '';
        const events = eventsByRun[sessionId] ?? [];
        const groups = new Map<string, FunnelEvent[]>();
        for (const e of events) {
          if (!e.idempotency_key) continue;
          (groups.get(e.idempotency_key) ?? groups.set(e.idempotency_key, []).get(e.idempotency_key)!).push(e);
        }
        for (const [key, group] of groups) {
          if (group.length <= 1) continue;
          const deepLink = `${window.location.origin}/admin/smoke-test-events?session=${encodeURIComponent(sessionId)}&key=${encodeURIComponent(key)}`;
          dupRows.push({
            stripe_session_id: sessionId,
            idempotency_key: key,
            dup_count: group.length,
            steps: group.map((g) => g.step).join(','),
            first_seen: group[0].created_at,
            last_seen: group[group.length - 1].created_at,
            deep_link: deepLink,
          });
        }
      }

      // Sheet 3: All events
      const allEvents: Array<Record<string, unknown>> = [];
      for (const run of runs) {
        const sessionId = run.stripe_session_id ?? '';
        for (const e of eventsByRun[sessionId] ?? []) {
          allEvents.push({
            stripe_session_id: sessionId,
            idempotency_key: e.idempotency_key ?? '',
            step: e.step,
            source: e.source ?? '',
            event_source: e.event_source ?? '',
            is_bot: e.is_bot ? 'yes' : 'no',
            created_at: e.created_at,
          });
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filterRows), 'Filters');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
      const dupSheet = XLSX.utils.json_to_sheet(
        dupRows.length > 0 ? dupRows : [{ note: 'No duplicates detected' }],
      );
      // Turn the deep_link column into clickable Excel hyperlinks
      if (dupRows.length > 0) {
        const range = XLSX.utils.decode_range(dupSheet['!ref'] ?? 'A1');
        // Find the deep_link column index from the header row
        let linkCol = -1;
        for (let c = range.s.c; c <= range.e.c; c++) {
          const headerCell = dupSheet[XLSX.utils.encode_cell({ r: 0, c })];
          if (headerCell && String(headerCell.v) === 'deep_link') {
            linkCol = c;
            break;
          }
        }
        if (linkCol >= 0) {
          for (let r = 1; r <= range.e.r; r++) {
            const addr = XLSX.utils.encode_cell({ r, c: linkCol });
            const cell = dupSheet[addr];
            if (cell && typeof cell.v === 'string' && cell.v) {
              cell.l = { Target: cell.v, Tooltip: 'Open in admin: session + idempotency key' };
              cell.v = 'Open in admin →';
              cell.s = { font: { color: { rgb: '1E3A8A' }, underline: true } };
            }
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, dupSheet, 'Duplicates');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allEvents), 'All Events');

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      XLSX.writeFile(wb, `smoke-test-duplicates-${stamp}.xlsx`);

      toast({
        title: 'Rapport gegenereerd',
        description: `${runs.length} runs · ${allEvents.length} events · ${dupRows.length} duplicate groups`,
      });
    } catch (e: any) {
      toast({
        title: 'Rapport genereren mislukt',
        description: e?.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  }, [runs, eventsByRun, toast, fromDate, toDate, maxRuns]);

  const generateCsvReport = useCallback(() => {
    setCsvGenerating(true);
    try {
      const summaryRows = runs.map((run) => {
        const sessionId = run.stripe_session_id ?? '';
        const events = eventsByRun[sessionId] ?? [];
        const keyCounts = new Map<string, number>();
        for (const e of events) {
          if (!e.idempotency_key) continue;
          keyCounts.set(e.idempotency_key, (keyCounts.get(e.idempotency_key) ?? 0) + 1);
        }
        const dupGroups = [...keyCounts.values()].filter((c) => c > 1).length;
        const distinctKeys = keyCounts.size;
        const nullKeys = events.filter((e) => !e.idempotency_key).length;
        const seen = new Set(events.map((e) => e.step));
        const missing = EXPECTED_STEPS.filter((s) => !seen.has(s));
        const botEvents = events.filter((e) => e.is_bot === true).length;
        return {
          stripe_session_id: sessionId,
          mode: run.mode ?? '',
          status: run.status ?? '',
          created_at: run.created_at,
          total_events: events.length,
          distinct_idempotency_keys: distinctKeys,
          null_keys: nullKeys,
          duplicate_groups: dupGroups,
          bot_events: botEvents,
          missing_steps: missing.join(','),
        };
      });

      const ws = XLSX.utils.json_to_sheet(summaryRows);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `smoke-test-summary-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'CSV gedownload',
        description: `${summaryRows.length} runs geëxporteerd als CSV`,
      });
    } catch (e: any) {
      toast({
        title: 'CSV export mislukt',
        description: e?.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setCsvGenerating(false);
    }
  }, [runs, eventsByRun, toast]);

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

  // Auto-expand the focused run when arriving via a deep link from the report.
  useEffect(() => {
    if (!focusSession || runs.length === 0) return;
    const target = runs.find((r) => r.stripe_session_id === focusSession);
    if (!target) return;
    setExpanded((p) => ({ ...p, [target.id]: true }));
    // Defer scroll until after expansion paints.
    requestAnimationFrame(() => {
      const el = document.getElementById(`run-${target.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [focusSession, runs]);

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
          <Button
            variant="default"
            size="sm"
            onClick={generateReport}
            disabled={generating || loading || runs.length === 0}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Genereer rapport (XLSX)
          </Button>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="from-date" className="text-xs">From</Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to-date" className="text-xs">To</Label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="max-runs" className="text-xs">Max runs (1–500)</Label>
            <Input
              id="max-runs"
              type="number"
              min={1}
              max={500}
              value={maxRuns}
              onChange={(e) => setMaxRuns(Number(e.target.value) || 30)}
              className="h-9 w-[140px]"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={fetchAll} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Apply filters
          </Button>
          {(fromDate || toDate || maxRuns !== 30) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFromDate(''); setToDate(''); setMaxRuns(30); }}
              disabled={loading}
            >
              Reset
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            {runs.length} run{runs.length === 1 ? '' : 's'} loaded
          </div>
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
          const isFocusedRun = focusSession && run.stripe_session_id === focusSession;
          return (
            <Card
              key={run.id}
              id={`run-${run.id}`}
              className={isFocusedRun ? 'ring-2 ring-primary' : undefined}
            >
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
                              const isFocusedEvent =
                                !!focusKey &&
                                !!isFocusedRun &&
                                e.idempotency_key === focusKey;
                              return (
                                <tr
                                  key={e.id}
                                  className={`border-b last:border-0 align-top ${isFocusedEvent ? 'bg-primary/10' : ''}`}
                                >
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