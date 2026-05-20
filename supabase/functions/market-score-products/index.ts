import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  cost_price: number | null;
  is_active: boolean | null;
};

function priorityFor(score: number): string {
  if (score >= 85) return "explosive";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * market-score-products
 * Composite US-market scoring engine. Combines internal performance, growth
 * product scores, channel signals, and category demand into a 0-100 market_score
 * plus priority bucket (low|medium|high|explosive).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const today = new Date().toISOString().slice(0, 10);
    const since14 = new Date(Date.now() - 14 * 86400_000).toISOString();

    const { data: products, error: pErr } = await sb
      .from("products")
      .select("id,name,category,price,cost_price,is_active")
      .eq("is_active", true)
      .eq("is_duplicate", false)
      .limit(1000);
    if (pErr) throw pErr;

    // Pull supporting signals
    const [{ data: growthScores }, { data: channelSignals }] = await Promise.all([
      sb.from("growth_product_scores").select("product_id,opportunity_score,confidence_score").eq("day", today),
      sb.from("growth_channel_signals").select("product_id,score,channel,revenue,clicks,impressions").gte("day", since14.slice(0, 10)),
    ]);

    const growthMap = new Map<string, { score: number; conf: number }>();
    for (const g of growthScores ?? []) {
      growthMap.set(g.product_id as string, {
        score: Number(g.opportunity_score ?? 0),
        conf: Number(g.confidence_score ?? 0),
      });
    }

    const channelAgg = new Map<string, { rev: number; clicks: number; impr: number; pin: number; tt: number }>();
    for (const c of channelSignals ?? []) {
      const id = c.product_id as string;
      if (!id) continue;
      const cur = channelAgg.get(id) ?? { rev: 0, clicks: 0, impr: 0, pin: 0, tt: 0 };
      cur.rev += Number(c.revenue ?? 0);
      cur.clicks += Number(c.clicks ?? 0);
      cur.impr += Number(c.impressions ?? 0);
      if (c.channel === "pinterest") cur.pin = Math.max(cur.pin, Number(c.score ?? 0));
      if (c.channel === "tiktok") cur.tt = Math.max(cur.tt, Number(c.score ?? 0));
      channelAgg.set(id, cur);
    }

    const upserts: Array<Record<string, unknown>> = [];
    let scored = 0;

    for (const p of (products ?? []) as Product[]) {
      const g = growthMap.get(p.id) ?? { score: 0, conf: 0 };
      const ch = channelAgg.get(p.id) ?? { rev: 0, clicks: 0, impr: 0, pin: 0, tt: 0 };
      const ctr = ch.impr > 0 ? ch.clicks / ch.impr : 0;

      const trend_velocity = Math.min(25, Math.round(ctr * 500 + ch.clicks * 0.5));
      const competition_quality = 15; // placeholder until 8b competitor ingest
      const pinterest_potential = Math.min(15, Math.round(ch.pin * 0.15));
      const tiktok_potential = Math.min(15, Math.round(ch.tt * 0.15));
      const search_demand = Math.min(10, Math.round((g.score ?? 0) * 0.1));
      const margin_score = (() => {
        if (!p.price || !p.cost_price || p.cost_price <= 0) return 5;
        const m = (p.price - p.cost_price) / p.price;
        if (m >= 0.5) return 10;
        if (m >= 0.3) return 7;
        return 3;
      })();
      const revenue_bonus = Math.min(10, Math.round(ch.rev / 50));

      const market_score = Math.max(0, Math.min(100,
        trend_velocity + competition_quality + pinterest_potential + tiktok_potential +
        search_demand + margin_score + revenue_bonus
      ));
      const priority = priorityFor(market_score);

      upserts.push({
        product_id: p.id,
        day: today,
        market_score,
        priority,
        trend_velocity,
        competition_quality,
        pinterest_potential,
        tiktok_potential,
        search_demand,
        margin_score,
        factors: { trend_velocity, competition_quality, pinterest_potential, tiktok_potential, search_demand, margin_score, revenue_bonus, ctr, growth: g.score },
      });
      scored++;
    }

    for (let i = 0; i < upserts.length; i += 500) {
      const chunk = upserts.slice(i, i + 500);
      const { error: uErr } = await sb.from("market_product_scores").upsert(chunk, { onConflict: "product_id,day" });
      if (uErr) throw uErr;
    }

    await sb.from("market_signal_logs").insert({
      trace_id: traceId, level: "info",
      message: `Scored ${scored} products`, payload: { day: today, scored },
    });

    return new Response(
      JSON.stringify({ ok: true, traceId, scored, message: `Scored ${scored} products` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});