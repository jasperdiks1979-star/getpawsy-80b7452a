// cinematic-ad-validate — runs after worker reports completion.
// Pulls the row, evaluates the rendered MP4 against the preset's contract
// (aspect ratio, duration, motion score, file size), writes validation_report.
// Two ways to invoke:
//   1) Internal call from cinematic-ad-render-webhook (x-render-secret).
//   2) Admin-triggered re-validate (Bearer token + admin role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getPreset } from "../_shared/cinematic-presets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const trace = () => crypto.randomUUID().slice(0, 8);
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

interface ValidationCheck { name: string; passed: boolean; observed: unknown; expected: unknown; message?: string }
interface ValidationReport {
  passed: boolean;
  checks: ValidationCheck[];
  motion_score: number | null;
  validated_at: string;
  preset: string;
}

function evaluate(job: any): ValidationReport {
  const preset = getPreset(job.preset);
  const checks: ValidationCheck[] = [];

  // 1) Output exists
  checks.push({
    name: "mp4_present",
    passed: typeof job.output_mp4_url === "string" && job.output_mp4_url.length > 0,
    observed: job.output_mp4_url ? "present" : "missing",
    expected: "present",
  });

  // 2) Aspect ratio (worker reports output_width / output_height)
  const w = Number(job.output_width ?? 0);
  const h = Number(job.output_height ?? 0);
  const dimsOk = w === preset.width && h === preset.height;
  checks.push({
    name: "aspect_ratio_9_16",
    passed: dimsOk,
    observed: `${w}x${h}`,
    expected: `${preset.width}x${preset.height}`,
    message: dimsOk ? undefined : "Render dimensions do not match preset. Re-render with viral-vertical composition.",
  });

  // 3) Duration ±1s of preset
  const dur = Number(job.output_duration_seconds ?? 0);
  const durOk = Math.abs(dur - preset.durationSec) <= 1.0;
  checks.push({
    name: "duration_within_tolerance",
    passed: durOk,
    observed: `${dur.toFixed(2)}s`,
    expected: `${preset.durationSec}s ±1s`,
  });

  // 4) Motion score (worker computes via ffmpeg select=gt(scene,0))
  const motion = job.motion_score != null ? Number(job.motion_score) : null;
  const motionOk = motion != null && motion >= preset.motionScoreFloor;
  checks.push({
    name: "motion_score_above_floor",
    passed: motionOk,
    observed: motion ?? "null",
    expected: `>= ${preset.motionScoreFloor}`,
    message: motionOk ? undefined : "Render scored too static — likely a slideshow. Force MotionGenerator or supply more media.",
  });

  // 5) No black bars (worker reports has_black_bars)
  const blackBars = job.output_black_bars === true;
  checks.push({
    name: "no_black_bars",
    passed: !blackBars,
    observed: blackBars ? "detected" : "none",
    expected: "none",
  });

  // 6) Reasonable file size (5 MB .. 60 MB for 18–22s 1080x1920)
  const sz = Number(job.output_file_size_bytes ?? 0);
  const sizeOk = sz > 5 * 1024 * 1024 && sz < 60 * 1024 * 1024;
  checks.push({
    name: "file_size_sane",
    passed: sizeOk,
    observed: `${(sz / 1024 / 1024).toFixed(2)} MB`,
    expected: "5–60 MB",
  });

  const passed = checks.every(c => c.passed);
  return {
    passed,
    checks,
    motion_score: motion,
    validated_at: new Date().toISOString(),
    preset: preset.id,
  };
}

async function authorize(req: Request, admin: any): Promise<{ ok: true; mode: "worker" | "admin" } | { ok: false; status: number; message: string }> {
  const workerSecret = req.headers.get("x-render-secret");
  if (workerSecret && RENDER_WORKER_SECRET && workerSecret === RENDER_WORKER_SECRET) {
    return { ok: true, mode: "worker" };
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return { ok: false, status: 401, message: "unauthenticated" };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u, error } = await userClient.auth.getUser();
  if (error || !u.user) return { ok: false, status: 401, message: "unauthenticated" };
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!role) return { ok: false, status: 403, message: "admin role required" };
  return { ok: true, mode: "admin" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const auth = await authorize(req, admin);
    if (!auth.ok) return json({ ok: false, traceId, message: auth.message }, auth.status);

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);

    const { data: job, error } = await admin.from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error || !job) return json({ ok: false, traceId, message: "job not found" }, 404);

    const report = evaluate(job);

    const patch: Record<string, unknown> = {
      validation_report: report,
      motion_score: report.motion_score,
      validation_passed: report.passed,
      captions_visible: Boolean(job.hook_text || job.pin_title || job.cta_text || job.vo_script),
      duration_valid: report.checks.find((c) => c.name === "duration_within_tolerance")?.passed ?? false,
      motion_exists: report.checks.find((c) => c.name === "motion_score_above_floor")?.passed ?? (Number(report.motion_score ?? 0) > 0),
      video_corrupted: !report.checks.find((c) => c.name === "mp4_present")?.passed,
      pipeline_stage: report.passed ? "qa_passed" : "qa_needs_review",
    };
    // Don't auto-flip status; the webhook owns lifecycle. But surface failure
    // in status_message so the dashboard reflects it.
    if (!report.passed) {
      patch.status_message = `validation failed (${report.checks.filter(c => !c.passed).map(c => c.name).join(", ")})`;
    } else {
      patch.status_message = "validation passed — awaiting approval";
    }

    const { error: updErr } = await admin.from("cinematic_ad_jobs").update(patch).eq("id", jobId);
    if (updErr) return json({ ok: false, traceId, message: updErr.message }, 500);

    console.log(`[validate] ${traceId} job=${jobId} passed=${report.passed} motion=${report.motion_score}`);
    return json({ ok: true, traceId, report });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});