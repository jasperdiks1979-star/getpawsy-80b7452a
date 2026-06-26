// PCIE2 Hook Intelligence Engine. Generates hooks per product × category × intent.
import { createClient } from "npm:@supabase/supabase-js@2";
import { chatJson, embed, pgvector, HOOK_INTENTS } from "../_shared/pcie2-ai.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODEL = "google/gemini-3-flash-preview";
const PROMPT_VERSION = "hook.v1";

type Body = { product_ids?: string[]; target_per_cell?: number; max_products?: number; dry_run?: boolean };

async function generateBatch(category: string, productTitle: string, intent: string) {
  const system =
    "You write Pinterest hooks for premium US pet ecommerce. JSON only: {\"hooks\":[{\"hook\":string,\"quality\":number}]}. " +
    "No clichés, no emojis. Each hook ≤ 90 chars. Vary openers and structure.";
  const prompt =
    `Write 8 distinct Pinterest hooks for product "${productTitle}" (category ${category}) using the "${intent}" intent. ` +
    `Each hook is a one-liner that promises a clear outcome or curiosity. quality is your own 0-100 confidence.`;
  const out = await chatJson<{ hooks: Array<{ hook: string; quality: number }> }>({ model: MODEL, system, prompt, temperature: 0.9 });
  return Array.isArray(out?.hooks) ? out.hooks.filter((h) => h?.hook) : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = (await req.json().catch(() => ({}))) as Body;
  const target = body.target_per_cell ?? 6;
  const maxProducts = body.max_products ?? 50;

  let products: Array<{ id: string; title: string; category: string | null }> = [];
  if (body.product_ids?.length) {
    const { data } = await SUPA.from("products").select("id,title,category").in("id", body.product_ids);
    products = (data ?? []) as any;
  } else {
    const { data } = await SUPA.from("products").select("id,title,category").eq("active", true).limit(maxProducts);
    products = (data ?? []) as any;
  }

  const { data: existing } = await SUPA.from("pcie2_hook_library").select("product_id, intent, id").eq("retired", false);
  const cell = new Map<string, number>();
  (existing ?? []).forEach((r: any) => {
    if (!r.product_id || !r.intent) return;
    const k = `${r.product_id}|${r.intent}`; cell.set(k, (cell.get(k) ?? 0) + 1);
  });

  let inserted = 0, failed = 0;
  for (const p of products) {
    for (const intent of HOOK_INTENTS) {
      if ((cell.get(`${p.id}|${intent}`) ?? 0) >= target) continue;
      try {
        const batch = await generateBatch(p.category ?? "pet", p.title ?? "Pet product", intent);
        const hooks = batch.map((b) => String(b.hook).trim()).filter((h) => h.length >= 15 && h.length <= 120);
        if (!hooks.length) continue;
        const vecs = await embed(hooks);
        const rows = hooks.map((h, i) => ({
          functional_class: p.category ?? "general",
          category: p.category,
          product_id: p.id,
          intent,
          hook: h,
          hook_type: intent,
          quality_score: Number(batch[i]?.quality ?? 70),
          predicted_ctr: 0.012,
          novelty_score: 1.0,
          duplicate_score: 0.0,
          engagement_prediction: 0.5,
          model_version: MODEL,
          prompt_version: PROMPT_VERSION,
          country: "US",
          language: "en",
          embedding: pgvector(vecs[i] ?? []),
        }));
        if (body.dry_run) { inserted += rows.length; continue; }
        const { error } = await SUPA.from("pcie2_hook_library").upsert(rows, { onConflict: "functional_class,hook", ignoreDuplicates: true });
        if (error) { failed++; continue; }
        inserted += rows.length;
      } catch { failed++; }
    }
  }

  return new Response(JSON.stringify({ ok: true, model: MODEL, products: products.length, inserted, failed }), { headers: { ...cors, "Content-Type": "application/json" } });
});
