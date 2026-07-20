import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const BANNED = /\b(vet[- ]approved|eco[- ]friendly|guaranteed|cure|miracle|100%|best ever)\b/gi;
const scrub = (s: string) => (s ?? "").replace(BANNED, "").replace(/\s+/g, " ").trim();

interface Gap {
  id: string;
  gap_type: string;
  target: string;
  competitor: string | null;
  evidence: Record<string, unknown>;
  opportunity_score: number;
  matched_product_id: string | null;
}

async function genWithAI(gap: Gap, products: { id: string; title: string; slug: string }[]) {
  if (!LOVABLE_API_KEY) return null;
  const productList = products.slice(0, 8).map((p) => `- ${p.title} (/${p.slug})`).join("\n");
  const prompt = `You are a US pet ecommerce growth strategist for GetPawsy. Generate an action item for this market gap.

Gap type: ${gap.gap_type}
Target keyword/category: ${gap.target}
Competitor: ${gap.competitor ?? "n/a"}
Opportunity score: ${gap.opportunity_score}
Evidence: ${JSON.stringify(gap.evidence).slice(0, 400)}

Catalog candidates:
${productList || "(none yet)"}

Return strict JSON: { "title": short action title (max 70 chars), "rationale": 1-2 sentence why, "suggested_product_slugs": up to 3 slugs from catalog, "target_keywords": 3-6 US buyer keywords, "creatives": array of 3 objects { "channel": "pinterest"|"tiktok"|"seo", "hook": short hook line, "angle": creative angle }. Compliance: no 'vet-approved', no 'eco-friendly', no 'guaranteed', no fake stats, no price claims.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  try {
    return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({} as { gap_id?: string; limit?: number }));
    const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 25);

    let gapsQ = supabase
      .from("market_opportunity_gaps")
      .select("*")
      .eq("status", "open")
      .order("opportunity_score", { ascending: false })
      .limit(limit);
    if (body.gap_id) gapsQ = supabase.from("market_opportunity_gaps").select("*").eq("id", body.gap_id);

    const { data: gaps, error: gapsErr } = await gapsQ;
    if (gapsErr) throw gapsErr;
    if (!gaps || gaps.length === 0) {
      return new Response(JSON.stringify({ ok: true, traceId, message: "No open gaps", created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let created = 0;
    let skipped = 0;
    for (const gap of gaps as Gap[]) {
      const { data: existing } = await supabase
        .from("market_gap_action_items")
        .select("id")
        .eq("gap_id", gap.id)
        .in("status", ["pending", "approved"])
        .maybeSingle();
      if (existing) { skipped++; continue; }

      const tokens = gap.target.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
      const { data: products } = await supabase
        .from("products_public")
        .select("id,title,slug")
        .eq("is_active", true)
        .or(tokens.map((t) => `title.ilike.%${t}%`).join(","))
        .limit(8);

      const ai = await genWithAI(gap, (products ?? []) as { id: string; title: string; slug: string }[]);

      const slugs = Array.isArray(ai?.suggested_product_slugs) ? ai.suggested_product_slugs.slice(0, 3) : [];
      const matched = (products ?? []).filter((p) => slugs.includes(p.slug)).map((p) => ({ id: p.id, slug: p.slug, title: p.title }));
      const fallbackProducts = matched.length ? matched : (products ?? []).slice(0, 3).map((p) => ({ id: p.id, slug: p.slug, title: p.title }));

      const keywords = Array.isArray(ai?.target_keywords) && ai.target_keywords.length
        ? ai.target_keywords.map(scrub).filter(Boolean).slice(0, 6)
        : [gap.target, `best ${gap.target}`, `${gap.target} for cats`, `${gap.target} for dogs`].slice(0, 4);

      const creatives = Array.isArray(ai?.creatives) && ai.creatives.length
        ? ai.creatives.slice(0, 3).map((c: { channel?: string; hook?: string; angle?: string }) => ({
            channel: ["pinterest", "tiktok", "seo"].includes(String(c.channel)) ? c.channel : "pinterest",
            hook: scrub(String(c.hook ?? "")),
            angle: scrub(String(c.angle ?? "")),
          }))
        : [
            { channel: "pinterest", hook: `Why ${gap.target} matters`, angle: "lifestyle close-up" },
            { channel: "tiktok", hook: `Trying ${gap.target}`, angle: "POV demo" },
            { channel: "seo", hook: `${gap.target}: buyer's guide`, angle: "comparison table" },
          ];

      const title = scrub(ai?.title ?? `Capture: ${gap.target}`).slice(0, 70);
      const rationale = scrub(ai?.rationale ?? `${gap.gap_type} on ${gap.competitor ?? "competitor"} — score ${gap.opportunity_score}.`);

      const { error: insErr } = await supabase.from("market_gap_action_items").insert({
        gap_id: gap.id,
        title,
        rationale,
        suggested_products: fallbackProducts,
        target_keywords: keywords,
        recommended_creatives: creatives,
        recommended_channels: Array.from(new Set(creatives.map((c) => c.channel))),
        priority_score: gap.opportunity_score,
        status: "pending",
      });
      if (insErr) { skipped++; continue; }
      created++;
    }

    return new Response(JSON.stringify({ ok: true, traceId, message: `Created ${created} action items (${skipped} skipped)`, created, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});