// Hermetic selector regression suite.
// Pure module — no network, no Supabase, no provider calls, no queue writes.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
      product_id: `${species.padEnd(4, "x")}-${String(i).padStart(4, "0")}-0000-0000-000000000000`,
      slug: `${species}-slug-${i}`,
      primary_species: species,
      ...extra,
    }),
  );
}

Deno.test("S01 exact target mix cat=18 dog=18 other=9 when supply abundant", () => {
  const rows = [...makeMany(30, "cat"), ...makeMany(30, "dog"), ...makeMany(30, "both")];
  const r = selectReplacementRoundRobin45(rows);
  assertEquals(r.selected.length, 45);
  assertEquals(r.selected.filter((s) => s.species === "cat").length, 18);
  assertEquals(r.selected.filter((s) => s.species === "dog").length, 18);
  assertEquals(r.selected.filter((s) => s.species === "other").length, 9);
});

Deno.test("S02 dispatch order cat → dog → other → repeat", () => {
  const rows = [...makeMany(30, "cat"), ...makeMany(30, "dog"), ...makeMany(30, "both")];
  const r = selectReplacementRoundRobin45(rows);
  for (let i = 0; i < 9; i++) {
    assertEquals(r.selected[i * 3].species, "cat");
    assertEquals(r.selected[i * 3 + 1].species, "dog");
    assertEquals(r.selected[i * 3 + 2].species, "other");
  }
});

Deno.test("S03 first-12 has ≥4 cat, ≥4 dog, ≥2 other", () => {
  const rows = [...makeMany(30, "cat"), ...makeMany(30, "dog"), ...makeMany(30, "both")];
  const r = selectReplacementRoundRobin45(rows);
  assert(r.firstTwelveDistribution.cat >= 4);
  assert(r.firstTwelveDistribution.dog >= 4);
  assert(r.firstTwelveDistribution.other >= 2);
});

Deno.test("S04 other exhausted → redistribute across cat+dog", () => {
  const rows = [...makeMany(30, "cat"), ...makeMany(30, "dog"), ...makeMany(3, "both")];
  const r = selectReplacementRoundRobin45(rows);
  assertEquals(r.selected.filter((s) => s.species === "other").length, 3);
  assertEquals(r.selected.length, 45);
  assert(r.redistributedSlots >= 6);
});

Deno.test("S05 dog exhausted → cat + other absorb remainder", () => {
  const rows = [...makeMany(30, "cat"), ...makeMany(5, "dog"), ...makeMany(30, "both")];
  const r = selectReplacementRoundRobin45(rows);
  assertEquals(r.selected.filter((s) => s.species === "dog").length, 5);
  assertEquals(r.selected.length, 45);
});

Deno.test("S06 cat exhausted → dog + other absorb remainder", () => {
  const rows = [...makeMany(5, "cat"), ...makeMany(30, "dog"), ...makeMany(30, "both")];
  const r = selectReplacementRoundRobin45(rows);
  assertEquals(r.selected.filter((s) => s.species === "cat").length, 5);
  assertEquals(r.selected.length, 45);
});

Deno.test("S07 ambiguous unknown never enters other bucket", () => {
  const rows = [
    ...makeMany(10, "cat"),
    ...makeMany(10, "dog"),
    ...makeMany(5, "unknown"),
  ];
  const r = selectReplacementRoundRobin45(rows);
  assertEquals(r.selected.filter((s) => s.species === "other").length, 0);
  assertEquals(r.counts.species_unresolved, 5);
});

Deno.test("S08 unknown species → SPECIES_UNRESOLVED", () => {
  const rows = makeMany(3, "unknown");
  const r = selectReplacementRoundRobin45(rows);
  assertEquals(r.selected.length, 0);
  assert(r.rejected.every((x) => x.reason === "SPECIES_UNRESOLVED"));
});

Deno.test("S09 duplicate product_id dropped", () => {
  const id = "abc00000-0000-0000-0000-000000000001";
  const a = baseRow({ product_id: id, slug: "s1" });
  const b = baseRow({ product_id: id, slug: "s1b" });
  const r = selectReplacementRoundRobin45([a, b]);
  assertEquals(r.selected.filter((s) => s.product_id === id).length, 1);
});

Deno.test("S10 duplicate slug removed; canonical winner kept", () => {
  const a = baseRow({ slug: "twin", cache_tier_a: true, us_stock: 5, product_id: "aaaa-0001-0000-0000-000000000000" });
  const b = baseRow({ slug: "twin", cache_tier_a: false, us_stock: 500, product_id: "bbbb-0001-0000-0000-000000000000" });
  const r = selectReplacementRoundRobin45([a, b]);
  assertEquals(r.selected.filter((s) => s.slug === "twin").length, 1);
  assertEquals(r.selected[0].product_id, a.product_id);
});

Deno.test("S11 duplicate source_hash collapses to one", () => {
  const h = "hash_shared_xyz";
  const a = baseRow({ hero_hash: h, slug: "a1", cache_tier_a: true });
  const b = baseRow({ hero_hash: h, slug: "b2", cache_tier_a: false });
  const r = selectReplacementRoundRobin45([a, b]);
  assertEquals(r.selected.filter((s) => s.source_image_hash === h).length, 1);
});

