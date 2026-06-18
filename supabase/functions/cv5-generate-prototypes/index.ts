// Cinematic V5: Generates exactly 3 prototype videos for the requested products.
// Looks each product up by slug match in products_public; calls cv5-generate for each.
// Does not dispatch renders; the operator presses "Force render" in the review UI.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROTOTYPES = [
  { name: "Interactive Cat Toy Ball", slugTokens: ["interactive", "cat", "ball"], titleTokens: ["interactive", "ball"] },
  { name: "Smart Laser Cat Teaser",   slugTokens: ["laser", "cat"],                titleTokens: ["laser", "teaser"] },
  { name: "Memory Foam Pet Bed",      slugTokens: ["memory", "foam", "bed"],       titleTokens: ["memory", "foam"] },
];

async function findProduct(sb: any, slugTokens: string[], titleTokens: string[]) {
  // Try OR of ilike on slug for any token combo.
  const orClause = slugTokens.map((t) => `slug.ilike.%${t}%`).join(",");
  const { data } = await sb.from("products_public").select("id, slug, name").or(orClause).limit(20);
  if (!data || data.length === 0) return null;
  // Prefer rows matching all tokens.
  const scored = data.map((r: any) => {
    const slug = (r.slug || "").toLowerCase();
    const title = (r.name || "").toLowerCase();
    const slugHits = slugTokens.filter((t) => slug.includes(t)).length;
    const titleHits = titleTokens.filter((t) => title.includes(t)).length;
    return { row: r, score: slugHits * 2 + titleHits };
  }).sort((a, b) => b.score - a.score);
  return scored[0].row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const results: any[] = [];
    for (const p of PROTOTYPES) {
      const row = await findProduct(sb, p.slugTokens, p.titleTokens);
      if (!row) { results.push({ name: p.name, ok: false, message: "no_product_match" }); continue; }
      const r = await fetch(`${SUPABASE_URL}/functions/v1/cv5-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ product_id: row.id, product_slug: row.slug, product_title: row.name }),
      });
      const j = await r.json().catch(() => ({}));
      results.push({ name: p.name, product_id: row.id, slug: row.slug, ok: j.ok, storyboard_id: j.storyboard_id, score: j.score, reasons: j.reasons });
    }
    return new Response(JSON.stringify({ ok: true, traceId: trace_id, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[cv5-generate-prototypes]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});