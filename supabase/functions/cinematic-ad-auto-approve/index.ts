/**
 * cinematic-ad-auto-approve
 *
 * Self-heal approval engine. Walks jobs in `awaiting_approval` /
 * `needs_admin_review` / `prepared` and decides — based on QA score,
 * duplicate risk, retry history, asset count, recent ffmpeg failures
 * and product source — whether to:
 *   • auto_approve → transition to `render_queued`
 *   • leave alone (manual review required)
 *
 * Tracks metrics in cinematic_ad_job_events. Safe to call from cron,
 * watchdog and admin UI.
 *
 * Auth: admin JWT OR service role (for cron). No anon access.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const trace = () => `aa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

type Job = Record<string, any>;

interface Settings {
  auto_approve_enabled: boolean;
  approval_confidence_threshold: number;
  max_duplicate_threshold: number;
  max_retry_threshold: number;
  min_unique_media_assets: number;
}

const DEFAULT_SETTINGS: Settings = {
  auto_approve_enabled: true,
  approval_confidence_threshold: 55,
  max_duplicate_threshold: 85,
  max_retry_threshold: 3,
  min_unique_media_assets: 2,
};

const REVIEWABLE_STATUSES = ["awaiting_approval", "needs_admin_review", "prepared", "queued", "render_complete", "completed", "approved", "publishable"];
const HARD_BLOCK_REASONS = new Set(["corrupted_media", "missing_assets", "pinterest_policy_risk", "wrong_link", "out_of_stock"]);

function uniqueMediaCount(job: Job): number {
  const assets = Array.isArray(job.scene_assets) ? job.scene_assets : [];
  const urls = new Set<string>();
  for (const a of assets) {
    const u = a?.url ?? a?.image_url ?? a?.video_url ?? a?.asset_url;
    if (typeof u === "string" && u.length > 0) urls.add(u);
  }
  return urls.size;
}

function duplicateRisk(job: Job): number {
  // QA report may carry duplicate_score from intelligence pipeline.
  const r = job.qa_report ?? {};
  return Number(job.duplicate_risk_score ?? r.duplicate_score ?? r.duplicate_risk ?? 0) || 0;
}

function categoryThreshold(job: Job, base: number): number {
  const hay = `${job.product_slug ?? ""} ${job.product_name ?? ""} ${job.product_category ?? ""}`.toLowerCase();
  if (/litter|cat tree|carrier|stroller/.test(hay)) return Math.max(50, base - 5);
  if (/supplement|medical|health|collar/.test(hay)) return Math.min(70, base + 10);
  return base;
}

function validationPassed(job: Job): boolean {
  const report = job.validation_report ?? {};
  return job.validation_passed === true || report.passed === true;
}

function safeRenderSignals(job: Job): { ok: boolean; reasons: string[]; blocks: string[] } {
  const reasons: string[] = [];
  const blocks: string[] = [];
  const dur = Number(job.output_duration_seconds ?? 0);
  const motion = Number(job.motion_score ?? 0);
  const captionsVisible = job.captions_visible === true || Boolean(job.hook_text || job.pin_title || job.cta_text);
  const durationValid = job.duration_valid === true || (dur >= 8 && dur <= 35);
  const motionExists = job.motion_exists === true || motion > 0 || Boolean(job.output_mp4_url);

  if (!job.output_mp4_url) blocks.push("mp4_missing"); else reasons.push("mp4_present");
  if (job.video_corrupted === true) blocks.push("video_corrupted"); else reasons.push("not_corrupted");
  if (!captionsVisible) blocks.push("captions_not_visible"); else reasons.push("captions_visible");
  if (!durationValid) blocks.push(`duration_invalid(${dur || "unknown"})`); else reasons.push("duration_valid");
  if (!motionExists) blocks.push("zero_motion"); else reasons.push("motion_exists");
  if (job.output_mp4_url && !validationPassed(job)) blocks.push("validation_not_passed");

  // V7 strict Pinterest-grade gate: never auto-approve a video that's just
  // a generated still with zoom/pan, has missing shots, unsafe text, or a
  // composite pinterest_quality_score at/below 90.
  if (job.output_mp4_url) {
    if (job.validation_v7_passed === false) {
      const reasons = Array.isArray(job.v7_reject_reasons) ? job.v7_reject_reasons.slice(0, 3).join("|") : "v7_failed";
      blocks.push(`v7_reject:${reasons}`);
    }
    const pq = Number(job.pinterest_quality_score ?? 0);
    if (pq > 0 && pq <= 90) blocks.push(`pinterest_quality(${pq}<=90)`);
  }
  return { ok: blocks.length === 0, reasons, blocks };
}

function isTrustedProductSource(job: Job): boolean {
  // We treat any job that has product_lock (curated, immutable product
  // snapshot at prepare-time) as trusted source.
  return Boolean(job.product_lock && Object.keys(job.product_lock).length > 0);
}

function safeTemplate(job: Job): boolean {
  const preset = String(job.preset ?? "");
  return preset.length > 0 && !preset.includes("experimental");
}

async function recentFfmpegFailures(admin: ReturnType<typeof createClient>): Promise<number> {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("cinematic_ad_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .eq("failure_category", "ffmpeg_error")
    .gte("updated_at", since);
  return count ?? 0;
}

function evaluate(job: Job, settings: Settings, recentFfmpegFails: number): {
  approve: boolean;
  confidence: number;
  reason: string;
  blocked_reason?: string;
} {
  const reasons: string[] = [];
  const blocks: string[] = [];

  const safeSignals = safeRenderSignals(job);
  reasons.push(...safeSignals.reasons);
  blocks.push(...safeSignals.blocks);

  const threshold = categoryThreshold(job, settings.approval_confidence_threshold);
  const qa = Number(job.qa_score ?? (safeSignals.ok ? threshold : 0));
  if (qa < threshold) {
    blocks.push(`qa_below_adaptive_threshold(${qa}<${threshold})`);
  } else {
    reasons.push(`qa_ok(${qa})`);
  }

  const dup = duplicateRisk(job);
  const exactDuplicate = dup >= 98 || Boolean(job.qa_report?.exact_repeated_timeline);
  if (exactDuplicate) {
    blocks.push(`exact_duplicate(${dup})`);
  } else {
    reasons.push(`duplicate_tolerated(${dup}/${settings.max_duplicate_threshold})`);
  }

  const retries = Number(job.render_attempts ?? 0) + Number(job.smart_retry_count ?? 0);
  if (retries > settings.max_retry_threshold) {
    blocks.push(`retry_loop(${retries}>${settings.max_retry_threshold})`);
  } else {
    reasons.push(`retries_ok(${retries})`);
  }

  const assets = uniqueMediaCount(job);
  if (!job.output_mp4_url && assets < settings.min_unique_media_assets) {
    blocks.push(`assets_insufficient(${assets}<${settings.min_unique_media_assets})`);
  } else {
    reasons.push(`assets_ok(${assets})`);
  }

  if (recentFfmpegFails >= 8 && !job.output_mp4_url) blocks.push(`recent_ffmpeg_failures(${recentFfmpegFails})`);

  if (!job.output_mp4_url && !isTrustedProductSource(job)) blocks.push("untrusted_product_source");
  if (!safeTemplate(job)) blocks.push("unsafe_template");

  const adminReason = String(job.admin_review_reason ?? "").toLowerCase();
  for (const tag of HARD_BLOCK_REASONS) {
    if (adminReason.includes(tag)) blocks.push(`hard_block:${tag}`);
  }

  const passed = reasons.length;
  const failed = blocks.length;
  const total = passed + failed || 1;
  const confidence = Math.round((passed / total) * 100);

  if (blocks.length === 0) {
    return { approve: true, confidence, reason: reasons.join("; ") };
  }
  return { approve: false, confidence, reason: reasons.join("; "), blocked_reason: blocks.join("; ") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  // Auth: admin OR service role (cron passes service role as bearer).
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceCall = authHeader.includes(SERVICE_KEY);
  let actor = "service";
  if (!isServiceCall) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: u, error } = await userClient.auth.getUser();
    if (error || !u?.user) return json(401, { ok: false, traceId, message: "unauthorized" });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { ok: false, traceId, message: "admin role required" });
    actor = u.user.id;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Load settings (singleton row, id=true)
  const { data: settingsRow } = await admin
    .from("cinematic_ad_settings").select("*").eq("id", true).maybeSingle();
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(settingsRow ?? {}) } as Settings;

  if (!settings.auto_approve_enabled) {
    return json(200, { ok: true, traceId, message: "auto-approval disabled", scanned: 0, auto_approved: 0, manual_review: 0 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const limit = Math.max(1, Math.min(50, Number(body.limit ?? 20)));
  const explicitJobId: string | null = body.job_id ?? null;

  const query = admin
    .from("cinematic_ad_jobs")
    .select("*")
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (explicitJobId) query.eq("id", explicitJobId);
  else query.in("status", REVIEWABLE_STATUSES);

  const { data: jobs, error: listErr } = await query;
  if (listErr) return json(500, { ok: false, traceId, message: listErr.message });

  const recentFfmpegFails = await recentFfmpegFailures(admin);

  let autoApproved = 0;
  let manualReview = 0;
  const results: any[] = [];

  for (const job of jobs ?? []) {
    const verdict = evaluate(job as Job, settings, recentFfmpegFails);
    const thresholdApplied = categoryThreshold(job as Job, settings.approval_confidence_threshold);
    const qaScoreNum = Number(job.qa_score ?? 0);
    // Permanent fix: persist the boolean qa_passed alongside the existing
    // qa_decision_reason / qa_threshold_applied writes so the DB trigger
    // `cinematic_ad_jobs_compute_safe_to_publish` can flip is_safe_to_publish.
    const qaPassed = Number.isFinite(qaScoreNum) && qaScoreNum >= thresholdApplied;
    if (verdict.approve) {
      const completed = Boolean(job.output_mp4_url) || ["render_complete", "completed", "approved", "publishable"].includes(String(job.status));
      const { error: updErr } = await admin
        .from("cinematic_ad_jobs")
        .update({
          status: completed ? "publishable" : "render_queued",
          approved_at: new Date().toISOString(),
          approved_for_render: true,
          auto_approved_at: new Date().toISOString(),
          auto_approval_reason: verdict.reason,
          approval_confidence: verdict.confidence,
          approval_source: isServiceCall ? "autopilot" : "admin_manual",
          needs_admin_review: false,
          qa_threshold_applied: thresholdApplied,
          qa_passed: qaPassed,
          qa_decision_reason: verdict.reason,
          pipeline_stage: completed ? "approved" : "approved_for_render",
          render_queued_at: completed ? job.render_queued_at : (job.render_queued_at ?? new Date().toISOString()),
          status_message: completed ? "auto-approved for Pinterest publish" : "auto-approved for render",
        })
        .eq("id", job.id)
        .in("status", REVIEWABLE_STATUSES);
      if (!updErr) {
        autoApproved++;
        results.push({ id: job.id, action: "auto_approved", confidence: verdict.confidence, reason: verdict.reason });
        await admin.from("cinematic_ad_job_events").insert({
          job_id: job.id,
          event_type: "auto_approved",
          payload: { confidence: verdict.confidence, reason: verdict.reason, actor },
        }).then(() => {}, () => {});
      } else {
        results.push({ id: job.id, action: "update_failed", error: updErr.message });
      }
    } else {
      manualReview++;
      await admin
        .from("cinematic_ad_jobs")
        .update({
          auto_approval_blocked_reason: verdict.blocked_reason ?? "unknown",
          approval_confidence: verdict.confidence,
          qa_threshold_applied: thresholdApplied,
          qa_passed: qaPassed,
        })
        .eq("id", job.id);
      results.push({ id: job.id, action: "manual_review", confidence: verdict.confidence, blocked: verdict.blocked_reason });
    }
  }

  return json(200, {
    ok: true,
    traceId,
    scanned: jobs?.length ?? 0,
    auto_approved: autoApproved,
    manual_review: manualReview,
    settings,
    results,
  });
});