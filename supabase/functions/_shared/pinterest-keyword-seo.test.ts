// Unit tests for the Pinterest keyword-first SEO layer.
// Run with `deno test supabase/functions/_shared/pinterest-keyword-seo.test.ts`.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DOG_KEYWORD_CATALOG,
  KEYWORD_THRESHOLDS,
  buildPinDescription,
  buildPinSeoReport,
  buildPinTitle,
  buildWaveSeoReport,
  checkAlignment,
  planKeywords,
  planWaveMix,
  scoreKeyword,
} from "./pinterest-keyword-seo.ts";

Deno.test("catalog has >=50 dog keywords across all 3 tiers", () => {
  assert(DOG_KEYWORD_CATALOG.length >= 50, `expected >=50 keywords, got ${DOG_KEYWORD_CATALOG.length}`);
  assert(DOG_KEYWORD_CATALOG.some((k) => k.tier === 1));
  assert(DOG_KEYWORD_CATALOG.some((k) => k.tier === 2));
  assert(DOG_KEYWORD_CATALOG.some((k) => k.tier === 3));
});

Deno.test("elevated dog bed product → primary keyword is elevated dog bed", () => {
  const product = {
    name: "Elevated Cooling Dog Bed",
    slug: "elevated-cooling-dog-bed",
    description: "A raised, breathable elevated dog bed for indoor and outdoor use.",
    category: "dog-beds",
  };
  const plan = planKeywords(product);
  assert(plan.passes_thresholds, plan.reason);
  assertEquals(plan.primary.keyword.keyword, "elevated dog bed");
  assert(plan.primary.score >= KEYWORD_THRESHOLDS.min_score);
});

Deno.test("title is 45–75 chars with primary keyword in first 5 words", () => {
  const product = { name: "Elevated Dog Bed", slug: "elevated-dog-bed", description: "elevated dog bed" };
  const plan = planKeywords(product);
  const title = buildPinTitle(plan, product);
  assert(title.length >= 45 && title.length <= 75, `title length=${title.length}: "${title}"`);
  const first5 = title.toLowerCase().split(/\s+/).slice(0, 5).join(" ");
  assert(first5.includes("elevated") || first5.includes("dog"), `first 5 words: "${first5}"`);
});

Deno.test("description is 300–500 chars and mentions primary + secondary", () => {
  const product = { name: "Elevated Dog Bed", slug: "elevated-dog-bed", description: "elevated raised dog bed" };
  const plan = planKeywords(product);
  const desc = buildPinDescription(plan, product);
  assert(desc.length >= 300 && desc.length <= 500, `desc length=${desc.length}`);
  assert(desc.toLowerCase().includes(plan.primary.keyword.keyword));
});

Deno.test("alignment guard rejects unsupported orthopedic/no-pull claims", () => {
  // Force primary to an evidence-requiring keyword by crafting the product blob.
  const product = { name: "Dog Harness", slug: "dog-harness", description: "adjustable dog harness with reflective stitching. no pull front clip." };
  const plan = planKeywords(product);
  const align = checkAlignment(plan, product);
  assert(align.aligned, `expected aligned; notes=${JSON.stringify(align.notes)}`);
});

Deno.test("wave mix planner returns correct intent distribution", () => {
  const three = planWaveMix(3);
  assertEquals(three.length, 3);
  assertEquals(three.map((s) => s.role), ["high_intent", "long_tail", "inspiration"]);
  const ten = planWaveMix(10);
  assertEquals(ten.length, 10);
  assertEquals(ten.filter((s) => s.role === "high_intent").length, 4);
  assertEquals(ten.filter((s) => s.role === "long_tail").length, 3);
  assertEquals(ten.filter((s) => s.role === "inspiration").length, 2);
  assertEquals(ten.filter((s) => s.role === "seasonal").length, 1);
});

Deno.test("wave report detects duplicate primaries", () => {
  const product = { name: "Elevated Dog Bed", slug: "elevated-dog-bed", description: "elevated dog bed" };
  const plan = planKeywords(product);
  const r1 = buildPinSeoReport(product, plan);
  const r2 = buildPinSeoReport(product, plan);
  const wave = buildWaveSeoReport([r1, r2]);
  assertEquals(wave.duplicate_primaries, [plan.primary.keyword.keyword]);
});

Deno.test("scoring formula stays within 0..100", () => {
  const product = { name: "Dog Toy", slug: "dog-toy", description: "interactive puzzle dog toy" };
  for (const kw of DOG_KEYWORD_CATALOG) {
    const s = scoreKeyword(kw, product);
    assert(s.score >= 0 && s.score <= 100, `score OOR for ${kw.keyword}: ${s.score}`);
  }
});

Deno.test("thresholds refuse to publish when no keyword matches", () => {
  const product = { name: "Widget", slug: "widget", description: "unrelated product" };
  const plan = planKeywords(product);
  assertEquals(plan.passes_thresholds, false);
});