// cinematic-ad-kick-pending
// Admin-only OR internal (x-internal-token == RENDER_WORKER_SECRET).
// Advances cinematic_ad_jobs through pending → preparing → prepared → render_queued
// by chaining cinematic-ad-prepare + cinematic-ad-approve using the internal token.
//
// POST body: { job_ids?: string[], limit?: number }
// If job_ids omitted, picks up to `limit` (default 8) oldest pending/prepared jobs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = `kick_${crypto.randomUUID().slice(0, 8)}`;
  if (req.method !== "POST") return json(405, { ok: false, traceId, message: "POST only" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Auth: admin role OR internal token.
  const internalToken = req.headers.get("x-internal-token") ?? "";
  const isInternal = !!(WORKER_SECRET && internalToken === WORKER_SECRET);
  // Allow cron-source calls (apikey already validated by Supabase gateway).
  // Body is parsed once below; sniff source field first via clone.
  let earlyBody: any = {};
  try { earlyBody = await req.clone().json(); } catch {}
  const isCron = earlyBody?.source === "cron";
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

  let body: any = {};
  try { body = await req.json(); } catch {}
  const limit = Math.max(1, Math.min(20, Number(body.limit ?? 8)));
  const explicit: string[] = Array.isArray(body.job_ids) ? body.job_ids.map(String) : [];

  let jobs: Array<{ id: string; product_slug: string; status: string; hook_variant: string | null; voice_style: string | null }> = [];
  if (explicit.length) {
    const { data } = await admin
      .from("cinematic_ad_jobs")
      .select("id, product_slug, status, hook_variant, voice_style, storyboard")
      .in("id", explicit);
    jobs = data ?? [];
  } else {
    const { data } = await admin
      .from("cinematic_ad_jobs")
      .select("id, product_slug, status, hook_variant, voice_style, storyboard")
      .in("status", ["pending", "prepared"])
      .order("created_at", { ascending: true })
      .limit(limit);
    jobs = data ?? [];
  }

  const results: any[] = [];

  for (const job of jobs) {
    const step: any = { job_id: job.id, product_slug: job.product_slug, initial_status: job.status };
    try {
      // Stamp test-bypass for autopublish, so window/cooldown checks don't hold it.
      await admin.from("cinematic_ad_jobs").update({
        publish_window_bypass: true,
      }).eq("id", job.id);
    } catch { /* column may not exist yet */ }

    // Step 1 — prepare (also re-run if storyboard is empty, even when status=prepared)
    const sbLen = Array.isArray((job as any).storyboard) ? (job as any).storyboard.length : 0;
    const needsPrepare =
      job.status === "pending" ||
      job.status === "preparing" ||
      (job.status === "prepared" && sbLen === 0);
    if (needsPrepare) {
      const prepRes = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-prepare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          "x-internal-token": WORKER_SECRET,
        },
        body: JSON.stringify({
          job_id: job.id,
          product_slug: job.product_slug,
          hook_variant: job.hook_variant ?? "default",
          voice_style: job.voice_style ?? undefined,
          force_new: true,
        }),
      });
      const prepJson = await prepRes.json().catch(() => ({}));
      step.prepare = { status: prepRes.status, ok: prepJson?.ok ?? false, message: prepJson?.message };
      if (!prepRes.ok || prepJson?.ok === false) {
        results.push(step);
        continue;
      }
    } else {
      step.prepare = { skipped: true, reason: `status=${job.status}` };
    }

    // Step 2 — approve + queue render
    const apprRes = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        "x-internal-token": WORKER_SECRET,
      },
      body: JSON.stringify({ job_id: job.id }),
    });
    const apprJson = await apprRes.json().catch(() => ({}));
    step.approve = { status: apprRes.status, ok: apprJson?.ok ?? false, message: apprJson?.message };

    // Final status snapshot
    const { data: after } = await admin
      .from("cinematic_ad_jobs").select("status, approved_for_render").eq("id", job.id).maybeSingle();
    step.final_status = after?.status ?? null;
    results.push(step);
  }

  // Nudge the render worker to claim immediately so we don't wait 2 min for next poll.
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-worker-control`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ action: "trigger_github_workflow", claim_next: true }),
    });
  } catch { /* best-effort */ }

  return json(200, {
    ok: true,
    traceId,
    message: `kicked ${jobs.length} jobs`,
    results,
  });
});