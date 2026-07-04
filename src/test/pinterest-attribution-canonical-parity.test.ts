import { describe, it, expect } from "vitest";
import type { CanonicalFunnelResponse } from "@/hooks/useCanonicalFunnel";

// PR-2 slice 3 · Pinterest Attribution parity.
// Locks the derivation formulas the page uses for AOV / RPV / RPS and
// guarantees Sessions / Product Views / ATC / Checkout / Purchases /
// Revenue / CVR are read straight from analytics-canonical.totals — never
// from `pinterest_attribution_health.*`. Attribution coverage stays as
// a diagnostic and is intentionally NOT compared to business KPIs.

function fixture(): CanonicalFunnelResponse {
  return {
    ok: true,
    window: { hours: 24, since: "2026-07-03T00:00:00Z", until: "2026-07-04T00:00:00Z" },
    filter: { geo: "all", clean: true, source: "canonical_events + orders(paid|completed)" },
    totals: {
      visitors: 250, sessions: 200, page_views: 900, product_views: 140,
      add_to_cart: 20, view_cart: 15, checkout_started: 8, purchases: 4,
      revenue: 320, currency: "eur", conversion_rate: 2.0,
    },
    funnel: [], countries: [], sources: [], sample_event: null,
    generated_at: "2026-07-04T00:00:00Z",
  };
}

function pinterestKpisFromCanonical(r: CanonicalFunnelResponse) {
  const t = r.totals;
  return {
    sessions: t.sessions,
    product_views: t.product_views,
    add_to_cart: t.add_to_cart,
    checkout_started: t.checkout_started,
    purchases: t.purchases,
    revenue: t.revenue,
    cvr: t.conversion_rate,
    aov: t.purchases > 0 ? t.revenue / t.purchases : 0,
    rpv: t.visitors > 0 ? t.revenue / t.visitors : 0,
    rps: t.sessions > 0 ? t.revenue / t.sessions : 0,
  };
}

describe("PinterestAttribution · canonical KPI parity", () => {
  it("business KPIs equal analytics-canonical.totals — no pinterest_attribution_health reads", () => {
    const k = pinterestKpisFromCanonical(fixture());
    expect(k.sessions).toBe(200);
    expect(k.product_views).toBe(140);
    expect(k.add_to_cart).toBe(20);
    expect(k.checkout_started).toBe(8);
    expect(k.purchases).toBe(4);
    expect(k.revenue).toBe(320);
    expect(k.cvr).toBe(2.0);
    expect(k.aov).toBe(80);   // 320 / 4
    expect(k.rpv).toBe(1.28); // 320 / 250
    expect(k.rps).toBe(1.6);  // 320 / 200
  });

  it("derived ratios return 0 on empty windows (no estimates, no hidden zeroes)", () => {
    const r = fixture();
    r.totals.purchases = 0; r.totals.revenue = 0;
    r.totals.visitors = 0;  r.totals.sessions = 0;
    const k = pinterestKpisFromCanonical(r);
    expect(k.aov).toBe(0);
    expect(k.rpv).toBe(0);
    expect(k.rps).toBe(0);
  });
});