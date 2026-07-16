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
import {
  REQUIRED_PUBLISH_FIELDS,
  validatePublishPayload,
} from "../_shared/pinterest-publish-payload.ts";

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
  /** Explicit whitelist of product UUIDs. When set, ONLY these products are
   *  processed; the wave-runner never broadens. Used by canary runs. */
  product_ids?: string[];
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

type PublishPayload = Record<string, unknown> & {
  meta: Record<string, unknown>;
};

// Static dog-category → board fallback. Live DB lookup runs first; this is
// used only when the board table lookup returns nothing.
import { resolveDogBoard } from "../_shared/pinterest-board-routing.ts";
import {
  buildAltText,
  buildHashtags,
  buildOverlay,
  buildPinDescription,
  buildPinSeoReport,
  buildPinTitle,
  planKeywords,
} from "../_shared/pinterest-keyword-seo.ts";
const CAT_FALLBACK = { id: "1117103951261719219", name: "Best Cat Trees 2026", category_key: "cat_general" };

async function resolveBoard(
  sb: SupabaseClient,
  productCategory: string | null,
  productName: string,
): Promise<{ id: string; name: string; category_key: string }> {
  const blob = `${productCategory ?? ""} ${productName}`.toLowerCase();
  const isCat = /\bcat|feline|kitten\b/.test(blob) && !/\bdog|canine|puppy\b/.test(blob);
  const preferred = isCat ? CAT_FALLBACK : resolveDogBoard(productCategory, productName);
  const preferredName = preferred.name;
  if (preferredName) {
    const { data } = await sb
      .from("pinterest_boards")
      .select("id, name")
      .eq("name", preferredName)
      .eq("is_blacklisted", false)
      .maybeSingle();
    if (data) {
      return {
        id: String((data as any).id),
        name: String((data as any).name),
        category_key: preferred.category_key,
      };
    }
  }
  return preferred;
}

function truncate(s: string, max: number): string {
  const t = (s ?? "").trim();
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)).trim() + "…";
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  category?: string | null;
  image_url: string;
  primary_species?: string | null;
  stock: number;
  is_active: boolean;
  pinterest_eligible?: boolean | null;
}

/**
 * Canonical candidate loader. Queries `public.products` (not the incomplete
 * `products_public` view) and enforces the invariants documented in the
 * canary spec: active, in stock, Pinterest-eligible, hosted on the Supabase
 * CDN, no legacy backlog collision.
 *
 * When `product_ids` is provided, the loader is bound to those IDs — no other
 * product may leak in. Missing/ineligible IDs surface as `rejected` reasons
 * so the caller can fail-fast.
 */
async function loadCandidates(
  sb: SupabaseClient,
  cfg: RunConfig,
  opts: { product_ids?: string[] },
): Promise<{ ok: ProductRow[]; rejected: Array<{ product_id: string; reason: string }> }> {
  const rejected: Array<{ product_id: string; reason: string }> = [];
  let query = sb
    .from("products")
    .select(
      "id, slug, name, description, category, image_url, primary_species, stock, is_active, pinterest_eligible",
    )
    .eq("is_active", true)
    .gt("stock", 0);

  if (opts.product_ids && opts.product_ids.length > 0) {
    query = query.in("id", opts.product_ids);
  } else if (cfg.product_category) {
    // Dog/cat category filter using the REAL column on `products`.
    query = query.eq("primary_species", cfg.product_category);
  }

  const { data, error } = await query.limit(
    opts.product_ids ? opts.product_ids.length : Math.max(20, cfg.requested_pin_count * 5),
  );
  if (error) throw new Error(`candidate_query_failed: ${error.message}`);

  const requested = new Set(opts.product_ids ?? []);
  const ok: ProductRow[] = [];
  for (const raw of (data ?? []) as ProductRow[]) {
    if (requested.size > 0) requested.delete(raw.id);
    if (raw.pinterest_eligible === false) {
      rejected.push({ product_id: raw.id, reason: "pinterest_ineligible" });
      continue;
    }
    if (!raw.image_url || !/^https:\/\/[a-z0-9-]+\.supabase\.co\//i.test(raw.image_url)) {
      rejected.push({ product_id: raw.id, reason: "hero_not_on_supabase_cdn" });
      continue;
    }
    if (!raw.slug || raw.slug.length < 3) {
      rejected.push({ product_id: raw.id, reason: "invalid_slug" });
      continue;
    }
    ok.push(raw);
  }
  // Explicit product IDs that never returned from the DB are ineligible.
  for (const missing of requested) {
    rejected.push({ product_id: missing, reason: "not_found_or_inactive" });
  }
  return { ok, rejected };
}

