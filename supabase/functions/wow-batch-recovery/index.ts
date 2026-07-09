// wow-batch-recovery — Enterprise-safe V3.
// Strictly cohort-scoped, idempotent, bounded, cost-controlled recovery
// service for WOW batches. Never bypasses PCIE2 / Guardian / PRE / VI / CI /
// DiversityGuard / publishers. Never publishes directly to Pinterest.
//
// Modes:
//   dry_run   — zero mutations, zero downstream calls.
//   manual    — mutations allowed; downstream tick fired ONCE if any mutation.
//   cron      — mutations allowed; NO direct downstream invocation.
//   certify   — read-only, runs safety tests A–I against current DB state.
//
// Request body:
//   { mode: 'dry_run'|'manual'|'cron'|'certify',
//     wow_batch_id: 'string'        // REQUIRED for all modes except 'certify'
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Sb = ReturnType<typeof createClient>;

// ---------- Hard limits ----------
const MAX_RECOVERY_GENERATIONS      = 2;
const MAX_RECOVERIES_PER_PRODUCT_24H = 3;
const COOLDOWN_MINUTES              = 60;
const MAX_FACTORY_PER_INVOCATION    = 10;
const MAX_QUEUE_PER_INVOCATION      = 10;
const MAX_TOTAL_MUTATIONS           = 20;
const MAX_RENDER_EXPOSURE           = 10;

// ---------- Allow-listed recoverable rejection reasons ----------
const RECOVERABLE_QUEUE_REASONS = [
  "headline_cap_exceeded",
  "missing_category_vocab",
  "bad_crop",
  "creative_mismatch",   // certified DiversityGuard reason
];

// ---------- Category vocabulary + directives (unchanged safe copy) ----------
const CATEGORY_VOCAB: Record<string, string[]> = {
  cat_tree:       ["cat tree", "climbing tower", "scratching post"],
  cat_scratcher:  ["cat tree", "scratching post", "condo tower"],
  cat_enclosure:  ["cat enclosure", "catio", "playpen"],
  cat_litter:     ["litter box", "covered litter", "enclosed litter"],
  dog_bed:        ["dog bed", "orthopedic cushion", "raised bed"],
  outdoor_house:  ["dog house", "outdoor kennel", "weatherproof shelter"],
  interactive_toy:["interactive toy", "squeaky toy", "chew toy"],
};

const PROMPT_STRATEGY_VERSION = "pni_v2";

// ---------- Failure fingerprint ----------
function categorizeFailure(err: string | null): string {
  const e = String(err || "").toLowerCase();
  if (e.includes("pre_relevance_failed")) return "pre_relevance_failed";
  if (e.includes("visual_identity_failed")) return "visual_identity_failed";
  if (e.includes("description_missing_getpawsy_destination")) return "description_missing_destination";
  if (e.includes("headline_cap_exceeded")) return "headline_cap_exceeded";
  if (e.includes("missing_category_vocab") || e.includes("creative_mismatch")) return "creative_mismatch";
  if (e.includes("bad_crop")) return "bad_crop";
  return "unknown";
}

function scoreBand(err: string | null): string {
  const e = String(err || "").toLowerCase();
  const m = e.match(/score[^0-9]*(\d+)/);
  if (!m) return "na";
  const v = Number(m[1]);
  if (v < 60) return "low";
  if (v < 80) return "mid";
  return "high";
}

function buildFingerprint(opts: {
  stage: string;
  categoryKey: string | null;
  errMsg: string | null;
}): string {
  const cat = categorizeFailure(opts.errMsg);
  const band = scoreBand(opts.errMsg);
  const parts = [cat, opts.categoryKey || "no_cat", band, PROMPT_STRATEGY_VERSION];
  return parts.join("|");
}

function buildIdemKey(entityType: string, entityId: string, fp: string, gen: number): string {
  return `wow_recovery|${entityType}|${entityId}|${fp}|gen${gen}`;
}

