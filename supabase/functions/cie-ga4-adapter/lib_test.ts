// Unit + integration-style tests for cie-ga4-adapter helpers.
// Covers: confidence math, purchase reconciliation, GA4 response parsing
// for missing/malformed fields, and the rate-limit retry loop.
import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fetchWithRetry,
  parseEventCountsResponse,
  parseTxResponse,
  purchaseConfidence,
  reconcilePurchases,
  volumeConfidence,
  type OrderRow,
} from "./lib.ts";

// ─────────────────────────────────────────────────────────────────────────────
// volumeConfidence
// ─────────────────────────────────────────────────────────────────────────────
Deno.test("volumeConfidence: zero events → 0 with rationale", () => {
  const r = volumeConfidence(0);
  assertEquals(r.confidence, 0);
  assert(r.rationale.includes("no events"));
});

Deno.test("volumeConfidence: log-scaled, clamped to 100", () => {
  assertEquals(volumeConfidence(10).confidence, 70); // 60 + log10(10)*10
  assertEquals(volumeConfidence(100).confidence, 80);
  assertEquals(volumeConfidence(10_000_000).confidence, 100); // clamp
});

// ─────────────────────────────────────────────────────────────────────────────
// reconcilePurchases / purchaseConfidence
// ─────────────────────────────────────────────────────────────────────────────
const order = (over: Partial<OrderRow> & Pick<OrderRow, "id">): OrderRow => ({
  id: over.id,
  stripe_session_id: over.stripe_session_id ?? null,
  stripe_payment_intent_id: over.stripe_payment_intent_id ?? null,
  total_amount: over.total_amount ?? null,
});

Deno.test("reconcilePurchases: perfect match on stripe_session_id and revenue", () => {
  const ga4 = [
    { transactionId: "cs_test_1", count: 1, revenue: 49.99 },
    { transactionId: "cs_test_2", count: 1, revenue: 19.95 },
  ];
  const orders = [
    order({ id: "o1", stripe_session_id: "cs_test_1", total_amount: 49.99 }),
    order({ id: "o2", stripe_session_id: "cs_test_2", total_amount: 19.95 }),
  ];
  const r = reconcilePurchases(ga4, orders);
  assertEquals(r.matched, 2);
  assertEquals(r.ga4_only, 0);
  assertEquals(r.orders_only, 0);
  assertEquals(r.id_match_rate, 1);
  assertEquals(r.count_match_rate, 1);
  assertEquals(r.revenue_ga4_cents, r.revenue_orders_cents);
  assertEquals(r.revenue_delta_pct, 0);

  const conf = purchaseConfidence(r);
  assertEquals(conf.confidence, 100);
});

Deno.test("reconcilePurchases: GA4-only transactions degrade id-match + samples capped at 10", () => {
  const ga4 = Array.from({ length: 15 }, (_, i) => ({
    transactionId: `ghost_${i}`,
    count: 1,
    revenue: 10,
  }));
  const orders: OrderRow[] = [];
  const r = reconcilePurchases(ga4, orders);
  assertEquals(r.ga4_count, 15);
  assertEquals(r.matched, 0);
  assertEquals(r.ga4_only, 15);
  assertEquals(r.id_match_rate, 0);
  assertEquals(r.sample_ga4_only.length, 10);
});

Deno.test("reconcilePurchases: orders-only when GA4 returns nothing", () => {
  const r = reconcilePurchases([], [order({ id: "o1", total_amount: 9.99 })]);
  assertEquals(r.ga4_count, 0);
  assertEquals(r.orders_count, 1);
  assertEquals(r.id_match_rate, 0);
  // No GA4 events ⇒ confidence collapses to 0 with internal-orders rationale.
  const conf = purchaseConfidence(r);
  assertEquals(conf.confidence, 0);
  assert(conf.rationale.includes("0 GA4 purchases vs 1"));
});

Deno.test("purchaseConfidence: empty window returns 0", () => {
  const r = reconcilePurchases([], []);
  const conf = purchaseConfidence(r);
  assertEquals(conf.confidence, 0);
  assert(conf.rationale.includes("no GA4 or internal"));
});

