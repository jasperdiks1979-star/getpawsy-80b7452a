import { assert, assertEquals, assertFalse, assertMatch, assertNotMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  auditLayout, auditUrl, b64UrlEncode, buildCloudinaryUrl, fitText,
  parsePngDimensions, plan, sha256Hex, storageKey,
  validateBenefit, validateCta, validateHeadline,
} from "./compositor.ts";
import { CANVAS, LAYOUTS, occupancy, overlaps } from "./layouts.ts";

const RUN = "11111111-2222-3333-4444-555555555555";
const PROD = "b7133bed-107c-4463-8277-1bd8ba7d9b94";
const SRC = "https://cdn.example.com/img/dog-carrier.jpg";
const SRC_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function goodReq(overrides: Record<string, unknown> = {}) {
  return {
    runId: RUN, productId: PROD, sourceUrl: SRC,
    expectedSourceHash: SRC_HASH, actualSourceHash: SRC_HASH,
    headline: "Dog Carrier Backpack",
    benefit: "Hands-Free Travel With Your Pet",
    cta: "View Product",
    layout: "editorial_hero" as const,
    ...overrides,
  };
}

// 1. exact source hash passes
Deno.test("1: exact source hash passes", () => {
  const p = plan(goodReq());
  assert(p.ok, p.reason);
});

// 2. wrong source hash rejects
Deno.test("2: wrong source hash rejects", () => {
  const p = plan(goodReq({ actualSourceHash: "b".repeat(64) }));
  assertFalse(p.ok); assertEquals(p.reason, "source_hash_mismatch");
});

// 3. source decode failure surfaces (integration-level; here: unknown layout)
Deno.test("3: unknown layout rejects", () => {
  const p = plan(goodReq({ layout: "not_a_layout" as unknown as "editorial_hero" }));
  assertFalse(p.ok); assertEquals(p.reason, "unknown_layout");
});

// 4. canvas is exactly 1200x1800
Deno.test("4: canvas is 1200x1800", () => {
  assertEquals(CANVAS.w, 1200);
  assertEquals(CANVAS.h, 1800);
});

// 5. aspect ratio preserved (c_fit on product)
Deno.test("5: product layer uses c_fit only (aspect preserved)", () => {
  const p = plan(goodReq()); assert(p.ok);
  assertMatch(p.cloudinaryUrl!, /w_\d+,h_\d+,c_fit,f_png/);
  assertNotMatch(p.cloudinaryUrl!, /c_fill|c_crop|c_thumb|c_scale/);
});

// 6. product pixels not regenerated — no AI provider identifiers in URL
Deno.test("6: no AI provider identifiers in URL", () => {
  const p = plan(goodReq()); assert(p.ok);
  assertNotMatch(p.cloudinaryUrl!, /gemini|openai|lovable\.dev|ai\.gateway/i);
});

// 7. product occupancy in configured range for every layout
Deno.test("7: every layout occupancy inside configured range", () => {
  for (const L of Object.values(LAYOUTS)) {
    const occ = occupancy(L.productBox);
    assert(occ >= L.targetOccupancy[0] && occ <= L.targetOccupancy[1],
      `${L.key} occ=${occ.toFixed(3)} outside ${L.targetOccupancy.join("-")}`);
  }
});

// 8. text boxes do not overlap product in every layout
Deno.test("8: text does not overlap product", () => {
  for (const L of Object.values(LAYOUTS)) {
    assertFalse(overlaps(L.headlineBox, L.productBox), `${L.key} headline overlaps`);
    assertFalse(overlaps(L.benefitBox, L.productBox), `${L.key} benefit overlaps`);
    assertFalse(overlaps(L.ctaBox, L.productBox), `${L.key} cta overlaps`);
  }
});

// 9. text overflow rejects
Deno.test("9: text overflow rejects", () => {
  const p = plan(goodReq({ headline: "Longwordthatcannotwrapatallevernope" }));
  assertFalse(p.ok); assertEquals(p.reason, "headline_text_overflow");
});

// 10. each layout builds deterministically (same input → same URL)
Deno.test("10: layout URL determinism", () => {
  for (const key of Object.keys(LAYOUTS) as (keyof typeof LAYOUTS)[]) {
    const a = plan(goodReq({ layout: key }));
    const b = plan(goodReq({ layout: key }));
    assert(a.ok && b.ok);
    assertEquals(a.cloudinaryUrl, b.cloudinaryUrl);
    assertEquals(a.storagePath, b.storagePath);
  }
});

