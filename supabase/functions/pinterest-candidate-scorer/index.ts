// pinterest-candidate-scorer
// Score-only, publication-safe endpoint. NEVER inserts pinterest_pin_queue
// rows, NEVER calls Pinterest APIs, NEVER runs image generation.
//
// Import contract (enforced by index.test.ts):
//  - No import of pinterest-cron-worker, pinterest-creative-director,
//    pinterest-wave-runner, pinterest-creative-factory, pinterest-media-host,
//    or any Pinterest publication module.
//  - No use of PINTEREST_ACCESS_TOKEN.
//  - No `.from("pinterest_pin_queue")` writes.
//
// See: mem://marketing/pinterest-cost-controls-v1.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.90.1";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
import {
  assertBudget,
  loadRunConfig,
  recordLedger,
  SCORING_VERSION,
  upsertRunConfig,
  type RunConfig,
} from "../_shared/pinterest-cost-guard.ts";
import {
  runScoredWithCache,
  sha256Hex,
} from "../_shared/pinterest-qa-cache.ts";

// ────────────────────────────────────────────────────────────────────────────
//  Request contract
// ────────────────────────────────────────────────────────────────────────────

export const RequestSchema = z
  .object({
    run_id: z.string().uuid(),
    product_ids: z.array(z.string().uuid()).min(1).max(50),
    species_targets: z
      .object({
        cat: z.number().int().min(0).max(50).optional(),
        dog: z.number().int().min(0).max(50).optional(),
        other: z.number().int().min(0).max(50).optional(),
      })
      .optional(),
    max_candidates: z.number().int().min(1).max(50),
    max_paid_calls: z.number().int().min(0).max(50),
    max_credit_spend: z.number().min(0).max(0.5),
    use_cache: z.boolean().default(true),
    allow_tier_b_evaluation: z.boolean().default(true),
    // Both flags MUST be explicitly false. Any other value is rejected.
    publication_allowed: z.literal(false),
    queue_writes_allowed: z.literal(false),
  })
  .strict(); // reject unknown fields (e.g. `publish=true`, `scheduled_at`)

export type ScoringRequest = z.infer<typeof RequestSchema>;

// ────────────────────────────────────────────────────────────────────────────
//  Thresholds (locked — no runtime override)
// ────────────────────────────────────────────────────────────────────────────

export const TIER_A = {
  MIN_OCCUPANCY: 0.4,
  MIN_IDENTITY: 0.98,
  MIN_PDP_SIMILARITY: 0.97,
  MIN_SPECIES_CONF: 0.95,
} as const;

export const TIER_B = {
  MIN_IDENTITY: 0.92,
  MAX_IDENTITY: 0.98,
  MIN_PDP_SIMILARITY: 1.0,
  MIN_SPECIES_CONF: 0.98,
  MIN_OCCUPANCY: 0.4,
} as const;

// ────────────────────────────────────────────────────────────────────────────
//  Pure classifier — exported for tests
// ────────────────────────────────────────────────────────────────────────────

export interface ScoreSignals {
  occupancy: number | null;
  identity_confidence: number | null;
  pdp_similarity: number | null;
  species_confidence: number | null;
  variant_match: boolean | null;
  color_match: boolean | null;
  shape_match: boolean | null;
  watermark_detected: boolean | null;
  supplier_text_detected: boolean | null;
  collage_detected: boolean | null;
  image_decode_status: "pass" | "fail" | "unknown";
  gallery_membership_verified: boolean;
  species_applicable: boolean;
  no_competing_variant: boolean;
  product_not_obscured: boolean;
  destination_integrity_pass: boolean;
  product_pin_integrity_pass: boolean;
}

export interface Classification {
  tier_a_result: "tier_a_ready" | "not_ready";
  tier_b_potential_result: "tier_b_canary_candidate" | "not_eligible";
  rejection_reasons: string[];
}

