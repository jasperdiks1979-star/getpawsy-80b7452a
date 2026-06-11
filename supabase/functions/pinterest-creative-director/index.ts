// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Creative Director
// ─────────────────────────────────────────────────────────────────────────────
// Replaces template-based pin generation with a per-product AI direction layer:
//
//   1. profile_product   → detect niche, build/cache a creative profile
//   2. generate_briefs   → ask Lovable AI for N concrete scene briefs
//   3. render_pins       → render each brief with a premium image model
//   4. run_full          → chains all three and inserts as `draft` rows
//
// Output is fully-composed lifestyle photography — never floating product
// PNGs over Pexels backdrops. Drafts always require human approval before
// publishing (no auto-publish).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  detectNiche,
  getStyleDNA,
  type NicheKey,
  type StyleDNA,
} from "../_shared/pinterest-style-dna.ts";
import {
  PATTERN_LIBRARY,
  getPattern,
  selectPatternsForNiche,
  patternQualityReasons,
  type PatternId,
  type PinterestPattern,
} from "../_shared/pinterest-patterns.ts";
import {
  pickStrategy,
  type CreativeStrategy,
  type LearningWeight,
  type HookCategory,
} from "../_shared/pinterest-hooks.ts";
import {
  generateProductHooks,
  scoreHookRelevance,
  deriveBenefits,
  type ProductHook,
  type HookArchetype,
} from "../_shared/pinterest-product-hooks.ts";
import { scorePin, QUALITY_THRESHOLD, MAX_RETRIES } from "../_shared/pinterest-quality.ts";
import { buildVisualPlan, type VisualPlan } from "../_shared/pinterest-visual-intelligence.ts";
import { getPinMode, type PinModeKey } from "../_shared/pinterest-pin-modes.ts";
import { buildCollagePromptSuffix } from "../_shared/pinterest-collage.ts";
import { computePhashFromBytes } from "../_shared/pinterest-phash.ts";
import { DiversityGuard, normaliseCategoryKey } from "../_shared/pinterest-diversity-guard.ts";
import { buildPinCopy, sanitizePinText } from "../_shared/pinterest-board-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const BASE_URL = "https://getpawsy.pet";
const BUCKET = "pinterest-ads";
const IMAGE_MODEL =
  Deno.env.get("PINTEREST_CD_IMAGE_MODEL") ||
  "google/gemini-3-pro-image-preview";
const TEXT_MODEL =
  Deno.env.get("PINTEREST_CD_TEXT_MODEL") || "google/gemini-3-flash-preview";

// ── helpers ────────────────────────────────────────────────────────────────

function traceId() {
  return crypto.randomUUID().slice(0, 8);
}

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ ok: false, message, traceId: traceId(), ...extra }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

function safeText(s: string, max: number) {
  const trimmed = (s || "").replace(/\s+/g, " ").trim();
  return trimmed.length > max ? trimmed.slice(0, max - 1).trimEnd() + "…" : trimmed;
}

function containsBanned(s: string, banned: string[]): string | null {
  const low = s.toLowerCase();
  for (const b of banned) if (low.includes(b)) return b;
  return null;
}

/**
 * SPEC §3 — persist a predicted CTR per draft. Lightweight heuristic that
 * blends quality score (0-100) and hook relevance (0-100) into a 0-5%
 * range. Real Pinterest CTR rolls up nightly via the winner pipeline.
 */
function predictCtr(brief: SceneBrief, scores: Record<string, number>): number {
  const q = Number(scores?.total ?? 80);
  const r = Number(brief.hook_relevance ?? 80);
  const base = 0.012 + (q / 100) * 0.018 + (r / 100) * 0.012; // 1.2% – 4.2%
  const archBoost: Record<string, number> = {
    problem: 0.003, outcome: 0.002, benefit: 0.002, curiosity: 0.0015, emotional: 0.001,
  };
  return Math.round((base + (archBoost[brief.hook_archetype ?? ""] ?? 0)) * 10000) / 100;
}

