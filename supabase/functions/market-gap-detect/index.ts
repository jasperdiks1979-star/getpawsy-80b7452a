import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * market-gap-detect
 * Cross-references competitor insights against the internal catalog to detect
 * opportunity gaps GetPawsy can exploit. Heuristics:
 *  - weak_competitor_rating: competitor rating < 4.0 with >50 reviews → we beat them on quality narrative
 *  - high_price_room: competitor price > $80 → margin headroom for us
 *  - keyword_overlap: competitor title shares >=2 tokens with one of our products → match
 *  - missing_local: competitor product whose token set is NOT in our catalog → catalog expansion idea
 */

const STOP = new Set([
  "the","a","for","with","and","of","to","in","on","by","cat","cats","dog","dogs","pet","pets",
  "small","large","medium","new","best","top","pack","set","kit","size","style","color",
]);
function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t));
}
function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: comps }, { data: prods }] = await Promise.all([
      sb.from("market_competitor_insights")
        .select("id,competitor,product_handle,title,price,rating,review_count")
        .order("captured_at", { ascending: false }).limit(500),
      sb.from("products")
        .select("id,name,category,price").eq("is_active", true).eq("is_duplicate", false).limit(1000),
    ]);

    const ourIndex = (prods ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      price: Number(p.price ?? 0),
      tokSet: new Set(tokens(p.name as string)),
    }));

    const gaps: Array<Record<string, unknown>> = [];

    for (const c of comps ?? []) {
      const cTok = new Set(tokens(c.title as string));
      if (cTok.size === 0) continue;

      // Find best matching internal product
      let best: { id: string; score: number; name: string; price: number } | null = null;
      for (const p of ourIndex) {
        const ov = overlap(cTok, p.tokSet);
        if (ov >= 2 && (!best || ov > best.score)) {
          best = { id: p.id, score: ov, name: p.name, price: p.price };
        }
      }

      const rating = Number(c.rating ?? 0);
      const reviews = Number(c.review_count ?? 0);
      const price = Number(c.price ?? 0);

      if (best && rating > 0 && rating < 4.0 && reviews > 50) {
        gaps.push({
          gap_type: "weak_competitor_rating", target: c.title, competitor: c.competitor,
          matched_product_id: best.id,
          opportunity_score: Math.min(100, 60 + Math.round((4 - rating) * 20)),
          evidence: { competitor_rating: rating, reviews, our_product: best.name, overlap: best.score },
          status: "open",
        });
      }
      if (best && price > 0 && best.price > 0 && price > best.price * 1.3) {
        gaps.push({
          gap_type: "price_advantage", target: c.title, competitor: c.competitor,
          matched_product_id: best.id,
          opportunity_score: Math.min(100, 50 + Math.round(((price - best.price) / best.price) * 30)),
          evidence: { competitor_price: price, our_price: best.price, our_product: best.name },
          status: "open",
        });
      }
      if (!best && cTok.size >= 3) {
        gaps.push({
          gap_type: "catalog_expansion", target: c.title, competitor: c.competitor,
          opportunity_score: Math.min(100, 40 + Math.min(40, reviews / 20)),
          evidence: { tokens: Array.from(cTok).slice(0, 8), competitor_price: price, competitor_rating: rating, reviews },
          status: "open",
        });
      }
    }

    // Dedupe by (gap_type|target) — clear today's open rows then insert.
    if (gaps.length > 0) {
      await sb.from("market_opportunity_gaps").delete().eq("status", "open");
      // chunked insert
      for (let i = 0; i < gaps.length; i += 500) {
        const chunk = gaps.slice(i, i + 500);
        const { error } = await sb.from("market_opportunity_gaps").insert(chunk);
        if (error) throw error;
      }
    }

    await sb.from("market_signal_logs").insert({
      trace_id: traceId, level: "info",
      message: `Gap detect: ${gaps.length} gaps`,
      payload: { total: gaps.length, by_type: gaps.reduce<Record<string, number>>((acc, g) => { const k = g.gap_type as string; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}) },
    });

    return new Response(
      JSON.stringify({ ok: true, traceId, gaps: gaps.length, message: `Detected ${gaps.length} opportunity gaps` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});