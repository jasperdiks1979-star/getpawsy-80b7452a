import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const today = new Date().toISOString().slice(0, 10);
    const day1 = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
    const day7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const { data: perf24 } = await supabase
      .from("revenue_ai_pin_performance")
      .select("product_id, category, outbound_clicks, atc, checkouts, purchases, revenue_cents")
      .gte("day", day1);
    const { data: perf7 } = await supabase
      .from("revenue_ai_pin_performance")
      .select("product_id, category, outbound_clicks, atc, checkouts, purchases, revenue_cents")
      .gte("day", day7);

    const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
    const kpis24 = {
      pins: (perf24 ?? []).length,
      clicks: sum(perf24 ?? [], "outbound_clicks"),
      atc: sum(perf24 ?? [], "atc"),
      checkouts: sum(perf24 ?? [], "checkouts"),
      purchases: sum(perf24 ?? [], "purchases"),
      revenue_cents: sum(perf24 ?? [], "revenue_cents"),
    };

    const byProd = new Map<string, number>();
    for (const r of (perf7 ?? []) as any[]) {
      if (!r.product_id) continue;
      byProd.set(r.product_id, (byProd.get(r.product_id) ?? 0) + Number(r.revenue_cents || 0));
    }
    const sortedProd = [...byProd.entries()].sort((a, b) => b[1] - a[1]);
    const top_products = sortedProd.slice(0, 10).map(([product_id, revenue_cents]) => ({ product_id, revenue_cents }));
    const worst_products = sortedProd.slice(-10).reverse().map(([product_id, revenue_cents]) => ({ product_id, revenue_cents }));

    const { data: trends } = await supabase.from("revenue_ai_trend_signals").select("*").eq("day", today);
    const rising = (trends ?? []).filter((t: any) => t.direction === "rising");
    const falling = (trends ?? []).filter((t: any) => t.direction === "falling");

    const headline_text = `Revenue 24h: $${(kpis24.revenue_cents / 100).toFixed(2)} · ${kpis24.purchases} purchases · ${kpis24.atc} ATC · ${kpis24.clicks} clicks`;
    const md = [
      `# Pinterest Revenue Executive Report — ${today}`,
      ``,
      `## 24h KPIs`,
      `- Revenue: $${(kpis24.revenue_cents / 100).toFixed(2)}`,
      `- Purchases: ${kpis24.purchases}`,
      `- Checkouts: ${kpis24.checkouts}`,
      `- Add to cart: ${kpis24.atc}`,
      `- Outbound clicks: ${kpis24.clicks}`,
      `- Pin-days: ${kpis24.pins}`,
      ``,
      `## Top products (7d)`,
      ...top_products.map(p => `- \`${p.product_id}\` → $${(p.revenue_cents / 100).toFixed(2)}`),
      ``,
      `## Rising categories`,
      ...rising.map((t: any) => `- ${t.category} (+${(t.pct_change_7d * 100).toFixed(0)}%)`),
      ``,
      `## Falling categories`,
      ...falling.map((t: any) => `- ${t.category} (${(t.pct_change_7d * 100).toFixed(0)}%)`),
    ].join("\n");

    await supabase.from("revenue_ai_executive_reports").upsert({
      day: today,
      kpis: kpis24,
      top_products,
      worst_products,
      rising_categories: rising,
      falling_categories: falling,
      promote_more: top_products,
      promote_less: worst_products,
      headline_text,
      full_markdown: md,
    }, { onConflict: "day" });

    return new Response(JSON.stringify({ ok: true, headline_text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});