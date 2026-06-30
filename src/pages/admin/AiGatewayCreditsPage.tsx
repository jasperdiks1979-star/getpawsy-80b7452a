import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Zap } from 'lucide-react';

type BalanceState = 'ok' | 'low' | 'rate_limited' | 'error' | 'no_key' | 'loading';

interface Balance {
  state: BalanceState;
  message: string;
  status?: number;
  checkedAt?: string;
}

interface CreditStateRow {
  state: string | null;
  paused: boolean | null;
  ai_generation_paused: boolean | null;
  last_402_at: string | null;
  last_success_at: string | null;
  recent_success_count_1h: number | null;
  recent_402_count_1h: number | null;
  consecutive_402_count: number | null;
  credits_remaining: number | null;
  daily_burn_rate: number | null;
  estimated_days_remaining: number | null;
  forecast_state: string | null;
}

interface CreditEvent {
  id: string;
  created_at: string;
  event_type: string;
  status_code: number | null;
  function_name: string | null;
  message: string | null;
  model: string | null;
  product_slug: string | null;
}

const POLL_MS = 60_000;

export default function AiGatewayCreditsPage() {
  const [balance, setBalance] = useState<Balance>({ state: 'loading', message: 'Probing AI Gateway…' });
  const [creditState, setCreditState] = useState<CreditStateRow | null>(null);
  const [events, setEvents] = useState<CreditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);

  const probeBalance = useCallback(async () => {
    setProbing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-balance-check');
      if (error) {
        setBalance({ state: 'error', message: error.message });
      } else {
        setBalance({
          state: (data?.state as BalanceState) ?? 'error',
          message: data?.message ?? 'Unknown response',
          status: data?.status,
          checkedAt: data?.checkedAt,
        });
      }
    } catch (e: any) {
      setBalance({ state: 'error', message: String(e?.message ?? e) });
    } finally {
      setProbing(false);
    }
  }, []);

  const loadFromDb = useCallback(async () => {
    setLoading(true);
    const sb: any = supabase;
    const [stateRes, eventsRes] = await Promise.all([
      sb
        .from('pinterest_credit_state')
        .select(
          'state,paused,ai_generation_paused,last_402_at,last_success_at,recent_success_count_1h,recent_402_count_1h,consecutive_402_count,credits_remaining,daily_burn_rate,estimated_days_remaining,forecast_state',
        )
        .eq('id', 1)
        .maybeSingle(),
      sb
        .from('pinterest_credit_events')
        .select('id,created_at,event_type,status_code,function_name,message,model,product_slug')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    if (stateRes.data) setCreditState(stateRes.data as CreditStateRow);
    setEvents((eventsRes.data ?? []) as CreditEvent[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    probeBalance();
    loadFromDb();
    const t = setInterval(() => {
      probeBalance();
      loadFromDb();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [probeBalance, loadFromDb]);

  const cutoff24h = useMemo(() => Date.now() - 86_400_000, []);
  const cutoff7d = useMemo(() => Date.now() - 7 * 86_400_000, []);

  const stepBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { fn: string; total: number; failed402: number; success: number; last402: string | null; lastMessage: string | null }
    >();
    for (const e of events) {
      const fn = e.function_name ?? 'unknown';
      const ts = new Date(e.created_at).getTime();
      if (ts < cutoff7d) continue;
      const row = map.get(fn) ?? { fn, total: 0, failed402: 0, success: 0, last402: null, lastMessage: null };
      row.total += 1;
      if (e.event_type === 'payment_required' || e.status_code === 402) {
        row.failed402 += 1;
        if (!row.last402 || ts > new Date(row.last402).getTime()) {
          row.last402 = e.created_at;
          row.lastMessage = e.message;
        }
      } else if (e.event_type === 'success' || e.event_type === 'probe_success') {
        row.success += 1;
      }
      map.set(fn, row);
    }
    return Array.from(map.values()).sort((a, b) => b.failed402 - a.failed402 || b.total - a.total);
  }, [events, cutoff7d]);

  const recent402 = useMemo(
    () =>
      events
        .filter(
          (e) => (e.event_type === 'payment_required' || e.status_code === 402) && new Date(e.created_at).getTime() >= cutoff24h,
        )
        .slice(0, 50),
    [events, cutoff24h],
  );

  const isPaused = !!(creditState?.paused || creditState?.ai_generation_paused);
  const stateColor =
    creditState?.state === 'red' || isPaused
      ? 'border-destructive bg-destructive/5'
      : creditState?.state === 'orange'
        ? 'border-amber-500/40 bg-amber-500/5'
        : 'border-emerald-500/40 bg-emerald-500/5';

  const balanceTone =
    balance.state === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : balance.state === 'loading'
        ? 'text-muted-foreground'
        : 'text-destructive';

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <Helmet>
        <title>AI Gateway Credits | Admin</title>
      </Helmet>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="h-7 w-7" /> AI Gateway Credits
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live Lovable AI balance probe and pipeline-step breakdown of <code>402 Not enough credits</code> events.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            probeBalance();
            loadFromDb();
          }}
          disabled={probing || loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${probing || loading ? 'animate-spin' : ''}`} />
          Recheck
        </Button>
      </div>

      {/* Live probe */}
      <Card className={stateColor}>
        <CardContent className="p-5 flex items-start gap-3">
          {balance.state === 'ok' ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600 mt-0.5" />
          ) : balance.state === 'loading' ? (
            <Loader2 className="h-6 w-6 animate-spin mt-0.5" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-destructive mt-0.5" />
          )}
          <div className="flex-1">
            <div className={`font-semibold ${balanceTone}`}>
              {balance.state === 'ok'
                ? 'AI Gateway reachable · credits available'
                : balance.state === 'low'
                  ? '402 Not enough credits — generation pipelines BLOCKED'
                  : balance.state === 'rate_limited'
                    ? '429 Rate-limited — retry shortly'
                    : balance.state === 'no_key'
                      ? 'LOVABLE_API_KEY missing'
                      : balance.state === 'loading'
                        ? 'Probing…'
                        : 'Gateway unreachable'}
            </div>
            <div className="text-xs text-muted-foreground mt-1 break-all">{balance.message}</div>
            {balance.checkedAt && (
              <div className="text-[11px] text-muted-foreground mt-1">
                Last probe: {new Date(balance.checkedAt).toLocaleString()}
                {balance.status ? ` · HTTP ${balance.status}` : ''}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* DB-derived state */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric
          label="Pipeline state"
          value={creditState?.state?.toUpperCase() ?? '—'}
          accent={creditState?.state === 'red' ? 'text-destructive' : creditState?.state === 'orange' ? 'text-amber-600' : ''}
        />
        <Metric label="AI generation" value={isPaused ? 'PAUSED' : 'LIVE'} accent={isPaused ? 'text-destructive' : 'text-emerald-600'} />
        <Metric label="402s · last 1h" value={creditState?.recent_402_count_1h ?? 0} accent={(creditState?.recent_402_count_1h ?? 0) > 0 ? 'text-destructive' : ''} />
        <Metric label="Successes · last 1h" value={creditState?.recent_success_count_1h ?? 0} />
        <Metric label="Credits remaining" value={creditState?.credits_remaining ?? '—'} />
        <Metric label="Daily burn" value={creditState?.daily_burn_rate?.toFixed?.(0) ?? '—'} />
        <Metric
          label="Est. days remaining"
          value={creditState?.estimated_days_remaining?.toFixed?.(1) ?? '—'}
          accent={(creditState?.estimated_days_remaining ?? 99) < 2 ? 'text-destructive' : ''}
        />
        <Metric label="Forecast" value={creditState?.forecast_state ?? '—'} />
      </div>

      {/* Pipeline-step breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>402 breakdown by pipeline step · last 7d</CardTitle>
          <CardDescription>
            Each row is one edge function calling the AI Gateway. Red badge = current step blocked by credit exhaustion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stepBreakdown.length === 0 ? (
            <div className="text-sm text-muted-foreground">No gateway events recorded in the last 7 days.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Pipeline step</th>
                    <th className="py-2 pr-3">Total calls</th>
                    <th className="py-2 pr-3">Success</th>
                    <th className="py-2 pr-3">402</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Last 402</th>
                    <th className="py-2 pr-3">Last 402 message</th>
                  </tr>
                </thead>
                <tbody>
                  {stepBreakdown.map((s) => (
                    <tr key={s.fn} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{s.fn}</td>
                      <td className="py-2 pr-3">{s.total}</td>
                      <td className="py-2 pr-3 text-emerald-600">{s.success}</td>
                      <td className={`py-2 pr-3 ${s.failed402 > 0 ? 'text-destructive font-semibold' : ''}`}>
                        {s.failed402}
                      </td>
                      <td className="py-2 pr-3">
                        {s.failed402 === 0 ? (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                            healthy
                          </Badge>
                        ) : s.last402 && Date.now() - new Date(s.last402).getTime() < 3_600_000 ? (
                          <Badge variant="destructive">credit-blocked</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                            recovered
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {s.last402 ? new Date(s.last402).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[28ch] truncate" title={s.lastMessage ?? ''}>
                        {s.lastMessage ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent 402 event log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent 402 events · last 24h</CardTitle>
          <CardDescription>Raw payment_required events as captured by the credit guard.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent402.length === 0 ? (
            <div className="text-sm text-muted-foreground">No 402 events in the last 24 hours. ✅</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Step</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {recent402.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{e.function_name ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs">{e.model ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs">{e.product_slug ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs text-destructive max-w-[40ch] truncate" title={e.message ?? ''}>
                        {e.message ?? '402 Not enough credits'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Top up in <strong>Settings → Cloud &amp; AI balance</strong>. The credit guard's 10-min probe auto-resumes paused pipelines on the next successful gateway call.
      </p>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${accent ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}