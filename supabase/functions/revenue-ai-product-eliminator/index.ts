import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Honor the Global Product Recovery Engine: never auto-eliminate a
    // protected winner — let recovery-engine-tick handle it.
    const { data: protectedRows } = await supabase
      .from("winner_products")
      .select("product_id")
      .eq("is_protected", true);
    const protectedSet = new Set((protectedRows ?? []).map((r: any) => r.product_id));

    const { data: products } = await supabase
      .from("products")
      .select("id, effective_stock, media_score:content_readiness_score")
      .limit(5000);

    const updates: any[] = [];
    const blocks: any[] = [];
    const blockUntil = new Date(Date.now() + 30 * 86400000).toISOString();
    for (const p of (products ?? []) as any[]) {
      if (protectedSet.has(p.id)) continue;
      let bad = false; const reasons: string[] = [];
      if ((p.effective_stock ?? 0) <= 0) { bad = true; reasons.push("oos"); }
      if (Number(p.media_score ?? 100) < 40) { bad = true; reasons.push("low_media"); }
      if (p.review_count && Number(p.review_count) >= 5 && Number(p.avg_rating ?? 5) < 3.5) {
        bad = true; reasons.push("bad_reviews");
      }
      if (bad) {
        updates.push({
          product_id: p.id,
          stock_score: 0, ctr_score: 0, sales_score: 0,
          media_score: Number(p.media_score ?? 0),
          pinterest_score: 0, composite: 0,
          tier: "tail", publish_multiplier: 0,
          reason: reasons.join(","),
          updated_at: new Date().toISOString(),
        });
        blocks.push({
          scope: "product",
          key: p.id,
          reason: reasons.join(","),
          evidence_pins: [],
          blocked_until: blockUntil,
          severity: "high",
        });
      }
    }
    if (updates.length) {
      for (let i = 0; i < updates.length; i += 500) {
        await supabase.from("revenue_ai_revenue_scores").upsert(updates.slice(i, i + 500), { onConflict: "product_id" });
      }
      await supabase.from("revenue_ai_loser_blocklist").upsert(blocks, { onConflict: "scope,key" });
    }
    return new Response(JSON.stringify({ ok: true, eliminated: updates.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});