Deno.test("S12 canonical duplicate keeps strongest record", () => {
  const cid = "canonical-id";
  const a = baseRow({ canonical_product_id: cid, is_us_warehouse: false, slug: "a" });
  const b = baseRow({ canonical_product_id: cid, is_us_warehouse: true, slug: "b" });
  const r = selectReplacementRoundRobin45([a, b]);
  assertEquals(r.selected.length, 1);
  assertEquals(r.selected[0].product_id, b.product_id);
});

Deno.test("S13 active/in-stock/US filters exclude bad rows", () => {
  const rows = [
    baseRow({ is_active: false }),
    baseRow({ us_stock: 0, stock: 0 }),
    baseRow({ is_us_warehouse: false }),
    baseRow({ price_usd: null }),
  ];
  const r = selectReplacementRoundRobin45(rows);
  assertEquals(r.selected.length, 0);
});

Deno.test("S14 policy-sensitive excluded", () => {
  const r = selectReplacementRoundRobin45([baseRow({ policy_unsafe: true })]);
  assertEquals(r.selected.length, 0);
  assertEquals(r.counts.policy_excluded, 1);
});

Deno.test("S15 active queue row excludes product", () => {
  const r = selectReplacementRoundRobin45([baseRow({ in_active_queue: true })]);
  assertEquals(r.selected.length, 0);
  assertEquals(r.rejected[0].reason, "already_queued");
});

Deno.test("S16 recent publication cooldown excludes", () => {
  const r = selectReplacementRoundRobin45([baseRow({ recently_published: true })]);
  assertEquals(r.selected.length, 0);
});

Deno.test("S17 permanent unchanged-hash reject excluded", () => {
  const r = selectReplacementRoundRobin45([baseRow({ cache_rejected_hash_match: true })]);
  assertEquals(r.selected.length, 0);
  assertEquals(r.counts.permanent_hash_rejects, 1);
});

Deno.test("S18 changed hash allows reconsideration", () => {
  const r = selectReplacementRoundRobin45([
    baseRow({ cache_rejected_hash_match: false, hero_hash: "new-hash" }),
  ]);
  assertEquals(r.selected.length, 1);
});

Deno.test("S19+S20 Tier A > Tier B > unscored within bucket", () => {
  const tierA = baseRow({ primary_species: "cat", cache_tier_a: true, slug: "a", product_id: "1111-a" });
  const tierB = baseRow({ primary_species: "cat", cache_tier_b: true, slug: "b", product_id: "2222-b" });
  const un = baseRow({ primary_species: "cat", slug: "c", product_id: "3333-c" });
  const r = selectReplacementRoundRobin45([un, tierB, tierA]);
  assertEquals(r.selected[0].product_id, tierA.product_id);
  assertEquals(r.selected[1].product_id, tierB.product_id);
  assertEquals(r.selected[2].product_id, un.product_id);
});

Deno.test("S21 unscored candidate is never marked visually ready", () => {
  const r = selectReplacementRoundRobin45([baseRow({ primary_species: "cat" })]);
  assertEquals(r.selected[0].cache_status, "UNSCORED_ELIGIBLE");
});

Deno.test("S22+S23 deterministic identical output on identical input", () => {
  const rows = [...makeMany(10, "cat"), ...makeMany(10, "dog"), ...makeMany(5, "both")];
  const a = selectReplacementRoundRobin45(rows).selected.map((s) => s.product_id);
  const b = selectReplacementRoundRobin45(rows).selected.map((s) => s.product_id);
  assertEquals(a, b);
});

Deno.test("S24 fewer than 45 valid → truthful partial set with unfilledSlots", () => {
  const rows = [...makeMany(3, "cat"), ...makeMany(3, "dog")];
  const r = selectReplacementRoundRobin45(rows);
  assertEquals(r.selected.length, 6);
  assertEquals(r.unfilledSlots, 39);
});

Deno.test("S25+S26 ordinals unique and sequential starting at 1", () => {
  const rows = [...makeMany(5, "cat"), ...makeMany(5, "dog"), ...makeMany(5, "both")];
  const r = selectReplacementRoundRobin45(rows);
  const ords = r.selected.map((s) => s.ordinal);
  assertEquals(ords, ords.map((_, i) => i + 1));
});

Deno.test("S27 replay = same product ids (idempotent snapshot)", () => {
  const rows = [...makeMany(20, "cat"), ...makeMany(20, "dog"), ...makeMany(10, "both")];
  const a = selectReplacementRoundRobin45(rows);
  const b = selectReplacementRoundRobin45(rows);
  assertEquals(
    a.selected.map((s) => s.product_id),
    b.selected.map((s) => s.product_id),
  );
});

Deno.test("S28+S29+S30 selector is pure — no IO/network/queue imports", async () => {
  const src = await Deno.readTextFile(new URL("./selector.ts", import.meta.url));
  assert(!/\bfetch\s*\(/.test(src), "selector must not call fetch");
  assert(!/from\s+['"]https?:\/\//.test(src), "selector must not import remote URLs");
  assert(!/supabase/i.test(src), "selector must not import supabase");
  assert(!/pinterest\.com/i.test(src), "selector must not touch pinterest api");
});

Deno.test("S-cfg defaults 18/18/9/45", () => {
  assertEquals(DEFAULT_SELECTOR_CONFIG.targetCat, 18);
  assertEquals(DEFAULT_SELECTOR_CONFIG.targetDog, 18);
  assertEquals(DEFAULT_SELECTOR_CONFIG.targetOther, 9);
  assertEquals(DEFAULT_SELECTOR_CONFIG.totalMax, 45);
});
