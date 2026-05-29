/**
 * /admin/products-performance — per-product funnel & revenue.
 *
 * Source: lp_funnel_events grouped by product_id/product_name,
 * counting unique sessions per step (view → atc → checkout → purchase).
 * Revenue is summed from `value` on payment_success rows where available.
 * No mock data. Empty buckets render "—".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Package, AlertTriangle, ArrowUpDown } from 'lucide-react';

type Range = '24h' | '7d' | '30d' | '90d';
type SortKey = 'views' | 'atc' | 'checkout' | 'purchase' | 'cvr' | 'revenue';

interface Row {
  event_name: string;
  session_id: string;
  product_id: string | null;
  product_name: string | null;
  value: number | null;
  is_bot: boolean | null;
}

function rangeStart(r: Range): string {
  const days = r === '24h' ? 1 : r === '7d' ? 7 : r === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 3600e3).toISOString();
}
function pct(n: number, d: number): string {
  if (!d) return '—';
  return ((n / d) * 100).toFixed(2) + '%';
}
function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function ProductsPerformance() {
  const [range, setRange] = useState<Range>('30d');
  const [excludeBots, setExcludeBots] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase
      .from('lp_funnel_events')
      .select('event_name, session_id, product_id, product_name, value, is_bot')
      .gte('created_at', rangeStart(range))
      .eq('qa', false)
      .in('event_name', ['view_item', 'pdp_view', 'add_to_cart', 'begin_checkout', 'payment_success'])
      .limit(50000);
    if (error) { setError(error.message); setRows([]); }
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const products = useMemo(() => {
    type Bucket = { key: string; name: string; views: Set<string>; atc: Set<string>; checkout: Set<string>; purchase: Set<string>; revenue: number };
    const buckets = new Map<string, Bucket>();
    for (const r of rows) {
      if (excludeBots && r.is_bot === true) continue;
      const key = r.product_id || r.product_name || '(unknown)';
      let b = buckets.get(key);
      if (!b) { b = { key, name: r.product_name || key, views: new Set(), atc: new Set(), checkout: new Set(), purchase: new Set(), revenue: 0 }; buckets.set(key, b); }
      if (r.event_name === 'view_item' || r.event_name === 'pdp_view') b.views.add(r.session_id);
      if (r.event_name === 'add_to_cart') b.atc.add(r.session_id);
      if (r.event_name === 'begin_checkout') b.checkout.add(r.session_id);
      if (r.event_name === 'payment_success') {
        b.purchase.add(r.session_id);
        b.revenue += Number(r.value ?? 0);
      }
    }
    const list = [...buckets.values()].map((b) => ({
      key: b.key, name: b.name,
      views: b.views.size, atc: b.atc.size, checkout: b.checkout.size,
      purchase: b.purchase.size, revenue: b.revenue,
      cvr: b.views.size ? b.purchase.size / b.views.size : 0,
    }));
    list.sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
    return list.slice(0, 200);
  }, [rows, excludeBots, sortKey]);

  return (
    <>
      <Helmet>
        <title>Products Performance | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              Products Performance
            </h1>
            <p className="text-sm text-muted-foreground">
              Per-product views, ATCs, checkouts, purchases, CVR and revenue. Source: lp_funnel_events.
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <LabeledSelect label="Range" value={range} onChange={(v) => setRange(v as Range)} options={[
              { v: '24h', l: 'Last 24h' }, { v: '7d', l: 'Last 7d' }, { v: '30d', l: 'Last 30d' }, { v: '90d', l: 'Last 90d' },
            ]} />
            <LabeledSelect label="Bots" value={excludeBots ? 'exclude' : 'include'} onChange={(v) => setExcludeBots(v === 'exclude')} options={[
              { v: 'exclude', l: 'Exclude bots' }, { v: 'include', l: 'Include bots' },
            ]} />
            <LabeledSelect label="Sort by" value={sortKey} onChange={(v) => setSortKey(v as SortKey)} options={[
              { v: 'views', l: 'Views' }, { v: 'atc', l: 'Add to cart' },
              { v: 'checkout', l: 'Checkout' }, { v: 'purchase', l: 'Purchases' },
              { v: 'cvr', l: 'CVR' }, { v: 'revenue', l: 'Revenue' },
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4" />Per-product funnel
            </CardTitle>
            <CardDescription>Top 200 products by selected sort key. Unique sessions per step.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
            ) : products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No product events in range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-4">Product</th>
                      <th className="py-2 pr-4 text-right">Views</th>
                      <th className="py-2 pr-4 text-right">ATC</th>
                      <th className="py-2 pr-4 text-right">ATC %</th>
                      <th className="py-2 pr-4 text-right">Checkout</th>
                      <th className="py-2 pr-4 text-right">Purchases</th>
                      <th className="py-2 pr-4 text-right">CVR</th>
                      <th className="py-2 pr-4 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.key} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{p.name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{p.key}</div>
                        </td>
                        <td className="py-2 pr-4 text-right">{p.views.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{p.atc.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{pct(p.atc, p.views)}</td>
                        <td className="py-2 pr-4 text-right">{p.checkout.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{p.purchase.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{pct(p.purchase, p.views)}</td>
                        <td className="py-2 pr-4 text-right">{p.revenue ? money(p.revenue) : '—'}</td>
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

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}