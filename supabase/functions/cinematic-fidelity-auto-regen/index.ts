// cinematic-fidelity-auto-regen
//
// Picks up cinematic_ad_jobs that V6 fidelity has marked
// `status = 'needs_scene_regen'` and pushes them back to the start of the
// render pipeline so the failing scenes get regenerated and re-validated.
//
// Loop contract (set by cinematic-ad-validate):
//   * fidelity_regen_passes is already incremented when status flips to
//     'needs_scene_regen'. We do NOT increment it again here.
//   * fidelity_max_regen_passes (cinematic_ad_settings) bounds total attempts.
//   * Jobs that exceed the cap are parked in 'creative_rejected' with a clear
//     status_message so a human can decide.
//
// Triggered by:
//   - cron (body.source === "cron"), OR
//   - admin user (JWT + admin role), OR
//   - internal token (x-internal-token === RENDER_WORKER_SECRET).
//
// POST body: { limit?: number, job_ids?: string[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = `regen_${crypto.randomUUID().slice(0, 8)}`;
  if (req.method !== "POST") return json(405, { ok: false, traceId, message: "POST only" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Auth gate
  const internalToken = req.headers.get("x-internal-token") ?? "";
  const isInternal = !!(WORKER_SECRET && internalToken === WORKER_SECRET);
  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const isCron = body?.source === "cron";
  if (!isInternal && !isCron) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json(401, { ok: false, traceId, message: "unauthorized" });
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { ok: false, traceId, message: "admin only" });
  }

  // Read regen cap from settings.
  let autoRegen = true;
  let maxPasses = 3;
  try {
    const { data: s } = await admin
      .from("cinematic_ad_settings")
      .select("fidelity_auto_regen, fidelity_max_regen_passes")
      .limit(1).maybeSingle();
    if (s) {
      autoRegen = s.fidelity_auto_regen !== false;
      maxPasses = Math.max(1, Number(s.fidelity_max_regen_passes ?? maxPasses));
    }
  } catch { /* defaults */ }
  if (!autoRegen) {
    return json(200, { ok: true, traceId, message: "fidelity_auto_regen disabled", processed: 0 });
  }

  const limit = Math.max(1, Math.min(20, Number(body.limit ?? 6)));
  const explicit: string[] = Array.isArray(body.job_ids) ? body.job_ids.map(String) : [];

  let query = admin
    .from("cinematic_ad_jobs")
    .select("id, product_slug, status, fidelity_regen_passes, fidelity_score, fidelity_reject_reasons, scenes_needing_regen")
    .eq("status", "needs_scene_regen")
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (explicit.length) query = query.in("id", explicit);
  const { data: jobs, error: jErr } = await query;
  if (jErr) return json(500, { ok: false, traceId, message: jErr.message });

  const out: any[] = [];
  for (const job of jobs ?? []) {
    const passes = Number(job.fidelity_regen_passes ?? 0);
    if (passes > maxPasses) {
      // Cap exhausted — park for human review. Never silently publish.
      await admin.from("cinematic_ad_jobs").update({
        status: "creative_rejected",
        status_message: `fidelity regen cap reached (${passes}/${maxPasses}) — manual review required`,
        approved_for_render: false,
      }).eq("id", job.id);
      out.push({ job_id: job.id, action: "capped", passes });
      continue;
    }

    // Push the job back to the start of the pipeline so cinematic-ad-prepare
    // rebuilds scenes, cinematic-ad-queue-render queues a fresh render, and
    // cinematic-ad-validate re-runs V6 fidelity on the new output.
    // We clear the stale outputs and regen targets but preserve the running
    // pass counter (validate already bumped it).
    const patch: Record<string, unknown> = {
      status: "pending",
      status_message: `auto-regen pass ${passes}/${maxPasses} — rebuilding failing scenes`,
      output_mp4_url: null,
      output_thumbnail_url: null,
      fidelity_passed: null,
      fidelity_score: null,
      scenes_needing_regen: [],
      validation_passed: null,
      qa_passed: null,
      is_safe_to_publish: false,
      approved_for_render: false,
      approved_at: null,
      render_worker_id: null,
      render_started_at: null,
    };
    const { error: upErr } = await admin.from("cinematic_ad_jobs").update(patch).eq("id", job.id);
    out.push({
      job_id: job.id,
      product_slug: job.product_slug,
      action: upErr ? "error" : "requeued",
      passes,
      cap: maxPasses,
      previous_fidelity_score: job.fidelity_score,
      reasons: Array.isArray(job.fidelity_reject_reasons) ? job.fidelity_reject_reasons.slice(0, 4) : [],
      error: upErr?.message,
    });
  }

  console.log(`[fidelity-auto-regen] ${traceId} processed=${out.length} cap=${maxPasses}`);
  return json(200, { ok: true, traceId, processed: out.length, cap: maxPasses, results: out });
});