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
): Promise<SceneBrief[]> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const sys = [
    "You are a Creative Director for a premium US pet brand running Pinterest ads.",
    "You write SCENE BRIEFS for an AI image model that will photograph each scene.",
    "Style: editorial DTC photography. NEVER floating product cards, NEVER collage,",
    "NEVER giant CTA bars, NEVER text overlays in the brief itself (text is added later).",
    "Each brief must be a fully-composed real lifestyle scene with the product naturally placed.",
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
    rules: {
      headline_max_chars: 42,
      cta_max_chars: 18,
      headline_count: 1,
      cta_count: 1,
      no_text_in_image_prompt: true,
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
    headline: safeText(String(b.headline || ""), 42),
    cta: safeText(String(b.cta || ""), 18),
    full_prompt: String(b.full_prompt || ""),
  }));
}

// ── 3. render scene ────────────────────────────────────────────────────────

async function renderScene(brief: SceneBrief, dna: StyleDNA): Promise<Uint8Array> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const styleSuffix =
    `Cinematic editorial photography, ${dna.light}, mood: ${dna.mood}. ` +
    `Premium DTC pet brand aesthetic. Realistic textures, natural shadows, correct perspective. ` +
    `Vertical 9:16 composition for Pinterest, leave clean space at the top third for a single elegant headline ` +
    `(do NOT render any text, captions, watermarks, logos, or graphic overlays in the image itself). ` +
    `Absolutely NO floating product cutouts, NO collage, NO template look, NO CTA bars.`;

  const prompt = `${brief.full_prompt}\n\nDirection: ${styleSuffix}`;

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

// ── 4. quality filter ──────────────────────────────────────────────────────

function qualityCheck(
  brief: SceneBrief,
  bytes: Uint8Array,
  dna: StyleDNA,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!bytes || bytes.length < 80 * 1024) reasons.push("image too small (<80KB)");
  if (bytes && bytes.length > 8 * 1024 * 1024) reasons.push("image too large (>8MB)");
  if (!brief.headline) reasons.push("missing headline");
  if (brief.headline.length > 42) reasons.push("headline >42 chars");
  if (!brief.cta) reasons.push("missing cta");
  if (brief.cta.length > 18) reasons.push("cta >18 chars");
  const banned = [...dna.banned_terms];
  for (const field of [brief.headline, brief.cta, brief.full_prompt]) {
    const hit = containsBanned(field, banned);
    if (hit) reasons.push(`banned term: "${hit}"`);
  }
  return { ok: reasons.length === 0, reasons };
}

// ── 5. upload + insert ─────────────────────────────────────────────────────

async function uploadAndInsertDraft(
  supabase: ReturnType<typeof createClient>,
  product: { id: string; slug: string; name: string },
  niche: NicheKey,
  brief: SceneBrief,
  bytes: Uint8Array,
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

  const variant = `cd_${niche}_${stamp}_${brief.id.slice(-6)}`;
  const destination = `${BASE_URL}/products/${product.slug}?utm_source=pinterest&utm_medium=social&utm_campaign=creative_director&utm_content=${niche}&hook=${encodeURIComponent(
    brief.emotional_hook.slice(0, 40),
  )}`;

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
    hook_group: niche,
    category_key: niche,
    overlay_text: `${brief.headline} • ${brief.cta}`,
  };

  const ins = await supabase
    .from("pinterest_pin_queue")
    .insert(row)
    .select("id")
    .single();
  if (ins.error) throw new Error(`insert failed: ${ins.error.message}`);
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
      const briefs = await generateBriefs(product, dna, count);

      const drafts: any[] = [];
      const rejected: any[] = [];

      for (const brief of briefs) {
        try {
          const bytes = await renderScene(brief, dna);
          const qc = qualityCheck(brief, bytes, dna);
          if (!qc.ok) {
            rejected.push({ brief, reasons: qc.reasons });
            continue;
          }
          const inserted = await uploadAndInsertDraft(
            supabase,
            { id: product.id, slug: product.slug, name: product.name },
            niche,
            brief,
            bytes,
          );
          drafts.push({ ...inserted, brief });
        } catch (e) {
          rejected.push({ brief, reasons: [(e as Error).message] });
        }
      }

      return ok({
        traceId: trace,
        message: `Generated ${drafts.length}/${briefs.length} pins (${rejected.length} rejected)`,
        niche,
        approved_required: true,
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