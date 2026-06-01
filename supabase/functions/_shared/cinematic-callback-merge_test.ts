/**
 * End-to-end regression tests for the cinematic-ad-render-webhook
 * callback merge contract.
 *
 * These tests simulate the real two-phase render flow:
 *
 *   Phase 1 — original render callback (rich payload)
 *     Worker reports the full set of fields: mp4_url, duration, file_size,
 *     width, height, motion_score, motion_quality_score, black_bars,
 *     thumbnail_url, scene_plan. The webhook persists everything into a
 *     `cinematic_ad_jobs` row.
 *
 *   Phase 2 — auto-trim callback (sparse payload)
 *     The trim workflow re-encodes and POSTs back with ONLY:
 *     mp4_url, duration, file_size, width, height. It MUST NOT wipe
 *     motion_score, motion_quality_score, black_bars, thumbnail_url, or
 *     scene_plan that were captured on Phase 1.
 *
 * We also assert that output_mp4_url and output_thumbnail_url contain no
 * accidental double slashes, even when the worker hands us
 * `https://…supabase.co//storage/v1/object/public/…` (which iPhone
 * Safari sometimes refuses to play inline).
 */
import { assert, assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FIELD_MAP,
  mergePreserve,
  stripDoubleSlash,
} from "./cinematic-callback-merge.ts";

