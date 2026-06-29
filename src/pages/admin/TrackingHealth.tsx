/**
 * /admin/tracking-health — pixel heartbeat & missing-event alerts.
 *
 * Reads `lp_funnel_events` for the last 24h and reports last-seen + 24h count per
 * critical event. Flags any expected event with zero recent rows.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { getCanonicalEventCounts, CANONICAL_STAGE_LABEL, type CanonicalStage } from '@/lib/canonicalAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Activity, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

const EXPECTED_EVENTS = [
  'view_item',
  'pdp_view',
  'add_to_cart',
  'begin_checkout',
  'payment_success',
  'scroll_depth',
  'tiktok_pdp_buy_box_visible',
  'tiktok_first_interaction',
  'tiktok_atc_click',
  'tiktok_buy_now_click',
];

interface Row { event_name: string; created_at: string; degraded: boolean | null; validation_status: string | null; }

function rel(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function TrackingHealth() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [canonical, setCanonical] = useState<Record<CanonicalStage, number> | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const [rawRes, canon] = await Promise.all([
      supabase
        .from('lp_funnel_events')
        .select('event_name, created_at, degraded, validation_status')
        .gte('created_at', since)
        .eq('qa', false)
        .limit(50000)
        .order('created_at', { ascending: false }),
      getCanonicalEventCounts(24).catch(() => null),
    ]);
    if (rawRes.error) { setError(rawRes.error.message); setRows([]); }
    else setRows((rawRes.data ?? []) as Row[]);
    setCanonical(canon);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const map = new Map<string, { count: number; lastSeen: string | null; degraded: number; invalid: number }>();
    for (const r of rows) {
      const m = map.get(r.event_name) ?? { count: 0, lastSeen: null, degraded: 0, invalid: 0 };
      m.count++;
      if (!m.lastSeen || r.created_at > m.lastSeen) m.lastSeen = r.created_at;
      if (r.degraded) m.degraded++;
      if (r.validation_status && r.validation_status !== 'ok' && r.validation_status !== 'valid') m.invalid++;
      map.set(r.event_name, m);
    }
    const expected = EXPECTED_EVENTS.map((name) => {
      const m = map.get(name) ?? { count: 0, lastSeen: null, degraded: 0, invalid: 0 };
      const stale = m.lastSeen ? Date.now() - new Date(m.lastSeen).getTime() > 24 * 3600e3 : true;
      return { name, count: m.count, lastSeen: m.lastSeen, degraded: m.degraded, invalid: m.invalid, missing: m.count === 0, stale };
    });
    const other = [...map.entries()]
      .filter(([k]) => !EXPECTED_EVENTS.includes(k))
      .map(([name, m]) => ({ name, count: m.count, lastSeen: m.lastSeen, degraded: m.degraded, invalid: m.invalid, missing: false, stale: false }))
      .sort((a, b) => b.count - a.count);
    const missing = expected.filter((e) => e.missing).map((e) => e.name);
    const degradedTotal = rows.filter((r) => r.degraded).length;
    return { expected, other, missing, degradedTotal, total: rows.length };
  }, [rows]);

  return (
    <>
      <Helmet>
        <title>Tracking Health | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Tracking Health
            </h1>
            <p className="text-sm text-muted-foreground">
              Last 24h pixel heartbeat from lp_funnel_events. Flags expected events with zero recent rows.
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Query failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {summary.missing.length > 0 && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Missing events ({summary.missing.length})</AlertTitle>
            <AlertDescription>
              No rows in last 24h for: <span className="font-mono">{summary.missing.join(', ')}</span>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total events (24h)" value={summary.total.toLocaleString()} />
          <Kpi label="Expected event types" value={`${EXPECTED_EVENTS.length - summary.missing.length}/${EXPECTED_EVENTS.length}`} />
          <Kpi label="Degraded rows" value={summary.degradedTotal.toLocaleString()} />
          <Kpi label="Other event types" value={summary.other.length.toLocaleString()} />
        </div>

        {/* Canonical Layer heartbeat — Genesis V2.6 parity panel. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Canonical Analytics heartbeat (24h)</CardTitle>
            <CardDescription>
              Counts come from canonical_events. If any stage is 0 while the raw event above is healthy,
              the canonical mapper is degraded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canonical ? (
              <p className="text-sm text-muted-foreground">Canonical layer unavailable.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {(Object.keys(canonical) as CanonicalStage[]).map((stage) => (
                  <Kpi
                    key={stage}
                    label={CANONICAL_STAGE_LABEL[stage]}
                    value={canonical[stage].toLocaleString()}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Expected events</CardTitle>
            <CardDescription>Core funnel + TikTok PDP variant events. Stale = no rows in 24h.</CardDescription>
          </CardHeader>
          <CardContent>
            <EventTable rows={summary.expected} highlightMissing />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Other events seen (24h)</CardTitle>
            <CardDescription>Anything not in the expected list.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.other.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other events.</p>
            ) : <EventTable rows={summary.other} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function EventTable({ rows, highlightMissing }: { rows: { name: string; count: number; lastSeen: string | null; degraded: number; invalid: number; missing: boolean; stale: boolean }[]; highlightMissing?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground border-b">
          <tr>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Event</th>
            <th className="py-2 pr-4 text-right">Count (24h)</th>
            <th className="py-2 pr-4 text-right">Degraded</th>
            <th className="py-2 pr-4 text-right">Invalid</th>
            <th className="py-2 pr-4 text-right">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={`border-b last:border-0 ${highlightMissing && r.missing ? 'bg-destructive/5' : ''}`}>
              <td className="py-2 pr-4">
                {r.missing ? <Badge variant="destructive">missing</Badge>
                  : r.stale ? <Badge variant="secondary">stale</Badge>
                  : <Badge variant="outline" className="text-emerald-600 border-emerald-600/30"><CheckCircle2 className="h-3 w-3 mr-1" />ok</Badge>}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">{r.name}</td>
              <td className="py-2 pr-4 text-right">{r.count.toLocaleString()}</td>
              <td className="py-2 pr-4 text-right">{r.degraded || '—'}</td>
              <td className="py-2 pr-4 text-right">{r.invalid || '—'}</td>
              <td className="py-2 pr-4 text-right">{r.lastSeen ? rel(r.lastSeen) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="pt-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent></Card>
  );
}