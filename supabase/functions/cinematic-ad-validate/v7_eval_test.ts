// Deno tests for the V7 QA gate. Uses pure fixture jobs — no network, no DB.
// Run with the supabase--test_edge_functions tool.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateV7, DEFAULT_V7_THRESHOLDS, type V7Input } from "../_shared/cinematic-v7-eval.ts";

const baseV2 = { hook_strength: 85, composite: 90 };
const safeAreaOk = { ok: true, violations: [] as string[] };

/** Fixture A — single image with Ken-Burns zoom/pan only. Must FAIL. */
function fixtureSingleImageKenBurns(): V7Input {
  return {
    job: {
      scene_plan: [
        { crop: "wide",   motion: "zoom_in",  category: "hero",      caption: "" },
        { crop: "wide",   motion: "zoom_out", category: "hero",      caption: "" },
        { crop: "wide",   motion: "pan_left", category: "hero",      caption: "" },
        { crop: "wide",   motion: "pan_right",category: "hero",      caption: "" },
        { crop: "wide",   motion: "ken_burns",category: "hero",      caption: "" },
      ],
      hook_text: "Beautiful product",
      cta_text: "",
      scene_assets: [],
      beats_v5: [],
    },
    productCtx: { name: "Orthopedic Dog Bed", category: "dog_bed" },
    safeArea: safeAreaOk,
    v2: baseV2,
  };
}

/** Fixture B — valid 6-scene cinematic edit with diverse roles & cameras. Must PASS. */
function fixtureValidMultiScene(): V7Input {
  return {
    job: {
      scene_plan: [
        { crop: "wide",     motion: "handheld",  role: "hook",      category: "lifestyle",   caption: "Tired pup? Same." },
        { crop: "close_up", motion: "orbit",     role: "closeup",   category: "closeup",     caption: "Memory foam detail" },
        { crop: "medium",   motion: "parallax",  role: "demo",      category: "product_demo",caption: "Watch him sink in" },
        { crop: "wide",     motion: "tilt",      role: "lifestyle", category: "lifestyle",   caption: "Living room ready" },
        { crop: "macro",    motion: "whip",      role: "feature",   category: "closeup",     caption: "Cooling gel layer" },
        { crop: "medium",   motion: "cut",       role: "cta",       category: "cta",         caption: "Shop now",       isCta: true },
      ],
      hook_text: "Tired pup? Same.",
      cta_text: "Shop on GetPawsy",
      scene_assets: [],
      beats_v5: [],
    },
    productCtx: { name: "Orthopedic Dog Bed", category: "dog_bed" },
    safeArea: safeAreaOk,
    v2: baseV2,
  };
}

Deno.test("V7 REJECTS single-image Ken-Burns zoom/pan render", () => {
  const out = evaluateV7(fixtureSingleImageKenBurns(), DEFAULT_V7_THRESHOLDS);
  assertEquals(out.validation_v7_passed, false, "single-image ken-burns must fail v7");
  assert(out.v7_reject_reasons.includes("ken_burns_zoom_only"),
    `expected ken_burns_zoom_only, got ${out.v7_reject_reasons.join(",")}`);
  // Same crop everywhere → camera diversity also fails
  assert(out.v7_reject_reasons.some((r) => r.startsWith("unique_cameras")),
    "expected unique_cameras failure for single-camera shot");
  // No lifestyle / closeup / demo / cta in plan
  assert(out.v7_reject_reasons.includes("missing_closeup"));
  assert(out.v7_reject_reasons.includes("missing_lifestyle_scene"));
  assert(out.v7_reject_reasons.includes("missing_product_demo_shot"));
  assert(out.v7_reject_reasons.includes("missing_cta_frame"));
});

Deno.test("V7 ACCEPTS a valid multi-scene cinematic edit", () => {
  const out = evaluateV7(fixtureValidMultiScene(), DEFAULT_V7_THRESHOLDS);
  assertEquals(out.v7_reject_reasons, [], `unexpected reject reasons: ${out.v7_reject_reasons.join(",")}`);
  assertEquals(out.validation_v7_passed, true, "valid multi-scene edit must pass v7");
  assert(out.pinterest_quality_score > DEFAULT_V7_THRESHOLDS.minPinterestQuality,
    `pinterest_quality_score=${out.pinterest_quality_score} must exceed ${DEFAULT_V7_THRESHOLDS.minPinterestQuality}`);
});

Deno.test("V7 REJECTS when scene count below minimum", () => {
  const input = fixtureValidMultiScene();
  input.job.scene_plan = input.job.scene_plan.slice(0, 3); // only 3 scenes
  const out = evaluateV7(input);
  assertEquals(out.validation_v7_passed, false);
  assert(out.v7_reject_reasons.some((r) => r.startsWith("scene_count")));
});

Deno.test("V7 REJECTS when text outside safe area", () => {
  const input = fixtureValidMultiScene();
  input.safeArea = {
    ok: false,
    violations: ["hook_text overflow", "cta_text truncated", "pin_title clamp", "scene2 too_long", "scene3 exceeds"],
  };
  const out = evaluateV7(input);
  assertEquals(out.validation_v7_passed, false);
  assert(out.v7_reject_reasons.includes("text_outside_safe_zone"));
  assert(out.v7_reject_reasons.includes("text_cut_off"));
});

