import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateCreativeKit, buildFallbackStoryboard } from "./creative-kit.ts";
import { VOICE_STYLES } from "./voice-styles.ts";

const product = {
  name: "GetPawsy Expandable Pet Carrier Backpack",
  slug: "expandable-pet-carrier-backpack-breathable",
  category: "Dog Travel",
  description: "Comfortable expandable backpack carrier",
  price: 79.99,
};

const voice = VOICE_STYLES.lifestyle_female;

function mockFetch(handler: (req: Request) => Promise<Response> | Response) {
  const original = globalThis.fetch;
  globalThis.fetch = ((req: any, init?: any) => {
    const r = req instanceof Request ? req : new Request(String(req), init);
    return Promise.resolve(handler(r));
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

function aiJson(payload: unknown, status = 200) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    { status, headers: { "content-type": "application/json" } },
  );
}

const validKit = {
  hook_variants: [
    { angle: "emotional", text: "You'll wonder how you ever managed." },
    { angle: "luxury", text: "The premium upgrade your dog deserves." },
    { angle: "problem_solution", text: "Tired of bulky carriers? Try this." },
    { angle: "curiosity", text: "Why pet parents are switching now." },
    { angle: "social_proof", text: "Trending with US pet parents." },
  ],
  cta_variants: [{ text: "Shop now →" }, { text: "Tap to get" }, { text: "See it" }],
  vo_script: "Meet the carrier. Comfortable. Premium. Get yours at GetPawsy dot pet.",
  pin_title: "Premium Carrier",
  pin_description: "Designed for US pet parents. Shop now at GetPawsy.pet",
  hashtags: ["#a", "#b"],
  storyboard: [
    { scene_index: 1, role: "hook", visual: "v", on_screen_text: "t", vo_line: "l", duration_s: 3 },
    { scene_index: 2, role: "reveal", visual: "v", on_screen_text: "t", vo_line: "l", duration_s: 4 },
    { scene_index: 3, role: "feature", visual: "v", on_screen_text: "t", vo_line: "l", duration_s: 4 },
    { scene_index: 4, role: "craft", visual: "v", on_screen_text: "t", vo_line: "l", duration_s: 4 },
    { scene_index: 5, role: "lifestyle", visual: "v", on_screen_text: "t", vo_line: "l", duration_s: 4 },
    { scene_index: 6, role: "cta", visual: "v", on_screen_text: "Get yours at GetPawsy.pet", vo_line: "l", duration_s: 4 },
  ],
};

Deno.test("buildFallbackStoryboard returns exactly 6 scenes with required structure", () => {
  const sb = buildFallbackStoryboard("Test Product");
  assertEquals(sb.length, 6);
  assertEquals(sb[0].role, "hook");
  assertEquals(sb[5].role, "cta");
  assert(sb[5].on_screen_text.includes("GetPawsy.pet"));
});

Deno.test("generateCreativeKit: AI returns valid 6-scene JSON → source=ai", async () => {
  const restore = mockFetch(() => aiJson(validKit));
  try {
    const kit = await generateCreativeKit(product, voice, "fake-key");
    assertEquals(kit.storyboard.length, 6);
    assertEquals(kit.diagnostics?.source, "ai");
    assertEquals(kit.diagnostics?.scene_count, 6);
  } finally { restore(); }
});

Deno.test("generateCreativeKit: empty storyboard triggers retry; fallback if retry also empty", async () => {
  let calls = 0;
  const restore = mockFetch(() => {
    calls++;
    return aiJson({ ...validKit, storyboard: [] });
  });
  try {
    const kit = await generateCreativeKit(product, voice, "fake-key");
    assertEquals(calls, 2, "should retry once");
    // After retry also empty, falls back to deterministic 6-scene storyboard.
    assertEquals(kit.storyboard.length, 6);
    assert(kit.diagnostics?.source === "fallback");
    assert(kit.diagnostics?.retry_reason !== undefined);
  } finally { restore(); }
});

Deno.test("generateCreativeKit: AI throws non-credit error → source=fallback, never throws, 6 scenes", async () => {
  const restore = mockFetch(() => new Response("upstream blew up", { status: 500 }));
  try {
    const kit = await generateCreativeKit(product, voice, "fake-key");
    assertEquals(kit.storyboard.length, 6);
    assertEquals(kit.diagnostics?.source, "fallback");
    assertEquals(kit.diagnostics?.upstream_status, 500);
  } finally { restore(); }
});

Deno.test("generateCreativeKit: 402 credit-exhausted DOES throw (caller marks concept_failed)", async () => {
  const restore = mockFetch(() => new Response("no credits", { status: 402 }));
  try {
    let threw = false;
    try { await generateCreativeKit(product, voice, "fake-key"); }
    catch (e: any) { threw = true; assertEquals(e.code, "AI_CREDITS_EXHAUSTED"); }
    assert(threw, "must throw on 402");
  } finally { restore(); }
});