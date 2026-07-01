// Genesis V6.3 — Golden Template Adaptive Wave
// Regenerates creatives for a targeted list of failed products using the
// PRE=96 "1pc-cat-toys-ball-fast-rolling" Golden DNA. Adapts per-product to
// eliminate the dominant blocker. Fail-closed: PRE must pass at >=95, no
// bypass, max 3 retries per product.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { evaluateProductRelevance } from "../_shared/pre-product-relevance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================
// GOLDEN DNA — extracted from PRE=96 eval ca585701-... (2026-07-01)
// ============================================================
const GOLDEN_DNA = {
  camera: "Eye-level with the pet, shallow depth of field, 85mm lens, sharp focus on the product",
  focal_length: "85mm",
  lighting: "Warm natural sunlight streaming through a window, soft shadows, golden-hour undertone",
  environment: "Modern US living room, jute or wool rug, natural wood, cream/oat/beige Scandinavian palette",
  composition: "Close-up hero action shot — product occupies ~22-30% of the frame as the unambiguous focal point; pet actively interacting with it; owner (optional) softly out of focus in background",
  emotional_trigger: "Playful curiosity from the pet, quiet satisfaction from the owner — authentic pet-parent moment",
  lifestyle_realism: "Photorealistic lifestyle photography, believable US home, no stock-photo look, no floating cutouts, no white background",
  contrast: "Balanced mid-contrast; product silhouette clearly separates from background via light and depth",
  background_complexity: "Simple, uncluttered, warm neutrals — background supports, never competes with, the product",
  pinterest_stopping_power: "Cozy warm palette + curious pet + clearly readable hero product = thumb-stop on mobile",
  shopping_match: "Exact product, exact species, exact use-case shown in-use",
  landing_match: "Matches PDP hero imagery aesthetic (warm home, natural light, realistic pet)",
  click_intent: "A pet parent instantly understands 'this is [product] for my [species]'",
  format: "Vertical 2:3 (1000x1500), Pinterest-native, minimal 2-5 word overlay OR none",
  banned: [
    "infographics", "feature lists", "comparison graphics", "discount banners",
    "product collages", "multi-tile", "floating product cutouts", "Canva templates",
    "CTA bars", "price tags", "stock-photo look", "crowded layouts", "white background",
    "orange title bar", "aggressive CTA",
  ],
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  primary_species: string | null;
};

type LatestEval = {
  overall_score: number;
  blocking_reasons: string[] | null;
  regenerate_brief: any;
  product_visibility_score: number;
  product_occupancy_pct: number;
  click_intent_score: number;
};

function dominantBlocker(ev: LatestEval | null): string {
  if (!ev) return "no_prior_eval";
  const b = ev.blocking_reasons || [];
  // Prefer structured tokens first
  const tokenPriority = [
    "species_mismatch",
    "use_case_mismatch",
    "product_occupancy<20%",
    "product_visibility<95",
    "click_intent<95",
    "shopping_match<95",
    "expectation_match<95",
    "landing_image_divergence",
  ];
  for (const t of tokenPriority) if (b.includes(t)) return t;
  return b[0] ?? "unknown";
}

function speciesLabel(sp: string | null | undefined): string {
  const s = (sp || "").toLowerCase();
  if (s === "cat") return "domestic cat";
  if (s === "dog") return "medium-size friendly dog";
  if (s === "bird") return "small bird (finch or parakeet)";
  if (s === "both") return "cat";
  return "pet";
}

