// Cinematic V4: Showcase orchestrator.
// Picks up to 5 winner slugs across distinct niches and runs the full V4
// upstream pipeline (storyboard → assets → pre-gate → finalize), staging each
// for render. Renderer (render-worker / GH Actions) picks up storyboards in
// status='validated' and calls cv4-finalize with the produced MP4 URL.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callFn(name: string, body: unknown): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify(body),
  });
  try { return await r.json(); } catch { return { ok: false, status: r.status }; }
}

const NICHE_FILTERS: Array<{ niche: string; cats: string[] }> = [
  { niche: "Dog Beds",       cats: ["dog beds", "dog bed"] },
  { niche: "Cat Trees",      cats: ["cat trees", "cat tree"] },
  { niche: "Cat Litter",     cats: ["cat litter", "litter box"] },
  { niche: "Pet Guardrails", cats: ["pet guardrails", "pet playpen", "dog playpen"] },
  { niche: "Cat Enclosure",  cats: ["cat enclosure", "catio", "outdoor cat"] },
];

async function pickShowcaseSlugs(sb: any): Promise<string[]> {
  const slugs: string[] = [];
  for (const f of NICHE_FILTERS) {
    let chosen: string | null = null;
    for (const c of f.cats) {
      const { data } = await sb.from("products")
        .select("slug, category")
        .ilike("category", `%${c}%`)
        .eq("is_active", true)
        .limit(1);
      if (data && data.length > 0 && data[0]?.slug) { chosen = data[0].slug; break; }
    }
    if (chosen) slugs.push(chosen);
  }
  return slugs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const slugs: string[] = Array.isArray(body?.slugs) && body.slugs.length > 0
      ? body.slugs.slice(0, 5)
      : await pickShowcaseSlugs(sb);

    // Run all slugs in parallel; skip AI image gen for showcase speed.
    const results = await Promise.all(slugs.map(async (slug) => {
      const r: any = { slug };
      const sbr = await callFn("cv4-storyboard", { product_slug: slug });
      r.storyboard = sbr;
      if (!sbr?.ok || !sbr?.storyboard_id) return r;
      r.assets   = await callFn("cv4-assets",            { storyboard_id: sbr.storyboard_id, skip_ai: true });
      r.gate     = await callFn("cv4-quality-gate-pre",  { storyboard_id: sbr.storyboard_id });
      r.finalize = await callFn("cv4-finalize",          { storyboard_id: sbr.storyboard_id });
      return r;
    }));

    return new Response(JSON.stringify({ ok: true, traceId: trace_id, count: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cv4-generate-showcase]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});