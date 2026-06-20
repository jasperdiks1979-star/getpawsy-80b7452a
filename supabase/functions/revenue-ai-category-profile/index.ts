import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function top<T>(arr: T[], n: number): T[] {
  return Array.from(new Set(arr)).slice(0, n);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: perf } = await supabase
      .from("revenue_ai_pin_performance")
      .select("category, hook_archetype, cta_archetype, video_duration_bucket, voice_id, camera_archetype, revenue_per_click, tier")
      .gte("day", since)
      .in("tier", ["top_1", "top_5", "top_10"])
      .limit(20000);

    const byCat = new Map<string, any[]>();
    for (const p of (perf ?? []) as any[]) {
      if (!p.category) continue;
      const arr = byCat.get(p.category) ?? [];
      arr.push(p);
      byCat.set(p.category, arr);
    }

    const rows: any[] = [];
    for (const [category, items] of byCat) {
      const rpc = items.reduce((s, x) => s + Number(x.revenue_per_click || 0), 0) / items.length;
      const sortedByRpc = [...items].sort((a, b) => Number(b.revenue_per_click || 0) - Number(a.revenue_per_click || 0));
      rows.push({
        category,
        winning_hook_archetypes: top(sortedByRpc.map(x => x.hook_archetype).filter(Boolean), 5),
        winning_cta: top(sortedByRpc.map(x => x.cta_archetype).filter(Boolean), 5),
        winning_duration_bucket: top(sortedByRpc.map(x => x.video_duration_bucket).filter(Boolean), 1)[0] ?? null,
        winning_voice_ids: top(sortedByRpc.map(x => x.voice_id).filter(Boolean), 5),
        winning_camera: top(sortedByRpc.map(x => x.camera_archetype).filter(Boolean), 1)[0] ?? null,
        avg_revenue_per_click: rpc,
        sample_size: items.length,
        last_refreshed: new Date().toISOString(),
      });
    }
    if (rows.length) await supabase.from("revenue_ai_category_profiles").upsert(rows, { onConflict: "category" });
    return new Response(JSON.stringify({ ok: true, categories: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});