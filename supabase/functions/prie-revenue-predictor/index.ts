import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit ?? 200), 600);
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [productsRes, pdpRes] = await Promise.all([
      sb
        .from("products")
        .select("id, slug, price_cents, cost_price, sale_price_cents, is_active")
        .eq("is_active", true)
        .limit(limit),
      sb
        .from("pinterest_pdp_conversion_stats")
        .select("product_id, views, atc, purchases, gallery_opens, pinterest_clicks, day")
        .gte("day", since),
    ]);

    const products = productsRes.data ?? [];
    const pdpByProduct = new Map<string, any[]>();
    for (const r of pdpRes.data ?? []) {
      const arr = pdpByProduct.get(r.product_id) ?? [];
      arr.push(r);
      pdpByProduct.set(r.product_id, arr);
    }

    const rows: any[] = [];
    for (const p of products) {
      const stats = pdpByProduct.get(p.id) ?? [];
      const views = stats.reduce((s, r) => s + (r.views ?? 0), 0);
      const atc = stats.reduce((s, r) => s + (r.atc ?? 0), 0);
      const purchases = stats.reduce((s, r) => s + (r.purchases ?? 0), 0);
      const closeups = stats.reduce((s, r) => s + (r.gallery_opens ?? 0), 0);
      const clicks = stats.reduce((s, r) => s + (r.pinterest_clicks ?? 0), 0);
      const saves = Math.round(clicks * 0.6);
      const impressions = Math.max(clicks * 20, views * 5);

      const dailyViews = views / 30;
      const convRate = views ? purchases / views : 0;
      const atcRate = views ? atc / views : 0;
      const unitPriceCents = p.sale_price_cents ?? p.price_cents ?? 0;
      const dailyRevenue = dailyViews * convRate * unitPriceCents;

      const horizon = 30;
      const exp = (n: number) => Math.round(n * horizon);
      const expectedRevenueCents = Math.round(dailyRevenue * horizon);
      const confidence = Math.min(1, views / 200);

      rows.push({
        product_id: p.id,
        product_slug: p.slug ?? null,
        horizon_days: horizon,
        expected_impressions: exp(impressions / 30),
        expected_saves: exp(saves / 30),
        expected_closeups: exp(closeups / 30),
        expected_outbound_clicks: exp(clicks / 30),
        expected_atc: exp(atc / 30),
        expected_purchases: exp(purchases / 30),
        expected_revenue_cents: expectedRevenueCents,
        expected_monthly_revenue_cents: expectedRevenueCents,
        expected_annual_revenue_cents: expectedRevenueCents * 12,
        confidence,
        inputs: { views, atc, purchases, clicks, closeups, convRate, atcRate, unitPriceCents },
        computed_at: new Date().toISOString(),
      });
    }

    if (rows.length) {
      const { error } = await sb.from("prie_revenue_predictions").upsert(rows, { onConflict: "product_id,horizon_days" });
      if (error) throw error;
    }

    await sb.from("prie_timeline_events").insert({
      kind: "revenue_predictions",
      severity: "info",
      title: `Revenue predictions refreshed for ${rows.length} products`,
      meta: { count: rows.length },
    });

    return new Response(JSON.stringify({ ok: true, count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});