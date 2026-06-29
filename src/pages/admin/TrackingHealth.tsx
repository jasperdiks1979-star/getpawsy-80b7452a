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

/**
 * Expectation model — every "expected" event is declared with the *condition*
 * under which it is required. If the condition is not satisfied in the window
 * the event MUST NOT be flagged as missing (avoids false-positive red alerts
 * for commercially-absent or variant-gated tracking).
 *
 * Classifications:
 *  - always         : core funnel, must fire daily on any traffic
 *  - on_purchase    : only required when ≥1 paid order exists in the window
 *  - on_tiktok      : only required when TikTok sessions exist in the window
 *  - on_tiktok_variant: only required when the TikTok PDP variant was rendered
 *                     (currently litter-box products + TikTok traffic)
 *  - renamed        : legacy name, real signal lives under canonical_name
 *  - obsolete       : no longer emitted by the app, do not alert
 */
type Expectation =
  | { kind: 'always' }
  | { kind: 'on_purchase' }
  | { kind: 'on_tiktok' }
  | { kind: 'on_tiktok_variant' }
  | { kind: 'renamed'; canonical: string; matcher: (name: string) => boolean }
  | { kind: 'obsolete'; reason: string };

interface ExpectedDef {
  name: string;
  expectation: Expectation;
  reason: string;
}

const EXPECTED_DEFS: ExpectedDef[] = [
  { name: 'view_item',                  expectation: { kind: 'always' }, reason: 'Core PDP impression.' },
  { name: 'pdp_view',                   expectation: { kind: 'always' }, reason: 'Canonical PDP visibility.' },
  { name: 'add_to_cart',                expectation: { kind: 'always' }, reason: 'Core add-to-cart action.' },
  { name: 'begin_checkout',             expectation: { kind: 'always' }, reason: 'Stripe checkout init.' },
  { name: 'payment_success',            expectation: { kind: 'on_purchase' }, reason: 'Fires only on PaymentSuccess page after Stripe redirects back.' },
  {
    name: 'scroll_depth',
    expectation: {
      kind: 'renamed',
      canonical: 'scroll_depth_25|50|75|100',
      matcher: (n) => n.startsWith('scroll_depth_'),
    },
    reason: 'Bare scroll_depth was replaced by scroll_depth_{25,50,75,100} buckets in usePdpFunnelTracking.',
  },
  { name: 'tiktok_pdp_buy_box_visible', expectation: { kind: 'on_tiktok_variant' }, reason: 'Only emitted inside TikTokPdpVariant component.' },
  { name: 'tiktok_first_interaction',   expectation: { kind: 'on_tiktok_variant' }, reason: 'Only emitted inside TikTokPdpVariant component.' },
  { name: 'tiktok_atc_click',           expectation: { kind: 'on_tiktok_variant' }, reason: 'Only emitted inside TikTokPdpVariant component.' },
  { name: 'tiktok_buy_now_click',       expectation: { kind: 'on_tiktok_variant' }, reason: 'Only emitted inside TikTokPdpVariant component.' },
];

