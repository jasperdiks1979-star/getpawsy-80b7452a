// Pure helpers for the CIE orchestrator cycle, extracted for unit tests.

export function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 10000) / 100;
}

export type StepCounts = Record<string, number>;

export interface FunnelComputed {
  channel: string;
  sessions: number;
  product_views: number;
  add_to_cart: number;
  checkout: number;
  payment: number;
  purchase: number;
  cvr: number;
  anomalies: string[];
}

/** Aggregate raw waterfall rows into per-channel funnel rows with anomalies. */
export function aggregateFunnel(
  rows: Array<{ step?: string | null; channel?: string | null }>,
): FunnelComputed[] {
  const byChannel = new Map<string, StepCounts>();
  for (const r of rows) {
    const ch = r.channel || "unknown";
    const s = r.step || "page_view";
    if (!byChannel.has(ch)) byChannel.set(ch, {});
    byChannel.get(ch)![s] = (byChannel.get(ch)![s] ?? 0) + 1;
  }
  const out: FunnelComputed[] = [];
  for (const [channel, steps] of byChannel) {
    const sessions = steps["page_view"] ?? 0;
    const product_views = steps["view_item"] ?? 0;
    const atc = steps["add_to_cart"] ?? 0;
    const checkout = steps["begin_checkout"] ?? 0;
    const payment = steps["payment"] ?? 0;
    const purchase = steps["purchase"] ?? 0;
    const cvr = sessions ? purchase / sessions : 0;
    const anomalies: string[] = [];
    if (atc > 0 && checkout === 0) anomalies.push("atc_without_checkout");
    if (checkout > 0 && payment === 0) anomalies.push("checkout_without_payment");
    if (sessions > 100 && product_views === 0) anomalies.push("no_product_views");
    out.push({
      channel, sessions, product_views,
      add_to_cart: atc, checkout, payment, purchase, cvr, anomalies,
    });
  }
  return out;
}

export interface RevenueInputs {
  stripe_cents: number;
  orders_cents: number;
  ledger_cents: number;
  ga4_cents: number;
  pinterest_cents: number;
  tolerance_pct: number;
}

export function computeRevenueStatus(i: RevenueInputs): { max_div: number; status: "ok" | "partial" | "diverged" } {
  const values = [i.stripe_cents, i.orders_cents, i.ledger_cents].filter((v) => v > 0);
  let max_div = 0;
  if (values.length >= 2) {
    const max = Math.max(...values);
    const min = Math.min(...values);
    max_div = max ? ((max - min) / max) * 100 : 0;
  }
  const status: "ok" | "partial" | "diverged" =
    max_div > i.tolerance_pct
      ? "diverged"
      : (i.ga4_cents === 0 && i.pinterest_cents === 0 ? "partial" : "ok");
  return { max_div, status };
}