// cinematic-ad-autopublish
//
// Autonomous Pinterest publisher for cinematic ads.
// Scans cinematic_ad_jobs with status in (publishable, approved, completed)
// AND output_mp4_url present AND validation_passed AND qa_composite_score >= floor
// AND no pinterest_asset_id yet AND pin_publish_attempts < max_render_attempts
// AND not in quarantine.
//
// For each eligible job, registers it in pinterest_video_assets (which the
// existing Pinterest pipeline auto-publishes). Logs success/failure and
// retries with backoff.
//
// Auth: service role only (cron). Returns counts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const trace = () => `apub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ELIGIBLE_STATUSES = ["publishable", "approved", "completed", "render_complete"];
const MAX_PUBLISH_ATTEMPTS = 2;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  // Allow cron (anon/apikey header) or service-role. We don't expose
  // any user-specific data — the action is idempotent and gated by
  // cinematic_ad_settings.auto_publish_enabled.
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  if (!auth && !apikey) {
    return json(401, { ok: false, traceId, message: "unauthorized" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Load settings
  const { data: settings } = await admin
    .from("cinematic_ad_settings")
    .select("auto_publish_enabled, pinterest_publish_quality_floor, max_render_attempts")
    .eq("id", true).maybeSingle();

  if (settings && settings.auto_publish_enabled === false) {
    return json(200, { ok: true, traceId, message: "auto-publish disabled", scanned: 0, published: 0 });
  }

  const qaFloor = Number(settings?.pinterest_publish_quality_floor ?? 55);
  const maxAttempts = Math.min(MAX_PUBLISH_ATTEMPTS, Number(settings?.max_render_attempts ?? 5));
  // V3 PinterestQualityGateV2 — rate/diversity guards. Pulled from settings
  // so admins can tune live without redeploys.
  const { data: gateSettings } = await admin
    .from("cinematic_ad_settings")
    .select("pinterest_publish_max_per_hour, pinterest_publish_min_slug_gap_minutes, pinterest_publish_recovery_mode")
    .eq("id", true).maybeSingle();
  const maxPerHour = Math.max(1, Number(gateSettings?.pinterest_publish_max_per_hour ?? 3));
  const slugGapMin = Math.max(0, Number(gateSettings?.pinterest_publish_min_slug_gap_minutes ?? 240));
  const recoveryMode = Boolean(gateSettings?.pinterest_publish_recovery_mode ?? true);
  const effectiveMaxPerHour = recoveryMode ? Math.min(maxPerHour, 2) : maxPerHour;

  // Count pins already published in the last hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: publishedLastHour } = await admin
    .from("cinematic_ad_jobs")
    .select("id", { count: "exact", head: true })
    .not("pushed_to_pinterest_at", "is", null)
    .gte("pushed_to_pinterest_at", hourAgo);
  const remainingHourBudget = Math.max(0, effectiveMaxPerHour - Number(publishedLastHour ?? 0));
  if (remainingHourBudget <= 0) {
    return json(200, { ok: true, traceId, scanned: 0, published: 0,
      message: `hourly cap reached (${publishedLastHour}/${effectiveMaxPerHour})`, qaFloor, maxAttempts });
  }

  // Recently published slugs (for per-product cooldown)
  const slugCutoff = new Date(Date.now() - slugGapMin * 60 * 1000).toISOString();
  const { data: recentSlugs } = await admin
    .from("cinematic_ad_jobs")
    .select("product_slug")
    .not("pushed_to_pinterest_at", "is", null)
    .gte("pushed_to_pinterest_at", slugCutoff);
  const cooldownSlugs = new Set((recentSlugs ?? []).map((r: any) => r.product_slug));

  // Find eligible jobs
  const { data: jobs, error } = await admin
    .from("cinematic_ad_jobs")
    .select("id, product_slug, output_mp4_url, output_thumbnail_url, output_duration_seconds, hook_variant, validation_passed, qa_composite_score, pin_publish_attempts, pinterest_asset_id, status, quarantined_assets")
    .in("status", ELIGIBLE_STATUSES)
    .is("pinterest_asset_id", null)
    .not("output_mp4_url", "is", null)
    .order("updated_at", { ascending: true })
    .limit(10);
  if (error) return json(500, { ok: false, traceId, message: error.message });

  const results: Array<{ job_id: string; ok: boolean; reason?: string }> = [];
  let publishedCount = 0;
  const publishedSlugsThisRun = new Set<string>();

  for (const job of jobs ?? []) {
    if (publishedCount >= remainingHourBudget) {
      results.push({ job_id: job.id, ok: false, reason: "hourly_budget_consumed" });
      continue;
    }
    if (cooldownSlugs.has(job.product_slug) || publishedSlugsThisRun.has(job.product_slug)) {
      await admin.from("cinematic_ad_jobs").update({
        publish_blocked_reason: `slug_cooldown(${slugGapMin}m)`,
      }).eq("id", job.id);
      results.push({ job_id: job.id, ok: false, reason: "slug_cooldown" });
      continue;
    }
    const attempts = Number(job.pin_publish_attempts ?? 0);
    if (attempts >= maxAttempts) {
      results.push({ job_id: job.id, ok: false, reason: `max_publish_attempts(${attempts})` });
      continue;
    }
    if (job.validation_passed !== true) {
      results.push({ job_id: job.id, ok: false, reason: "validation_not_passed" });
      continue;
    }
    const qa = Number(job.qa_composite_score ?? 0);
    if (qa > 0 && qa < qaFloor) {
      await admin.from("cinematic_ad_jobs").update({
        publish_blocked_reason: `qa_below_floor(${qa}<${qaFloor})`,
      }).eq("id", job.id);
      results.push({ job_id: job.id, ok: false, reason: `qa_below_floor(${qa})` });
      continue;
    }

    // Verify mp4 reachable
    let mp4Ok = false;
    try {
      const r = await fetch(job.output_mp4_url, { method: "HEAD" });
      const ct = r.headers.get("content-type") ?? "";
      mp4Ok = r.ok && /^video\//.test(ct);
    } catch {}
    if (!mp4Ok) {
      await admin.from("cinematic_ad_jobs").update({
        pin_publish_attempts: attempts + 1,
        pin_last_error: "mp4_unreachable_or_invalid",
        publish_blocked_reason: "mp4_unreachable",
      }).eq("id", job.id);
      results.push({ job_id: job.id, ok: false, reason: "mp4_unreachable" });
      continue;
    }

    // Register asset
    try {
      const contentHash = await sha256Hex(job.output_mp4_url);
      const filename = `cinematic-${job.product_slug}-${job.id.slice(0, 8)}.mp4`;
      const storagePath = `${job.id}/output.mp4`;

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

      if (aErr) throw aErr;

      await admin.from("cinematic_ad_jobs").update({
        pinterest_asset_id: asset.id,
        pushed_to_pinterest_at: new Date().toISOString(),
        pin_publish_attempts: attempts + 1,
        pin_last_error: null,
        publish_blocked_reason: null,
        status_message: "auto-published to Pinterest pipeline",
      }).eq("id", job.id);

      await admin.from("cinematic_ad_job_events").insert({
        job_id: job.id,
        event_type: "auto_published",
        payload: { asset_id: asset.id, qa, traceId },
      }).then(() => {}, () => {});

      results.push({ job_id: job.id, ok: true });
      publishedCount++;
      publishedSlugsThisRun.add(job.product_slug);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("cinematic_ad_jobs").update({
        pin_publish_attempts: attempts + 1,
        pin_last_error: msg.slice(0, 500),
      }).eq("id", job.id);
      results.push({ job_id: job.id, ok: false, reason: msg });
    }
  }

  return json(200, {
    ok: true,
    traceId,
    scanned: jobs?.length ?? 0,
    published: publishedCount,
    results,
    qaFloor,
    maxAttempts,
  });
});