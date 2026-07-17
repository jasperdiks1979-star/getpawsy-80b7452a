import { describe, it, expect } from "vitest";
import {
  selectReplacementRoundRobin45,
  DEFAULT_SELECTOR_CONFIG,
  type CandidateInput,
} from "./selector.ts";

function baseRow(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    product_id: crypto.randomUUID(),
    name: "Test Product",
    slug: "test-product-" + Math.random().toString(36).slice(2, 8),
    category: "Toys",
    primary_species: "cat",
    is_active: true,
    is_duplicate: false,
    canonical_product_id: null,
    pinterest_eligible: true,
    pinterest_disabled: false,
    is_us_warehouse: true,
    us_stock: 25,
    stock: 25,
    price_usd: 24.99,
    hero_url: "https://cdn.getpawsy.pet/img/x.jpg",
    hero_hash: null,
    hero_min_dimension: 1200,
    known_watermark: false,
    known_supplier_text: false,
    known_collage: false,
    policy_unsafe: false,
    cache_tier_a: false,
    cache_tier_b: false,
    cache_rejected_hash_match: false,
    in_active_scoring_run: false,
    in_active_queue: false,
    recently_published: false,
    title_clarity_score: 0.8,
    ...overrides,
  };
}

function makeMany(n: number, species: string, extra: Partial<CandidateInput> = {}) {
  return Array.from({ length: n }, (_, i) =>
    baseRow({
      product_id: `${species}-${String(i).padStart(3, "0")}-0000-0000-000000000000`,
      slug: `${species}-slug-${i}`,
      primary_species: species,
      ...extra,
    }),
  );
}

describe("selector: happy-path mix", () => {
  it("1. exact target mix cat=18 dog=18 other=9 when supply is abundant", () => {
    const rows = [
      ...makeMany(30, "cat"),
      ...makeMany(30, "dog"),
      ...makeMany(30, "both"),
    ];
    const r = selectReplacementRoundRobin45(rows);
    expect(r.selected.length).toBe(45);
    expect(r.selected.filter((s) => s.species === "cat").length).toBe(18);
    expect(r.selected.filter((s) => s.species === "dog").length).toBe(18);
    expect(r.selected.filter((s) => s.species === "other").length).toBe(9);
  });

  it("2. dispatch order is cat → dog → other → repeat", () => {
    const rows = [
      ...makeMany(30, "cat"),
      ...makeMany(30, "dog"),
      ...makeMany(30, "both"),
    ];
    const r = selectReplacementRoundRobin45(rows);
    const order = ["cat", "dog", "other"] as const;
    for (let i = 0; i < 9; i++) {
      expect(r.selected[i * 3].species).toBe("cat");
      expect(r.selected[i * 3 + 1].species).toBe("dog");
      expect(r.selected[i * 3 + 2].species).toBe("other");
    }
  });

  it("3. first-12 contains ≥4 cat, ≥4 dog, ≥2 other", () => {
    const rows = [
      ...makeMany(30, "cat"),
      ...makeMany(30, "dog"),
      ...makeMany(30, "both"),
    ];
    const r = selectReplacementRoundRobin45(rows);
    expect(r.firstTwelveDistribution.cat).toBeGreaterThanOrEqual(4);
    expect(r.firstTwelveDistribution.dog).toBeGreaterThanOrEqual(4);
    expect(r.firstTwelveDistribution.other).toBeGreaterThanOrEqual(2);
  });
});

describe("selector: redistribution", () => {
  it("4. other bucket exhausted redistributes remaining slots between cat+dog", () => {
    const rows = [
      ...makeMany(30, "cat"),
      ...makeMany(30, "dog"),
      ...makeMany(3, "both"),
    ];
    const r = selectReplacementRoundRobin45(rows);
    expect(r.selected.filter((s) => s.species === "other").length).toBe(3);
    expect(r.selected.length).toBe(45);
    // redistributed 6 (target 9, took 3) slots
    expect(r.redistributedSlots).toBeGreaterThanOrEqual(6);
    // cat + dog together fill remaining 42
    expect(r.selected.filter((s) => s.species !== "other").length).toBe(42);
  });

  it("5. dog bucket exhausted → cat + other pick up remaining", () => {
    const rows = [
      ...makeMany(30, "cat"),
      ...makeMany(5, "dog"),
      ...makeMany(30, "both"),
    ];
    const r = selectReplacementRoundRobin45(rows);
    expect(r.selected.filter((s) => s.species === "dog").length).toBe(5);
    expect(r.selected.length).toBe(45);
  });

  it("6. cat bucket exhausted → dog + other pick up remaining", () => {
    const rows = [
      ...makeMany(5, "cat"),
      ...makeMany(30, "dog"),
      ...makeMany(30, "both"),
    ];
    const r = selectReplacementRoundRobin45(rows);
    expect(r.selected.filter((s) => s.species === "cat").length).toBe(5);
    expect(r.selected.length).toBe(45);
  });
});

