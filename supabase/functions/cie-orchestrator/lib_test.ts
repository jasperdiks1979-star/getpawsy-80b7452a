// Unit + integration-style tests for the CIE orchestrator cycle helpers.
import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aggregateFunnel,
  computeRevenueStatus,
  pct,
} from "./lib.ts";

Deno.test("pct: returns 0 when denominator is 0", () => {
  assertEquals(pct(10, 0), 0);
  assertEquals(pct(0, 0), 0);
});

Deno.test("pct: rounds to 2 decimal places", () => {
  assertEquals(pct(1, 3), 33.33);
  assertEquals(pct(2, 3), 66.67);
});

Deno.test("aggregateFunnel: groups by channel and computes cvr", () => {
  const rows = [
    { channel: "pinterest", step: "page_view" },
    { channel: "pinterest", step: "page_view" },
    { channel: "pinterest", step: "view_item" },
    { channel: "pinterest", step: "add_to_cart" },
    { channel: "pinterest", step: "begin_checkout" },
    { channel: "pinterest", step: "payment" },
    { channel: "pinterest", step: "purchase" },
    { channel: "tiktok", step: "page_view" },
  ];
  const out = aggregateFunnel(rows);
  const pin = out.find((r) => r.channel === "pinterest")!;
  assertEquals(pin.sessions, 2);
  assertEquals(pin.purchase, 1);
  assertEquals(pin.cvr, 0.5);
  assertEquals(pin.anomalies, []);
  const tt = out.find((r) => r.channel === "tiktok")!;
  assertEquals(tt.sessions, 1);
  assertEquals(tt.purchase, 0);
  assertEquals(tt.cvr, 0);
});

Deno.test("aggregateFunnel: missing channel/step defaults to 'unknown' + page_view", () => {
  const out = aggregateFunnel([{}, { channel: null, step: null }]);
  assertEquals(out.length, 1);
  assertEquals(out[0].channel, "unknown");
  assertEquals(out[0].sessions, 2);
});

Deno.test("aggregateFunnel: flags atc_without_checkout anomaly", () => {
  const rows = [
    { channel: "google", step: "page_view" },
    { channel: "google", step: "add_to_cart" },
  ];
  const out = aggregateFunnel(rows);
  assertEquals(out[0].anomalies, ["atc_without_checkout"]);
});

Deno.test("aggregateFunnel: flags checkout_without_payment and no_product_views", () => {
  const sessions = Array.from({ length: 150 }, () => ({ channel: "seo", step: "page_view" }));
  const out = aggregateFunnel([
    ...sessions,
    { channel: "seo", step: "begin_checkout" },
  ]);
  const row = out[0];
  assert(row.anomalies.includes("checkout_without_payment"));
  assert(row.anomalies.includes("no_product_views"));
});

Deno.test("computeRevenueStatus: ok when all sources agree and adapters present", () => {
  const r = computeRevenueStatus({
    stripe_cents: 10_000, orders_cents: 10_000, ledger_cents: 10_000,
    ga4_cents: 9_900, pinterest_cents: 4_000, tolerance_pct: 1,
  });
  assertEquals(r.max_div, 0);
  assertEquals(r.status, "ok");
});

Deno.test("computeRevenueStatus: partial when GA4 + Pinterest both 0 even with parity", () => {
  const r = computeRevenueStatus({
    stripe_cents: 10_000, orders_cents: 10_000, ledger_cents: 10_000,
    ga4_cents: 0, pinterest_cents: 0, tolerance_pct: 1,
  });
  assertEquals(r.status, "partial");
});

Deno.test("computeRevenueStatus: diverged when max_div exceeds tolerance", () => {
  const r = computeRevenueStatus({
    stripe_cents: 10_000, orders_cents: 8_500, ledger_cents: 10_000,
    ga4_cents: 0, pinterest_cents: 0, tolerance_pct: 1,
  });
  // (10000-8500)/10000 = 15% > 1%
  assertEquals(r.max_div, 15);
  assertEquals(r.status, "diverged");
});

Deno.test("computeRevenueStatus: ignores zero-valued sources when measuring divergence", () => {
  const r = computeRevenueStatus({
    stripe_cents: 0, orders_cents: 10_000, ledger_cents: 10_000,
    ga4_cents: 100, pinterest_cents: 0, tolerance_pct: 1,
  });
  assertEquals(r.max_div, 0);
  assertEquals(r.status, "ok");
});

// Integration-style: orchestrator cycle composition over its pure pipeline.
Deno.test("orchestrator cycle composition: funnel → revenue → status flow", () => {
  const waterfall = [
    { channel: "pinterest", step: "page_view" },
    { channel: "pinterest", step: "purchase" },
  ];
  const funnel = aggregateFunnel(waterfall);
  const orders_cents = funnel.reduce((s, f) => s + f.purchase * 4999, 0);
  const status = computeRevenueStatus({
    stripe_cents: orders_cents,
    orders_cents,
    ledger_cents: orders_cents,
    ga4_cents: 0,
    pinterest_cents: 0,
    tolerance_pct: 1,
  });
  assertEquals(funnel[0].purchase, 1);
  assertEquals(orders_cents, 4999);
  assertEquals(status.status, "partial");
});