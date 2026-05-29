/**
 * /admin/funnel — Revenue Conversion Dashboard.
 *
 * End-to-end funnel that unifies three tables:
 *   - lp_funnel_events       → upper funnel (view_item / pdp_view / add_to_cart)
 *   - checkout_funnel_events → checkout funnel (begin_checkout / payment_success)
 *   - orders                 → ground-truth revenue (paid orders, joined via stripe_session_id)
 *
 * Filters: date range, source, device, exclude bots. QA always excluded.
 * Outputs: full funnel, conversion rates, revenue/visitor, revenue by source,
 * revenue by campaign. No mock data — empty buckets render "—".
 *
 * Admin-guarded by AdminRouteGuard parent route.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
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
type SourceFilter = 'all' | 'tiktok' | 'pinterest' | 'google' | 'direct' | 'referral' | 'other';
type DeviceFilter = 'all' | 'mobile' | 'desktop' | 'tablet' | 'unknown';

interface LpRow {
  event_name: string;
  session_id: string;
  utm_source: string | null;
  utm_campaign: string | null;
  device: string | null;
  is_bot: boolean | null;
}

interface CheckoutRow {
  step: string;
  session_id: string;
  stripe_session_id: string | null;
  value: number | null;
  is_bot: boolean | null;
}

interface OrderRow {
  id: string;
  status: string;
  total_amount: number | null;
  currency: string | null;
  stripe_session_id: string | null;
  created_at: string;
}

function rangeStart(r: Range): string {
  const days = r === '24h' ? 1 : r === '7d' ? 7 : r === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 3600e3).toISOString();
}
function pct(n: number, d: number): string {
  if (!d) return '—';
  return ((n / d) * 100).toFixed(2) + '%';
}
function money(n: number, ccy = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy }).format(n);
}
function normSource(s: string | null | undefined): SourceFilter {
  if (!s) return 'direct';
  const v = s.toLowerCase();
  if (v.includes('tiktok')) return 'tiktok';
  if (v.includes('pinterest')) return 'pinterest';
  if (v.includes('google')) return 'google';
  if (v === 'direct') return 'direct';
  if (v === 'referral') return 'referral';
  return 'other';
}

export default function FunnelDashboard() {
  const [range, setRange] = useState<Range>('30d');
  const [source, setSource] = useState<SourceFilter>('all');
  const [device, setDevice] = useState<DeviceFilter>('all');
  const [excludeBots, setExcludeBots] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lp, setLp] = useState<LpRow[]>([]);
  const [ck, setCk] = useState<CheckoutRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = rangeStart(range);
    const [lpRes, ckRes, ordRes] = await Promise.all([
      supabase.from('lp_funnel_events')
        .select('event_name, session_id, utm_source, utm_campaign, device, is_bot')
        .gte('created_at', since)
        .eq('qa', false)
        .in('event_name', ['view_item', 'pdp_view', 'add_to_cart', 'begin_checkout', 'payment_success'])
        .limit(50000),
      supabase.from('checkout_funnel_events')
        .select('step, session_id, stripe_session_id, value, is_bot')
        .gte('created_at', since)
        .eq('qa', false)
        .limit(50000),
      supabase.from('orders')
        .select('id, status, total_amount, currency, stripe_session_id, created_at')
        .gte('created_at', since)
        .limit(10000),
    ]);
    if (lpRes.error || ckRes.error || ordRes.error) {
      setError(lpRes.error?.message || ckRes.error?.message || ordRes.error?.message || 'Query failed');
      setLp([]); setCk([]); setOrders([]);
    } else {
      setLp((lpRes.data ?? []) as LpRow[]);
      setCk((ckRes.data ?? []) as CheckoutRow[]);
      setOrders((ordRes.data ?? []) as OrderRow[]);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  /** Sessions that pass the current filters. */
  const filteredSessions = useMemo(() => {
    const allowed = new Set<string>();
    const seen = new Map<string, { src: SourceFilter; dev: string; bot: boolean }>();
    for (const r of lp) {
      if (!seen.has(r.session_id)) {
        seen.set(r.session_id, {
          src: normSource(r.utm_source),
          dev: r.device ?? 'unknown',
          bot: r.is_bot === true,
        });
      }
    }
    for (const [sid, meta] of seen.entries()) {
      if (excludeBots && meta.bot) continue;
      if (source !== 'all' && meta.src !== source) continue;
      if (device !== 'all' && meta.dev !== device) continue;
      allowed.add(sid);
    }
    return { allowed, meta: seen };
  }, [lp, source, device, excludeBots]);

  /** Unified funnel — unique sessions per step. */
  const funnel = useMemo(() => {
    const { allowed } = filteredSessions;
    const view = new Set<string>();
    const atc = new Set<string>();
    const checkout = new Set<string>();
    const purchase = new Set<string>();

    for (const r of lp) {
      if (!allowed.has(r.session_id)) continue;
      if (r.event_name === 'view_item' || r.event_name === 'pdp_view') view.add(r.session_id);
      if (r.event_name === 'add_to_cart') atc.add(r.session_id);
      if (r.event_name === 'begin_checkout') checkout.add(r.session_id);
      if (r.event_name === 'payment_success') purchase.add(r.session_id);
    }
    // Augment from checkout_funnel_events
    const allowSidsAll = new Set<string>(allowed);
    for (const r of ck) {
      if (excludeBots && r.is_bot === true) continue;
      // Sessions that only appear in checkout_funnel_events (no lp row) still count for the
      // bottom of the funnel under the "all sources" view; otherwise require a match.
      const isAllowed = allowSidsAll.has(r.session_id) || source === 'all';
      if (!isAllowed) continue;
      if (r.step === 'begin_checkout' || r.step === 'checkout_click') checkout.add(r.session_id);
      if (r.step === 'payment_success' || r.step === 'checkout_redirect_success') purchase.add(r.session_id);
    }
    return { view: view.size, atc: atc.size, checkout: checkout.size, purchase: purchase.size, allowSidsAll };
  }, [lp, ck, filteredSessions, excludeBots, source]);

  /** Revenue from paid orders, attributed via stripe_session_id → session_id → utm_source. */
  const revenue = useMemo(() => {
    // Build stripe_session_id → session_id map
    const stripeToSid = new Map<string, string>();
    for (const r of ck) {
      if (r.stripe_session_id) stripeToSid.set(r.stripe_session_id, r.session_id);
    }
    const sidMeta = filteredSessions.meta;

    let total = 0;
    let attributed = 0;
    const bySource = new Map<string, { revenue: number; orders: number }>();
    const byCampaign = new Map<string, { revenue: number; orders: number }>();
    let orderCount = 0;
    const paidOrders = orders.filter((o) => o.status === 'paid' && (o.total_amount ?? 0) > 0);

    // Track campaigns per session for attribution
    const sidToCampaign = new Map<string, string>();
    for (const r of lp) {
      if (r.utm_campaign && !sidToCampaign.has(r.session_id)) {
        sidToCampaign.set(r.session_id, r.utm_campaign);
      }
    }

    for (const o of paidOrders) {
      const amt = Number(o.total_amount ?? 0);
      total += amt;
      orderCount++;
      const sid = o.stripe_session_id ? stripeToSid.get(o.stripe_session_id) : undefined;
      const meta = sid ? sidMeta.get(sid) : undefined;
      const src = meta?.src ?? 'direct';
      const camp = sid ? (sidToCampaign.get(sid) ?? '(none)') : '(unattributed)';
      if (meta) attributed += amt;
      const sBucket = bySource.get(src) ?? { revenue: 0, orders: 0 };
      sBucket.revenue += amt; sBucket.orders++;
      bySource.set(src, sBucket);
      const cBucket = byCampaign.get(camp) ?? { revenue: 0, orders: 0 };
      cBucket.revenue += amt; cBucket.orders++;
      byCampaign.set(camp, cBucket);
    }
    return {
      total, attributed, orderCount,
      bySource: [...bySource.entries()].sort((a, b) => b[1].revenue - a[1].revenue),
      byCampaign: [...byCampaign.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10),
    };
  }, [orders, ck, lp, filteredSessions]);

  /** Per-source funnel breakdown. */
  const bySource = useMemo(() => {
    const buckets = new Map<SourceFilter, { sessions: Set<string>; atc: Set<string>; purchase: Set<string> }>();
    for (const [sid, meta] of filteredSessions.meta.entries()) {
      if (excludeBots && meta.bot) continue;
      let b = buckets.get(meta.src);
      if (!b) { b = { sessions: new Set(), atc: new Set(), purchase: new Set() }; buckets.set(meta.src, b); }
      b.sessions.add(sid);
    }
    for (const r of lp) {
      const meta = filteredSessions.meta.get(r.session_id);
      if (!meta || (excludeBots && meta.bot)) continue;
      const b = buckets.get(meta.src);
      if (!b) continue;
      if (r.event_name === 'add_to_cart') b.atc.add(r.session_id);
      if (r.event_name === 'payment_success') b.purchase.add(r.session_id);
    }
    // Augment purchases from checkout_funnel_events
    for (const r of ck) {
      if (excludeBots && r.is_bot === true) continue;
      if (r.step !== 'payment_success' && r.step !== 'checkout_redirect_success') continue;
      const meta = filteredSessions.meta.get(r.session_id);
      if (!meta) continue;
      const b = buckets.get(meta.src);
      if (b) b.purchase.add(r.session_id);
    }
    return [...buckets.entries()]
      .map(([k, v]) => ({
        source: k,
        sessions: v.sessions.size,
        atc: v.atc.size,
        purchase: v.purchase.size,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [filteredSessions, lp, ck, excludeBots]);

  const totalSessions = filteredSessions.allowed.size;
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
              Unifies lp_funnel_events, checkout_funnel_events, and orders. Revenue is attributed to
              traffic source via stripe_session_id → session_id → utm_source.
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
                <CardDescription>view → ATC → checkout → purchase. View counts include both legacy view_item and the new pdp_view path.</CardDescription>
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
            <CardDescription>Ground truth from `orders.status = paid`. Attribution joins through stripe_session_id.</CardDescription>
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