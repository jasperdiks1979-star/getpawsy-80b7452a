/**
 * /admin/products-performance — per-product funnel & revenue (Canonical).
 *
 * Genesis V2.6 Wave 2: reads from canonical_products (daily per-product rollup).
 * Revenue cents come from canonical_orders aggregation in the SQL view, so it
 * always matches the global Revenue dashboard.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { getCanonicalProducts, type CanonicalProductRow } from '@/lib/canonicalAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Package, AlertTriangle, ArrowUpDown } from 'lucide-react';

type Range = '24h' | '7d' | '30d' | '90d';
type SortKey = 'views' | 'atc' | 'checkout' | 'purchase' | 'cvr' | 'revenue';

function rangeDays(r: Range): number {
  return r === '24h' ? 1 : r === '7d' ? 7 : r === '30d' ? 30 : 90;
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
  // Bots never reach canonical_products — toggle is informational.
  const [excludeBots, setExcludeBots] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CanonicalProductRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getCanonicalProducts(rangeDays(range));
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Canonical query failed');
      setRows([]);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const products = useMemo(() => {
    // Roll up daily canonical rows into per-product totals for the selected window.
    type Agg = { key: string; name: string; views: number; atc: number; checkout: number; purchase: number; revenue: number };
    const buckets = new Map<string, Agg>();
    for (const r of rows) {
      const key = r.product_id || '(unknown)';
      const b = buckets.get(key) ?? { key, name: key, views: 0, atc: 0, checkout: 0, purchase: 0, revenue: 0 };
      b.views += Number(r.product_views || 0);
      b.atc += Number(r.add_to_carts || 0);
      b.checkout += Number(r.checkouts || 0);
      b.purchase += Number(r.purchases || 0);
      b.revenue += Number(r.revenue_cents || 0) / 100;
      buckets.set(key, b);
    }
    const list = [...buckets.values()].map((b) => ({
      ...b,
      cvr: b.views ? b.purchase / b.views : 0,
    }));
    list.sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
    return list.slice(0, 200);
  }, [rows, sortKey]);

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
              Per-product views, ATCs, checkouts, purchases, CVR and revenue. Source: canonical_products.
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