/**
 * /admin/traffic-performance — per-source visitors, ATCs, purchases, revenue, ROAS (Canonical).
 *
 * Genesis V2.6 Wave 2: reads from canonical_funnel + canonical_orders.
 * Revenue is Stripe-verified paid orders only. Ad spend is entered manually.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  getCanonicalFunnelSessions, getCanonicalOrders,
  classifyCanonicalSource,
  type CanonicalSessionRow, type CanonicalOrderRow, type CanonicalSource,
} from '@/lib/canonicalAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Radio, AlertTriangle } from 'lucide-react';

type Range = '24h' | '7d' | '30d' | '90d';
type Source = CanonicalSource;

function rangeHours(r: Range): number {
  return r === '24h' ? 24 : r === '7d' ? 24 * 7 : r === '30d' ? 24 * 30 : 24 * 90;
}
function pct(n: number, d: number): string { if (!d) return '—'; return ((n / d) * 100).toFixed(2) + '%'; }
function money(n: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n); }

export default function TrafficPerformance() {
  const [range, setRange] = useState<Range>('30d');
  // Canonical layer excludes bots/QA at ingest. Toggle kept for UI parity.
  const [excludeBots, setExcludeBots] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CanonicalSessionRow[]>([]);
  const [orders, setOrders] = useState<CanonicalOrderRow[]>([]);
  const [spend, setSpend] = useState<Record<Source, string>>({ tiktok: '', pinterest: '', google: '', meta: '', email: '', direct: '', referral: '', other: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const hours = rangeHours(range);
      const [sess, ord] = await Promise.all([
        getCanonicalFunnelSessions({ hours }),
        getCanonicalOrders({ hours }),
      ]);
      setSessions(sess);
      setOrders(ord);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Canonical query failed');
      setSessions([]); setOrders([]);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const bySource = useMemo(() => {
    type B = { sessions: number; views: number; atc: number; checkout: number; purchase: number; revenue: number };
    const buckets = new Map<Source, B>();
    const mk = (): B => ({ sessions: 0, views: 0, atc: 0, checkout: 0, purchase: 0, revenue: 0 });
    for (const s of sessions) {
      const src = classifyCanonicalSource(s.utm_source);
      const b = buckets.get(src) ?? mk();
      b.sessions++;
      if (s.reached_product_view) b.views++;
      if (s.reached_add_to_cart) b.atc++;
      if (s.reached_checkout) b.checkout++;
      if (s.reached_purchase) b.purchase++;
      buckets.set(src, b);
    }
    // Revenue from canonical_orders (Stripe-verified) only.
    for (const o of orders) {
      const src = classifyCanonicalSource(o.utm_source);
      const b = buckets.get(src) ?? mk();
      b.revenue += Number(o.total_amount || 0);
      buckets.set(src, b);
    }
    return [...buckets.entries()]
      .map(([source, b]) => ({ source, ...b }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions, orders]);

  return (
    <>
      <Helmet>
        <title>Traffic Performance | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radio className="h-6 w-6 text-primary" />
              Traffic Performance
            </h1>
            <p className="text-sm text-muted-foreground">
              Per-source visitors, ATCs, checkouts, purchases, revenue and ROAS. Source: canonical_funnel + canonical_orders. Ad spend is entered manually.
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
            <CardTitle className="text-base">Per traffic source</CardTitle>
            <CardDescription>Unique sessions per step. Enter ad spend per source to compute ROAS.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
            ) : bySource.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions in range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3 text-right">Sessions</th>
                      <th className="py-2 pr-3 text-right">Views</th>
                      <th className="py-2 pr-3 text-right">ATC</th>
                      <th className="py-2 pr-3 text-right">Checkout</th>
                      <th className="py-2 pr-3 text-right">Purchases</th>
                      <th className="py-2 pr-3 text-right">CVR</th>
                      <th className="py-2 pr-3 text-right">Revenue</th>
                      <th className="py-2 pr-3 text-right">RPV</th>
                      <th className="py-2 pr-3 text-right">Spend</th>
                      <th className="py-2 pr-3 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySource.map((r) => {
                      const spendValue = parseFloat(spend[r.source] || '0');
                      const roas = spendValue > 0 ? r.revenue / spendValue : null;
                      return (
                        <tr key={r.source} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium capitalize">{r.source}</td>
                          <td className="py-2 pr-3 text-right">{r.sessions}</td>
                          <td className="py-2 pr-3 text-right">{r.views}</td>
                          <td className="py-2 pr-3 text-right">{r.atc}</td>
                          <td className="py-2 pr-3 text-right">{r.checkout}</td>
                          <td className="py-2 pr-3 text-right">{r.purchase}</td>
                          <td className="py-2 pr-3 text-right">{pct(r.purchase, r.sessions)}</td>
                          <td className="py-2 pr-3 text-right">{r.revenue ? money(r.revenue) : '—'}</td>
                          <td className="py-2 pr-3 text-right">{r.sessions ? money(r.revenue / r.sessions) : '—'}</td>
                          <td className="py-2 pr-3 text-right">
                            <Input className="h-7 w-20 text-right text-xs ml-auto" type="number" placeholder="0"
                              value={spend[r.source]} onChange={(e) => setSpend((s) => ({ ...s, [r.source]: e.target.value }))} />
                          </td>
                          <td className="py-2 pr-3 text-right">{roas == null ? '—' : `${roas.toFixed(2)}×`}</td>
                        </tr>
                      );
                    })}
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