const EXPECTED_NAMES = EXPECTED_DEFS.map((d) => d.name);

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
  const [context, setContext] = useState<{ tiktokSessions: number; paidOrders: number; tiktokVariantImpressions: number }>(
    { tiktokSessions: 0, paidOrders: 0, tiktokVariantImpressions: 0 },
  );

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const [rawRes, canon, tiktokRes, ordersRes, variantRes] = await Promise.all([
      supabase
        .from('lp_funnel_events')
        .select('event_name, created_at, degraded, validation_status')
        .gte('created_at', since)
        .eq('qa', false)
        .limit(50000)
        .order('created_at', { ascending: false }),
      getCanonicalEventCounts(24).catch(() => null),
      // Conditional-context probes — cheap counts only.
      supabase
        .from('lp_funnel_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since)
        .eq('qa', false)
        .or('utm_source.ilike.%tiktok%,utm_medium.ilike.%tiktok%'),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since)
        .in('status', ['paid', 'complete', 'completed', 'succeeded']),
      supabase
        .from('lp_funnel_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since)
        .eq('qa', false)
        .like('event_name', 'tiktok_%'),
    ]);
    if (rawRes.error) { setError(rawRes.error.message); setRows([]); }
    else setRows((rawRes.data ?? []) as Row[]);
    setCanonical(canon);
    setContext({
      tiktokSessions: tiktokRes.count ?? 0,
      paidOrders: ordersRes.count ?? 0,
      tiktokVariantImpressions: variantRes.count ?? 0,
    });
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
    const expected = EXPECTED_DEFS.map((def) => {
      const m = map.get(def.name) ?? { count: 0, lastSeen: null, degraded: 0, invalid: 0 };
      // For "renamed" expectations the real count comes from the canonical matcher.
      let effectiveCount = m.count;
      let effectiveLastSeen = m.lastSeen;
      if (def.expectation.kind === 'renamed') {
        const matcher = def.expectation.matcher;
        for (const [k, v] of map.entries()) {
          if (matcher(k)) {
            effectiveCount += v.count;
            if (v.lastSeen && (!effectiveLastSeen || v.lastSeen > effectiveLastSeen)) {
              effectiveLastSeen = v.lastSeen;
            }
          }
        }
      }
      const stale = effectiveLastSeen ? Date.now() - new Date(effectiveLastSeen).getTime() > 24 * 3600e3 : true;

      // Decide whether this event is REQUIRED in this window.
      let required = false;
      let conditionMet = true;
      let conditionLabel = 'always';
      switch (def.expectation.kind) {
        case 'always':
          required = true;
          conditionLabel = 'Every 24h window';
          break;
        case 'on_purchase':
          conditionMet = context.paidOrders > 0;
          required = conditionMet;
          conditionLabel = `paidOrders>0 (saw ${context.paidOrders})`;
          break;
        case 'on_tiktok':
          conditionMet = context.tiktokSessions > 0;
          required = conditionMet;
          conditionLabel = `tiktokSessions>0 (saw ${context.tiktokSessions})`;
          break;
        case 'on_tiktok_variant':
          // Variant exposure ≈ any tiktok_* event already firing in the window.
          conditionMet = context.tiktokVariantImpressions > 0;
          required = conditionMet;
          conditionLabel = `tiktokVariant exposed (saw ${context.tiktokVariantImpressions})`;
          break;
        case 'renamed':
          required = false;
          conditionLabel = `renamed → ${def.expectation.canonical}`;
          break;
        case 'obsolete':
          required = false;
          conditionLabel = `obsolete: ${def.expectation.reason}`;
          break;
      }

      const broken = required && effectiveCount === 0;
      let status: 'ok' | 'broken' | 'na' | 'renamed' | 'obsolete' | 'stale';
      if (def.expectation.kind === 'renamed') {
        status = effectiveCount > 0 ? 'renamed' : 'broken';
      } else if (def.expectation.kind === 'obsolete') {
        status = 'obsolete';
      } else if (broken) {
        status = 'broken';
      } else if (!required) {
        status = 'na';
      } else if (stale) {
        status = 'stale';
      } else {
        status = 'ok';
      }

      return {
        name: def.name,
        count: effectiveCount,
        lastSeen: effectiveLastSeen,
        degraded: m.degraded,
        invalid: m.invalid,
        status,
        expectationKind: def.expectation.kind,
        conditionLabel,
        reason: def.reason,
        canonical: def.expectation.kind === 'renamed' ? def.expectation.canonical : null,
      };
    });
    const other = [...map.entries()]
      .filter(([k]) => !EXPECTED_NAMES.includes(k) && !k.startsWith('scroll_depth_'))
      .map(([name, m]) => ({ name, count: m.count, lastSeen: m.lastSeen, degraded: m.degraded, invalid: m.invalid, missing: false, stale: false }))
      .sort((a, b) => b.count - a.count);
    const broken = expected.filter((e) => e.status === 'broken').map((e) => e.name);
    const notApplicable = expected.filter((e) => e.status === 'na').map((e) => e.name);
    const renamed = expected.filter((e) => e.status === 'renamed').map((e) => e.name);
    const obsolete = expected.filter((e) => e.status === 'obsolete').map((e) => e.name);
    const degradedTotal = rows.filter((r) => r.degraded).length;
    return { expected, other, broken, notApplicable, renamed, obsolete, degradedTotal, total: rows.length };
  }, [rows, context]);

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

        {summary.broken.length > 0 && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Broken required events ({summary.broken.length})</AlertTitle>
            <AlertDescription>
              No rows in last 24h for: <span className="font-mono">{summary.broken.join(', ')}</span>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Kpi label="Total events (24h)" value={summary.total.toLocaleString()} />
          <Kpi label="Broken required" value={summary.broken.length.toLocaleString()} />
          <Kpi label="Conditional N/A" value={summary.notApplicable.length.toLocaleString()} />
          <Kpi label="Renamed/legacy" value={summary.renamed.length.toLocaleString()} />
          <Kpi label="Degraded rows" value={summary.degradedTotal.toLocaleString()} />
          <Kpi label="Other event types" value={summary.other.length.toLocaleString()} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Window context</CardTitle>
            <CardDescription>
              Conditional events are evaluated against these signals — see “Condition” column below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Kpi label="TikTok sessions (24h)" value={context.tiktokSessions.toLocaleString()} />
              <Kpi label="TikTok variant impressions" value={context.tiktokVariantImpressions.toLocaleString()} />
              <Kpi label="Paid orders (24h)" value={context.paidOrders.toLocaleString()} />
            </div>
          </CardContent>
        </Card>

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
            <EventTable rows={summary.expected} />
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
            ) : <OtherEventTable rows={summary.other} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

