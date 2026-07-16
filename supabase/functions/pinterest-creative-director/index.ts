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
  getPattern,
  PATTERN_LIBRARY,
  type PatternId,
  patternQualityReasons,
  type PinterestPattern,
  selectPatternsForNiche,
} from "../_shared/pinterest-patterns.ts";
import {
  type CreativeStrategy,
  type HookCategory,
  type LearningWeight,
  pickStrategy,
} from "../_shared/pinterest-hooks.ts";
import {
  deriveBenefits,
  generateProductHooks,
  type HookArchetype,
  type ProductHook,
  scoreHookRelevance,
} from "../_shared/pinterest-product-hooks.ts";
import {
  MAX_RETRIES,
  QUALITY_THRESHOLD,
  scorePin,
} from "../_shared/pinterest-quality.ts";
import {
  scoreCtrIntent,
  scoreOutboundIntent,
} from "../_shared/pinterest-diversity-guard.ts";
import {
  buildVisualPlan,
  type VisualPlan,
} from "../_shared/pinterest-visual-intelligence.ts";
import { getPinMode, type PinModeKey } from "../_shared/pinterest-pin-modes.ts";
import { buildCollagePromptSuffix } from "../_shared/pinterest-collage.ts";
import { computePhashFromBytes } from "../_shared/pinterest-phash.ts";
import {
  DiversityGuard,
  normaliseCategoryKey,
} from "../_shared/pinterest-diversity-guard.ts";
import {
  buildPinCopy,
  sanitizePinText,
  validatePinCopy,
} from "../_shared/pinterest-board-templates.ts";
import {
  checkGovernor,
  governorRejectReason,
} from "../_shared/pinterest-governor.ts";
import {
  isCreditPaused,
  isImageGenerationKilled,
  recordCreditEvent,
} from "../_shared/pinterest-credit-guard.ts";
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

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

// Lazy service client for credit-guard event recording from helper functions
// that don't receive a supabase client through their signature.
let _creditClient: ReturnType<typeof createClient> | null = null;
function creditClient() {
  if (!_creditClient) {
    _creditClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });
  }
  return _creditClient;
}
async function tagGatewayResp(resp: Response, fnTag: string): Promise<void> {
  try {
    // Per-call credit estimate (used until upstream returns usage metadata).
    // Image generation costs ~8 credits, brief/fidelity text calls ~1.
    const creditsByTag = (tag: string): number => {
      if (tag.endsWith(":image")) return 8;
      if (tag.endsWith(":fidelity")) return 2;
      return 1;
    };
    const modelByTag = (tag: string): string | undefined => {
      if (tag.endsWith(":image")) return IMAGE_MODEL;
      return TEXT_MODEL;
    };
    if (resp.status === 402) {
      await recordCreditEvent(creditClient(), {
        event_type: "payment_required",
        status_code: 402,
        function_name: fnTag,
        message: "ai_gateway_402",
      });
    } else if (resp.status === 429) {
      await recordCreditEvent(creditClient(), {
        event_type: "rate_limited",
        status_code: 429,
        function_name: fnTag,
      });
    } else if (resp.ok) {
      await recordCreditEvent(creditClient(), {
        event_type: "success",
        status_code: resp.status,
        function_name: fnTag,
        credits_used: creditsByTag(fnTag),
        model: modelByTag(fnTag),
      });
    }
  } catch (_) { /* best effort */ }
}
const IMAGE_MODEL = Deno.env.get("PINTEREST_CD_IMAGE_MODEL") ||
  "google/gemini-3-pro-image-preview";
const TEXT_MODEL = Deno.env.get("PINTEREST_CD_TEXT_MODEL") ||
  "google/gemini-3-flash-preview";

// 2026-06-17 cost hardening: cap to exactly ONE image render per brief.
// Any guard failure (diversity / quality / fidelity) rejects the candidate
// instead of regenerating — regeneration was the dominant credit leak.
// Phase 6 — credit protection: total render attempts = EFFECTIVE_MAX_RETRIES + 1.
// Hard-capped at 3 to prevent endless render loops on a single product.
const EFFECTIVE_MAX_RETRIES = 2;

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

