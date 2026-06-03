// One-shot admin helper for clean render recovery of a fixed list of jobs:
//   1) clears the 24h per-product render budget
//   2) resets job render state
//   3) dispatches render-cinematic-ad.yml via cinematic-ad-worker-control
// Gated by a hardcoded x-batch-secret. Delete after use.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const ONE_SHOT_SECRET = "render-recovery-3-jobs-2026";

const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    if ((req.headers.get("x-batch-secret") ?? "") !== ONE_SHOT_SECRET) {
      return json({ ok: false, traceId, message: "forbidden" }, 403);
    }
    const body = await req.json().catch(() => ({}));
    const jobs: Array<{ id: string; slug: string }> = Array.isArray(body?.jobs) ? body.jobs : [];
    if (!jobs.length) return json({ ok: false, traceId, message: "jobs[] required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const results: any[] = [];

    for (const j of jobs) {
      const step: any = { job_id: j.id, slug: j.slug };

      // 1) Clear 24h budget for this product slug
      const { data: cleared, error: cErr } = await admin
        .rpc("cinematic_clear_render_budget", { p_product_slug: j.slug, p_reason: "Option A clean recovery" });
      step.budget_cleared = { ok: !cErr, data: cleared, error: cErr?.message ?? null };

      // 2) Reset job render state (status, attempts, MP4, validation, gates)
      const nowIso = new Date().toISOString();
      const { error: updErr } = await admin
        .from("cinematic_ad_jobs")
        .update({
          status: "render_queued",
          render_attempts: 0,
          render_worker_id: null,
          render_started_at: null,
          render_complete_at: null,
          render_heartbeat_at: null,
          render_dispatched_at: null,
          render_queued_at: nowIso,
          output_mp4_url: null,
          validation_report: null,
          qa_passed: null,
          is_safe_to_publish: false,
          blocked_reason: "",
          status_message: "Clean recovery: queued for fresh GH Actions render",
          updated_at: nowIso,
        })
        .eq("id", j.id);
      step.reset = { ok: !updErr, error: updErr?.message ?? null };

      // 3) Dispatch GH Actions workflow via worker-control
      const dispRes = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-worker-control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-render-secret": RENDER_WORKER_SECRET,
        },
        body: JSON.stringify({ action: "trigger_github_workflow", job_id: j.id }),
      });
      const dispText = await dispRes.text();
      let dispParsed: any = null;
      try { dispParsed = JSON.parse(dispText); } catch { dispParsed = dispText; }
      step.dispatch = { http: dispRes.status, body: dispParsed };

      results.push(step);
    }

    return json({ ok: true, traceId, results });
  } catch (e) {
    return json({ ok: false, traceId, message: String((e as any)?.message ?? e) }, 500);
  }
});