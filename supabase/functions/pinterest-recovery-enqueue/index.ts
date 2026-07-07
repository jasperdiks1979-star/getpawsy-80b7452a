// pinterest-recovery-enqueue
// ─────────────────────────────────────────────────────────────────────────────
// Admin-gated writer for the server-side recovery queue.
// Inserts exactly ONE row into `pinterest_recovery_jobs` and returns.
// Does NOT run recovery inline. Does NOT touch Pinterest. Does NOT depend on
// preview cookies after the enqueue call returns — the row is picked up by
// the backend worker (cron-driven), completely detached from any browser
// session.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Phases that write to Pinterest or mutate canonical rows. Require confirm:true.
const DESTRUCTIVE_PHASES = new Set([
  "republish",
  "republish_deleted_remote",
  "dedup",
  "full",
  "repair",
]);

// Whitelist of phases the enqueuer will accept. The worker is responsible for
// dispatching each phase to `pinterest-reality-recovery`.
const ALLOWED_PHASES = new Set([
  "audit",
  "ghosts",
  "repair",
  "republish",
  "republish_deleted_remote",
  "verify",
  "certify",
  "dedup",
  "all",
  "full",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── AuthN: bearer JWT required ────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, error: "unauthorized", reason: "missing_bearer" }, 401);
  }
  const bearer = authHeader.slice(7).trim();
  if (!bearer) return json({ ok: false, error: "unauthorized", reason: "empty_bearer" }, 401);
  // Reject the anon key outright — the enqueue endpoint is admin-only.
  if (bearer === ANON_KEY) {
    return json({ ok: false, error: "forbidden", reason: "anon_key_not_accepted" }, 403);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(bearer);
  const uid = claimsRes?.claims?.sub as string | undefined;
  if (claimsErr || !uid) {
    return json({ ok: false, error: "unauthorized", reason: "invalid_jwt" }, 401);
  }

  // ── AuthZ: has_role(uid, 'admin') via service role ────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (roleErr) return json({ ok: false, error: "role_lookup_failed", detail: roleErr.message }, 500);
  if (!roleRow) return json({ ok: false, error: "forbidden", reason: "admin_only" }, 403);

  // ── Body validation ───────────────────────────────────────────────────────
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const phase = String(body?.phase ?? "").toLowerCase().trim();
  const confirm = body?.confirm === true;
  const limit = body?.limit == null ? null : Number(body.limit);

  if (!phase) return json({ ok: false, error: "bad_request", reason: "phase_required" }, 400);
  if (!ALLOWED_PHASES.has(phase)) {
    return json({ ok: false, error: "bad_request", reason: `unknown_phase:${phase}` }, 400);
  }
  if (DESTRUCTIVE_PHASES.has(phase) && !confirm) {
    return json({
      ok: false,
      error: "confirmation_required",
      reason: `phase '${phase}' is destructive; body.confirm must be true`,
    }, 428);
  }
  if (limit != null && (!Number.isFinite(limit) || limit <= 0 || limit > 500)) {
    return json({ ok: false, error: "bad_request", reason: "limit must be 1..500" }, 400);
  }

  const params: Record<string, unknown> = { confirm };
  if (limit != null) params.limit = Math.floor(limit);

  // ── Dedup: reject if a pending/running job for the same phase exists ──────
  const { data: existing, error: existErr } = await admin
    .from("pinterest_recovery_jobs")
    .select("id, status, phase, params, created_at")
    .eq("phase", phase)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (existErr) {
    return json({ ok: false, error: "dedup_lookup_failed", detail: existErr.message }, 500);
  }
  if (existing && existing.length > 0) {
    const row = existing[0];
    return json({
      ok: true,
      deduplicated: true,
      job_id: row.id,
      status: row.status,
      phase: row.phase,
      params: row.params,
      message: `existing ${row.status} job for phase '${phase}' reused`,
    }, 200);
  }

  // ── Insert exactly one job row ────────────────────────────────────────────
  const { data: inserted, error: insErr } = await admin
    .from("pinterest_recovery_jobs")
    .insert({
      phase,
      params,
      status: "pending",
      requested_by: uid,
    })
    .select("id, status, phase, params, created_at")
    .single();
  if (insErr || !inserted) {
    return json({ ok: false, error: "insert_failed", detail: insErr?.message }, 500);
  }

  return json({
    ok: true,
    deduplicated: false,
    job_id: inserted.id,
    status: inserted.status,
    phase: inserted.phase,
    params: inserted.params,
    created_at: inserted.created_at,
  }, 201);
});