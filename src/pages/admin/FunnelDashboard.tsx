/**
 * /admin/funnel — Revenue Conversion Dashboard (Canonical).
 *
 * Genesis V2.6 Wave 2: migrated to the Canonical Analytics Layer.
 * Sources:
 *   - canonical_funnel  → unique-session funnel (page_view → product_view → ATC → cart → checkout → purchase)
 *   - canonical_orders  → verified Stripe-paid revenue
 * No legacy reads of lp_funnel_events / checkout_funnel_events / orders.
 * Filters preserved: range, source, device, exclude bots (canonical never ingests qa=true).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  getCanonicalFunnelSessions, getCanonicalOrders,
  classifyCanonicalSource, summarizeCanonicalSessions,
  type CanonicalSessionRow, type CanonicalOrderRow, type CanonicalSource,
} from '@/lib/canonicalAnalytics';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, TrendingUp, AlertTriangle } from 'lucide-react';

type Range = '24h' | '7d' | '30d' | '90d';
type SourceFilter = 'all' | CanonicalSource;
type DeviceFilter = 'all' | 'mobile' | 'desktop' | 'tablet' | 'unknown';

function rangeHours(r: Range): number {
  return r === '24h' ? 24 : r === '7d' ? 24 * 7 : r === '30d' ? 24 * 30 : 24 * 90;
}
function pct(n: number, d: number): string {
  if (!d) return '—';
  return ((n / d) * 100).toFixed(2) + '%';
}
function money(n: number, ccy = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy }).format(n);
}

export default function FunnelDashboard() {
  const [range, setRange] = useState<Range>('30d');
  const [source, setSource] = useState<SourceFilter>('all');
  const [device, setDevice] = useState<DeviceFilter>('all');
  // Canonical layer never ingests qa=true / bot rows; keep toggle for UI parity but it's informational.
  const [excludeBots, setExcludeBots] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CanonicalSessionRow[]>([]);
  const [orders, setOrders] = useState<CanonicalOrderRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hours = rangeHours(range);
      const [sess, ord] = await Promise.all([
        getCanonicalFunnelSessions({ hours, source, device }),
        getCanonicalOrders({ hours }),
      ]);
      setSessions(sess);
      setOrders(ord);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Canonical query failed');
      setSessions([]); setOrders([]);
    }
    setLoading(false);
  }, [range, source, device]);

  useEffect(() => { load(); }, [load]);

  /** Canonical funnel summary (unique sessions per stage). */
  const funnel = useMemo(() => {
    const s = summarizeCanonicalSessions(sessions);
    return {
      view: s.product_views,
      atc: s.add_to_carts,
      checkout: s.checkouts,
      purchase: s.purchases,
    };
  }, [sessions]);

  /** Canonical revenue (Stripe-verified paid orders only). */
  const revenue = useMemo(() => {
    let total = 0, attributed = 0;
    const bySource = new Map<CanonicalSource, { revenue: number; orders: number }>();
    const byCampaign = new Map<string, { revenue: number; orders: number }>();
    for (const o of orders) {
      const amt = Number(o.total_amount ?? 0);
      total += amt;
      const src = classifyCanonicalSource(o.utm_source);
      // Respect source filter for accurate per-cut numbers.
      if (source !== 'all' && src !== source) continue;
      if (o.utm_source) attributed += amt;
      const camp = o.utm_campaign ?? (o.utm_source ? '(none)' : '(unattributed)');
      const sB = bySource.get(src) ?? { revenue: 0, orders: 0 };
      sB.revenue += amt; sB.orders++;
      bySource.set(src, sB);
      const cB = byCampaign.get(camp) ?? { revenue: 0, orders: 0 };
      cB.revenue += amt; cB.orders++;
      byCampaign.set(camp, cB);
    }
    return {
      total, attributed,
      orderCount: orders.length,
      bySource: [...bySource.entries()].sort((a, b) => b[1].revenue - a[1].revenue),
      byCampaign: [...byCampaign.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10),
    };
  }, [orders, source]);

  /** Per-source breakdown — sessions, atc, purchases from canonical_funnel rows. */
  const bySource = useMemo(() => {
    type B = { sessions: number; atc: number; purchase: number };
    const map = new Map<CanonicalSource, B>();
    for (const s of sessions) {
      const k = classifyCanonicalSource(s.utm_source);
      const b = map.get(k) ?? { sessions: 0, atc: 0, purchase: 0 };
      b.sessions++;
      if (s.reached_add_to_cart) b.atc++;
      if (s.reached_purchase) b.purchase++;
      map.set(k, b);
    }
    return [...map.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions]);

  const totalSessions = sessions.length;
  const rpv = totalSessions ? revenue.total / totalSessions : 0;

  return (
    <>
      <Helmet>
        <title>Funnel Dashboard | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Funnel & Revenue Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Canonical Analytics Layer (canonical_funnel + canonical_orders). Bots and QA traffic are
              excluded at ingest. Revenue is Stripe-verified paid orders only.
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
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Sel label="Range" value={range} onChange={(v) => setRange(v as Range)} options={[
              { v: '24h', l: 'Last 24h' }, { v: '7d', l: 'Last 7d' }, { v: '30d', l: 'Last 30d' }, { v: '90d', l: 'Last 90d' },
            ]} />
            <Sel label="Source" value={source} onChange={(v) => setSource(v as SourceFilter)} options={[
              { v: 'all', l: 'All sources' },
              { v: 'tiktok', l: 'TikTok' },
              { v: 'pinterest', l: 'Pinterest' },
              { v: 'google', l: 'Google' },
              { v: 'direct', l: 'Direct' },
              { v: 'referral', l: 'Referral' },
              { v: 'other', l: 'Other' },
            ]} />
            <Sel label="Device" value={device} onChange={(v) => setDevice(v as DeviceFilter)} options={[
              { v: 'all', l: 'All devices' },
              { v: 'mobile', l: 'Mobile' },
              { v: 'desktop', l: 'Desktop' },
              { v: 'tablet', l: 'Tablet' },
              { v: 'unknown', l: 'Unknown' },
            ]} />
            <Sel label="Bots" value={excludeBots ? 'exclude' : 'include'} onChange={(v) => setExcludeBots(v === 'exclude')} options={[
              { v: 'exclude', l: 'Exclude bots' },
              { v: 'include', l: 'Include bots' },
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

        {/* Funnel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Funnel — unique sessions</CardTitle>
                <CardDescription>view → ATC → checkout → purchase. Counts derived from canonical_funnel.reached_* flags.</CardDescription>
              </div>
              <Badge variant="secondary">View→Purchase: {pct(funnel.purchase, funnel.view)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Visitors" value={totalSessions.toLocaleString()} />
            <Kpi label="Product views" value={funnel.view.toLocaleString()} />
            <Kpi label="Add to cart" value={funnel.atc.toLocaleString()}
              sub={`${pct(funnel.atc, funnel.view)} of views`} />
            <Kpi label="Checkout started" value={funnel.checkout.toLocaleString()}
              sub={`${pct(funnel.checkout, funnel.atc)} of ATC`} />
            <Kpi label="Purchases" value={funnel.purchase.toLocaleString()}
              sub={`${pct(funnel.purchase, funnel.checkout)} of checkouts`} />
          </CardContent>
        </Card>

        {/* Revenue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revenue</CardTitle>
            <CardDescription>Ground truth from canonical_orders (Stripe-paid only).</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Total revenue" value={money(revenue.total)} sub={`${revenue.orderCount} paid orders`} />
            <Kpi label="Attributed" value={money(revenue.attributed)}
              sub={revenue.total ? `${pct(revenue.attributed, revenue.total)} matched to source` : '—'} />
            <Kpi label="Revenue per visitor" value={money(rpv)} />
            <Kpi label="AOV" value={revenue.orderCount ? money(revenue.total / revenue.orderCount) : '—'} />
          </CardContent>
        </Card>

        {/* By source */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By traffic source</CardTitle>
            <CardDescription>Funnel and revenue grouped by classified utm_source.</CardDescription>
          </CardHeader>
          <CardContent>
            {bySource.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions match the current filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-4">Source</th>
                      <th className="py-2 pr-4 text-right">Sessions</th>
                      <th className="py-2 pr-4 text-right">ATC</th>
                      <th className="py-2 pr-4 text-right">Purchases</th>
                      <th className="py-2 pr-4 text-right">CVR</th>
                      <th className="py-2 pr-4 text-right">Revenue</th>
                      <th className="py-2 pr-4 text-right">RPV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySource.map((b) => {
                      const rev = revenue.bySource.find(([k]) => k === b.source)?.[1];
                      const rv = rev?.revenue ?? 0;
                      return (
                        <tr key={b.source} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium capitalize">{b.source}</td>
                          <td className="py-2 pr-4 text-right">{b.sessions}</td>
                          <td className="py-2 pr-4 text-right">{b.atc}</td>
                          <td className="py-2 pr-4 text-right">{b.purchase}</td>
                          <td className="py-2 pr-4 text-right">{pct(b.purchase, b.sessions)}</td>
                          <td className="py-2 pr-4 text-right">{rv ? money(rv) : '—'}</td>
                          <td className="py-2 pr-4 text-right">{b.sessions ? money(rv / b.sessions) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* By campaign */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revenue by campaign (top 10)</CardTitle>
            <CardDescription>Joins each paid order to its earliest session's utm_campaign.</CardDescription>
          </CardHeader>
          <CardContent>
            {revenue.byCampaign.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid orders in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-4">Campaign</th>
                      <th className="py-2 pr-4 text-right">Orders</th>
                      <th className="py-2 pr-4 text-right">Revenue</th>
                      <th className="py-2 pr-4 text-right">AOV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.byCampaign.map(([k, v]) => (
                      <tr key={k} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs">{k}</td>
                        <td className="py-2 pr-4 text-right">{v.orders}</td>
                        <td className="py-2 pr-4 text-right">{money(v.revenue)}</td>
                        <td className="py-2 pr-4 text-right">{money(v.revenue / v.orders)}</td>
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

function Sel({
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