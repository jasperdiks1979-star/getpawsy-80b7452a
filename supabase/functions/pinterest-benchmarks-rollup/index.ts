import "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const windows = [14, 30];
    const out: Array<{ category_key: string; window_days: number; avg_ctr: number; avg_save_rate: number; avg_engagement: number; sample_size: number; computed_at: string }> = [];
    for (const w of windows) {
      const since = new Date(Date.now() - w * 86400000).toISOString().slice(0, 10);
      // join analytics × dimensions
      const { data } = await sb
        .from("pinterest_analytics_daily")
        .select("pin_id, impressions, outbound_clicks, saves, ctr, engagement_rate, day")
        .gte("day", since)
        .limit(20000);
      const { data: dims } = await sb.from("pinterest_pin_dimensions").select("pin_id,category_key");
      const cat = new Map<string, string>();
      for (const d of (dims ?? []) as { pin_id: string; category_key: string | null }[]) {
        if (d.category_key) cat.set(d.pin_id, d.category_key);
      }
      const agg = new Map<string, { ctr: number; save: number; eng: number; n: number }>();
      for (const r of (data ?? []) as { pin_id: string; impressions: number; saves: number; ctr: number; engagement_rate: number }[]) {
        const c = cat.get(r.pin_id);
        if (!c) continue;
        if (r.impressions < 100) continue;
        const a = agg.get(c) ?? { ctr: 0, save: 0, eng: 0, n: 0 };
        a.ctr += Number(r.ctr ?? 0);
        a.save += r.impressions > 0 ? Number(r.saves) / r.impressions : 0;
        a.eng += Number(r.engagement_rate ?? 0);
        a.n += 1;
        agg.set(c, a);
      }
      for (const [k, a] of agg) {
        if (a.n < 3) continue;
        out.push({
          category_key: k,
          window_days: w,
          avg_ctr: a.ctr / a.n,
          avg_save_rate: a.save / a.n,
          avg_engagement: a.eng / a.n,
          sample_size: a.n,
          computed_at: new Date().toISOString(),
        });
      }
    }
    if (out.length) await sb.from("pinterest_category_benchmarks").upsert(out, { onConflict: "category_key,window_days" });
    return new Response(JSON.stringify({ ok: true, traceId, rows: out.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});