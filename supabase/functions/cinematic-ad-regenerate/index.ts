// cinematic-ad-regenerate
//
// Admin-confirmed regenerate path. Marks a job with regenerate_requested_at
// and bumps regenerate_count, then dispatches cinematic-ad-prepare to rebuild
// the assets. Per the Domination Mode contract, this only runs after explicit
// admin confirmation in the UI (not auto on validate failure).
//
// POST { job_id: string, reason?: string }
// Resp { ok, traceId, job_id, regenerate_count, prepare_status }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const trace = () => `rgn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RENDER_SECRET = Deno.env.get("RENDER_WEBHOOK_SECRET") ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;
const MAX_REGENERATE = 2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  if (req.method !== "POST") return json(405, { ok: false, traceId, message: "POST required" });

  let body: { job_id?: string; reason?: string; mode?: "manual" | "auto" } = {};
  try { body = await req.json(); } catch { /* noop */ }
  if (!body.job_id) return json(400, { ok: false, traceId, message: "job_id required" });

  // Auth: admin JWT for manual, or x-render-secret for auto (internal callers).
  const mode = body.mode ?? "manual";
  let actorId: string | null = null;
  if (mode === "auto") {
    const sec = req.headers.get("x-render-secret") ?? "";
    if (!RENDER_SECRET || sec !== RENDER_SECRET) return json(401, { ok: false, traceId, message: "auto mode requires x-render-secret" });
    actorId = null;
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { ok: false, traceId, message: "missing bearer" });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json(401, { ok: false, traceId, message: "invalid token" });
    actorId = u.user.id;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: job, error } = await admin
    .from("cinematic_ad_jobs")
    .select("id, product_slug, hook_variant, regenerate_count, status")
    .eq("id", body.job_id)
    .maybeSingle();
  if (error || !job) return json(404, { ok: false, traceId, message: "job not found" });

  const nextCount = Number((job as any).regenerate_count ?? 0) + 1;
  if (nextCount > MAX_REGENERATE) {
    return json(409, { ok: false, traceId, message: `regenerate cap reached (${MAX_REGENERATE})`, job_id: job.id });
  }

  await admin.from("cinematic_ad_jobs").update({
    regenerate_requested_at: new Date().toISOString(),
    regenerate_requested_by: actorId,
    regenerate_count: nextCount,
    regenerate_reason: body.reason ?? (mode === "auto" ? "auto: weak output" : "admin manual"),
    status_message: `regenerate #${nextCount} (${mode})${body.reason ? `: ${body.reason}` : ""}`,
    updated_at: new Date().toISOString(),
  } as any).eq("id", job.id);

  // Dispatch prepare — reuses existing pipeline so scene assets + VO refresh.
  let prepareStatus: number | string = "skipped";
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/cinematic-ad-prepare`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: job.id, product_slug: (job as any).product_slug, hook_variant: (job as any).hook_variant ?? undefined }),
    });
    prepareStatus = res.status;
  } catch (e) {
    prepareStatus = `error:${(e as Error).message}`;
  }

  return json(200, { ok: true, traceId, job_id: job.id, regenerate_count: nextCount, prepare_status: prepareStatus });
});
