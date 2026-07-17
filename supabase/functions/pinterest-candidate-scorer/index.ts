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
import {
  RequestSchema,
  assembleLegacyCacheRows,
  classifyCandidate,
  evaluateStructuredCacheRow,
  TIER_A,
  TIER_B,
  type CacheCompatibility,
  type CacheRowLike,
  type ScoreSignals,
  type ScoringRequest,
  type VisionScoreResult,
} from "./pure.ts";
export { RequestSchema, classifyCandidate, TIER_A, TIER_B };
export type { ScoreSignals, ScoringRequest };

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
  buildCacheKey,
  runScoredWithCache,
  sha256Hex,
} from "../_shared/pinterest-qa-cache.ts";

// (Request schema, classifier, and thresholds live in ./pure.ts and are re-exported above.)

// ────────────────────────────────────────────────────────────────────────────
//  Structured vision scoring (Lovable AI Gateway — Gemini Flash)
// ────────────────────────────────────────────────────────────────────────────

type VisionResult = VisionScoreResult;

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
  gallery_image_urls: string[];
}

async function loadProduct(sb: SupabaseClient, id: string): Promise<ProductRow | null> {
  const { data, error } = await sb
    .from("products")
    .select("id,slug,title:name,primary_species,active:is_active,effective_stock,hero_image_url:image_url,gallery_image_urls:images")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`product_lookup_failed:${error.message}`);
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

const CANDIDATE_SCORER = "candidate_structured_vision_v1";
const COMPATIBLE_CURRENT_VERSIONS = [SCORING_VERSION];
const COMPATIBLE_LEGACY_VERSIONS = ["v1"];

interface CacheLookupReport {
  cache_key_requested: string;
  cache_lookup_status: "HIT" | "MISS" | "CACHE_INCOMPATIBLE" | "CACHE_MISS_NO_SPEND";
  cache_namespace: "candidate_scorer" | "legacy_source_preflight" | "none";
  cache_hit: boolean;
  cache_row_id: string | null;
  cache_scoring_version: string | null;
  cache_scorer: string | null;
  cache_created_at: string | null;
  cache_updated_at: string | null;
  cached_product_id: string | null;
  cached_image_url: string | null;
  cached_scores: Record<string, unknown> | null;
  cache_incompatibility_reasons: string[];
}

async function lookupCompatibleCache(
  sb: SupabaseClient,
  productId: string,
  imageHash: string,
): Promise<CacheLookupReport & { result: VisionResult | null }> {
  const cacheKey = await buildCacheKey({
    image_hash: imageHash,
    pdp_hero_hash: imageHash,
    product_id: productId,
    scorer: CANDIDATE_SCORER,
    scoring_version: SCORING_VERSION,
  });

  const { data: currentRows } = await sb
    .from("pinterest_qa_score_cache")
    .select("cache_key,scorer,scoring_version,image_hash,pdp_hero_hash,product_id,result,passed,created_at,last_hit_at")
    .eq("cache_key", cacheKey)
    .limit(1);

  const current = (currentRows?.[0] ?? null) as CacheRowLike | null;
  const currentDecision = evaluateStructuredCacheRow(current, {
    product_id: productId,
    image_hash: imageHash,
    pdp_hero_hash: imageHash,
    scorer: CANDIDATE_SCORER,
    compatible_scoring_versions: COMPATIBLE_CURRENT_VERSIONS,
  });
  if (currentDecision.decision === "HIT") {
    return cacheReport(cacheKey, "candidate_scorer", current, currentDecision, currentDecision.result);
  }
  if (currentDecision.decision === "CACHE_INCOMPATIBLE") {
    return cacheReport(cacheKey, "candidate_scorer", current, currentDecision, null);
  }

  const { data: legacyRows } = await sb
    .from("pinterest_qa_score_cache")
    .select("cache_key,scorer,scoring_version,image_hash,pdp_hero_hash,product_id,result,passed,created_at,last_hit_at")
    .eq("product_id", productId)
    .eq("image_hash", imageHash)
    .in("scorer", [
      "occupancy",
      "identity",
      "pdp_similarity",
      "species",
      "variant_match",
      "color_match",
      "shape_match",
      "watermark",
      "supplier_text",
      "collage",
    ]);

  const legacy = assembleLegacyCacheRows((legacyRows ?? []) as CacheRowLike[], {
    product_id: productId,
    image_hash: imageHash,
    pdp_hero_hash: imageHash,
    compatible_scoring_versions: COMPATIBLE_LEGACY_VERSIONS,
  });
  if (legacy.decision === "HIT") {
    return cacheReport(cacheKey, "legacy_source_preflight", (legacyRows?.[0] ?? null) as CacheRowLike | null, legacy, legacy.result, legacyRows as CacheRowLike[]);
  }
  if (legacy.decision === "CACHE_INCOMPATIBLE") {
    return cacheReport(cacheKey, "legacy_source_preflight", (legacyRows?.[0] ?? null) as CacheRowLike | null, legacy, null, legacyRows as CacheRowLike[]);
  }

  return {
    cache_key_requested: cacheKey,
    cache_lookup_status: "MISS",
    cache_namespace: "none",
    cache_hit: false,
    cache_row_id: null,
    cache_scoring_version: null,
    cache_scorer: null,
    cache_created_at: null,
    cache_updated_at: null,
    cached_product_id: null,
    cached_image_url: null,
    cached_scores: null,
    cache_incompatibility_reasons: ["cache_row_missing"],
    result: null,
  };
}

