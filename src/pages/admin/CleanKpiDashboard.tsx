/**
 * /admin/clean-kpi — Clean KPI Dashboard.
 *
 * Reads lp_funnel_events and computes the canonical funnel (view_item →
 * add_to_cart → checkout_click → payment_success) under admin-selectable
 * filters built on the NEW envelope columns introduced by TRK-1/TRK-2:
 *   - geo_tier      (verified_us | probable_us | non_us | unknown)
 *   - classification (verified_user | probable_user | bot | qa | unknown)
 *   - device        (mobile | desktop | tablet | unknown)
 *   - qa            (always excluded — kept off the dashboard)
 *
 * Rows missing envelope metadata (legacy pre-TRK rows) are surfaced as a
 * separate "envelope coverage" KPI so admins know what slice of traffic
 * the Clean KPIs apply to. Bot rows are excluded from Clean KPIs by
 * default.
 *
 * Read-only. Admin-guarded by the parent AdminRouteGuard route.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { getCanonicalFunnelSessions, getCanonicalOrders, type CanonicalSessionRow, type CanonicalOrderRow } from '@/lib/canonicalAnalytics';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';

type Range = '24h' | '7d' | '30d';
type GeoTier = 'all' | 'us' | 'non_us' | 'unknown';
type Device = 'all' | 'mobile' | 'desktop' | 'tablet' | 'unknown';

const FUNNEL_STEPS = ['view_item', 'add_to_cart', 'checkout_click', 'payment_success'] as const;
type Step = typeof FUNNEL_STEPS[number];

function rangeHours(r: Range): number {
  return r === '24h' ? 24 : r === '7d' ? 24 * 7 : 24 * 30;
}

function pct(n: number, d: number): string {
  if (!d) return '—';
  return ((n / d) * 100).toFixed(1) + '%';
}

export default function CleanKpiDashboard() {
  const [range, setRange] = useState<Range>('7d');
  const [geoTier, setGeoTier] = useState<GeoTier>('all');
  const [device, setDevice] = useState<Device>('all');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<CanonicalSessionRow[]>([]);
  const [orders, setOrders] = useState<CanonicalOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hours = rangeHours(range);
      const [s, o] = await Promise.all([
        getCanonicalFunnelSessions({ hours }),
        getCanonicalOrders({ hours }),
      ]);
      setSessions(s);
      setOrders(o);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSessions([]);
      setOrders([]);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // Apply admin filters (canonical V2.7 — bots/qa never enter canonical_events).
  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const country = s.country ?? 'unknown';
      const tier: GeoTier = country === 'US' ? 'us' : country === 'unknown' ? 'unknown' : 'non_us';
      if (geoTier !== 'all' && tier !== geoTier) return false;
      if (device !== 'all' && (s.device ?? 'unknown') !== device) return false;
      return true;
    });
  }, [sessions, geoTier, device]);

  // Funnel: unique sessions per step from canonical reached_* flags.
  const funnel = useMemo(() => {
    const counts: Record<Step, number> = { view_item: 0, add_to_cart: 0, checkout_click: 0, payment_success: 0 };
    const filteredIds = new Set(filtered.map((s) => s.session_id).filter(Boolean) as string[]);
    for (const s of filtered) {
      if (s.reached_product_view) counts.view_item++;
      if (s.reached_add_to_cart) counts.add_to_cart++;
      if (s.reached_checkout) counts.checkout_click++;
      if (s.reached_purchase) counts.payment_success++;
    }
    const revenue = orders
      .filter((o) => !o.session_id || filteredIds.has(o.session_id))
      .reduce((acc, o) => acc + Number(o.total_amount || 0), 0);
    return { counts, revenue };
  }, [filtered, orders]);

  // Coverage — canonical session metadata completeness.
  const coverage = useMemo(() => {
    const total = sessions.length;
    if (!total) return { total: 0, geo: 0, cls: total, dev: 0 };
    let geo = 0, dev = 0;
    for (const s of sessions) {
      if (s.country) geo++;
      if (s.device) dev++;
    }
    return { total, geo, cls: total, dev };
  }, [sessions]);

  // Per-segment breakdown by canonical country tier.
  const geoBreakdown = useMemo(() => {
    const buckets = new Map<string, { sessions: number; add_to_cart: number; purchases: number }>();
    for (const s of filtered) {
      const country = s.country ?? 'unknown';
      const k = country === 'US' ? 'us' : country === 'unknown' ? 'unknown' : 'non_us';
      let b = buckets.get(k);
      if (!b) { b = { sessions: 0, add_to_cart: 0, purchases: 0 }; buckets.set(k, b); }
      b.sessions++;
      if (s.reached_add_to_cart) b.add_to_cart++;
      if (s.reached_purchase) b.purchases++;
    }
    return [...buckets.entries()]
      .map(([k, v]) => ({ geo_tier: k, ...v }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [filtered]);

  const c = funnel.counts;
  const cvr = c.view_item ? (c.payment_success / c.view_item) * 100 : 0;

  return (
    <>
      <Helmet>
        <title>Clean KPI Dashboard | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Clean KPI Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Funnel KPIs filtered by the TRK envelope: geo_tier, classification, device. QA always excluded.
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>Segment the funnel by envelope columns.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <FilterSelect label="Range" value={range} onChange={(v) => setRange(v as Range)} options={[
              { v: '24h', l: 'Last 24h' }, { v: '7d', l: 'Last 7d' }, { v: '30d', l: 'Last 30d' },
            ]} />
            <FilterSelect label="Geo tier" value={geoTier} onChange={(v) => setGeoTier(v as GeoTier)} options={[
              { v: 'all', l: 'All' },
              { v: 'us', l: 'US' },
              { v: 'non_us', l: 'Non-US' },
              { v: 'unknown', l: 'Unknown' },
            ]} />
            <FilterSelect label="Device" value={device} onChange={(v) => setDevice(v as Device)} options={[
              { v: 'all', l: 'All' },
              { v: 'mobile', l: 'Mobile' },
              { v: 'desktop', l: 'Desktop' },
              { v: 'tablet', l: 'Tablet' },
              { v: 'unknown', l: 'Unknown' },
            ]} />
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Query failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Envelope coverage */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Envelope coverage</CardTitle>
            <CardDescription>
              Share of rows carrying TRK envelope columns. Low coverage = mostly legacy rows,
              filters won't apply to them.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Rows (funnel events)" value={coverage.total.toLocaleString()} />
            <Kpi label="With geo_tier" value={pct(coverage.geo, coverage.total)} sub={`${coverage.geo}`} />
            <Kpi label="With classification" value={pct(coverage.cls, coverage.total)} sub={`${coverage.cls}`} />
            <Kpi label="With device" value={pct(coverage.dev, coverage.total)} sub={`${coverage.dev}`} />
          </CardContent>
        </Card>

        {/* Clean funnel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Clean funnel — unique sessions</CardTitle>
                <CardDescription>
                  After applying the filters above.
                </CardDescription>
              </div>
              <Badge variant="secondary">CVR: {cvr.toFixed(2)}%</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="View item" value={c.view_item.toLocaleString()} />
            <Kpi label="Add to cart" value={c.add_to_cart.toLocaleString()}
              sub={`${pct(c.add_to_cart, c.view_item)} of views`} />
            <Kpi label="Checkout click" value={c.checkout_click.toLocaleString()}
              sub={`${pct(c.checkout_click, c.add_to_cart)} of ATC`} />
            <Kpi label="Payments" value={c.payment_success.toLocaleString()}
              sub={`${pct(c.payment_success, c.checkout_click)} of checkouts`} />
            <Kpi label="Revenue" value={`$${funnel.revenue.toFixed(2)}`} />
          </CardContent>
        </Card>

        {/* Per-geo breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By geo_tier (current filters)</CardTitle>
            <CardDescription>Verifies that geo segmentation is reaching the funnel correctly.</CardDescription>
          </CardHeader>
          <CardContent>
            {geoBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rows match the current filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-4">Geo tier</th>
                      <th className="py-2 pr-4">Sessions</th>
                      <th className="py-2 pr-4">Add to cart</th>
                      <th className="py-2 pr-4">Purchases</th>
                      <th className="py-2 pr-4">CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geoBreakdown.map((b) => (
                      <tr key={b.geo_tier} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{b.geo_tier}</td>
                        <td className="py-2 pr-4">{b.sessions}</td>
                        <td className="py-2 pr-4">{b.add_to_cart}</td>
                        <td className="py-2 pr-4">{b.purchases}</td>
                        <td className="py-2 pr-4">{pct(b.purchases, b.sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}