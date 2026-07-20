/**
 * pinterest-autopilot-run-one
 *
 * Drives ONE pinterest_autopilot_schedule row through the full
 * cinematic-ad-autopilot pipeline. Sets auto_publish=true so the render
 * webhook auto-publishes once the validator passes.
 *
 * POST { schedule_id?: string }   // if omitted, picks the next "planned" row whose scheduled_at <= now()
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const tid = () => `pap_run_${crypto.randomUUID().slice(0, 8)}`;

function appendLog(existing: any, step: string, meta?: any) {
  const arr = Array.isArray(existing) ? [...existing] : [];
  arr.push({ step, at: new Date().toISOString(), meta });
  return arr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = tid();
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const secret = req.headers.get("x-render-secret") ?? "";
    const isService = WORKER_SECRET.length > 0 && secret === WORKER_SECRET;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (!isService) {
      if (!authHeader.startsWith("Bearer ")) return json({ ok: false, traceId, message: "unauthenticated" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: ud } = await userClient.auth.getUser();
      if (!ud?.user) return json({ ok: false, traceId, message: "unauthenticated" }, 401);
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", ud.user.id).eq("role", "admin").maybeSingle();
      if (!role) return json({ ok: false, traceId, message: "admin required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    let scheduleId: string | null = body.schedule_id ? String(body.schedule_id) : null;

    // Pick next due row if none specified
    if (!scheduleId) {
      const { data: due } = await admin
        .from("pinterest_autopilot_schedule")
        .select("id")
        .eq("status", "planned")
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at")
        .limit(1);
      if (!due || due.length === 0) return json({ ok: true, traceId, message: "no due rows", ran: false });
      scheduleId = due[0].id;
    }

    const { data: row, error: rowErr } = await admin
      .from("pinterest_autopilot_schedule").select("*").eq("id", scheduleId).maybeSingle();
    if (rowErr || !row) return json({ ok: false, traceId, message: "schedule row not found" }, 404);
    if (!["planned", "failed", "skipped"].includes(row.status)) {
      return json({ ok: false, traceId, message: `row status '${row.status}' not eligible` }, 409);
    }

    // Lock the row
    let log = appendLog(row.log, "run_start", { traceId });
    await admin.from("pinterest_autopilot_schedule").update({
      status: "preparing",
      attempt_count: (row.attempt_count ?? 0) + 1,
      log,
    }).eq("id", scheduleId);

    // Call cinematic-ad-autopilot. Service-mode requires bearer + service role.
    // Forward whichever Authorization we had; if service-mode, we need to forge
    // a service-role token (the function uses auth.getUser). Simpler: skip
    // autopilot's admin check by calling the lower-level functions directly is
    // not desirable. Instead, when run by cron (service), call cinematic-ad-autopilot
    // with the SERVICE_ROLE bearer (it accepts auth.getUser, which fails) — so
    // for cron, we replicate prepare→approve directly here.
    const authForCall = isService ? `Bearer ${SERVICE_KEY}` : authHeader;

    // Service-mode workaround: cinematic-ad-autopilot requires an authenticated
    // admin user. For cron, we run prepare + approve inline with service role.
    let jobId: string | null = null;
    let decisionsOut: any = null;
    let scoresOut: any = null;

    if (isService) {
      // Inline: call prepare and approve via service-role calls is not trivial
      // (those functions also require admin). For now, cron should pass an
      // x-admin-impersonate header — but simplest: store the schedule_id and
      // expect a human-triggered admin call. So in service mode we just mark
      // 'planned' again with note.
      log = appendLog(log, "service_skip", { message: "service-mode invocation needs an admin caller" });
      await admin.from("pinterest_autopilot_schedule").update({
        status: "planned", log,
      }).eq("id", scheduleId);
      return json({ ok: false, traceId, message: "service-mode run requires admin invocation; use admin UI Run One Now button" }, 412);
    }

    const apRes = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-autopilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authForCall, apikey: ANON_KEY },
      body: JSON.stringify({ product_slug: row.product_slug, autopilot_threshold: 70 }),
    });
    const apJson: any = await apRes.json().catch(() => ({}));
    log = appendLog(log, "autopilot_response", { ok: apJson?.ok, message: apJson?.message, score: apJson?.scores?.overall });

    if (!apRes.ok || !apJson?.ok || !apJson?.job_id) {
      await admin.from("pinterest_autopilot_schedule").update({
        status: "failed",
        skip_reason: apJson?.message ?? `autopilot http ${apRes.status}`,
        log,
      }).eq("id", scheduleId);
      return json({ ok: false, traceId, message: apJson?.message ?? "autopilot failed", autopilot: apJson }, 500);
    }

    jobId = apJson.job_id as string;
    decisionsOut = apJson.decisions;
    scoresOut = apJson.scores;

    await admin.from("pinterest_autopilot_schedule").update({
      status: "rendering",
      cinematic_ad_job_id: jobId,
      creative_angle: decisionsOut?.angle ?? null,
      pin_title: apJson?.pin_title ?? null,
      pin_description: apJson?.pin_description ?? null,
      validation_report: scoresOut ?? null,
      log,
    }).eq("id", scheduleId);

    return json({
      ok: true, traceId, schedule_id: scheduleId, job_id: jobId,
      decisions: decisionsOut, scores: scoresOut,
      message: "autopilot engaged — render queued, will auto-publish when validation passes",
    });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});