import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_SMART_RETRIES = 3;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Job = Record<string, any>;

type Classification = {
  failure_category: string;
  root_cause: string;
  recommended_fix: string;
  classification_confidence: number;
  recoverable: boolean;
  risk_level: "low" | "medium" | "high";
  expected_impact: string;
};

function classify(job: Job): Classification {
  const msg = `${job.error_message ?? ""} ${job.status_message ?? ""} ${job.pinterest_publish_error ?? ""}`.toLowerCase();
  const log = JSON.stringify(job.render_log ?? []).toLowerCase();
  const text = `${msg} ${log}`;

  const has = (...needles: string[]) => needles.some((n) => text.includes(n));

  if (has("duplicate", "too similar", "scene similarity", "phash")) {
    return {
      failure_category: "duplicate_scene",
      root_cause: "Scenes were rejected as too similar to a previously rendered job.",
      recommended_fix: "Mutate scene order, crops and captions, then retry.",
      classification_confidence: 88,
      recoverable: true,
      risk_level: "low",
      expected_impact: "Unlocks one new high-priority creative for Pinterest.",
    };
  }
  if (has("missing asset", "not found", "no such file", "404", "asset_url", "scene_assets") && has("missing", "empty", "null", "undefined", "404")) {
    return {
      failure_category: "missing_asset",
      root_cause: "One or more scene assets could not be fetched at render time.",
      recommended_fix: "Regenerate or replace missing assets before retrying.",
      classification_confidence: 80,
      recoverable: true,
      risk_level: "medium",
      expected_impact: "Restores creative for an in-demand product.",
    };
  }
  if (has("ffmpeg", "encoder", "moov atom", "broken pipe", "codec")) {
    return {
      failure_category: "ffmpeg_error",
      root_cause: "ffmpeg encoding pipeline failed during render.",
      recommended_fix: "Retry with fallback render preset (lower bitrate / safer codec).",
      classification_confidence: 82,
      recoverable: true,
      risk_level: "medium",
      expected_impact: "Recovers a render slot without manual intervention.",
    };
  }
  if (has("timeout", "timed out", "deadline", "exceeded 90", "took too long")) {
    return {
      failure_category: "timeout",
      root_cause: "Render exceeded the worker time budget.",
      recommended_fix: "Retry with a lower-complexity preset (shorter, fewer scenes).",
      classification_confidence: 85,
      recoverable: true,
      risk_level: "medium",
      expected_impact: "Frees the queue without blocking other jobs.",
    };
  }
  if (has("dispatch", "github", "workflow_dispatch", "actions api")) {
    return {
      failure_category: "github_dispatch",
      root_cause: "GitHub Actions dispatch failed (auth, quota or workflow error).",
      recommended_fix: "Re-dispatch the worker job; check GH token scopes if it recurs.",
      classification_confidence: 70,
      recoverable: true,
      risk_level: "low",
      expected_impact: "Resumes the render pipeline.",
    };
  }
  if (has("pinterest", "pin api", "5xx pinterest", "media upload failed")) {
    return {
      failure_category: "pinterest_publish",
      root_cause: "Pinterest publish step rejected the upload or pin creation.",
      recommended_fix: "Re-queue Pinterest publish after token + board check.",
      classification_confidence: 78,
      recoverable: true,
      risk_level: "medium",
      expected_impact: "Pushes finished creative to live traffic source.",
    };
  }
  if (has("validation", "invalid preset", "aspect", "motion score", "black bars")) {
    return {
      failure_category: "validation_failed",
      root_cause: "Post-render validation caught a quality or format issue.",
      recommended_fix: "Rerender with a corrected preset and stricter motion floor.",
      classification_confidence: 80,
      recoverable: true,
      risk_level: "medium",
      expected_impact: "Ensures only spec-compliant videos go live.",
    };
  }
  if (has("billing", "payment required", "401 stripe")) {
    return {
      failure_category: "billing",
      root_cause: "A paid upstream service rejected the call (billing).",
      recommended_fix: "Resolve billing on the relevant provider before retrying.",
      classification_confidence: 90,
      recoverable: false,
      risk_level: "high",
      expected_impact: "Blocks all renders until resolved.",
    };
  }
  if (has("quota", "rate limit", "429", "too many requests")) {
    return {
      failure_category: "quota",
      root_cause: "Upstream API rate limit or quota was exhausted.",
      recommended_fix: "Retry later with backoff; consider lower concurrency.",
      classification_confidence: 85,
      recoverable: true,
      risk_level: "medium",
      expected_impact: "Restores throughput once window resets.",
    };
  }
  return {
    failure_category: "unknown",
    root_cause: "Failure did not match any known signature.",
    recommended_fix: "Open the job, inspect logs and decide manually.",
    classification_confidence: 30,
    recoverable: false,
    risk_level: "high",
    expected_impact: "Needs admin review.",
  };
}