function buildAdaptivePrompt(
  product: Product,
  blocker: string,
  retryIndex: number,
  prior: LatestEval | null,
): string {
  const sp = speciesLabel(product.primary_species);
  const productShort = product.name.split("–")[0].trim();

  const blockerFix: Record<string, string> = {
    species_mismatch: `CRITICAL: The pet in the image MUST be a ${sp}. Absolutely NO other species. Do not include any dog if this is a cat product, and vice versa.`,
    use_case_mismatch: `CRITICAL: The scene must clearly depict the product's actual use case (${product.category || "as designed"}). No unrelated activities.`,
    "product_occupancy<20%": `CRITICAL: The product must occupy AT LEAST 25% of the frame. Move it closer to the camera, make it the unambiguous hero — not a background prop.`,
    "product_visibility<95": `CRITICAL: The product must be fully visible, in sharp focus, unobstructed, instantly recognizable within 1 second. No obscuring cover, no bag, no clutter.`,
    "click_intent<95": `CRITICAL: A US pet parent scrolling Pinterest must instantly identify this as "${productShort}". The product IS the story, not a prop in someone's lifestyle.`,
    "shopping_match<95": `CRITICAL: This image must sell THIS specific product — same colour, same form, same features as the PDP hero image.`,
    "expectation_match<95": `CRITICAL: The pin's visual promise must match what the buyer receives on the product page.`,
    landing_image_divergence: `CRITICAL: The scene, lighting, and product presentation must feel visually consistent with the PDP hero image.`,
  };

  const priorFails = prior
    ? `Previous PRE failed at ${prior.overall_score}/100. Occupancy was ${prior.product_occupancy_pct}%, visibility ${prior.product_visibility_score}, click_intent ${prior.click_intent_score}. DO NOT REPEAT.`
    : "No prior evaluation available.";

  const escalation = retryIndex === 0
    ? "Balanced lifestyle scene with hero product."
    : retryIndex === 1
    ? "Push product occupancy toward 30-35%. Reduce background elements. Move camera closer."
    : "MAXIMUM occupancy 35-45%. Product fills the lower two-thirds of the frame. Pet actively touching or using product. Zero background clutter.";

  return [
    `Photorealistic Pinterest lifestyle photograph, vertical 2:3 (1000x1500).`,
    `Product: "${productShort}" — ${product.category ?? ""}. Species: ${sp}.`,
    `Description context: ${(product.description || "").slice(0, 500).replace(/\n+/g, " ")}`,
    ``,
    `GOLDEN DNA (mandatory):`,
    `- Camera: ${GOLDEN_DNA.camera}`,
    `- Lighting: ${GOLDEN_DNA.lighting}`,
    `- Environment: ${GOLDEN_DNA.environment}`,
    `- Composition: ${GOLDEN_DNA.composition}`,
    `- Emotion: ${GOLDEN_DNA.emotional_trigger}`,
    `- Realism: ${GOLDEN_DNA.lifestyle_realism}`,
    `- Contrast: ${GOLDEN_DNA.contrast}`,
    ``,
    `DOMINANT BLOCKER FIX (${blocker}):`,
    blockerFix[blocker] ?? `Focus on maximum product clarity and species/use-case truth.`,
    ``,
    `RETRY ESCALATION (attempt ${retryIndex + 1}/3): ${escalation}`,
    priorFails,
    ``,
    `HARD BANS: ${GOLDEN_DNA.banned.join(", ")}. No text overlays in the image itself.`,
    `Deliver a single frame that a US pet parent would save on Pinterest and immediately click through to buy.`,
  ].join("\n");
}

async function callGateway(model: string, body: any): Promise<any> {
  const r = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, ...body }),
  });
  if (!r.ok) throw new Error(`gateway_${r.status}: ${await r.text().catch(() => "")}`.slice(0, 400));
  return await r.json();
}

async function renderImage(prompt: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const j = await callGateway("google/gemini-3-pro-image-preview", {
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    });
    const msg = j?.choices?.[0]?.message;
    const images = msg?.images || [];
    const first = images[0];
    const url: string | undefined = first?.image_url?.url;
    if (!url || !url.startsWith("data:")) return null;
    const m = url.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return null;
    return { mime: m[1], b64: m[2] };
  } catch (_) {
    return null;
  }
}

