// Genesis V6.5 — Occupancy-Focused Re-Render
//
// Purpose: when a PRE evaluation shows `product_occupancy_pct < 40`, the pin
// hero is under-selling the product. This function regenerates the hero image
// from scratch (not a tweak of the prior prompt) with an occupancy-first brief
// that pushes the product to 30-45% of the frame, then re-runs PRE. If the new
// evaluation passes at >=95 the freshly generated draft is inserted into
// `pinterest_pin_queue` and PRE's immediate-dispatch path takes over.
//
// Fail-closed: PRE must still pass. No occupancy override, no bypass.
// Max 3 escalating retries per product (35% -> 40% -> 45% target occupancy).
//
// Input:
//   { productIds?: string[], maxRetries?: number, occupancyThreshold?: number }
// If productIds is empty, auto-selects products whose latest PRE evaluation is
// below the occupancy threshold (default from pre_settings.min_occupancy_rerender_pct
// or 40) and has NOT yet passed at >=95.

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
  product_occupancy_pct: number;
  product_visibility_score: number;
  click_intent_score: number;
  blocking_reasons: string[] | null;
};

function speciesLabel(sp: string | null | undefined): string {
  const s = (sp || "").toLowerCase();
  if (s === "cat") return "domestic cat";
  if (s === "dog") return "medium-size friendly dog";
  if (s === "bird") return "small bird (finch or parakeet)";
  if (s === "both") return "cat";
  return "pet";
}

// Escalation ladder — every retry pushes occupancy harder and simplifies the
// scene. We do NOT feed the previous prompt back in; each attempt is a fresh
// hero designed around occupancy from the ground up.
const OCCUPANCY_LADDER = [
  { target: "30-35%", camera: "medium close-up, 50mm equivalent, product fills the lower half of the frame", scene: "minimal Scandinavian home background, single soft prop, warm natural sunlight" },
  { target: "35-45%", camera: "close hero shot, 35mm equivalent, product occupies the lower two-thirds", scene: "clean neutral surface (jute rug or wood floor), out-of-focus warm background, one window light" },
  { target: "40-50%", camera: "tight product hero, macro-adjacent, product dominates the composition, pet head/paw entering frame for scale", scene: "single-tone cream/oat backdrop, zero clutter, single soft rim light" },
];

function buildOccupancyPrompt(p: Product, retryIndex: number, prior: LatestEval | null): string {
  const sp = speciesLabel(p.primary_species);
  const short = p.name.split("–")[0].trim();
  const step = OCCUPANCY_LADDER[Math.min(retryIndex, OCCUPANCY_LADDER.length - 1)];
  const priorLine = prior
    ? `Previous hero failed PRE at ${prior.overall_score}/100 with only ${prior.product_occupancy_pct}% occupancy. DO NOT repeat that framing.`
    : "No prior hero on record for this product.";

  return [
    `Photorealistic Pinterest lifestyle photograph, vertical 2:3 (1000x1500).`,
    `HERO PRODUCT: "${short}" — ${p.category ?? ""}. Species: ${sp}.`,
    `Description: ${(p.description || "").slice(0, 500).replace(/\n+/g, " ")}`,
    ``,
    `PRIMARY OBJECTIVE — PRODUCT OCCUPANCY:`,
    `- The product MUST occupy ${step.target} of the total pixel area. This is non-negotiable.`,
    `- The product is the unambiguous hero. The pet is a supporting cast member, not the focal point.`,
    `- Camera: ${step.camera}.`,
    `- If the pet cannot fit at the required occupancy, show only a paw, tail, or partial silhouette.`,
    ``,
    `SCENE:`,
    `- ${step.scene}.`,
    `- Warm US home aesthetic, cream/oat/beige palette, believable pet-parent moment.`,
    `- Sharp focus on product, natural shallow depth of field only where it helps the product read.`,
    ``,
    `TRUTH CONSTRAINTS:`,
    `- Same color, same form, same features as the actual product. No creative liberties.`,
    `- Species MUST be ${sp}. Absolutely no other species anywhere in the frame.`,
    `- Instantly recognizable within one second as "${short}".`,
    ``,
    `RETRY ${retryIndex + 1}/3 — OCCUPANCY ESCALATION: ${step.target}.`,
    priorLine,
    ``,
    `HARD BANS: white background, floating cutouts, infographics, feature lists, comparison graphics,`,
    `discount banners, product collages, multi-tile layouts, Canva templates, CTA bars, price tags,`,
    `orange title bar, stock-photo look, crowded layouts, any text overlay inside the image.`,
    ``,
    `Deliver ONE frame where a US pet parent instantly sees the product first and the story second.`,
  ].join("\n");
}

