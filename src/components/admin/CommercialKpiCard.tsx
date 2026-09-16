/**
 * Commercial KPIs — the money-side companion to the funnel KPIs.
 *
 * Deliberately cheap: one bounded read of `orders` for the selected window
 * (no history scans, no new scheduled job). Every metric states its own
 * evidence. When the sample is too small to mean anything, the card says
 * "not enough data" instead of printing a confident-looking percentage.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

/** Below this many paid orders, rates are noise rather than signal. */
export const MIN_ORDERS_FOR_RATES = 10;

/**
 * Store-owner addresses used for live payment smoke tests. Their orders are
 * real Stripe charges, so they sit in `orders` with payment_status 'paid' —
 * but they are not customer revenue and must never inflate the KPIs.
 */
export const INTERNAL_ORDER_EMAILS = [
  'jasperdiks@hotmail.com',
  'jasperdiks1979@gmail.com',
];

/** Live smoke tests are charged at token amounts; treat them as internal too. */
export const SMOKE_TEST_MAX_AMOUNT = 2;

export function isInternalOrder(row: { customer_email: string | null; total_amount: number | string | null }): boolean {
  const email = (row.customer_email || '').trim().toLowerCase();
  if (INTERNAL_ORDER_EMAILS.includes(email)) return true;
  const amount = Number(row.total_amount || 0);
  return amount > 0 && amount <= SMOKE_TEST_MAX_AMOUNT;
}

export interface CommercialKpis {
  paidOrders: number;
  revenue: number;
  aov: number | null;
  refundedOrders: number;
  refundRate: number | null;
  buyers: number;
  repeatBuyers: number;
  repeatRate: number | null;
  /** True when the sample is large enough for the rates to be meaningful. */
  sufficient: boolean;
  /** Paid orders excluded as owner/smoke-test traffic. */
  internalOrders: number;
}

interface OrderRow {
  customer_email: string | null;
  total_amount: number | string | null;
  payment_status: string | null;
  refund_state: string | null;
  refunded_amount_cents: number | null;
}

export function computeCommercialKpis(rows: OrderRow[]): CommercialKpis {
  const allPaid = rows.filter((r) => r.payment_status === 'paid');
  const paid = allPaid.filter((r) => !isInternalOrder(r));
  const internalOrders = allPaid.length - paid.length;
  const revenue = paid.reduce((a, r) => a + Number(r.total_amount || 0), 0);
  const refunded = paid.filter(
    (r) => (r.refund_state && r.refund_state !== 'none') || (r.refunded_amount_cents ?? 0) > 0,
  ).length;

  const perBuyer = new Map<string, number>();
  for (const r of paid) {
    const key = (r.customer_email || '').trim().toLowerCase();
    if (!key) continue;
    perBuyer.set(key, (perBuyer.get(key) ?? 0) + 1);
  }
  const buyers = perBuyer.size;
  const repeatBuyers = [...perBuyer.values()].filter((n) => n > 1).length;
  const sufficient = paid.length >= MIN_ORDERS_FOR_RATES;

  return {
    paidOrders: paid.length,
    revenue,
    aov: paid.length ? revenue / paid.length : null,
    refundedOrders: refunded,
    refundRate: sufficient ? (refunded / paid.length) * 100 : null,
    buyers,
    repeatBuyers,
    repeatRate: sufficient && buyers ? (repeatBuyers / buyers) * 100 : null,
    sufficient,
    internalOrders,
  };
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-border/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground mt-0.5">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{note}</p>
    </div>
  );
}

export function CommercialKpiCard({ hours }: { hours: number }) {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    supabase
      .from('orders')
      .select('customer_email, total_amount, payment_status, refund_state, refunded_amount_cents')
      .gte('created_at', since)
      .limit(1000)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) setError(e.message);
        setRows((data as OrderRow[]) ?? []);
      });
    return () => { cancelled = true; };
  }, [hours]);

  const k = useMemo(() => (rows ? computeCommercialKpis(rows) : null), [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Commercial KPIs
          {k && !k.sufficient && <Badge variant="secondary">Not enough data</Badge>}
        </CardTitle>
        <CardDescription>
          Customer paid orders in the selected window. Owner test purchases and live payment
          smoke tests are excluded. Rates are hidden until there are at least{' '}
          {MIN_ORDERS_FOR_RATES} paid orders, because below that they describe noise.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!rows && !error && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        )}
        {k && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric
              label="Paid orders"
              value={String(k.paidOrders)}
              note={
                k.internalOrders
                  ? `Customer orders only — ${k.internalOrders} owner/test order${k.internalOrders === 1 ? '' : 's'} excluded`
                  : 'Counted from order payment status'
              }
            />
            <Metric
              label="Revenue"
              value={`$${k.revenue.toFixed(2)}`}
              note="Sum of paid order totals"
            />
            <Metric
              label="Average order value"
              value={k.aov === null ? '—' : `$${k.aov.toFixed(2)}`}
              note={k.aov === null ? 'No paid orders in window' : 'Revenue ÷ paid orders'}
            />
            <Metric
              label="Refund rate"
              value={k.refundRate === null ? 'Not enough data' : `${k.refundRate.toFixed(1)}%`}
              note={`${k.refundedOrders} refunded of ${k.paidOrders}`}
            />
            <Metric
              label="Repeat purchase rate"
              value={k.repeatRate === null ? 'Not enough data' : `${k.repeatRate.toFixed(1)}%`}
              note={`${k.repeatBuyers} of ${k.buyers} buyers ordered more than once`}
            />
            <Metric
              label="Margin"
              value="Not available"
              note="No verified per-order cost data is recorded, so margin cannot be computed"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CommercialKpiCard;
