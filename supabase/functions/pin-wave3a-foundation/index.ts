// Wave 3A — Pinterest Creative Intelligence V2 Foundation.
// Builds product intelligence (Step 1) + landing validations (Step 2)
// + bakes root cause fixes (Step 11) into permanent V2 tables.
//
// Actions:
//   POST { action: "run", limit?: number, dry_run?: boolean }
//   POST { action: "intelligence_only", limit?: number }
//   POST { action: "validate_only", limit?: number }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { containsPinterestBannedCopy } from "../_shared/pinterest-banned-copy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const PUBLIC_BASE = Deno.env.get("PUBLIC_SITE_URL") ?? "https://getpawsy.pet";

const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

const INTELLIGENCE_MODEL = "google/gemini-2.5-flash"; // multimodal, cheap
const INTELLIGENCE_SCHEMA = {
  type: "object",
  properties: {
    species: { type: "string", enum: ["cat", "dog", "bird", "fish", "small_pet", "multi", "unknown"] },
    category: { type: "string" },
    emotional_trigger: { type: "string" },
    buying_intent: { type: "string", enum: ["impulse", "considered", "gift", "replenishment", "research"] },
    lifestyle_context: { type: "string" },
    seasonality: { type: "string" },
    visual_style: { type: "string" },
    audience: { type: "string" },
    price_tier: { type: "string", enum: ["budget", "mid", "premium", "luxury"] },
    usp_hierarchy: { type: "array", items: { type: "string" }, maxItems: 5 },
    pinterest_board_slug: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["species", "category", "emotional_trigger", "buying_intent", "visual_style", "audience", "price_tier", "usp_hierarchy", "confidence"],
};

async function aiClassify(product: any): Promise<{ data: any; raw: any; model: string } | null> {
  const sys = `You are GetPawsy's Pinterest creative strategist. Given a US pet product, return a strict JSON profile.
Rules:
- species MUST be inferred from product name + category. NEVER say "litter box" or anything litter-related unless the product itself is a litter box.
- usp_hierarchy: 3-5 buyer-facing benefits, sorted by importance.
- confidence 0-100: how confident you are in the full profile.
- pinterest_board_slug: lowercase slug like "cat-trees", "dog-beds", "bird-feeders". Match category.
- Be brutally specific. No fluff, no marketing copy.`;
  const usr = `Product:
Name: ${product.name}
Category: ${product.category ?? "unknown"}
Slug: ${product.slug}
Description: ${(product.description ?? "").slice(0, 1200)}
SEO title: ${product.seo_title ?? ""}
Price: $${product.price ?? "?"}

Return ONLY a JSON object matching this schema (no prose, no markdown):
${JSON.stringify(INTELLIGENCE_SCHEMA)}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
      body: JSON.stringify({
        model: INTELLIGENCE_MODEL,
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      console.error("ai err", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = await res.json();
    const txt = j?.choices?.[0]?.message?.content ?? "{}";
    const data = JSON.parse(txt);
    return { data, raw: j, model: INTELLIGENCE_MODEL };
  } catch (e) {
    console.error("ai exception", e);
    return null;
  }
}

async function validateLanding(product: any): Promise<{ passed: boolean; checks: Record<string, boolean>; reasons: string[]; status?: number; url: string }> {
  const url = `${PUBLIC_BASE}/products/${product.slug}`;
  const reasons: string[] = [];
  const checks: Record<string, boolean> = {
    product_exists: !!product.id,
    product_active: !!product.is_active,
    images_available: !!product.image_url,
    price_visible: typeof product.price === "number" && product.price > 0,
    in_stock: (product.effective_stock ?? 0) > 0,
    title_clean: !containsPinterestBannedCopy(product.name),
    seo_title_present: !!product.seo_title,
    slug_valid: typeof product.slug === "string" && product.slug.length > 3,
  };
  let status: number | undefined;
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "manual" });
    status = head.status;
    checks.no_404 = status !== 404 && status !== 410;
    checks.no_redirect = !(status >= 300 && status < 400);
    checks.http_ok = status === 200;
  } catch (e) {
    checks.no_404 = false;
    checks.http_ok = false;
    reasons.push(`fetch_failed:${(e as Error).message}`);
  }
  for (const [k, v] of Object.entries(checks)) if (!v) reasons.push(k);
  const passed = reasons.length === 0;
  return { passed, checks, reasons, status, url };
}

async function logStep(runId: string, name: string, status: string, meta: any = {}, error?: string) {
  await supa.from("pin_wave3_steps").insert({
    run_id: runId, step_name: name, status, meta,
    completed_at: status === "done" || status === "error" ? new Date().toISOString() : null,
    error,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "run";
  const limit = Number(body.limit ?? 1000);
  const skipAi = action === "validate_only";
  const skipValidate = action === "intelligence_only";

  const { data: run } = await supa.from("pin_wave3_runs")
    .insert({ wave: "3A", status: "running", totals: { action, limit } }).select().single();
  const runId = run!.id;

  try {
    // Resume support: skip products that already have intelligence + a validation.
    const { data: doneIntel } = await supa.from("pin_product_intelligence").select("product_id");
    const { data: doneVal } = await supa.from("pin_landing_validations").select("product_id");
    const intelDone = new Set((doneIntel ?? []).map((r: any) => r.product_id));
    const valDone = new Set((doneVal ?? []).map((r: any) => r.product_id));

    const { data: productsAll, error } = await supa
      .from("products")
      .select("id, slug, name, category, description, price, effective_stock, image_url, is_active, seo_title")
      .eq("is_active", true);
    if (error) throw error;
    const products = (productsAll ?? []).filter((p: any) => {
      const needIntel = !skipAi && !intelDone.has(p.id);
      const needVal = !skipValidate && !valDone.has(p.id);
      return needIntel || needVal;
    }).slice(0, limit);

    let intelOk = 0, intelFail = 0, valOk = 0, valFail = 0;
    const failReasonsTally: Record<string, number> = {};
    const CONCURRENCY = 8;
    const all = products ?? [];
    for (let i = 0; i < all.length; i += CONCURRENCY) {
      const chunk = all.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (p: any) => {
        if (!skipAi) {
          const r = await aiClassify(p);
          if (r && r.data && typeof r.data.confidence === "number") {
            const d = r.data;
            await supa.from("pin_product_intelligence").insert({
              product_id: p.id, product_slug: p.slug,
              species: d.species, category: d.category,
              emotional_trigger: d.emotional_trigger, buying_intent: d.buying_intent,
              lifestyle_context: d.lifestyle_context, seasonality: d.seasonality,
              visual_style: d.visual_style, audience: d.audience,
              price_tier: d.price_tier, usp_hierarchy: d.usp_hierarchy ?? [],
              pinterest_board_id: d.pinterest_board_slug,
              landing_url: `${PUBLIC_BASE}/products/${p.slug}`,
              confidence: d.confidence, model_used: r.model, raw_response: d, version: 1,
            });
            intelOk++;
          } else intelFail++;
        }
        if (!skipValidate) {
          const v = await validateLanding(p);
          await supa.from("pin_landing_validations").insert({
            product_id: p.id, product_slug: p.slug, landing_url: v.url,
            passed: v.passed, checks: v.checks, failed_reasons: v.reasons,
            http_status: v.status,
          });
          if (v.passed) valOk++; else { valFail++; v.reasons.forEach((r: string) => { failReasonsTally[r] = (failReasonsTally[r] ?? 0) + 1; }); }
        }
      }));
    }

    const totals = { products: products?.length ?? 0, intelOk, intelFail, valOk, valFail, failReasonsTally };
    await supa.from("pin_wave3_runs").update({ status: "done", totals, completed_at: new Date().toISOString() }).eq("id", runId);
    await logStep(runId, "wave3a_complete", "done", totals);

    return new Response(JSON.stringify({ ok: true, run_id: runId, ...totals }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    await supa.from("pin_wave3_runs").update({ status: "error", error: msg, completed_at: new Date().toISOString() }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: msg, run_id: runId }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});