async function callGateway(model: string, body: unknown): Promise<any> {
  const r = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, ...(body as object) }),
  });
  if (!r.ok) throw new Error(`gateway_${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return await r.json();
}

async function renderImage(prompt: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const j = await callGateway("google/gemini-3-pro-image-preview", {
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    });
    const url: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url?.startsWith("data:")) return null;
    const m = url.match(/^data:([^;]+);base64,(.*)$/);
    return m ? { mime: m[1], b64: m[2] } : null;
  } catch {
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
  const path = `occupancy-rerender/${slug}/${ts}_r${attempt}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("pinterest-ads")
    .upload(path, bin, { contentType: mime, upsert: false });
  if (error) return null;
  return `${SUPA_URL}/storage/v1/object/public/pinterest-ads/${path}`;
}

async function generatePinCopy(p: Product): Promise<{ title: string; description: string; alt: string }> {
  const sys =
    'You write premium Pinterest copy for a US pet e-commerce brand. Output STRICT JSON: {"title":string(<=95 chars),"description":string(<=460 chars),"alt":string(<=125 chars)}. Warm, benefit-led, US pet-parent voice. No emoji spam, no ALL CAPS, no discounting language.';
  const usr = `Product: ${p.name}\nCategory: ${p.category ?? ""}\nSpecies: ${p.primary_species ?? ""}\nDescription: ${(p.description || "").slice(0, 700)}`;
  try {
    const j = await callGateway("google/gemini-3-flash-preview", {
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
    });
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    return {
      title: String(parsed.title ?? p.name).slice(0, 95),
      description: String(parsed.description ?? "").slice(0, 460),
      alt: String(parsed.alt ?? p.name).slice(0, 125),
    };
  } catch {
    return { title: p.name.slice(0, 95), description: (p.description || p.name).slice(0, 460), alt: p.name.slice(0, 125) };
  }
}

async function loadOccupancyThreshold(supabase: any): Promise<number> {
  const { data } = await supabase
    .from("pre_settings")
    .select("value")
    .eq("key", "min_occupancy_rerender_pct")
    .maybeSingle();
  const raw = data?.value;
  const n = typeof raw === "string" ? Number(raw) : (raw as number);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

async function autoSelectProducts(supabase: any, threshold: number, limit: number): Promise<string[]> {
  // Latest eval per product where occupancy < threshold and not yet passed.
  const { data } = await supabase
    .from("pre_evaluations")
    .select("product_id, product_occupancy_pct, overall_score, passed, created_at")
    .lt("product_occupancy_pct", threshold)
    .eq("passed", false)
    .order("created_at", { ascending: false })
    .limit(limit * 4);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of (data ?? [])) {
    if (!row.product_id || seen.has(row.product_id)) continue;
    seen.add(row.product_id);
    out.push(row.product_id);
    if (out.length >= limit) break;
  }
  return out;
}

type ReportRow = {
  product_slug: string;
  occupancy_before: number | null;
  occupancy_after: number;
  pre_before: number | null;
  pre_after: number;
  retries: number;
  passed: boolean;
  new_pin_queue_id: string | null;
};

