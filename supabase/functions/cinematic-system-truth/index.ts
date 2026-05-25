// cinematic-system-truth — admin-only aggregator that powers the "System Truth
// Panel" on /admin/cinematic-ads-control-center. Single round-trip, no writes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EXPECTED_HOST = "nojvgfbcjgipjxpfatmm.supabase.co";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
  const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ ok: false, message: "admin only" }, 403);

  const supabaseHost = (() => { try { return new URL(SUPABASE_URL).host; } catch { return "unknown"; } })();

  const [
    { data: heartbeats },
    { count: queuedCount },
    { count: publishableCount },
    { count: blockedCount },
    { data: lastRender },
    { data: lastVerified },
    { data: lastError },
  ] = await Promise.all([
    sb.from("render_worker_heartbeats").select("*").order("last_seen_at", { ascending: false }).limit(5),
    sb.from("cinematic_ad_jobs").select("id", { count: "exact", head: true }).eq("status", "render_queued").is("archived_at", null),
    sb.from("cinematic_ad_jobs").select("id", { count: "exact", head: true })
      .in("status", ["publishable", "approved", "completed", "render_complete"])
      .is("archived_at", null),
    sb.from("cinematic_ad_jobs").select("id", { count: "exact", head: true }).not("publishable_reason", "is", null).is("archived_at", null),
    sb.from("cinematic_ad_jobs").select("id, product_slug, render_complete_at").not("render_complete_at", "is", null).order("render_complete_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("cinematic_ad_jobs").select("id, product_slug, pinterest_pin_url, verified_at").eq("remote_exists", true).order("verified_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("cinematic_ad_jobs").select("id, product_slug, worker_last_error, error_message, updated_at").or("worker_last_error.not.is.null,error_message.not.is.null").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const newestHb = (heartbeats ?? [])[0];
  const hbAgeSec = newestHb?.last_seen_at ? Math.round((Date.now() - new Date(newestHb.last_seen_at).getTime()) / 1000) : null;
  const workerHealthy = !!newestHb && hbAgeSec !== null && hbAgeSec < 300;
  const hostMatch = newestHb?.supabase_host === EXPECTED_HOST;

  // Blocker derivation
  let blocker: string | null = null;
  if (!newestHb) blocker = "render_worker_no_heartbeat";
  else if (!workerHealthy) blocker = `render_worker_stale_${hbAgeSec}s`;
  else if (!hostMatch && newestHb.supabase_host) blocker = `wrong_supabase_host:${newestHb.supabase_host}`;
  else if ((publishableCount ?? 0) === 0) blocker = "no_publishable_jobs";

  return json({
    ok: true,
    timestamp: new Date().toISOString(),
    supabaseHost,
    expectedSupabaseHost: EXPECTED_HOST,
    hostMatch: supabaseHost === EXPECTED_HOST,
    worker: {
      healthy: workerHealthy,
      heartbeats: heartbeats ?? [],
      lastSeenAt: newestHb?.last_seen_at ?? null,
      ageSeconds: hbAgeSec,
      safeMode: newestHb?.safe_mode ?? null,
      reportedHost: newestHb?.supabase_host ?? null,
      hostMatch,
    },
    counts: {
      queueDepth: queuedCount ?? 0,
      publishable: publishableCount ?? 0,
      blocked: blockedCount ?? 0,
    },
    lastSuccessfulRender: lastRender ?? null,
    lastVerifiedPin: lastVerified ?? null,
    lastError: lastError ?? null,
    blocker,
  });
});