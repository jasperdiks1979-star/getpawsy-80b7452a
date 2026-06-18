// Cinematic V5: per-video analytics sync.
// Pulls latest Pinterest metrics for every V5 pin we shipped and upserts a
// single rolled-up row per (storyboard, pin) into cv5_video_analytics.
// At the end, if ≥50 V5 videos have analytics, triggers pattern extraction.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PATTERN_THRESHOLD = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Map V5 storyboards -> pin_ids via pinterest_video_queue.
    const { data: queueRows, error: qErr } = await sb
      .from("pinterest_video_queue")
      .select("pin_id, storyboard_id, product_id")
      .eq("engine_version", "v5")
      .not("pin_id", "is", null)
      .not("storyboard_id", "is", null);
    if (qErr) throw qErr;

    let upserts = 0;
    for (const q of queueRows || []) {
      // Sum per-day metrics for this pin.
      const { data: metrics } = await sb
        .from("pinterest_video_metrics")
        .select("impressions, outbound_clicks, saves, ctr, engagement_rate")
        .eq("pin_id", q.pin_id);
      if (!metrics || metrics.length === 0) continue;

      const imp = metrics.reduce((a, r) => a + (r.impressions || 0), 0);
      const clicks = metrics.reduce((a, r) => a + (r.outbound_clicks || 0), 0);
      const saves = metrics.reduce((a, r) => a + (r.saves || 0), 0);

      // Watch-time + completion: optional, sourced from pinterest_video_assets if present.
      let totalWatch = 0, avgWatch = 0, views = 0, completion = 0;
      const { data: perf } = await sb
        .from("pinterest_pin_performance")
        .select("performance_score")
        .eq("pin_id", q.pin_id)
        .maybeSingle();

      const ctr = imp > 0 ? clicks / imp : 0;
      const saveRate = imp > 0 ? saves / imp : 0;
      // Composite: clicks weighted highest, saves second, CTR tiebreaker.
      const composite = clicks * 1.0 + saves * 0.6 + ctr * 1000 + (perf?.performance_score || 0);

      const { error: upErr } = await sb.from("cv5_video_analytics").upsert({
        storyboard_id: q.storyboard_id,
        pin_id: q.pin_id,
        product_id: q.product_id,
        impressions: imp,
        outbound_clicks: clicks,
        saves,
        video_views: views,
        total_watch_time_s: totalWatch,
        avg_watch_time_s: avgWatch,
        ctr,
        save_rate: saveRate,
        completion_rate: completion,
        composite_score: composite,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "storyboard_id,pin_id" });
      if (!upErr) upserts++;
    }

    // If we crossed the threshold, fire pattern extraction.
    const { count } = await sb
      .from("cv5_video_analytics")
      .select("id", { count: "exact", head: true })
      .gt("impressions", 0);
    let patternResult: any = null;
    if ((count || 0) >= PATTERN_THRESHOLD) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/cv5-extract-patterns`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ triggered_by: "analytics_sync" }),
      });
      patternResult = r.ok ? await r.json() : { ok: false, status: r.status };
    }

    return new Response(JSON.stringify({ ok: true, traceId: trace_id, upserts, videos_with_data: count || 0, patterns: patternResult }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cv5-analytics-sync]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});