async function processProduct(
  supabase: any,
  productId: string,
  maxRetries: number,
  occupancyThreshold: number,
): Promise<ReportRow> {
  const { data: product } = await supabase
    .from("products")
    .select("id,name,slug,description,category,image_url,primary_species")
    .eq("id", productId)
    .maybeSingle();

  const base: ReportRow = {
    product_slug: product?.slug ?? productId,
    occupancy_before: null,
    occupancy_after: 0,
    pre_before: null,
    pre_after: 0,
    retries: 0,
    passed: false,
    new_pin_queue_id: null,
  };
  if (!product) return base;

  const { data: prior } = await supabase
    .from("pre_evaluations")
    .select("overall_score,product_occupancy_pct,product_visibility_score,click_intent_score,blocking_reasons")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  base.pre_before = prior?.overall_score ?? null;
  base.occupancy_before = prior?.product_occupancy_pct ?? null;

  // Gate: only run if occupancy actually below the threshold. If there is no
  // prior eval, we still allow the run — a missing eval is not proof of high
  // occupancy and callers explicitly targeted this product.
  if (prior && (prior.product_occupancy_pct ?? 0) >= occupancyThreshold) {
    return { ...base, occupancy_after: prior.product_occupancy_pct ?? 0, pre_after: prior.overall_score ?? 0 };
  }

  let best = base;
  const traceId = `occrr_${crypto.randomUUID()}`;

  for (let i = 0; i < maxRetries; i++) {
    best.retries = i + 1;
    const prompt = buildOccupancyPrompt(product as Product, i, prior as any);
    const img = await renderImage(prompt);
    if (!img) continue;
    const url = await uploadImage(supabase, product.slug, i, img.b64, img.mime);
    if (!url) continue;

    const copy = await generatePinCopy(product as Product);
    const destination = `https://getpawsy.pet/products/${product.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=occupancy_rerender`;

    // Insert queue row FIRST so PRE can wire immediate dispatch on pass.
    const { data: inserted } = await supabase
      .from("pinterest_pin_queue")
      .insert({
        product_id: product.id,
        product_slug: product.slug,
        product_name: product.name,
        pin_title: copy.title,
        pin_description: copy.description,
        pin_image_url: url,
        destination_link: destination,
        status: "draft",
        meta: {
          source: "pre_occupancy_rerender",
          occupancy_target: OCCUPANCY_LADDER[Math.min(i, OCCUPANCY_LADDER.length - 1)].target,
          retry_index: i,
          trace_id: traceId,
          alt_text: copy.alt,
        },
      })
      .select("id")
      .maybeSingle();

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
      pin_queue_id: inserted?.id ?? null,
      trace_id: traceId,
      function_name: "pre-occupancy-rerender",
    });

    if (verdict.overall_score > best.pre_after) {
      best = {
        ...best,
        occupancy_after: verdict.scores.product_occupancy_pct,
        pre_after: verdict.overall_score,
        passed: verdict.passed,
        new_pin_queue_id: inserted?.id ?? null,
      };
    }

    if (verdict.passed && verdict.overall_score >= 95 && verdict.scores.product_occupancy_pct >= occupancyThreshold) {
      // Draft is already inserted; PRE's immediate-dispatch path will promote it.
      return best;
    }

    // Not good enough — mark this draft rejected so it never publishes.
    if (inserted?.id) {
      await supabase
        .from("pinterest_pin_queue")
        .update({
          status: "rejected",
          rejection_reason: `occupancy_rerender_fail_${verdict.scores.product_occupancy_pct}pct_pre${verdict.overall_score}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);
    }
  }

  return best;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPA_URL, SUPA_SRK);

    const configuredThreshold = await loadOccupancyThreshold(supabase);
    const occupancyThreshold = Number(body?.occupancyThreshold ?? configuredThreshold) || 40;
    const maxRetries = Math.min(3, Math.max(1, Number(body?.maxRetries ?? 3)));
    const limit = Math.min(25, Math.max(1, Number(body?.limit ?? 10)));

    let productIds: string[] = Array.isArray(body?.productIds) ? body.productIds.filter(Boolean) : [];
    let autoSelected = false;
    if (productIds.length === 0) {
      productIds = await autoSelectProducts(supabase, occupancyThreshold, limit);
      autoSelected = true;
    }

    const results: ReportRow[] = [];
    for (const id of productIds) {
      try {
        results.push(await processProduct(supabase, id, maxRetries, occupancyThreshold));
      } catch (err) {
        results.push({
          product_slug: id,
          occupancy_before: null,
          occupancy_after: 0,
          pre_before: null,
          pre_after: 0,
          retries: 0,
          passed: false,
          new_pin_queue_id: null,
        });
        console.error("occupancy_rerender_error", id, (err as Error).message);
      }
    }

    const passed = results.filter((r) => r.passed).length;
    return new Response(
      JSON.stringify({
        occupancy_threshold: occupancyThreshold,
        auto_selected: autoSelected,
        processed: results.length,
        passed,
        failed: results.length - passed,
        results,
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