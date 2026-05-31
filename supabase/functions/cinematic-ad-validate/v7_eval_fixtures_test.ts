// V7 evaluator tests driven by REAL upload fixtures.
//
// Each JSON file under ./fixtures/ mirrors the exact shape that
// `cinematic-ad-validate` reads off the `cinematic_ad_jobs` row at runtime
// (scene_plan, scene_assets, beats_v5, vo_script, hook_text, cta_text,
// product context, safe-area report, V2 scores). The asset URLs point at
// real .mp4 / .png files in ./fixtures/media/ — actual encoded bytes, not
// stubs — so a human can open them and confirm what the test claims is
// what an uploader would have submitted.
//
// Goal: lock V7 against the same payload shape production sees, so that
// changes to thresholds or detection regexes can't silently break or
// silently approve real renders.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateV7, DEFAULT_V7_THRESHOLDS, type V7Input } from "../_shared/cinematic-v7-eval.ts";

const FIXTURES_DIR = new URL("./fixtures/", import.meta.url);

interface FixtureMeta {
  description: string;
  media: string[];
  expected: {
    validation_v7_passed: boolean;
    must_include_reasons?: string[];
    min_pinterest_quality_score?: number;
    retry_used_non_empty?: boolean;
  };
}

interface FixtureFile {
  _meta: FixtureMeta;
  job: V7Input["job"];
  product_ctx: V7Input["productCtx"];
  safe_area: V7Input["safeArea"];
  v2: V7Input["v2"];
}

async function loadFixture(name: string): Promise<FixtureFile> {
  const url = new URL(name, FIXTURES_DIR);
  const text = await Deno.readTextFile(url);
  return JSON.parse(text) as FixtureFile;
}

/**
 * Asserts every referenced media file actually exists on disk and is a
 * real, non-empty binary. Without this guard a fixture could drift away
 * from its asset and still "pass" — the V7 evaluator never opens the
 * media, so it would never notice.
 */
async function assertMediaPresent(meta: FixtureMeta) {
  for (const rel of meta.media) {
    // Strip any media-fragment hash like "#t=0.0,1.2"
    const path = rel.split("#")[0];
    const url = new URL(path, FIXTURES_DIR);
    const stat = await Deno.stat(url);
    assert(stat.isFile, `expected ${path} to be a real file`);
    assert(stat.size > 0, `expected ${path} to have non-zero bytes`);
  }
}

function asV7Input(f: FixtureFile): V7Input {
  return { job: f.job, productCtx: f.product_ctx, safeArea: f.safe_area, v2: f.v2 };
}

Deno.test("real fixture: single-image Ken-Burns render is REJECTED", async () => {
  const f = await loadFixture("single_image_ken_burns.json");
  await assertMediaPresent(f._meta);
  const out = evaluateV7(asV7Input(f));
  assertEquals(out.validation_v7_passed, f._meta.expected.validation_v7_passed);
  for (const reason of f._meta.expected.must_include_reasons ?? []) {
    assert(
      out.v7_reject_reasons.some((r) => r === reason || r.startsWith(`${reason}(`)),
      `expected reason "${reason}", got: ${out.v7_reject_reasons.join(",")}`,
    );
  }
});

Deno.test("real fixture: valid 6-shot cinematic edit is APPROVED", async () => {
  const f = await loadFixture("valid_multi_scene.json");
  await assertMediaPresent(f._meta);
  const out = evaluateV7(asV7Input(f));
  assertEquals(
    out.v7_reject_reasons,
    [],
    `unexpected reject reasons: ${out.v7_reject_reasons.join(",")}`,
  );
  assertEquals(out.validation_v7_passed, true);
  const minQ = f._meta.expected.min_pinterest_quality_score ?? DEFAULT_V7_THRESHOLDS.minPinterestQuality;
  assert(
    out.pinterest_quality_score >= minQ,
    `pinterest_quality_score=${out.pinterest_quality_score} expected >= ${minQ}`,
  );
});

Deno.test("real fixture: borderline edit is recovered by retry pass", async () => {
  const f = await loadFixture("borderline_retry_recovers.json");
  await assertMediaPresent(f._meta);
  const out = evaluateV7(asV7Input(f));
  assertEquals(out.v7_reject_reasons, [], `unexpected: ${out.v7_reject_reasons.join(",")}`);
  assertEquals(out.validation_v7_passed, true);
  if (f._meta.expected.retry_used_non_empty) {
    assert(
      out.detection_debug.retry_used.length > 0,
      "expected retry pass to have been used to recover borderline detections",
    );
  }
});

Deno.test("real fixture: smart litter box without app-control scene is REJECTED", async () => {
  const f = await loadFixture("app_product_missing_control.json");
  await assertMediaPresent(f._meta);
  const out = evaluateV7(asV7Input(f));
  assertEquals(out.detection_debug.is_app_product, true, "litter-box keyword should mark this as an app product");
  assert(
    out.v7_reject_reasons.includes("missing_app_control_shot"),
    `expected missing_app_control_shot, got: ${out.v7_reject_reasons.join(",")}`,
  );
  assertEquals(out.validation_v7_passed, false);
});

Deno.test("real fixture: smart litter box WITH app-control scene is APPROVED", async () => {
  const f = await loadFixture("app_product_with_control.json");
  await assertMediaPresent(f._meta);
  const out = evaluateV7(asV7Input(f));
  assertEquals(out.detection_debug.is_app_product, true);
  assertEquals(out.detection_debug.final.app_control, true);
  assertEquals(out.v7_reject_reasons, [], `unexpected: ${out.v7_reject_reasons.join(",")}`);
  assertEquals(out.validation_v7_passed, true);
});