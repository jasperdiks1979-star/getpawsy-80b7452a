// Phase 8d: autonomous product prioritization. Fuses today's
// market_product_scores with open opportunity gaps and rising trend clusters
// into a ranked daily priority list with recommended channels.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SB_URL, SB_SVC);
  const today = new Date().toISOString().slice(0, 10);

  const { data: scores } = await sb
    .from("market_product_scores")
    .select("product_id, market_score, priority, factors, trend_velocity, pinterest_potential, tiktok_potential, search_demand, margin_score")
    .eq("day", today)
    .order("market_score", { ascending: false })
    .limit(100);

  const productIds = (scores ?? []).map((s: any) => s.product_id);

  const { data: gaps } = await sb
    .from("market_opportunity_gaps")
    .select("matched_product_id, opportunity_score, gap_type")
    .in("matched_product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "open");

  const gapBoost = new Map<string, { score: number; types: Set<string> }>();
  for (const g of gaps ?? []) {
    const id = (g as any).matched_product_id;
    if (!id) continue;
    const b = gapBoost.get(id) ?? { score: 0, types: new Set<string>() };
    b.score += Number((g as any).opportunity_score) || 0;
    b.types.add((g as any).gap_type);
    gapBoost.set(id, b);
  }

  const upserts = (scores ?? []).map((s: any, idx: number) => {
    const gb = gapBoost.get(s.product_id);
    const composite =
      Number(s.market_score) +
      Math.min(20, (gb?.score ?? 0) / 5);
    const channels: string[] = [];
    if (Number(s.pinterest_potential) >= 0.5) channels.push("pinterest");
    if (Number(s.tiktok_potential) >= 0.5) channels.push("tiktok");
    if (Number(s.search_demand) >= 0.5) channels.push("seo");
    if (Number(s.margin_score) >= 0.5 && Number(s.trend_velocity) >= 0.4) channels.push("ads");
    if (!channels.length) channels.push("seo");

    const rationaleBits: string[] = [];
    if (s.priority === "explosive") rationaleBits.push("Explosive market signal");
    else if (s.priority === "high") rationaleBits.push("High market signal");
    if (Number(s.trend_velocity) >= 0.5) rationaleBits.push("rising trend velocity");
    if (gb && gb.score > 0) rationaleBits.push(`${gb.types.size} open gaps (${[...gb.types].join(", ")})`);
    if (Number(s.margin_score) >= 0.6) rationaleBits.push("strong margin");

    return {
      product_id: s.product_id,
      day: today,
      rank: idx + 1,
      composite_score: Math.round(composite * 100) / 100,
      recommended_channels: channels,
      rationale: rationaleBits.join(" · ") || "Top daily market score",
      factors: {
        market_score: s.market_score,
        priority: s.priority,
        gap_boost: gb?.score ?? 0,
        gap_types: gb ? [...gb.types] : [],
        signals: s.factors ?? {},
      },
    };
  });

  if (upserts.length) {
    // Re-rank by composite_score
    upserts.sort((a, b) => b.composite_score - a.composite_score);
    upserts.forEach((u, i) => { u.rank = i + 1; });
    const { error } = await sb
      .from("market_product_priority")
      .upsert(upserts, { onConflict: "product_id,day" });
    if (error) console.error("upsert err", error);
  }

  await sb.from("market_signal_logs").insert({
    source_id: null,
    status: "ok",
    message: `priority-sync: ${upserts.length} products ranked for ${today}`,
  });

  return new Response(
    JSON.stringify({ ok: true, traceId: crypto.randomUUID(), ranked: upserts.length, day: today }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});