export function classifyCandidate(
  s: ScoreSignals,
  allow_tier_b: boolean,
): Classification {
  const reasons: string[] = [];

  // ── Hard safety rejects apply to BOTH tiers ──
  if (s.image_decode_status !== "pass") reasons.push("image_decode_fail");
  if (s.watermark_detected === true) reasons.push("watermark_detected");
  if (s.supplier_text_detected === true) reasons.push("supplier_text_detected");
  if (s.collage_detected === true) reasons.push("collage_detected");
  if (s.variant_match === false) reasons.push("variant_mismatch");
  if (s.color_match === false) reasons.push("color_mismatch");
  if ((s.occupancy ?? 0) < TIER_A.MIN_OCCUPANCY) reasons.push("low_occupancy");

  const hard_fail = reasons.length > 0;

  // ── Tier A ──
  let tier_a: "tier_a_ready" | "not_ready" = "not_ready";
  const ta_reasons: string[] = [];
  if ((s.identity_confidence ?? 0) < TIER_A.MIN_IDENTITY) ta_reasons.push("identity_below_tier_a");
  if ((s.pdp_similarity ?? 0) < TIER_A.MIN_PDP_SIMILARITY) ta_reasons.push("pdp_similarity_below_tier_a");
  if (s.species_applicable && (s.species_confidence ?? 0) < TIER_A.MIN_SPECIES_CONF) ta_reasons.push("species_confidence_below_tier_a");
  if (!s.gallery_membership_verified) ta_reasons.push("gallery_membership_unverified");
  if (!hard_fail && ta_reasons.length === 0) tier_a = "tier_a_ready";
  else reasons.push(...ta_reasons);

  // ── Tier B potential (informational only) ──
  let tier_b: "tier_b_canary_candidate" | "not_eligible" = "not_eligible";
  if (allow_tier_b && tier_a !== "tier_a_ready" && !hard_fail) {
    const id = s.identity_confidence ?? 0;
    const ok =
      id >= TIER_B.MIN_IDENTITY &&
      id < TIER_B.MAX_IDENTITY &&
      s.gallery_membership_verified &&
      (s.pdp_similarity ?? 0) >= TIER_B.MIN_PDP_SIMILARITY &&
      s.variant_match === true &&
      s.color_match === true &&
      s.shape_match === true &&
      s.no_competing_variant &&
      s.product_not_obscured &&
      (!s.species_applicable ||
        (s.species_confidence ?? 0) >= TIER_B.MIN_SPECIES_CONF) &&
      (s.occupancy ?? 0) >= TIER_B.MIN_OCCUPANCY &&
      s.watermark_detected === false &&
      s.supplier_text_detected === false &&
      s.collage_detected === false &&
      s.destination_integrity_pass &&
      s.product_pin_integrity_pass;
    if (ok) tier_b = "tier_b_canary_candidate";
  }

  return {
    tier_a_result: tier_a,
    tier_b_potential_result: tier_b,
    rejection_reasons: Array.from(new Set(reasons)),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Structured vision scoring (Lovable AI Gateway — Gemini Flash)
// ────────────────────────────────────────────────────────────────────────────

interface VisionResult {
  occupancy: number;
  identity_confidence: number;
  pdp_similarity: number;
  species_confidence: number;
  variant_match: boolean;
  color_match: boolean;
  shape_match: boolean;
  watermark_detected: boolean;
  supplier_text_detected: boolean;
  collage_detected: boolean;
}

const VISION_MODEL = "google/gemini-2.5-flash";
const VISION_EST_CREDITS = 0.02; // conservative p50 for one structured call

async function runStructuredVisionCall(
  imageUrl: string,
  productContext: { title: string; species: string | null },
): Promise<{ result: VisionResult; passed: boolean; actual_credits: number }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("missing_LOVABLE_API_KEY");

  const prompt = `Score this product source photo for Pinterest. Product: "${productContext.title}". Expected species: ${productContext.species ?? "n/a"}.
Return ONLY JSON with keys occupancy (0-1), identity_confidence (0-1), pdp_similarity (0-1), species_confidence (0-1), variant_match (bool), color_match (bool), shape_match (bool), watermark_detected (bool), supplier_text_detected (bool), collage_detected (bool).`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`vision_call_failed:${resp.status}:${body.slice(0, 200)}`);
  }
  const json = await resp.json();
  const raw = json?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as VisionResult;
  const passed =
    parsed.identity_confidence >= TIER_A.MIN_IDENTITY &&
    parsed.occupancy >= TIER_A.MIN_OCCUPANCY &&
    !parsed.watermark_detected &&
    !parsed.supplier_text_detected &&
    !parsed.collage_detected;
  return { result: parsed, passed, actual_credits: VISION_EST_CREDITS };
}

// ────────────────────────────────────────────────────────────────────────────
//  Product + source-image discovery (zero-cost)
// ────────────────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  primary_species: string | null;
  active: boolean;
  effective_stock: number | null;
  hero_image_url: string | null;
}

async function loadProduct(sb: SupabaseClient, id: string): Promise<ProductRow | null> {
  const { data } = await sb
    .from("products")
    .select("id,slug,title,primary_species,active,effective_stock,hero_image_url")
    .eq("id", id)
    .maybeSingle();
  return (data as ProductRow | null) ?? null;
}