// Decode base64 (data URL or raw) into Uint8Array
function decodeBase64Image(input: string): { bytes: Uint8Array; mime: string } {
  let mime = "image/png";
  let b64 = input;
  const m = input.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (m) {
    mime = m[1];
    b64 = m[2];
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

// ── scene brief shape ──────────────────────────────────────────────────────

interface SceneBrief {
  id: string;
  composition: string;
  environment_summary: string;
  subject: string;
  emotional_hook: string;
  headline: string; // ≤ 42 chars
  cta: string; // ≤ 18 chars
  /** Free-form prompt the image model receives. */
  full_prompt: string;
  pattern_id?: PatternId;
  hook_category?: HookCategory;
  strategy_rationale?: string;
  retry_reasons?: string[];
  pin_mode?: PinModeKey;
  /** Where the headline came from: 'ai_product' (per-product AI) or 'fallback_bank'. */
  hook_source?: ProductHook["source"];
  /** Relevance score (0-100) of the headline vs. the product. */
  hook_relevance?: number;
  hook_archetype?: HookArchetype;
  product_benefits?: string[];
  product_features?: string[];
}

// ── 1. profile_product ─────────────────────────────────────────────────────

async function loadOrBuildProfile(
  supabase: ReturnType<typeof createClient>,
  productId: string,
  force: boolean,
): Promise<{ niche: NicheKey; dna: StyleDNA; product: any; cached: boolean }> {
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, slug, description, category, product_type, image_url, key_feature, benefit_angle, description_bullets, price")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(`product lookup failed: ${error.message}`);
  if (!product) throw new Error(`product not found: ${productId}`);

  if (!force) {
    const { data: cached } = await supabase
      .from("product_creative_profiles")
      .select("niche_key, profile")
      .eq("product_id", productId)
      .maybeSingle();
    if (cached?.niche_key) {
      return {
        niche: cached.niche_key as NicheKey,
        dna: getStyleDNA(cached.niche_key as NicheKey),
        product,
        cached: true,
      };
    }
  }

  const niche = detectNiche(product);
  const dna = getStyleDNA(niche);

  await supabase.from("product_creative_profiles").upsert(
    {
      product_id: productId,
      niche_key: niche,
      profile: dna as unknown as Record<string, unknown>,
      briefs_version: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id" },
  );

  return { niche, dna, product, cached: false };
}

// ── 2. generate_briefs ─────────────────────────────────────────────────────

async function generateBriefs(
  product: {
    name: string;
    description?: string | null;
    category?: string | null;
    key_feature?: string | null;
    benefit_angle?: string | null;
    description_bullets?: string[] | string | null;
  },
  dna: StyleDNA,
  count: number,
  patternIds?: PatternId[],
  weights: LearningWeight[] = [],
  retryReasonsByIndex: Record<number, string[]> = {},
  visualPlans: VisualPlan[] = [],
): Promise<SceneBrief[]> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const patterns = (patternIds && patternIds.length === count
    ? patternIds
    : selectPatternsForNiche(dna.niche_key as any, count)
  ).map((id) => getPattern(id));

  // Pick a hook strategy per brief BEFORE we call the model so the AI just
  // executes a locked plan and can't go off-brand.
  const strategies: CreativeStrategy[] = patterns.map((p) =>
    pickStrategy({ niche: dna.niche_key as any, dna, pattern: p, weights }),
  );

  // PRODUCT-TRUTHFUL HEADLINES: generate N hooks straight from the
  // product's name/description/category and override the bank-picked
  // strategy.hook_phrase with them. The strategy still chooses the hook
  // CATEGORY (for analytics + learning), but the actual headline copy is
  // now grounded in this specific product instead of a generic niche bank.
  // Normalize product features + benefits coming out of the products table.
  const featureList = [product.key_feature, ...(Array.isArray(product.description_bullets)
    ? product.description_bullets
    : typeof product.description_bullets === "string"
      ? product.description_bullets.split(/\n|•|\u2022|;|\|/)
      : [])]
    .map((s) => (s ?? "").toString().trim())
    .filter((s) => s.length > 0)
    .slice(0, 8);
  const benefitList = [product.benefit_angle]
    .map((s) => (s ?? "").toString().trim())
    .filter((s) => s.length > 0);

  const hookInput = {
    name: product.name,
    description: product.description ?? null,
    category: product.category ?? dna.label,
    features: featureList,
    benefits: benefitList,
  };
  const derivedBenefits = benefitList.length ? benefitList : deriveBenefits(hookInput, dna.niche_key);
  const productHooks = await generateProductHooks({
    product: { ...hookInput, benefits: derivedBenefits },
    niche: dna.niche_key,
    dna,
    count,
  });

  // Pin-mode plan per brief (rotates through niche affinity for variety).
  const plans: VisualPlan[] = patterns.map((_, i) =>
    visualPlans[i] ??
    buildVisualPlan({ name: product.name, rotateSeed: i }),
  );

  const sys = [
    "You are a Creative Director for a premium US pet brand running Pinterest ads.",
    "You write SCENE BRIEFS for an AI image model that will photograph each scene.",
    "Style: editorial DTC photography. NEVER floating product cards, NEVER collage,",
    "NEVER giant CTA bars, NEVER text overlays in the brief itself (text is added later).",
    "Each brief must be a fully-composed real lifestyle scene with the product naturally placed.",
    "Each brief is locked to ONE provided Pinterest winning pattern AND ONE hook strategy.",
    "Use the provided headline and cta verbatim — they have been chosen by the strategy engine.",
  ].join(" ");

  const user = {
    product_name: product.name,
    product_summary: safeText(product.description || "", 600),
    product_features: featureList,
    product_benefits: derivedBenefits,
    product_category: product.category ?? dna.label,
    niche: dna.niche_key,
    environment: dna.environment,
    light: dna.light,
    mood: dna.mood,
    typography: dna.typography,
    hook_bank: dna.hook_bank,
    subjects: dna.subjects,
    compositions: dna.compositions,
    cta_bank: dna.cta_bank,
    banned_terms: dna.banned_terms,
    /** Locked pattern per brief, in order. The model MUST follow the i-th pattern for the i-th brief. */
    patterns: patterns.map((p, i) => ({
      index: i,
      id: p.id,
      label: p.label,
      psychology: p.psychology,
      composition_rule: p.composition_rule,
      hook_angle: p.hook_angle,
      whitespace: p.whitespace,
      must_have: p.must_have,
      must_avoid: p.must_avoid,
    })),
    strategies: strategies.map((s, i) => ({
      index: i,
      hook_category: s.hook_category,
      headline: productHooks[i]?.headline ?? s.hook_phrase,
      cta: s.cta_phrase,
      scene_directive: s.scene_directive,
      rationale: productHooks[i]?.rationale ?? s.rationale,
      hook_source: productHooks[i]?.source ?? "fallback_bank",
      hook_relevance: productHooks[i]?.relevance ?? null,
    })),
    /** Locked Pinterest pin-mode per brief. Defines aesthetic + composition
     *  archetype the model must respect on top of the niche pattern. */
    pin_modes: plans.map((p, i) => {
      const m = getPinMode(p.pin_mode);
      return {
        index: i,
        key: m.key,
        label: m.label,
        psychology: m.psychology,
        composition_rule: m.composition_rule,
        palette: m.palette,
        cta_tone: m.cta_tone,
        must_have: m.must_have,
        must_avoid: m.must_avoid,
        is_collage: m.is_collage,
        commerce_archetype: p.commerce_archetype,
        emotional_intent: p.emotional_intent,
      };
    }),
    /** Reasons the previous render of this brief was rejected, if any. The
     *  model MUST address these in the next brief. */
    previous_rejection_reasons: retryReasonsByIndex,
    rules: {
      headline_max_chars: 42,
      cta_max_chars: 18,
      headline_count: 1,
      cta_count: 1,
      no_text_in_image_prompt: true,
      pattern_lock:
        "For each brief at index i, embody patterns[i] — composition_rule defines the scene, hook_angle defines the headline emotion, must_have terms must appear in environment_summary or full_prompt, must_avoid terms must never appear.",
      strategy_lock:
        "Use strategies[i].headline as the headline VERBATIM (it has already been validated for relevance to this exact product) and strategies[i].cta as the cta VERBATIM. Build the scene around strategies[i].scene_directive.",
      pin_mode_lock:
        "Also respect pin_modes[i]: composition_rule, palette and cta_tone shape the scene aesthetic. must_have items must appear in environment_summary or full_prompt; must_avoid items must NEVER appear. If is_collage=true, the brief MUST describe a multi-tile composition (split or moodboard) — never a single hero shot.",
      retry_directive:
        "If previous_rejection_reasons[i] is set, your new brief MUST explicitly correct each listed reason.",
    },
  };

  const tools = [
    {
      type: "function",
      function: {
        name: "scene_briefs",
        description: "Return N premium Pinterest scene briefs.",
        parameters: {
          type: "object",
          properties: {
            briefs: {
              type: "array",
              minItems: count,
              maxItems: count,
              items: {
                type: "object",
                properties: {
                  composition: { type: "string" },
                  environment_summary: { type: "string" },
                  subject: { type: "string" },
                  emotional_hook: { type: "string" },
                  headline: { type: "string", maxLength: 42 },
                  cta: { type: "string", maxLength: 18 },
                  full_prompt: {
                    type: "string",
                    description:
                      "Photorealistic prompt for the image model. NO text, NO captions, NO product PNGs — describe the real scene with product naturally integrated.",
                  },
                },
                required: [
                  "composition",
                  "environment_summary",
                  "subject",
                  "emotional_hook",
                  "headline",
                  "cta",
                  "full_prompt",
                ],
                additionalProperties: false,
              },
            },
          },
          required: ["briefs"],
          additionalProperties: false,
        },
      },
    },
  ];

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content:
            `Generate exactly ${count} unique scene briefs for this product. ` +
            `Each brief must use a different composition and emotional hook. ` +
            `Input:\n` +
            JSON.stringify(user, null, 2),
        },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "scene_briefs" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI returned no tool call");
  const args = JSON.parse(call.function.arguments || "{}");
  const briefs: any[] = Array.isArray(args.briefs) ? args.briefs : [];
  if (!briefs.length) throw new Error("AI returned 0 briefs");

  return briefs.map((b, i) => ({
    id: `brief_${i + 1}_${crypto.randomUUID().slice(0, 6)}`,
    composition: String(b.composition || ""),
    environment_summary: String(b.environment_summary || ""),
    subject: String(b.subject || ""),
    emotional_hook: String(b.emotional_hook || ""),
    // Headline lock: the product-truthful hook ALWAYS wins. We do not let the
    // image-brief AI rewrite it (it would drift back to generic copy).
    headline: safeText(
      productHooks[i]?.headline ||
        String(b.headline || strategies[i]?.hook_phrase || ""),
      42,
    ),
    cta: safeText(String(b.cta || strategies[i]?.cta_phrase || ""), 18),
    full_prompt: String(b.full_prompt || ""),
    pattern_id: patterns[i]?.id,
    hook_category: strategies[i]?.hook_category,
    strategy_rationale: productHooks[i]?.rationale ?? strategies[i]?.rationale,
    retry_reasons: retryReasonsByIndex[i],
    pin_mode: plans[i]?.pin_mode,
    hook_source: productHooks[i]?.source ?? "fallback_bank",
    hook_relevance: productHooks[i]?.relevance,
    hook_archetype: productHooks[i]?.archetype,
    product_benefits: derivedBenefits,
    product_features: featureList,
  }));
}

// ── 3. render scene ────────────────────────────────────────────────────────

async function renderScene(brief: SceneBrief, dna: StyleDNA): Promise<Uint8Array> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
  return await renderSceneWithSource(brief, dna, null, null);
}