// 11. replay is idempotent (storage path stable per input)
Deno.test("11: storage path stable per input", () => {
  const k1 = storageKey(RUN, PROD, "editorial_hero", SRC_HASH);
  const k2 = storageKey(RUN, PROD, "editorial_hero", SRC_HASH);
  assertEquals(k1, k2);
});

// 12. output hash function stable
Deno.test("12: sha256 stable", async () => {
  const b = new TextEncoder().encode("hello");
  const h1 = await sha256Hex(b);
  const h2 = await sha256Hex(b);
  assertEquals(h1, h2);
  assertEquals(h1.length, 64);
});

// 13-15. no AI, no provider, no pinterest imports
Deno.test("13-15: no banned imports in module source", async () => {
  const banned = [
    "gemini", "openai", "@lovable/ai", "ai.gateway.lovable.dev",
    "api.pinterest", "api-sandbox.pinterest",
    "pinterest-creative-director",
    "google/gemini",
  ];
  const files = [
    "supabase/functions/pinterest-deterministic-compositor/index.ts",
    "supabase/functions/pinterest-deterministic-compositor/compositor.ts",
    "supabase/functions/pinterest-deterministic-compositor/layouts.ts",
  ];
  for (const f of files) {
    const src = await Deno.readTextFile(f);
    for (const b of banned) {
      assertNotMatch(src, new RegExp(b.replace(/[.\/]/g, "\\$&"), "i"),
        `banned identifier '${b}' found in ${f}`);
    }
  }
});

// 16. storage upload failure returns failure (validated at runtime; here: hash mismatch path)
Deno.test("16: hash mismatch prevents any downstream", () => {
  const p = plan(goodReq({ actualSourceHash: "0".repeat(64) }));
  assertFalse(p.ok);
  assertEquals(p.cloudinaryUrl, undefined);
  assertEquals(p.storagePath, undefined);
});