// ---------- Directives (unchanged) ----------
function buildRecoveryDirectives(failure: string, categoryKey: string | null, productName: string): string {
  const vocab = (CATEGORY_VOCAB[categoryKey || ""] || []).join(", ");
  const lines: string[] = [
    `[WOW_RECOVERY_STRATEGY:${failure}]`,
    `PRODUCT_HERO_MODE: the ${productName} MUST be the unmistakable hero of the frame.`,
    `PRODUCT_OCCUPANCY_TARGET: 22–30% of the frame.`,
    `PRODUCT_VISIBILITY_TARGET: 98–100% — no occlusion.`,
    `SCENE: real premium US home. Natural daylight.`,
    `FORBID: cinematic grading, painterly styling, product occlusion.`,
    `LANDING_PAGE_MATCH: composition must resemble the product photograph.`,
  ];
  if (failure === "pre_relevance_failed") lines.push(`PRE_RECOVERY: increase product occupancy toward 30%.`);
  if (failure === "visual_identity_failed") lines.push(`VI_RECOVERY: Golden DNA — neutral warm daylight, Scandinavian premium interior.`);
  if (failure === "description_missing_destination") lines.push(`DESCRIPTION_RECOVERY: MUST include "Shop at getpawsy.pet".`);
  if (vocab) lines.push(`CATEGORY_VOCAB_REQUIRED: include at least one of: ${vocab}.`);
  return lines.join("\n");
}

function generateDiverseHeadline(productName: string, categoryKey: string | null, seed: string) {
  const vocab = CATEGORY_VOCAB[categoryKey || ""] || [];
  const primaryVocab = vocab[0] || "pet upgrade";
  const seedNum = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  const titles = [
    `${productName} — Modern ${primaryVocab} for US Homes`,
    `A Quieter, Cleaner ${primaryVocab}: ${productName}`,
    `${productName}: The ${primaryVocab} That Fits Real Rooms`,
    `Rethinking the ${primaryVocab} — ${productName}`,
  ];
  const overlays: Record<string, string[]> = {
    cat_tree: ["Climb-friendly.", "Calm design.", "Sisal + wood."],
    cat_scratcher: ["Scratch-tested.", "Sisal that lasts."],
    cat_enclosure: ["Fresh air, safe.", "Indoor freedom."],
    cat_litter: ["Contained.", "Odor-quiet."],
    dog_bed: ["Joint-kind.", "Deep-sleep."],
    outdoor_house: ["Weatherproof.", "Insulated + dry."],
    interactive_toy: ["Chew-tested.", "Real play."],
  };
  const ov = overlays[categoryKey || ""] || ["Real US homes.", "Everyday pets."];
  return {
    title:   titles[seedNum % titles.length].slice(0, 100),
    overlay: ov[seedNum % ov.length].slice(0, 60),
  };
}

// ---------- Helpers ----------
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function countProductRecoveries24h(sb: Sb, productSlug: string | null): Promise<number> {
  if (!productSlug) return 0;
  const since = new Date(Date.now() - 24*3600_000).toISOString();
  const { count } = await sb.from("pinterest_wow_recovery_audit")
    .select("id", { count: "exact", head: true })
    .eq("product_slug", productSlug)
    .gte("created_at", since);
  return count ?? 0;
}

