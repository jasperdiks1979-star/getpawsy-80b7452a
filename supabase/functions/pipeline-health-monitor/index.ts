import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { computeHealthScore } from "../_shared/pipeline-health.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function countSafe(sb: any, table: string, build: (q: any) => any): Promise<number> {
  try {
    let q = sb.from(table).select("id", { count: "exact", head: true });
    q = build(q);
    const { count } = await q;
    return count ?? 0;
  } catch { return 0; }
}

async function maxTs(sb: any, table: string, col: string): Promise<string | null> {
  try {
    const { data } = await sb.from(table).select(col).order(col, { ascending: false }).limit(1).maybeSingle();
    return (data as any)?.[col] ?? null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { data: settings } = await sb.from("pinterest_pipeline_settings").select("*").eq("id", 1).maybeSingle();
    const s = settings ?? { target_pins_per_day: 48, min_pins_per_day: 24, min_pending_videos: 20, min_pending_pins: 30, dead_video_minutes: 180, dead_pin_minutes: 180, recovery_score: 80, emergency_score: 60, emergency_mode_enabled: true };
    const since24h = new Date(Date.now() - 86_400_000).toISOString();

    const [pendingVideos, pendingPins, videos24h, pins24h, published24h, failed24h, recovered24h, lastVideo, lastPin] = await Promise.all([
      countSafe(sb, "cinematic_ad_jobs", (q) => q.in("status", ["queued", "render_queued", "rendering"])),
      countSafe(sb, "pinterest_pin_queue", (q) => q.in("status", ["pending", "queued", "processing"])),
      countSafe(sb, "cinematic_ad_jobs", (q) => q.gte("created_at", since24h)),
      countSafe(sb, "pinterest_pin_queue", (q) => q.gte("created_at", since24h)),
      countSafe(sb, "pinterest_publish_logs", (q) => q.gte("created_at", since24h)),
      countSafe(sb, "pinterest_pipeline_failures", (q) => q.gte("created_at", since24h)),
      countSafe(sb, "pinterest_pipeline_failures", (q) => q.gte("created_at", since24h).not("resolved_at", "is", null)),
      maxTs(sb, "cinematic_ad_jobs", "created_at"),
      maxTs(sb, "pinterest_publish_logs", "created_at"),
    ]);

    const health = computeHealthScore({
      pinsPublished24h: published24h,
      targetPinsPerDay: s.target_pins_per_day,
      minPinsPerDay: s.min_pins_per_day,
      pendingVideos,
      minPendingVideos: s.min_pending_videos,
      pendingPins,
      minPendingPins: s.min_pending_pins,
      failed24h,
      recovered24h,
      lastVideoAt: lastVideo,
      lastPinAt: lastPin,
      deadMinutes: Math.min(s.dead_video_minutes, s.dead_pin_minutes),
    }, s.recovery_score, s.emergency_score);

    const publishRatePerHour = +(published24h / 24).toFixed(2);

    await sb.from("pinterest_pipeline_health_snapshots").insert({
      videos_generated_24h: videos24h,
      pins_generated_24h: pins24h,
      pins_published_24h: published24h,
      pending_videos: pendingVideos,
      pending_pins: pendingPins,
      failed_24h: failed24h,
      recovered_24h: recovered24h,
      publish_rate_per_hour: publishRatePerHour,
      last_video_at: lastVideo,
      last_pin_at: lastPin,
      health_score: health.score,
      mode: health.mode,
      reasons: health.reasons,
    });

    await sb.from("pinterest_pipeline_settings").update({
      current_mode: health.mode,
      current_health_score: health.score,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);

    const actions: string[] = [];
    const invoke = async (fn: string, body: Record<string, unknown> = {}) => {
      try { await sb.functions.invoke(fn, { body }); actions.push(fn); } catch (_) {}
    };

    if (pendingVideos < s.min_pending_videos) await invoke("pipeline-auto-replenish", { kind: "video", deficit: s.min_pending_videos - pendingVideos });
    if (pendingPins < s.min_pending_pins) await invoke("pipeline-auto-replenish", { kind: "pin", deficit: s.min_pending_pins - pendingPins });
    if (health.score < s.recovery_score) await invoke("pipeline-recovery-run", { trigger: "low_health" });
    if (health.score < s.emergency_score && s.emergency_mode_enabled) await invoke("pipeline-emergency-content", { trigger: "low_health" });

    return new Response(JSON.stringify({ ok: true, traceId, health, actions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});