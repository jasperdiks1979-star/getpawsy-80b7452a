/**
 * Ecommerce Events Regression Suite
 *
 * Locks the canonical event contract that powers GA4 + the internal
 * funnel mirror + every admin dashboard. Any drift fails the CI gate in
 * `.github/workflows/test.yml` and therefore blocks deployment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CANONICAL_ECOMMERCE_EVENTS,
  CANONICAL_FUNNEL_EVENTS,
  EVENT_ALIASES,
  REQUIRED_GA4_PARAMS,
  resolveCanonicalEvent,
  isCanonicalEcommerceEvent,
} from "@/lib/analytics-canonical-events";

// --- Mock founder-mode + downstream pixels so trackEvent runs cleanly --------
vi.mock("@/lib/founder-mode", () => ({
  getFounderModeStatus: () => false,
  getTrafficType: () => "external",
  logFounderEvent: () => {},
}));
vi.mock("@/lib/tiktok-pixel", () => ({
  ttTrackViewContent: () => {},
  ttTrackAddToCart: () => {},
  ttTrackInitiateCheckout: () => {},
  ttTrackPurchase: () => {},
}));
vi.mock("@/lib/lpCtaCorrelation", () => ({ enrichEventWithLpCta: () => ({}) }));
vi.mock("@/lib/utmAttributionValidator", () => ({ validateUtmAttribution: () => null }));
vi.mock("@/lib/lpFunnelMirror", () => ({ mirrorLpFunnelEvent: () => {} }));
vi.mock("@/lib/utmNormalizer", () => ({ getPersistedUtm: () => ({}) }));

import {
  trackAddToCart,
  trackRemoveFromCart,
  trackViewCart,
  trackViewItem,
  trackBeginCheckout,
  trackPurchase,
} from "@/lib/analytics";
import type { FunnelStep } from "@/lib/analyticsFunnel";

describe("Canonical event registry", () => {
  it("ecommerce list is unique and lowercase", () => {
    const set = new Set(CANONICAL_ECOMMERCE_EVENTS);
    expect(set.size).toBe(CANONICAL_ECOMMERCE_EVENTS.length);
    for (const n of CANONICAL_ECOMMERCE_EVENTS) expect(n).toBe(n.toLowerCase());
  });

  it("funnel waterfall includes every ecommerce step that appears in funnel", () => {
    const required: FunnelStep[] = [
      "view_item", "add_to_cart", "view_cart",
      "remove_from_cart", "begin_checkout", "purchase",
    ];
    for (const s of required) {
      expect(CANONICAL_FUNNEL_EVENTS).toContain(s);
    }
  });

  it("aliases never collide with canonical names", () => {
    for (const alias of Object.keys(EVENT_ALIASES)) {
      expect(isCanonicalEcommerceEvent(alias)).toBe(false);
    }
  });

  it("alias resolver maps every legacy name to a canonical event", () => {
    for (const [alias, canonical] of Object.entries(EVENT_ALIASES)) {
      expect(resolveCanonicalEvent(alias)).toBe(canonical);
    }
    // pass-through for unknown names
    expect(resolveCanonicalEvent("custom_event")).toBe("custom_event");
  });

  it("every canonical ecommerce event declares its required GA4 params", () => {
    for (const ev of CANONICAL_ECOMMERCE_EVENTS) {
      expect(REQUIRED_GA4_PARAMS[ev]).toBeDefined();
      expect(REQUIRED_GA4_PARAMS[ev].length).toBeGreaterThan(0);
    }
  });
});

describe("Ecommerce emitters fire canonical GA4 events", () => {
  let gtagCalls: Array<[string, string, Record<string, unknown> | undefined]>;

  beforeEach(() => {
    gtagCalls = [];
    (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = (
      cmd: string, name: string, params?: Record<string, unknown>,
    ) => { gtagCalls.push([cmd, name, params]); };
  });

  const sampleItem = { id: "p1", name: "Cat Tree", price: 49.99, quantity: 1 };

  it("view_item emits canonical name + required params", () => {
    trackViewItem("p1", "Cat Tree", 49.99, "cat-trees");
    const ev = gtagCalls.find((c) => c[1] === "view_item");
    expect(ev).toBeDefined();
    for (const key of REQUIRED_GA4_PARAMS.view_item) {
      expect(ev![2]).toHaveProperty(key);
    }
  });

  it("add_to_cart canonical", () => {
    trackAddToCart("p1", "Cat Tree", 49.99, 1);
    expect(gtagCalls.some((c) => c[1] === "add_to_cart")).toBe(true);
  });

  it("view_cart canonical", () => {
    trackViewCart([{ item_id: "p1", item_name: "Cat Tree", price: 49.99, quantity: 1 }]);
    const ev = gtagCalls.find((c) => c[1] === "view_cart");
    expect(ev).toBeDefined();
    expect(ev![2]).toHaveProperty("currency", "USD");
    expect(ev![2]).toHaveProperty("value");
    expect(ev![2]).toHaveProperty("items");
  });

  it("remove_from_cart canonical", () => {
    trackRemoveFromCart("p1", "Cat Tree", 49.99, 1);
    expect(gtagCalls.some((c) => c[1] === "remove_from_cart")).toBe(true);
  });

  it("begin_checkout canonical", () => {
    sessionStorage.clear();
    trackBeginCheckout([sampleItem], 49.99);
    expect(gtagCalls.some((c) => c[1] === "begin_checkout")).toBe(true);
  });

  it("purchase canonical + idempotent", () => {
    localStorage.clear();
    const txn = `txn_${Date.now()}`;
    trackPurchase(txn, [sampleItem], 49.99);
    trackPurchase(txn, [sampleItem], 49.99); // duplicate suppressed
    const fired = gtagCalls.filter((c) => c[1] === "purchase");
    expect(fired.length).toBe(1);
    for (const key of REQUIRED_GA4_PARAMS.purchase) {
      expect(fired[0][2]).toHaveProperty(key);
    }
  });

  it("legacy aliases auto-resolve to canonical names via trackEvent", async () => {
    const { trackEvent } = await import("@/lib/analytics");
    trackEvent("cart" as string, { currency: "USD", value: 0, items: [] });
    trackEvent("order_completed" as string, { transaction_id: "x", currency: "USD", value: 1, items: [] });
    expect(gtagCalls.some((c) => c[1] === "view_cart")).toBe(true);
    expect(gtagCalls.some((c) => c[1] === "purchase")).toBe(true);
    // legacy names must NOT leak through
    expect(gtagCalls.some((c) => c[1] === "cart")).toBe(false);
    expect(gtagCalls.some((c) => c[1] === "order_completed")).toBe(false);
  });
});

describe("Internal DB mirror covers every ecommerce funnel step", () => {
  it("lpFunnelMirror MIRRORED_EVENTS contains all canonical ecommerce steps", async () => {
    // Read source file directly to assert at the contract layer without
    // depending on the (intentionally unexported) Set.
    const src = await import("fs").then((m) => m.readFileSync("src/lib/lpFunnelMirror.ts", "utf8"));
    for (const ev of ["view_item", "add_to_cart", "view_cart", "remove_from_cart", "begin_checkout", "purchase"]) {
      expect(src).toContain(`'${ev}'`);
    }
  });
});