// 17. queue row is not created on failure — index.ts has no queue insert code at all
Deno.test("17: index.ts contains no pinterest_pin_queue insert", async () => {
  const src = await Deno.readTextFile("supabase/functions/pinterest-deterministic-compositor/index.ts");
  assertNotMatch(src, /pinterest_pin_queue/i);
  assertNotMatch(src, /\.insert\(/);
});

// 18. unsupported claim text rejected
Deno.test("18: banned-claim headline rejected", () => {
  const p = plan(goodReq({ headline: "Vet Approved Dog Carrier" }));
  assertFalse(p.ok);
  assert(p.reason?.startsWith("headline:banned_claim"));
});

// 19. long headline rejected
Deno.test("19: >6 word headline rejected", () => {
  const p = plan(goodReq({ headline: "This Is A Seven Word Long Headline" }));
  assertFalse(p.ok);
  assertEquals(p.reason, "headline:headline_over_6_words");
});

// 20. Unicode text encodes without corruption
Deno.test("20: unicode headline encodes safely", () => {
  // Approved headlines have ≤6 words. Use a short one with unicode.
  const p = plan(goodReq({ headline: "Café Für Hunde" }));
  assert(p.ok, p.reason);
  // Encoded percent-encoded UTF-8: é = %C3%A9 → double-encoded %25C3%25A9
  assertMatch(p.cloudinaryUrl!, /%25C3%25A9/);
});

// 21. only allowlisted transform tokens present
Deno.test("21: URL audit passes (no banned transforms)", () => {
  for (const key of Object.keys(LAYOUTS) as (keyof typeof LAYOUTS)[]) {
    const p = plan(goodReq({ layout: key }));
    assert(p.ok);
    const a = auditUrl(p.cloudinaryUrl!);
    assert(a.ok, `layout ${key} banned tokens: ${a.violations.join(",")}`);
  }
});

// 22. arbitrary transform injection rejected — sourceUrl scheme must be https
Deno.test("22: non-https source rejected", () => {
  const p = plan(goodReq({ sourceUrl: "http://evil.example/x.jpg" }));
  assertFalse(p.ok);
  assertMatch(p.reason || "", /source_not_https/);
  // Also verify buildCloudinaryUrl throws on non-https/malicious schemes.
  let threw = false;
  try {
    buildCloudinaryUrl({
      sourceUrl: "javascript:alert(1)",
      layout: LAYOUTS.editorial_hero,
      headlineLines: ["a"], headlineSize: 80,
      benefitLines: ["b"], benefitSize: 40,
      ctaText: "View Product", ctaSize: 40,
    });
  } catch (e) {
    threw = true; assertMatch(String(e), /source_not_https/);
  }
  assert(threw);
});

// 23. source URL is appended raw (Cloudinary /image/fetch/ contract)
Deno.test("23: source URL is appended after transforms", () => {
  const p = plan(goodReq()); assert(p.ok);
  assert(p.cloudinaryUrl!.endsWith("/" + SRC));
  // b64UrlEncode is still exported and used by l_fetch layers elsewhere.
  assertEquals(b64UrlEncode("a"), "YQ");
});

// 24. apostrophes and unicode escape safely
Deno.test("24: apostrophe headline encoded safely", () => {
  const p = plan(goodReq({ headline: "Owner's Choice", benefit: "Made For Every Walk" }));
  assert(p.ok, p.reason);
  // "'" (0x27) → %27 → %2527 (double-encoded)
  assertMatch(p.cloudinaryUrl!, /%2527/);
});

// 25. product layer contains no tint/recolor/filter tokens
Deno.test("25: product layer has no tint/recolor/filter", () => {
  const p = plan(goodReq()); assert(p.ok);
  // Extract the very first transform segment (product layer).
  const m = p.cloudinaryUrl!.match(/\/image\/fetch\/([^/]+)\//);
  assert(m, "no first segment");
  const seg = m![1];
  for (const banned of ["e_", "co_rgb", "o_", "a_", "r_"]) {
    assert(!seg.includes(banned), `product layer contains ${banned}: ${seg}`);
  }
});

// 26. c_fill never appears
Deno.test("26: c_fill never appears anywhere", () => {
  for (const key of Object.keys(LAYOUTS) as (keyof typeof LAYOUTS)[]) {
    const p = plan(goodReq({ layout: key }));
    assert(p.ok);
    assertNotMatch(p.cloudinaryUrl!, /c_fill/);
  }
});

// 27. public asset HTTP 200 — deferred to live canary
Deno.test("27: public asset URL shape matches supabase public storage", () => {
  const p = plan(goodReq()); assert(p.ok);
  assertMatch(p.storagePath!, /^deterministic\/[0-9a-f-]+\/[0-9a-f-]+\/[a-z_]+-[0-9a-f]{12}\.png$/);
});

// 28. storage replay uses identical key
Deno.test("28: replay produces identical storage key", () => {
  const a = plan(goodReq());
  const b = plan(goodReq());
  assertEquals(a.storagePath, b.storagePath);
});

// 29. wrong output dimensions detected via parsePngDimensions
Deno.test("29: parsePngDimensions correctly reads a synthesized IHDR", () => {
  const bytes = new Uint8Array(24);
  bytes.set([137,80,78,71,13,10,26,10]);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(16, 1200); dv.setUint32(20, 1800);
  const d = parsePngDimensions(bytes);
  assertEquals(d.w, 1200); assertEquals(d.h, 1800);
});

// 30. non-PNG output rejects
Deno.test("30: parsePngDimensions rejects non-PNG", () => {
  const bytes = new Uint8Array(24); bytes.set([1,2,3,4]);
  let threw = false;
  try { parsePngDimensions(bytes); } catch { threw = true; }
  assert(threw);
});

// Extra: layout audit sweep
Deno.test("audit: all six layouts pass auditLayout", () => {
  for (const L of Object.values(LAYOUTS)) {
    const a = auditLayout(L);
    assert(a.ok, `${L.key}: ${a.issues.join(",")}`);
  }
});

// Extra: CTA allowlist
Deno.test("cta: unapproved CTA rejected", () => {
  assertEquals(validateCta("Buy Now Cheap").ok, false);
  assertEquals(validateCta("View Product").ok, true);
});

// Extra: fit text picks largest font that fits
Deno.test("fit: picks largest font that fits", () => {
  const f = fitText("Dog Carrier Backpack", "georgia_bold", 1000, 2, 96, 60);
  assert(f.ok);
  assert(f.fontSize >= 60 && f.fontSize <= 96);
});

// Validate approved headline/benefit
Deno.test("validators: canary strings accepted", () => {
  assert(validateHeadline("Dog Carrier Backpack").ok);
  assert(validateBenefit("Hands-Free Travel With Your Pet").ok);
  assert(validateCta("View Product").ok);
});