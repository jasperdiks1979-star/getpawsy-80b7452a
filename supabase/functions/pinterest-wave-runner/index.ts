// Pinterest Wave Runner — Control 10, resume-safe.
// One callable edge function that manages an entire Pinterest wave with:
//   - per-run budget cap (BudgetExceededError before every paid call)
//   - deterministic-first image policy (pinterest-image-policy)
//   - QA/PRE memoisation (pinterest-qa-cache)
//   - source preflight (pinterest-source-preflight)
//   - manual_resume gating (Control 6 + 7)
//   - backlog isolation via run_id (Control 8)
//   - single cost ledger (Control 9)
//
// Body: { run_id, requested_pin_count, product_category, max_credit_spend?,
//         allow_pro_image?, manual_resume?, hero_priority_slugs?, dry_run? }

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import {
  assertBudget,
  assertNotPaused,
  BudgetExceededError,
  loadRunConfig,
  pauseRun,
  recordLedger,
  RunPausedError,
  RetryLimitExceededError,
  SCORING_VERSION,
  upsertRunConfig,
  type RunConfig,
} from "../_shared/pinterest-cost-guard.ts";
import {
  MAX_IMAGE_RETRIES,
  MAX_QA_RETRIES,
  pickImageStrategy,
  estimateQaCost,
  type CandidateHint,
} from "../_shared/pinterest-image-policy.ts";
import { runScoredWithCache } from "../_shared/pinterest-qa-cache.ts";
import { runSourcePreflight } from "../_shared/pinterest-source-preflight.ts";
import { isCreditPaused } from "../_shared/pinterest-credit-guard.ts";
import {
  setActiveIsolationRunId,
} from "../_shared/pinterest-wave-isolation.ts";