function fail(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
) {
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
  return trimmed.length > max
    ? trimmed.slice(0, max - 1).trimEnd() + "…"
    : trimmed;
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
    problem: 0.003,
    outcome: 0.002,
    benefit: 0.002,
    curiosity: 0.0015,
    emotional: 0.001,
  };
  return Math.round(
    (base + (archBoost[brief.hook_archetype ?? ""] ?? 0)) * 10000,
  ) / 100;
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
    .select(
      "id, name, slug, description, category, product_type, image_url, key_feature, benefit_angle, description_bullets, price",
    )
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

  const patterns =
    (patternIds && patternIds.length === count
      ? patternIds
      : selectPatternsForNiche(dna.niche_key as any, count)).map((id) =>
        getPattern(id)
      );

  // Pick a hook strategy per brief BEFORE we call the model so the AI just
  // executes a locked plan and can't go off-brand.
  const strategies: CreativeStrategy[] = patterns.map((p) =>
    pickStrategy({ niche: dna.niche_key as any, dna, pattern: p, weights })
  );

  // PRODUCT-TRUTHFUL HEADLINES: generate N hooks straight from the
  // product's name/description/category and override the bank-picked
  // strategy.hook_phrase with them. The strategy still chooses the hook
  // CATEGORY (for analytics + learning), but the actual headline copy is
  // now grounded in this specific product instead of a generic niche bank.
  // Normalize product features + benefits coming out of the products table.
  const featureList = [
    product.key_feature,
    ...(Array.isArray(product.description_bullets)
      ? product.description_bullets
      : typeof product.description_bullets === "string"
      ? product.description_bullets.split(/\n|•|\u2022|;|\|/)
      : []),
  ]
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
  const derivedBenefits = benefitList.length
    ? benefitList
    : deriveBenefits(hookInput, dna.niche_key);
  const productHooks = await generateProductHooks({
    product: { ...hookInput, benefits: derivedBenefits },
    niche: dna.niche_key,
    dna,
    count,
  });

  // Pin-mode plan per brief (rotates through niche affinity for variety).
  const plans: VisualPlan[] = patterns.map((_, i) =>
    visualPlans[i] ??
      buildVisualPlan({ name: product.name, rotateSeed: i })
  );

  const sys = [
    "You are a Creative Director for a premium US pet brand running Pinterest ads.",
    "You write SCENE BRIEFS for an AI image model that will photograph each scene.",
    "GOLD STANDARD VISUAL IDENTITY (mandatory default for every brief):",
    "premium lifestyle photography, warm natural sunlight, luxury US home interiors,",
    "Scandinavian interiors, natural wood, beige neutral palette (cream/oat/warm white),",
    "realistic pets shown with emotional storytelling, Pinterest-native aesthetic,",
    "photorealistic AI render, product integrated naturally into the scene,",
    "minimal overlays, no aggressive sales language, no crowded layouts.",
    "CREATIVE MIX TARGET across the batch: 80% luxury lifestyle scenes (room as hero),",
    "10% product-in-use moments (pet actively interacting with product),",
    "10% gentle educational scenes (no infographic — still photographed lifestyle).",
    "ABSOLUTELY FORBIDDEN: infographic-style pins, comparison graphics, feature lists, discount banners,",
    "product collages, multi-tile layouts, split-screen before/after, ecommerce catalogue look,",
    "stock-photo appearance, floating product cutouts, Canva templates, CTA bars, price tags,",
    "and any text overlay inside the scene brief itself (overlays are added later, max 2–5 words).",
    "Each brief must be ONE fully-composed real lifestyle scene with the product naturally placed in a luxury US home.",
    "Each brief is locked to ONE provided Pinterest winning pattern AND ONE hook strategy.",
    "Use the provided headline and cta verbatim — they have been chosen by the strategy engine.",
    "CREATIVE DIVERSITY MANDATE: across the N briefs in this batch, vary the camera angle (eye-level, low-angle, overhead, three-quarter), the environment (living room, bedroom, kitchen nook, sunlit hallway, outdoor patio, garden), the lighting (golden hour, soft morning, overcast daylight, lamp-lit evening), the season (spring blossoms, summer warmth, autumn neutrals, winter cosy), the color palette (cream, sage, terracotta, dusty blue, warm beige, charcoal accent) and the composition (rule-of-thirds, centered hero, wide negative-space, intimate close-up). Never reuse the same headline sentence structure across briefs in this batch.",
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

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
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
    },
  );

  await tagGatewayResp(resp, "creative-director:briefs");
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
      sanitizePinText(
        productHooks[i]?.headline ||
          String(b.headline || strategies[i]?.hook_phrase || ""),
      ),
      42,
    ),
    cta: safeText(
      sanitizePinText(String(b.cta || strategies[i]?.cta_phrase || "")),
      18,
    ),
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