async function uploadImage(
  supabase: any,
  slug: string,
  attempt: number,
  b64: string,
  mime: string,
): Promise<string | null> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const path = `golden-adaptive/${slug}/${ts}_r${attempt}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("pinterest-ads")
    .upload(path, bin, { contentType: mime, upsert: false });
  if (error) return null;
  return `${SUPA_URL}/storage/v1/object/public/pinterest-ads/${path}`;
}

async function generatePinCopy(
  product: Product,
): Promise<{ title: string; description: string; alt: string }> {
  const sys =
    "You write premium Pinterest copy for a US pet e-commerce brand. Output STRICT JSON: {\"title\":string(<=95 chars),\"description\":string(<=460 chars),\"alt\":string(<=125 chars)}. Warm, benefit-led, US pet-parent voice. No emoji spam, no ALL CAPS, no discounting language.";
  const usr = `Product: ${product.name}\nCategory: ${product.category ?? ""}\nSpecies: ${product.primary_species ?? ""}\nDescription: ${(product.description || "").slice(0, 700)}`;
  try {
    const j = await callGateway("google/gemini-3-flash-preview", {
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
    });
    const raw = j?.choices?.[0]?.message?.content ?? "{}";
    const p = JSON.parse(raw);
    return {
      title: String(p.title ?? product.name).slice(0, 95),
      description: String(p.description ?? "").slice(0, 460),
      alt: String(p.alt ?? product.name).slice(0, 125),
    };
  } catch {
    return {
      title: product.name.slice(0, 95),
      description: (product.description || product.name).slice(0, 460),
      alt: product.name.slice(0, 125),
    };
  }
}

type ReportRow = {
  product: string;
  dominant_blocker: string;
  pre_before: number | null;
  pre_after: number;
  retry_count: number;
  passed: boolean;
  new_publishable_pins: number;
};

async function processProduct(
  supabase: any,
  productId: string,
  maxRetries: number,
): Promise<ReportRow> {
  const { data: product } = await supabase
    .from("products")
    .select("id,name,slug,description,category,image_url,primary_species")
    .eq("id", productId)
    .maybeSingle();
  if (!product) {
    return {
      product: productId,
      dominant_blocker: "product_not_found",
      pre_before: null,
      pre_after: 0,
      retry_count: 0,
      passed: false,
      new_publishable_pins: 0,
    };
  }

  const { data: prior } = await supabase
    .from("pre_evaluations")
    .select(
      "overall_score,blocking_reasons,regenerate_brief,product_visibility_score,product_occupancy_pct,click_intent_score",
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const blocker = dominantBlocker(prior as any);
  const preBefore = prior?.overall_score ?? null;

  let best = { score: 0, verdict: null as any, imageUrl: null as string | null };
  let retries = 0;

  for (let i = 0; i < maxRetries; i++) {
    retries = i + 1;
    const prompt = buildAdaptivePrompt(product as Product, blocker, i, prior as any);
    const img = await renderImage(prompt);
    if (!img) continue;
    const url = await uploadImage(supabase, product.slug, i, img.b64, img.mime);
    if (!url) continue;

    const copy = await generatePinCopy(product as Product);
    const destination = `https://getpawsy.pet/products/${product.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=golden_adaptive`;

    const verdict = await evaluateProductRelevance(supabase, {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      product_description: product.description,
      product_image_url: product.image_url,
      product_primary_species: product.primary_species,
      product_category: product.category,
      pin_title: copy.title,
      pin_description: copy.description,
      pin_image_url: url,
      destination_link: destination,
      function_name: "genesis-golden-adaptive-wave",
    });

    if (verdict.overall_score > best.score) {
      best = { score: verdict.overall_score, verdict, imageUrl: url };
    }

    if (verdict.passed && verdict.overall_score >= 95) {
      // Queue for publishing
      await supabase.from("pinterest_pin_queue").insert({
        product_id: product.id,
        product_slug: product.slug,
        product_name: product.name,
        pin_title: copy.title,
        pin_description: copy.description,
        pin_image_url: url,
        destination_link: destination,
        status: "draft",
        meta: {
          source: "genesis_golden_adaptive_wave",
          golden_dna_version: "v1_pre96_cat_ball",
          dominant_blocker: blocker,
          retry_count: retries,
          pre_score: verdict.overall_score,
          alt_text: copy.alt,
        },
      });
      return {
        product: product.slug,
        dominant_blocker: blocker,
        pre_before: preBefore,
        pre_after: verdict.overall_score,
        retry_count: retries,
        passed: true,
        new_publishable_pins: 1,
      };
    }
  }

  return {
    product: product.slug,
    dominant_blocker: blocker,
    pre_before: preBefore,
    pre_after: best.score,
    retry_count: retries,
    passed: false,
    new_publishable_pins: 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const productIds: string[] = Array.isArray(body?.productIds) ? body.productIds : [];
    const maxRetries = Math.min(3, Math.max(1, Number(body?.maxRetries ?? 3)));
    if (!productIds.length) {
      return new Response(JSON.stringify({ error: "productIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPA_URL, SUPA_SRK);

    const results: ReportRow[] = [];
    for (const id of productIds) {
      try {
        results.push(await processProduct(supabase, id, maxRetries));
      } catch (err) {
        results.push({
          product: id,
          dominant_blocker: `error:${(err as Error).message.slice(0, 60)}`,
          pre_before: null,
          pre_after: 0,
          retry_count: 0,
          passed: false,
          new_publishable_pins: 0,
        });
      }
    }

    // Expected total publishable pins after this wave = 2 (previous golden batch) + new passes
    const { count: existingPublishable } = await supabase
      .from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "queued", "scheduled"]);

    const newPasses = results.filter((r) => r.passed).length;

    return new Response(
      JSON.stringify({
        golden_dna_version: "v1_pre96_cat_ball",
        results,
        summary: {
          processed: results.length,
          passed: newPasses,
          failed: results.length - newPasses,
          new_publishable_pins: newPasses,
          expected_total_publishable_pins_after_wave: existingPublishable ?? newPasses,
        },
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});