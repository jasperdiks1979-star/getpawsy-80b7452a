// Daily cron: estimate missed revenue from fully sold-out PDPs (Item 14).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: products } = await sb
    .from("products")
    .select("id, price, us_stock, eu_stock, cn_stock")
    .eq("is_active", true)
    .limit(5000);

  const fullySoldOut = (products ?? []).filter((p) =>
    Number(p.us_stock ?? 0) === 0 &&
    Number(p.eu_stock ?? 0) === 0 &&
    Number(p.cn_stock ?? 0) === 0
  );

  let inserted = 0;
  for (const p of fullySoldOut) {
    const price = Number(p.price ?? 0);
    if (price <= 0) continue;
    const est = Math.round(price * 0.015 * 100) / 100;
    const { error } = await sb.from("warehouse_revenue_log").insert({
      product_id: p.id,
      event: "missed_sold_out",
      amount: est,
      warehouse_source: "NONE",
      meta: { model: "1.5pct_cr_baseline" },
    });
    if (!error) inserted++;
  }

  return new Response(
    JSON.stringify({ ok: true, traceId, scanned: fullySoldOut.length, inserted }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
