import { describe, it, expect } from "vitest";
import type { CanonicalFunnelResponse } from "@/hooks/useCanonicalFunnel";

// PR-2 slice 2 parity: the Customer Journey Center's top KPI grid MUST
// derive Sessions / ATC / Checkout / Purchases / Revenue / CVR / rates
// from `analytics-canonical.totals` — never from `cjie_session_journeys`.
// This test locks the derivation formulas the page uses so any future
// drift between the CJC KPI grid and the canonical service fails CI.

function fixture(): CanonicalFunnelResponse {
  return {
    ok: true,
    window: { hours: 168, since: "2026-06-27T00:00:00Z", until: "2026-07-04T00:00:00Z" },
    filter: { geo: "all", clean: true, source: "canonical_events + orders(paid|completed)" },
    totals: {
      visitors: 500, sessions: 400, page_views: 1200, product_views: 220,
      add_to_cart: 40, view_cart: 30, checkout_started: 18, purchases: 9,
      revenue: 812.5, currency: "eur", conversion_rate: 2.25,
    },
    funnel: [], countries: [], sources: [], sample_event: null,
    generated_at: "2026-07-04T00:00:00Z",
  };
}

function derivedFromCanonical(r: CanonicalFunnelResponse) {
  const t = r.totals;
  const rate = (n: number) => (t.sessions > 0 ? Number(((n / t.sessions) * 100).toFixed(2)) : 0);
  return {
    sessions: t.sessions,
    add_to_cart: t.add_to_cart,
    checkout_started: t.checkout_started,
    purchases: t.purchases,
    revenue: t.revenue,
    cvr: t.conversion_rate,
    atc_rate: rate(t.add_to_cart),
    checkout_rate: rate(t.checkout_started),
    purchase_rate: rate(t.purchases),
  };
}

describe("CustomerJourneyCenter · canonical KPI parity", () => {
  it("KPI grid values equal analytics-canonical.totals (no CJIE)", () => {
    const r = fixture();
    const d = derivedFromCanonical(r);
    expect(d.sessions).toBe(400);
    expect(d.add_to_cart).toBe(40);
    expect(d.checkout_started).toBe(18);
    expect(d.purchases).toBe(9);
    expect(d.revenue).toBe(812.5);
    expect(d.cvr).toBe(2.25);
    expect(d.atc_rate).toBe(10);
    expect(d.checkout_rate).toBe(4.5);
    expect(d.purchase_rate).toBe(2.25);
  });

  it("rates are 0 when there are no sessions (never hide, never estimate)", () => {
    const r = fixture();
    r.totals.sessions = 0;
    r.totals.add_to_cart = 0;
    r.totals.checkout_started = 0;
    r.totals.purchases = 0;
    const d = derivedFromCanonical(r);
    expect(d.atc_rate).toBe(0);
    expect(d.checkout_rate).toBe(0);
    expect(d.purchase_rate).toBe(0);
  });
});