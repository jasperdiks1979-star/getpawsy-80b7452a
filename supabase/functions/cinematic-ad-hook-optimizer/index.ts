// cinematic-ad-hook-optimizer
//
// Generates 5 hook variants per product across the 5 v4 hook archetypes
// (curiosity, emotional, transformation, problem_solution, authority_social_proof)
// and predicts a CTR score using Lovable AI. Persists into
// public.cinematic_hook_variants. Idempotent per (product_slug, hook_text).
//
// Auth: service role (cron) or admin JWT.
// Modes:
//   { product_slug: "..." }                  — refresh one product
//   { slugs: ["a","b"] }                     — refresh batch
//   { all_active: true, limit?: 50 }         — refresh top N active products
//
// Daily cron @ 03:30 UTC refreshes top 25 active products.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const trace = () => `hopt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const HOOK_TYPES = ["curiosity", "emotional", "transformation", "problem_solution", "authority_social_proof"] as const;
type HookType = typeof HOOK_TYPES[number];

function inferRegister(t: HookType): string {
  switch (t) {
    case "emotional": return "tender";
    case "curiosity": return "surprise";
    case "problem_solution": return "relatable_pain";
    case "transformation": return "aspirational";
    case "authority_social_proof": return "aspirational";
    default: return "relatable_pain";
  }
}

interface HookVariant {
  hook_text: string;
  hook_type: HookType;
  predicted_ctr: number;
  predicted_ctr_rationale: string;
  emotional_register?: string;
}

const SYSTEM_PROMPT = `You are a senior short-form video creative strategist for US TikTok and Pinterest pet brands.
Generate 5 conversion-optimized HOOK variants for a single product, one per archetype:
1. curiosity        — "What if your cat could…" / "Most owners don't know…"
2. emotional        — "Your dog deserves…" / "Watch this melt your heart"
3. transformation   — "Before vs after using…" / "From mess to magic"
4. problem_solution — "Tired of [pain]?" / "Stop the [pain]"
5. authority_social_proof — "23K pet owners switched" / "Vets are obsessed"

Rules:
- Each hook ≤ 7 words.
- Mobile-safe, US-native voice, warm + benefit-led.
- No banned terms: "vet-approved", "eco-friendly", "dropship".
- Predicted CTR is a 0-100 score based on hook strength heuristics (specificity, emotional charge, curiosity gap, social proof density).
- Rationale is one sentence explaining why this hook will stop the scroll.`;

async function generate(productSlug: string, productName: string, productCategory: string): Promise<HookVariant[]> {
  if (!LOVABLE_API_KEY) return fallback(productName);

  const userPrompt = `Product: ${productName}
Category: ${productCategory || "pet supplies"}
Slug: ${productSlug}

Return ONLY JSON: {"variants":[{"hook_text":"...","hook_type":"<archetype>","predicted_ctr":0-100,"predicted_ctr_rationale":"..."}]}
Generate exactly 5 variants, one per archetype, in this order: curiosity, emotional, transformation, problem_solution, authority_social_proof.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.warn("[hook-optimizer] ai", res.status);
      return fallback(productName);
    }
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    const variants = Array.isArray(parsed.variants) ? parsed.variants : [];
    const valid: HookVariant[] = [];
    for (const v of variants) {
      const type = String(v?.hook_type ?? "").toLowerCase();
      if (!HOOK_TYPES.includes(type as HookType)) continue;
      const text = String(v?.hook_text ?? "").trim();
      if (!text || text.length > 80) continue;
      valid.push({
        hook_text: text,
        hook_type: type as HookType,
        predicted_ctr: Math.max(0, Math.min(100, Number(v?.predicted_ctr ?? 50))),
        predicted_ctr_rationale: String(v?.predicted_ctr_rationale ?? "").slice(0, 280),
        emotional_register: ["tender","surprise","relatable_pain","aspirational","funny"].includes(String(v?.emotional_register ?? ""))
          ? String(v.emotional_register) : inferRegister(type as HookType),
      });
    }
    return valid.length === 5 ? valid : fallback(productName, valid);
  } catch (e) {
    console.warn("[hook-optimizer] err", e);
    return fallback(productName);
  }
}

function fallback(name: string, partial: HookVariant[] = []): HookVariant[] {
  const have = new Set(partial.map((v) => v.hook_type));
  const safeName = name || "this";
  const defaults: HookVariant[] = [
    { hook_text: `Most pet owners don't know this`, hook_type: "curiosity", predicted_ctr: 62, predicted_ctr_rationale: "Opens a curiosity gap; broad relatability." },
    { hook_text: `Your pet deserves better`, hook_type: "emotional", predicted_ctr: 64, predicted_ctr_rationale: "Direct emotional appeal to pet-parent identity." },
    { hook_text: `From mess to magic, fast`, hook_type: "transformation", predicted_ctr: 60, predicted_ctr_rationale: "Implies a fast, visible transformation." },
    { hook_text: `Tired of the daily mess?`, hook_type: "problem_solution", predicted_ctr: 66, predicted_ctr_rationale: "Names a daily, high-frequency pain." },
    { hook_text: `23,000 pet owners switched`, hook_type: "authority_social_proof", predicted_ctr: 68, predicted_ctr_rationale: "Specific number triggers trust and FOMO." },
  ];
  return [...partial, ...defaults.filter((d) => !have.has(d.hook_type))].slice(0, 5);
}