Deno.test("purchaseConfidence: blends id-match, revenue parity, count parity", () => {
  // 4 GA4 rows, 2 matched orders by id, $10 revenue gap on $100 → delta 10%
  const ga4 = [
    { transactionId: "o1", count: 1, revenue: 25 },
    { transactionId: "o2", count: 1, revenue: 25 },
    { transactionId: "ghost_a", count: 1, revenue: 30 },
    { transactionId: "ghost_b", count: 1, revenue: 30 },
  ];
  const orders = [
    order({ id: "o1", total_amount: 25 }),
    order({ id: "o2", total_amount: 25 }),
  ];
  const r = reconcilePurchases(ga4, orders);
  assertEquals(r.matched, 2);
  assertEquals(r.id_match_rate, 0.5);
  // count_match_rate = min(4,2)/max(4,2) = 0.5
  assertEquals(r.count_match_rate, 0.5);
  const conf = purchaseConfidence(r);
  // 0.5*0.5 + 0.3*revScore + 0.2*0.5 (revScore ∈ [0,1])
  assert(conf.confidence >= 0 && conf.confidence <= 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// GA4 response parsing — edge cases for missing event fields
// ─────────────────────────────────────────────────────────────────────────────
Deno.test("parseEventCountsResponse: empty rows returns zeroed defaults", () => {
  const out = parseEventCountsResponse({});
  assertEquals(out.page_view, { count: 0, revenue: 0 });
  assertEquals(out.session_start, { count: 0, revenue: 0 });
  assertEquals(out.purchase, { count: 0, revenue: 0 });
});

Deno.test("parseEventCountsResponse: tolerates missing dimensionValues / metricValues", () => {
  const out = parseEventCountsResponse({
    rows: [
      {}, // entirely empty row
      { dimensionValues: [] }, // no name
      { dimensionValues: [{ value: "page_view" }] }, // no metrics
      { dimensionValues: [{ value: "session_start" }], metricValues: [{ value: "42" }] }, // no revenue
      { dimensionValues: [{ value: "purchase" }], metricValues: [{ value: "7" }, { value: "199.50" }] },
      { dimensionValues: [{ value: "scroll" }], metricValues: [{ value: "999" }] }, // unknown event, ignored
    ],
  });
  assertEquals(out.page_view, { count: 0, revenue: 0 });
  assertEquals(out.session_start, { count: 42, revenue: 0 });
  assertEquals(out.purchase, { count: 7, revenue: 199.5 });
});

Deno.test("parseEventCountsResponse: coerces NaN metric values to 0", () => {
  const out = parseEventCountsResponse({
    rows: [
      { dimensionValues: [{ value: "page_view" }], metricValues: [{ value: "not-a-number" }, { value: "abc" }] },
    ],
  });
  assertEquals(out.page_view, { count: 0, revenue: 0 });
});

Deno.test("parseTxResponse: missing transactionId becomes empty string, never throws", () => {
  const rows = parseTxResponse({
    rows: [
      { dimensionValues: [{ value: "cs_test_1" }], metricValues: [{ value: "1" }, { value: "10" }] },
      { dimensionValues: [], metricValues: [{ value: "1" }, { value: "5" }] },
      {}, // empty row
    ],
  });
  assertEquals(rows.length, 3);
  assertEquals(rows[0].transactionId, "cs_test_1");
  assertEquals(rows[1].transactionId, "");
  assertEquals(rows[2].transactionId, "");
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limit / 5xx retry loop
// ─────────────────────────────────────────────────────────────────────────────
function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

Deno.test("fetchWithRetry: retries 429 then succeeds; uses Retry-After when present", async () => {
  const sleeps: number[] = [];
  let calls = 0;
  const fetcher = (_url: string) => {
    calls += 1;
    if (calls === 1) return Promise.resolve(jsonResponse(429, { error: "rate" }, { "Retry-After": "2" }));
    if (calls === 2) return Promise.resolve(jsonResponse(503, { error: "down" }));
    return Promise.resolve(jsonResponse(200, { ok: true }));
  };
  const res = await fetchWithRetry("https://example.test", { method: "GET" }, {
    maxRetries: 3,
    baseDelayMs: 10,
    fetcher,
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
  });
  assertEquals(res.status, 200);
  assertEquals(calls, 3);
  // Retry-After=2 ⇒ first sleep is 2000 ms; second is exponential backoff (≥10ms).
  assertEquals(sleeps[0], 2000);
  assert(sleeps[1] >= 10);
  await res.json();
});

Deno.test("fetchWithRetry: returns the final non-2xx after maxRetries are exhausted", async () => {
  let calls = 0;
  const fetcher = () => {
    calls += 1;
    return Promise.resolve(jsonResponse(429, { error: "rate" }));
  };
  const res = await fetchWithRetry("https://example.test", { method: "GET" }, {
    maxRetries: 2,
    baseDelayMs: 1,
    fetcher,
    sleep: () => Promise.resolve(),
  });
  assertEquals(res.status, 429);
  assertEquals(calls, 3); // 1 initial + 2 retries
  await res.text();
});

Deno.test("fetchWithRetry: 4xx other than 429 short-circuits (no retry)", async () => {
  let calls = 0;
  const fetcher = () => {
    calls += 1;
    return Promise.resolve(jsonResponse(400, { error: "bad" }));
  };
  const res = await fetchWithRetry("https://example.test", { method: "GET" }, {
    maxRetries: 3,
    baseDelayMs: 1,
    fetcher,
    sleep: () => Promise.resolve(),
  });
  assertEquals(res.status, 400);
  assertEquals(calls, 1);
  await res.text();
});

Deno.test("fetchWithRetry: network errors are retried then rethrown", async () => {
  let calls = 0;
  const fetcher = () => {
    calls += 1;
    return Promise.reject(new Error("ECONNRESET"));
  };
  let threw = false;
  try {
    await fetchWithRetry("https://example.test", { method: "GET" }, {
      maxRetries: 2,
      baseDelayMs: 1,
      fetcher,
      sleep: () => Promise.resolve(),
    });
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "ECONNRESET");
  }
  assert(threw);
  assertEquals(calls, 3);
});