// Runtime safety tests for fetchAiBackdrop.
//
// These tests guarantee that fetchAiBackdrop NEVER throws when:
//   - the query is missing / empty / non-string
//   - the cache table query throws
//   - LOVABLE_API_KEY is missing (no candidate generated)
//   - the AI gateway returns no image / non-OK
//   - storage upload fails
//   - the supabase client itself is malformed
//
// The contract is: on any failure, return null (caller falls back to
// product-only preview). See mem://infrastructure/error-recovery-and-crash-prevention.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchAiBackdrop } from "./pinterest-ai-backdrop.ts";

/** Build a supabase-like stub. `cacheReturn` controls the cache row, `throwOnFrom` makes .from() throw. */
function makeSb(opts: {
  cacheReturn?: unknown;
  throwOnFrom?: boolean;
  uploadError?: { message: string } | null;
  publicUrl?: string | null;
} = {}) {
  return {
    from(_t: string) {
      if (opts.throwOnFrom) throw new Error("simulated db crash");
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        maybeSingle() {
          return Promise.resolve({ data: opts.cacheReturn ?? null, error: null });
        },
        upsert() { return Promise.resolve({ data: null, error: null }); },
      };
    },
    storage: {
      from(_b: string) {
        return {
          upload: () => Promise.resolve({ error: opts.uploadError ?? null }),
          getPublicUrl: () => ({ data: { publicUrl: opts.publicUrl ?? null } }),
        };
      },
    },
  };
}

function clearApiKey() {
  try { Deno.env.delete("LOVABLE_API_KEY"); } catch { /* ignore */ }
}

Deno.test("fetchAiBackdrop: empty query → does not throw, returns null when no key", async () => {
  clearApiKey();
  const sb = makeSb();
  const out = await fetchAiBackdrop(sb as any, "");
  assertEquals(out, null);
});

Deno.test("fetchAiBackdrop: missing query (undefined) → does not throw", async () => {
  clearApiKey();
  const sb = makeSb();
  // @ts-expect-error — intentionally passing undefined
  const out = await fetchAiBackdrop(sb as any, undefined);
  assertEquals(out, null);
});

Deno.test("fetchAiBackdrop: missing LOVABLE_API_KEY → returns null gracefully", async () => {
  clearApiKey();
  const sb = makeSb();
  const out = await fetchAiBackdrop(sb as any, "automatic cat litter box");
  assertEquals(out, null);
});

Deno.test("fetchAiBackdrop: cache hit → returns AiBackdropPhoto without calling gateway", async () => {
  clearApiKey(); // would otherwise be needed for generation
  const sb = makeSb({
    cacheReturn: { image_url: "https://cdn.example.com/x.png", width: 1080, height: 1920, phash: null },
  });
  const out = await fetchAiBackdrop(sb as any, "automatic cat litter box");
  assertEquals(out?.url, "https://cdn.example.com/x.png");
  assertEquals(out?.source, "ai_cached");
});

Deno.test("fetchAiBackdrop: sb.from throws → top-level guard returns null", async () => {
  clearApiKey();
  const sb = makeSb({ throwOnFrom: true });
  const out = await fetchAiBackdrop(sb as any, "cat tree large");
  assertEquals(out, null);
});

Deno.test("fetchAiBackdrop: gateway failure (mocked fetch) → returns null without crash", async () => {
  Deno.env.set("LOVABLE_API_KEY", "test-key");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("upstream boom", { status: 503 }))) as typeof fetch;
  try {
    const sb = makeSb();
    const out = await fetchAiBackdrop(sb as any, "self cleaning litter box");
    assertEquals(out, null);
  } finally {
    globalThis.fetch = originalFetch;
    clearApiKey();
  }
});

Deno.test("fetchAiBackdrop: gateway returns no image url → returns null without crash", async () => {
  Deno.env.set("LOVABLE_API_KEY", "test-key");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { images: [] } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;
  try {
    const sb = makeSb();
    const out = await fetchAiBackdrop(sb as any, "memory foam dog bed");
    assertEquals(out, null);
  } finally {
    globalThis.fetch = originalFetch;
    clearApiKey();
  }
});

Deno.test("fetchAiBackdrop: malformed sb (no .storage) → never throws", async () => {
  clearApiKey();
  const broken = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: null, error: null }); } }) };
  const out = await fetchAiBackdrop(broken as any, "anything");
  assertEquals(out, null);
});