function hasNoDoubleSlash(url: unknown): void {
  assertEquals(typeof url, "string", `expected string url, got ${typeof url}`);
  const s = String(url);
  // Allow the protocol's `://`, but reject any other `//` in path/host.
  const withoutProto = s.replace(/^[a-z]+:\/\//i, "");
  assert(
    !withoutProto.includes("//"),
    `url contains double slash after protocol: ${s}`,
  );
}

// ---------------------------------------------------------------------------
// stripDoubleSlash — pure helper
// ---------------------------------------------------------------------------

Deno.test("stripDoubleSlash collapses //storage path", () => {
  const dirty = "https://nojvgfbcjgipjxpfatmm.supabase.co//storage/v1/object/public/cinematic-ads/abc/output.mp4";
  const clean = stripDoubleSlash(dirty);
  assertEquals(clean, "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/cinematic-ads/abc/output.mp4");
  hasNoDoubleSlash(clean);
});

Deno.test("stripDoubleSlash preserves protocol ://", () => {
  const u = stripDoubleSlash("https://example.com/path");
  assert(u.startsWith("https://"));
  assertEquals(u, "https://example.com/path");
});

Deno.test("stripDoubleSlash handles deeply nested triple slashes", () => {
  const u = stripDoubleSlash("https://x.co///a////b//c.mp4");
  assertEquals(u, "https://x.co/a/b/c.mp4");
  hasNoDoubleSlash(u);
});

Deno.test("stripDoubleSlash returns empty string unchanged", () => {
  assertEquals(stripDoubleSlash(""), "");
});

// ---------------------------------------------------------------------------
// mergePreserve — never-clobber-with-null contract
// ---------------------------------------------------------------------------

Deno.test("mergePreserve skips null/undefined/empty-array body fields", () => {
  const patch: Record<string, unknown> = {
    output_mp4_url: "https://x.co/a.mp4",
    motion_score: 42,
    scene_plan: [{ s: 1 }],
  };
  mergePreserve(patch, {
    mp4_url: null,
    duration: undefined,
    motion_score: null,
    scene_plan: [],
  }, FIELD_MAP);
  assertEquals(patch.output_mp4_url, "https://x.co/a.mp4");
  assertEquals(patch.motion_score, 42);
  assertEquals((patch.scene_plan as any[]).length, 1);
});

Deno.test("mergePreserve coerces and renames via FIELD_MAP", () => {
  const patch: Record<string, unknown> = {};
  mergePreserve(patch, {
    mp4_url: "https://x.co/a.mp4",
    duration: "12.5",
    file_size: "1048576",
    width: 1080,
    height: 1920,
    motion_score: "27",
    motion_quality_score: "150", // clamp to 100
    black_bars: 0,               // falsy → false
    thumbnail_url: "https://x.co/t.jpg",
    scene_plan: [{ s: 1 }, { s: 2 }],
  }, FIELD_MAP);
  assertEquals(patch.output_mp4_url, "https://x.co/a.mp4");
  assertEquals(patch.output_duration_seconds, 12.5);
  assertEquals(patch.output_file_size_bytes, 1048576);
  assertEquals(patch.output_width, 1080);
  assertEquals(patch.output_height, 1920);
  assertEquals(patch.motion_score, 27);
  assertEquals(patch.motion_quality_score, 100);
  assertStrictEquals(patch.output_black_bars, false);
  assertEquals(patch.output_thumbnail_url, "https://x.co/t.jpg");
  assertEquals((patch.scene_plan as any[]).length, 2);
});

Deno.test("FIELD_MAP clamps motion_quality_score below 0", () => {
  const patch: Record<string, unknown> = {};
  mergePreserve(patch, { motion_quality_score: -10 }, FIELD_MAP);
  assertEquals(patch.motion_quality_score, 0);
});

// ---------------------------------------------------------------------------
// End-to-end two-phase merge: original render → auto-trim callback
// ---------------------------------------------------------------------------

/**
 * Simulates the patch-build sequence executed by the webhook in
 * `cinematic-ad-render-webhook/index.ts` for the original render and
 * the trim callback. Mirrors the production code path so the test fails
 * if either branch loses metadata or reintroduces double-slash URLs.
 */
function simulateWebhookFlow(opts: {
  originalBody: Record<string, any>;
  trimBody: Record<string, any>;
}): { afterOriginal: Record<string, unknown>; afterTrim: Record<string, unknown> } {
  // ----- Phase 1: original "rendered" / "uploaded" callback -----
  const phase1: Record<string, unknown> = { status: "render_complete" };
  mergePreserve(phase1, opts.originalBody, FIELD_MAP);

  // ----- Simulate row written to DB -----
  const dbRow: Record<string, unknown> = { ...phase1 };

  // ----- Phase 2: auto-trim callback (sparse payload) -----
  // Webhook builds a new patch then merges trim-callback body into it.
  // It then performs `update(patch)` against the row. We model that as
  // `{ ...dbRow, ...patch }` so a NULL in `patch` would visibly clobber
  // the existing row, which would fail the assertions below.
  const phase2Patch: Record<string, unknown> = {
    status: "render_complete",
    duration_auto_trimmed: true,
  };
  mergePreserve(phase2Patch, opts.trimBody, FIELD_MAP);
  const afterTrim = { ...dbRow, ...phase2Patch };

  return { afterOriginal: dbRow, afterTrim };
}

Deno.test("e2e: auto-trim callback preserves ALL Phase-1 metadata", () => {
  // Phase 1 payload from render-cinematic-ad.mjs — rich metadata.
  const originalBody = {
    mp4_url: "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-1/output.mp4",
    duration: 18.2,
    file_size: 4_500_000,
    width: 1080,
    height: 1920,
    motion_score: 27,
    motion_quality_score: 82,
    black_bars: false,
    thumbnail_url: "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-1/thumb.jpg",
    scene_plan: [{ idx: 0 }, { idx: 1 }, { idx: 2 }, { idx: 3 }],
  };

  // Phase 2 payload from trim-cinematic-ad.yml — only mp4/duration/size/w/h.
  // motion_score, motion_quality_score, black_bars, thumbnail_url and
  // scene_plan are deliberately omitted (and would historically arrive
  // as NULL via the SDK, wiping them).
  const trimBody = {
    status: "uploaded",
    event: "auto_trim_complete",
    duration_auto_trimmed: true,
    mp4_url: "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-1/output-trimmed.mp4",
    duration: 14.9,
    file_size: 3_200_000,
    width: 1080,
    height: 1920,
    // Explicitly null — must NOT overwrite Phase-1 values:
    motion_score: null,
    motion_quality_score: null,
    black_bars: null,
    thumbnail_url: null,
    scene_plan: null,
  };

  const { afterOriginal, afterTrim } = simulateWebhookFlow({ originalBody, trimBody });

  // Phase-1 sanity
  assertEquals(afterOriginal.motion_score, 27);
  assertEquals(afterOriginal.motion_quality_score, 82);
  assertEquals((afterOriginal.scene_plan as any[]).length, 4);

  // Phase-2 must update mp4 + duration + file_size + w/h ...
  assertEquals(afterTrim.output_mp4_url, "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-1/output-trimmed.mp4");
  assertEquals(afterTrim.output_duration_seconds, 14.9);
  assertEquals(afterTrim.output_file_size_bytes, 3_200_000);
  assertEquals(afterTrim.output_width, 1080);
  assertEquals(afterTrim.output_height, 1920);
  assertEquals(afterTrim.duration_auto_trimmed, true);

  // ...and MUST preserve Phase-1 metadata that trim omitted.
  assertEquals(afterTrim.motion_score, 27, "motion_score wiped by trim callback");
  assertEquals(afterTrim.motion_quality_score, 82, "motion_quality_score wiped by trim callback");
  assertStrictEquals(afterTrim.output_black_bars, false, "black_bars wiped by trim callback");
  assertEquals(
    afterTrim.output_thumbnail_url,
    "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-1/thumb.jpg",
    "thumbnail_url wiped by trim callback",
  );
  assertEquals((afterTrim.scene_plan as any[]).length, 4, "scene_plan wiped by trim callback");
});

Deno.test("e2e: trim callback with omitted (undefined) fields preserves Phase-1", () => {
  // Same as above but trim body simply *omits* the fields rather than
  // sending null. Same expectation — nothing wiped.
  const originalBody = {
    mp4_url: "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-2/output.mp4",
    duration: 16.0,
    file_size: 4_000_000,
    width: 1080,
    height: 1920,
    motion_score: 19,
    motion_quality_score: 74,
    black_bars: false,
    thumbnail_url: "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-2/thumb.jpg",
    scene_plan: [{ idx: 0 }, { idx: 1 }, { idx: 2 }, { idx: 3 }],
  };
  const trimBody = {
    mp4_url: "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-2/output-trimmed.mp4",
    duration: 14.5,
    file_size: 3_100_000,
    width: 1080,
    height: 1920,
    // Everything else omitted.
  };
  const { afterTrim } = simulateWebhookFlow({ originalBody, trimBody });
  assertEquals(afterTrim.motion_score, 19);
  assertEquals(afterTrim.motion_quality_score, 74);
  assertStrictEquals(afterTrim.output_black_bars, false);
  assertEquals(
    afterTrim.output_thumbnail_url,
    "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-2/thumb.jpg",
  );
  assertEquals((afterTrim.scene_plan as any[]).length, 4);
});

// ---------------------------------------------------------------------------
// End-to-end URL hygiene: output_mp4_url + output_thumbnail_url
// ---------------------------------------------------------------------------

Deno.test("e2e: //storage URLs from worker are cleaned on Phase 1", () => {
  const originalBody = {
    mp4_url: "https://x.supabase.co//storage/v1/object/public/cinematic-ads/job-3/output.mp4",
    thumbnail_url: "https://x.supabase.co//storage/v1/object/public/cinematic-ads/job-3/thumb.jpg",
    duration: 15,
    width: 1080,
    height: 1920,
  };
  const { afterOriginal } = simulateWebhookFlow({ originalBody, trimBody: {} });
  hasNoDoubleSlash(afterOriginal.output_mp4_url);
  hasNoDoubleSlash(afterOriginal.output_thumbnail_url);
});

Deno.test("e2e: //storage URLs from auto-trim callback are cleaned on Phase 2", () => {
  const originalBody = {
    mp4_url: "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-4/output.mp4",
    thumbnail_url: "https://x.supabase.co/storage/v1/object/public/cinematic-ads/job-4/thumb.jpg",
    duration: 18,
    width: 1080,
    height: 1920,
    motion_score: 22,
  };
  const trimBody = {
    // Dirty trim URL — must be sanitized before persistence.
    mp4_url: "https://x.supabase.co//storage/v1/object/public/cinematic-ads/job-4/output-trimmed.mp4",
    duration: 14.9,
    width: 1080,
    height: 1920,
    duration_auto_trimmed: true,
  };
  const { afterTrim } = simulateWebhookFlow({ originalBody, trimBody });
  hasNoDoubleSlash(afterTrim.output_mp4_url);
  // thumbnail_url was never replaced; ensure it stayed clean.
  hasNoDoubleSlash(afterTrim.output_thumbnail_url);
  // And metadata still preserved.
  assertEquals(afterTrim.motion_score, 22);
});