Deno.test("V7 REJECTS when caption text density too high", () => {
  const input = fixtureValidMultiScene();
  const longCaption = "This caption deliberately runs far beyond the safe density limit for a single frame and should trigger the density gate";
  input.job.scene_plan = input.job.scene_plan.map((s: any) => ({ ...s, caption: longCaption }));
  const out = evaluateV7(input);
  assertEquals(out.validation_v7_passed, false);
  assert(out.v7_reject_reasons.some((r) => r.startsWith("text_density_excessive")),
    `expected text_density_excessive, got ${out.v7_reject_reasons.join(",")}`);
});

Deno.test("V7 retry pass recovers borderline product-demo via captions/prompts", () => {
  const input: V7Input = {
    job: {
      scene_plan: [
        { crop: "wide",     motion: "handheld", role: "hook",      category: "lifestyle", caption: "Meet your pup's new favourite spot" },
        { crop: "close_up", motion: "orbit",    role: "feature",   category: "feature",   caption: "Soft memory foam, paw close-up" },
        { crop: "medium",   motion: "parallax", role: "scene",     category: "scene",     caption: "He's sleeping like a baby" }, // demo (sleeping) via broad regex
        { crop: "wide",     motion: "tilt",     role: "scene",     category: "scene",     caption: "In the living room with the family" }, // lifestyle via broad
        { crop: "macro",    motion: "whip",     role: "scene",     category: "scene",     caption: "Buy it now",                  isCta: true }, // cta via retry
        { crop: "medium",   motion: "cut",      role: "scene",     category: "scene",     caption: "Order yours today" },
      ],
      hook_text: "Tired pup? Same.",
      cta_text: "Shop on GetPawsy",
      scene_assets: [],
      beats_v5: [],
    },
    productCtx: { name: "Orthopedic Dog Bed", category: "dog_bed" },
    safeArea: safeAreaOk,
    v2: baseV2,
  };
  const out = evaluateV7(input);
  // Strict pass should have missed product_demo + lifestyle; retry should fill them.
  assert(out.detection_debug.retry_used.length > 0, "retry pass should be used");
  assertEquals(out.v7_reject_reasons, [], `unexpected: ${out.v7_reject_reasons.join(",")}`);
  assertEquals(out.validation_v7_passed, true);
});

Deno.test("V7 REJECTS app product without app-control shot", () => {
  const input: V7Input = {
    job: {
      scene_plan: [
        { crop: "wide",     motion: "handheld", role: "hook",      category: "lifestyle",   caption: "Fresh home daily" },
        { crop: "close_up", motion: "orbit",    role: "closeup",   category: "closeup",     caption: "Soft fabric look" },
        { crop: "medium",   motion: "parallax", role: "demo",      category: "product_demo",caption: "Watch a full cycle" },
        { crop: "wide",     motion: "tilt",     role: "lifestyle", category: "lifestyle",   caption: "Calm cat owner home" },
        { crop: "macro",    motion: "whip",     role: "feature",   category: "closeup",     caption: "Hands-free routine" },
        { crop: "medium",   motion: "cut",      role: "cta",       category: "cta",         caption: "Shop now", isCta: true },
      ],
      hook_text: "Less scooping, more cuddles",
      cta_text: "Shop on GetPawsy",
      scene_assets: [],
      beats_v5: [],
    },
    productCtx: { name: "Smart Self-Cleaning Litter Box", category: "cat_litter", primary_keyword: "app controlled litter box" },
    safeArea: safeAreaOk,
    v2: baseV2,
  };
  const out = evaluateV7(input);
  assertEquals(out.detection_debug.is_app_product, true);
  assert(out.v7_reject_reasons.includes("missing_app_control_shot"),
    `expected missing_app_control_shot, got ${out.v7_reject_reasons.join(",")}`);
  assertEquals(out.validation_v7_passed, false);
});

Deno.test("V7 ACCEPTS app product when an app-control shot is present", () => {
  const input: V7Input = {
    job: {
      scene_plan: [
        { crop: "wide",     motion: "handheld", role: "hook",      category: "lifestyle",   caption: "Hands-free litter" },
        { crop: "close_up", motion: "orbit",    role: "closeup",   category: "closeup",     caption: "Self-cleaning detail" },
        { crop: "medium",   motion: "parallax", role: "demo",      category: "product_demo",caption: "Watch it cycle" },
        { crop: "phone",    motion: "tilt",     role: "app",       category: "app_control", caption: "Tap the app to start a cycle" },
        { crop: "wide",     motion: "whip",     role: "lifestyle", category: "lifestyle",   caption: "Fresh home" },
        { crop: "medium",   motion: "cut",      role: "cta",       category: "cta",         caption: "Shop now", isCta: true },
      ],
      hook_text: "Less scooping, more cuddles",
      cta_text: "Shop on GetPawsy",
      scene_assets: [],
      beats_v5: [],
    },
    productCtx: { name: "Smart Self-Cleaning Litter Box", category: "cat_litter", primary_keyword: "app controlled litter box" },
    safeArea: safeAreaOk,
    v2: baseV2,
  };
  const out = evaluateV7(input);
  assertEquals(out.detection_debug.is_app_product, true);
  assertEquals(out.detection_debug.final.app_control, true);
  assertEquals(out.v7_reject_reasons, [], `unexpected: ${out.v7_reject_reasons.join(",")}`);
  assertEquals(out.validation_v7_passed, true);
});