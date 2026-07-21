import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { composeRevenueScore, tierFromComposite } from "../_shared/revenue-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const { data: products } = await supabase
      .from("products")
      .select("id, slug, effective_stock, media_score:content_readiness_score")
      .gt("effective_stock", 0)
      .limit(3000);

    const { data: perf } = await supabase
      .from("revenue_ai_pin_performance")
      .select("product_id, revenue_cents, outbound_clicks, purchases")
      .gte("day", since);
    const byProd = new Map<string, { rev: number; clicks: number; pur: number }>();
    for (const p of (perf ?? []) as any[]) {
      if (!p.product_id) continue;
      const c = byProd.get(p.product_id) ?? { rev: 0, clicks: 0, pur: 0 };
      c.rev += Number(p.revenue_cents || 0);
      c.clicks += Number(p.outbound_clicks || 0);
      c.pur += Number(p.purchases || 0);
      byProd.set(p.product_id, c);
    }

    const stockArr = (products ?? []).map((p: any) => Number(p.effective_stock || 0));
    const stockMax = Math.max(1, ...stockArr);
    const revMax = Math.max(1, ...[...byProd.values()].map(v => v.rev));

    const rows: any[] = [];
    for (const p of (products ?? []) as any[]) {
      const meta = byProd.get(p.id) ?? { rev: 0, clicks: 0, pur: 0 };
      const stock = Math.min(100, (Number(p.effective_stock || 0) / stockMax) * 100);
      const ctr = Math.min(100, Number(p.ctr_30d || 0) * 1000);
      const sales = Math.min(100, Number(p.total_sold_30d || 0) * 5);
      const media = Math.min(100, Number(p.media_score || 0));
      const pinterest = Math.min(100, (meta.rev / revMax) * 100);
      const composite = composeRevenueScore({ stock, ctr, sales, media, pinterest });
      const tier = tierFromComposite(composite);
      const mult = tier === "hero" ? 3.0 : tier === "winner" ? 2.0 : tier === "contender" ? 1.0 : 0.5;
      rows.push({
        product_id: p.id,
        stock_score: stock,
        ctr_score: ctr,
        sales_score: sales,
        media_score: media,
        pinterest_score: pinterest,
        composite,
        tier,
        publish_multiplier: mult,
        reason: `stock=${stock.toFixed(0)} ctr=${ctr.toFixed(0)} sales=${sales.toFixed(0)} media=${media.toFixed(0)} pin=${pinterest.toFixed(0)}`,
        updated_at: new Date().toISOString(),
      });
    }
    if (rows.length) {
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from("revenue_ai_revenue_scores").upsert(rows.slice(i, i + 500), { onConflict: "product_id" });
      }
    }
    return new Response(JSON.stringify({ ok: true, scored: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});