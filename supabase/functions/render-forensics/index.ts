/**
 * render-forensics
 *
 * Single read-only endpoint that aggregates everything the
 * /admin/render-forensics dashboard needs to surface the health of the
 * cinematic render pipeline:
 *
 *   - active workers (heartbeat < 5m)
 *   - zombie workers (heartbeat 5m–60m)
 *   - dead workers (heartbeat > 60m)
 *   - queue depth, rendering, stale render_queued, GH 12-min timeouts
 *   - average render time over last 24h
 *   - failed renders 24h
 *   - last 20 jobs with timing + worker info
 *   - missing output_mp4_url cases (rendered jobs without an MP4)
 *
 * Also accepts `action=requeue_stale` to mass-requeue render_queued jobs
 * older than 30 min that no worker ever claimed, and
 * `action=kill_zombies` to force the watchdog to release stuck `rendering`
 * slots.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "snapshot";

    if (action === "kill_zombies") {
      const { data, error } = await admin
        .from("cinematic_ad_jobs")
        .update({
          status: "failed",
          error_message: "zombie_killed_by_forensics",
          status_message: "zombie released by admin — heartbeat stale > 10 min",
          render_worker_id: null,
        })
        .eq("status", "rendering")
        .lt("render_heartbeat_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .select("id");
      if (error) return json({ ok: false, traceId, message: error.message }, 500);
      return json({ ok: true, traceId, killed: data?.length ?? 0, ids: data?.map((d) => d.id) ?? [] });
    }

    if (action === "requeue_stale") {
      const { data, error } = await admin
        .from("cinematic_ad_jobs")
        .update({
          status: "render_queued",
          render_queued_at: new Date().toISOString(),
          render_worker_id: null,
          render_started_at: null,
          render_heartbeat_at: null,
        })
        .eq("status", "needs_admin_review")
        .eq("admin_review_reason", "timeout_after_12m")
        .select("id");
      if (error) return json({ ok: false, traceId, message: error.message }, 500);
      return json({ ok: true, traceId, requeued: data?.length ?? 0, ids: data?.map((d) => d.id) ?? [] });
    }

    // ---------- snapshot ----------
    const now = Date.now();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const sixtyMinAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const thirtyMinAgo = new Date(now - 30 * 60 * 1000).toISOString();
    const tenMinAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const [
      heartbeatsRes,
      queuedCount,
      queuedStaleCount,
      renderingCount,
      zombieCount,
      ghTimeoutCount,
      failed24h,
      rendered24h,
      missingMp4Count,
      recentJobsRes,
      avgDurationRes,
    ] = await Promise.all([
      admin
        .from("cinematic_worker_heartbeats")
        .select("worker_id,last_poll_at,last_claim_at,last_job_id,updated_at")
        .order("updated_at", { ascending: false })
        .limit(20),
      admin.from("cinematic_ad_jobs").select("id", { count: "exact", head: true }).eq("status", "render_queued"),
      admin
        .from("cinematic_ad_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "render_queued")
        .lt("render_queued_at", thirtyMinAgo),
      admin.from("cinematic_ad_jobs").select("id", { count: "exact", head: true }).eq("status", "rendering"),
      admin
        .from("cinematic_ad_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "rendering")
        .lt("render_heartbeat_at", tenMinAgo),
      admin
        .from("cinematic_ad_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "needs_admin_review")
        .eq("admin_review_reason", "timeout_after_12m"),
      admin
        .from("cinematic_ad_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gt("updated_at", twentyFourHoursAgo),
      admin
        .from("cinematic_ad_jobs")
        .select("id", { count: "exact", head: true })
        .not("output_mp4_url", "is", null)
        .gt("render_complete_at", twentyFourHoursAgo),
      admin
        .from("cinematic_ad_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["publishable", "awaiting_approval"])
        .is("output_mp4_url", null),
      admin
        .from("cinematic_ad_jobs")
        .select(
          "id,status,product_slug,render_worker_id,render_queued_at,render_started_at,render_heartbeat_at,render_complete_at,output_mp4_url,render_attempts,error_message,admin_review_reason,updated_at",
        )
        .in("status", [
          "render_queued",
          "rendering",
          "needs_admin_review",
          "failed",
          "publishable",
          "awaiting_approval",
        ])
        .order("updated_at", { ascending: false })
        .limit(25),
      admin.rpc("cinematic_render_avg_seconds_24h").maybeSingle(),
    ]);

    const heartbeats = heartbeatsRes.data ?? [];
    const live = heartbeats.filter((h) => h.updated_at && h.updated_at > fiveMinAgo);
    const zombies = heartbeats.filter(
      (h) => h.updated_at && h.updated_at <= fiveMinAgo && h.updated_at > sixtyMinAgo,
    );
    const dead = heartbeats.filter((h) => !h.updated_at || h.updated_at <= sixtyMinAgo);

    const avgRenderSeconds =
      typeof (avgDurationRes.data as { avg_seconds?: number } | null)?.avg_seconds === "number"
        ? (avgDurationRes.data as { avg_seconds: number }).avg_seconds
        : null;

    return json({
      ok: true,
      traceId,
      now: new Date(now).toISOString(),
      workers: {
        live_count: live.length,
        zombie_count: zombies.length,
        dead_count: dead.length,
        total_known: heartbeats.length,
        live,
        zombies,
        dead,
      },
      queue: {
        render_queued: queuedCount.count ?? 0,
        render_queued_stale_30m: queuedStaleCount.count ?? 0,
        rendering: renderingCount.count ?? 0,
        zombies_rendering_10m: zombieCount.count ?? 0,
        gh_actions_12m_timeouts: ghTimeoutCount.count ?? 0,
      },
      throughput: {
        rendered_24h: rendered24h.count ?? 0,
        failed_24h: failed24h.count ?? 0,
        avg_render_seconds_24h: avgRenderSeconds,
        missing_output_mp4: missingMp4Count.count ?? 0,
      },
      recent_jobs: recentJobsRes.data ?? [],
    });
  } catch (e) {
    return json(
      { ok: false, traceId, message: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
