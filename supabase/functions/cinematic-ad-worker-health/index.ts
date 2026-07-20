import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LIVE_WINDOW_MS = 10 * 60 * 1000;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ ok: false, route: "/functions/v1/cinematic-ad-worker-health", workerLive: false, message: "backend misconfigured" }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: hb, error: hbError } = await admin
      .from("cinematic_worker_heartbeats")
      .select("worker_id,last_poll_at,last_claim_at,last_job_id")
      .order("last_poll_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: current, error: currentError } = await admin
      .from("cinematic_ad_jobs")
      .select("id")
      .eq("status", "rendering")
      .order("render_started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: lastClaimRow, error: claimError } = await admin
      .from("cinematic_ad_jobs")
      .select("id,render_started_at,updated_at")
      .not("render_started_at", "is", null)
      .order("render_started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: lastTouchedRow, error: touchError } = await admin
      .from("cinematic_ad_jobs")
      .select("id,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count: queueDepth, error: queueError } = await admin
      .from("cinematic_ad_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "render_queued");

    const lastHeartbeat = hb?.last_poll_at ?? null;
    const lastClaim = hb?.last_claim_at ?? lastClaimRow?.render_started_at ?? null;
    const lastTouched = lastTouchedRow?.updated_at ?? lastClaimRow?.updated_at ?? null;
    const now = Date.now();
    const hbAge = lastHeartbeat ? now - new Date(lastHeartbeat).getTime() : Infinity;
    const claimAge = lastClaim ? now - new Date(lastClaim).getTime() : Infinity;
    const touchAge = lastTouched ? now - new Date(lastTouched).getTime() : Infinity;
    const workerLive = Math.min(hbAge, claimAge, touchAge) < LIVE_WINDOW_MS;
    const routeActive = !hbError && !currentError && !claimError && !touchError && !queueError;
    let supabaseHost = "unknown";
    try { supabaseHost = new URL(SUPABASE_URL).host; } catch { /* noop */ }
    console.log("[cinematic-ad-worker-health] snapshot", { supabaseHost, workerLive, routeActive, queueDepth });

    return json({
      ok: true,
      route: "/functions/v1/cinematic-ad-worker-health",
      supabase_url: SUPABASE_URL,
      supabase_host: supabaseHost,
      workerLive,
      routeActive,
      lastHeartbeat,
      lastClaim,
      currentJobId: current?.id ?? hb?.last_job_id ?? null,
      queueDepth: queueDepth ?? 0,
      message: workerLive ? "Worker live" : "API route active — no recent worker activity",
      errors: {
        heartbeat: hbError?.message ?? null,
        current: currentError?.message ?? null,
        claim: claimError?.message ?? null,
        touch: touchError?.message ?? null,
        queue: queueError?.message ?? null,
      },
    });
  } catch (e) {
    return json({ ok: false, route: "/functions/v1/cinematic-ad-worker-health", workerLive: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