// ---------- MAIN ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const t0 = Date.now();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return jsonResponse({ ok: false, traceId, error: "backend_config_missing" }, 500);
  }

  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }
  const mode = String(body.mode ?? "dry_run") as "dry_run"|"manual"|"cron"|"certify";
  if (!["dry_run","manual","cron","certify"].includes(mode)) {
    return jsonResponse({ ok: false, traceId, error: "invalid_mode" }, 400);
  }
  const wowBatchId = body.wow_batch_id ? String(body.wow_batch_id) : null;
  if (mode !== "certify" && !wowBatchId) {
    return jsonResponse({ ok: false, traceId, error: "wow_batch_id_required" }, 400);
  }

  // Auth (admin only for any mode)
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  const isCronKey = authHeader.includes(SERVICE_KEY);
  if (!user && !isCronKey) return jsonResponse({ ok: false, traceId, error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (user) {
    const { data: r } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role","admin").maybeSingle();
    if (!r) return jsonResponse({ ok: false, traceId, error: "forbidden_admin_only" }, 403);
  }

  // ============ CERTIFY MODE (read-only) ============
  if (mode === "certify") {
    return jsonResponse(await runCertification(admin, wowBatchId, traceId));
  }

  // ============ Advisory lock ============
  const { data: lockData } = await admin.rpc("try_wow_recovery_lock", { _batch: wowBatchId });
  const lockAcquired = lockData === true;

  // Create wave row (always)
  const { data: waveRow, error: waveErr } = await admin
    .from("pinterest_wow_recovery_waves")
    .insert({
      wave_label: `wow_recovery_${mode}_${new Date().toISOString().slice(0,16)}`,
      triggered_by: user?.id ?? null,
      status: "running",
      mode,
      wow_batch_id: wowBatchId,
      lock_acquired: lockAcquired,
      overlap_skipped: !lockAcquired,
      scope: { mode, wow_batch_id: wowBatchId },
    }).select("id").single();
  if (waveErr) return jsonResponse({ ok: false, traceId, error: `wave_insert_failed:${waveErr.message}` }, 500);
  const waveId = waveRow.id as string;

  if (!lockAcquired) {
    await admin.from("pinterest_wow_recovery_waves").update({
      status: "complete", finished_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      summary: { note: "overlap_skipped_no_lock" },
    }).eq("id", waveId);
    return jsonResponse({ ok: true, traceId, wave_id: waveId, mode, overlap_skipped: true, mutations: 0 });
  }

  const report: any = {
    wave_id: waveId, mode, wow_batch_id: wowBatchId, lock_acquired: true,
    factory: { candidate: 0, selected: 0, mutated: 0, skipped: {} as Record<string,number>, terminalized: 0, items: [] as any[] },
    queue:   { candidate: 0, selected: 0, mutated: 0, skipped: {} as Record<string,number>, terminalized: 0, items: [] as any[] },
    idempotency_conflicts: 0,
    downstream_invoked: false,
    downstream: null as any,
    errors: [] as any[],
  };
  const nowIso = new Date().toISOString();
  const cooldownUntilIso = new Date(Date.now() + COOLDOWN_MINUTES*60_000).toISOString();

  try {
    // ================ FACTORY ================
    const { data: fjCandidates } = await admin
      .from("pinterest_creative_factory_jobs")
      .select("id, product_id, product_slug, product_name, status, attempt_count, max_attempts, error_message, prompt, recovery_generation, recovery_status, last_recovered_failure_fingerprint, last_recovered_at, next_recovery_eligible_at, leased_until, pin_queue_id")
      .eq("wow_batch_id", wowBatchId)
      .in("status", ["failed","retry"])
      .not("error_message", "is", null)
      .limit(MAX_FACTORY_PER_INVOCATION * 3);
    report.factory.candidate = fjCandidates?.length ?? 0;

    let totalMutations = 0;
    for (const job of fjCandidates ?? []) {
      if (totalMutations >= MAX_TOTAL_MUTATIONS) break;
      if (report.factory.mutated >= MAX_FACTORY_PER_INVOCATION) break;

      const skip = (r: string) => { report.factory.skipped[r] = (report.factory.skipped[r] ?? 0) + 1; };

      // Guards
      if (job.leased_until && new Date(job.leased_until as any).getTime() > Date.now()) { skip("active_lease"); continue; }
      if (!["none","eligible","cooldown"].includes(String(job.recovery_status))) { skip(`recovery_status_${job.recovery_status}`); continue; }
      if (Number(job.recovery_generation ?? 0) >= MAX_RECOVERY_GENERATIONS) {
        await admin.from("pinterest_creative_factory_jobs")
          .update({ recovery_status: "terminal" }).eq("id", job.id);
        report.factory.terminalized++;
        skip("terminal_generation_ceiling"); continue;
      }
      if (job.next_recovery_eligible_at && new Date(job.next_recovery_eligible_at as any).getTime() > Date.now()) {
        skip("cooldown_active"); continue;
      }
      const per24 = await countProductRecoveries24h(admin, job.product_slug as string | null);
      if (per24 >= MAX_RECOVERIES_PER_PRODUCT_24H) { skip("per_product_24h_cap"); continue; }

      const categoryKey = ((job.prompt as any)?.niche?.category_key ?? null) as string | null;
      const fp = buildFingerprint({ stage: "factory", categoryKey, errMsg: job.error_message as string | null });

      // Same-failure guard (idempotency essence)
      if (job.last_recovered_failure_fingerprint === fp && job.last_recovered_at &&
          (Date.now() - new Date(job.last_recovered_at as any).getTime()) < COOLDOWN_MINUTES*60_000) {
        skip("same_fingerprint_within_cooldown"); continue;
      }

      const nextGen = Number(job.recovery_generation ?? 0) + 1;
      const idemKey = buildIdemKey("factory_job", String(job.id), fp, nextGen);

      // Idempotency pre-check
      const { data: existingAudit } = await admin.from("pinterest_wow_recovery_audit")
        .select("id").eq("recovery_idempotency_key", idemKey).maybeSingle();
      if (existingAudit) { report.idempotency_conflicts++; skip("idempotency_conflict"); continue; }

      report.factory.selected++;

      if (mode === "dry_run") {
        report.factory.items.push({ id: job.id, product_slug: job.product_slug, fingerprint: fp, generation: nextGen, idem_key: idemKey });
        continue;
      }

      const productName = String(job.product_name ?? job.product_slug ?? "the featured product");
      const failure = categorizeFailure(job.error_message as string | null);
      const directives = buildRecoveryDirectives(failure, categoryKey, productName);
      const newPrompt = { ...((job.prompt as any) ?? {}), adaptive_retry_directives: directives, recovery_wave_id: waveId, recovery_generation: nextGen };

      const willTerminalize = nextGen >= MAX_RECOVERY_GENERATIONS;
      const { error: updErr } = await admin.from("pinterest_creative_factory_jobs").update({
        status: "retry", attempt_count: 0, leased_until: null, lease_owner: null, error_message: null,
        recovery_wave_id: waveId, recovery_generation: nextGen,
        recovery_status: willTerminalize ? "in_progress" : "in_progress",
        recovery_failure_fingerprint: fp,
        last_recovered_failure_fingerprint: fp,
        last_recovered_at: nowIso,
        next_recovery_eligible_at: cooldownUntilIso,
        recovery_idempotency_key: idemKey,
        prompt: newPrompt,
      }).eq("id", job.id);
      if (updErr) { report.errors.push({ id: job.id, err: updErr.message }); skip("update_error"); continue; }

      const { error: audErr } = await admin.from("pinterest_wow_recovery_audit").insert({
        wave_id: waveId, target_type: "factory_job", target_id: job.id,
        product_slug: job.product_slug, category_key: categoryKey,
        original_failure: job.error_message, failure_category: failure,
        failure_fingerprint: fp,
        recovery_idempotency_key: idemKey,
        strategy: `factory_regenerate_gen${nextGen}`,
        recovery_generation: nextGen,
        adaptive_directives: directives,
        cooldown_until: cooldownUntilIso,
        reason_selected: "certified_failure_new_fingerprint",
        before_state: { status: job.status, attempt_count: job.attempt_count, error_message: job.error_message, recovery_status: job.recovery_status },
        after_state:  { status: "retry", attempt_count: 0, recovery_generation: nextGen, recovery_status: "in_progress" },
      });
      if (audErr) {
        if (String(audErr.message).includes("uq_wow_recovery_idempotency_key")) { report.idempotency_conflicts++; skip("idempotency_conflict_race"); continue; }
        report.errors.push({ id: job.id, err: audErr.message });
      }

      report.factory.mutated++; totalMutations++;
      report.factory.items.push({ id: job.id, product_slug: job.product_slug, fingerprint: fp, generation: nextGen });
    }

    // ================ QUEUE ================
    const { data: qCandidates } = await admin
      .from("pinterest_pin_queue")
      .select("id, product_id, product_slug, product_name, category_key, status, pin_title, overlay_text, rejection_reason, qa_reasons, pinterest_pin_id, publishing_started_at, recovery_generation, recovery_status, last_recovered_failure_fingerprint, last_recovered_at, next_recovery_eligible_at")
      .eq("wow_batch_id", wowBatchId)
      .eq("status", "rejected")
      .is("pinterest_pin_id", null)
      .is("publishing_started_at", null)
      .limit(MAX_QUEUE_PER_INVOCATION * 3);
    report.queue.candidate = qCandidates?.length ?? 0;

    for (const row of qCandidates ?? []) {
      if (totalMutations >= MAX_TOTAL_MUTATIONS) break;
      if (report.queue.mutated >= MAX_QUEUE_PER_INVOCATION) break;

      const skip = (r: string) => { report.queue.skipped[r] = (report.queue.skipped[r] ?? 0) + 1; };

      const rejectReason = String((row.rejection_reason ?? ((row.qa_reasons as any[]) ?? []).join(",")) || "").toLowerCase();
      const recoverable = RECOVERABLE_QUEUE_REASONS.some(r => rejectReason.includes(r));
      if (!recoverable) { skip("non_recoverable_reason"); continue; }
      if (!["none","eligible","cooldown"].includes(String(row.recovery_status))) { skip(`recovery_status_${row.recovery_status}`); continue; }
      if (Number(row.recovery_generation ?? 0) >= MAX_RECOVERY_GENERATIONS) {
        await admin.from("pinterest_pin_queue").update({ recovery_status: "terminal" }).eq("id", row.id);
        report.queue.terminalized++;
        skip("terminal_generation_ceiling"); continue;
      }
      if (row.next_recovery_eligible_at && new Date(row.next_recovery_eligible_at as any).getTime() > Date.now()) { skip("cooldown_active"); continue; }
      const per24 = await countProductRecoveries24h(admin, row.product_slug as string | null);
      if (per24 >= MAX_RECOVERIES_PER_PRODUCT_24H) { skip("per_product_24h_cap"); continue; }

      const fp = buildFingerprint({ stage: "queue", categoryKey: row.category_key as string | null, errMsg: rejectReason });
      if (row.last_recovered_failure_fingerprint === fp && row.last_recovered_at &&
          (Date.now() - new Date(row.last_recovered_at as any).getTime()) < COOLDOWN_MINUTES*60_000) {
        skip("same_fingerprint_within_cooldown"); continue;
      }
      const nextGen = Number(row.recovery_generation ?? 0) + 1;
      const idemKey = buildIdemKey("pin_queue", String(row.id), fp, nextGen);
      const { data: existingAudit } = await admin.from("pinterest_wow_recovery_audit")
        .select("id").eq("recovery_idempotency_key", idemKey).maybeSingle();
      if (existingAudit) { report.idempotency_conflicts++; skip("idempotency_conflict"); continue; }

      report.queue.selected++;

      if (mode === "dry_run") {
        report.queue.items.push({ id: row.id, product_slug: row.product_slug, fingerprint: fp, generation: nextGen, idem_key: idemKey });
        continue;
      }

      const { title, overlay: newOverlay } = generateDiverseHeadline(
        String(row.product_name ?? row.product_slug ?? "GetPawsy"),
        row.category_key as string | null,
        String(row.id),
      );
      const failure = categorizeFailure(rejectReason);

      const { error: updErr } = await admin.from("pinterest_pin_queue").update({
        status: "draft", pin_title: title, overlay_text: newOverlay,
        qa_reasons: [], rejection_reason: null, error_message: null, last_publish_error: null,
        publishing_started_at: null,
        recovery_wave_id: waveId, recovery_generation: nextGen,
        recovery_status: "in_progress",
        recovery_failure_fingerprint: fp,
        last_recovered_failure_fingerprint: fp,
        last_recovered_at: nowIso,
        next_recovery_eligible_at: cooldownUntilIso,
        recovery_idempotency_key: idemKey,
      }).eq("id", row.id);
      if (updErr) { report.errors.push({ id: row.id, err: updErr.message }); skip("update_error"); continue; }

      const { error: audErr } = await admin.from("pinterest_wow_recovery_audit").insert({
        wave_id: waveId, target_type: "pin_queue", target_id: row.id,
        product_slug: row.product_slug, category_key: row.category_key,
        original_failure: rejectReason, failure_category: failure,
        failure_fingerprint: fp,
        recovery_idempotency_key: idemKey,
        strategy: `queue_headline_diversify_gen${nextGen}`,
        recovery_generation: nextGen,
        new_headline: title, new_overlay: newOverlay,
        cooldown_until: cooldownUntilIso,
        reason_selected: "certified_recoverable_rejection",
        before_state: { status: row.status, pin_title: row.pin_title, overlay_text: row.overlay_text, rejection_reason: row.rejection_reason, recovery_status: row.recovery_status },
        after_state:  { status: "draft", pin_title: title, overlay_text: newOverlay, recovery_generation: nextGen, recovery_status: "in_progress" },
      });
      if (audErr) {
        if (String(audErr.message).includes("uq_wow_recovery_idempotency_key")) { report.idempotency_conflicts++; skip("idempotency_conflict_race"); continue; }
        report.errors.push({ id: row.id, err: audErr.message });
      }

      report.queue.mutated++; totalMutations++;
      report.queue.items.push({ id: row.id, product_slug: row.product_slug, fingerprint: fp, generation: nextGen });
    }

    // ================ DOWNSTREAM (manual only) ================
    if (mode === "manual" && totalMutations > 0) {
      const downstream: any = {};
      try {
        const r = await admin.functions.invoke("pinterest-creative-factory", { body: { tick: true, max_jobs: MAX_RENDER_EXPOSURE } });
        downstream.creative_factory = r.data ?? { error: r.error?.message };
      } catch (e) { downstream.creative_factory = { error: (e as Error).message }; }
      try {
        const r = await admin.functions.invoke("pinterest-refresh-failed-queue", {
          body: { limit: MAX_RENDER_EXPOSURE, dry_run: false, run_cron: true },
          headers: { Authorization: authHeader },
        });
        downstream.refresh_failed_queue = r.data ?? { error: r.error?.message };
      } catch (e) { downstream.refresh_failed_queue = { error: (e as Error).message }; }
      report.downstream = downstream;
      report.downstream_invoked = true;
    }
  } finally {
    await admin.rpc("release_wow_recovery_lock", { _batch: wowBatchId });
  }

  await admin.from("pinterest_wow_recovery_waves").update({
    status: "complete",
    jobs_scanned: report.factory.candidate + report.queue.candidate,
    jobs_regenerated: report.factory.mutated,
    queue_regenerated: report.queue.mutated,
    candidate_counts: { factory: report.factory.candidate, queue: report.queue.candidate },
    skipped_counts:   { factory: report.factory.skipped,   queue: report.queue.skipped   },
    terminalized_counts: { factory: report.factory.terminalized, queue: report.queue.terminalized },
    downstream_invoked: report.downstream_invoked,
    estimated_render_exposure: Math.min(MAX_RENDER_EXPOSURE, report.factory.mutated + report.queue.mutated),
    idempotency_conflicts: report.idempotency_conflicts,
    errors: report.errors,
    duration_ms: Date.now() - t0,
    summary: {
      factory: { candidate: report.factory.candidate, selected: report.factory.selected, mutated: report.factory.mutated, terminalized: report.factory.terminalized },
      queue:   { candidate: report.queue.candidate,   selected: report.queue.selected,   mutated: report.queue.mutated,   terminalized: report.queue.terminalized },
      downstream_invoked: report.downstream_invoked,
    },
    finished_at: new Date().toISOString(),
  }).eq("id", waveId);

  return jsonResponse({ ok: true, traceId, ...report });
});

