/**
 * /admin/pdp-conversion — PDP Conversion Dashboard
 *
 * Ranks products from worst to best Add-to-Cart performance over the last
 * 7 days using existing analytics tables (lp_funnel_events for views/ATC
 * and visitor_activity for purchases). Read-only, no migrations, lazy-loaded
 * per the admin bundle-optimization memory.
 *
 * Conversion score = blend of ATC rate (60 %) + Checkout rate (40 %),
 * normalized to 0–100 against the catalog's own ceiling. Products with
 * fewer than 25 PDP views in the window are flagged "low-traffic" and
 * ranked at the bottom regardless of rate so we don't mistake noise for
 * signal.
 */
import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Row {
  productId: string;
  productName: string;
  views: number;
  atc: number;
  checkout: number;
  orders: number;
  revenue: number;
  atcRate: number;
  checkoutRate: number;
  score: number;
  lowTraffic: boolean;
}

const LOW_TRAFFIC_THRESHOLD = 25;

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

async function loadRows(): Promise<Row[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Pull funnel events for the window (views + atc + begin_checkout).
  const { data: funnel, error: funnelErr } = await supabase
    .from('lp_funnel_events')
    .select('event_name, product_id, product_name')
    .in('event_name', ['pdp_view', 'add_to_cart', 'begin_checkout'])
    .eq('is_bot', false)
    .gte('created_at', sevenDaysAgo)
    .limit(50000);

  if (funnelErr) throw funnelErr;

  // Pull recent purchases for revenue.
  const { data: purchases, error: purchasesErr } = await supabase
    .from('visitor_activity')
    .select('product_id, product_name, order_value')
    .eq('activity_type', 'purchase')
    .gte('created_at', sevenDaysAgo)
    .limit(50000);

  if (purchasesErr) throw purchasesErr;

  const byId = new Map<string, Row>();
  const ensure = (id: string, name: string | null) => {
    let r = byId.get(id);
    if (!r) {
      r = {
        productId: id,
        productName: name || id,
        views: 0,
        atc: 0,
        checkout: 0,
        orders: 0,
        revenue: 0,
        atcRate: 0,
        checkoutRate: 0,
        score: 0,
        lowTraffic: true,
      };
      byId.set(id, r);
    } else if (name && !r.productName) {
      r.productName = name;
    }
    return r;
  };

  for (const e of funnel || []) {
    const id = (e as { product_id?: string | null }).product_id;
    if (!id) continue;
    const row = ensure(id, (e as { product_name?: string | null }).product_name ?? null);
    if (e.event_name === 'pdp_view') row.views += 1;
    else if (e.event_name === 'add_to_cart') row.atc += 1;
    else if (e.event_name === 'begin_checkout') row.checkout += 1;
  }

  for (const p of purchases || []) {
    const id = (p as { product_id?: string | null }).product_id;
    if (!id) continue;
    const row = ensure(id, (p as { product_name?: string | null }).product_name ?? null);
    row.orders += 1;
    const v = Number((p as { order_value?: number | null }).order_value || 0);
    if (Number.isFinite(v)) row.revenue += v;
  }

  const rows = Array.from(byId.values()).map((r) => {
    r.atcRate = r.views > 0 ? r.atc / r.views : 0;
    r.checkoutRate = r.views > 0 ? r.checkout / r.views : 0;
    r.lowTraffic = r.views < LOW_TRAFFIC_THRESHOLD;
    return r;
  });

  // Normalize against the catalog ceiling so scores stay 0–100.
  const highTraffic = rows.filter((r) => !r.lowTraffic);
  const maxAtc = highTraffic.reduce((m, r) => Math.max(m, r.atcRate), 0.05);
  const maxChk = highTraffic.reduce((m, r) => Math.max(m, r.checkoutRate), 0.02);

  for (const r of rows) {
    if (r.lowTraffic) {
      r.score = 0;
    } else {
      const atcPart = Math.min(1, r.atcRate / maxAtc);
      const chkPart = Math.min(1, r.checkoutRate / maxChk);
      r.score = Math.round((atcPart * 0.6 + chkPart * 0.4) * 100);
    }
  }

  // Sort: high-traffic worst → best; low-traffic dumped at the bottom.
  return rows.sort((a, b) => {
    if (a.lowTraffic !== b.lowTraffic) return a.lowTraffic ? 1 : -1;
    return a.score - b.score;
  });
}

