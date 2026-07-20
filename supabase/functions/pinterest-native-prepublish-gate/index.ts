// Pre-publish gate: simulates Pinterest-Native Score across the last 300 pins
// and auto-rebalances drafts that fail Helpful/Lifestyle/Educational criteria.
//
// - Reads pin_type_target_ratio + max_category_share_pct from pinterest_runtime_settings
// - Scores last 300 pins on three native axes (helpful, lifestyle, educational) +
//   product/showcase penalty. Range 0..100.
// - Computes current content-type mix and over-represented categories.
// - For status='draft' rows: pins below threshold OR in over-represented buckets
//   are either downranked (priority -= 50) or rejected with rejection_reason.
// - Idempotent + dry-run capable.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { classify, nativeScore, decideAction, type Row, type TypeKey } from "./scoring.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { dryRun?: boolean; sampleSize?: number; minScore?: number } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const dryRun = body.dryRun !== false;
  const sampleSize = Math.min(1000, Math.max(50, body.sampleSize ?? 300));
  const minScore = Math.max(0, Math.min(100, body.minScore ?? 55));

  const { data: settings } = await supabase
    .from("pinterest_runtime_settings")
    .select("pin_type_target_ratio, max_category_share_pct")
    .eq("id", 1)
    .maybeSingle();

  const targets = (settings?.pin_type_target_ratio ?? {
    lifestyle: 0.30, educational: 0.20, problem_solution: 0.20,
    seasonal: 0.15, entertainment: 0.10, product_showcase: 0.05,
  }) as Record<TypeKey, number>;
  const maxCatShare = Number(settings?.max_category_share_pct ?? 10) / 100;

  // Genesis V9.5 (M3) — Brand-cap denominator = rolling 24h of ATTEMPTS
  // (any status except purely archival ones). Keeps the 10% principle,
  // removes the "10% of 3 publishes/day = 0 slots" deadlock.
  const rolling24hCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("pinterest_pin_queue")
    .select("id,status,priority,category_key,content_type,pin_title,pin_description,hashtags,meta,created_at")
    .in("status", ["posted", "queued", "scheduled", "draft", "rejected", "paused", "failed", "skipped"])
    .gte("created_at", rolling24hCutoff)
    .order("created_at", { ascending: false })
    .limit(sampleSize);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message, traceId }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sample = (rows ?? []) as Row[];

  // Mix + category share
  const typeCounts: Record<string, number> = {};
  const catCounts: Record<string, number> = {};
  const scored = sample.map((r) => {
    const t = classify(r);
    const s = nativeScore(r);
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    const ck = r.category_key ?? "(none)";
    catCounts[ck] = (catCounts[ck] ?? 0) + 1;
    return { row: r, type: t, score: s.score, axes: s.axes };
  });
  const total = Math.max(1, scored.length);
  const mix: Record<string, { share: number; target: number; over: boolean }> = {};
  for (const k of Object.keys(targets)) {
    const share = (typeCounts[k] ?? 0) / total;
    mix[k] = { share, target: targets[k as TypeKey], over: share > targets[k as TypeKey] * 1.15 };
  }
  const overCats = Object.fromEntries(
    Object.entries(catCounts).filter(([, n]) => n / total > maxCatShare),
  );
  const avgScore = scored.reduce((n, x) => n + x.score, 0) / total;

  // Decide actions on drafts only.
  const drafts = scored.filter((x) => x.row.status === "draft");
  const actions: Array<{
    id: string; action: "reject" | "downrank" | "keep";
    reason: string; score: number; type: TypeKey; category_key: string | null;
  }> = [];

  for (const d of drafts) {
    const overType = mix[d.type]?.over === true;
    const overCat = d.row.category_key ? overCats[d.row.category_key] !== undefined : false;
    const { action, reason } = decideAction({ score: d.score, minScore, type: d.type, overType, overCat });
    actions.push({
      id: d.row.id, action, reason,
      score: d.score, type: d.type, category_key: d.row.category_key,
    });
  }

  let appliedRejects = 0;
  let appliedDownranks = 0;
  if (!dryRun) {
    const rejectIds = actions.filter((a) => a.action === "reject").map((a) => a.id);
    const downIds = actions.filter((a) => a.action === "downrank").map((a) => a.id);
    if (rejectIds.length) {
      // batch in chunks of 200
      for (let i = 0; i < rejectIds.length; i += 200) {
        const chunk = rejectIds.slice(i, i + 200);
        const reasons = new Map(actions.map((a) => [a.id, a.reason]));
        // single update with shared reason key (per-row reason logged in response)
        const { error: rErr, count } = await supabase
          .from("pinterest_pin_queue")
          .update({
            status: "rejected",
            rejection_reason: `native_gate:${reasons.get(chunk[0]) ?? "low_native"}`,
            updated_at: new Date().toISOString(),
          }, { count: "exact" })
          .in("id", chunk)
          .eq("status", "draft");
        if (rErr) console.error("[gate] reject error", rErr);
        appliedRejects += count ?? 0;
      }
    }
    if (downIds.length) {
      const { data: cur } = await supabase
        .from("pinterest_pin_queue")
        .select("id, priority")
        .in("id", downIds);
      const updates = (cur ?? []).map((r) => ({ id: r.id, priority: (r.priority ?? 0) - 50 }));
      for (const u of updates) {
        const { error: uErr } = await supabase
          .from("pinterest_pin_queue")
          .update({ priority: u.priority, updated_at: new Date().toISOString() })
          .eq("id", u.id)
          .eq("status", "draft");
        if (!uErr) appliedDownranks += 1;
      }
    }
  }

  // Persist audit trail (best-effort; never blocks the response).
  const counts = {
    reject: actions.filter((a) => a.action === "reject").length,
    downrank: actions.filter((a) => a.action === "downrank").length,
    keep: actions.filter((a) => a.action === "keep").length,
  };
  try {
    const decisions = scored.map((x, i) => ({
      id: x.row.id,
      status: x.row.status,
      score: x.score,
      axes: x.axes,
      type: x.type,
      category_key: x.row.category_key,
      decision: x.row.status === "draft"
        ? (actions.find((a) => a.id === x.row.id)?.action ?? "keep")
        : "observe",
      reason: actions.find((a) => a.id === x.row.id)?.reason ?? null,
      idx: i,
    }));
    await supabase.from("pinterest_prepublish_gate_audit").insert({
      trace_id: traceId,
      dry_run: dryRun,
      sample_size: scored.length,
      min_score: minScore,
      avg_native_score: Math.round(avgScore),
      draft_count: drafts.length,
      reject_count: counts.reject,
      downrank_count: counts.downrank,
      keep_count: counts.keep,
      applied_rejects: appliedRejects,
      applied_downranks: appliedDownranks,
      mix,
      over_categories: overCats,
      input_pin_ids: sample.map((r) => r.id),
      decisions,
    });
  } catch (auditErr) {
    console.error("[gate] audit insert failed", auditErr);
  }

  return new Response(JSON.stringify({
    ok: true, traceId, dryRun, sampleSize: scored.length, minScore,
    avgNativeScore: Math.round(avgScore),
    mix, overCategories: overCats,
    drafts: drafts.length,
    counts,
    applied: { rejects: appliedRejects, downranks: appliedDownranks },
    actions: actions.slice(0, 50),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