function entropyMutateScenes(scenes: any): { scenes: any; mutations: string[] } {
  const mutations: string[] = [];
  if (!Array.isArray(scenes) || scenes.length === 0) return { scenes, mutations };
  // Reverse + bump crop/zoom/pan tokens to diversify
  const out = [...scenes].reverse().map((s, i) => {
    const next = { ...s };
    next.crop_seed = (s?.crop_seed ?? 0) + 7 + i;
    next.zoom = Math.min(1.25, Math.max(1.0, (s?.zoom ?? 1.05) + 0.04 * ((i % 3) - 1)));
    next.pan = ["left", "right", "up", "down"][(i + Date.now()) % 4];
    next.scene_order = i;
    next.caption_variant = ((s?.caption_variant ?? 0) + 1) % 4;
    next.transition = ["cut", "fade", "wipe", "zoom"][(i + 2) % 4];
    return next;
  });
  mutations.push("reversed_order", "crop_seed_bumped", "zoom_jitter", "pan_rotated", "caption_variant_advanced", "transition_rotated");
  return { scenes: out, mutations };
}

function computePriority(job: Job, extra: { opportunity?: number; pinterest?: number; tiktok?: number; margin?: number; imageQuality?: number; pastPerformance?: number }): number {
  // Weighted blend, all 0-100
  const w = {
    opportunity: 0.30,
    pinterest: 0.20,
    tiktok: 0.15,
    margin: 0.10,
    imageQuality: 0.10,
    pastPerformance: 0.15,
  };
  const v = {
    opportunity: clamp(extra.opportunity ?? 50),
    pinterest: clamp(extra.pinterest ?? 50),
    tiktok: clamp(extra.tiktok ?? 40),
    margin: clamp(extra.margin ?? 50),
    imageQuality: clamp(extra.imageQuality ?? 60),
    pastPerformance: clamp(extra.pastPerformance ?? 50),
  };
  let score = 0;
  for (const k of Object.keys(w) as (keyof typeof w)[]) score += v[k] * w[k];
  // Small bonus if job already approved
  if (job.approved_for_render) score += 3;
  return Math.round(clamp(score));
}

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function scoreQa(job: Job): { qa_score: number; qa_report: Record<string, number | string> } {
  const v = job.validation_report ?? {};
  const dur = Number(job.output_duration_seconds ?? 0);
  const width = Number(job.output_width ?? 0);
  const height = Number(job.output_height ?? 0);
  const motion = Number(job.motion_score ?? 0);
  const blackBars = Boolean(job.output_black_bars);
  const aspectOk = width > 0 && height > 0 && Math.abs(width / height - 9 / 16) < 0.05;

  const report: Record<string, number> = {
    hook_strength: job.hook_text ? 80 : 50,
    product_visibility: job.product_id ? 80 : 60,
    visual_uniqueness: 70,
    cta_clarity: job.cta_text ? 80 : 50,
    mobile_readability: aspectOk ? 85 : 55,
    pacing: dur > 6 && dur < 35 ? 85 : 55,
    aspect_ratio: aspectOk ? 100 : 30,
    motion_score: clamp(motion * 100 || 60),
    thumbnail_quality: job.output_thumbnail_url ? 80 : 40,
    brand_safety: 90,
  };
  if (blackBars) report.aspect_ratio = Math.min(report.aspect_ratio, 40);
  if (v?.errors && Array.isArray(v.errors) && v.errors.length > 0) {
    report.brand_safety = Math.min(report.brand_safety, 50);
  }

  const total = Math.round(
    Object.values(report).reduce((a, b) => a + Number(b), 0) / Object.keys(report).length,
  );
  return { qa_score: total, qa_report: report };
}

