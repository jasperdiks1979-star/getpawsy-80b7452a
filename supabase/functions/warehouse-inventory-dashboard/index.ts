// Multi-warehouse inventory dashboard (Item 14). Admin-only.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, traceId, message: "missing bearer" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE);
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (!isAdmin) return json({ ok: false, traceId, message: "forbidden" }, 403);

  const { data: products } = await sb
    .from("products")
    .select("id, us_stock, eu_stock, cn_stock")
    .eq("is_active", true)
    .limit(5000);

  let us_only = 0, cn_fallback = 0, eu_fallback = 0, sold_out = 0;
  for (const p of products ?? []) {
    const us = Number(p.us_stock ?? 0);
    const eu = Number(p.eu_stock ?? 0);
    const cn = Number(p.cn_stock ?? 0);
    if (us > 0) us_only++;
    else if (eu > 0) eu_fallback++;
    else if (cn > 0) cn_fallback++;
    else sold_out++;
  }

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: revRows } = await sb
    .from("warehouse_revenue_log")
    .select("event, amount")
    .gte("occurred_at", since);

  let recovered_cn = 0, recovered_eu = 0, missed = 0, us_revenue = 0;
  for (const r of revRows ?? []) {
    const a = Number(r.amount ?? 0);
    if (r.event === "cn_fallback_sale") recovered_cn += a;
    else if (r.event === "eu_fallback_sale") recovered_eu += a;
    else if (r.event === "missed_sold_out") missed += a;
    else if (r.event === "us_only_sale") us_revenue += a;
  }

  return json({
    ok: true, traceId,
    counts: { us_only, cn_fallback, eu_fallback, sold_out, total: products?.length ?? 0 },
    revenue_30d: {
      us_only_sales: Math.round(us_revenue * 100) / 100,
      recovered_via_cn: Math.round(recovered_cn * 100) / 100,
      recovered_via_eu: Math.round(recovered_eu * 100) / 100,
      missed_sold_out: Math.round(missed * 100) / 100,
    },
  });
});