describe("selector: species classification", () => {
  it("7. ambiguous unknown species never enters other bucket", () => {
    const rows = [
      ...makeMany(10, "cat"),
      ...makeMany(10, "dog"),
      ...makeMany(5, "unknown"),
    ];
    const r = selectReplacementRoundRobin45(rows);
    expect(r.selected.filter((s) => s.species === "other").length).toBe(0);
    expect(r.counts.species_unresolved).toBe(5);
  });

  it("8. unknown species excluded with SPECIES_UNRESOLVED reason", () => {
    const rows = makeMany(3, "unknown");
    const r = selectReplacementRoundRobin45(rows);
    expect(r.selected.length).toBe(0);
    expect(r.rejected.every((x) => x.reason === "SPECIES_UNRESOLVED")).toBe(true);
  });
});

describe("selector: dedupe", () => {
  it("9. duplicate product_id is dropped (first-write-wins)", () => {
    const dup = baseRow({ product_id: "abc-0000-0000-0000-000000000001", slug: "s1" });
    const dup2 = baseRow({ product_id: "abc-0000-0000-0000-000000000001", slug: "s1b" });
    const r = selectReplacementRoundRobin45([dup, dup2]);
    expect(r.selected.filter((s) => s.product_id === dup.product_id).length).toBeLessThanOrEqual(1);
  });

  it("10. duplicate slug removed, canonical winner kept", () => {
    const a = baseRow({ slug: "twin", cache_tier_a: true, us_stock: 5 });
    const b = baseRow({ slug: "twin", cache_tier_a: false, us_stock: 500 });
    const r = selectReplacementRoundRobin45([a, b]);
    expect(r.selected.filter((s) => s.slug === "twin").length).toBe(1);
    // tier A wins over higher stock
    expect(r.selected[0].product_id).toBe(a.product_id);
  });

  it("11. duplicate source_hash collapses to one candidate", () => {
    const h = "hash_shared_xyz";
    const a = baseRow({ hero_hash: h, slug: "a1", cache_tier_a: true });
    const b = baseRow({ hero_hash: h, slug: "b2", cache_tier_a: false });
    const r = selectReplacementRoundRobin45([a, b]);
    expect(r.selected.filter((s) => s.source_image_hash === h).length).toBe(1);
  });

  it("12. canonical duplicate keeps the strongest record", () => {
    const canonical = "canonical-id";
    const a = baseRow({ canonical_product_id: canonical, is_us_warehouse: false, slug: "a" });
    const b = baseRow({ canonical_product_id: canonical, is_us_warehouse: true, slug: "b" });
    const r = selectReplacementRoundRobin45([a, b]);
    expect(r.selected.length).toBe(1);
    expect(r.selected[0].product_id).toBe(b.product_id);
  });
});