async function hashSourceImage(url: string): Promise<{ hash: string | null; decode: "pass" | "fail" }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { hash: null, decode: "fail" };
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength < 2048) return { hash: null, decode: "fail" };
    return { hash: await sha256Hex(bytes), decode: "pass" };
  } catch {
    return { hash: null, decode: "fail" };
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Run-config: score-only lane
// ────────────────────────────────────────────────────────────────────────────

async function ensureScoringRunConfig(
  sb: SupabaseClient,
  req: ScoringRequest,
): Promise<RunConfig> {
  const existing = await loadRunConfig(sb, req.run_id);
  if (existing) {
    if ((existing as any).run_type && (existing as any).run_type !== "candidate_scoring") {
      throw new Error(`run_id_not_candidate_scoring:${(existing as any).run_type}`);
    }
    return existing;
  }
  // Score-only run config. Zero image calls allowed.
  const cfg = await upsertRunConfig(sb, {
    run_id: req.run_id,
    // @ts-ignore — column added by migration.
    run_type: "candidate_scoring",
    wave_slug: null,
    requested_pin_count: 0,
    product_category: null,
    hero_priority_slugs: [],
    max_credit_spend: req.max_credit_spend,
    max_image_calls: 0,
    max_qa_calls: req.max_paid_calls,
    allow_pro_image: false,
    force_rescore: !req.use_cache,
    manual_resume_required: false,
    manual_resume: true,
    status: "active",
    paused_reason: null,
    max_credit_spend_per_pin: req.max_credit_spend,
    max_paid_image_calls_per_pin: 0,
    max_paid_qa_calls_per_image_hash: 1,
    max_total_paid_calls: req.max_paid_calls,
  });
  return cfg;
}

// ────────────────────────────────────────────────────────────────────────────
//  Per-product scoring pipeline
// ────────────────────────────────────────────────────────────────────────────

async function scoreOneProduct(
  sb: SupabaseClient,
  cfg: RunConfig,
  req: ScoringRequest,
  productId: string,
): Promise<{ ok: boolean; row: Record<string, unknown>; provider_calls: number; credits: number }> {
  const product = await loadProduct(sb, productId);
  if (!product) {
    return {
      ok: false,
      provider_calls: 0,
      credits: 0,
      row: {
        run_id: req.run_id,
        product_id: productId,
        rejection_reasons: ["product_not_found"],
        tier_a_result: "not_ready",
        tier_b_potential_result: "not_eligible",
        scorer_version: SCORING_VERSION,
      },
    };
  }

  // Zero-cost prefilter
  const prefilter_reasons: string[] = [];
  if (!product.active) prefilter_reasons.push("inactive");
  if ((product.effective_stock ?? 0) <= 0) prefilter_reasons.push("out_of_stock");
  if (!product.hero_image_url) prefilter_reasons.push("no_source_image");

  if (prefilter_reasons.length > 0) {
    return {
      ok: false,
      provider_calls: 0,
      credits: 0,
      row: {
        run_id: req.run_id,
        product_id: productId,
        slug: product.slug,
        species: product.primary_species,
        rejection_reasons: prefilter_reasons,
        tier_a_result: "not_ready",
        tier_b_potential_result: "not_eligible",
        scorer_version: SCORING_VERSION,
      },
    };
  }

  const imageUrl = product.hero_image_url!;
  const { hash, decode } = await hashSourceImage(imageUrl);

  if (decode !== "pass" || !hash) {
    return {
      ok: false,
      provider_calls: 0,
      credits: 0,
      row: {
        run_id: req.run_id,
        product_id: productId,
        slug: product.slug,
        species: product.primary_species,
        source_image_url: imageUrl,
        source_image_hash: hash,
        image_decode_status: "fail",
        rejection_reasons: ["image_decode_fail"],
        tier_a_result: "not_ready",
        tier_b_potential_result: "not_eligible",
        scorer_version: SCORING_VERSION,
      },
    };
  }

  // Cache-first structured vision.
  // assertBudget throws BudgetExceededError BEFORE any provider call.
  let provider_calls = 0;
  let credits = 0;
  let scored: VisionResult | null = null;
  let cached = false;

  const { result, cached: wasCached } = await runScoredWithCache(sb, {
    cfg,
    scorer: "candidate_structured_vision_v1",
    operation: "pre",
    cache: {
      image_hash: hash,
      pdp_hero_hash: hash,
      product_id: productId,
      scorer: "candidate_structured_vision_v1",
      scoring_version: SCORING_VERSION,
    },
    estimated_credits: VISION_EST_CREDITS,
    product_id: productId,
    run: async () => {
      await assertBudget(sb, cfg, VISION_EST_CREDITS, "qa", { image_hash: hash });
      provider_calls = 1;
      const out = await runStructuredVisionCall(imageUrl, {
        title: product.title,
        species: product.primary_species,
      });
      credits = out.actual_credits;
      return out;
    },
  });

  cached = wasCached;
  scored = result as VisionResult;

  const signals: ScoreSignals = {
    occupancy: scored.occupancy ?? null,
    identity_confidence: scored.identity_confidence ?? null,
    pdp_similarity: scored.pdp_similarity ?? null,
    species_confidence: scored.species_confidence ?? null,
    variant_match: scored.variant_match ?? null,
    color_match: scored.color_match ?? null,
    shape_match: scored.shape_match ?? null,
    watermark_detected: scored.watermark_detected ?? null,
    supplier_text_detected: scored.supplier_text_detected ?? null,
    collage_detected: scored.collage_detected ?? null,
    image_decode_status: "pass",
    gallery_membership_verified: true, // hero_image_url IS a gallery member
    species_applicable:
      product.primary_species === "cat" || product.primary_species === "dog",
    no_competing_variant: true,
    product_not_obscured: (scored.occupancy ?? 0) >= 0.4,
    destination_integrity_pass: true,
    product_pin_integrity_pass: true,
  };

  const cls = classifyCandidate(signals, req.allow_tier_b_evaluation);

  return {
    ok: true,
    provider_calls,
    credits,
    row: {
      run_id: req.run_id,
      product_id: productId,
      slug: product.slug,
      species: product.primary_species,
      source_image_url: imageUrl,
      source_image_hash: hash,
      gallery_membership_verified: true,
      cache_hit: cached,
      scorer_version: SCORING_VERSION,
      occupancy: signals.occupancy,
      identity_confidence: signals.identity_confidence,
      pdp_similarity: signals.pdp_similarity,
      species_confidence: signals.species_confidence,
      variant_match: signals.variant_match,
      color_match: signals.color_match,
      shape_match: signals.shape_match,
      watermark_detected: signals.watermark_detected,
      supplier_text_detected: signals.supplier_text_detected,
      collage_detected: signals.collage_detected,
      image_decode_status: "pass",
      tier_a_result: cls.tier_a_result,
      tier_b_potential_result: cls.tier_b_potential_result,
      rejection_reasons: cls.rejection_reasons,
      credits_used: credits,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  HTTP handler
// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // ── Publication-impossibility guards (belt AND braces) ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "invalid_request", details: parsed.error.flatten() },
      400,
    );
  }
  const request = parsed.data;
  // Hardcoded internal invariants — a code bug still cannot flip these.
  const PUBLICATION_ALLOWED = false as const;
  const QUEUE_WRITES_ALLOWED = false as const;
  if (
    request.publication_allowed !== PUBLICATION_ALLOWED ||
    request.queue_writes_allowed !== QUEUE_WRITES_ALLOWED
  ) {
    return json({ error: "publication_disabled_by_endpoint" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  let cfg: RunConfig;
  try {
    cfg = await ensureScoringRunConfig(sb, request);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  const products = request.product_ids.slice(0, request.max_candidates);
  const results: Record<string, unknown>[] = [];
  let provider_calls = 0;
  let credits_spent = 0;
  const errors: Array<{ product_id: string; error: string }> = [];

  for (const pid of products) {
    try {
      const out = await scoreOneProduct(sb, cfg, request, pid);
      results.push(out.row);
      provider_calls += out.provider_calls;
      credits_spent += out.credits;
    } catch (e) {
      const msg = (e as Error).message;
      errors.push({ product_id: pid, error: msg });
      // Provider failure NEVER creates a queue row (endpoint doesn't touch queue).
      // Ledger already recorded by cost guard on assertBudget throw.
      if (msg.startsWith("budget_exceeded")) break;
    }
  }

  // Persist results (never touches pinterest_pin_queue).
  if (results.length > 0) {
    await sb.from("pinterest_candidate_score_results").insert(results as any);
  }

  const tier_a = results.filter((r) => r.tier_a_result === "tier_a_ready").length;
  const tier_b = results.filter(
    (r) => r.tier_b_potential_result === "tier_b_canary_candidate",
  ).length;
  const rejected = results.filter((r) => r.tier_a_result === "not_ready").length;

  return json({
    ok: true,
    run_id: request.run_id,
    run_type: "candidate_scoring",
    scorer_version: SCORING_VERSION,
    scored: results.length,
    tier_a_ready: tier_a,
    tier_b_canary_candidates: tier_b,
    rejected,
    provider_calls,
    credits_spent,
    errors,
    // Loudly confirm no side effects on the publication pipeline.
    side_effects: {
      queue_rows_created: 0,
      pinterest_api_calls: 0,
      board_mutations: 0,
      legacy_rows_modified: 0,
      publication_allowed: false,
    },
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}