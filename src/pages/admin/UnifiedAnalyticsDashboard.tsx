/**
 * /admin/analytics — Unified analytics dashboard.
 *
 * Single source of truth: public.gp_unified_analytics(p_hours) RPC, which aggregates
 * canonical_sessions + canonical_events (commerce funnel, traffic, Pinterest UTMs)
 * and Stripe-verified paid orders server-side. Admin-only (role checked in the RPC).
 */
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, AlertTriangle, Download } from 'lucide-react';

type Range = '24h' | '7d' | '30d' | '90d';
const RANGE_HOURS: Record<Range, number> = { '24h': 24, '7d': 168, '30d': 720, '90d': 2160 };

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
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs uppercase tracking-wide">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function DataTable<T extends Record<string, unknown>>({ rows, cols }: { rows: T[]; cols: Array<{ key: keyof T; label: string; render?: (r: T) => React.ReactNode; align?: 'right' }> }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground py-6">No data in this window.</p>;
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

export default function UnifiedAnalyticsDashboard() {
  const [range, setRange] = useState<Range>('30d');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Helmet><title>Unified Analytics | Admin</title><meta name="robots" content="noindex" /></Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Unified Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Commerce, traffic and Pinterest in one view — canonical sessions/events + Stripe-verified paid orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(Object.keys(RANGE_HOURS) as Range[]).map((r) => (
            <Button key={r} size="sm" variant={r === range ? 'default' : 'outline'} onClick={() => setRange(r)}>{r}</Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data}><Download className="h-4 w-4" /></Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Analytics query failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {k && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Sessions" value={k.sessions.toLocaleString()} sub="bots &amp; internal excluded" />
            <Kpi label="Product views" value={k.product_views.toLocaleString()} />
            <Kpi label="Add to cart" value={k.add_to_cart.toLocaleString()} sub={`${pct(k.add_to_cart, k.product_views)} of views`} />
            <Kpi label="Checkouts" value={k.checkouts.toLocaleString()} sub={`${pct(k.checkouts, k.add_to_cart)} of ATC`} />
            <Kpi label="Paid orders" value={k.orders.toLocaleString()} sub={`CVR ${pct(k.orders, k.sessions)}`} />
            <Kpi label="Revenue" value={money(Number(k.revenue))} sub="Stripe-verified" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily sessions</CardTitle>
              <CardDescription>{data?.timeseries.length ?? 0} days · Pinterest sessions in window: {k.pinterest_sessions.toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-[2px] h-32">
                {data?.timeseries.map((t) => (
                  <div
                    key={t.day}
                    title={`${t.day}: ${t.sessions} sessions, ${t.orders} orders`}
                    className="flex-1 bg-primary/70 rounded-t min-h-[2px]"
                    style={{ height: `${(t.sessions / maxSessions) * 100}%` }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="traffic">
            <TabsList>
              <TabsTrigger value="traffic">Traffic</TabsTrigger>
              <TabsTrigger value="pinterest">Pinterest</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="traffic" className="grid gap-4 lg:grid-cols-2 mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Channels</CardTitle></CardHeader>
                <CardContent>
                  <DataTable rows={data!.sources} cols={[
                    { key: 'channel', label: 'Channel' },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'orders', label: 'Orders', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Campaigns (UTM)</CardTitle></CardHeader>
                <CardContent>
                  <DataTable rows={data!.campaigns} cols={[
                    { key: 'campaign', label: 'Campaign' },
                    { key: 'source', label: 'Source' },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'orders', label: 'Orders', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Landing pages</CardTitle></CardHeader>
                <CardContent>
                  <DataTable rows={data!.landing_pages} cols={[
                    { key: 'page', label: 'Page' },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Countries</CardTitle></CardHeader>
                <CardContent>
                  <DataTable rows={data!.countries} cols={[
                    { key: 'country', label: 'Country' },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pinterest" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pinterest pins by UTM content</CardTitle>
                  <CardDescription>Sessions attributed via utm_source=pinterest first-touch.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable rows={data!.pinterest_pins} cols={[
                    { key: 'pin', label: 'Pin (utm_content)' },
                    { key: 'campaign', label: 'Campaign' },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'landing_pages', label: 'Landing pages', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Top products</CardTitle></CardHeader>
                <CardContent>
                  <DataTable rows={data!.products} cols={[
                    { key: 'name', label: 'Product' },
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
                <CardHeader><CardTitle className="text-base">Recent paid orders</CardTitle></CardHeader>
                <CardContent>
                  <DataTable rows={data!.recent_orders} cols={[
                    { key: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
                    { key: 'total_amount', label: 'Total', align: 'right', render: (r) => money(Number(r.total_amount)) },
                    { key: 'currency', label: 'Currency' },
                    { key: 'status', label: 'Status' },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground">
            Generated {data ? new Date(data.generated_at).toLocaleString() : '—'} · window {data?.window_hours}h
          </p>
        </>
      )}
    </div>
  );
}