type ExpectedRow = {
  name: string;
  count: number;
  lastSeen: string | null;
  degraded: number;
  invalid: number;
  status: 'ok' | 'broken' | 'na' | 'renamed' | 'obsolete' | 'stale';
  expectationKind: string;
  conditionLabel: string;
  reason: string;
  canonical: string | null;
};

function EventTable({ rows }: { rows: ExpectedRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground border-b">
          <tr>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Event</th>
            <th className="py-2 pr-4 text-right">Count (24h)</th>
            <th className="py-2 pr-4">Expectation</th>
            <th className="py-2 pr-4">Condition</th>
            <th className="py-2 pr-4">Reason / canonical</th>
            <th className="py-2 pr-4 text-right">Degraded</th>
            <th className="py-2 pr-4 text-right">Invalid</th>
            <th className="py-2 pr-4 text-right">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={`border-b last:border-0 ${r.status === 'broken' ? 'bg-destructive/5' : ''}`}>
              <td className="py-2 pr-4">
                <StatusBadge status={r.status} />
              </td>
              <td className="py-2 pr-4 font-mono text-xs">{r.name}</td>
              <td className="py-2 pr-4 text-right">{r.count.toLocaleString()}</td>
              <td className="py-2 pr-4 text-xs">{r.expectationKind}</td>
              <td className="py-2 pr-4 text-xs text-muted-foreground">{r.conditionLabel}</td>
              <td className="py-2 pr-4 text-xs text-muted-foreground">
                {r.canonical ? <span>→ <span className="font-mono">{r.canonical}</span></span> : r.reason}
              </td>
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

function OtherEventTable({ rows }: { rows: { name: string; count: number; lastSeen: string | null; degraded: number; invalid: number }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground border-b">
          <tr>
            <th className="py-2 pr-4">Event</th>
            <th className="py-2 pr-4 text-right">Count (24h)</th>
            <th className="py-2 pr-4 text-right">Degraded</th>
            <th className="py-2 pr-4 text-right">Invalid</th>
            <th className="py-2 pr-4 text-right">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b last:border-0">
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

function StatusBadge({ status }: { status: ExpectedRow['status'] }) {
  switch (status) {
    case 'broken':
      return <Badge variant="destructive">broken</Badge>;
    case 'stale':
      return <Badge variant="secondary">stale</Badge>;
    case 'na':
      return <Badge variant="outline" className="text-muted-foreground">N/A</Badge>;
    case 'renamed':
      return <Badge variant="outline" className="text-amber-600 border-amber-600/30">renamed</Badge>;
    case 'obsolete':
      return <Badge variant="outline" className="text-muted-foreground">obsolete</Badge>;
    case 'ok':
    default:
      return <Badge variant="outline" className="text-emerald-600 border-emerald-600/30"><CheckCircle2 className="h-3 w-3 mr-1" />ok</Badge>;
  }
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="pt-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent></Card>
  );
}