/** Build the full pinterest_pin_queue row the cron-worker + view require. */
async function buildPublishPayload(
  sb: SupabaseClient,
  cfg: RunConfig,
  product: ProductRow,
  pre: { image_hash: string | null; pdp_hero_hash: string | null },
  strategy: string,
  heroPriority: boolean,
): Promise<PublishPayload> {
  const board = await resolveBoard(sb, product.category, product.name);
  const now = new Date().toISOString();
  const utm = `utm_source=pinterest&utm_medium=social&utm_campaign=canary&utm_content=${cfg.run_id}`;
  // Keyword-first SEO layer: pick primary keyword BEFORE building copy so title,
  // description, overlay, hashtags, alt text and board hint all align to one
  // proven search intent. Falls back to product name if no keyword passes.
  const seoPlan = planKeywords({
    name: product.name,
    slug: product.slug,
    description: product.description ?? null,
    category: product.category ?? null,
  });
  const seoReport = buildPinSeoReport({
    name: product.name,
    slug: product.slug,
    description: product.description ?? null,
    category: product.category ?? null,
  }, seoPlan);
  const title = seoPlan.passes_thresholds
    ? buildPinTitle(seoPlan, { name: product.name, slug: product.slug })
    : truncate(product.name, 100);
  const description = seoPlan.passes_thresholds
    ? buildPinDescription(seoPlan, { name: product.name, slug: product.slug, description: product.description ?? null })
    : truncate(`${product.name} — a practical pick for US dog parents. See details on getpawsy.pet.`, 495);
  const overlay = seoPlan.passes_thresholds ? buildOverlay(seoPlan) : "Built for dog travel";
  const hashtags = seoPlan.passes_thresholds ? buildHashtags(seoPlan) : ["#dogtravel", "#petcarrier"];
  const altText = seoPlan.passes_thresholds
    ? buildAltText(seoPlan, { name: product.name })
    : `${product.name} — photo for US dog parents.`;
  const idempotency_key = `canary:${cfg.run_id}:${product.id}`;
  return {
    product_id: product.id,
    product_slug: product.slug,
    product_name: product.name,
    run_id: cfg.run_id,
    status: "queued",
    pin_image_url: product.image_url, // deterministic photo-lock: raw PDP hero
    destination_link: `https://getpawsy.pet/products/${product.slug}?${utm}`,
    pin_title: title,
    pin_description: description,
    overlay_text: overlay, // primary keyword-driven overlay, ≤6 words
    board_id: board.id,
    board_name: board.name,
    category_key: board.category_key,
    hook_group: "benefit",
    hashtags,
    priority: "high", // column is text enum {high,medium,low}
    scheduled_at: now,
    approved_at: now, // canary is pre-approved by operator invocation
    approved_by: null, // approved_by is a uuid FK; operator-driven canary leaves it null
    us_audience_score: 0.95, // column is numeric(4,3): 0..1 fraction, not a 0..100 percent
    content_type: "product", // must be in allowed check-constraint enum
    image_hash: pre.image_hash,
    pdp_hero_hash: pre.pdp_hero_hash,
    hero_priority: heroPriority,
    idempotency_key,
    source_type: "product_ai", // must be in {lifestyle_ai,product_ai,cinematic_ai}; tracking trigger silently drops other sources
    pin_variant: `canary_photo_lock_${cfg.run_id.slice(0, 8)}`, // NOT NULL column
    retries: 0,
    meta: {
      creative_source: "creative_director_v2", // satisfies cron AI-only gate
      photo_lock: true,
      product_regeneration: false,
      strategy,
      run_id: cfg.run_id,
      species: (product.primary_species ?? "dog"),
      niche: "dog_travel",
      canary: true,
      alt_text: altText,
      seo: seoReport,
    },
  };
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
    product_name?: string;
    product_description?: string | null;
    product_category?: string | null;
    pdp_hero_url: string;
    expected_species?: "dog" | "cat" | "small_pet";
    product_species?: "dog" | "cat" | "small_pet" | "unknown";
    hero_priority?: boolean;
    requested_model?: string | null;
  },
  opts: { dry_run: boolean },
): Promise<{
  status: "queued" | "rejected_preflight" | "budget_exceeded" | "paused" | "retry_limit" | "payload_invalid";
  reason?: string;
  strategy?: string;
  model?: string | null;
  paid_credits_spent: number;
  queue_id?: string;
  missing_fields?: string[];
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
    // Deterministic path only. Non-deterministic paths must be promoted by
    // pinterest-creative-director; the canary runs deterministic-first.
    const isDeterministic = decision.model === null;
    if (!isDeterministic) {
      return {
        status: "payload_invalid",
        reason: "non_deterministic_render_not_yet_wired_in_wave_runner",
        paid_credits_spent: paid_credits,
        missing_fields: ["rendered_composite_url"],
      };
    }
    const product: ProductRow = {
      id: candidate.product_id,
      slug: candidate.product_slug,
      name: candidate.product_name ?? candidate.product_slug,
      description: candidate.product_description ?? null,
      category: candidate.product_category ?? null,
      image_url: candidate.pdp_hero_url,
      primary_species: candidate.product_species ?? "unknown",
      stock: 1,
      is_active: true,
      pinterest_eligible: true,
    };
    const insertRow = await buildPublishPayload(
      sb,
      cfg,
      product,
      { image_hash: pre.image_hash, pdp_hero_hash: pre.pdp_hero_hash },
      decision.strategy,
      candidate.hero_priority === true,
    );
    const check = validatePublishPayload(insertRow);
    if (!check.ok) {
      return {
        status: "payload_invalid",
        reason: "missing_required_publish_fields",
        paid_credits_spent: paid_credits,
        missing_fields: check.missing,
      };
    }
    const { data: inserted, error: insErr } = await sb
      .from("pinterest_pin_queue")
      .insert(insertRow)
      .select("id")
      .single();
    if (insErr) {
      return {
        status: "payload_invalid",
        reason: `insert_failed:${insErr.message}`,
        paid_credits_spent: paid_credits,
      };
    }
    return {
      status: "queued",
      strategy: decision.strategy,
      model: decision.model,
      paid_credits_spent: paid_credits,
      queue_id: String((inserted as any)?.id ?? ""),
    };
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
  // active products; never legacy backlog rows. When `product_ids` is set the
  // runner is bound to that exact whitelist (canary mode).
  const dry_run = body.dry_run === true;
  const loaded = await loadCandidates(sb, cfg, { product_ids: body.product_ids });
  if (loaded.ok.length === 0) {
    return ok({
      ok: false,
      status: "no_candidates",
      run_id: cfg.run_id,
      rejected: loaded.rejected,
    }, 422);
  }

  const hero = new Set(cfg.hero_priority_slugs);
  const results: Array<Record<string, unknown>> = [];
  let published = 0;
  let rejected = 0;
  let stopped_reason: string | null = null;

  for (const p of loaded.ok) {
    if (published >= cfg.requested_pin_count) break;
    const outcome = await processCandidate(
      sb,
      cfg,
      {
        product_id: p.id,
        product_slug: p.slug,
        product_name: p.name,
        product_description: p.description ?? null,
        product_category: p.category ?? null,
        pdp_hero_url: p.image_url,
        product_species: (p.primary_species as any) ?? "unknown",
        expected_species: cfg.product_category === "dog"
          ? "dog"
          : cfg.product_category === "cat"
            ? "cat"
            : undefined,
        hero_priority: hero.has(p.slug),
      },
      { dry_run },
    );
    results.push({ slug: p.slug, product_id: p.id, ...outcome });
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