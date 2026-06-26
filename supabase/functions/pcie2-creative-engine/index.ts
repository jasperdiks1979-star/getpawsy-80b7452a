// PCIE2 Creative Intelligence Engine — generates creative briefs (not images) per product.
// Each product gets up to 15 concept briefs, each cross-linked to a headline + hook.
// Evolution guard ensures no two near-duplicate briefs for the same product.
import { createClient } from "npm:@supabase/supabase-js@2";
import { chatJson, embed, pgvector, cosine, CREATIVE_CONCEPTS } from "../_shared/pcie2-ai.ts";
import { SIM_THRESHOLD, MAX_EVOLUTION_ATTEMPTS } from "../_shared/pcie2-evolution.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODEL = "google/gemini-3-flash-preview";
const PROMPT_VERSION = "creative.v1";

type Body = { product_ids?: string[]; concepts_per_product?: number; max_products?: number; dry_run?: boolean };

async function generateBrief(product: { title: string; category: string | null }, concept: string, attempt: number) {
  const system =
    "You are an art director for premium US pet ecommerce on Pinterest. " +
    "Reply ONLY with JSON: {prompt:string, negative_prompt:string, layout:string, camera_angle:string, lighting:string, background:string, breed:string, pose:string, composition:string, style:string, cta:string, quality:number, predicted_ctr:number, pinterest_score:number, ai_confidence:number}.";
  const prompt =
    `Product: "${product.title}" (category ${product.category ?? "pet"}). Concept: "${concept}". Attempt #${attempt}. ` +
    `Compose a Pinterest-native creative brief. No watermarks, no on-product text, no AI fluff. ` +
    `Lighting/background/camera_angle/composition must each be 1 short phrase. ` +
    `predicted_ctr 0–1, pinterest_score 0–100, ai_confidence 0–100, quality 0–100.`;
  return await chatJson<any>({ model: MODEL, system, prompt, temperature: 0.95 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = (await req.json().catch(() => ({}))) as Body;
  const conceptsPerProduct = Math.min(15, body.concepts_per_product ?? 10);
  const maxProducts = body.max_products ?? 100;

  let products: Array<{ id: string; title: string; category: string | null }> = [];
  if (body.product_ids?.length) {
    const { data } = await SUPA.from("products").select("id,name,category").in("id", body.product_ids);
    products = ((data ?? []) as any[]).map((p) => ({ ...p, title: p.name }));
  } else {
    const { data } = await SUPA.from("products").select("id,name,category").eq("is_active", true).limit(maxProducts);
    products = ((data ?? []) as any[]).map((p) => ({ ...p, title: p.name }));
  }

  let inserted = 0, evolutionBlocked = 0, failed = 0;
  for (const p of products) {
    // Headlines + hooks for cross-link
    const [{ data: heads }, { data: hooks }] = await Promise.all([
      SUPA.from("pcie2_headline_library").select("id,headline").eq("source_category", p.category).eq("retired", false).limit(50),
      SUPA.from("pcie2_hook_library").select("id,hook").eq("product_id", p.id).eq("retired", false).limit(50),
    ]);
    const existing = await SUPA.from("pcie2_creatives").select("embedding,concept").eq("product_id", p.id).limit(200);
    const existingVecs: number[][] = ((existing.data ?? []) as any[])
      .map((r) => (typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding))
      .filter(Array.isArray);
    const existingConcepts = new Set(((existing.data ?? []) as any[]).map((r) => r.concept).filter(Boolean));

    const toRun = CREATIVE_CONCEPTS.filter((c) => !existingConcepts.has(c)).slice(0, conceptsPerProduct);
    for (const concept of toRun) {
      let brief: any = null;
      let vec: number[] = [];
      let attempts = 0;
      let ok = false;
      while (attempts < MAX_EVOLUTION_ATTEMPTS && !ok) {
        attempts++;
        try {
          brief = await generateBrief(p, concept, attempts);
          const text = `${brief.prompt} ${brief.layout} ${brief.camera_angle} ${brief.lighting} ${brief.background} ${brief.composition} ${brief.style}`;
          const [v] = await embed([text]);
          vec = v ?? [];
          const maxSim = existingVecs.reduce((m, e) => Math.max(m, cosine(vec, e)), 0);
          if (maxSim < SIM_THRESHOLD) { ok = true; break; }
        } catch { /* retry */ }
      }
      if (!ok) { evolutionBlocked++; continue; }
      const headline = heads?.[Math.floor(Math.random() * (heads?.length ?? 1))];
      const hook = hooks?.[Math.floor(Math.random() * (hooks?.length ?? 1))];
      const row = {
        product_id: p.id,
        category: p.category,
        concept,
        prompt: String(brief.prompt ?? "").slice(0, 4000),
        negative_prompt: String(brief.negative_prompt ?? "").slice(0, 1000),
        layout: brief.layout,
        camera_angle: brief.camera_angle,
        lighting: brief.lighting,
        background: brief.background,
        animal_breed: brief.breed,
        pet_pose: brief.pose,
        composition: brief.composition,
        visual_style: brief.style,
        cta: brief.cta,
        headline: headline?.headline ?? null,
        hook: hook?.hook ?? null,
        headline_id: headline?.id ?? null,
        hook_id: hook?.id ?? null,
        quality_score: Number(brief.quality ?? 70),
        predicted_ctr: Number(brief.predicted_ctr ?? 0.012),
        pinterest_score: Number(brief.pinterest_score ?? 70),
        ai_confidence: Number(brief.ai_confidence ?? 80),
        duplicate_score: 0,
        evolution_attempts: attempts,
        model_version: MODEL,
        prompt_version: PROMPT_VERSION,
        status: "draft",
        embedding: pgvector(vec),
        creative_dna: { concept, attempts },
        scores: { quality: brief.quality, predicted_ctr: brief.predicted_ctr, pinterest_score: brief.pinterest_score },
      };
      if (body.dry_run) { inserted++; existingVecs.push(vec); continue; }
      const { error } = await SUPA.from("pcie2_creatives").insert(row);
      if (error) { failed++; continue; }
      inserted++; existingVecs.push(vec);
    }
  }

  return new Response(JSON.stringify({ ok: true, model: MODEL, products: products.length, inserted, evolution_blocked: evolutionBlocked, failed }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
