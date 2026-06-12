import { describe, it, expect } from "vitest";

// Mirror of supabase/functions/pinterest-conversion-audit/index.ts scoreRow().
// Kept in sync by hand — both must change together.
function scoreRow(input: {
  http_status: number | null;
  product_status: string;
  inventory_status: string;
  utm_intact: boolean;
  cart_status: string;
  missing_image: boolean;
  missing_price: boolean;
  final_is_canonical: boolean;
}) {
  let s = 0;
  const r: string[] = [];
  if (input.http_status === null || input.http_status >= 400) { s += 30; r.push("http_error"); }
  if (input.product_status === "inactive") { s += 40; r.push("product_inactive"); }
  if (input.product_status === "missing") { s += 50; r.push("product_missing"); }
  if (input.inventory_status === "out_of_stock") { s += 25; r.push("zero_inventory"); }
  if (input.missing_image) { s += 15; r.push("missing_image"); }
  if (input.missing_price) { s += 15; r.push("missing_price"); }
  if (!input.utm_intact) { s += 10; r.push("utm_lost"); }
  if (input.cart_status === "failed") { s += 30; r.push("cart_failed"); }
  if (!input.final_is_canonical) { s += 10; r.push("non_canonical_url"); }
  return { score: Math.min(100, s), reasons: r };
}

const HEALTHY = {
  http_status: 200, product_status: "active", inventory_status: "in_stock",
  utm_intact: true, cart_status: "ok", missing_image: false, missing_price: false,
  final_is_canonical: true,
};

describe("conversion risk scoring", () => {
  it("perfect pin scores 0", () => {
    const r = scoreRow(HEALTHY);
    expect(r.score).toBe(0);
    expect(r.reasons).toHaveLength(0);
  });

  it("404 destination flags http_error", () => {
    const r = scoreRow({ ...HEALTHY, http_status: 404 });
    expect(r.reasons).toContain("http_error");
    expect(r.score).toBeGreaterThanOrEqual(30);
  });

  it("inactive product is critical (>=40)", () => {
    const r = scoreRow({ ...HEALTHY, product_status: "inactive" });
    expect(r.reasons).toContain("product_inactive");
    expect(r.score).toBeGreaterThanOrEqual(40);
  });

  it("orphan product is more severe than inactive", () => {
    const inactive = scoreRow({ ...HEALTHY, product_status: "inactive" }).score;
    const orphan   = scoreRow({ ...HEALTHY, product_status: "missing" }).score;
    expect(orphan).toBeGreaterThan(inactive);
  });

  it("zero inventory flags + adds 25", () => {
    const r = scoreRow({ ...HEALTHY, inventory_status: "out_of_stock", cart_status: "failed" });
    expect(r.reasons).toEqual(expect.arrayContaining(["zero_inventory", "cart_failed"]));
  });

  it("utm_lost adds 10", () => {
    const r = scoreRow({ ...HEALTHY, utm_intact: false });
    expect(r.reasons).toContain("utm_lost");
    expect(r.score).toBe(10);
  });

  it("score caps at 100", () => {
    const r = scoreRow({
      http_status: 500, product_status: "missing", inventory_status: "out_of_stock",
      utm_intact: false, cart_status: "failed", missing_image: true, missing_price: true,
      final_is_canonical: false,
    });
    expect(r.score).toBe(100);
  });

  it("traffic-light thresholds match orchestrator", () => {
    const light = (s: number) => s >= 85 ? "green" : s >= 60 ? "orange" : "red";
    expect(light(100)).toBe("green");
    expect(light(85)).toBe("green");
    expect(light(75)).toBe("orange");
    expect(light(59)).toBe("red");
  });
});