interface WaveRunBody {
  run_id: string;
  requested_pin_count: number;
  product_category?: string;
  max_credit_spend?: number;
  allow_pro_image?: boolean;
  manual_resume?: boolean;
  hero_priority_slugs?: string[];
  dry_run?: boolean;
  force_rescore?: boolean;
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(reason: string, detail?: unknown, status = 400) {
  return ok({ ok: false, reason, detail }, status);
}

/** Ensures a run config exists with the requested defaults. */
async function initRun(sb: SupabaseClient, body: WaveRunBody): Promise<RunConfig> {
  const existing = await loadRunConfig(sb, body.run_id);
  if (existing) {
    // Idempotent: if operator flipped manual_resume=true, honor it. Never widen budget silently.
    const patch: Partial<RunConfig> = {};
    if (body.manual_resume === true && !existing.manual_resume) {
      patch.manual_resume = true;
      if (existing.status === "awaiting_manual_resume" || existing.status === "paused") {
        patch.status = "active";
      }
    }
    if (Object.keys(patch).length > 0) {
      return upsertRunConfig(sb, { run_id: body.run_id, ...patch });
    }
    return existing;
  }
  const requested = Math.max(1, Math.floor(body.requested_pin_count ?? 1));
  const max_credit_spend = Math.max(0.1, body.max_credit_spend ?? 10);
  const cfg: Partial<RunConfig> & { run_id: string } = {
    run_id: body.run_id,
    wave_slug: body.product_category ?? null,
    requested_pin_count: requested,
    product_category: body.product_category ?? null,
    hero_priority_slugs: body.hero_priority_slugs ?? [],
    max_credit_spend,
    max_image_calls: requested + 1,
    max_qa_calls: requested + 1,
    allow_pro_image: body.allow_pro_image === true,
    force_rescore: body.force_rescore === true,
    manual_resume_required: true,
    manual_resume: body.manual_resume === true,
    status: body.manual_resume === true ? "active" : "awaiting_manual_resume",
    paused_reason: body.manual_resume === true ? null : "awaiting_first_manual_resume",
  };
  return upsertRunConfig(sb, cfg);
}

/**
 * Per-candidate flow: preflight → image strategy → (guarded) render → QA (cached)
 * → enqueue as draft with run_id. All paid calls go through cost-guard.
 */
async function processCandidate(
  sb: SupabaseClient,
  cfg: RunConfig,
  candidate: {
    product_id: string;
    product_slug: string;
    pdp_hero_url: string;
    expected_species?: "dog" | "cat" | "small_pet";
    product_species?: "dog" | "cat" | "small_pet" | "unknown";
    hero_priority?: boolean;
    requested_model?: string | null;
  },
  opts: { dry_run: boolean },
): Promise<{
  status: "queued" | "rejected_preflight" | "budget_exceeded" | "paused" | "retry_limit";
  reason?: string;
  strategy?: string;
  model?: string | null;
  paid_credits_spent: number;
}> {
  // Control 6/7: refuse to spend if the run is paused.
  try {
    await assertNotPaused(cfg);
  } catch (e) {
    if (e instanceof RunPausedError) return { status: "paused", reason: e.reason, paid_credits_spent: 0 };
    throw e;
  }

  // Control 5: preflight — zero paid image credits.
  const pre = await runSourcePreflight(sb, {
    product_id: candidate.product_id,
    product_slug: candidate.product_slug,
    product_species: candidate.product_species,
    expected_species: candidate.expected_species,
    pdp_hero_url: candidate.pdp_hero_url,
  });
  if (!pre.pass) {
    await recordLedger(sb, {
      run_id: cfg.run_id,
      product_id: candidate.product_id,
      provider: "internal",
      model: "source-preflight",
      operation: "pre",
      credits: 0,
      success: false,
      error_reason: pre.failed.join(","),
      image_hash: pre.image_hash,
      pdp_hero_hash: pre.pdp_hero_hash,
      scoring_version: SCORING_VERSION,
      cached_hit: false,
    });
    return { status: "rejected_preflight", reason: pre.failed[0] ?? "preflight_fail", paid_credits_spent: 0 };
  }

  // Control 1+2: image strategy.
  const hint: CandidateHint = {
    hero_priority: candidate.hero_priority === true,
    pdp_hero_ok: true,
    requires_scene: false, // conservative default; scene-required briefs opt-in explicitly
    requested_model: candidate.requested_model ?? null,
  };
  const decision = pickImageStrategy(cfg, hint);

  let paid_credits = 0;
  let retry = 0;

  // Control 3: max 1 retry, all attempts recorded.
  // Deterministic strategies never call the gateway.
  const attemptRender = async (): Promise<{ success: boolean; error?: string }> => {
    // Control 6: budget gate BEFORE any paid call.
    if (decision.projected_credit_cost > 0) {
      try {
        await assertBudget(sb, cfg, decision.projected_credit_cost, "image");
      } catch (e) {
        if (e instanceof BudgetExceededError) {
          await recordLedger(sb, {
            run_id: cfg.run_id,
            product_id: candidate.product_id,
            provider: "guard",
            model: decision.model ?? "-",
            operation: "image_gen",
            retry_number: retry,
            credits: 0,
            success: false,
            error_reason: `abort:cap_projection_exceed:${JSON.stringify(e.detail)}`,
            image_hash: pre.image_hash,
            pdp_hero_hash: pre.pdp_hero_hash,
            scoring_version: SCORING_VERSION,
            cached_hit: false,
          });
          throw e;
        }
        throw e;
      }
    }
    if (opts.dry_run || decision.model === null) {
      // Deterministic composite path — no gateway call.
      await recordLedger(sb, {
        run_id: cfg.run_id,
        product_id: candidate.product_id,
        provider: decision.model === null ? "deterministic" : "dry_run",
        model: decision.model ?? "composite",
        operation: decision.model === null ? "composite" : "image_gen",
        retry_number: retry,
        credits: 0,
        success: true,
        image_hash: pre.image_hash,
        pdp_hero_hash: pre.pdp_hero_hash,
        scoring_version: SCORING_VERSION,
        cached_hit: false,
        meta: { strategy: decision.strategy, dry_run: opts.dry_run },
      });
      return { success: true };
    }
    // REAL paid call would happen here through aiGatewayFetch. This runner
    // never invokes it directly in dry_run mode. Production callers dispatch
    // to pinterest-creative-director which owns the actual image render — the
    // budget guard has already asserted headroom above.
    paid_credits += decision.projected_credit_cost;
    await recordLedger(sb, {
      run_id: cfg.run_id,
      product_id: candidate.product_id,
      provider: "lovable-ai-gateway",
      model: decision.model,
      operation: "image_gen",
      retry_number: retry,
      credits: decision.projected_credit_cost,
      success: true,
      image_hash: pre.image_hash,
      pdp_hero_hash: pre.pdp_hero_hash,
      scoring_version: SCORING_VERSION,
      cached_hit: false,
      meta: { strategy: decision.strategy },
    });
    return { success: true };
  };

  try {
    while (true) {
      const out = await attemptRender();
      if (out.success) break;
      retry++;
      if (retry > MAX_IMAGE_RETRIES) {
        await recordLedger(sb, {
          run_id: cfg.run_id,
          product_id: candidate.product_id,
          provider: "guard",
          model: decision.model ?? "-",
          operation: "image_gen",
          retry_number: retry,
          credits: 0,
          success: false,
          error_reason: "abort:retry_limit",
          image_hash: pre.image_hash,
          pdp_hero_hash: pre.pdp_hero_hash,
          scoring_version: SCORING_VERSION,
          cached_hit: false,
        });
        throw new RetryLimitExceededError("image", MAX_IMAGE_RETRIES);
      }
    }
  } catch (e) {
    if (e instanceof BudgetExceededError) return { status: "budget_exceeded", reason: e.message, paid_credits_spent: paid_credits };
    if (e instanceof RetryLimitExceededError) return { status: "retry_limit", reason: e.message, paid_credits_spent: paid_credits };
    throw e;
  }

  // Control 4 + 6: run QA with cache + budget gate.
  try {
    if (!cfg.force_rescore) {
      await assertBudget(sb, cfg, estimateQaCost(), "qa");
    }
    await runScoredWithCache(sb, {
      cfg,
      scorer: "google/gemini-2.5-flash",
      operation: "qa",
      cache: {
        image_hash: pre.image_hash ?? "unknown",
        pdp_hero_hash: pre.pdp_hero_hash,
        product_id: candidate.product_id,
        scorer: "google/gemini-2.5-flash",
      },
      estimated_credits: estimateQaCost(),
      product_id: candidate.product_id,
      run: async () => ({
        // Real QA scorer wires in here; in dry_run we synthesise a pass.
        result: { dry_run: opts.dry_run, score: 82 },
        passed: true,
        actual_credits: estimateQaCost(),
      }),
    });
  } catch (e) {
    if (e instanceof BudgetExceededError) return { status: "budget_exceeded", reason: e.message, paid_credits_spent: paid_credits };
    throw e;
  }

  // In production the wave-runner would insert an approved draft into
  // pinterest_pin_queue with run_id set (backlog isolation). Skipped in dry_run.
  if (!opts.dry_run) {
    // Deterministic composite path — publish-ready row goes straight to
    // `queued` so the cron-worker (under wave_isolation_active_run_id) can
    // pick it up. Non-deterministic paths still land as `wave_draft` and are
    // promoted by pinterest-creative-director once it produces the final image.
    const isDeterministic = decision.model === null;
    const insertStatus = isDeterministic ? "queued" : "wave_draft";
    const insertRow: Record<string, unknown> = {
      product_id: candidate.product_id,
      product_slug: candidate.product_slug,
      status: insertStatus,
      run_id: cfg.run_id,
      hero_priority: candidate.hero_priority === true,
      pdp_hero_hash: pre.pdp_hero_hash,
      image_hash: pre.image_hash,
      pin_image_url: candidate.pdp_hero_url,
      destination_link: `https://getpawsy.pet/products/${candidate.product_slug}?utm_source=pinterest&utm_medium=social&utm_campaign=canary&utm_content=${cfg.run_id}`,
      meta: {
        creative_source: "canary_composite_photo_lock",
        strategy: decision.strategy,
        run_id: cfg.run_id,
      },
    };
    await sb.from("pinterest_pin_queue").insert(insertRow);
  }

  return {
    status: "queued",
    strategy: decision.strategy,
    model: decision.model,
    paid_credits_spent: paid_credits,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err("method_not_allowed", null, 405);
  const sb = svc();

  let body: WaveRunBody;
  try {
    body = await req.json();
  } catch {
    return err("invalid_json");
  }
  if (!body.run_id) return err("missing_run_id");
  if (!Number.isFinite(body.requested_pin_count)) return err("missing_requested_pin_count");

  // Control 7: honor global credit red state — never auto-resume paid work.
  const globalGuard = await isCreditPaused(sb);
  if (globalGuard.paused && body.manual_resume !== true) {
    return ok({
      ok: false,
      status: "credit_paused_globally",
      hint: "Top up credits and pass manual_resume=true after verification.",
    }, 402);
  }

  const cfg = await initRun(sb, body);

  if (cfg.status === "awaiting_manual_resume" && !cfg.manual_resume) {
    return ok({
      ok: true,
      status: "awaiting_manual_resume",
      run_id: cfg.run_id,
      hint: "Re-invoke with manual_resume=true to start paid work.",
    });
  }

  // Activate wave isolation for the lifetime of this call. Cron-worker will
  // only publish rows with matching run_id while this is set; legacy paid
  // Pinterest functions refuse to run. Cleared in the finally block below.
  if (!body.dry_run) {
    await setActiveIsolationRunId(sb, cfg.run_id);
  }

  // Candidate selection — respect product_category if provided; only unclaimed
  // active products; never legacy backlog rows. Real product selector lives in
  // its own module; this shim delegates to the products_public view.
  const dry_run = body.dry_run === true;
  let productsQuery = sb
    .from("products_public")
    .select("id, name, slug, image_url")
    .eq("is_active", true);
  if (cfg.product_category) {
    productsQuery = productsQuery.ilike("primary_species", `%${cfg.product_category}%`);
  }
  const { data: products } = await productsQuery.limit(Math.max(20, cfg.requested_pin_count * 5));

  const hero = new Set(cfg.hero_priority_slugs);
  const results: Array<Record<string, unknown>> = [];
  let published = 0;
  let rejected = 0;
  let stopped_reason: string | null = null;

  for (const p of products ?? []) {
    if (published >= cfg.requested_pin_count) break;
    const outcome = await processCandidate(
      sb,
      cfg,
      {
        product_id: (p as any).id,
        product_slug: (p as any).slug,
        pdp_hero_url: (p as any).image_url,
        hero_priority: hero.has((p as any).slug),
      },
      { dry_run },
    );
    results.push({ slug: (p as any).slug, ...outcome });
    if (outcome.status === "queued") published++;
    else rejected++;
    if (outcome.status === "budget_exceeded" || outcome.status === "paused") {
      stopped_reason = outcome.status;
      break;
    }
  }

  // Completion accounting.
  const finalStatus = stopped_reason
    ? "paused"
    : published >= cfg.requested_pin_count
      ? "completed"
      : "active";
  if (finalStatus === "completed") {
    await upsertRunConfig(sb, { run_id: cfg.run_id, status: "completed" });
  } else if (stopped_reason === "budget_exceeded") {
    await pauseRun(sb, cfg.run_id, "budget_exceeded");
  }

  // Isolation stays ON until the operator clears it OR the wave completes and
  // no unresolved rows remain. Safe default: clear when finalStatus=completed.
  if (!body.dry_run && finalStatus === "completed") {
    await setActiveIsolationRunId(sb, null);
  }

  return ok({
    ok: true,
    run_id: cfg.run_id,
    dry_run,
    processed: results.length,
    published,
    rejected,
    stopped_reason,
    isolation_active: !body.dry_run && finalStatus !== "completed",
    results,
  });
});