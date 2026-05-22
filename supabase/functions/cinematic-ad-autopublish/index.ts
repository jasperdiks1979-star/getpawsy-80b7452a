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
import { isInWindowEst, nextWindowStartUtc, jitterSeconds, hammingHex } from "../_shared/publish-window.ts";

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
    .select("pinterest_publish_max_per_hour, pinterest_publish_min_slug_gap_minutes, pinterest_publish_recovery_mode, publish_windows_est, publish_jitter_min_seconds, publish_jitter_max_seconds, recovery_auto_exit_days, recovery_tier_progression, hook_cooldown_days, thumbnail_phash_distance_threshold, board_recent_window_minutes, board_max_pins_per_window")
    .eq("id", true).maybeSingle();
  const maxPerHour = Math.max(1, Number(gateSettings?.pinterest_publish_max_per_hour ?? 3));
  const slugGapMin = Math.max(0, Number(gateSettings?.pinterest_publish_min_slug_gap_minutes ?? 240));
  const recoveryMode = Boolean(gateSettings?.pinterest_publish_recovery_mode ?? true);
  const windows = (gateSettings?.publish_windows_est ?? [{start:7,end:9},{start:12,end:14},{start:19,end:23}]) as {start:number,end:number}[];
  const jitterMin = Number(gateSettings?.publish_jitter_min_seconds ?? 420);
  const jitterMax = Number(gateSettings?.publish_jitter_max_seconds ?? 2700);
  const hookCooldownDays = Number(gateSettings?.hook_cooldown_days ?? 7);
  const phashThreshold = Number(gateSettings?.thumbnail_phash_distance_threshold ?? 6);
  const boardWinMin = Number(gateSettings?.board_recent_window_minutes ?? 720);
  const boardMaxPerWin = Number(gateSettings?.board_max_pins_per_window ?? 2);
  const tiers = (gateSettings?.recovery_tier_progression ?? {tier1:2,tier2:3,tier3:4}) as Record<string,number>;

  // ----- V3 Window gate -----
  const now = new Date();
  if (!isInWindowEst(now, windows)) {
    const next = nextWindowStartUtc(now, windows);
    const jitter = jitterSeconds(jitterMin, jitterMax);
    const scheduledAt = new Date(next.getTime() + jitter * 1000).toISOString();
    return json(200, { ok: true, traceId, scanned: 0, published: 0, skipped: "outside_publish_window", next_window_at: scheduledAt });
  }

  // ----- V3 Recovery tier ladder -----
  // Clean-streak: days since last QA failure or duplicate violation.
  const exitDays = Number(gateSettings?.recovery_auto_exit_days ?? 7);
  const sinceCutoff = new Date(Date.now() - exitDays * 86400000).toISOString();
  const { count: recentViolations } = await admin
    .from("cinematic_ad_jobs").select("id", { count: "exact", head: true })
    .gte("updated_at", sinceCutoff)
    .or("publish_blocked_reason.ilike.qa_below_floor%,publish_blocked_reason.ilike.duplicate%,publish_blocked_reason.ilike.phash%");
  const cleanStreak = (recentViolations ?? 0) === 0;
  let tierCap = tiers.tier1 ?? 2;
  if (cleanStreak) tierCap = tiers.tier3 ?? 4;
  if (recoveryMode && !cleanStreak) tierCap = tiers.tier1 ?? 2;
  // Auto-exit recovery after clean streak
  if (recoveryMode && cleanStreak) {
    await admin.from("cinematic_ad_settings").update({ pinterest_publish_recovery_mode: false }).eq("id", true);
  }
  const effectiveMaxPerHour = Math.min(maxPerHour, tierCap);

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

  // ----- V3 Hook cooldown -----
  const hookCutoff = new Date(Date.now() - hookCooldownDays * 86400000).toISOString();
  const { data: recentHooks } = await admin
    .from("cinematic_ad_jobs").select("hook_archetype")
    .not("pushed_to_pinterest_at", "is", null)
    .gte("pushed_to_pinterest_at", hookCutoff)
    .not("hook_archetype", "is", null);
  const cooldownHooks = new Set((recentHooks ?? []).map((r: any) => r.hook_archetype));

  // ----- V3 Perceptual dedupe pool -----
  const { data: recentHashes } = await admin
    .from("cinematic_ad_jobs")
    .select("thumbnail_phash, first3s_phash, overlay_text_hash")
    .not("pushed_to_pinterest_at", "is", null)
    .order("pushed_to_pinterest_at", { ascending: false })
    .limit(100);
  const recentThumbs = (recentHashes ?? []).map((r: any) => r.thumbnail_phash).filter(Boolean);
  const recentFirst3 = (recentHashes ?? []).map((r: any) => r.first3s_phash).filter(Boolean);
  const recentOverlays = new Set((recentHashes ?? []).map((r: any) => r.overlay_text_hash).filter(Boolean));

  // ----- V3 Quarantine patterns -----
  const { data: quarantines } = await admin
    .from("cinematic_quarantine_patterns")
    .select("pattern_type, pattern_value")
    .gt("quarantined_until", new Date().toISOString());
  const qHooks = new Set((quarantines ?? []).filter((q: any) => q.pattern_type === "hook").map((q: any) => q.pattern_value));
  const qThumbs = (quarantines ?? []).filter((q: any) => q.pattern_type === "thumbnail_phash").map((q: any) => q.pattern_value);
  const qOverlays = new Set((quarantines ?? []).filter((q: any) => q.pattern_type === "overlay_text").map((q: any) => q.pattern_value));

  // Find eligible jobs
  const { data: jobs, error } = await admin
    .from("cinematic_ad_jobs")
    .select("id, product_slug, output_mp4_url, output_thumbnail_url, output_duration_seconds, hook_variant, hook_archetype, thumbnail_phash, first3s_phash, overlay_text_hash, validation_passed, qa_composite_score, pin_publish_attempts, pinterest_asset_id, status, quarantined_assets")
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
    // V3 hook cooldown
    if (job.hook_archetype && cooldownHooks.has(job.hook_archetype)) {
      await admin.from("cinematic_ad_jobs").update({ publish_blocked_reason: `hook_cooldown(${hookCooldownDays}d)` }).eq("id", job.id);
      results.push({ job_id: job.id, ok: false, reason: "hook_cooldown" });
      continue;
    }
    // V3 quarantine match
    if (job.hook_archetype && qHooks.has(job.hook_archetype)) {
      results.push({ job_id: job.id, ok: false, reason: "quarantined_hook" }); continue;
    }
    if (job.overlay_text_hash && qOverlays.has(job.overlay_text_hash)) {
      results.push({ job_id: job.id, ok: false, reason: "quarantined_overlay" }); continue;
    }
    // V3 perceptual thumbnail dedupe
    if (job.thumbnail_phash) {
      const nearDup = recentThumbs.find((h: string) => hammingHex(h, job.thumbnail_phash) <= phashThreshold);
      const quarDup = qThumbs.find((h: string) => hammingHex(h, job.thumbnail_phash) <= phashThreshold);
      if (nearDup || quarDup) {
        await admin.from("cinematic_ad_jobs").update({ publish_blocked_reason: `phash_near_duplicate(${phashThreshold})` }).eq("id", job.id);
        results.push({ job_id: job.id, ok: false, reason: "phash_near_duplicate" });
        continue;
      }
    }
    // V3 first-3s dedupe
    if (job.first3s_phash) {
      const dup = recentFirst3.find((h: string) => hammingHex(h, job.first3s_phash) <= 4);
      if (dup) {
        await admin.from("cinematic_ad_jobs").update({ publish_blocked_reason: "first3s_duplicate" }).eq("id", job.id);
        results.push({ job_id: job.id, ok: false, reason: "first3s_duplicate" });
        continue;
      }
    }
    // V3 overlay text dedupe (exact)
    if (job.overlay_text_hash && recentOverlays.has(job.overlay_text_hash)) {
      await admin.from("cinematic_ad_jobs").update({ publish_blocked_reason: "overlay_text_reused" }).eq("id", job.id);
      results.push({ job_id: job.id, ok: false, reason: "overlay_text_reused" });
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
      if (job.hook_archetype) cooldownHooks.add(job.hook_archetype);
      if (job.thumbnail_phash) recentThumbs.unshift(job.thumbnail_phash);
      if (job.first3s_phash) recentFirst3.unshift(job.first3s_phash);
      if (job.overlay_text_hash) recentOverlays.add(job.overlay_text_hash);
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
    tier_cap: tierCap,
    recovery_mode: recoveryMode,
    clean_streak: cleanStreak,
    window_active: true,
  });
});