/**
 * /admin/analytics — Unified analytics dashboard (responsive: iPhone → desktop).
 *
 * Single source of truth: public.gp_unified_analytics(p_hours) RPC, which aggregates
 * canonical_sessions + canonical_events (commerce funnel, traffic, Pinterest UTMs)
 * and Stripe-verified paid orders server-side. Admin-only (role checked in the RPC).
 *
 * One route, one query. Mobile renders card layouts, desktop renders tables — never both.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, AlertTriangle, Download } from 'lucide-react';

type Range = '24h' | '7d' | '30d' | '90d';
const RANGE_HOURS: Record<Range, number> = { '24h': 24, '7d': 168, '30d': 720, '90d': 2160 };
const RANGE_LABEL: Record<Range, string> = { '24h': 'Today', '7d': '7 days', '30d': '30 days', '90d': '90 days' };

interface Kpis {
  sessions: number; product_views: number; add_to_cart: number;
  checkouts: number; orders: number; revenue: number; pinterest_sessions: number;
}
interface Payload {
  generated_at: string;
  window_hours: number;
  kpis: Kpis;
  timeseries: Array<{ day: string; sessions: number; product_views: number; add_to_cart: number; orders: number; revenue: number }>;
  sources: Array<{ channel: string; sessions: number; orders: number }>;
  campaigns: Array<{ campaign: string; source: string; sessions: number; orders: number }>;
  pinterest_pins: Array<{ pin: string; campaign: string; sessions: number; landing_pages: number }>;
  products: Array<{ product_id: string; name: string; slug: string | null; price: number | null; stock: number | null; is_active: boolean | null; views: number; add_to_cart: number }>;
  landing_pages: Array<{ page: string; sessions: number }>;
  countries: Array<{ country: string; sessions: number }>;
  recent_orders: Array<{ id: string; created_at: string; total_amount: number; currency: string; status: string }>;
}

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(2) + '%' : '—');

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-1 p-3 sm:p-4 sm:pb-2">
        <CardDescription className="text-[13px] sm:text-xs uppercase tracking-wide leading-tight">{label}</CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <div className="text-xl sm:text-2xl font-semibold tabular-nums break-words">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1 break-words">{sub}</div>}
      </CardContent>
    </Card>
  );
}

type Col<T> = { key: keyof T; label: string; render?: (r: T) => React.ReactNode; align?: 'right'; primary?: boolean };

/** Table on desktop, stacked cards on mobile. Only one variant is rendered. */
function ResponsiveTable<T extends Record<string, unknown>>({ rows, cols, mobile }: { rows: T[]; cols: Array<Col<T>>; mobile?: boolean }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground py-6">No data in this window.</p>;

  if (mobile) {
    const primary = cols.find((c) => c.primary) ?? cols[0];
    const rest = cols.filter((c) => c !== primary);
    return (
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className="rounded-lg border p-3">
            <div className="text-sm font-medium break-words [overflow-wrap:anywhere] mb-2">
              {primary.render ? primary.render(r) : String(r[primary.key] ?? '—')}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              {rest.map((c) => (
                <div key={String(c.key)} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{c.label}</dt>
                  <dd className="text-sm tabular-nums break-words [overflow-wrap:anywhere]">
                    {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            {cols.map((c) => (
              <th key={String(c.key)} className={`py-2 px-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {cols.map((c) => (
                <td key={String(c.key)} className={`py-2 px-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FunnelStep({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border p-3 flex items-baseline justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-right">
        <span className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

export default function UnifiedAnalyticsDashboard() {
  const [range, setRange] = useState<Range>('30d');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: res, error: err } = await supabase.rpc('gp_unified_analytics', { p_hours: RANGE_HOURS[range] });
    if (err) { setError(err.message); setData(null); }
    else setData(res as unknown as Payload);
    setLoading(false);
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const lines = ['day,sessions,product_views,add_to_cart,orders,revenue'];
    data.timeseries.forEach((t) => lines.push([t.day, t.sessions, t.product_views, t.add_to_cart, t.orders, t.revenue].join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `getpawsy-analytics-${range}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const k = data?.kpis;
  const maxSessions = Math.max(1, ...(data?.timeseries.map((t) => t.sessions) ?? [1]));
  const topProducts = useMemo(
    () => [...(data?.products ?? [])].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5),
    [data],
  );

  return (
    <div
      className="w-full max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6 space-y-5 md:space-y-6 overflow-x-hidden"
      style={{
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <Helmet><title>Unified Analytics | Admin</title><meta name="robots" content="noindex" /></Helmet>

      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold">GetPawsy Analytics</h1>
            <p className="text-sm text-muted-foreground">
              {RANGE_LABEL[range]} · commerce, traffic &amp; Pinterest in one view.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="icon"
              variant="outline"
              className="h-11 w-11"
              aria-label="Refresh analytics"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="outline" className="h-11 w-11" aria-label="Export CSV" onClick={exportCsv} disabled={!data}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Thumb-friendly, horizontally scrollable date filter */}
        <div className="-mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto">
          <div className="flex items-center gap-2 w-max">
            {(Object.keys(RANGE_HOURS) as Range[]).map((r) => (
              <Button
                key={r}
                size="sm"
                className="h-11 px-4 text-sm"
                variant={r === range ? 'default' : 'outline'}
                onClick={() => setRange(r)}
              >
                {RANGE_LABEL[r]}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Analytics query failed</AlertTitle>
          <AlertDescription className="break-words [overflow-wrap:anywhere]">{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {k && data && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Sessions" value={k.sessions.toLocaleString()} sub="bots &amp; internal excluded" />
            <Kpi label="Pinterest" value={k.pinterest_sessions.toLocaleString()} sub="sessions" />
            <Kpi label="Product views" value={k.product_views.toLocaleString()} />
            <Kpi label="Add to cart" value={k.add_to_cart.toLocaleString()} sub={`${pct(k.add_to_cart, k.product_views)} of views`} />
            <Kpi label="Checkouts" value={k.checkouts.toLocaleString()} sub={`${pct(k.checkouts, k.add_to_cart)} of ATC`} />
            <Kpi label="Paid orders" value={k.orders.toLocaleString()} sub={`CVR ${pct(k.orders, k.sessions)}`} />
            <Kpi label="Revenue" value={money(Number(k.revenue))} sub="Stripe-verified" />
            <Kpi label="Conversion rate" value={pct(k.orders, k.sessions)} sub="orders / sessions" />
          </div>

          {/* Commerce funnel — vertical stack on mobile, row on desktop */}
          <Card>
            <CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2">
              <CardTitle className="text-base">Commerce funnel</CardTitle>
              <CardDescription>Counts and step conversion for this window.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="grid gap-2 sm:grid-cols-5">
                <FunnelStep label="Sessions" value={k.sessions} sub="100%" />
                <FunnelStep label="Product views" value={k.product_views} sub={pct(k.product_views, k.sessions)} />
                <FunnelStep label="Add to cart" value={k.add_to_cart} sub={pct(k.add_to_cart, k.product_views)} />
                <FunnelStep label="Checkout" value={k.checkouts} sub={pct(k.checkouts, k.add_to_cart)} />
                <FunnelStep label="Orders" value={k.orders} sub={pct(k.orders, k.checkouts)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2">
              <CardTitle className="text-base">Daily sessions</CardTitle>
              <CardDescription>{data.timeseries.length} days · peak {maxSessions.toLocaleString()} sessions/day</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-end gap-[2px] h-24 sm:h-32 w-full overflow-hidden">
                {data.timeseries.map((t) => (
                  <div
                    key={t.day}
                    title={`${t.day}: ${t.sessions} sessions, ${t.orders} orders`}
                    className="flex-1 min-w-0 bg-primary/70 rounded-t min-h-[2px]"
                    style={{ height: `${(t.sessions / maxSessions) * 100}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>{data.timeseries[0]?.day ?? ''}</span>
                <span>{data.timeseries[data.timeseries.length - 1]?.day ?? ''}</span>
              </div>
            </CardContent>
          </Card>

          {/* Top products — scannable on a phone without opening tables */}
          {topProducts.length > 0 && (
            <Card>
              <CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2"><CardTitle className="text-base">Top products</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <ol className="space-y-2">
                  {topProducts.map((p, i) => (
                    <li key={p.product_id} className="flex items-start gap-3 rounded-lg border p-3">
                      <span className="text-sm font-semibold text-muted-foreground shrink-0">#{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium break-words [overflow-wrap:anywhere]">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                          {p.views.toLocaleString()} views · {p.add_to_cart.toLocaleString()} ATC · {p.price != null ? money(Number(p.price)) : '—'}
                          {p.stock != null ? ` · ${p.stock} in stock` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="traffic">
            <div className="-mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto">
              <TabsList className="w-max">
                <TabsTrigger value="traffic" className="h-10 px-4">Traffic</TabsTrigger>
                <TabsTrigger value="pinterest" className="h-10 px-4">Pinterest</TabsTrigger>
                <TabsTrigger value="products" className="h-10 px-4">Products</TabsTrigger>
                <TabsTrigger value="orders" className="h-10 px-4">Orders</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="traffic" className="grid gap-4 lg:grid-cols-2 mt-4">
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Channels</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.sources} cols={[
                    { key: 'channel', label: 'Channel', primary: true },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'orders', label: 'Orders', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Campaigns (UTM)</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.campaigns} cols={[
                    { key: 'campaign', label: 'Campaign', primary: true },
                    { key: 'source', label: 'Source' },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'orders', label: 'Orders', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Landing pages</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.landing_pages} cols={[
                    { key: 'page', label: 'Page', primary: true },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Countries</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.countries} cols={[
                    { key: 'country', label: 'Country', primary: true },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pinterest" className="mt-4">
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base">Pinterest pins by UTM content</CardTitle>
                  <CardDescription>Sessions attributed via utm_source=pinterest first-touch.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.pinterest_pins} cols={[
                    { key: 'pin', label: 'Pin (utm_content)', primary: true },
                    { key: 'campaign', label: 'Campaign' },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'landing_pages', label: 'Landing pages', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="mt-4">
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Product performance</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.products} cols={[
                    { key: 'name', label: 'Product', primary: true },
                    { key: 'views', label: 'Views', align: 'right' },
                    { key: 'add_to_cart', label: 'ATC', align: 'right' },
                    { key: 'price', label: 'Price', align: 'right', render: (r) => (r.price != null ? money(Number(r.price)) : '—') },
                    { key: 'stock', label: 'Stock', align: 'right', render: (r) => (r.stock != null ? String(r.stock) : '—') },
                    { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'active' : 'inactive'}</Badge> },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orders" className="mt-4">
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Recent paid orders</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.recent_orders} cols={[
                    { key: 'created_at', label: 'Date', primary: true, render: (r) => new Date(r.created_at).toLocaleString() },
                    { key: 'total_amount', label: 'Total', align: 'right', render: (r) => money(Number(r.total_amount)) },
                    { key: 'currency', label: 'Currency' },
                    { key: 'status', label: 'Status' },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground">
            Generated {new Date(data.generated_at).toLocaleString()} · window {data.window_hours}h
          </p>
        </>
      )}
    </div>
  );
}