async function renderScene(
  brief: SceneBrief,
  dna: StyleDNA,
): Promise<Uint8Array> {
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

  // ── Hard cost-protection kill switch (2026-06-17) ───────────────────────
  // Refuse to call the image model when the kill switch is engaged. The
  // calling loop catches this as a render failure and rejects the brief
  // WITHOUT charging any AI gateway credits.
  const killed = await isImageGenerationKilled(creditClient() as any);
  if (killed.killed) {
    throw new Error(
      `image_generation_killed:${killed.reason ?? "kill_switch"}`,
    );
  }

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
      `${
        mode.is_collage
          ? "This MUST be a tasteful multi-tile composition (split or moodboard), not a single hero shot. "
          : ""
      }` +
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
      `"${overlay.brand}". The caption MUST stay 2–5 words, minimal, unobtrusive, never a sentence, never a sales pitch. ` +
      `Do NOT render any other text, captions, prices, CTAs, emojis, hashtags, feature lists, comparison labels, discount badges, or graphics.`
    : ` Do NOT render any text, captions, watermarks, logos, or graphic overlays in the image itself.`;
  const styleSuffix =
    `Premium lifestyle photography, warm natural lighting, luxury US home interior, ${dna.light}, mood: ${dna.mood}. ` +
    `Pinterest-native editorial aesthetic. Photorealistic textures, natural shadows, correct perspective, ` +
    `product integrated naturally into the scene as if professionally styled in a real home. ` +
    `Vertical 2:3 composition (1000x1500) for Pinterest. ` +
    // MOBILE SAFE ZONE — keep the focal subject visually centered both ` +
    // vertically and horizontally so iPhone Pinterest feed cropping never ` +
    // clips it. NO important product detail in the outer 15% margin. ` +
    // NO text, captions, CTAs, logos or critical objects in the top 15% or ` +
    // bottom 20% — those strips are reserved for Pinterest UI chrome. ` +
    // Leave generous breathing room / negative space around the product. ` +
    `MOBILE SAFE ZONE: focal subject perfectly centered, no important object or text within the outer 15% margins, ` +
    `nothing critical in the top 15% or bottom 20% of the frame, generous negative space around the product. ` +
    // LUXURY POLISH — shallow DoF, realistic reflections + soft shadows, ` +
    // editorial product advertising look. ` +
    `LUXURY POLISH: premium product advertising aesthetic, shallow depth of field, realistic soft shadows and reflections, ` +
    `professional studio-grade lighting, refined materials, restrained color palette, premium home or outdoor interior styling.${overlayDirective} ` +
    `Absolutely NO infographics, NO feature lists, NO comparison graphics, NO discount banners, NO product collages, ` +
    `NO multi-tile layouts, NO split-screen, NO floating product cutouts, NO Canva-template look, NO CTA bars, ` +
    `NO price tags, NO stock-photo appearance, NO crowded layouts, NO clipart, NO text-heavy layouts.`;

  // For collage modes, replace the anti-collage clause with the explicit
  // collage contract so the image model isn't given contradictory directives.
  const styleSuffixForMode = mode?.is_collage ? styleSuffix : styleSuffix;

  const prompt =
    `${brief.full_prompt}\n\nDirection: ${styleSuffixForMode}${patternDirective}${modeDirective}${collageDirective}`;
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
  const groundedPrompt = sourceLock +
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
      console.warn(
        "[creative-director] source image fetch failed",
        (e as Error).message,
      );
    }
  }
  const userContent: unknown = sourceDataUrl
    ? [
      { type: "image_url", image_url: { url: sourceDataUrl } },
      { type: "text", text: groundedPrompt },
    ]
    : groundedPrompt;

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
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
    },
  );

  await tagGatewayResp(resp, "creative-director:image");
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`image model ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]
    ?.image_url?.url;
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

/**
 * PRE-RENDER fidelity prediction. Sends the product photo + the planned brief
 * (prompt, environment, headline, CTA) to a cheap multimodal LLM and asks:
 * "If this brief were rendered as-is, would the resulting image depict the
 * SAME product?" Score < threshold → skip the expensive image call entirely
 * and regenerate the brief. This runs BEFORE `renderSceneWithSource` so
 * failing briefs never burn `IMAGE_MODEL` credits.
 */
async function predictBriefFidelity(
  brief: SceneBrief,
  productImageUrl: string,
): Promise<{ score: number; notes: string }> {
  if (!LOVABLE_API_KEY) return { score: 0, notes: "no_api_key" };
  let sourceDataUrl: string;
  try {
    sourceDataUrl = await fetchAsDataUrl(productImageUrl);
  } catch (e) {
    return { score: 0, notes: `source_fetch_failed:${(e as Error).message}` };
  }
  const briefText = [
    `HEADLINE: ${brief.headline}`,
    `CTA: ${brief.cta}`,
    brief.environment_summary
      ? `ENVIRONMENT: ${brief.environment_summary}`
      : null,
    `PROMPT: ${brief.full_prompt}`,
  ].filter(Boolean).join("\n");

  const tools = [{
    type: "function",
    function: {
      name: "predict_fidelity",
      description:
        "Predict how faithfully a text-to-image render of the BRIEF will preserve the exact product shown in the reference photo.",
      parameters: {
        type: "object",
        properties: {
          score: {
            type: "number",
            description:
              "0-100. 100 = brief unambiguously locks the product identity. <90 = brief is generic/ambiguous and likely to yield a different SKU (wrong shape, color, materials, structure).",
          },
          notes: { type: "string" },
        },
        required: ["score", "notes"],
      },
    },
  }];
  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
                "You are a strict QA planner for a DTC pet brand's Pinterest ads. You are given (1) the canonical Shopify product photo and (2) the text brief that will be sent to an image model. Predict — WITHOUT rendering — whether the brief will produce an image whose product is indistinguishable from the reference SKU. Reward briefs that explicitly name the product's distinctive shape, materials, colors, levels/tiers, and accessories. Penalize briefs that are generic, describe a different product category, or leave the product identity to the model. Use the predict_fidelity tool. Score below 90 means the render should be skipped and the brief regenerated.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Reference product photo below. Then the brief text. Predict fidelity.",
                },
                { type: "image_url", image_url: { url: sourceDataUrl } },
                { type: "text", text: briefText },
              ],
            },
          ],
          tools,
          tool_choice: {
            type: "function",
            function: { name: "predict_fidelity" },
          },
        }),
      },
    );
    await tagGatewayResp(resp, "creative-director:fidelity");
    if (!resp.ok) {
      const t = await resp.text();
      return { score: 0, notes: `predictor_${resp.status}:${t.slice(0, 120)}` };
    }
    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return { score: 0, notes: "no_tool_call" };
    const parsed = JSON.parse(call.function.arguments || "{}");
    const score = Math.max(0, Math.min(100, Number(parsed.score ?? 0)));
    return { score, notes: String(parsed.notes || "") };
  } catch (e) {
    return { score: 0, notes: `predict_error:${(e as Error).message}` };
  }
}

async function auditProductFidelity(
  generatedBytes: Uint8Array,
  productImageUrl: string,
): Promise<{ score: number; notes: string; sourceUsed: string }> {
  if (!LOVABLE_API_KEY) {
    return { score: 0, notes: "no_api_key", sourceUsed: productImageUrl };
  }
  let sourceDataUrl: string;
  try {
    sourceDataUrl = await fetchAsDataUrl(productImageUrl);
  } catch (e) {
    return {
      score: 0,
      notes: `source_fetch_failed:${(e as Error).message}`,
      sourceUsed: productImageUrl,
    };
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
        description:
          "Score how faithfully the generated lifestyle pin preserves the exact product from the reference photo.",
        parameters: {
          type: "object",
          properties: {
            score: {
              type: "number",
              description:
                "0-100. 100 = identical product, only context changed. <90 = product is a different model/color/structure/redesign.",
            },
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
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
                {
                  type: "text",
                  text:
                    "Image 1 = canonical product photo. Image 2 = generated Pinterest pin. Rate product fidelity.",
                },
                { type: "image_url", image_url: { url: sourceDataUrl } },
                { type: "image_url", image_url: { url: genDataUrl } },
              ],
            },
          ],
          tools,
          tool_choice: {
            type: "function",
            function: { name: "rate_fidelity" },
          },
        }),
      },
    );
    await tagGatewayResp(resp, "creative-director:fidelity");
    if (!resp.ok) {
      const t = await resp.text();
      return {
        score: 0,
        notes: `auditor_${resp.status}:${t.slice(0, 120)}`,
        sourceUsed: productImageUrl,
      };
    }
    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      return { score: 0, notes: "no_tool_call", sourceUsed: productImageUrl };
    }
    const parsed = JSON.parse(call.function.arguments || "{}");
    const score = Math.max(0, Math.min(100, Number(parsed.score ?? 0)));
    return {
      score,
      notes: String(parsed.notes || ""),
      sourceUsed: productImageUrl,
    };
  } catch (e) {
    return {
      score: 0,
      notes: `audit_error:${(e as Error).message}`,
      sourceUsed: productImageUrl,
    };
  }
}

// ── 4. quality filter (delegates to multi-axis scorer) ─────────────────────

async function qualityCheck(
  brief: SceneBrief,
  bytes: Uint8Array,
  dna: StyleDNA,
  relaxed = false,
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
    relaxed,
  });
}

// ── 4b. learning weights loader ────────────────────────────────────────────

async function loadLearningWeights(
  supabase: ReturnType<typeof createClient>,
  niche: NicheKey,
): Promise<LearningWeight[]> {
  const { data } = await supabase
    .from("pinterest_pattern_weights")
    .select(
      "pattern_id, hook_category, niche_key, composite_score, sample_size",
    )
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
      .map((r) => ({
        pin_mode: r.pin_mode as PinModeKey,
        score: Number(r.composite_score ?? 0),
      }))
      .filter((r) => !!r.pin_mode);
  } catch (e) {
    console.warn(
      "[creative-director] loadWinnerPinModes failed",
      (e as Error).message,
    );
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
      supabase.from("pinterest_strategy_state").select("*").eq("id", 1)
        .maybeSingle(),
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
      const archetypeBoosts = (state.archetype_boosts ?? {}) as Record<
        string,
        number
      >;
      for (const [k, v] of Object.entries(archetypeBoosts)) {
        const [n, mode] = k.split(":");
        if (n === niche && mode) {
          pinModeBoost[mode] = Math.max(pinModeBoost[mode] ?? 0, Number(v));
        }
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
    console.warn(
      "[creative-director] loadStrategyAndTrends failed",
      (e as Error).message,
    );
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
    console.warn(
      "[creative-director] logRenderAttempt failed",
      (e as Error).message,
    );
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
    console.warn(
      "[creative-director] pickLandingSlug failed",
      (e as Error).message,
    );
  }
  return null;
}

async function uploadAndInsertDraft(
  supabase: ReturnType<typeof createClient>,
  product: {
    id: string;
    slug: string;
    name: string;
    price?: number | null;
    benefit?: string | null;
    category?: string | null;
  },
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
  boardName?: string | null,
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

  const patternTag = brief.pattern_id
    ? `_${brief.pattern_id.slice(0, 12)}`
    : "";
  const variant = `cd_${niche}${patternTag}_${stamp}_${brief.id.slice(-6)}`;

  // Destination URL safety policy (2026-06):
  // The pin generator MUST use the canonical live product URL. The legacy
  // /go/{slug} fan-out invented destinations that did not always resolve to
  // a live in-stock product, which produced 404s in production. We always
  // build /products/{slug} — the cron worker re-validates this server-side
  // before publish via the shared destination validator.
  const landingSlug: string | null = null;
  const hookParam = encodeURIComponent(brief.emotional_hook.slice(0, 40));
  const destination =
    `${BASE_URL}/products/${product.slug}?utm_source=pinterest&utm_medium=social&utm_campaign=creative_director&utm_content=${niche}&hook=${hookParam}`;

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
    // Preserve the flagged board from the requesting job. Without this the
    // pin_queue column default ('Smart Pet Gadgets') silently overwrites the
    // intended board, breaking 100% board consistency.
    ...(boardName ? { board_name: boardName } : {}),
    overlay_text: `${copy.overlay} • ${copy.cta}`
      .replace(/[|•\r\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 32),
    image_hash: imageHash,
    pin_image_phash: pinPhash,
    meta: intelligence
      ? {
        creative_source: "creative_director_v2",
        ai_generated: true,
        generator: "pinterest-creative-director",
        quality_tier: "premium",
        legacy_feed: false,
        publish_allowed: true,
        pin_type: (brief as any).pin_mode === "problem_solution"
          ? "problem_solution"
          : (brief as any).pin_mode === "listicle"
          ? "listicle"
          : (brief as any).pin_mode === "product_showcase"
          ? "product_showcase"
          : "lifestyle",
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
          engine_version: "v2.2",
          ctr_intent: scoreCtrIntent({
            headline: copy.overlay,
            cta: copy.cta,
            hook: brief.emotional_hook ?? null,
          }),
          outbound_intent: scoreOutboundIntent(null, {
            headline: copy.overlay,
            cta: copy.cta,
            hook: brief.emotional_hook ?? null,
          }),
        },
        emotional_hook: brief.emotional_hook,
        headline: brief.headline,
        cta: brief.cta,
      }
      : {
        creative_source: "creative_director_v2",
        ai_generated: true,
        generator: "pinterest-creative-director",
        quality_tier: "premium",
        legacy_feed: false,
        publish_allowed: true,
        pin_type: "lifestyle",
      },
  };

  // ── Validate every generated pin BEFORE insert ────────────────────────────
  // Guarantees exactly one short benefit overlay and zero banned phrases in
  // any customer-facing copy. Failed drafts are skipped (never persisted).
  const overlayBlock = `${copy.overlay} • ${copy.cta}`;
  const validation = validatePinCopy({
    title: copy.title,
    description: copy.description,
    overlay: copy.overlay,
    overlayBlock,
    brandWordmark: copy.brandWordmark,
  });
  if (!validation.valid) {
    console.warn(
      "[creative-director] pin validation failed — draft skipped",
      {
        product_slug: product.slug,
        variant,
        errors: validation.errors,
        banned: validation.bannedHits,
      },
    );
    throw new Error(
      `pin_validation_failed:${validation.errors.join(",")}`,
    );
  }

  // ── Anti-duplication / banned-phrase governor (hard gate) ─────────────────
  // Per memory `pinterest-anti-duplication-governor`: drafts cannot enter the
  // queue if they would violate the per-slug / per-board / copy-repeat or
  // banned-phrase rules. We pass board_id=null at draft time (board is picked
  // at publish), so only slug + copy rules apply here. Publisher paths re-run
  // the governor with the resolved board_id before POST /pins.
  const govVerdict = await checkGovernor(supabase, {
    slug: product.slug,
    boardId: null,
    headline: copy.title,
    overlay: copy.overlay,
    cta: copy.cta,
  });
  if (govVerdict.enabled && !govVerdict.allowed) {
    console.warn("[creative-director] governor blocked draft", {
      product_slug: product.slug,
      variant,
      violations: govVerdict.violations,
    });
    throw new Error(governorRejectReason(govVerdict));
  }

  // ── PERMANENT INTEGRITY GUARD ─────────────────────────────────────────────
  // Image-vs-title, species, and destination URL checks. Confidence < 95%
  // blocks publication automatically. No opt-out, no emergency override.
  const { verifyPinIntegrity } = await import(
    "../_shared/pinterest-integrity-guard.ts"
  );
  const integrity = await verifyPinIntegrity(supabase, {
    product_id: product.id,
    product_slug: product.slug,
    product_name: product.name,
    pin_title: copy.title,
    pin_description: copy.description,
    pin_image_url: imageUrl,
    destination_link: destination,
    niche_or_category: niche,
  });
  if (!integrity.passed) {
    console.warn("[creative-director] integrity guard blocked draft", {
      product_slug: product.slug,
      variant,
      confidence: integrity.confidence,
      reasons: integrity.blocking_reasons,
      checks: integrity.checks,
    });
    throw new Error(
      `integrity_guard_blocked:conf=${integrity.confidence.toFixed(2)}:${
        integrity.blocking_reasons.join(",")
      }`,
    );
  }

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
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
  const emergency = body?.emergency === true;
  const boardName: string | null =
    typeof body?.boardName === "string" && body.boardName.trim()
      ? String(body.boardName).trim()
      : null;

  const trace = traceId();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Wave isolation gate: when a canary/wave is running, refuse legacy paid
  // calls unless the caller supplies the matching run_id. See
  // _shared/pinterest-wave-isolation.ts.
  try {
    const { assertIsolationAllows } = await import("../_shared/pinterest-wave-isolation.ts");
    const guard = await assertIsolationAllows(supabase, body?.run_id ?? null, corsHeaders);
    if (guard) return guard;
  } catch (e) {
    console.warn("[creative-director] wave-isolation check failed (non-fatal):", e);
  }

  // Credit protection: short-circuit if AI gateway is paused due to exhausted credits.
  const guard = await isCreditPaused(supabase);
  if (guard.paused) {
    return new Response(
      JSON.stringify({
        ok: false,
        traceId: trace,
        error: "payment_required",
        message: "credits_paused",
        credit_state: guard.state,
        last_402_at: guard.last_402_at,
      }),
      {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

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
        .from("products").select("slug").eq("id", resolvedId).maybeSingle())
        .data?.slug;
      if (slugForCheck) {
        const { data: blocked } = await supabase
          .from("pinterest_loser_blocklist")
          .select("id, blocked_until, reason")
          .eq("product_slug", slugForCheck)
          .gt("blocked_until", new Date().toISOString())
          .limit(1);
        if (blocked && blocked.length) {
          return ok({
            traceId: trace,
            skipped: true,
            reason: "loser_blocklist",
            details: blocked[0],
          });
        }
      }
    }

    // Wave 3A+ Pinterest Potential gate — refuse generation for products below 70.
    if (!force) {
      const { data: intel } = await supabase
        .from("pin_product_intelligence")
        .select("potential_score")
        .eq("product_id", resolvedId)
        .maybeSingle();
      const ps = Number(intel?.potential_score ?? 0);
      if (!intel || ps < 70) {
        return ok({
          traceId: trace,
          skipped: true,
          reason: "below_potential_gate",
          potential_score: ps,
          gate: 70,
        });
      }
    }

    // Production recovery 2026-06: the legacy synchronous render path chains
    // text planning + image generation + multimodal QC + fidelity audit in one
    // request and can exceed Edge CPU/wall limits. Keep Creative Director as the
    // canonical entrypoint, but delegate heavy media work to the resumable AI
    // Creative Factory. The old path is only available for explicit diagnostic
    // calls with use_legacy_sync=true.
    if (
      (action === "render_pins" || action === "run_full") &&
      body?.use_legacy_sync !== true
    ) {
      const factoryUrl =
        `${SUPABASE_URL}/functions/v1/pinterest-creative-factory`;
      const headers = {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      };
      const enqueueResp = await fetch(factoryUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "enqueue_product",
          productId: resolvedId,
          productSlug,
          count,
          reason: "creative_director_delegated_factory",
        }),
      });
      const enqueue = await enqueueResp.json().catch(() => ({}));
      if (!enqueueResp.ok || enqueue?.ok === false) {
        return fail(
          `creative_factory_enqueue_failed:${
            enqueue?.error ?? enqueueResp.status
          }`,
          502,
          { traceId: trace, enqueue },
        );
      }
      EdgeRuntime.waitUntil(
        fetch(factoryUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "work_async",
            limit: Math.min(1, count),
            reason: "creative_director_delegated_factory",
          }),
        }).catch(() => null),
      );
      return ok({
        traceId: trace,
        delegated: true,
        message:
          "Creative Director delegated rendering to the resumable AI Creative Factory",
        product_id: resolvedId,
        product_slug: productSlug,
        requested: count,
        factory: enqueue,
      });
    }

    if (action === "profile_product") {
      const { niche, dna, cached } = await loadOrBuildProfile(
        supabase,
        resolvedId,
        force,
      );
      return ok({ traceId: trace, niche, cached, dna });
    }

    if (action === "generate_briefs") {
      const { dna, product } = await loadOrBuildProfile(
        supabase,
        resolvedId,
        force,
      );
      const briefs = await generateBriefs(product, dna, count);
      return ok({ traceId: trace, niche: dna.niche_key, briefs });
    }

    if (action === "render_pins" || action === "run_full") {
      const { dna, product, niche } = await loadOrBuildProfile(
        supabase,
        resolvedId,
        force,
      );
      // ── Stage-by-stage rejection log (2026-06-21) ────────────────────
      // Records every decision point so the growth-engine response can
      // surface why a product produced zero drafts.
      const stages: Array<{
        stage:
          | "selected"
          | "profile_validation"
          | "brief_generated"
          | "pre_diversity"
          | "brief_fidelity_check"
          | "image_generation"
          | "quality_gate"
          | "fidelity_check"
          | "post_diversity"
          | "queue_insert";
        status: "ok" | "rejected" | "error";
        brief_index?: number;
        attempt?: number;
        reason?: string;
        details?: unknown;
      }> = [];
      stages.push({ stage: "selected", status: "ok" });
      stages.push({
        stage: "profile_validation",
        status: product ? "ok" : "rejected",
        reason: product ? undefined : "missing_product_profile",
        details: { niche, has_image: !!(product as any)?.image_url },
      });
      const weights = await loadLearningWeights(supabase, niche);
      const winnerModes = await loadWinnerPinModes(supabase, niche);
      const { exploitRatio, pinModeBoost } = await loadStrategyAndTrends(
        supabase,
        niche,
      );
      // Phase 5/8/10 — merge winner pin_modes with current trend bias and
      // archetype boosts from pinterest_strategy_state, then exploit the top
      // archetype with the evolved exploit ratio (default 0.8).
      const blended = new Map<string, number>();
      for (const w of winnerModes) {
        blended.set(w.pin_mode, (blended.get(w.pin_mode) ?? 0) + w.score);
      }
      for (const [mode, boost] of Object.entries(pinModeBoost)) {
        blended.set(mode, (blended.get(mode) ?? 0) + Number(boost) * 100);
      }
      const exploitFirst = [...blended.entries()].sort((a, b) => b[1] - a[1])[0]
        ?.[0] as PinModeKey | undefined;
      const visualPlans: VisualPlan[] = Array.from({ length: count }).map(
        (_, i) => {
          const useWinner = i === 0 && exploitFirst &&
            Math.random() < exploitRatio;
          return buildVisualPlan({
            name: product.name,
            rotateSeed: i,
            pin_mode: useWinner ? exploitFirst : undefined,
          });
        },
      );
      let briefs = await generateBriefs(
        product,
        dna,
        count,
        undefined,
        weights,
        {},
        visualPlans,
      );
      stages.push({
        stage: "brief_generated",
        status: briefs.length ? "ok" : "rejected",
        reason: briefs.length ? undefined : "brief_validation_failed",
        details: { brief_count: briefs.length, requested: count },
      });

      const drafts: any[] = [];
      const rejected: any[] = [];
      // Diversity guard — loads last 90/25 published pins + same-category
      // history + replacement creative pools, then enforces the merchant-safe
      // headline/cta/angle/benefit caps before every draft insert.
      const guard = new DiversityGuard();
      try {
        await guard.load(supabase);
      } catch (e) {
        console.warn(
          "[creative-director] diversity guard load failed",
          (e as Error).message,
        );
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
        console.warn(
          "[creative-director] product has no image_url — falling back to text-only render",
          product.slug,
        );
      }

      // Deterministic board overlay (1 short benefit + GetPawsy wordmark).
      // Used both for the image renderer and the queue row copy.
      const boardCopyPreview = buildPinCopy(
        {
          name: product.name,
          benefit: (product as any).benefit_angle ?? null,
          category: (product as any).category ?? null,
          price: (product as any).price ?? null,
          niche,
        },
        0,
      );
      const inImageOverlay = {
        text: boardCopyPreview.overlay,
        brand: boardCopyPreview.brandWordmark,
      };

      // Per-brief retry: render → score → if fail, regen JUST that brief with
      // the failure reasons appended, up to MAX_RETRIES extra attempts.
      for (let i = 0; i < briefs.length; i++) {
        let brief = briefs[i];
        let accepted = false;
        let lastReasons: string[] = [];
        let lastScores: Record<string, number> = {};

        for (let attempt = 1; attempt <= EFFECTIVE_MAX_RETRIES + 1; attempt++) {
          try {
            // ── Pre-render DiversityGuard (2026-06 cost hardening) ───────
            // Hash the planned overlay + hook + CTA + headline BEFORE we burn
            // any image-gen credits. If the guard would reject this brief, we
            // skip the render entirely and try to regenerate the brief.
            const preGuard = guard.evaluate(
              {
                headline: brief.headline,
                cta: brief.cta,
                hook: brief.hook_category ?? null,
                product_id: product.id,
              },
              normaliseCategoryKey(niche),
            );
            if (!preGuard.ok && !emergency) {
              lastReasons = [
                ...(lastReasons ?? []),
                ...preGuard.reasons.map((r) => `pre_diversity:${r}`),
              ];
              stages.push({
                stage: "pre_diversity",
                status: "rejected",
                brief_index: i,
                attempt,
                reason: "duplicate_guard",
                details: preGuard.reasons,
              });
              await logRenderAttempt(supabase, {
                pin_queue_id: null,
                product_slug: product.slug,
                niche_key: niche,
                brief,
                attempt_no: attempt,
                scores: {},
                total_score: 0,
                rejected: true,
                reasons: lastReasons,
              });
              if (attempt > EFFECTIVE_MAX_RETRIES) {
                rejected.push({
                  brief,
                  reasons: lastReasons,
                  scores: lastScores,
                  diversity: preGuard,
                  pre_render_skip: true,
                });
                break;
              }
              // Regen the brief with the diversity reasons so the model picks
              // a different angle/headline/CTA next time. No image was rendered.
              const single = await generateBriefs(
                product,
                dna,
                1,
                [brief.pattern_id!] as PatternId[],
                weights,
                { 0: preGuard.reasons },
              );
              brief = {
                ...single[0],
                id: brief.id,
                pattern_id: brief.pattern_id,
              };
              continue;
            }
            // Apply any cheap pool replacements the guard suggested so the
            // overlay we render matches what we'll insert.
            if (Object.keys(preGuard.replacedFromPool).length) {
              if (preGuard.replacedFromPool.headline) {
                brief.headline = preGuard.final.headline;
              }
              if (preGuard.replacedFromPool.cta) brief.cta = preGuard.final.cta;
              if (preGuard.replacedFromPool.hook && preGuard.final.hook) {
                (brief as any).hook_category = preGuard.final.hook;
              }
            }

            // ── PRE-RENDER fidelity gate (2026-07 cost hardening) ────────
            // Score the brief against the product photo BEFORE dispatching
            // the image model. If the predicted fidelity is below threshold
            // we skip image generation entirely and regenerate the brief.
            if (productImageUrl && !emergency) {
              const pre = await predictBriefFidelity(brief, productImageUrl);
              if (pre.score < PRODUCT_FIDELITY_THRESHOLD) {
                stages.push({
                  stage: "brief_fidelity_check",
                  status: "rejected",
                  brief_index: i,
                  attempt,
                  reason: "predicted_fidelity_too_low",
                  details: {
                    score: pre.score,
                    threshold: PRODUCT_FIDELITY_THRESHOLD,
                    notes: pre.notes,
                  },
                });
                lastReasons = [
                  ...lastReasons,
                  `pre_render_fidelity_${pre.score}<${PRODUCT_FIDELITY_THRESHOLD}:${
                    pre.notes.slice(0, 80)
                  }`,
                ];
                await logRenderAttempt(supabase, {
                  pin_queue_id: null,
                  product_slug: product.slug,
                  niche_key: niche,
                  brief,
                  attempt_no: attempt,
                  scores: { pre_render_fidelity: pre.score },
                  total_score: pre.score,
                  rejected: true,
                  reasons: lastReasons,
                });
                if (attempt > EFFECTIVE_MAX_RETRIES) {
                  rejected.push({
                    brief,
                    reasons: lastReasons,
                    scores: { pre_render_fidelity: pre.score },
                    pre_render_skip: true,
                  });
                  break;
                }
                // Regenerate the brief with the predictor's rationale so the
                // next attempt names the product more explicitly. NO image
                // was rendered — this is the whole point of the pre-gate.
                const single = await generateBriefs(
                  product,
                  dna,
                  1,
                  [brief.pattern_id!] as PatternId[],
                  weights,
                  {
                    0: [
                      `predicted product fidelity ${pre.score} — ${pre.notes}`,
                    ],
                  },
                );
                brief = {
                  ...single[0],
                  id: brief.id,
                  pattern_id: brief.pattern_id,
                };
                continue;
              }
              stages.push({
                stage: "brief_fidelity_check",
                status: "ok",
                brief_index: i,
                attempt,
                details: { score: pre.score },
              });
            }

            const bytes = await renderSceneWithSource(
              brief,
              dna,
              productImageUrl,
              inImageOverlay,
            );
            stages.push({
              stage: "image_generation",
              status: "ok",
              brief_index: i,
              attempt,
              details: { bytes: bytes?.byteLength ?? 0 },
            });
            const qc = await qualityCheck(brief, bytes, dna, emergency);
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
              stages.push({
                stage: "quality_gate",
                status: "rejected",
                brief_index: i,
                attempt,
                reason: "quality_gate_failed",
                details: { reasons: qc.reasons, scores: qc.scores },
              });
              if (attempt > EFFECTIVE_MAX_RETRIES) break;
              // Regenerate THIS brief with rejection reasons appended.
              const single = await generateBriefs(
                product,
                dna,
                1,
                [brief.pattern_id!] as PatternId[],
                weights,
                { 0: qc.reasons },
              );
              brief = {
                ...single[0],
                id: brief.id,
                pattern_id: brief.pattern_id,
              };
              continue;
            }

            // Product-truth audit BEFORE publishing the draft.
            let fidelityScore = 100;
            let fidelityNotes = "no_source_image";
            if (productImageUrl && !emergency) {
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
                stages.push({
                  stage: "fidelity_check",
                  status: "rejected",
                  brief_index: i,
                  attempt,
                  reason: "fidelity_score_too_low",
                  details: {
                    score: fidelityScore,
                    threshold: PRODUCT_FIDELITY_THRESHOLD,
                    notes: fidelityNotes,
                  },
                });
                lastReasons = [
                  ...(qc.reasons ?? []),
                  `product_fidelity_${fidelityScore}<${PRODUCT_FIDELITY_THRESHOLD}:${
                    fidelityNotes.slice(0, 80)
                  }`,
                ];
                if (attempt > EFFECTIVE_MAX_RETRIES) break;
                // Retry: regen this brief, source-lock still applied next loop.
                const single = await generateBriefs(
                  product,
                  dna,
                  1,
                  [brief.pattern_id!] as PatternId[],
                  weights,
                  {
                    0: [`product fidelity ${fidelityScore} — ${fidelityNotes}`],
                  },
                );
                brief = {
                  ...single[0],
                  id: brief.id,
                  pattern_id: brief.pattern_id,
                };
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
            if (!guardResult.ok && !emergency) {
              lastReasons = [
                ...lastReasons,
                ...guardResult.reasons.map((r) => `diversity:${r}`),
              ];
              stages.push({
                stage: "post_diversity",
                status: "rejected",
                brief_index: i,
                attempt,
                reason: "duplicate_guard",
                details: guardResult.reasons,
              });
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
              if (guardResult.replacedFromPool.headline) {
                brief.headline = guardResult.final.headline;
              }
              if (guardResult.replacedFromPool.cta) {
                brief.cta = guardResult.final.cta;
              }
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
              {
                id: product.id,
                slug: product.slug,
                name: product.name,
                price: (product as any).price ?? null,
                benefit: (product as any).benefit_angle ?? null,
                category: (product as any).category ?? null,
              },
              niche,
              brief,
              bytes,
              i,
              {
                scores: lastScores,
                attempt_count: attempt,
                hook_category: brief.hook_category,
                rationale: brief.strategy_rationale,
              },
              boardName,
            );
            drafts.push({
              ...inserted,
              brief,
              scores: lastScores,
              attempts: attempt,
              product_fidelity: {
                score: fidelityScore,
                source: productImageUrl,
                notes: fidelityNotes,
              },
            });
            stages.push({
              stage: "queue_insert",
              status: "ok",
              brief_index: i,
              attempt,
              details: { pin_queue_id: (inserted as any)?.id ?? null },
            });
            guard.register(
              {
                headline: brief.headline,
                cta: brief.cta,
                hook: brief.hook_category ?? null,
                product_id: product.id,
              },
              niche,
            );
            accepted = true;
            break;
          } catch (e) {
            lastReasons = [(e as Error).message];
            stages.push({
              stage: "image_generation",
              status: "error",
              brief_index: i,
              attempt,
              reason: (e as Error).message.startsWith("image_generation_killed")
                ? "image_generation_disabled"
                : (e as Error).message,
              details: { error: (e as Error).message },
            });
            if (attempt > EFFECTIVE_MAX_RETRIES) break;
          }
        }

        if (!accepted) {
          const lastRejection = [...stages].reverse().find(
            (s) =>
              s.brief_index === i &&
              (s.status === "rejected" || s.status === "error"),
          );
          rejected.push({ brief, reasons: lastReasons, scores: lastScores });
          stages.push({
            stage: "queue_insert",
            status: "rejected",
            brief_index: i,
            reason: lastRejection?.reason ??
              (lastReasons[0] || "max_retries_exceeded"),
            details: { reasons: lastReasons },
          });
        }
      }

      const approvedCount = fidelityAudit.filter((a) => a.approved).length;
      const rejectedByFidelity = fidelityAudit.filter((a) =>
        !a.approved
      ).length;

      return ok({
        traceId: trace,
        message:
          `Generated ${drafts.length}/${briefs.length} pins (${rejected.length} rejected)`,
        niche,
        product_id: resolvedId,
        product_slug: product.slug,
        product_title: product.name,
        stages,
        drafts_count: drafts.length,
        rejected_count: rejected.length,
        primary_rejection_reason: drafts.length > 0
          ? null
          : (stages.filter((s) => s.status !== "ok").slice(-1)[0]?.reason ??
            "unknown_rejection"),
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
