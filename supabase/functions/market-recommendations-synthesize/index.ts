// Phase 8d: AI Recommendations Synthesizer.
// Fuses today's top priority products, open gaps, and rising trend clusters
// into ranked actionable recommendations stored in market_ai_recommendations.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Rec = {
  target_type: "product" | "channel" | "content" | "catalog";
  target_id?: string | null;
  action: string;
  reasoning: string;
  confidence: number;
  payload: Record<string, unknown>;
};

async function aiSummarize(items: any[]): Promise<string> {
  if (!LOVABLE_API_KEY || !items.length) return "";
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": LOVABLE_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{
          role: "user",
          content:
            `You are the GetPawsy growth strategist. Summarize today's top market opportunities ` +
            `in <= 4 short bullets (no banned terms: guaranteed/miracle/vet-approved/eco-friendly). ` +
            `Data:\n${JSON.stringify(items).slice(0, 4000)}`,
        }],
      }),
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? "";
  } catch (e) { console.error("ai summary", e); return ""; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SB_URL, SB_SVC);
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: priorities }, { data: gaps }, { data: clusters }] = await Promise.all([
    sb.from("market_product_priority")
      .select("product_id, rank, composite_score, recommended_channels, rationale, factors")
      .eq("day", today)
      .order("rank", { ascending: true })
      .limit(15),
    sb.from("market_opportunity_gaps")
      .select("id, gap_type, target, opportunity_score, evidence")
      .eq("status", "open")
      .order("opportunity_score", { ascending: false })
      .limit(15),
    sb.from("market_trend_clusters")
      .select("id, source, label, keywords, signal_score, velocity, status")
      .in("status", ["rising", "emerging"])
      .order("signal_score", { ascending: false })
      .limit(10),
  ]);

  const productIds = (priorities ?? []).map((p: any) => p.product_id);
  const { data: products } = productIds.length
    ? await sb.from("products").select("id, name, slug").in("id", productIds)
    : { data: [] as any[] };
  const nameMap = new Map((products ?? []).map((p: any) => [p.id, p]));

  const recs: Rec[] = [];

  for (const p of (priorities ?? []).slice(0, 8)) {
    const prod = nameMap.get((p as any).product_id);
    if (!prod) continue;
    recs.push({
      target_type: "product",
      target_id: (p as any).product_id,
      action: `Promote "${prod.name}" on ${(p as any).recommended_channels.join(" + ") || "seo"}`,
      reasoning: (p as any).rationale,
      confidence: Math.min(1, (p as any).composite_score / 100),
      payload: { slug: prod.slug, rank: (p as any).rank, channels: (p as any).recommended_channels },
    });
  }

  for (const g of (gaps ?? []).slice(0, 5)) {
    recs.push({
      target_type: "catalog",
      target_id: (g as any).id,
      action:
        (g as any).gap_type === "catalog_expansion"
          ? `Source new SKU: "${(g as any).target}"`
          : `Reposition "${(g as any).target}" (${(g as any).gap_type})`,
      reasoning: `Opportunity score ${(g as any).opportunity_score}`,
      confidence: Math.min(1, (g as any).opportunity_score / 100),
      payload: (g as any).evidence ?? {},
    });
  }

  for (const c of (clusters ?? []).slice(0, 5)) {
    recs.push({
      target_type: "content",
      target_id: (c as any).id,
      action: `Create ${(c as any).source} content for "${(c as any).label}"`,
      reasoning: `Cluster ${(c as any).status} · v=${(c as any).velocity}`,
      confidence: Math.min(1, Number((c as any).signal_score) / 50),
      payload: { keywords: (c as any).keywords, source: (c as any).source },
    });
  }

  const summary = await aiSummarize(recs.slice(0, 10));
  if (summary) {
    recs.unshift({
      target_type: "channel",
      target_id: null,
      action: "Daily growth digest",
      reasoning: summary,
      confidence: 0.9,
      payload: { generated_at: new Date().toISOString() },
    });
  }

  // Archive yesterday's pending recs before inserting
  await sb.from("market_ai_recommendations")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 18 * 3600_000).toISOString());

  if (recs.length) {
    const { error } = await sb.from("market_ai_recommendations").insert(
      recs.map((r) => ({ ...r, status: "pending" }))
    );
    if (error) console.error("insert recs", error);
  }

  await sb.from("market_signal_logs").insert({
    source_id: null,
    status: "ok",
    message: `recommendations-synthesize: ${recs.length} recs for ${today}`,
  });

  return new Response(
    JSON.stringify({ ok: true, traceId: crypto.randomUUID(), recommendations: recs.length, summary: !!summary }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});