async function authorize(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.includes(SERVICE_KEY)) return true;
  if (!authHeader) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return false;
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  return !!role;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    if (!(await authorize(req, admin))) return json(401, { ok: false, traceId, message: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    let targets: { slug: string; name: string; category: string }[] = [];

    if (body.product_slug) {
      const { data: p } = await admin.from("products").select("slug,name,category").eq("slug", body.product_slug).maybeSingle();
      if (p) targets.push({ slug: p.slug, name: p.name, category: p.category });
    } else if (Array.isArray(body.slugs) && body.slugs.length) {
      const { data: ps } = await admin.from("products").select("slug,name,category").in("slug", body.slugs.slice(0, 50));
      targets = (ps ?? []).map((p: any) => ({ slug: p.slug, name: p.name, category: p.category }));
    } else if (body.all_active) {
      const limit = Math.max(1, Math.min(100, Number(body.limit ?? 25)));
      const { data: ps } = await admin.from("products").select("slug,name,category").eq("active", true).order("updated_at", { ascending: false }).limit(limit);
      targets = (ps ?? []).map((p: any) => ({ slug: p.slug, name: p.name, category: p.category }));
    } else {
      return json(400, { ok: false, traceId, message: "provide product_slug, slugs[], or all_active:true" });
    }

    const results: { slug: string; inserted: number; updated: number }[] = [];
    for (const t of targets) {
      const variants = await generate(t.slug, t.name, t.category);
      let inserted = 0, updated = 0;
      for (const v of variants) {
        // upsert on (product_slug, hook_text)
        const { data: existing } = await admin.from("cinematic_hook_variants")
          .select("id").eq("product_slug", t.slug).eq("hook_text", v.hook_text).maybeSingle();
        if (existing?.id) {
          await admin.from("cinematic_hook_variants").update({
            hook_type: v.hook_type,
            predicted_ctr: v.predicted_ctr,
            predicted_ctr_rationale: v.predicted_ctr_rationale,
            product_category: t.category,
            archived: false,
            emotional_register: v.emotional_register ?? inferRegister(v.hook_type),
          }).eq("id", existing.id);
          updated++;
        } else {
          await admin.from("cinematic_hook_variants").insert({
            product_slug: t.slug,
            product_category: t.category,
            hook_text: v.hook_text,
            hook_type: v.hook_type,
            predicted_ctr: v.predicted_ctr,
            predicted_ctr_rationale: v.predicted_ctr_rationale,
            emotional_register: v.emotional_register ?? inferRegister(v.hook_type),
          });
          inserted++;
        }
      }
      results.push({ slug: t.slug, inserted, updated });
    }

    return json(200, { ok: true, traceId, count: targets.length, results });
  } catch (e) {
    return json(500, { ok: false, traceId, message: e instanceof Error ? e.message : String(e) });
  }
});