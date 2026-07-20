import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

    // Revenue (last 7 vs prior 7)
    const { data: orders } = await supabase
      .from("orders")
      .select("total_amount, created_at, status")
      .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .in("status", ["paid", "fulfilled", "completed"]);
    const cutoff = Date.now() - 7 * 86400000;
    const rev7 = (orders ?? []).filter((o: any) => new Date(o.created_at).getTime() >= cutoff)
      .reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    const revPrev7 = (orders ?? []).filter((o: any) => new Date(o.created_at).getTime() < cutoff)
      .reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    const revGrowth = revPrev7 > 0 ? (rev7 - revPrev7) / revPrev7 : (rev7 > 0 ? 1 : 0);
    const revenue_score = clamp(50 + revGrowth * 50);

    // Pinterest health (CTR vs benchmark, queue depth)
    const { data: pinPerf } = await supabase
      .from("pinterest_pin_performance")
      .select("impressions, outbound_clicks, saves")
      .gte("created_at", since7);
    const imp = (pinPerf ?? []).reduce((s: number, r: any) => s + Number(r.impressions || 0), 0);
    const clk = (pinPerf ?? []).reduce((s: number, r: any) => s + Number(r.outbound_clicks || 0), 0);
    const ctr = imp > 0 ? clk / imp : 0;
    const { count: queueDepth } = await supabase
      .from("pinterest_pin_queue").select("*", { count: "exact", head: true }).eq("status", "pending");
    const pinterest_score = clamp((ctr / 0.012) * 60 + Math.min(40, (queueDepth ?? 0) / 5));

    // Conversion (visitor → order, last 7d)
    const { count: sessions7 } = await supabase
      .from("visitor_activity").select("*", { count: "exact", head: true })
      .gte("created_at", since7);
    const orderCount7 = (orders ?? []).filter((o: any) => new Date(o.created_at).getTime() >= cutoff).length;
    const convRate = (sessions7 ?? 0) > 0 ? orderCount7 / (sessions7 ?? 1) : 0;
    const conversion_score = clamp((convRate / 0.02) * 100);

    // SEO (active products with full metadata)
    const { count: totalActive } = await supabase
      .from("products").select("*", { count: "exact", head: true }).eq("is_active", true);
    const { count: seoComplete } = await supabase
      .from("products").select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .not("meta_title", "is", null).not("meta_description", "is", null);
    const seo_score = clamp((totalActive ?? 0) > 0 ? ((seoComplete ?? 0) / (totalActive ?? 1)) * 100 : 0);

    // Inventory (in-stock %)
    const { count: inStock } = await supabase
      .from("products").select("*", { count: "exact", head: true })
      .eq("is_active", true).gt("stock_quantity", 0);
    const inventory_score = clamp((totalActive ?? 0) > 0 ? ((inStock ?? 0) / (totalActive ?? 1)) * 100 : 0);

    const growth_score = clamp(
      revenue_score * 0.35 + pinterest_score * 0.25 + conversion_score * 0.20 +
      seo_score * 0.10 + inventory_score * 0.10
    );

    const components = {
      revenue: { rev7, revPrev7, revGrowth },
      pinterest: { impressions: imp, clicks: clk, ctr, queueDepth },
      conversion: { sessions: sessions7, orders: orderCount7, rate: convRate },
      seo: { active: totalActive, complete: seoComplete },
      inventory: { active: totalActive, in_stock: inStock },
    };

    const highlights: string[] = [];
    if (revGrowth > 0.1) highlights.push(`Revenue up ${(revGrowth * 100).toFixed(0)}% week-over-week`);
    if (ctr > 0.015) highlights.push(`Pinterest CTR strong: ${(ctr * 100).toFixed(2)}%`);
    const alerts: string[] = [];
    if (revGrowth < -0.2) alerts.push(`Revenue down ${(Math.abs(revGrowth) * 100).toFixed(0)}%`);
    if ((queueDepth ?? 0) < 30) alerts.push(`Pinterest queue low: ${queueDepth} pending`);
    if (inventory_score < 60) alerts.push(`Inventory health ${inventory_score.toFixed(0)}/100`);

    await supabase.from("growth_daily_scorecard").upsert({
      day: today,
      growth_score, revenue_score, pinterest_score, conversion_score, seo_score, inventory_score,
      components, highlights, alerts,
    }, { onConflict: "day" });

    return new Response(JSON.stringify({ ok: true, day: today, growth_score, components, highlights, alerts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});