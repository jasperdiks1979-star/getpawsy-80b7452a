import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  scoreAlgorithmSignals,
  auditWave,
  findUnsupportedClaims,
  type PinCandidate,
  type RecentPin,
} from "./pinterest-algorithm-signals.ts";
import { DOG_KEYWORD_CATALOG } from "./pinterest-keyword-seo.ts";

const kw = DOG_KEYWORD_CATALOG.find((k) => k.keyword === "elevated dog bed")!;

function makePin(overrides: Partial<PinCandidate> = {}): PinCandidate {
  const base: PinCandidate = {
    product: {
      name: "Elevated Cooling Dog Bed",
      slug: "elevated-cooling-dog-bed",
      description: "A raised, elevated cooling dog bed for large dogs. Breathable mesh.",
      category: "dog-beds",
      primary_species: "dog",
    },
    primary_keyword: kw,
    title: "Elevated Dog Bed for Cool Naps and Everyday Joint Support",
    description:
      "This elevated dog bed keeps your pup off hot floors with a breathable raised mesh that promotes airflow and supports large dogs. The elevated frame fits neatly in a dog room, holds up to daily use, and works for cool naps. Explore the full elevated dog bed design and see how it fits your space.",
    overlay: "Elevated Dog Bed",
    alt_text: "Beige elevated dog bed in a bright living room",
    board_title: "Dog Beds & Comfort",
    board_description: "Elevated, orthopedic and cozy dog beds for every home",
    destination_url: "https://getpawsy.pet/products/elevated-cooling-dog-bed?utm_source=pinterest&utm_medium=organic",
    pdp_h1: "Elevated Cooling Dog Bed",
    pdp_copy: "Elevated cooling dog bed with breathable mesh raised frame supports large dogs airflow naps joints design room space daily use fits pup floors cover cool full",
    intent: "product",
    image: {
      width: 1000, height: 1500, occupancy: 0.55, identity_confidence: 0.99,
      pdp_similarity: 0.98, is_collage: false, dominant_products: 1, phash: "abc",
    },
    trend: { direction: "rising", seasonality: 0.7 },
  };
  return { ...base, ...overrides, image: { ...base.image, ...(overrides.image ?? {}) } };
}

Deno.test("clean dog bed pin passes the publish gate", () => {
  const r = scoreAlgorithmSignals(makePin());
  assert(r.passes, `expected pass, got ${r.total} reasons=${r.reasons.join("|")}`);
  assert(r.total >= 90);
});

Deno.test("low identity confidence fails visual recognition gate", () => {
  const r = scoreAlgorithmSignals(makePin({ image: { width: 1000, height: 1500, occupancy: 0.55, identity_confidence: 0.90, pdp_similarity: 0.98, dominant_products: 1 } }));
  assert(!r.passes);
});

Deno.test("occupancy out of band flagged", () => {
  const r = scoreAlgorithmSignals(makePin({ image: { width: 1000, height: 1500, occupancy: 0.20, identity_confidence: 0.99, pdp_similarity: 0.98, dominant_products: 1 } }));
  assert(r.reasons.some((x) => x.startsWith("occupancy_out_of_band")));
});

Deno.test("unsupported claim orthopedic blocks publish", () => {
  const r = scoreAlgorithmSignals(makePin({ title: "Orthopedic Elevated Dog Bed for Big Dogs" }));
  assertEquals(r.unsupported_claims.includes("orthopedic"), true);
  assert(!r.passes);
});

Deno.test("wrong destination slug fails PDP alignment", () => {
  const r = scoreAlgorithmSignals(makePin({ destination_url: "https://getpawsy.pet/collections/dog?utm_source=pinterest" }));
  assert(!r.passes);
  assert(r.reasons.some((x) => x === "destination_slug_mismatch"));
});

Deno.test("duplicate phash in recent window kills freshness", () => {
  const recent: RecentPin[] = [{
    product_slug: "other", primary_keyword: "dog toys", title: "x", description: "y",
    board_title: "Dog Toys", phash: "abc", published_at: new Date().toISOString(),
  }];
  const r = scoreAlgorithmSignals(makePin(), recent);
  assert(r.reasons.includes("duplicate_phash"));
});

Deno.test("wave audit flags duplicate primary keyword", () => {
  const rep = auditWave([
    { product_slug: "a", primary_keyword: "elevated dog bed", intent: "product" },
    { product_slug: "b", primary_keyword: "elevated dog bed", intent: "planning" },
    { product_slug: "c", primary_keyword: "dog room ideas", intent: "inspiration" },
  ]);
  assertEquals(rep.duplicate_primary_keywords, ["elevated dog bed"]);
  assert(!rep.ok);
});

Deno.test("wave audit requires 3 intents for 3-pin waves", () => {
  const rep = auditWave([
    { product_slug: "a", primary_keyword: "k1", intent: "product" },
    { product_slug: "b", primary_keyword: "k2", intent: "product" },
    { product_slug: "c", primary_keyword: "k3", intent: "product" },
  ]);
  assertEquals(rep.missing_intents.sort(), ["inspiration", "planning"]);
});

Deno.test("clickbait tanks click potential", () => {
  const r = scoreAlgorithmSignals(makePin({ title: "Shocking elevated dog bed hack you won't believe" }));
  assert(r.reasons.includes("clickbait_detected"));
});

Deno.test("findUnsupportedClaims returns empty when PDP supports claim", () => {
  const claims = findUnsupportedClaims(makePin({
    title: "Washable elevated dog bed",
    pdp_copy: "Elevated washable dog bed with removable cover.",
  }));
  assertEquals(claims, []);
});