async function logEvent(admin: any, jobId: string, payload: Record<string, any>) {
  try {
    await admin.from("cinematic_ad_job_events").insert({
      job_id: jobId,
      event_type: payload.event_type ?? "intelligence",
      action_taken: payload.action_taken ?? null,
      previous_status: payload.previous_status ?? null,
      new_status: payload.new_status ?? null,
      trace_id: payload.trace_id ?? null,
      error_message: payload.error_message ?? null,
      recovery_result: payload.recovery_result ?? null,
      payload: payload.payload ?? {},
    });
  } catch (e) {
    console.warn("[intelligence] event log failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, traceId, message: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "summary");

    if (action === "summary") {
      const [{ data: breakdown }, { data: queue }, { data: review }, { data: completed }] = await Promise.all([
        admin.from("cinematic_ad_failure_breakdown").select("*"),
        admin.from("cinematic_ad_jobs")
          .select("id,product_slug,product_name,render_priority_score,render_queued_at,created_at,preset")
          .eq("status", "render_queued")
          .order("render_priority_score", { ascending: false, nullsFirst: false })
          .order("render_queued_at", { ascending: true })
          .limit(25),
        admin.from("cinematic_ad_jobs")
          .select("id,product_slug,product_name,status,failure_category,root_cause,recommended_fix,recoverable,risk_level,expected_impact,admin_review_reason,smart_retry_count,qa_score,error_message,updated_at")
          .eq("needs_admin_review", true)
          .order("updated_at", { ascending: false })
          .limit(50),
        admin.from("cinematic_ad_jobs")
          .select("id,qa_score,smart_retry_count,status")
          .in("status", ["render_complete", "pinterest_uploaded", "published"]),
      ]);
      const completedRows = completed ?? [];
      const qaVals = completedRows.map((r: any) => r.qa_score).filter((v: any) => typeof v === "number");
      const avgQa = qaVals.length ? Math.round(qaVals.reduce((a, b) => a + b, 0) / qaVals.length) : null;
      const retried = completedRows.filter((r: any) => (r.smart_retry_count ?? 0) > 0);
      const retrySuccessRate = retried.length
        ? Math.round((retried.filter((r: any) => r.status !== "failed").length / retried.length) * 100)
        : null;
      return json({
        ok: true, traceId,
        breakdown: breakdown ?? [],
        priority_queue: queue ?? [],
        review_queue: review ?? [],
        metrics: {
          avg_qa_score: avgQa,
          retry_success_rate: retrySuccessRate,
          completed_count: completedRows.length,
          review_count: (review ?? []).length,
        },
      });
    }

    if (action === "classify_failures") {
      const { data: failed } = await admin
        .from("cinematic_ad_jobs")
        .select("*")
        .eq("status", "failed")
        .or("failure_category.is.null,classification_confidence.lt.50")
        .limit(200);
      const updates: any[] = [];
      for (const job of failed ?? []) {
        const c = classify(job);
        await admin.from("cinematic_ad_jobs").update({
          failure_category: c.failure_category,
          root_cause: c.root_cause,
          recommended_fix: c.recommended_fix,
          classification_confidence: c.classification_confidence,
          recoverable: c.recoverable,
          risk_level: c.risk_level,
          expected_impact: c.expected_impact,
        }).eq("id", job.id);
        await logEvent(admin, job.id, {
          event_type: "failure_classified",
          action_taken: c.failure_category,
          trace_id: traceId,
          payload: c,
        });
        updates.push({ id: job.id, ...c });
      }
      return json({ ok: true, traceId, classified: updates.length, items: updates });
    }

    if (action === "smart_retry") {
      const onlyId = body.job_id ? String(body.job_id) : null;
      let q = admin.from("cinematic_ad_jobs").select("*").eq("status", "failed").eq("recoverable", true)
        .eq("needs_admin_review", false).lt("smart_retry_count", MAX_SMART_RETRIES).limit(50);
      if (onlyId) q = admin.from("cinematic_ad_jobs").select("*").eq("id", onlyId).limit(1);
      const { data: jobs } = await q;
      const results: any[] = [];
      for (const job of jobs ?? []) {
        const cat = job.failure_category ?? classify(job).failure_category;
        let patch: Record<string, any> = {
          status: "render_queued",
          render_queued_at: new Date().toISOString(),
          error_message: null,
          status_message: `smart retry (${cat})`,
          smart_retry_count: (job.smart_retry_count ?? 0) + 1,
          render_worker_id: null,
          render_started_at: null,
          render_heartbeat_at: null,
        };
        let note = `smart retry (${cat})`;
        if (cat === "duplicate_scene") {
          const m = entropyMutateScenes(job.scene_assets);
          patch.scene_assets = m.scenes;
          note += ` mutations=${m.mutations.join(",")}`;
        } else if (cat === "timeout") {
          patch.preset = job.preset === "pin-organic" ? "pin-quick" : (job.preset ?? "pin-organic");
        } else if (cat === "ffmpeg_error") {
          patch.preset = "pin-quick";
        } else if (cat === "validation_failed") {
          patch.preset = "pin-organic";
        }

        // Cap: after MAX_SMART_RETRIES set needs_admin_review
        if ((job.smart_retry_count ?? 0) + 1 >= MAX_SMART_RETRIES) {
          patch = {
            ...patch,
            status: "failed",
            needs_admin_review: true,
            admin_review_reason: `Exceeded ${MAX_SMART_RETRIES} smart retries (${cat}).`,
          };
          note += " (review required after cap)";
        }

        await admin.from("cinematic_ad_jobs").update(patch).eq("id", job.id);
        await logEvent(admin, job.id, {
          event_type: "smart_retry",
          action_taken: cat,
          previous_status: job.status,
          new_status: patch.status,
          trace_id: traceId,
          recovery_result: note,
          payload: { smart_retry_count: patch.smart_retry_count, preset: patch.preset ?? job.preset },
        });
        results.push({ id: job.id, category: cat, status: patch.status });
      }
      return json({ ok: true, traceId, retried: results.length, items: results });
    }

    if (action === "score_qa") {
      const onlyId = body.job_id ? String(body.job_id) : null;
      let q = admin.from("cinematic_ad_jobs").select("*")
        .in("status", ["render_complete", "pinterest_uploaded", "published"])
        .is("qa_score", null).limit(100);
      if (onlyId) q = admin.from("cinematic_ad_jobs").select("*").eq("id", onlyId).limit(1);
      const { data: jobs } = await q;
      const items: any[] = [];
      for (const job of jobs ?? []) {
        const { qa_score, qa_report } = scoreQa(job);
        const lowQa = qa_score < 75;
        await admin.from("cinematic_ad_jobs").update({
          qa_score,
          qa_report,
          needs_admin_review: lowQa ? true : job.needs_admin_review ?? false,
          admin_review_reason: lowQa ? `Low QA score (${qa_score})` : job.admin_review_reason,
        }).eq("id", job.id);
        await logEvent(admin, job.id, {
          event_type: "qa_scored",
          action_taken: lowQa ? "flag_low_qa" : "score_ok",
          trace_id: traceId,
          payload: { qa_score, qa_report },
        });
        items.push({ id: job.id, qa_score, low: lowQa });
      }
      return json({ ok: true, traceId, scored: items.length, items });
    }

    if (action === "recompute_priority") {
      const { data: jobs } = await admin.from("cinematic_ad_jobs")
        .select("id,product_slug,product_id,approved_for_render,status,output_mp4_url,validation_report")
        .in("status", ["pending", "preparing", "prepared", "render_queued", "approved", "queued", "awaiting_render"])
        .limit(500);
      const slugs = Array.from(new Set((jobs ?? []).map((j: any) => j.product_slug).filter(Boolean)));
      const extraMap = new Map<string, any>();
      if (slugs.length) {
        // Best-effort enrichment — tolerate missing columns
        try {
          const { data: products, error } = await admin.from("products_public")
            .select("slug")
            .in("slug", slugs);
          if (!error) for (const p of products ?? []) extraMap.set(p.slug, p);
        } catch (e) {
          console.warn("[intelligence] products enrichment skipped", e);
        }
      }
      const items: any[] = [];
      for (const job of jobs ?? []) {
        const p = extraMap.get(job.product_slug) ?? {};
        const score = computePriority(job, {
          opportunity: Number(p.opportunity_score) || undefined,
          pinterest: Number(p.pinterest_potential) || undefined,
          tiktok: Number(p.tiktok_potential) || undefined,
          margin: Number(p.margin_score) || undefined,
          imageQuality: Number(p.image_quality_score) || undefined,
          pastPerformance: undefined,
        });
        await admin.from("cinematic_ad_jobs").update({ render_priority_score: score }).eq("id", job.id);
        items.push({ id: job.id, slug: job.product_slug, score });
      }
      return json({ ok: true, traceId, updated: items.length });
    }

    if (action === "publish_high_qa") {
      // Mark high-QA completed jobs as approved for the existing Pinterest publish flow.
      const { data: jobs } = await admin.from("cinematic_ad_jobs")
        .select("id,qa_score,status,needs_admin_review")
        .eq("status", "render_complete")
        .gte("qa_score", 75)
        .eq("needs_admin_review", false)
        .limit(50);
      const ids = (jobs ?? []).map((j: any) => j.id);
      const results: any[] = [];
      for (const id of ids) {
        await admin.from("cinematic_ad_jobs").update({
          approved_for_render: true,
          approved_at: new Date().toISOString(),
          approved_by: userData.user.id,
        }).eq("id", id);
        await logEvent(admin, id, {
          event_type: "auto_publish_approved",
          action_taken: "qa_gate_passed",
          trace_id: traceId,
          payload: { gate: 75 },
        });
        results.push({ id });
      }
      return json({ ok: true, traceId, approved: results.length, ids });
    }

    if (action === "force_repair") {
      // Admin override: take a job out of needs_admin_review, reset its
      // smart-retry counter, mark it recoverable, then immediately re-queue
      // it via the normal smart_retry path so the same mutation/preset
      // logic applies. Reversible: status_message records the override.
      const jobId = body.job_id ? String(body.job_id) : null;
      if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);
      const { data: job } = await admin.from("cinematic_ad_jobs")
        .select("id,status,needs_admin_review,admin_review_reason,smart_retry_count,failure_category")
        .eq("id", jobId).maybeSingle();
      if (!job) return json({ ok: false, traceId, message: "job not found" }, 404);
      await admin.from("cinematic_ad_jobs").update({
        needs_admin_review: false,
        recoverable: true,
        smart_retry_count: 0,
        status: "failed", // smart_retry path requires status=failed
        admin_review_reason: null,
        status_message: `Force repair by admin (was: ${job.admin_review_reason ?? "n/a"})`,
      }).eq("id", jobId);
      await logEvent(admin, jobId, {
        event_type: "force_repair",
        action_taken: "admin_override",
        previous_status: job.status,
        new_status: "failed",
        trace_id: traceId,
        recovery_result: "reset_for_retry",
        payload: { prior_reason: job.admin_review_reason, prior_category: job.failure_category },
      });
      // Chain straight into smart_retry for this single job so the admin
      // doesn't need a second click.
      const retryRes = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-intelligence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ action: "smart_retry", job_id: jobId }),
      });
      const retryJson = await retryRes.json().catch(() => ({}));
      return json({ ok: true, traceId, force_repair: true, retry: retryJson });
    }

    return json({ ok: false, traceId, message: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("[cinematic-ad-intelligence]", e);
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
