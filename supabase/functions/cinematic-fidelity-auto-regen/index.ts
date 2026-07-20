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
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Lovable AI root-cause analysis on hard-reject reasons.
// Returns short structured guidance the next render pass can act on.
async function rootCauseAnalysis(reasons: string[], passes: number, slug?: string | null): Promise<string> {
  if (!LOVABLE_API_KEY || !reasons.length) return "";
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are the GetPawsy V9 Pinterest Cinematic Director. Given V9 reject reasons for a product video ad, output a 1-2 sentence root cause plus a concrete corrective directive for the next regeneration. HARD V9 RULES (any violation = automatic reject): scene_count >= 6 unique scenes (HOOK, PROBLEM, DEMONSTRATION, TRANSFORMATION, PAYOFF, CTA), each scene must have unique motion + camera move + framing + transition, NO single_image_render, NO slideshow, NO Ken Burns, NO floating photos, NO static image renders. Quality gates: pinterest_quality_score > 95, final_creative_score > 95, product_fidelity_score > 95, hook_score >= 90, voice_score >= 90, ctr_prediction >= 90, emotional_arc >= 6, engagement_pacing >= 65. Every regeneration must change hook, pacing, storyboard, CTA AND emotional angle versus the previous pass — never produce identical scenes." },
          { role: "user", content: `Product: ${slug ?? "n/a"}\nPass: ${passes}\nReject reasons:\n- ${reasons.slice(0, 8).join("\n- ")}` },
        ],
        temperature: 0.3,
      }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    return String(j?.choices?.[0]?.message?.content ?? "").slice(0, 600);
  } catch { return ""; }
}

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

  // Pick up both soft-fail (needs_scene_regen) AND hard-reject (creative_rejected)
  // jobs that still have budget. Hard rejects get AI root-cause analysis fed back
  // into the next pass; static/slideshow outputs are never tolerated.
  let query = admin
    .from("cinematic_ad_jobs")
    .select("id, product_slug, status, fidelity_regen_passes, fidelity_score, fidelity_reject_reasons, scenes_needing_regen, v4_reject_reasons, v5_reject_reasons, media_type, meta")
    .in("status", ["needs_scene_regen", "creative_rejected"])
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

    // Aggregate every reject signal we have so the next pass sees the full picture.
    const allReasons: string[] = [
      ...((job.fidelity_reject_reasons as string[] | null) ?? []),
      ...((job.v5_reject_reasons as string[] | null) ?? []),
      ...((job.v4_reject_reasons as string[] | null) ?? []),
      ...(job.media_type && job.media_type !== "video" ? [`non_video_output:${job.media_type}`] : []),
    ].filter(Boolean);

    const isHardReject = job.status === "creative_rejected";
    const analysis = isHardReject ? await rootCauseAnalysis(allReasons, passes, job.product_slug) : "";

    const nextPass = passes + (isHardReject ? 1 : 0); // validate already bumps soft-fails
    const meta = (job.meta && typeof job.meta === "object") ? { ...(job.meta as Record<string, unknown>) } : {};
    const regenLog = Array.isArray((meta as any).regen_log) ? (meta as any).regen_log : [];
    regenLog.push({
      at: new Date().toISOString(),
      pass: nextPass,
      cap: maxPasses,
      trigger: isHardReject ? "hard_reject" : "needs_scene_regen",
      reasons: allReasons.slice(0, 8),
      analysis: analysis || undefined,
    });
    (meta as any).regen_log = regenLog.slice(-10);
    (meta as any).last_regen_analysis = analysis || (meta as any).last_regen_analysis;

    // Push the job back to the start of the pipeline so cinematic-ad-prepare
    // rebuilds scenes, cinematic-ad-queue-render queues a fresh render, and
    // cinematic-ad-validate re-runs V6 fidelity on the new output.
    const patch: Record<string, unknown> = {
      status: "pending",
      status_message: isHardReject
        ? `auto-regen pass ${nextPass}/${maxPasses} (hard-reject) — ${analysis ? analysis.slice(0, 140) : "rebuilding"}`
        : `auto-regen pass ${passes}/${maxPasses} — rebuilding failing scenes`,
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
      fidelity_regen_passes: nextPass,
      meta,
    };
    const { error: upErr } = await admin.from("cinematic_ad_jobs").update(patch).eq("id", job.id);
    out.push({
      job_id: job.id,
      product_slug: job.product_slug,
      action: upErr ? "error" : (isHardReject ? "requeued_hard_reject" : "requeued"),
      passes: nextPass,
      cap: maxPasses,
      previous_fidelity_score: job.fidelity_score,
      reasons: allReasons.slice(0, 4),
      analysis: analysis || undefined,
      error: upErr?.message,
    });
  }

  console.log(`[fidelity-auto-regen] ${traceId} processed=${out.length} cap=${maxPasses}`);
  return json(200, { ok: true, traceId, processed: out.length, cap: maxPasses, results: out });
});