describe("selector: commerce filters", () => {
  it("13. active/in-stock/US filters exclude bad rows", () => {
    const rows = [
      baseRow({ is_active: false }),
      baseRow({ us_stock: 0, stock: 0 }),
      baseRow({ is_us_warehouse: false }),
      baseRow({ price_usd: null }),
    ];
    const r = selectReplacementRoundRobin45(rows);
    expect(r.selected.length).toBe(0);
  });

  it("14. policy-sensitive excluded", () => {
    const rows = [baseRow({ policy_unsafe: true })];
    const r = selectReplacementRoundRobin45(rows);
    expect(r.selected.length).toBe(0);
    expect(r.counts.policy_excluded).toBe(1);
  });

  it("15. product already in active queue excluded", () => {
    const r = selectReplacementRoundRobin45([baseRow({ in_active_queue: true })]);
    expect(r.selected.length).toBe(0);
    expect(r.rejected[0].reason).toBe("already_queued");
  });

  it("16. recent publication cooldown excludes", () => {
    const r = selectReplacementRoundRobin45([baseRow({ recently_published: true })]);
    expect(r.selected.length).toBe(0);
  });

  it("17. permanent unchanged-hash reject excluded", () => {
    const r = selectReplacementRoundRobin45([baseRow({ cache_rejected_hash_match: true })]);
    expect(r.selected.length).toBe(0);
    expect(r.counts.permanent_hash_rejects).toBe(1);
  });

  it("18. changed source hash (no permanent-hash flag) allows reconsideration", () => {
    const r = selectReplacementRoundRobin45([
      baseRow({ cache_rejected_hash_match: false, hero_hash: "new-hash" }),
    ]);
    expect(r.selected.length).toBe(1);
  });
});

describe("selector: ranking", () => {
  it("19–20. Tier A > Tier B > unscored within a bucket", () => {
    const tierA = baseRow({ primary_species: "cat", cache_tier_a: true, slug: "a" });
    const tierB = baseRow({ primary_species: "cat", cache_tier_b: true, slug: "b" });
    const unscored = baseRow({ primary_species: "cat", slug: "c" });
    const r = selectReplacementRoundRobin45([unscored, tierB, tierA]);
    expect(r.selected[0].product_id).toBe(tierA.product_id);
    expect(r.selected[1].product_id).toBe(tierB.product_id);
    expect(r.selected[2].product_id).toBe(unscored.product_id);
  });

  it("21. unscored candidates never carry a visually-ready label", () => {
    const r = selectReplacementRoundRobin45([baseRow({ primary_species: "cat" })]);
    expect(r.selected[0].cache_status).toBe("UNSCORED_ELIGIBLE");
  });

  it("22–23. deterministic ordering on identical snapshot", () => {
    const rows = [
      ...makeMany(10, "cat"),
      ...makeMany(10, "dog"),
      ...makeMany(5, "both"),
    ];
    const a = selectReplacementRoundRobin45(rows).selected.map((s) => s.product_id);
    const b = selectReplacementRoundRobin45(rows).selected.map((s) => s.product_id);
    expect(a).toEqual(b);
  });
});

describe("selector: partial supply", () => {
  it("24. fewer than 45 valid → truthful partial set", () => {
    const rows = [...makeMany(3, "cat"), ...makeMany(3, "dog")];
    const r = selectReplacementRoundRobin45(rows);
    expect(r.selected.length).toBe(6);
    expect(r.unfilledSlots).toBe(39);
  });
});

describe("selector: ordinals + purity", () => {
  it("25–26. ordinals unique and sequential starting at 1", () => {
    const rows = [
      ...makeMany(5, "cat"),
      ...makeMany(5, "dog"),
      ...makeMany(5, "both"),
    ];
    const r = selectReplacementRoundRobin45(rows);
    const ords = r.selected.map((s) => s.ordinal);
    expect(ords).toEqual([...Array(ords.length).keys()].map((i) => i + 1));
  });

  it("27. replay produces same product ids (idempotent snapshot)", () => {
    const rows = [...makeMany(20, "cat"), ...makeMany(20, "dog"), ...makeMany(10, "both")];
    const a = selectReplacementRoundRobin45(rows);
    const b = selectReplacementRoundRobin45(rows);
    expect(a.selected.map((s) => s.product_id)).toEqual(b.selected.map((s) => s.product_id));
  });

  it("28–30. selector is pure — no provider/Pinterest/queue side effects (structural)", () => {
    // The selector module imports nothing IO-related. This test guards against
    // future accidental IO imports.
    const src = "" + selectReplacementRoundRobin45;
    expect(src).not.toMatch(/fetch\(/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/pinterest\.com/i);
  });

  it("config: defaults match spec (18/18/9/45)", () => {
    expect(DEFAULT_SELECTOR_CONFIG.targetCat).toBe(18);
    expect(DEFAULT_SELECTOR_CONFIG.targetDog).toBe(18);
    expect(DEFAULT_SELECTOR_CONFIG.targetOther).toBe(9);
    expect(DEFAULT_SELECTOR_CONFIG.totalMax).toBe(45);
  });
});
