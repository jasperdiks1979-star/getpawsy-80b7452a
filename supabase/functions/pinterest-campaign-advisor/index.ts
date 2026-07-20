import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: pins } = await supabase
      .from("pinterest_pin_performance")
      .select("pin_id, product_id, impressions, outbound_clicks, saves")
      .gte("created_at", since);

    // Aggregate per product
    const byProduct = new Map<string, { imp: number; clk: number; saves: number; pins: number }>();
    for (const p of (pins ?? [])) {
      const k = (p as any).product_id || "_";
      const cur = byProduct.get(k) || { imp: 0, clk: 0, saves: 0, pins: 0 };
      cur.imp += Number((p as any).impressions || 0);
      cur.clk += Number((p as any).outbound_clicks || 0);
      cur.saves += Number((p as any).saves || 0);
      cur.pins += 1;
      byProduct.set(k, cur);
    }

    // Revenue attribution V3
    const { data: rev } = await supabase
      .from("pinterest_revenue_attribution_v3")
      .select("product_id, attributed_revenue")
      .gte("created_at", since);
    const revByProduct = new Map<string, number>();
    for (const r of (rev ?? [])) {
      const k = (r as any).product_id;
      revByProduct.set(k, (revByProduct.get(k) || 0) + Number((r as any).attributed_revenue || 0));
    }

    const recos: any[] = [];
    for (const [pid, m] of byProduct) {
      if (pid === "_") continue;
      const ctr = m.imp > 0 ? m.clk / m.imp : 0;
      const revenue = revByProduct.get(pid) || 0;
      const metrics = { impressions: m.imp, clicks: m.clk, saves: m.saves, ctr, revenue, pins: m.pins };

      if (revenue > 100 && ctr > 0.015) {
        recos.push({ scope: "product", scope_id: pid, recommendation: "Duplicate winner — scale creative",
          rationale: `$${revenue.toFixed(0)} revenue + CTR ${(ctr * 100).toFixed(2)}%`, metrics, priority: "high" });
      } else if (m.imp > 5000 && ctr < 0.005 && revenue === 0) {
        recos.push({ scope: "product", scope_id: pid, recommendation: "Pause / replace creative",
          rationale: `${m.imp} imp, CTR ${(ctr * 100).toFixed(2)}%, no revenue`, metrics, priority: "high" });
      } else if (revenue > 50 && m.pins < 3) {
        recos.push({ scope: "product", scope_id: pid, recommendation: "Expand creative variants",
          rationale: `Earning ${revenue.toFixed(0)} with only ${m.pins} pin(s)`, metrics, priority: "medium" });
      }
    }

    if (recos.length) {
      await supabase.from("pinterest_campaign_recommendations").insert(recos);
    }

    return new Response(JSON.stringify({ ok: true, generated: recos.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});