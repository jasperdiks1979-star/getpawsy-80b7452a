import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { nextAllocationWeight, scoreVoice } from "../_shared/revenue-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: perf } = await supabase
      .from("revenue_ai_pin_performance")
      .select("voice_id, outbound_clicks, purchases, revenue_cents, impressions")
      .gte("day", since)
      .not("voice_id", "is", null)
      .limit(50000);

    const byVoice = new Map<string, { n: number; clicks: number; purchases: number; rev: number }>();
    for (const p of (perf ?? []) as any[]) {
      const cur = byVoice.get(p.voice_id) ?? { n: 0, clicks: 0, purchases: 0, rev: 0 };
      cur.n += 1;
      cur.clicks += Number(p.outbound_clicks || 0);
      cur.purchases += Number(p.purchases || 0);
      cur.rev += Number(p.revenue_cents || 0);
      byVoice.set(p.voice_id, cur);
    }

    const { data: settingsRow } = await supabase.from("revenue_ai_settings").select("voice_min_pins").maybeSingle();
    const minPins = settingsRow?.voice_min_pins ?? 10;

    const ranked = [...byVoice.entries()]
      .map(([voice_id, v]) => ({
        voice_id,
        n_pins: v.n,
        outbound_clicks: v.clicks,
        purchases: v.purchases,
        revenue_cents: v.rev,
        revenue_per_click: v.clicks ? v.rev / v.clicks : 0,
        conversion_rate: v.clicks ? v.purchases / v.clicks : 0,
      }))
      .filter(v => v.n_pins >= minPins)
      .sort((a, b) => scoreVoice(b) - scoreVoice(a));

    const total = ranked.length;
    const rows = ranked.map((v, i) => ({
      ...v,
      ranking: i + 1,
      allocation_weight: nextAllocationWeight(i, total),
      updated_at: new Date().toISOString(),
    }));

    if (rows.length) await supabase.from("revenue_ai_voice_rankings").upsert(rows, { onConflict: "voice_id" });
    return new Response(JSON.stringify({ ok: true, ranked: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});