/**
 * SPEC §Product-Truth — image-to-image render that uses the actual Shopify
 * product photo as the visual source. The image model is instructed to
 * preserve product shape/color/material/structure and ONLY change the
 * surrounding lifestyle context (room, lighting, camera angle, pet, decor).
 */
async function renderSceneWithSource(
  brief: SceneBrief,
  dna: StyleDNA,
  productImageUrl: string | null,
  overlay: { text: string; brand: string } | null = null,
): Promise<Uint8Array> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const pattern = brief.pattern_id ? getPattern(brief.pattern_id) : null;
  const patternDirective = pattern
    ? `\nPattern lock — ${pattern.label}: ${pattern.composition_rule} ` +
      `Whitespace budget: ${pattern.whitespace}. ` +
      `Negative directives — strictly avoid: ${pattern.must_avoid.join(", ")}.`
    : "";

  const mode = brief.pin_mode ? getPinMode(brief.pin_mode) : null;
  const modeDirective = mode
    ? `\nPinterest pin mode — ${mode.label}: ${mode.composition_rule} ` +
      `Palette: ${mode.palette}. ` +
      `${mode.is_collage ? "This MUST be a tasteful multi-tile composition (split or moodboard), not a single hero shot. " : ""}` +
      `Strictly avoid: ${mode.must_avoid.join(", ")}.`
    : "";

  const collageDirective = mode
    ? buildCollagePromptSuffix(mode, dna, {
        subject: brief.subject,
        environment_summary: brief.environment_summary,
      })
    : "";

  const overlayDirective = overlay
    ? ` Render EXACTLY ONE short benefit caption in clean modern sans-serif typography ` +
      `(white text with a soft drop shadow OR a thin translucent bar) reading verbatim: ` +
      `"${overlay.text}". Also render a small wordmark in the bottom-right corner reading verbatim: ` +
      `"${overlay.brand}". Do NOT render any other text, captions, prices, CTAs, emojis, hashtags, or graphics.`
    : ` Do NOT render any text, captions, watermarks, logos, or graphic overlays in the image itself.`;
  const styleSuffix =
    `Clean premium product photography, ${dna.light}, mood: ${dna.mood}. ` +
    `Premium DTC pet brand aesthetic. Realistic textures, natural shadows, correct perspective. ` +
    `Vertical 9:16 composition for Pinterest.${overlayDirective} ` +
    `Absolutely NO floating product cutouts, NO collage, NO template look, NO CTA bars, NO price tags.`;

  // For collage modes, replace the anti-collage clause with the explicit
  // collage contract so the image model isn't given contradictory directives.
  const styleSuffixForMode = mode?.is_collage
    ? `Clean premium product photography, ${dna.light}, mood: ${dna.mood}. ` +
      `Premium DTC pet brand aesthetic. Realistic textures, natural shadows, correct perspective. ` +
      `Vertical 9:16 composition for Pinterest.${overlayDirective} ` +
      `No floating product cutouts, no Canva-template look, no CTA bars, no price tags.`
    : styleSuffix;

  const prompt = `${brief.full_prompt}\n\nDirection: ${styleSuffixForMode}${patternDirective}${modeDirective}${collageDirective}`;
  // SPEC §6 — Image grounding: explicitly inject product truth into the
  // image prompt so the visual model can't drift to generic stock scenes.
  const benefitLine = (brief.product_benefits || []).slice(0, 4).join(", ");
  const featureLine = (brief.product_features || []).slice(0, 4).join(", ");
  const sourceLock = productImageUrl
    ? "SOURCE IMAGE LOCK — the attached photo IS the exact product to render. " +
      "You MUST preserve the product's shape, silhouette, proportions, dimensions, color palette, materials, textures, accessories, levels/tiers, and structural details with photographic fidelity. " +
      "Do NOT redesign, recolor, add or remove levels, swap materials, change the model, or generate a different product. " +
      "ONLY change the surrounding lifestyle context: room, set dressing, lighting, camera angle, pet presence, decor. " +
      "Place THIS EXACT product into the new scene as if photographed there. "
    : "";
  const groundedPrompt =
    sourceLock +
    `Product: ${brief.subject || ""}. ` +
    (benefitLine ? `Benefits to show: ${benefitLine}. ` : "") +
    (featureLine ? `Key features: ${featureLine}. ` : "") +
    prompt;

  // Build multimodal content: when we have a product image, attach it as
  // an image_url so the image model performs image-to-image generation.
  let sourceDataUrl: string | null = null;
  if (productImageUrl) {
    try {
      sourceDataUrl = await fetchAsDataUrl(productImageUrl);
    } catch (e) {
      console.warn("[creative-director] source image fetch failed", (e as Error).message);
    }
  }
  const userContent: unknown = sourceDataUrl
    ? [
        { type: "image_url", image_url: { url: sourceDataUrl } },
        { type: "text", text: groundedPrompt },
      ]
    : groundedPrompt;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: "user", content: userContent }],
      modalities: ["image", "text"],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`image model ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const url: string | undefined =
    data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("image model returned no image");
  const { bytes } = decodeBase64Image(url);
  return bytes;
}

// Fetch a URL and return a base64 data URL. Used to attach the product photo
// as a source image for image-to-image generation and fidelity audits.
async function fetchAsDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`source fetch ${r.status}`);
  const ct = r.headers.get("content-type") || "image/jpeg";
  const buf = new Uint8Array(await r.arrayBuffer());
  // Chunked base64 to avoid stack overflow on large images.
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return `data:${ct};base64,${btoa(bin)}`;
}

/**
 * Product-fidelity audit. Uses a multimodal LLM to compare the generated
 * Pinterest image against the original Shopify product photo and returns a
 * 0-100 score plus a short rationale. Threshold ≥ 90 is required to publish.
 */
const PRODUCT_FIDELITY_THRESHOLD = 90;
const FIDELITY_MODEL = "google/gemini-2.5-flash";

async function auditProductFidelity(
  generatedBytes: Uint8Array,
  productImageUrl: string,
): Promise<{ score: number; notes: string; sourceUsed: string }> {
  if (!LOVABLE_API_KEY) return { score: 0, notes: "no_api_key", sourceUsed: productImageUrl };
  let sourceDataUrl: string;
  try {
    sourceDataUrl = await fetchAsDataUrl(productImageUrl);
  } catch (e) {
    return { score: 0, notes: `source_fetch_failed:${(e as Error).message}`, sourceUsed: productImageUrl };
  }
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < generatedBytes.length; i += CHUNK) {
    bin += String.fromCharCode(...generatedBytes.subarray(i, i + CHUNK));
  }
  const genDataUrl = `data:image/png;base64,${btoa(bin)}`;

  const tools = [
    {
      type: "function",
      function: {
        name: "rate_fidelity",
        description: "Score how faithfully the generated lifestyle pin preserves the exact product from the reference photo.",
        parameters: {
          type: "object",
          properties: {
            score: { type: "number", description: "0-100. 100 = identical product, only context changed. <90 = product is a different model/color/structure/redesign." },
            shape_match: { type: "number" },
            color_match: { type: "number" },
            structure_match: { type: "number" },
            notes: { type: "string" },
          },
          required: ["score", "notes"],
        },
      },
    },
  ];
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: FIDELITY_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a strict QA inspector for a DTC pet brand's Pinterest ads. The FIRST image is the canonical Shopify product photo (the SKU we sell). The SECOND image is an AI-generated lifestyle pin that is supposed to feature the SAME exact product. Compare them on shape, silhouette, proportions, color, materials, levels/tiers, and accessory presence. Lifestyle context (room, lighting, pets, decor) is allowed to differ — only product identity matters. Use the rate_fidelity tool. Score 100 if the depicted product would be indistinguishable from the source SKU. Score below 90 if shape, color, materials, or structure differ enough that a buyer would feel misled.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Image 1 = canonical product photo. Image 2 = generated Pinterest pin. Rate product fidelity." },
              { type: "image_url", image_url: { url: sourceDataUrl } },
              { type: "image_url", image_url: { url: genDataUrl } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "rate_fidelity" } },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { score: 0, notes: `auditor_${resp.status}:${t.slice(0, 120)}`, sourceUsed: productImageUrl };
    }
    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return { score: 0, notes: "no_tool_call", sourceUsed: productImageUrl };
    const parsed = JSON.parse(call.function.arguments || "{}");
    const score = Math.max(0, Math.min(100, Number(parsed.score ?? 0)));
    return { score, notes: String(parsed.notes || ""), sourceUsed: productImageUrl };
  } catch (e) {
    return { score: 0, notes: `audit_error:${(e as Error).message}`, sourceUsed: productImageUrl };
  }
}

// ── 4. quality filter (delegates to multi-axis scorer) ─────────────────────

async function qualityCheck(
  brief: SceneBrief,
  bytes: Uint8Array,
  dna: StyleDNA,
) {
  const pattern = brief.pattern_id ? getPattern(brief.pattern_id) : null;
  const mode = brief.pin_mode ? getPinMode(brief.pin_mode) : null;
  return await scorePin({
    bytes,
    headline: brief.headline,
    cta: brief.cta,
    full_prompt: brief.full_prompt,
    environment_summary: brief.environment_summary,
    dna,
    pattern,
    pin_mode_label: mode?.label,
    pin_mode_key: mode?.key,
  });
}

// ── 4b. learning weights loader ────────────────────────────────────────────

async function loadLearningWeights(
  supabase: ReturnType<typeof createClient>,
  niche: NicheKey,
): Promise<LearningWeight[]> {
  const { data } = await supabase
    .from("pinterest_pattern_weights")
    .select("pattern_id, hook_category, niche_key, composite_score, sample_size")
    .eq("niche_key", niche)
    .order("composite_score", { ascending: false })
    .limit(50);
  return (data ?? []) as LearningWeight[];
}

/**
 * Phase 5 — read learned pin-mode winners for this niche from
 * `pinterest_winner_dimensions`. Returns ordered [{ pin_mode, score }] so the
 * planner can prefer winning archetypes via epsilon-greedy (80% exploit).
 */
async function loadWinnerPinModes(
  supabase: ReturnType<typeof createClient>,
  niche: NicheKey,
): Promise<Array<{ pin_mode: PinModeKey; score: number }>> {
  try {
    const { data } = await supabase
      .from("pinterest_winner_dimensions")
      .select("pin_mode, composite_score")
      .eq("niche_key", niche)
      .eq("is_active", true)
      .not("pin_mode", "is", null)
      .gte("sample_size", 2)
      .order("composite_score", { ascending: false })
      .limit(10);
    return (data ?? [])
      .map((r) => ({ pin_mode: r.pin_mode as PinModeKey, score: Number(r.composite_score ?? 0) }))
      .filter((r) => !!r.pin_mode);
  } catch (e) {
    console.warn("[creative-director] loadWinnerPinModes failed", (e as Error).message);
    return [];
  }
}

/**
 * Phase 8/10 — load the live evolving strategy state and current trend bias
 * (seasonal + admin-curated). Both are merged into `winnerModes` so the
 * planner exploits proven archetypes AND timely trends.
 */
async function loadStrategyAndTrends(
  supabase: ReturnType<typeof createClient>,
  niche: NicheKey,
): Promise<{
  exploitRatio: number;
  qualityThreshold: number | null;
  pinModeBoost: Record<string, number>;
}> {
  let exploitRatio = 0.8;
  let qualityThreshold: number | null = null;
  const pinModeBoost: Record<string, number> = {};
  try {
    const [{ data: state }, { data: trends }] = await Promise.all([
      supabase.from("pinterest_strategy_state").select("*").eq("id", 1).maybeSingle(),
      supabase.from("pinterest_trend_signals")
        .select("pin_mode, weight, niche_key")
        .eq("is_active", true)
        .or(`niche_key.eq.${niche},niche_key.eq.global`)
        .order("weight", { ascending: false })
        .limit(20),
    ]);
    if (state) {
      exploitRatio = Number(state.exploit_ratio ?? 0.8);
      qualityThreshold = Number(state.quality_threshold ?? 0) || null;
      const archetypeBoosts = (state.archetype_boosts ?? {}) as Record<string, number>;
      for (const [k, v] of Object.entries(archetypeBoosts)) {
        const [n, mode] = k.split(":");
        if (n === niche && mode) pinModeBoost[mode] = Math.max(pinModeBoost[mode] ?? 0, Number(v));
      }
    }
    for (const t of trends ?? []) {
      if (t.pin_mode) {
        pinModeBoost[t.pin_mode] = Math.max(
          pinModeBoost[t.pin_mode] ?? 0,
          Number(t.weight) * 0.15,
        );
      }
    }
  } catch (e) {
    console.warn("[creative-director] loadStrategyAndTrends failed", (e as Error).message);
  }
  return { exploitRatio, qualityThreshold, pinModeBoost };
}

async function logRenderAttempt(
  supabase: ReturnType<typeof createClient>,
  args: {
    pin_queue_id: string | null;
    product_slug: string;
    niche_key: string;
    brief: SceneBrief;
    attempt_no: number;
    scores: Record<string, number>;
    total_score: number;
    rejected: boolean;
    reasons: string[];
  },
) {
  try {
    await supabase.from("pinterest_render_attempts").insert({
      pin_queue_id: args.pin_queue_id,
      product_slug: args.product_slug,
      niche_key: args.niche_key,
      pattern_id: args.brief.pattern_id ?? null,
      hook_category: args.brief.hook_category ?? null,
      attempt_no: args.attempt_no,
      scores: args.scores,
      total_score: args.total_score,
      rejected: args.rejected,
      reasons: args.reasons,
      brief: {
        headline: args.brief.headline,
        cta: args.brief.cta,
        composition: args.brief.composition,
        environment_summary: args.brief.environment_summary,
        emotional_hook: args.brief.emotional_hook,
      },
    });
  } catch (e) {
    console.warn("[creative-director] logRenderAttempt failed", (e as Error).message);
  }
}

// ── 5. upload + insert ─────────────────────────────────────────────────────

/**
 * Pick the best `/go/{slug}` landing template for a given niche + hook.
 * Returns null if no template matches — caller falls back to PDP.
 */
async function pickLandingSlug(
  supabase: ReturnType<typeof createClient>,
  niche: string,
  hook: string | null,
  pinMode: PinModeKey | null = null,
): Promise<string | null> {
  try {
    // Phase 7 — prefer niche+pin_mode match (cozy→cozy, luxury→luxury, etc.),
    // then niche+hook match, then niche-only, then any enabled.
    if (pinMode) {
      const { data } = await supabase
        .from("pinterest_landing_templates")
        .select("slug")
        .eq("enabled", true)
        .eq("niche_key", niche)
        .eq("pin_mode", pinMode)
        .limit(1)
        .maybeSingle();
      if (data?.slug) return data.slug as string;
    }
    if (hook) {
      const { data } = await supabase
        .from("pinterest_landing_templates")
        .select("slug")
        .eq("enabled", true)
        .eq("niche_key", niche)
        .eq("hook_type", hook)
        .limit(1)
        .maybeSingle();
      if (data?.slug) return data.slug as string;
    }
    const { data: nicheOnly } = await supabase
      .from("pinterest_landing_templates")
      .select("slug")
      .eq("enabled", true)
      .eq("niche_key", niche)
      .limit(1)
      .maybeSingle();
    if (nicheOnly?.slug) return nicheOnly.slug as string;
  } catch (e) {
    console.warn("[creative-director] pickLandingSlug failed", (e as Error).message);
  }
  return null;
}

async function uploadAndInsertDraft(
  supabase: ReturnType<typeof createClient>,
  product: { id: string; slug: string; name: string; price?: number | null; benefit?: string | null; category?: string | null },
  niche: NicheKey,
  brief: SceneBrief,
  bytes: Uint8Array,
  variantIndex = 0,
  intelligence?: {
    scores: Record<string, number>;
    attempt_count: number;
    hook_category?: string;
    rationale?: string;
  },
): Promise<{ queueId: string; imageUrl: string }> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const path = `creative-director/${product.slug}/${stamp}_${brief.id}.png`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
      cacheControl: "31536000",
    });
  if (upload.error) throw new Error(`upload failed: ${upload.error.message}`);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const imageUrl = pub.publicUrl;

  // Compute deterministic image hashes so the visual-review UI can dedupe.
  let imageHash: string | null = null;
  let pinPhash: string | null = null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    imageHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  } catch (e) {
    console.warn("[creative-director] sha256 failed", (e as Error).message);
  }
  try {
    pinPhash = await computePhashFromBytes(bytes);
  } catch (e) {
    console.warn("[creative-director] phash failed", (e as Error).message);
  }

  const patternTag = brief.pattern_id ? `_${brief.pattern_id.slice(0, 12)}` : "";
  const variant = `cd_${niche}${patternTag}_${stamp}_${brief.id.slice(-6)}`;

  // Destination URL safety policy (2026-06):
  // The pin generator MUST use the canonical live product URL. The legacy
  // /go/{slug} fan-out invented destinations that did not always resolve to
  // a live in-stock product, which produced 404s in production. We always
  // build /products/{slug} — the cron worker re-validates this server-side
  // before publish via the shared destination validator.
  const landingSlug: string | null = null;
  const hookParam = encodeURIComponent(brief.emotional_hook.slice(0, 40));
  const destination = `${BASE_URL}/products/${product.slug}?utm_source=pinterest&utm_medium=social&utm_campaign=creative_director&utm_content=${niche}&hook=${hookParam}`;

  // ── Deterministic board-template copy (no random AI fluff) ──────────────
  const copy = buildPinCopy(
    {
      name: product.name,
      benefit: product.benefit ?? null,
      category: product.category ?? null,
      price: product.price ?? null,
      niche,
    },
    variantIndex,
  );

  const row = {
    product_id: product.id,
    product_slug: product.slug,
    product_name: product.name,
    pin_variant: variant,
    pin_title: copy.title,
    pin_description: copy.description,
    pin_image_url: imageUrl,
    destination_link: destination,
    priority: "high" as const,
    status: "draft" as const,
    scheduled_at: new Date().toISOString(),
    hook_group: brief.pattern_id || niche,
    category_key: niche,
    overlay_text: `${copy.overlay} • ${copy.cta}`,
    image_hash: imageHash,
    pin_image_phash: pinPhash,
    meta: intelligence
      ? {
          intelligence: {
            scores: intelligence.scores,
            attempt_count: intelligence.attempt_count,
            hook_category: intelligence.hook_category ?? null,
            pattern_id: brief.pattern_id ?? null,
              pin_mode: brief.pin_mode ?? null,
            rationale: intelligence.rationale ?? null,
            hook_source: brief.hook_source ?? "fallback_bank",
            hook_relevance: brief.hook_relevance ?? null,
            hook_archetype: brief.hook_archetype ?? null,
            niche_key: niche,
            predicted_ctr: predictCtr(brief, intelligence.scores),
            product_benefits: brief.product_benefits ?? null,
            product_features: brief.product_features ?? null,
            engine_version: "v2.1",
          },
          emotional_hook: brief.emotional_hook,
          headline: brief.headline,
          cta: brief.cta,
        }
      : undefined,
  };

  const ins = await supabase
    .from("pinterest_pin_queue")
    .insert(row)
    .select("id")
    .single();
  if (ins.error) throw new Error(`insert failed: ${ins.error.message}`);

  // Record the per-pin creative intent for the congruency engine.
  try {
    await supabase.from("pinterest_creative_intents").insert({
      pin_queue_id: ins.data.id as string,
      product_id: product.id,
      niche_key: niche,
      hook_type: brief.hook_category ?? null,
      emotional_angle: brief.emotional_hook?.slice(0, 120) ?? null,
      visual_style: brief.pattern_id ?? null,
      lifestyle_category: niche,
      cta_style: brief.cta?.slice(0, 60) ?? null,
      audience_intent: brief.hook_category ?? null,
      landing_slug: landingSlug,
      pin_mode: brief.pin_mode ?? null,
      meta: {
        scores: intelligence?.scores ?? null,
        rationale: intelligence?.rationale ?? null,
        pin_mode: brief.pin_mode ?? null,
      },
    });
  } catch (e) {
    console.warn("[creative-director] intent insert skipped", e);
  }

  return { queueId: ins.data.id as string, imageUrl };
}

// ── handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method not allowed", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("invalid JSON body");
  }

  const action = String(body?.action || "run_full");
  const productId = body?.productId ? String(body.productId) : null;
  const productSlug = body?.productSlug ? String(body.productSlug) : null;
  const count = Math.max(1, Math.min(8, Number(body?.count ?? 5)));
  const force = !!body?.force;

  const trace = traceId();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Resolve product id from slug if needed.
  let resolvedId = productId;
  if (!resolvedId && productSlug) {
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("slug", productSlug)
      .maybeSingle();
    if (!data?.id) return fail(`no product for slug ${productSlug}`, 404);
    resolvedId = data.id as string;
  }
  if (!resolvedId) return fail("productId or productSlug required");

  try {
    // Honor loser blocklist — skip generation for products marked as losers.
    if (!force) {
      const slugForCheck = productSlug ?? (await supabase
        .from("products").select("slug").eq("id", resolvedId).maybeSingle()).data?.slug;
      if (slugForCheck) {
        const { data: blocked } = await supabase
          .from("pinterest_loser_blocklist")
          .select("id, blocked_until, reason")
          .eq("product_slug", slugForCheck)
          .gt("blocked_until", new Date().toISOString())
          .limit(1);
        if (blocked && blocked.length) {
          return ok({ traceId: trace, skipped: true, reason: "loser_blocklist", details: blocked[0] });
        }
      }
    }

    if (action === "profile_product") {
      const { niche, dna, cached } = await loadOrBuildProfile(supabase, resolvedId, force);
      return ok({ traceId: trace, niche, cached, dna });
    }

    if (action === "generate_briefs") {
      const { dna, product } = await loadOrBuildProfile(supabase, resolvedId, force);
      const briefs = await generateBriefs(product, dna, count);
      return ok({ traceId: trace, niche: dna.niche_key, briefs });
    }

    if (action === "render_pins" || action === "run_full") {
      const { dna, product, niche } = await loadOrBuildProfile(supabase, resolvedId, force);
      const weights = await loadLearningWeights(supabase, niche);
      const winnerModes = await loadWinnerPinModes(supabase, niche);
      const { exploitRatio, pinModeBoost } = await loadStrategyAndTrends(supabase, niche);
      // Phase 5/8/10 — merge winner pin_modes with current trend bias and
      // archetype boosts from pinterest_strategy_state, then exploit the top
      // archetype with the evolved exploit ratio (default 0.8).
      const blended = new Map<string, number>();
      for (const w of winnerModes) blended.set(w.pin_mode, (blended.get(w.pin_mode) ?? 0) + w.score);
      for (const [mode, boost] of Object.entries(pinModeBoost)) {
        blended.set(mode, (blended.get(mode) ?? 0) + Number(boost) * 100);
      }
      const exploitFirst = [...blended.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as PinModeKey | undefined;
      const visualPlans: VisualPlan[] = Array.from({ length: count }).map((_, i) => {
        const useWinner = i === 0 && exploitFirst && Math.random() < exploitRatio;
        return buildVisualPlan({
          name: product.name,
          rotateSeed: i,
          pin_mode: useWinner ? exploitFirst : undefined,
        });
      });
      let briefs = await generateBriefs(product, dna, count, undefined, weights, {}, visualPlans);

      const drafts: any[] = [];
      const rejected: any[] = [];
      // Diversity guard — loads last 90/25 published pins + same-category
      // history + replacement creative pools, then enforces the merchant-safe
      // headline/cta/angle/benefit caps before every draft insert.
      const guard = new DiversityGuard();
      try {
        await guard.load(supabase);
      } catch (e) {
        console.warn("[creative-director] diversity guard load failed", (e as Error).message);
      }
      const fidelityAudit: Array<{
        product_slug: string;
        product_image_url: string | null;
        score: number;
        approved: boolean;
        notes: string;
      }> = [];
      const productImageUrl: string | null = (product as any).image_url ?? null;
      if (!productImageUrl) {
        console.warn("[creative-director] product has no image_url — falling back to text-only render", product.slug);
      }

      // Per-brief retry: render → score → if fail, regen JUST that brief with
      // the failure reasons appended, up to MAX_RETRIES extra attempts.
      for (let i = 0; i < briefs.length; i++) {
        let brief = briefs[i];
        let accepted = false;
        let lastReasons: string[] = [];
        let lastScores: Record<string, number> = {};

        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
          try {
            const bytes = await renderSceneWithSource(brief, dna, productImageUrl);
            const qc = await qualityCheck(brief, bytes, dna);
            lastReasons = qc.reasons;
            lastScores = qc.scores as unknown as Record<string, number>;

            await logRenderAttempt(supabase, {
              pin_queue_id: null,
              product_slug: product.slug,
              niche_key: niche,
              brief,
              attempt_no: attempt,
              scores: lastScores,
              total_score: qc.scores.total,
              rejected: !qc.ok,
              reasons: qc.reasons,
            });

            if (!qc.ok) {
              if (attempt > MAX_RETRIES) break;
              // Regenerate THIS brief with rejection reasons appended.
              const single = await generateBriefs(
                product,
                dna,
                1,
                [brief.pattern_id!] as PatternId[],
                weights,
                { 0: qc.reasons },
              );
              brief = { ...single[0], id: brief.id, pattern_id: brief.pattern_id };
              continue;
            }

            // Product-truth audit BEFORE publishing the draft.
            let fidelityScore = 100;
            let fidelityNotes = "no_source_image";
            if (productImageUrl) {
              const audit = await auditProductFidelity(bytes, productImageUrl);
              fidelityScore = audit.score;
              fidelityNotes = audit.notes;
              fidelityAudit.push({
                product_slug: product.slug,
                product_image_url: productImageUrl,
                score: fidelityScore,
                approved: fidelityScore >= PRODUCT_FIDELITY_THRESHOLD,
                notes: fidelityNotes,
              });
              if (fidelityScore < PRODUCT_FIDELITY_THRESHOLD) {
                lastReasons = [
                  ...(qc.reasons ?? []),
                  `product_fidelity_${fidelityScore}<${PRODUCT_FIDELITY_THRESHOLD}:${fidelityNotes.slice(0, 80)}`,
                ];
                if (attempt > MAX_RETRIES) break;
                // Retry: regen this brief, source-lock still applied next loop.
                const single = await generateBriefs(
                  product, dna, 1,
                  [brief.pattern_id!] as PatternId[],
                  weights,
                  { 0: [`product fidelity ${fidelityScore} — ${fidelityNotes}`] },
                );
                brief = { ...single[0], id: brief.id, pattern_id: brief.pattern_id };
                continue;
              }
            }

            // Diversity guard: enforce headline/cta/angle/benefit caps over
            // the last 90 published pins. If a candidate violates a cap we
            // try to swap from the category creative pool; if no replacement
            // exists the draft is rejected.
            const guardResult = guard.evaluate(
              {
                headline: brief.headline,
                cta: brief.cta,
                hook: brief.hook_category ?? null,
                product_id: product.id,
              },
              normaliseCategoryKey(niche),
            );
            if (!guardResult.ok) {
              lastReasons = [
                ...lastReasons,
                ...guardResult.reasons.map((r) => `diversity:${r}`),
              ];
              rejected.push({
                brief,
                reasons: lastReasons,
                scores: lastScores,
                diversity: guardResult,
              });
              accepted = false;
              break;
            }
            if (Object.keys(guardResult.replacedFromPool).length) {
              if (guardResult.replacedFromPool.headline) brief.headline = guardResult.final.headline;
              if (guardResult.replacedFromPool.cta) brief.cta = guardResult.final.cta;
              if (guardResult.replacedFromPool.hook && guardResult.final.hook) {
                (brief as any).hook_category = guardResult.final.hook;
              }
              console.log(
                "[creative-director] diversity swap",
                product.slug,
                guardResult.replacedFromPool,
              );
            }

            const inserted = await uploadAndInsertDraft(
              supabase,
              { id: product.id, slug: product.slug, name: product.name },
              niche,
              brief,
              bytes,
              {
                scores: lastScores,
                attempt_count: attempt,
                hook_category: brief.hook_category,
                rationale: brief.strategy_rationale,
              },
            );
            drafts.push({
              ...inserted, brief, scores: lastScores, attempts: attempt,
              product_fidelity: { score: fidelityScore, source: productImageUrl, notes: fidelityNotes },
            });
            guard.register(
              { headline: brief.headline, cta: brief.cta, hook: brief.hook_category ?? null, product_id: product.id },
              niche,
            );
            accepted = true;
            break;
          } catch (e) {
            lastReasons = [(e as Error).message];
            if (attempt > MAX_RETRIES) break;
          }
        }

        if (!accepted) {
          rejected.push({ brief, reasons: lastReasons, scores: lastScores });
        }
      }

      const approvedCount = fidelityAudit.filter((a) => a.approved).length;
      const rejectedByFidelity = fidelityAudit.filter((a) => !a.approved).length;

      return ok({
        traceId: trace,
        message: `Generated ${drafts.length}/${briefs.length} pins (${rejected.length} rejected)`,
        niche,
        approved_required: true,
        threshold: QUALITY_THRESHOLD,
        product_truth: {
          enforced: !!productImageUrl,
          source_image: productImageUrl,
          threshold: PRODUCT_FIDELITY_THRESHOLD,
          audited: fidelityAudit.length,
          approved: approvedCount,
          rejected: rejectedByFidelity,
          audit: fidelityAudit,
        },
        drafts,
        rejected,
      });
    }

    return fail(`unknown action: ${action}`);
  } catch (e) {
    console.error("[creative-director]", trace, e);
    return fail((e as Error).message, 500, { traceId: trace });
  }
});