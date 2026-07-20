// Product Intelligence Engine — orchestrator
// DORMANT BY DEFAULT. Exits before any AI call unless product_intelligence_config.enabled = true.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  classifyGoogleProductCategory,
} from "../_shared/google-product-category.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// Background task helper (Supabase Edge Runtime). Falls back to no-op detach if unavailable.
// deno-lint-ignore no-explicit-any
const _ER: any = (globalThis as any).EdgeRuntime;
function background(p: Promise<unknown>) {
  if (_ER && typeof _ER.waitUntil === "function") {
    try { _ER.waitUntil(p); return; } catch { /* fall through */ }
  }
  // Detach — caller already returned; let it run best-effort.
  p.catch((e) => console.error("[bg]", e));
}

// Mark stale "running" rows as failed (timeout reaper).
async function reapStaleRuns(sb: any) {
  const cutoffMs = Date.now() - 5 * 60 * 1000;
  const { data: latestWrite } = await sb
    .from("product_intelligence")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestWriteMs = Date.parse(latestWrite?.updated_at ?? "");
  const { data: running } = await sb
    .from("product_intelligence_runs")
    .select("id,started_at,report")
    .eq("status", "running");

  for (const run of running ?? []) {
    const heartbeat = typeof run?.report?.heartbeat_at === "string" ? run.report.heartbeat_at : run.started_at;
    const observedProgressMs = Math.max(Date.parse(heartbeat), Number.isFinite(latestWriteMs) ? latestWriteMs : 0);
    if (observedProgressMs < cutoffMs) {
      await sb
        .from("product_intelligence_runs")
        .update({
          status: "failed",
          error_message: "timeout_or_killed (no progress for >5min)",
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
  }
}

async function countRemainingActiveProducts(sb: any): Promise<number> {
  const { data: products } = await sb.from("products").select("id").eq("is_active", true).limit(10000);
  const { data: enriched } = await sb.from("product_intelligence").select("product_id").limit(10000);
  const done = new Set((enriched ?? []).map((r: any) => r.product_id));
  return (products ?? []).filter((p: any) => !done.has(p.id)).length;
}

const SUPA_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SELF_URL = `${SUPABASE_URL}/functions/v1/product-intelligence-orchestrator`;

// Fire-and-forget POST to self to start the next batch on a fresh runtime.
async function fireSelfChain(runId: string) {
  try {
    // No await on the promise body — we just want to hand off the HTTP call.
    const p = fetch(SELF_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPA_ANON}`,
        apikey: SUPA_ANON,
      },
      body: JSON.stringify({
        mode: "scan_all",
        trigger_source: "self_chain",
        continuation: true,
        existing_run_id: runId,
        background: true,
      }),
    });
    // Don't await — we want the current invocation to exit ASAP.
    p.then((r) => r.text()).catch((e) => console.error("[self-chain]", e));
  } catch (e) {
    console.error("[self-chain] dispatch failed", e);
  }
}

// Used by the supervisor cron when no active scan_all exists.
async function launchScanAll(sb: any): Promise<{ id: string } | null> {
  const { data: created } = await sb
    .from("product_intelligence_runs")
    .insert({
      trigger_source: "supervisor",
      mode: "scan_all",
      status: "running",
      started_at: new Date().toISOString(),
      report: { heartbeat_at: new Date().toISOString(), mode: "scan_all", scanned: 0, failed: 0, credits_used: 0, launched_by: "supervisor" },
    })
    .select().single();
  if (!created) return null;
  await fireSelfChain(created.id);
  return { id: created.id };
}

interface Body {
  mode?:
    | "dry_run"
    | "scan"
    | "scan_all"
    | "scan_one"
    | "force_rebuild"
    | "rebuild_category"
    | "rebuild_pinterest"
    | "rebuild_seo";
  product_id?: string;
  trigger_source?: string;
  limit?: number;
  background?: boolean;
  action?: "supervisor" | "reap_stale";
  continuation?: boolean;
  existing_run_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const body: Body = await req.json().catch(() => ({}));
  const mode = body.mode ?? "scan";
  const trigger = body.trigger_source ?? "manual";
  console.log(`[req] mode=${mode} trigger=${trigger} action=${body.action ?? "-"} continuation=${body.continuation ?? false} runId=${body.existing_run_id ?? "-"}`);

  // Always reap stale runs first so the dashboard reflects reality.
  await reapStaleRuns(sb);

  // Internal continuations and cron-supervisor traffic skip admin auth.
  const internalTrigger =
    trigger === "cron" || trigger === "self_chain" || trigger === "supervisor";

  // Auth: require admin caller for manual triggers
  if (!internalTrigger) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, reason: "unauthorized" }, 401);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json({ ok: false, reason: "forbidden" }, 403);
  }

  // Supervisor action — called by cron. Reaps stale runs and (if eligible) launches a resume scan.
  if (body.action === "supervisor" || body.action === "reap_stale") {
    const { data: cfg } = await sb
      .from("product_intelligence_config").select("*").eq("id", 1).maybeSingle();
    const remaining = await countRemainingActiveProducts(sb);
    const { data: active } = await sb
      .from("product_intelligence_runs")
      .select("id,started_at,report")
      .eq("mode", "scan_all").eq("status", "running")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    let launched: string | null = null;
    const eligible = !!(cfg?.enabled && cfg?.auto_mode && remaining > 0 && !active);
    if (eligible && body.action === "supervisor") {
      const r = await launchScanAll(sb);
      launched = r?.id ?? null;
    }
    return json({
      ok: true,
      action: body.action,
      remaining_active_products: remaining,
      active_run_id: active?.id ?? null,
      launched_run_id: launched,
      engine_enabled: !!cfg?.enabled,
      auto_mode: !!cfg?.auto_mode,
    });
  }

  // Load config
  const { data: config } = await sb
    .from("product_intelligence_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (!config) return json({ ok: false, reason: "config_missing" }, 500);

  // Dry run — always available, never consumes credits, works even when engine is disabled.
  if (mode === "dry_run") {
    const diag = await computeDryRunDiagnostics(sb, config);
    // Log a dry_run row (best-effort) for observability
    const { data: dryRun } = await sb
      .from("product_intelligence_runs")
      .insert({
        trigger_source: trigger,
        mode: "dry_run",
        status: "success",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        products_targeted: diag.products_requiring_enrichment,
        credits_used: 0,
        report: diag,
      })
      .select()
      .single();
    return json({
      ok: true,
      mode: "dry_run",
      engine_enabled: !!config.enabled,
      run_id: dryRun?.id ?? null,
      ...diag,
    });
  }

  if (!config.enabled) {
    return json({
      ok: true,
      killed: true,
      reason: "engine_disabled",
      message: "product_intelligence_config.enabled = false. No products were scanned. Zero credits used.",
    });
  }

  // Duplicate guard: a resume request must reuse an actually-live scan_all run.
  // Skipped when this invocation is itself a self-chain continuation of that run.
  if (mode === "scan_all" && !(body.continuation && body.existing_run_id)) {
    const { data: activeRun } = await sb
      .from("product_intelligence_runs")
      .select("id,products_targeted,products_scanned,products_failed,credits_used,started_at,report")
      .eq("mode", "scan_all")
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeRun) {
      return json({
        ok: true,
        run_id: activeRun.id,
        status: "running",
        queued_products: await countRemainingActiveProducts(sb),
        message: "Existing scan_all is already running. Reusing active run; no duplicate started.",
      });
    }
  }

  // Create or reuse run row. Continuations reuse the existing scan_all run so the
  // checkpoint chain stays contiguous across edge-runtime hops.
  let run: any;
  if (mode === "scan_all" && body.continuation && body.existing_run_id) {
    const { data: existing } = await sb.from("product_intelligence_runs")
      .select("*").eq("id", body.existing_run_id).maybeSingle();
    if (!existing) return json({ ok: false, reason: "continuation_run_missing" }, 404);
    if (existing.status !== "running") {
      // Run was reaped or completed; do not resurrect zombies.
      return json({ ok: true, run_id: existing.id, status: existing.status, message: "run no longer running" });
    }
    run = existing;
  } else {
    const { data: created, error: runErr } = await sb
      .from("product_intelligence_runs")
      .insert({
        trigger_source: trigger,
        mode,
        status: "running",
        started_at: new Date().toISOString(),
        report: { heartbeat_at: new Date().toISOString(), mode, scanned: 0, failed: 0, credits_used: 0 },
      })
      .select().single();
    if (runErr || !created) return json({ ok: false, reason: "run_insert_failed", error: runErr?.message }, 500);
    run = created;
  }

  // Select products — for scan_all use a bounded batch so each invocation stays
  // well under the edge-runtime wall clock. The orchestrator self-chains until
  // the queue drains or credits are exhausted.
  const productCols = "id,name,slug,category,description,price,images";
  const batchSize = Math.max(
    1,
    Number(body.limit ?? (mode === "scan_all" || mode === "force_rebuild" ? (config.batch_size ?? 20) : config.max_products_per_run ?? 25)),
  );
  const effectiveLimit = mode === "scan_all" || mode === "force_rebuild"
    ? Math.min(batchSize, 50)
    : Math.min(batchSize, 200);
  let q = sb.from("products").select(productCols).eq("is_active", true).limit(effectiveLimit);
  if (mode === "scan_one" && body.product_id) {
    q = sb.from("products").select(productCols).eq("id", body.product_id).limit(1);
  } else if (mode === "scan_one") {
    q = sb.from("products").select(productCols).eq("is_active", true).limit(1);
  } else if (mode === "scan_all") {
    // resume — pull a SMALL batch of unenriched ids first to avoid scanning 10k rows
    const { data: already } = await sb.from("product_intelligence").select("product_id").limit(10000);
    const done = new Set((already ?? []).map((r: any) => r.product_id));
    const { data: allActive } = await sb.from("products").select("id").eq("is_active", true).limit(10000);
    const todoIds = (allActive ?? []).map((r: any) => r.id).filter((id: string) => !done.has(id)).slice(0, effectiveLimit);
    if (todoIds.length === 0) {
      // queue empty — mark success and stop chain
      await sb.from("product_intelligence_runs").update({
        status: "success",
        finished_at: new Date().toISOString(),
        report: { ...(run.report ?? {}), completed_at: new Date().toISOString(), reason: "queue_empty" },
      }).eq("id", run.id);
      return json({ ok: true, run_id: run.id, status: "success", queued_products: 0, message: "All active products enriched." });
    }
    q = sb.from("products").select(productCols).in("id", todoIds);
  } else if (mode === "force_rebuild") {
    q = sb.from("products").select(productCols).eq("is_active", true).limit(effectiveLimit);
  }
  const { data: products, error: pErr } = await q;
  if (pErr) {
    await sb.from("product_intelligence_runs").update({ status: "failed", error_message: pErr.message, finished_at: new Date().toISOString() }).eq("id", run.id);
    return json({ ok: false, reason: pErr.message }, 500);
  }

  let list = products ?? [];
  // For scan_all, products_targeted should reflect the total queue, not just this batch.
  if (mode === "scan_all") {
    const remainingTotal = await countRemainingActiveProducts(sb);
    await sb.from("product_intelligence_runs").update({
      products_targeted: (run.products_scanned ?? 0) + remainingTotal,
    }).eq("id", run.id);
  } else {
    await sb.from("product_intelligence_runs").update({ products_targeted: list.length }).eq("id", run.id);
  }

  if (!LOVABLE_API_KEY) {
    await sb.from("product_intelligence_runs").update({ status: "failed", error_message: "LOVABLE_API_KEY missing", finished_at: new Date().toISOString() }).eq("id", run.id);
    return json({ ok: false, reason: "lovable_api_key_missing" }, 500);
  }

  // Load Pinterest boards once for Phase 4 mapping
  const { data: boards } = await sb.from("pinterest_boards").select("id,name,description").limit(200);
  const boardList = (boards ?? []).map((b: any) => ({ name: b.name, description: b.description ?? "" }));

  // For scan_one, run synchronously and return full diagnostics. For everything
  // else, kick off the loop in the background so the edge function returns immediately
  // and the request does not hit the wall-time limit on large batches.
  const runLoop = async () => {
    console.log(`[run ${run.id}] loop start, products=${list.length}`);
    // Continuations: keep aggregated counters across hops.
    let scanned = Number(run.products_scanned ?? 0);
    let failed = Number(run.products_failed ?? 0);
    let skipped = Number(run.report?.counts?.skipped ?? 0);
    let creditsUsed = Number(run.credits_used ?? 0);
    let batchScanned = 0;
    let batchFailed = 0;
    const failures: Array<Record<string, unknown>> = [];
    let blocked: { status: number; provider_error: string; product_id: string } | null = null;
    let firstFailing: Record<string, unknown> | null = null;
    let lastProgressAt = 0;
    let lastProductId: string | null = run.report?.last_product_id ?? null;

    for (const p of list) {
    console.log(`[run ${run.id}] -> ${p.id} ${String(p.name).slice(0,40)}`);
    // Phase 2 — Google category (deterministic, free)
    const gpc = classifyGoogleProductCategory(p.name, p.category, p.description);

    // Try AI with one retry on non-credit failures.
    let aiCall = await callIntelligenceAI(config.model, p, gpc, boardList);
    let retryOutcome: string | null = null;
    if (!aiCall.ok && aiCall.status !== 402) {
      const retry = await callIntelligenceAI(config.model, p, gpc, boardList);
      retryOutcome = retry.ok ? "retry_success" : `retry_failed_${retry.status}`;
      aiCall = retry;
    }

    if (!aiCall.ok && aiCall.status === 402) {
      // Credits exhausted — stop scan immediately, do NOT mark products as failed.
      blocked = { status: 402, provider_error: aiCall.providerError ?? "payment_required", product_id: p.id };
      skipped += list.length - batchScanned - batchFailed; // remaining in THIS batch including this one
      break;
    }

    if (!aiCall.ok) {
      failed++;
      batchFailed++;
      const diag = {
        product_id: p.id,
        product_name: p.name,
        http_status: aiCall.status,
        provider_error: aiCall.providerError,
        gemini_response: aiCall.rawSnippet,
        stack: aiCall.stack,
        retry_outcome: retryOutcome,
        at: new Date().toISOString(),
      };
      failures.push(diag);
      if (!firstFailing) firstFailing = diag;
      await sb.from("product_intelligence").upsert({
        product_id: p.id,
        intelligence_version: config.intelligence_version,
        last_scanned_at: new Date().toISOString(),
        scan_status: "failed",
        scan_error: `http_${aiCall.status}:${(aiCall.providerError ?? "").slice(0, 200)}`,
      }, { onConflict: "product_id" });
      lastProductId = p.id;
      if (Date.now() - lastProgressAt > 3000) {
        await sb.from("product_intelligence_runs").update({
          products_scanned: scanned, products_failed: failed,
          error_message: firstFailing ? String((firstFailing as any).provider_error ?? "") : null,
          report: { ...(run.report ?? {}), heartbeat_at: new Date().toISOString(), mode, scanned, failed, credits_used: creditsUsed, last_product_id: lastProductId, counts: { scanned_success: scanned, scanned_failed: failed, skipped } },
        }).eq("id", run.id);
        lastProgressAt = Date.now();
      }
      continue;
    }

    const ai = aiCall.parsed ?? {};
    creditsUsed += Number(config.estimated_credits_per_product);

    try {

      // Phase 10 — opportunity score (deterministic blend)
      const opportunity = computeOpportunityScore(p, ai);
      const conversion = computeConversionScore(p, ai);
      const trend = computeTrendScore(p, ai);
      const feed = analyseFeed(p, ai);
      const priority = derivePriorityLevel(opportunity.score, conversion, trend.score);

      await sb.from("product_intelligence").upsert({
        product_id: p.id,
        intelligence_version: config.intelligence_version,
        last_scanned_at: new Date().toISOString(),
        scan_status: "ok",
        scan_error: null,
        google_product_category: gpc.path,
        google_product_category_id: gpc.id,
        google_category_path: gpc.path,
        google_category_confidence: gpc.confident ? 0.95 : 0.5,
        pinterest_topics: ai.pinterest_topics ?? [],
        pinterest_interests: ai.pinterest_interests ?? [],
        pinterest_audience: ai.pinterest_audience ?? [],
        seasonality: ai.seasonality ?? [],
        topic_confidence: ai.topic_confidence ?? null,
        primary_board: ai.primary_board ?? null,
        secondary_boards: ai.secondary_boards ?? [],
        recommended_boards: [
          ...(ai.primary_board ? [ai.primary_board] : []),
          ...((ai.secondary_boards as string[] | undefined) ?? []),
        ],
        seo_title: ai.seo_title ?? null,
        seo_description: ai.seo_description ?? null,
        pinterest_title: ai.pinterest_title ?? null,
        pinterest_description: ai.pinterest_description ?? null,
        primary_keyword: ai.primary_keyword ?? null,
        primary_keywords: ai.primary_keyword ? [ai.primary_keyword, ...((ai.secondary_keywords as string[] | undefined) ?? []).slice(0, 2)] : [],
        secondary_keywords: ai.secondary_keywords ?? [],
        long_tail_keywords: ai.long_tail_keywords ?? [],
        pinterest_keywords: ai.pinterest_keywords ?? [],
        keyword_score: ai.keyword_score ?? null,
        intent_type: ai.intent_type ?? null,
        intent_score: ai.intent_score ?? null,
        intent_confidence: ai.intent_score ?? null,
        opportunity_score: opportunity.score,
        opportunity_tier: opportunity.tier,
        opportunity_factors: opportunity.factors,
        trend_score: trend.score,
        trend_reason: trend.reason,
        conversion_score: conversion,
        merchant_feed_quality_score: feed.quality,
        priority_level: priority,
        product_tags: ai.product_tags ?? [],
        feed_optimization_status: feed.issues.length === 0 ? "optimized" : "needs_attention",
        feed_issues: feed.issues,
        feed_recommendations: feed.recommendations,
        feed_fixes: ai.feed_fixes ?? [],
      }, { onConflict: "product_id" });
      scanned++;
      batchScanned++;
      lastProductId = p.id;
      if (Date.now() - lastProgressAt > 3000) {
        await sb.from("product_intelligence_runs").update({
          products_scanned: scanned, products_failed: failed, credits_used: creditsUsed,
          report: { ...(run.report ?? {}), heartbeat_at: new Date().toISOString(), mode, scanned, failed, credits_used: creditsUsed, last_product_id: lastProductId, counts: { scanned_success: scanned, scanned_failed: failed, skipped } },
        }).eq("id", run.id);
        lastProgressAt = Date.now();
      }
    } catch (e) {
      failed++;
      batchFailed++;
      const err = e as Error;
      const diag = {
        product_id: p.id,
        product_name: p.name,
        http_status: 0,
        provider_error: `persist_error:${err.message}`,
        stack: err.stack ?? null,
        retry_outcome: retryOutcome,
        at: new Date().toISOString(),
      };
      failures.push(diag);
      if (!firstFailing) firstFailing = diag;
    }
    }

    // For scan_all: if more work remains and we are NOT blocked, keep the run
    // "running" and self-chain. Otherwise finalize.
    const remainingAfter = mode === "scan_all" ? await countRemainingActiveProducts(sb) : 0;
    const shouldChain = mode === "scan_all" && !blocked && remainingAfter > 0;
    const status = blocked ? "blocked_no_credits" : (shouldChain ? "running" : "success");
  const rootCause = blocked
    ? `AI credits exhausted (HTTP 402) on product ${blocked.product_id}. ${blocked.provider_error}`
    : firstFailing
      ? `${failed} product(s) failed. First: HTTP ${firstFailing.http_status} — ${firstFailing.provider_error}`
      : null;
  const proposedFix = blocked
    ? "Top up the Lovable AI workspace credits, then re-run the scan. No products were marked failed."
    : firstFailing
      ? "Inspect failing product diagnostics below. Common fixes: shorter description, retry after a few minutes, switch model."
      : null;

  await sb.from("product_intelligence_runs").update({
    status,
    error_message: blocked ? "blocked_no_credits" : (firstFailing ? String(firstFailing.provider_error ?? "") : null),
    products_scanned: scanned,
    products_failed: failed,
    credits_used: creditsUsed,
    finished_at: shouldChain ? null : new Date().toISOString(),
    report: {
      ...(run.report ?? {}),
      mode,
      heartbeat_at: new Date().toISOString(),
      last_product_id: lastProductId,
      remaining_after_batch: remainingAfter,
      counts: {
        scanned_success: scanned,
        scanned_failed: failed,
        blocked_no_credits: blocked ? 1 : 0,
        skipped,
      },
      credits_used: creditsUsed,
      blocked,
      first_failing: firstFailing,
      failures: failures.slice(0, 25),
      root_cause: rootCause,
      proposed_fix: proposedFix,
    },
  }).eq("id", run.id);

  // Self-chain: fire next batch on a fresh edge invocation so the runtime
  // wall-clock resets. No await — the current invocation can exit cleanly.
  if (shouldChain) {
    fireSelfChain(run.id).catch((e) => console.error("[self-chain]", e));
  }
    return { status, scanned, failed, skipped, blocked, firstFailing, rootCause, proposedFix, creditsUsed };
  };

  // Synchronous when explicitly requested or for small scans; background otherwise.
  const runSync = mode === "scan_one" || (body.background === false) || (list.length <= 15 && body.background !== true);
  if (runSync) {
    const r = await runLoop();
    return json({
      ok: true,
      run_id: run.id,
      status: r.status,
      scanned: r.scanned,
      failed: r.failed,
      skipped: r.skipped,
      blocked: r.blocked,
      first_failing: r.firstFailing,
      root_cause: r.rootCause,
      proposed_fix: r.proposedFix,
      credits_used: r.creditsUsed,
    });
  }

  // Background execution for batch modes — return immediately with run_id.
  background(runLoop().catch(async (e) => {
    const err = e as Error;
    await sb.from("product_intelligence_runs").update({
      status: "failed",
      error_message: `loop_crash:${err.message}`,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
  }));

  return json({
    ok: true,
    run_id: run.id,
    status: "running",
    queued_products: list.length,
    message: "Scan started in background. Poll product_intelligence_runs for progress.",
  });
});

interface AiCallResult {
  ok: boolean;
  status: number;
  providerError?: string;
  rawSnippet?: string;
  parsed?: any;
  stack?: string;
}

async function callIntelligenceAI(model: string, p: any, gpc: any, boards: { name: string; description: string }[]): Promise<AiCallResult> {
  const boardNames = boards.map((b) => b.name).slice(0, 40);
  const system = `You are a Pinterest + SEO product intelligence engine for a US pet supplies brand.
Return STRICT JSON only. No prose. No markdown.`;
  const user = `Product:
name: ${p.name ?? ""}
category: ${p.category ?? ""}
description: ${(p.description ?? "").slice(0, 1200)}
google_category: ${gpc.path ?? ""}

Available Pinterest boards (pick from these names ONLY):
${boardNames.join(", ")}

Return JSON with this exact shape:
{
  "pinterest_topics": [string, ...],          // 3-6 Pinterest interest topics
  "pinterest_interests": [string, ...],        // 3-6 Pinterest user interests (e.g. "cat lovers")
  "pinterest_audience": [string, ...],         // 2-4 audience segments (e.g. "new pet parents")
  "seasonality": [string, ...],                // months/seasons (e.g. "fall","winter","year-round")
  "topic_confidence": number,                  // 0..1
  "primary_board": string,                     // must be one of the boards listed
  "secondary_boards": [string, ...],           // 0-2 from the board list
  "seo_title": string,                         // 50-70 chars, keyword-led
  "seo_description": string,                   // 140-160 chars, conversion oriented
  "pinterest_title": string,                   // <=100 chars, Pinterest-search-optimized
  "pinterest_description": string,             // 200-500 chars, with CTA
  "primary_keyword": string,
  "secondary_keywords": [string, ...],         // 3-6
  "long_tail_keywords": [string, ...],         // 3-6
  "pinterest_keywords": [string, ...],         // 5-10 Pinterest-search-friendly
  "keyword_score": number,                     // 0..100
  "intent_type": "Informational"|"Commercial"|"Transactional"|"Problem Solving"|"Gift Buying"|"Luxury"|"Impulse Purchase",
  "intent_score": number,                      // 0..1
  "product_tags": [string, ...],
  "feed_fixes": [string, ...]
}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const raw = await res.text();
    if (!res.ok) {
      let providerError = raw.slice(0, 500);
      try {
        const j = JSON.parse(raw);
        providerError = j?.error?.message ?? j?.message ?? providerError;
      } catch { /* keep raw */ }
      return { ok: false, status: res.status, providerError, rawSnippet: raw.slice(0, 800) };
    }
    let j: any = {};
    try { j = JSON.parse(raw); } catch { /* */ }
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    return { ok: true, status: res.status, parsed, rawSnippet: content.slice(0, 800) };
  } catch (e) {
    const err = e as Error;
    return { ok: false, status: 0, providerError: `network:${err.message}`, stack: err.stack };
  }
}

function computeOpportunityScore(p: any, ai: any): { score: number; tier: string; factors: Record<string, number> } {
  const factors = {
    keyword: Number(ai.keyword_score ?? 50),
    intent: Math.round(Number(ai.intent_score ?? 0.5) * 100),
    topic_strength: Math.round(Number(ai.topic_confidence ?? 0.5) * 100),
    has_price: p.price && Number(p.price) > 0 ? 100 : 0,
    has_images: Array.isArray(p.images) && p.images.length > 0 ? 100 : 0,
  };
  const score = Math.round(
    (factors.keyword * 0.35) +
    (factors.intent * 0.20) +
    (factors.topic_strength * 0.20) +
    (factors.has_price * 0.10) +
    (factors.has_images * 0.15),
  );
  const tier = score >= 85 ? "Very High" : score >= 70 ? "High" : score >= 50 ? "Medium" : "Low";
  return { score, tier, factors };
}

// Phase 8 — Conversion score (0-100, deterministic)
function computeConversionScore(p: any, ai: any): number {
  const price = Number(p.price ?? 0);
  const images = Array.isArray(p.images) ? p.images.length : 0;
  const descLen = (p.description ?? "").length;
  const priceScore = price > 0 && price <= 150 ? 100 : price > 0 ? 70 : 0;
  const imageScore = Math.min(100, images * 25);
  const descScore = descLen >= 200 ? 100 : descLen >= 80 ? 60 : 20;
  const keywordScore = Number(ai.keyword_score ?? 40);
  const intentBoost = Math.round(Number(ai.intent_score ?? 0.5) * 100);
  return Math.round(priceScore * 0.25 + imageScore * 0.2 + descScore * 0.15 + keywordScore * 0.2 + intentBoost * 0.2);
}

// Phase 7 — Trend score (deterministic + seasonality hint)
function computeTrendScore(p: any, ai: any): { score: number; reason: string } {
  const topicConf = Number(ai.topic_confidence ?? 0.5);
  const seasonal = Array.isArray(ai.seasonality) ? ai.seasonality.length : 0;
  const tags = Array.isArray(ai.product_tags) ? ai.product_tags.length : 0;
  const score = Math.round(topicConf * 60 + Math.min(seasonal, 4) * 5 + Math.min(tags, 6) * 3 + 10);
  const reason = seasonal > 0 ? `Seasonal signals: ${(ai.seasonality as string[]).join(", ")}` : "Evergreen category baseline";
  return { score: Math.min(100, score), reason };
}

// Phase 10 — Feed repair analysis
function analyseFeed(p: any, ai: any): { quality: number; issues: string[]; recommendations: string[] } {
  const issues: string[] = [];
  const recommendations: string[] = [];
  if (!p.description || p.description.length < 80) { issues.push("missing_or_thin_description"); recommendations.push("Expand description to 200+ chars"); }
  if (!Array.isArray(p.images) || p.images.length === 0) { issues.push("no_images"); recommendations.push("Upload at least 3 product images"); }
  if (!p.category) { issues.push("missing_category"); recommendations.push("Assign primary category"); }
  if (!ai.seo_title) { issues.push("missing_seo_title"); recommendations.push("Generate SEO title 50-70 chars"); }
  if (!ai.primary_board) { issues.push("no_pinterest_mapping"); recommendations.push("Map to a Pinterest board"); }
  const quality = Math.max(0, 100 - issues.length * 18);
  return { quality, issues, recommendations };
}

// Phase 9 — Priority level
function derivePriorityLevel(opportunity: number, conversion: number, trend: number): string {
  const composite = opportunity * 0.5 + conversion * 0.3 + trend * 0.2;
  if (composite >= 85) return "Very High";
  if (composite >= 70) return "High";
  if (composite >= 50) return "Medium";
  return "Low";
}

// Dry run diagnostics — zero AI, zero credits. Always safe to call.
async function computeDryRunDiagnostics(sb: any, config: any) {
  const creditsPerProduct = Number(config.estimated_credits_per_product ?? 0.2);
  const secondsPerProduct = 2; // conservative estimate per AI call

  // Active products
  const { data: products } = await sb
    .from("products")
    .select("id,name,category,description,images,is_active")
    .eq("is_active", true)
    .limit(10000);
  const productList = (products ?? []) as Array<{
    id: string; name: string | null; category: string | null;
    description: string | null; images: unknown;
  }>;
  const totalActive = productList.length;

  // Enrichment rows
  const { data: enriched } = await sb
    .from("product_intelligence")
    .select("product_id,intelligence_version,scan_status,google_product_category,primary_board,seo_title,seo_description,primary_keyword,primary_keywords,pinterest_topics,recommended_boards,feed_optimization_status,feed_issues")
    .limit(10000);
  const eRows = (enriched ?? []) as Array<Record<string, any>>;
  const byProduct = new Map<string, Record<string, any>>();
  for (const r of eRows) byProduct.set(r.product_id, r);

  let alreadyEnriched = 0;
  let missingGoogleCategory = 0;
  let missingPinterestMapping = 0;
  let missingSeoTitle = 0;
  let missingSeoDescription = 0;
  let missingKeywords = 0;
  let missingBoards = 0;
  let feedIssues = 0;
  let requiresRebuild = 0;
  let alreadyComplete = 0;

  const targetVersion = Number(config.intelligence_version ?? 1);

  for (const p of productList) {
    const r = byProduct.get(p.id);
    const hasGoogle = !!r?.google_product_category;
    const hasPin = !!r?.primary_board || (Array.isArray(r?.pinterest_topics) && r!.pinterest_topics.length > 0);
    const hasSeoTitle = !!r?.seo_title;
    const hasSeoDesc = !!r?.seo_description;
    const hasKw = !!r?.primary_keyword || (Array.isArray(r?.primary_keywords) && r!.primary_keywords.length > 0);
    const hasBoards = Array.isArray(r?.recommended_boards) && r!.recommended_boards.length > 0;
    const hasFeedIssues = (Array.isArray(r?.feed_issues) && r!.feed_issues.length > 0) || r?.feed_optimization_status === "needs_attention";
    const versionStale = r ? Number(r.intelligence_version ?? 0) < targetVersion : false;

    if (r && r.scan_status === "ok") alreadyEnriched++;
    if (!hasGoogle) missingGoogleCategory++;
    if (!hasPin) missingPinterestMapping++;
    if (!hasSeoTitle) missingSeoTitle++;
    if (!hasSeoDesc) missingSeoDescription++;
    if (!hasKw) missingKeywords++;
    if (!hasBoards) missingBoards++;
    if (hasFeedIssues) feedIssues++;
    if (versionStale || r?.scan_status === "failed") requiresRebuild++;

    if (r && hasGoogle && hasPin && hasSeoTitle && hasSeoDesc && hasKw && hasBoards && !hasFeedIssues && !versionStale) {
      alreadyComplete++;
    }
  }

  const productsRequiringEnrichment = Math.max(0, totalActive - alreadyComplete);
  const estimatedCredits = +(productsRequiringEnrichment * creditsPerProduct).toFixed(2);
  const estimatedRuntimeSeconds = productsRequiringEnrichment * secondsPerProduct;

  const pct = (n: number) => (totalActive ? Math.round((n / totalActive) * 100) : 0);

  return {
    total_active_products: totalActive,
    already_enriched: alreadyEnriched,
    already_complete: alreadyComplete,
    products_requiring_enrichment: productsRequiringEnrichment,
    missing_google_category: missingGoogleCategory,
    missing_pinterest_mapping: missingPinterestMapping,
    missing_seo_title: missingSeoTitle,
    missing_seo_description: missingSeoDescription,
    missing_keywords: missingKeywords,
    missing_board_assignments: missingBoards,
    feed_issues: feedIssues,
    requires_rebuild: requiresRebuild,
    estimated_credits: estimatedCredits,
    credits_per_product: creditsPerProduct,
    estimated_runtime_seconds: estimatedRuntimeSeconds,
    coverage: {
      catalog_health_pct: pct(alreadyComplete),
      seo_coverage_pct: pct(totalActive - missingSeoTitle),
      pinterest_coverage_pct: pct(totalActive - missingPinterestMapping),
      google_category_coverage_pct: pct(totalActive - missingGoogleCategory),
      feed_quality_pct: pct(totalActive - feedIssues),
    },
  };
}