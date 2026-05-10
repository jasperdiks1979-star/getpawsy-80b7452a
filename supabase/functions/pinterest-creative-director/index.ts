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
import { scorePin, QUALITY_THRESHOLD, MAX_RETRIES } from "../_shared/pinterest-quality.ts";

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
}

// ── 1. profile_product ─────────────────────────────────────────────────────

async function loadOrBuildProfile(
  supabase: ReturnType<typeof createClient>,
  productId: string,
  force: boolean,
): Promise<{ niche: NicheKey; dna: StyleDNA; product: any; cached: boolean }> {
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, slug, description, category, product_type, image_url")
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
  product: { name: string; description?: string | null },
  dna: StyleDNA,
  count: number,
  patternIds?: PatternId[],
  weights: LearningWeight[] = [],
  retryReasonsByIndex: Record<number, string[]> = {},
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
      headline: s.hook_phrase,
      cta: s.cta_phrase,
      scene_directive: s.scene_directive,
      rationale: s.rationale,
    })),
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
        "Use strategies[i].headline as the headline VERBATIM and strategies[i].cta as the cta VERBATIM. Build the scene around strategies[i].scene_directive.",
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
    // Strategy lock: prefer the strategy-picked phrase if the model drifted.
    headline: safeText(String(b.headline || strategies[i]?.hook_phrase || ""), 42),
    cta: safeText(String(b.cta || strategies[i]?.cta_phrase || ""), 18),
    full_prompt: String(b.full_prompt || ""),
    pattern_id: patterns[i]?.id,
    hook_category: strategies[i]?.hook_category,
    strategy_rationale: strategies[i]?.rationale,
    retry_reasons: retryReasonsByIndex[i],
  }));
}

// ── 3. render scene ────────────────────────────────────────────────────────

async function renderScene(brief: SceneBrief, dna: StyleDNA): Promise<Uint8Array> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const pattern = brief.pattern_id ? getPattern(brief.pattern_id) : null;
  const patternDirective = pattern
    ? `\nPattern lock — ${pattern.label}: ${pattern.composition_rule} ` +
      `Whitespace budget: ${pattern.whitespace}. ` +
      `Negative directives — strictly avoid: ${pattern.must_avoid.join(", ")}.`
    : "";

  const styleSuffix =
    `Cinematic editorial photography, ${dna.light}, mood: ${dna.mood}. ` +
    `Premium DTC pet brand aesthetic. Realistic textures, natural shadows, correct perspective. ` +
    `Vertical 9:16 composition for Pinterest, leave clean space at the top third for a single elegant headline ` +
    `(do NOT render any text, captions, watermarks, logos, or graphic overlays in the image itself). ` +
    `Absolutely NO floating product cutouts, NO collage, NO template look, NO CTA bars.`;

  const prompt = `${brief.full_prompt}\n\nDirection: ${styleSuffix}${patternDirective}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: "user", content: prompt }],
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

// ── 4. quality filter (delegates to multi-axis scorer) ─────────────────────

async function qualityCheck(
  brief: SceneBrief,
  bytes: Uint8Array,
  dna: StyleDNA,
) {
  const pattern = brief.pattern_id ? getPattern(brief.pattern_id) : null;
  return await scorePin({
    bytes,
    headline: brief.headline,
    cta: brief.cta,
    full_prompt: brief.full_prompt,
    environment_summary: brief.environment_summary,
    dna,
    pattern,
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
): Promise<string | null> {
  try {
    // Prefer exact niche+hook match, then niche-only, then any enabled.
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
  product: { id: string; slug: string; name: string },
  niche: NicheKey,
  brief: SceneBrief,
  bytes: Uint8Array,
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

  const patternTag = brief.pattern_id ? `_${brief.pattern_id.slice(0, 12)}` : "";
  const variant = `cd_${niche}${patternTag}_${stamp}_${brief.id.slice(-6)}`;

  // Phase 1 congruency: route to /go/{slug} when a landing template exists
  // for this niche/hook, otherwise keep the PDP destination. The choice is
  // also recorded in `pinterest_creative_intents` for analytics.
  const landingSlug = await pickLandingSlug(supabase, niche, brief.hook_category ?? null);
  const hookParam = encodeURIComponent(brief.emotional_hook.slice(0, 40));
  const destination = landingSlug
    ? `${BASE_URL}/go/${landingSlug}?utm_source=pinterest&utm_medium=social&utm_campaign=creative_director&utm_content=${landingSlug}&hook=${hookParam}&intent=${encodeURIComponent(brief.hook_category ?? "")}`
    : `${BASE_URL}/products/${product.slug}?utm_source=pinterest&utm_medium=social&utm_campaign=creative_director&utm_content=${niche}&hook=${hookParam}`;

  const row = {
    product_id: product.id,
    product_slug: product.slug,
    product_name: product.name,
    pin_variant: variant,
    pin_title: brief.headline,
    pin_description: `${brief.emotional_hook}. ${brief.environment_summary}`.slice(0, 480),
    pin_image_url: imageUrl,
    destination_link: destination,
    priority: "high" as const,
    status: "draft" as const,
    scheduled_at: new Date().toISOString(),
    hook_group: brief.pattern_id || niche,
    category_key: niche,
    overlay_text: `${brief.headline} • ${brief.cta}`,
    meta: intelligence
      ? {
          intelligence: {
            scores: intelligence.scores,
            attempt_count: intelligence.attempt_count,
            hook_category: intelligence.hook_category ?? null,
            pattern_id: brief.pattern_id ?? null,
            rationale: intelligence.rationale ?? null,
          },
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
      meta: {
        scores: intelligence?.scores ?? null,
        rationale: intelligence?.rationale ?? null,
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
      let briefs = await generateBriefs(product, dna, count, undefined, weights);

      const drafts: any[] = [];
      const rejected: any[] = [];

      // Per-brief retry: render → score → if fail, regen JUST that brief with
      // the failure reasons appended, up to MAX_RETRIES extra attempts.
      for (let i = 0; i < briefs.length; i++) {
        let brief = briefs[i];
        let accepted = false;
        let lastReasons: string[] = [];
        let lastScores: Record<string, number> = {};

        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
          try {
            const bytes = await renderScene(brief, dna);
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
            drafts.push({ ...inserted, brief, scores: lastScores, attempts: attempt });
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

      return ok({
        traceId: trace,
        message: `Generated ${drafts.length}/${briefs.length} pins (${rejected.length} rejected)`,
        niche,
        approved_required: true,
        threshold: QUALITY_THRESHOLD,
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