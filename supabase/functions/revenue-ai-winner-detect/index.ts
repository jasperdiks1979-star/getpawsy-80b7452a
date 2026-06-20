import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DIMENSIONS: Array<{ field: string; name: string }> = [
  { field: "voice_id", name: "voice" },
  { field: "hook_archetype", name: "hook" },
  { field: "cta_archetype", name: "cta" },
  { field: "category", name: "category" },
  { field: "video_duration_bucket", name: "duration" },
  { field: "opening_scene_archetype", name: "opening" },
  { field: "camera_archetype", name: "camera" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const { data: perf } = await supabase
      .from("revenue_ai_pin_performance")
      .select("pin_id, voice_id, hook_archetype, cta_archetype, category, video_duration_bucket, opening_scene_archetype, camera_archetype, revenue_per_click, purchase_rate, tier, impressions, outbound_clicks, purchases")
      .gte("day", since)
      .limit(50000);

    const rows = (perf ?? []) as any[];
    const winners = rows.filter(r => r.tier === "top_1" || r.tier === "top_5" || r.tier === "top_10");

    const dnaUpserts: any[] = [];
    for (const dim of DIMENSIONS) {
      const groups = new Map<string, { n: number; rpc: number; pr: number }>();
      for (const w of winners) {
        const k = w[dim.field];
        if (!k) continue;
        const cur = groups.get(k) ?? { n: 0, rpc: 0, pr: 0 };
        cur.n += 1;
        cur.rpc += Number(w.revenue_per_click || 0);
        cur.pr += Number(w.purchase_rate || 0);
        groups.set(k, cur);
      }
      for (const [key, g] of groups) {
        const avgRpc = g.n ? g.rpc / g.n : 0;
        const avgPr = g.n ? g.pr / g.n : 0;
        const score = avgRpc * 0.6 + avgPr * 0.4 * 1000;
        dnaUpserts.push({
          dimension: dim.name,
          key,
          n_pins: g.n,
          avg_revenue_per_click: avgRpc,
          avg_purchase_rate: avgPr,
          score,
          ewma: score, // first pass = score; subsequent EWMA computed below
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Read existing for EWMA blending
    if (dnaUpserts.length) {
      const { data: existing } = await supabase
        .from("revenue_ai_winner_dna")
        .select("dimension, key, ewma");
      const map = new Map<string, number>();
      for (const e of (existing ?? []) as any[]) map.set(`${e.dimension}|${e.key}`, Number(e.ewma || 0));
      const ALPHA = 0.3;
      for (const u of dnaUpserts) {
        const prev = map.get(`${u.dimension}|${u.key}`) ?? u.score;
        u.ewma = prev * (1 - ALPHA) + u.score * ALPHA;
      }
      await supabase.from("revenue_ai_winner_dna").upsert(dnaUpserts, { onConflict: "dimension,key" });
    }

    // Loser detection
    const { data: settingsRow } = await supabase.from("revenue_ai_settings").select("*").maybeSingle();
    const minImp = settingsRow?.loser_min_impressions ?? 2000;
    const ratio = Number(settingsRow?.loser_ctr_floor_ratio ?? 0.6);
    const block_days = settingsRow?.loser_block_days ?? 14;

    const accountCtr = rows.length
      ? rows.reduce((s, r) => s + (r.impressions ? r.outbound_clicks / r.impressions : 0), 0) / rows.length
      : 0;
    const ctrFloor = accountCtr * ratio;
    const losers = rows.filter(r => r.impressions >= minImp && (r.purchases ?? 0) === 0 && (r.outbound_clicks / Math.max(1, r.impressions)) < ctrFloor);

    const blockUntil = new Date(Date.now() + block_days * 86400000).toISOString();
    const blocks: any[] = losers.slice(0, 500).map(l => ({
      scope: "pin",
      key: l.pin_id,
      reason: `low_ctr_no_purchase imp=${l.impressions}`,
      evidence_pins: [l.pin_id],
      blocked_until: blockUntil,
      severity: "medium",
    }));
    if (blocks.length) await supabase.from("revenue_ai_loser_blocklist").upsert(blocks, { onConflict: "scope,key" });

    return new Response(JSON.stringify({ ok: true, dna: dnaUpserts.length, losers: blocks.length, accountCtr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("winner-detect", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
