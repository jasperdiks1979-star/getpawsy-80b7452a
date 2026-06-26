// PCIE2 Headline Intelligence Engine — self-generating, continuously expanding.
// Each invocation tops up any (category × family) cell below the target floor.
// Inputs (optional): { categories?: string[], target_per_cell?: number, max_calls?: number }
import { createClient } from "npm:@supabase/supabase-js@2";
import { chatJson, embed, pgvector, HEADLINE_FAMILIES, readingGrade } from "../_shared/pcie2-ai.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPA = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MODEL = "google/gemini-3-flash-preview";
const PROMPT_VERSION = "headline.v1";

type Body = { categories?: string[]; target_per_cell?: number; max_calls?: number; dry_run?: boolean };

async function generateBatch(category: string, family: string): Promise<Array<{ headline: string; emotion: string }>> {
  const system =
    "You are a Pinterest-native headline writer for premium US pet ecommerce. " +
    "Reject AI fluff and clichés. Output ONLY a JSON object: {\"headlines\":[{\"headline\":string,\"emotion\":string}]}.";
  const prompt =
    `Generate 10 distinct Pinterest pin headlines for category="${category}" using the "${family}" headline family. ` +
    `Constraints: 35–80 chars, no emojis, no "Stop scooping" / "vet-approved" / "eco-friendly" / "Game changer" / "Must-have". ` +
    `Different angle for each headline; vary opener, structure, and vocabulary. emotion = one of: ` +
    `awe, anticipation, joy, relief, trust, surprise, curiosity, pride, calm, urgency.`;
  const out = await chatJson<{ headlines: Array<{ headline: string; emotion: string }> }>({ model: MODEL, system, prompt, temperature: 0.95 });
  return Array.isArray(out?.headlines) ? out.headlines.filter((h) => h?.headline) : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = (await req.json().catch(() => ({}))) as Body;
  const target = body.target_per_cell ?? 25;
  const maxCalls = body.max_calls ?? 50;

  let categories = body.categories;
  if (!categories?.length) {
    const { data } = await SUPA.from("products").select("category").not("category", "is", null).eq("active", true).limit(2000);
    const set = new Set<string>(); (data ?? []).forEach((r: any) => r.category && set.add(String(r.category)));
    categories = Array.from(set).slice(0, 25);
  }

  const { data: counts } = await SUPA
    .from("pcie2_headline_library")
    .select("source_category, family, id")
    .eq("retired", false);
  const cellCount = new Map<string, number>();
  (counts ?? []).forEach((r: any) => {
    if (!r.source_category || !r.family) return;
    const k = `${r.source_category}|${r.family}`;
    cellCount.set(k, (cellCount.get(k) ?? 0) + 1);
  });

  const calls: Array<{ category: string; family: string }> = [];
  for (const c of categories) {
    for (const f of HEADLINE_FAMILIES) {
      const have = cellCount.get(`${c}|${f}`) ?? 0;
      if (have < target) calls.push({ category: c, family: f });
      if (calls.length >= maxCalls) break;
    }
    if (calls.length >= maxCalls) break;
  }

  let inserted = 0, failed = 0;
  for (const { category, family } of calls) {
    try {
      const batch = await generateBatch(category, family);
      if (!batch.length) continue;
      const headlines = batch.map((b) => String(b.headline).trim()).filter((h) => h.length >= 20 && h.length <= 120);
      if (!headlines.length) continue;
      const vecs = await embed(headlines);
      const rows = headlines.map((h, i) => ({
        functional_class: category,
        source_category: category,
        family,
        headline: h,
        emotion: batch[i]?.emotion ?? null,
        reading_grade: readingGrade(h),
        length: h.length,
        hook_type: family,
        model_version: MODEL,
        prompt_version: PROMPT_VERSION,
        embedding: pgvector(vecs[i] ?? []),
        source: "ai",
      }));
      if (body.dry_run) { inserted += rows.length; continue; }
      const { error } = await SUPA.from("pcie2_headline_library").upsert(rows, { onConflict: "functional_class,headline", ignoreDuplicates: true });
      if (error) { failed++; continue; }
      inserted += rows.length;
    } catch (_e) { failed++; }
  }

  return new Response(JSON.stringify({ ok: true, model: MODEL, prompt_version: PROMPT_VERSION, planned_calls: calls.length, inserted, failed }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
