/**
 * /admin/traffic-performance — per-source visitors, ATCs, purchases, revenue, ROAS.
 *
 * Source: lp_funnel_events + orders. Sessions are classified by utm_source.
 * Revenue is joined from `orders.status='paid'` via stripe_session_id when present;
 * otherwise falls back to payment_success.value from lp_funnel_events.
 * Ad spend is unknown server-side, so ROAS column reads "—" unless a spend value
 * is entered in the input box (kept local to the page; no persistence yet).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Radio, AlertTriangle } from 'lucide-react';

type Range = '24h' | '7d' | '30d' | '90d';
type Source = 'tiktok' | 'pinterest' | 'google' | 'meta' | 'email' | 'direct' | 'referral' | 'other';

interface LpRow { event_name: string; session_id: string; utm_source: string | null; utm_campaign: string | null; value: number | null; is_bot: boolean | null; }
interface CheckoutRow { step: string; session_id: string; stripe_session_id: string | null; is_bot: boolean | null; }
interface OrderRow { status: string; total_amount: number | null; stripe_session_id: string | null; }

function rangeStart(r: Range): string {
  const days = r === '24h' ? 1 : r === '7d' ? 7 : r === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 3600e3).toISOString();
}
function pct(n: number, d: number): string { if (!d) return '—'; return ((n / d) * 100).toFixed(2) + '%'; }
function money(n: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n); }

function classify(s: string | null | undefined): Source {
  if (!s) return 'direct';
  const v = s.toLowerCase();
  if (v.includes('tiktok')) return 'tiktok';
  if (v.includes('pinterest')) return 'pinterest';
  if (v.includes('google')) return 'google';
  if (v.includes('facebook') || v.includes('meta') || v.includes('instagram')) return 'meta';
  if (v.includes('email') || v.includes('newsletter') || v.includes('klaviyo')) return 'email';
  if (v === 'direct') return 'direct';
  if (v === 'referral') return 'referral';
  return 'other';
}

export default function TrafficPerformance() {
  const [range, setRange] = useState<Range>('30d');
  const [excludeBots, setExcludeBots] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lp, setLp] = useState<LpRow[]>([]);
  const [ck, setCk] = useState<CheckoutRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [spend, setSpend] = useState<Record<Source, string>>({ tiktok: '', pinterest: '', google: '', meta: '', email: '', direct: '', referral: '', other: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const since = rangeStart(range);
    const [lpRes, ckRes, ordRes] = await Promise.all([
      supabase.from('lp_funnel_events')
        .select('event_name, session_id, utm_source, utm_campaign, value, is_bot')
        .gte('created_at', since).eq('qa', false)
        .in('event_name', ['view_item', 'pdp_view', 'add_to_cart', 'begin_checkout', 'payment_success'])
        .limit(50000),
      supabase.from('checkout_funnel_events')
        .select('step, session_id, stripe_session_id, is_bot')
        .gte('created_at', since).eq('qa', false).limit(50000),
      supabase.from('orders').select('status, total_amount, stripe_session_id').gte('created_at', since).limit(10000),
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

  const bySource = useMemo(() => {
    const sidSource = new Map<string, Source>();
    const sidBot = new Map<string, boolean>();
    for (const r of lp) {
      if (!sidSource.has(r.session_id)) sidSource.set(r.session_id, classify(r.utm_source));
      if (r.is_bot === true) sidBot.set(r.session_id, true);
    }
    type B = { sessions: Set<string>; views: Set<string>; atc: Set<string>; checkout: Set<string>; purchase: Set<string>; revenue: number };
    const buckets = new Map<Source, B>();
    const mk = (): B => ({ sessions: new Set(), views: new Set(), atc: new Set(), checkout: new Set(), purchase: new Set(), revenue: 0 });
    for (const [sid, src] of sidSource.entries()) {
      if (excludeBots && sidBot.get(sid)) continue;
      const b = buckets.get(src) ?? mk();
      b.sessions.add(sid);
      buckets.set(src, b);
    }
    for (const r of lp) {
      if (excludeBots && r.is_bot === true) continue;
      const src = sidSource.get(r.session_id);
      if (!src) continue;
      const b = buckets.get(src); if (!b) continue;
      if (r.event_name === 'view_item' || r.event_name === 'pdp_view') b.views.add(r.session_id);
      if (r.event_name === 'add_to_cart') b.atc.add(r.session_id);
      if (r.event_name === 'begin_checkout') b.checkout.add(r.session_id);
      if (r.event_name === 'payment_success') { b.purchase.add(r.session_id); b.revenue += Number(r.value ?? 0); }
    }
    // Augment from checkout funnel
    const stripeToSid = new Map<string, string>();
    for (const r of ck) {
      if (excludeBots && r.is_bot === true) continue;
      const src = sidSource.get(r.session_id);
      if (src) {
        const b = buckets.get(src);
        if (b) {
          if (r.step === 'begin_checkout' || r.step === 'checkout_click') b.checkout.add(r.session_id);
          if (r.step === 'payment_success' || r.step === 'checkout_redirect_success') b.purchase.add(r.session_id);
        }
      }
      if (r.stripe_session_id) stripeToSid.set(r.stripe_session_id, r.session_id);
    }
    // Replace revenue with paid-order ground truth when available
    const paid = orders.filter((o) => o.status === 'paid' && (o.total_amount ?? 0) > 0);
    if (paid.length) {
      for (const b of buckets.values()) b.revenue = 0;
      for (const o of paid) {
        const sid = o.stripe_session_id ? stripeToSid.get(o.stripe_session_id) : undefined;
        const src: Source = (sid ? sidSource.get(sid) : undefined) ?? 'direct';
        const b = buckets.get(src);
        if (b) b.revenue += Number(o.total_amount ?? 0);
      }
    }
    return [...buckets.entries()]
      .map(([source, b]) => ({
        source,
        sessions: b.sessions.size,
        views: b.views.size,
        atc: b.atc.size,
        checkout: b.checkout.size,
        purchase: b.purchase.size,
        revenue: b.revenue,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [lp, ck, orders, excludeBots]);

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
              Per-source visitors, ATCs, checkouts, purchases, revenue and ROAS. Revenue uses paid orders when available; ad spend is entered manually.
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