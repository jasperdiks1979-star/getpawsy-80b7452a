// cinematic-ad-prepare-for-render
//
// Admin-only repair/preparation action for a cinematic_ad_jobs row that is
// queued (or stuck) but missing the inputs required by the safety gate in
// `cinematic-ad-claim-job`. It runs the missing steps inline (preflight +
// creative plan generation) and, when everything is valid, flips the job
// back to `render_queued` so the next GitHub Actions render can claim it.
//
// It NEVER bypasses the safety gate — it fills the missing data so the gate
// passes legitimately.
//
// POST body: { job_id: string, force?: boolean }
// Response: { ok, traceId, job_id, ready, steps, fail_reasons }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const trace = () => `pfr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // Admin gate — same pattern as cinematic-ad-preflight / cinematic-ad-plan.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { ok: false, traceId, message: "unauthorized" });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json(403, { ok: false, traceId, message: "admin role required" });

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const jobId: string | null = body?.job_id ? String(body.job_id) : null;
  if (!jobId) return json(400, { ok: false, traceId, message: "job_id required" });

  const steps: Array<{ name: string; ok: boolean; detail?: unknown }> = [];

  // 1. Load current job state.
  const { data: job, error: jobErr } = await admin
    .from("cinematic_ad_jobs")
    .select("id, status, product_slug, preflight_status, creative_plan, scene_assets, vo_url, legacy_unverified, blocked_reason")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) return json(500, { ok: false, traceId, message: jobErr.message });
  if (!job) return json(404, { ok: false, traceId, message: "job not found" });

  const fnBase = `${SUPABASE_URL}/functions/v1`;
  const fwdHeaders = {
    "Content-Type": "application/json",
    Authorization: authHeader,
    apikey: ANON_KEY,
  };

  // 2. Generate creative_plan if missing (always uses fallback template at minimum).
  if (!job.creative_plan) {
    try {
      const r = await fetch(`${fnBase}/cinematic-ad-plan`, {
        method: "POST",
        headers: fwdHeaders,
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await r.json().catch(() => ({}));
      steps.push({
        name: "creative_plan",
        ok: r.ok && data?.ok !== false,
        detail: { status: r.status, generated_by: data?.plan?.generated_by, message: data?.message },
      });
    } catch (e) {
      steps.push({ name: "creative_plan", ok: false, detail: String(e) });
    }
  } else {
    steps.push({ name: "creative_plan", ok: true, detail: "already_present" });
  }

  // 3. Run preflight (idempotent — writes preflight_status + reasons).
  try {
    const r = await fetch(`${fnBase}/cinematic-ad-preflight`, {
      method: "POST",
      headers: fwdHeaders,
      body: JSON.stringify({ job_id: jobId }),
    });
    const data = await r.json().catch(() => ({}));
    const result = Array.isArray(data?.results) ? data.results[0] : null;
    steps.push({
      name: "preflight",
      ok: r.ok && result?.preflight_status === "pass",
      detail: result ?? { status: r.status, message: data?.message },
    });
  } catch (e) {
    steps.push({ name: "preflight", ok: false, detail: String(e) });
  }

  // 4. Re-read job and validate gate prerequisites.
  const { data: fresh } = await admin
    .from("cinematic_ad_jobs")
    .select("status, preflight_status, preflight_reasons, creative_plan, scene_assets, vo_url, legacy_unverified")
    .eq("id", jobId)
    .maybeSingle();

  const sceneAssets = Array.isArray(fresh?.scene_assets) ? fresh!.scene_assets : [];
  const sceneCount = sceneAssets.length;
  const hasVo = Boolean(fresh?.vo_url);
  const hasPlan = Boolean(fresh?.creative_plan);
  const preflightPassed = fresh?.preflight_status === "pass";

  const failReasons: string[] = [];
  if (!preflightPassed) failReasons.push(`preflight_${fresh?.preflight_status ?? "missing"}`);
  if (!hasPlan) failReasons.push("creative_plan_missing");
  if (sceneCount < 2) failReasons.push(`scene_assets_insufficient:${sceneCount}`);
  if (!hasVo) failReasons.push("voiceover_missing");
  if (fresh?.legacy_unverified && !body?.force) failReasons.push("legacy_unverified");

  steps.push({
    name: "validate_inputs",
    ok: failReasons.length === 0,
    detail: {
      preflight_status: fresh?.preflight_status ?? null,
      preflight_reasons: fresh?.preflight_reasons ?? [],
      creative_plan_present: hasPlan,
      scene_assets_count: sceneCount,
      voiceover_present: hasVo,
      legacy_unverified: Boolean(fresh?.legacy_unverified),
    },
  });

  const ready = failReasons.length === 0;

  // 5. If ready, requeue. Otherwise leave a clear blocked_reason on the row.
  if (ready) {
    await admin
      .from("cinematic_ad_jobs")
      .update({
        status: "render_queued",
        approved_for_render: true,
        blocked_reason: null,
        render_worker_id: null,
        render_started_at: null,
        status_message: `Prepared for render at ${new Date().toISOString()}`,
      })
      .eq("id", jobId);
    steps.push({ name: "requeue", ok: true });
  } else {
    await admin
      .from("cinematic_ad_jobs")
      .update({
        blocked_reason: `Not render-ready: ${failReasons.join(", ")}`,
      })
      .eq("id", jobId);
    steps.push({ name: "requeue", ok: false, detail: "blocked_safety_gate_would_still_fail" });
  }

  return json(200, {
    ok: true,
    traceId,
    job_id: jobId,
    ready,
    fail_reasons: failReasons,
    steps,
  });
});
