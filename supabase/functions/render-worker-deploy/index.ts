import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

// Triggers the external render-worker host's Deploy Hook and logs the result
// to `render_worker_deploys` so the admin dashboard can show the last status.
//
// Two callers:
//   1. The GitHub Actions workflow (auth: shared secret in `x-deploy-secret` header
//      matching the RENDER_WORKER_DEPLOY_SECRET env var).
//   2. Admin users from the dashboard (auth: Supabase JWT + has_role('admin')).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEPLOY_SECRET = Deno.env.get("RENDER_WORKER_DEPLOY_SECRET") ?? "";
const DEPLOY_HOOK_URL = Deno.env.get("RENDER_WORKER_DEPLOY_HOOK_URL") ?? "";

type Body = {
  trigger_source?: string;
  commit_sha?: string | null;
  commit_message?: string | null;
  actor?: string | null;
  target?: string;
  deploy_hook_url?: string;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body */
  }

  // ---- AUTH ----
  const sharedSecret = req.headers.get("x-deploy-secret") ?? "";
  const isCi = !!DEPLOY_SECRET && sharedSecret === DEPLOY_SECRET;
  let actor = body.actor ?? null;

  if (!isCi) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { ok: false, message: "Missing auth" });
    }
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json(401, { ok: false, message: "Invalid token" });
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) return json(403, { ok: false, message: "Admin only" });
    actor = userData.user?.email ?? userId;
  }

  const hookUrl = body.deploy_hook_url || DEPLOY_HOOK_URL;
  if (!hookUrl) {
    const insert = await admin.from("render_worker_deploys").insert({
      trigger_source: body.trigger_source ?? (isCi ? "github-actions" : "dashboard"),
      target: body.target ?? "render",
      commit_sha: body.commit_sha ?? null,
      commit_message: body.commit_message ?? null,
      actor,
      http_status: null,
      ok: false,
      error: "RENDER_WORKER_DEPLOY_HOOK_URL secret not configured",
    });
    return json(500, {
      ok: false,
      message: "RENDER_WORKER_DEPLOY_HOOK_URL secret not configured",
      logged: !insert.error,
    });
  }

  // ---- TRIGGER DEPLOY HOOK ----
  const startedAt = Date.now();
  let httpStatus: number | null = null;
  let responseBody = "";
  let ok = false;
  let errorMessage: string | null = null;

  try {
    const resp = await fetch(hookUrl, { method: "POST" });
    httpStatus = resp.status;
    responseBody = (await resp.text()).slice(0, 2000);
    ok = resp.status >= 200 && resp.status < 300;
    if (!ok) errorMessage = `HTTP ${resp.status}`;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;

  const { data: row, error: logError } = await admin
    .from("render_worker_deploys")
    .insert({
      trigger_source: body.trigger_source ?? (isCi ? "github-actions" : "dashboard"),
      target: body.target ?? "render",
      commit_sha: body.commit_sha ?? null,
      commit_message: body.commit_message ?? null,
      actor,
      http_status: httpStatus,
      ok,
      response_body: responseBody || null,
      error: errorMessage,
      duration_ms: durationMs,
    })
    .select()
    .single();

  return json(ok ? 200 : 502, {
    ok,
    httpStatus,
    durationMs,
    error: errorMessage,
    log: row ?? null,
    logError: logError?.message ?? null,
  });
});