// Pure helpers + retry-aware GA4 fetcher for cie-ga4-adapter.
// Extracted so they can be unit-tested with Deno.test without booting
// the edge function HTTP handler.

export type PurchaseRecon = {
  ga4_count: number;
  orders_count: number;
  matched: number;
  ga4_only: number;
  orders_only: number;
  id_match_rate: number;
  count_match_rate: number;
  revenue_ga4_cents: number;
  revenue_orders_cents: number;
  revenue_delta_pct: number;
  sample_ga4_only: string[];
  sample_orders_only: string[];
};

export type Ga4EventCounts = Record<string, { count: number; revenue: number }>;

export type Ga4TxRow = { transactionId: string; count: number; revenue: number };

export type OrderRow = {
  id: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  total_amount: number | null;
};

export function volumeConfidence(count: number): { confidence: number; rationale: string } {
  if (count <= 0) return { confidence: 0, rationale: "no events received from GA4" };
  const conf = Math.min(100, Math.round(60 + Math.log10(count) * 10));
  return { confidence: conf, rationale: `event volume ${count} over window` };
}

export function purchaseConfidence(r: PurchaseRecon): { confidence: number; rationale: string } {
  if (r.ga4_count <= 0 && r.orders_count <= 0) {
    return { confidence: 0, rationale: "no GA4 or internal purchases in window" };
  }
  if (r.ga4_count <= 0) {
    return { confidence: 0, rationale: `0 GA4 purchases vs ${r.orders_count} internal orders` };
  }
  const idScore = r.id_match_rate;
  const revScore = Math.max(0, 1 - Math.abs(r.revenue_delta_pct) / 10);
  const countScore = r.count_match_rate;
  const blended = idScore * 0.5 + revScore * 0.3 + countScore * 0.2;
  const conf = Math.max(0, Math.min(100, Math.round(blended * 100)));
  const rationale =
    `id-match ${(idScore * 100).toFixed(0)}% · revenue Δ ${r.revenue_delta_pct.toFixed(2)}% ` +
    `· count parity ${(countScore * 100).toFixed(0)}% ` +
    `(GA4 ${r.ga4_count}/$${(r.revenue_ga4_cents / 100).toFixed(2)} vs orders ${r.orders_count}/$${(r.revenue_orders_cents / 100).toFixed(2)})`;
  return { confidence: conf, rationale };
}

export function reconcilePurchases(ga4Rows: Ga4TxRow[], orders: OrderRow[]): PurchaseRecon {
  const orderByKey = new Map<string, OrderRow>();
  for (const o of orders) {
    for (const k of [o.id, o.stripe_session_id, o.stripe_payment_intent_id]) {
      if (k) orderByKey.set(String(k), o);
    }
  }
  const matchedOrderIds = new Set<string>();
  let matched = 0;
  let ga4_only = 0;
  let revenue_ga4_cents = 0;
  const sample_ga4_only: string[] = [];
  for (const r of ga4Rows) {
    revenue_ga4_cents += Math.round(r.revenue * 100);
    const o = r.transactionId ? orderByKey.get(r.transactionId) : undefined;
    if (o) {
      matched += 1;
      matchedOrderIds.add(o.id);
    } else {
      ga4_only += 1;
      if (sample_ga4_only.length < 10) sample_ga4_only.push(r.transactionId || "(empty)");
    }
  }
  const orders_only_list = orders.filter((o) => !matchedOrderIds.has(o.id));
  const orders_only = orders_only_list.length;
  const revenue_orders_cents = orders.reduce(
    (s, o) => s + Math.round(Number(o.total_amount ?? 0) * 100),
    0,
  );
  const ga4_count = ga4Rows.length;
  const orders_count = orders.length;
  const id_match_rate = ga4_count > 0 ? matched / ga4_count : 0;
  const count_match_rate =
    Math.max(ga4_count, orders_count) > 0
      ? Math.min(ga4_count, orders_count) / Math.max(ga4_count, orders_count)
      : 1;
  const denom = Math.max(revenue_orders_cents, 1);
  const revenue_delta_pct = ((revenue_ga4_cents - revenue_orders_cents) / denom) * 100;
  return {
    ga4_count, orders_count, matched, ga4_only, orders_only,
    id_match_rate, count_match_rate,
    revenue_ga4_cents, revenue_orders_cents, revenue_delta_pct,
    sample_ga4_only,
    sample_orders_only: orders_only_list.slice(0, 10).map((o) => o.id),
  };
}

/** Map GA4 runReport rows -> {page_view, session_start, purchase} counts,
 *  tolerating missing dimensionValues / metricValues. */
export function parseEventCountsResponse(j: { rows?: unknown[] }): Ga4EventCounts {
  const out: Ga4EventCounts = {
    page_view: { count: 0, revenue: 0 },
    session_start: { count: 0, revenue: 0 },
    begin_checkout: { count: 0, revenue: 0 },
    purchase: { count: 0, revenue: 0 },
  };
  for (const row of (j.rows ?? []) as Array<Record<string, any>>) {
    const name = row?.dimensionValues?.[0]?.value as string | undefined;
    if (!name || !(name in out)) continue;
    const count = Number(row?.metricValues?.[0]?.value ?? 0);
    const revenue = Number(row?.metricValues?.[1]?.value ?? 0);
    out[name] = {
      count: Number.isFinite(count) ? count : 0,
      revenue: Number.isFinite(revenue) ? revenue : 0,
    };
  }
  return out;
}

/** Map GA4 transaction rows -> [{transactionId, count, revenue}], tolerant of missing fields. */
export function parseTxResponse(j: { rows?: unknown[] }): Ga4TxRow[] {
  const rows: Ga4TxRow[] = [];
  for (const row of (j.rows ?? []) as Array<Record<string, any>>) {
    const tx = String(row?.dimensionValues?.[0]?.value ?? "").trim();
    const count = Number(row?.metricValues?.[0]?.value ?? 0);
    const revenue = Number(row?.metricValues?.[1]?.value ?? 0);
    rows.push({
      transactionId: tx,
      count: Number.isFinite(count) ? count : 0,
      revenue: Number.isFinite(revenue) ? revenue : 0,
    });
  }
  return rows;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable sleeper so tests don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
  fetcher?: FetchLike;
}

/** fetch wrapper that retries on 429 / 5xx with exponential backoff.
 *  Honors a `Retry-After` header (seconds) when present.
 *  Throws after `maxRetries` retries (so 1+maxRetries total attempts). */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const f = opts.fetcher ?? fetch;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await f(url, init);
      if (res.status !== 429 && res.status < 500) return res;
      if (attempt === maxRetries) return res; // surface final non-2xx to caller
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(maxDelayMs, retryAfter * 1000)
        : Math.min(maxDelayMs, baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100));
      // Drain body to free the connection.
      try { await res.text(); } catch { /* ignore */ }
      await sleep(backoff);
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) throw err;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(backoff);
    }
  }
  // Should never reach here.
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}