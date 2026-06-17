// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Regen Autopilot
// ─────────────────────────────────────────────────────────────────────────────
// Processes open ai_priority_queue rows of kind `pinterest_creative_regen`.
// For each unique product slug:
//   1. Invokes pinterest-creative-director (action: run_full)
//   2. On success → marks queue rows `done` ONLY when a board-matching
//      pinterest_pin_queue record was inserted after the director call
//      started. Rows whose flagged board did not receive a pin_queue row
//      stay `open` so the next tick retries them.
//   3. On 402 payment_required → stops the run (credits exhausted); rows stay open
//      so the next cron tick automatically resumes once credits are added.
// When the open queue is empty, it runs pinterest-creative-variety-audit and
// returns the audit summary alongside processing totals.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCreditPaused } from "../_shared/pinterest-credit-guard.ts";
import { isHighPriorityCategory, categoryPriorityScore } from "../_shared/pinterest-credit-forecast.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_BASE = `${SUPABASE_URL}/functions/v1`;

function traceId() {
  return crypto.randomUUID().slice(0, 8);
}

async function callFn(name: string, body: unknown) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify(body ?? {}),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const trace = traceId();
  let body: any = {};
  try { body = await req.json(); } catch { /* GET / empty body ok */ }

  // 2026-06 throughput hardening: generate more variants per product so the
  // DiversityGuard has real choice, and skip chronic-failure slugs.
  const maxSlugs = Math.max(1, Math.min(50, Number(body?.maxSlugs ?? 25)));
  const count = Math.max(1, Math.min(10, Number(body?.count ?? 6)));
  const concurrency = Math.max(1, Math.min(8, Number(body?.concurrency ?? 4)));
  // Repeated-failure auto-skip thresholds (rolling 24h).
  const failSkipThreshold = Math.max(3, Number(body?.failSkipThreshold ?? 5));
  const failSkipReasons: string[] = Array.isArray(body?.failSkipReasons)
    ? body.failSkipReasons
    : [
        "duplicate_image_30d",
        "creative_reuse_cap_exceeded",
        "creative_mismatch",
        "product_oos",
      ];
  const force = body?.force !== false;
  const runAudit = body?.runAudit !== false;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Credit protection: if AI gateway is paused due to exhausted credits,
  // skip generation entirely and trigger a probe to detect recovery.
  // The publish pipeline (drain) is intentionally untouched so already-created
  // drafts/queued pins keep flowing.
  const credit = await isCreditPaused(supabase);
  if (credit.paused) {
    // Fire-and-forget probe to test for recovery.
    callFn("pinterest-credit-probe", {}).catch(() => {});
    const { count: openCount } = await supabase
      .from("ai_priority_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .eq("source_kind", "pinterest_creative_regen");
    return new Response(
      JSON.stringify({
        ok: true,
        traceId: trace,
        paused: true,
        credit_state: credit.state,
        last_402_at: credit.last_402_at,
        last_success_at: credit.last_success_at,
        remaining_open: openCount ?? null,
        message: "Credit-exhausted: generation paused. Probe triggered. Publish pipeline unaffected.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Emergency mode: when <20 creatives projected remaining, throttle hard.
  // - reduce parallelism + slug cap
  // - only process high-priority categories (litter, cat trees, interactive,
  //   dog puzzle toys, cat furniture)
  const emergency = credit.emergency_mode === true;
  const effMaxSlugs = emergency ? Math.min(5, maxSlugs) : maxSlugs;
  const effConcurrency = emergency ? 1 : concurrency;
  const effCount = emergency ? Math.min(2, count) : count;

  // Fetch open creative-regen tasks. Group by source_ref (product slug).
  const { data: rows, error } = await supabase
    .from("ai_priority_queue")
    .select("id, source_ref, evidence, priority_score")
    .eq("status", "open")
    .eq("source_kind", "pinterest_creative_regen")
    .order("priority_score", { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // slug → [{ id, board }]
  const slugMap = new Map<string, Array<{ id: string; board: string | null }>>();
  for (const r of rows ?? []) {
    const slug = (r as any).source_ref as string | null;
    if (!slug) continue;
    const board = ((r as any).evidence?.board_name as string | null) ?? null;
    const arr = slugMap.get(slug) ?? [];
    arr.push({ id: (r as any).id, board });
    slugMap.set(slug, arr);
  }

  // ── Auto-skip chronic-failure slugs ───────────────────────────────────────
  // Any slug that produced ≥ failSkipThreshold rejections in the last 24h
  // for the listed reasons is parked for the rest of this run; their queue
  // rows stay open and we'll retry next tick (after the 24h window rolls).
  const allSlugs = Array.from(slugMap.keys());
  const skippedSlugs = new Set<string>();
  if (allSlugs.length > 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: failRows } = await supabase
      .from("pinterest_pin_queue")
      .select("product_slug, rejection_reason")
      .in("product_slug", allSlugs)
      .in("rejection_reason", failSkipReasons)
      .gte("created_at", since)
      .limit(5000);
    const counts = new Map<string, number>();
    for (const r of (failRows ?? []) as any[]) {
      const s = String(r.product_slug || "");
      if (!s) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    for (const [s, n] of counts) {
      if (n >= failSkipThreshold) skippedSlugs.add(s);
    }
  }

  // ── Prioritise products with available stock + valid destination ─────────
  // Skip out-of-stock or inactive products entirely so we don't burn credits
  // on briefs the destination guard would later reject.
  const stockOkSlugs = new Set<string>(allSlugs);
  if (allSlugs.length > 0) {
    const { data: prodRows } = await supabase
      .from("products")
      .select("slug, in_stock, is_active")
      .in("slug", allSlugs);
    for (const r of (prodRows ?? []) as any[]) {
      const ok = r.in_stock !== false && r.is_active !== false;
      if (!ok) stockOkSlugs.add(r.slug); else stockOkSlugs.add(r.slug);
      if (!ok) stockOkSlugs.delete(r.slug);
    }
  }

  // Flatten into (slug, board) pairs so each flagged board gets its own
  // director call — preserves the requested board on the pin_queue row.
  const pairs: Array<{ slug: string; board: string | null; ids: string[] }> = [];
  for (const [slug, items] of slugMap) {
    if (skippedSlugs.has(slug)) continue;
    if (!stockOkSlugs.has(slug)) continue;
    const byBoard = new Map<string, string[]>();
    for (const it of items) {
      const key = it.board ?? "(none)";
      const arr = byBoard.get(key) ?? [];
      arr.push(it.id);
      byBoard.set(key, arr);
    }
    for (const [board, ids] of byBoard) {
      pairs.push({ slug, board: board === "(none)" ? null : board, ids });
    }
  }
  // Sort by category priority when in emergency mode; otherwise preserve the
  // priority_score order coming from ai_priority_queue.
  let ordered = pairs;
  if (emergency) {
    // Pull category for each pair using a quick lookup against products.
    const slugs = Array.from(new Set(pairs.map((p) => p.slug)));
    const { data: prodRows } = await supabase
      .from("products")
      .select("slug, category")
      .in("slug", slugs);
    const catBySlug = new Map<string, string>();
    for (const r of (prodRows ?? []) as any[]) {
      catBySlug.set(r.slug, String(r.category ?? ""));
    }
    ordered = pairs
      .map((p) => ({ p, score: categoryPriorityScore(catBySlug.get(p.slug) ?? p.board) }))
      .filter((x) => isHighPriorityCategory(catBySlug.get(x.p.slug) ?? x.p.board))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);
  }
  const work = ordered.slice(0, effMaxSlugs);
  const results: Array<{
    slug: string;
    board: string | null;
    status: number;
    ok: boolean;
    reason?: string;
    marked_done?: number;
    left_open_no_pin?: boolean;
  }> = [];
  let processed = 0;
  let creditsExhausted = false;

  // Process in parallel batches to fit within edge function CPU budget.
  for (let i = 0; i < work.length; i += effConcurrency) {
    if (creditsExhausted) break;
    const batch = work.slice(i, i + effConcurrency);
    const batchResults = await Promise.all(
      batch.map(async (pair) => {
        const startedAt = new Date().toISOString();
        const { status, json } = await callFn("pinterest-creative-director", {
          action: "run_full",
          productSlug: pair.slug,
          boardName: pair.board,
          count: effCount,
          force,
        });
        return { pair, status, json, startedAt };
      }),
    );
    for (const { pair, status, json, startedAt } of batchResults) {
      const { slug, board, ids } = pair;
      if (status === 402 || json?.error === "payment_required" || /payment_required/i.test(json?.message ?? "")) {
        creditsExhausted = true;
        results.push({ slug, board, status, ok: false, reason: "payment_required" });
        continue;
      }
      const success = status >= 200 && status < 300 && json?.ok !== false;
      if (!success) {
        results.push({
          slug, board,
          status,
          ok: false,
          reason: json?.message ?? `http_${status}`,
        });
        continue;
      }

      // Board-match guard: only mark this pair `done` if a fresh
      // pinterest_pin_queue row exists for (slug, board) created after the
      // director call started AND has status draft or queued. Otherwise
      // leave open for retry.
      const wantBoard = (board ?? "").toLowerCase().trim();
      const { data: freshPins } = await supabase
        .from("pinterest_pin_queue")
        .select("id, board_name, status")
        .eq("product_slug", slug)
        .gte("created_at", startedAt);
      const matched = (freshPins ?? []).some((p: any) => {
        const b = (p.board_name ?? "").toLowerCase().trim();
        const okStatus = p.status === "draft" || p.status === "queued";
        return b === wantBoard && okStatus;
      });

      if (matched) {
        await supabase
          .from("ai_priority_queue")
          .update({ status: "done", updated_at: new Date().toISOString() })
          .in("id", ids);
        processed += 1;
        results.push({ slug, board, status, ok: true, marked_done: ids.length });
      } else {
        results.push({
          slug, board, status, ok: false,
          reason: `no_board_matching_pin_queue_record (wanted "${board}")`,
          left_open_no_pin: true,
        });
      }
    }
  }

  // Count remaining open rows.
  const { count: remaining } = await supabase
    .from("ai_priority_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("source_kind", "pinterest_creative_regen");

  // Run variety audit when the queue is fully drained (and not paused on credits).
  let audit: unknown = null;
  if (runAudit && !creditsExhausted && (remaining ?? 0) === 0) {
    const { status, json } = await callFn("pinterest-creative-variety-audit", {});
    audit = { status, body: json };
  }

  return new Response(
    JSON.stringify({
      ok: true,
      traceId: trace,
      slugs_total: slugMap.size,
      slugs_auto_skipped_chronic: skippedSlugs.size,
      slugs_filtered_no_stock: allSlugs.filter((s) => !stockOkSlugs.has(s)).length,
      effective_variants_per_product: effCount,
      pairs_total: pairs.length,
      pairs_attempted: work.length,
      processed,
      remaining_open: remaining ?? null,
      credits_exhausted: creditsExhausted,
      results,
      audit,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});