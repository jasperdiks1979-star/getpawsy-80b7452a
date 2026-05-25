// Cinematic Ad Operator — admin-only diagnostic & control endpoint.
// Returns a uniform envelope: { success, status, message, details, timestamp }.
// Actions: debug_panel | validate_secrets | test_pinterest | test_supabase
//          | queue_test_job | process_once | health_proxy
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Envelope = {
  success: boolean;
  status: string;
  message: string;
  details?: unknown;
  timestamp: string;
};

const env = (s: string, fallback = ""): string => Deno.env.get(s) ?? fallback;

const respond = (status: number, body: Envelope) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ok = (message: string, details?: unknown, status = "ok") =>
  respond(200, { success: true, status, message, details, timestamp: new Date().toISOString() });

const fail = (httpStatus: number, status: string, message: string, details?: unknown) =>
  respond(httpStatus, { success: false, status, message, details, timestamp: new Date().toISOString() });

// Mask any string we don't want to leak.
const mask = (v: string | undefined | null): string => {
  if (!v) return "";
  if (v.length <= 6) return "***";
  return `${v.slice(0, 3)}***${v.slice(-2)}`;
};

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { admin: false, userId: null as string | null };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return { admin: false, userId: null };
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  return { admin: !!roleRow, userId: data.user.id };
}

// ---------- action handlers ----------
async function actionValidateSecrets() {
  const names = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RENDER_WORKER_SECRET",
    "PINTEREST_ACCESS_TOKEN",
    "PINTEREST_BOARD_ID",
    "PUBLIC_SITE_URL",
  ];
  const map = names.map((name) => {
    const v = env(name);
    return { name, present: !!v, masked: mask(v) };
  });
  const missing = map.filter((m) => !m.present).map((m) => m.name);
  return ok(
    missing.length ? `Missing ${missing.length} secret(s)` : "All required secrets present",
    { secrets: map, missing },
    missing.length ? "warning" : "ok",
  );
}

async function actionTestSupabase() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { count, error } = await admin
    .from("cinematic_ad_jobs")
    .select("*", { count: "exact", head: true });
  if (error) return fail(502, "supabase_error", error.message, { code: error.code });
  return ok(`Supabase reachable, ${count ?? 0} job rows`, { count, host: new URL(SUPABASE_URL).host });
}

async function actionTestPinterest() {
  const token = env("PINTEREST_ACCESS_TOKEN");
  if (!token) return fail(400, "missing_secret", "PINTEREST_ACCESS_TOKEN not set");
  try {
    const r = await fetch("https://api.pinterest.com/v5/user_account", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      return fail(r.status, "pinterest_error", `Pinterest ${r.status}`, { body });
    }
    return ok(`Connected as ${body?.username ?? "unknown"}`, {
      username: body?.username,
      account_type: body?.account_type,
    });
  } catch (e) {
    return fail(502, "pinterest_unreachable", (e as Error).message);
  }
}

async function actionQueueTestJob(userId: string | null) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const slug = "automatic-cat-litter-box-self-cleaning-app-control";
  const { data, error } = await admin
    .from("cinematic_ad_jobs")
    .insert({
      product_slug: slug,
      hook_variant: "diagnostic",
      status: "render_queued",
      render_queued_at: new Date().toISOString(),
      product_url: `https://getpawsy.pet/products/${slug}`,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return fail(502, "insert_failed", error.message);
  return ok(`Test job queued: ${data.id}`, { job_id: data.id, slug });
}

async function actionProcessOnce() {
  // Worker polls on its own loop. We only nudge by touching settings;
  // we never spawn ffmpeg here (worker owns rendering).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await admin
    .from("cinematic_ad_settings")
    .update({ updated_at: new Date().toISOString() })
    .gte("created_at", "1970-01-01");
  if (error) return fail(502, "settings_update_failed", error.message);
  return ok(
    "Nudge sent. Worker will pick up the next queued job on its next poll.",
    { note: "no direct render dispatch — worker owns the loop" },
  );
}

async function actionHealthProxy() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: settings } = await admin
    .from("cinematic_ad_settings")
    .select("worker_health_url")
    .limit(1)
    .maybeSingle();
  const url = settings?.worker_health_url;
  if (!url) {
    return fail(404, "worker_health_url_unset", "Set cinematic_ad_settings.worker_health_url to your Render worker /health/worker URL");
  }
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8_000);
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    const body = await r.json().catch(() => ({}));
    return ok(r.ok ? "Worker reachable" : `Worker returned ${r.status}`, { status: r.status, body });
  } catch (e) {
    return fail(502, "worker_unreachable", (e as Error).message);
  }
}

async function actionDebugPanel() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const [hb, counts, recent] = await Promise.all([
    admin
      .from("render_worker_heartbeats")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(5),
    admin.rpc("noop_dummy").then(() => null).catch(() => null), // placeholder
    admin
      .from("cinematic_ad_jobs")
      .select("id, product_slug, status, error_message, output_mp4_url, pinterest_pin_url, render_attempts, pinterest_publish_attempts, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  // Counts per status
  const { data: rawStatuses } = await admin
    .from("cinematic_ad_jobs")
    .select("status");
  const statusCounts: Record<string, number> = {};
  (rawStatuses ?? []).forEach((r: { status: string }) => {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  });

  const secretNames = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RENDER_WORKER_SECRET",
    "PINTEREST_ACCESS_TOKEN",
    "PINTEREST_BOARD_ID",
    "PUBLIC_SITE_URL",
  ];
  const secrets = secretNames.map((n) => ({ name: n, present: !!env(n), masked: mask(env(n)) }));

  return ok("Debug panel data", {
    supabaseHost: new URL(SUPABASE_URL).host,
    expectedSupabaseHost: "nojvgfbcjgipjxpfatmm.supabase.co",
    heartbeats: hb.data ?? [],
    statusCounts,
    recentJobs: recent.data ?? [],
    secrets,
  });
  void counts;
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "POST only");

  try {
    const { admin, userId } = await requireAdmin(req);
    if (!admin) return fail(401, "unauthorized", "Admin role required");

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action ?? "";

    switch (action) {
      case "validate_secrets": return actionValidateSecrets();
      case "test_supabase":   return actionTestSupabase();
      case "test_pinterest":  return actionTestPinterest();
      case "queue_test_job":  return actionQueueTestJob(userId);
      case "process_once":    return actionProcessOnce();
      case "health_proxy":    return actionHealthProxy();
      case "debug_panel":     return actionDebugPanel();
      default:
        return fail(400, "unknown_action", `Unknown action: ${action || "(empty)"}`, {
          allowed: [
            "debug_panel", "validate_secrets", "test_supabase",
            "test_pinterest", "queue_test_job", "process_once", "health_proxy",
          ],
        });
    }
  } catch (e) {
    return fail(500, "unhandled", (e as Error).message);
  }
});