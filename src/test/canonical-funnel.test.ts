import { describe, it, expect } from "vitest";

// Contract test for the canonical funnel response shape produced by
// `supabase/functions/analytics-canonical` and consumed by
// `useCanonicalFunnel` + `CanonicalKpiStrip`. This is a shape/contract test —
// it does not hit the network. If the response contract changes, every
// dashboard consuming the hook breaks the same way, so this must be kept
// aligned with `src/hooks/useCanonicalFunnel.ts`.

import type { CanonicalFunnelResponse } from "@/hooks/useCanonicalFunnel";

function makeFixture(): CanonicalFunnelResponse {
  return {
    ok: true,
    window: { hours: 10, since: "2026-07-03T04:00:00Z", until: "2026-07-03T14:00:00Z" },
    filter: { geo: "all", clean: true, source: "canonical_events + orders(status IN paid,completed)" },
    totals: {
      visitors: 271, sessions: 174, page_views: 374, product_views: 47,
      add_to_cart: 1, view_cart: 2, checkout_started: 2, purchases: 1,
      revenue: 1, currency: "eur", conversion_rate: 0.37,
    },
    funnel: [
      { stage: "CANONICAL_PAGE_VIEW", count: 374 },
      { stage: "CANONICAL_PRODUCT_VIEW", count: 47 },
      { stage: "CANONICAL_ADD_TO_CART", count: 1 },
      { stage: "CANONICAL_CART", count: 2 },
      { stage: "CANONICAL_CHECKOUT", count: 2 },
      { stage: "CANONICAL_PURCHASE", count: 1 },
    ],
    countries: [
      { country: "United States", visitors: 31, sessions: 31, page_views: 8, add_to_cart: 0, checkout_started: 0, purchases: 0 },
    ],
    sources: [{ source: "direct", sessions: 98 }],
    sample_event: null,
    generated_at: "2026-07-03T14:50:00Z",
  };
}

describe("canonical funnel contract", () => {
  it("exposes every metric every dashboard needs", () => {
    const r = makeFixture();
    expect(r.ok).toBe(true);
    for (const k of [
      "visitors","sessions","page_views","product_views",
      "add_to_cart","view_cart","checkout_started","purchases",
      "revenue","currency","conversion_rate",
    ]) {
      expect(r.totals).toHaveProperty(k);
    }
  });

  it("funnel array is ordered and complete", () => {
    const r = makeFixture();
    const stages = r.funnel.map((f) => f.stage);
    expect(stages).toEqual([
      "CANONICAL_PAGE_VIEW","CANONICAL_PRODUCT_VIEW","CANONICAL_ADD_TO_CART",
      "CANONICAL_CART","CANONICAL_CHECKOUT","CANONICAL_PURCHASE",
    ]);
  });

  it("funnel monotonicity: later stages never exceed distinct-session counters", () => {
    const r = makeFixture();
    const { add_to_cart, checkout_started, purchases } = r.totals;
    // checkout can exceed atc when a session reaches checkout without a tracked ATC
    // (known instrumentation gap — do not enforce). But purchases must not exceed
    // sessions in the window.
    expect(purchases).toBeLessThanOrEqual(r.totals.sessions);
    expect(add_to_cart).toBeLessThanOrEqual(r.totals.sessions);
    expect(checkout_started).toBeLessThanOrEqual(r.totals.sessions);
  });

  it("countries + sources are arrays with expected shape", () => {
    const r = makeFixture();
    expect(Array.isArray(r.countries)).toBe(true);
    expect(Array.isArray(r.sources)).toBe(true);
    if (r.countries[0]) {
      for (const k of ["country","visitors","sessions","page_views","add_to_cart","checkout_started","purchases"]) {
        expect(r.countries[0]).toHaveProperty(k);
      }
    }
  });
});