function cacheReport(
  cacheKey: string,
  namespace: "candidate_scorer" | "legacy_source_preflight",
  row: CacheRowLike | null,
  decision: CacheCompatibility,
  result: VisionResult | null,
  rows?: CacheRowLike[],
): CacheLookupReport & { result: VisionResult | null } {
  return {
    cache_key_requested: cacheKey,
    cache_lookup_status: decision.decision,
    cache_namespace: namespace,
    cache_hit: decision.decision === "HIT",
    cache_row_id: row?.cache_key ?? null,
    cache_scoring_version: row?.scoring_version ?? null,
    cache_scorer: row?.scorer ?? null,
    cache_created_at: row?.created_at ?? null,
    cache_updated_at: row?.last_hit_at ?? row?.created_at ?? null,
    cached_product_id: row?.product_id ?? null,
    cached_image_url: null,
    cached_scores: rows ? Object.fromEntries(rows.map((r) => [r.scorer ?? "unknown", r.result ?? null])) : row?.result ?? null,
    cache_incompatibility_reasons: decision.reasons,
    result,
  };
}

function persistable(row: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    "run_id",
    "product_id",
    "species",
    "slug",
    "source_image_url",
    "source_image_hash",
    "gallery_membership_verified",
    "cache_hit",
    "scorer_version",
    "occupancy",
    "identity_confidence",
    "pdp_similarity",
    "species_confidence",
    "variant_match",
    "color_match",
    "shape_match",
    "watermark_detected",
    "supplier_text_detected",
    "collage_detected",
    "image_decode_status",
    "tier_a_result",
    "tier_b_potential_result",
    "rejection_reasons",
    "credits_used",
  ]);
  return Object.fromEntries(Object.entries(row).filter(([key]) => allowed.has(key)));
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
): Promise<{ ok: boolean; row: Record<string, unknown>; report: Record<string, unknown>; provider_calls: number; credits: number }> {
  const product = await loadProduct(sb, productId);
  if (!product) {
    const row = {
      run_id: req.run_id,
      product_id: productId,
      rejection_reasons: ["product_not_found"],
      tier_a_result: "not_ready",
      tier_b_potential_result: "not_eligible",
      scorer_version: SCORING_VERSION,
      deterministic_prefilter_failure: ["product_not_found"],
    };
    return {
      ok: false,
      provider_calls: 0,
      credits: 0,
      row: persistable(row),
      report: row,
    };
  }

  // Zero-cost prefilter
  const prefilter_reasons: string[] = [];
  if (!product.active) prefilter_reasons.push("inactive");
  if ((product.effective_stock ?? 0) <= 0) prefilter_reasons.push("out_of_stock");
  if (!product.hero_image_url) prefilter_reasons.push("no_source_image");

  if (prefilter_reasons.length > 0) {
    const row = {
      run_id: req.run_id,
      product_id: productId,
      slug: product.slug,
      species: product.primary_species,
      current_pdp_hero_url: product.hero_image_url,
      current_gallery_image_urls: product.gallery_image_urls,
      rejection_reasons: prefilter_reasons,
      tier_a_result: "not_ready",
      tier_b_potential_result: "not_eligible",
      scorer_version: SCORING_VERSION,
      deterministic_prefilter_failure: prefilter_reasons,
    };
    return {
      ok: false,
      provider_calls: 0,
      credits: 0,
      row: persistable(row),
      report: row,
    };
  }

  const imageUrl = product.hero_image_url!;
  const { hash, decode } = await hashSourceImage(imageUrl);

  if (decode !== "pass" || !hash) {
    const row = {
      run_id: req.run_id,
      product_id: productId,
      slug: product.slug,
      species: product.primary_species,
      source_image_url: imageUrl,
      source_image_hash: hash,
      current_pdp_hero_url: product.hero_image_url,
      current_gallery_image_urls: product.gallery_image_urls,
      image_decode_status: "fail",
      rejection_reasons: ["image_decode_fail"],
      tier_a_result: "not_ready",
      tier_b_potential_result: "not_eligible",
      scorer_version: SCORING_VERSION,
      deterministic_prefilter_failure: ["image_decode_fail"],
    };
    return {
      ok: false,
      provider_calls: 0,
      credits: 0,
      row: persistable(row),
      report: row,
    };
  }

  // Cache-first structured vision.
  // assertBudget throws BudgetExceededError BEFORE any provider call.
  let provider_calls = 0;
  let credits = 0;
  let scored: VisionResult | null = null;
  let cached = false;
  const cacheLookup = await lookupCompatibleCache(sb, productId, hash);

  if (cacheLookup.cache_lookup_status === "HIT" && cacheLookup.result) {
    cached = true;
    scored = cacheLookup.result;
  } else if (cacheLookup.cache_lookup_status === "CACHE_INCOMPATIBLE") {
    const row = {
      run_id: req.run_id,
      product_id: productId,
      slug: product.slug,
      species: product.primary_species,
      source_image_url: imageUrl,
      source_image_hash: hash,
      current_pdp_hero_url: product.hero_image_url,
      current_gallery_image_urls: product.gallery_image_urls,
      gallery_membership_verified: product.gallery_image_urls.includes(imageUrl),
      cache_hit: false,
      scorer_version: SCORING_VERSION,
      image_decode_status: "pass",
      tier_a_result: "unknown",
      tier_b_potential_result: "unknown",
      rejection_reasons: ["CACHE_INCOMPATIBLE", ...cacheLookup.cache_incompatibility_reasons],
      credits_used: 0,
      cache_compatibility_decision: "CACHE_INCOMPATIBLE",
      ...cacheLookup,
    };
    return { ok: true, provider_calls: 0, credits: 0, row: persistable(row), report: row };
  } else if (req.max_paid_calls === 0 || req.max_credit_spend === 0) {
    const row = {
      run_id: req.run_id,
      product_id: productId,
      slug: product.slug,
      species: product.primary_species,
      source_image_url: imageUrl,
      source_image_hash: hash,
      current_pdp_hero_url: product.hero_image_url,
      current_gallery_image_urls: product.gallery_image_urls,
      gallery_membership_verified: product.gallery_image_urls.includes(imageUrl),
      cache_hit: false,
      scorer_version: SCORING_VERSION,
      image_decode_status: "pass",
      tier_a_result: "unknown",
      tier_b_potential_result: "unknown",
      rejection_reasons: ["CACHE_MISS_NO_SPEND"],
      credits_used: 0,
      cache_compatibility_decision: "CACHE_MISS_NO_SPEND",
      ...cacheLookup,
      cache_lookup_status: "CACHE_MISS_NO_SPEND",
    };
    return { ok: true, provider_calls: 0, credits: 0, row: persistable(row), report: row };
  }

  if (!scored) {
    const { result, cached: wasCached } = await runScoredWithCache(sb, {
      cfg,
      scorer: CANDIDATE_SCORER,
      operation: "pre",
      cache: {
        image_hash: hash,
        pdp_hero_hash: hash,
        product_id: productId,
        scorer: CANDIDATE_SCORER,
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
  }

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
    gallery_membership_verified: product.gallery_image_urls.includes(imageUrl),
    species_applicable:
      product.primary_species === "cat" || product.primary_species === "dog",
    no_competing_variant: true,
    product_not_obscured: (scored.occupancy ?? 0) >= 0.4,
    destination_integrity_pass: true,
    product_pin_integrity_pass: true,
  };

  const cls = classifyCandidate(signals, req.allow_tier_b_evaluation);

  const row = {
    run_id: req.run_id,
    product_id: productId,
    slug: product.slug,
    species: product.primary_species,
    source_image_url: imageUrl,
    source_image_hash: hash,
    current_pdp_hero_url: product.hero_image_url,
    current_gallery_image_urls: product.gallery_image_urls,
    gallery_membership_verified: signals.gallery_membership_verified,
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
    deterministic_prefilter_failure: [],
    cache_compatibility_decision: cached ? "HIT" : "MISS_PAID_SCORE",
    ...cacheLookup,
  };

  return {
    ok: true,
    provider_calls,
    credits,
    row: persistable(row),
    report: row,
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
  const reports: Record<string, unknown>[] = [];
  let provider_calls = 0;
  let credits_spent = 0;
  const errors: Array<{ product_id: string; error: string }> = [];

  for (const pid of products) {
    try {
      const out = await scoreOneProduct(sb, cfg, request, pid);
      results.push(out.row);
      reports.push(out.report);
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
    results: reports,
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