export default function PdpConversionDashboardPage() {
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['pdp-conversion-dashboard'],
    queryFn: loadRows,
    staleTime: 5 * 60 * 1000,
  });

  const summary = useMemo(() => {
    if (!rows) return null;
    const active = rows.filter((r) => !r.lowTraffic);
    const views = active.reduce((s, r) => s + r.views, 0);
    const atc = active.reduce((s, r) => s + r.atc, 0);
    const checkout = active.reduce((s, r) => s + r.checkout, 0);
    const revenue = active.reduce((s, r) => s + r.revenue, 0);
    return {
      products: active.length,
      views,
      atc,
      checkout,
      revenue,
      atcRate: views > 0 ? atc / views : 0,
      checkoutRate: views > 0 ? checkout / views : 0,
    };
  }, [rows]);

  return (
    <div className="container max-w-7xl mx-auto px-4 py-8 space-y-6">
      <Helmet>
        <title>PDP Conversion Dashboard | GetPawsy Admin</title>
      </Helmet>

      <header className="space-y-1">
        <h2 className="text-2xl font-display font-bold text-foreground">
          PDP Conversion Dashboard
        </h2>
        <p className="text-sm text-muted-foreground">
          Last 7 days · ranked worst → best. Target: lift ATC rate from ~1.6 %
          to ≥ 5 %. Products with fewer than {LOW_TRAFFIC_THRESHOLD} views are
          marked low-traffic and ranked at the bottom.
        </p>
      </header>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Products</p>
            <p className="text-2xl font-bold tabular-nums">{summary.products}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">PDP views</p>
            <p className="text-2xl font-bold tabular-nums">
              {summary.views.toLocaleString('en-US')}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">ATC rate</p>
            <p className="text-2xl font-bold tabular-nums">{pct(summary.atcRate)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Checkout rate</p>
            <p className="text-2xl font-bold tabular-nums">{pct(summary.checkoutRate)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Revenue (7d)</p>
            <p className="text-2xl font-bold tabular-nums">{usd(summary.revenue)}</p>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden">
        {isLoading && (
          <div className="p-6 text-sm text-muted-foreground">Loading conversion data…</div>
        )}
        {error && (
          <div className="p-6 text-sm text-destructive">
            Failed to load: {(error as Error).message}
          </div>
        )}
        {rows && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No PDP events in the last 7 days.</div>
        )}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Views</th>
                  <th className="px-4 py-3 text-right">ATC %</th>
                  <th className="px-4 py-3 text-right">Checkout %</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.productId}
                    className="border-t border-border/40 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground truncate max-w-[28ch]">
                        {r.productName}
                      </div>
                      {r.lowTraffic && (
                        <Badge variant="outline" className="mt-1 text-[10px] uppercase">
                          Low traffic
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.views.toLocaleString('en-US')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.views > 0 ? pct(r.atcRate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.views > 0 ? pct(r.checkoutRate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.orders}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{usd(r.revenue)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center justify-center min-w-[44px] px-2 py-1 rounded-md text-xs font-semibold tabular-nums ${
                          r.lowTraffic
                            ? 'bg-muted text-muted-foreground'
                            : r.score >= 60
                              ? 'bg-success/15 text-success-foreground'
                              : r.score >= 30
                                ? 'bg-warning/15 text-warning-foreground'
                                : 'bg-destructive/15 text-destructive'
                        }`}
                      >
                        {r.lowTraffic ? '—' : r.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