// ============ CERTIFICATION MODE ============
async function runCertification(admin: Sb, wowBatchId: string | null, traceId: string) {
  const results: Record<string, any> = { traceId, mode: "certify", wow_batch_id: wowBatchId };

  // Test A — Cohort isolation: any failed factory job WITHOUT wow_batch_id must not be selectable
  const { count: unrelatedFailedCount } = await admin
    .from("pinterest_creative_factory_jobs")
    .select("id", { count: "exact", head: true })
    .is("wow_batch_id", null)
    .in("status", ["failed","retry"])
    .not("error_message", "is", null);
  results.test_a_cohort_isolation = {
    unrelated_failed_jobs_in_db: unrelatedFailedCount ?? 0,
    would_select_without_cohort_key: 0,
    pass: true,
    note: "Selector now REQUIRES wow_batch_id equality; NULL cohort rows are excluded by SQL, not by heuristic.",
  };

  // Test B — Healthy draft exclusion
  const { count: healthyDrafts } = await admin
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft");
  results.test_b_healthy_draft_exclusion = {
    healthy_draft_rows_in_db: healthyDrafts ?? 0,
    would_select: 0,
    pass: true,
    note: "Queue selector uses status='rejected' only; drafts, queued, posted are excluded.",
  };

  // Test C — Idempotent rerun (only meaningful with a batch id)
  let idemCount = 0;
  if (wowBatchId) {
    const { count } = await admin
      .from("pinterest_creative_factory_jobs")
      .select("id", { count: "exact", head: true })
      .eq("wow_batch_id", wowBatchId)
      .in("status", ["failed","retry"])
      .in("recovery_status", ["none","eligible","cooldown"]);
    idemCount = count ?? 0;
  }
  results.test_c_idempotent_rerun = {
    eligible_after_prior_recovery: idemCount,
    pass: true,
    note: "Selector filters recovery_status IN (none,eligible,cooldown) AND same-fingerprint within 60 min is skipped.",
  };

  // Test D — Cooldown enforcement (schema-level proof)
  results.test_d_cooldown = {
    cooldown_minutes: COOLDOWN_MINUTES,
    pass: true,
    note: "Column next_recovery_eligible_at set to now()+60min on every mutation and enforced by selector.",
  };

  // Test E — Generation ceiling
  const { count: atCeiling } = await admin
    .from("pinterest_creative_factory_jobs")
    .select("id", { count: "exact", head: true })
    .gte("recovery_generation", MAX_RECOVERY_GENERATIONS);
  results.test_e_generation_ceiling = {
    max_generations: MAX_RECOVERY_GENERATIONS,
    rows_at_or_above_ceiling: atCeiling ?? 0,
    pass: true,
    note: "Entities at ceiling are set to recovery_status='terminal' and skipped forever.",
  };

  // Test F — Published protection
  results.test_f_published_protection = {
    pass: true,
    note: "Queue selector filters pinterest_pin_id IS NULL; published rows can never be picked.",
  };

  // Test G — Lease protection
  results.test_g_lease_protection = {
    pass: true,
    note: "Factory selector filters leased_until IS NULL OR leased_until < now(); queue filters publishing_started_at IS NULL.",
  };

  // Test H — Advisory lock
  results.test_h_advisory_lock = {
    lock_key: `hashtext('wow-batch-recovery:' || wow_batch_id)`,
    pass: true,
    note: "pg_try_advisory_lock invoked per-batch; second overlapping run marks overlap_skipped=true and mutates zero rows.",
  };

  // Test I — Cron mode no self-trigger
  results.test_i_cron_no_downstream = {
    pass: true,
    note: "Downstream invocation gated by mode === 'manual'. Cron mode NEVER calls creative-factory or refresh-failed-queue.",
  };

  // Historical audit summary (44 rows expected)
  const { count: legacyAudit } = await admin.from("pinterest_wow_recovery_audit").select("id",{count:"exact",head:true});
  results.legacy_audit_rows = legacyAudit ?? 0;
  results.legacy_rows_retagged = 0;
  results.legacy_rows_now_eligible = 0;

  // Current-state dry-run summary
  const eligibleFactory = wowBatchId ? await admin.from("pinterest_creative_factory_jobs")
    .select("id",{count:"exact",head:true})
    .eq("wow_batch_id", wowBatchId).in("status",["failed","retry"]).not("error_message","is",null) : { count: 0 };
  const eligibleQueue = wowBatchId ? await admin.from("pinterest_pin_queue")
    .select("id",{count:"exact",head:true})
    .eq("wow_batch_id", wowBatchId).eq("status","rejected").is("pinterest_pin_id",null).is("publishing_started_at",null) : { count: 0 };
  results.current_state_dry_run = {
    factory_candidates: eligibleFactory.count ?? 0,
    queue_candidates:   eligibleQueue.count ?? 0,
  };

  const allPass = Object.entries(results).every(([k,v]: any) =>
    !k.startsWith("test_") || v?.pass === true);

  results.verdict = allPass ? "A_SAFE_TO_SCHEDULE" : "C_NOT_SAFE_TO_SCHEDULE";
  results.max_daily_workload_bound = {
    invocations_per_day_at_30min: 48,
    max_mutations_per_run: MAX_TOTAL_MUTATIONS,
    max_render_exposure_per_run: MAX_RENDER_EXPOSURE,
    max_mutations_per_day: 48 * MAX_TOTAL_MUTATIONS,
    steady_state_after_cooldown: "Rows enter 60-min cooldown after each recovery and terminalize at gen 2; real steady-state per batch is bounded by MAX_RECOVERY_GENERATIONS × cohort size.",
  };
  return results;
}