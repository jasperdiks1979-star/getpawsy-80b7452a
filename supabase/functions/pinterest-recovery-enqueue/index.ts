// pinterest-recovery-enqueue — ADMIN-ONLY entry point.
// Inserts a job into public.pinterest_recovery_jobs and returns immediately.
// The pinterest-recovery-worker (server-side, service-role) picks it up and
// executes it detached from any browser/preview session.
//
// Auth: requires an admin JWT (bearer). Anon key rejected. Service role bypass
// allowed for internal callers.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const ALLOWED_PHASES = new Set([
  "audit", "ghosts", "repair", "republish", "verify", "certify",
  "dedup", "all", "full", "republish_deleted_remote",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const bearer = authHeader.slice(7).trim();
  if (!bearer) return json({ ok: false, message: "unauthorized" }, 401);
  if (ANON && ctEqual(bearer, ANON)) return json({ ok: false, message: "anon key not accepted" }, 403);

  let requestedBy: string | null = null;
  if (ctEqual(bearer, SERVICE_ROLE)) {
    // Internal / server-side caller. requested_by stays null.
  } else {
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(bearer);
    const uid = claims?.claims?.sub;
    if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
    const { data: role } = await admin.from("user_roles")
      .select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (!role) return json({ ok: false, message: "admin only" }, 403);
    requestedBy = uid;
  }

  const body: any = await req.json().catch(() => ({}));
  const phase = String(body.phase || "").toLowerCase();
  if (!ALLOWED_PHASES.has(phase)) {
    return json({ ok: false, message: `unknown phase: ${phase}` }, 400);
  }

  const params: Record<string, unknown> = {};
  if (body.confirm === true) params.confirm = true;
  if (typeof body.limit === "number" && body.limit > 0) params.limit = Math.min(body.limit, 500);
  if (typeof body.run_id === "string") params.run_id = body.run_id;

  // Reject destructive phases without confirm at enqueue time — same posture
  // as the recovery function itself, so bad requests never sit in the queue.
  if ((phase === "full" || phase === "republish" ||
       phase === "republish_deleted_remote" || phase === "dedup") &&
      params.confirm !== true) {
    return json({ ok: false, message: `${phase} requires confirm: true` }, 428);
  }

  // Prevent piling up duplicate pending jobs of the same phase.
  const { data: existing } = await admin.from("pinterest_recovery_jobs")
    .select("id").eq("phase", phase).in("status", ["pending", "running"]).limit(1).maybeSingle();
  if (existing) {
    return json({ ok: true, deduped: true, job_id: existing.id, message: `already ${phase} in flight` });
  }

  const insertRow: Record<string, unknown> = {
    phase, params, status: "pending", requested_by: requestedBy,
  };
  const { data: job, error } = await admin.from("pinterest_recovery_jobs")
    .insert(insertRow).select("id, phase, status, created_at").single();
  if (error) return json({ ok: false, message: error.message }, 500);

  // Best-effort kick: fire-and-forget to advance immediately without waiting
  // for the cron tick. If it fails, cron will still pick it up.
  try {
    fetch(`${SUPABASE_URL}/functions/v1/pinterest-recovery-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ trigger: "enqueue_kick", job_id: job.id }),
    }).catch(() => {});
  } catch { /* ignore */ }

  return json({ ok: true, job_id: job.id, phase: job.phase, status: job.status });
});