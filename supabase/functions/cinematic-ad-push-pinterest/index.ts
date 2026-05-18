/**
 * cinematic-ad-push-pinterest
 *
 * Admin-only. Registers a finished cinematic_ad_jobs MP4 into
 * `pinterest_video_assets` so the existing Pinterest video publisher
 * pipeline picks it up.
 *
 * POST body: { job_id: string }
 * Response: { ok, traceId, asset_id }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const trace = () => `cap_push_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { ok: false, traceId, message: "unauthorized" });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: roleRow } = await admin
    .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return json(403, { ok: false, traceId, message: "admin role required" });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const jobId = body.job_id;
  const force = body.force === true;
  if (!jobId) return json(400, { ok: false, traceId, message: "job_id required" });

  const { data: job, error: jobErr } = await admin
    .from("cinematic_ad_jobs").select("*").eq("id", jobId).single();
  if (jobErr || !job) return json(404, { ok: false, traceId, message: "job not found" });
  if (!job.output_mp4_url) return json(400, { ok: false, traceId, message: "job has no output_mp4_url yet" });

  // Pre-publish quality gate. force=true lets admin override (logged below).
  if (!force) {
    const report = job.validation_report as { passed?: boolean } | null;
    const extraChecks: Array<{ name: string; passed: boolean; observed: unknown }> = [];

    // 1. Validator must have passed
    extraChecks.push({ name: "validator_passed", passed: !!report?.passed, observed: report?.passed ?? null });

    // 2. Voiceover present
    extraChecks.push({ name: "voiceover_present", passed: !!job.vo_url, observed: job.vo_url ?? null });

    // 3. Duration in spec
    const dur = Number(job.output_duration_seconds ?? 0);
    extraChecks.push({ name: "duration_in_range_12_25s", passed: dur >= 12 && dur <= 25, observed: dur });

    // 4. MP4 URL responds with video/*
    let mp4Ok = false;
    let mp4ContentType: string | null = null;
    try {
      const r = await fetch(job.output_mp4_url, { method: "HEAD" });
      mp4ContentType = r.headers.get("content-type");
      mp4Ok = r.ok && !!mp4ContentType && /^video\//.test(mp4ContentType);
    } catch {}
    extraChecks.push({ name: "mp4_public_url_video", passed: mp4Ok, observed: mp4ContentType ?? "unreachable" });

    // 5. Pin copy present
    extraChecks.push({ name: "pin_copy_present", passed: !!job.pin_title && !!job.pin_description, observed: { title: !!job.pin_title, description: !!job.pin_description } });

    const failed = extraChecks.filter((c) => !c.passed);
    if (failed.length > 0) {
      return json(412, { ok: false, traceId, message: "pre-publish quality gate failed", failed_checks: failed });
    }
  }

  // Stamp approval (admin who pushed).
  await admin.from("cinematic_ad_jobs").update({
    approved_at: new Date().toISOString(),
    approved_by: userData.user.id,
    status_message: force ? "force-pushed by admin" : "approved by admin — pushing to Pinterest",
  }).eq("id", jobId);

  const filename = `cinematic-${job.product_slug}-${jobId.slice(0, 8)}.mp4`;
  const storagePath = `${jobId}/output.mp4`;
  const contentHash = await sha256Hex(job.output_mp4_url);

  const { data: asset, error: aErr } = await admin
    .from("pinterest_video_assets")
    .upsert({
      filename,
      storage_bucket: "cinematic-ads",
      storage_path: storagePath,
      public_url: job.output_mp4_url,
      thumbnail_url: job.output_thumbnail_url ?? null,
      duration_seconds: job.output_duration_seconds ?? null,
      aspect_ratio: "9:16",
      mime_type: "video/mp4",
      hook_type: job.hook_variant ?? "default",
      product_slug: job.product_slug,
      content_hash: contentHash,
      country_target: "US",
      language_target: "en-US",
      detected_platform: "cinematic-ads",
      is_active: true,
    }, { onConflict: "content_hash" })
    .select("id")
    .single();

  if (aErr) return json(500, { ok: false, traceId, message: aErr.message });

  await admin.from("cinematic_ad_jobs").update({
    pinterest_asset_id: asset.id,
    pushed_to_pinterest_at: new Date().toISOString(),
    status_message: "pushed to Pinterest publisher",
  }).eq("id", jobId);

  return json(200, { ok: true, traceId, asset_id: asset.id });
});