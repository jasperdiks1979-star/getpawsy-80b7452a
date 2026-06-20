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
    const day7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const day14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

    const { data: recent } = await supabase
      .from("revenue_ai_pin_performance")
      .select("category, revenue_cents, day")
      .gte("day", day14);

    const sums = { last7: new Map<string, number>(), prev7: new Map<string, number>() };
    for (const r of (recent ?? []) as any[]) {
      if (!r.category) continue;
      const bucket = r.day >= day7 ? sums.last7 : sums.prev7;
      bucket.set(r.category, (bucket.get(r.category) ?? 0) + Number(r.revenue_cents || 0));
    }

    const rows: any[] = [];
    const cats = new Set<string>([...sums.last7.keys(), ...sums.prev7.keys()]);
    for (const c of cats) {
      const last = sums.last7.get(c) ?? 0;
      const prev = sums.prev7.get(c) ?? 0;
      const change = prev > 0 ? (last - prev) / prev : (last > 0 ? 1 : 0);
      const direction = change > 0.15 ? "rising" : change < -0.15 ? "falling" : "stable";
      const mult = direction === "rising" ? 1.5 : direction === "falling" ? 0.5 : 1.0;
      rows.push({
        day: today,
        category: c,
        trend_score: Math.round(change * 1000) / 1000,
        pct_change_7d: Math.round(change * 1000) / 1000,
        direction,
        recommended_quota_multiplier: mult,
      });
    }
    if (rows.length) await supabase.from("revenue_ai_trend_signals").upsert(rows, { onConflict: "day,category" });
    return new Response(JSON.stringify({ ok: true, categories: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});