// Pinterest Creative Variety Engine — audit + auto-repair drafts.
// ─────────────────────────────────────────────────────────────────────────────
// Reads every draft / ready_for_review row in pinterest_pin_queue, runs each
// through the DiversityGuard, and rewrites overlay_text / pin_title /
// hook_group from the strictly category-scoped creative pools when a cap is
// breached or category mismatch is detected. Never publishes, never deletes.
//
// POST body (all optional):
//   { dryRun?: boolean, minVarietyScore?: number, statuses?: string[] }
//
// Response: full Creative Variety Report (see README in chat).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  DiversityGuard,
  normaliseCategoryKey,
  scoreVariety,
  detectAngle,
  detectBenefit,
} from "../_shared/pinterest-diversity-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function splitOverlay(s: string): [string, string] {
  const t = s || "";
  const sep = t.includes(" • ") ? " • " : t.includes(" | ") ? " | " : null;
  if (!sep) return [t, ""];
  const [h, c] = t.split(sep);
  return [h || "", c || ""];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: { dryRun?: boolean; minVarietyScore?: number; statuses?: string[] } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const dryRun = body.dryRun !== false; // default to dry run for safety
  const minVarietyScore = body.minVarietyScore ?? 75;
  const statuses = body.statuses?.length ? body.statuses : ["draft", "ready_for_review"];

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const guard = new DiversityGuard();
  await guard.load(sb);

  const { data: drafts, error } = await sb
    .from("pinterest_pin_queue")
    .select("id, status, category_key, board_name, hook_group, overlay_text, pin_title, pin_description, product_id")
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const corrected: any[] = [];
  const remainingViolations: any[] = [];
  const categoryMismatch: any[] = [];
  let lowVarietyCount = 0;
  const VALID_CATEGORIES = new Set([
    "litter", "cat_trees", "carriers", "dog_beds", "toys", "cat_essentials",
  ]);

  for (const row of drafts ?? []) {
    const catKey = normaliseCategoryKey(row.category_key);
    const [hRaw, cRaw] = splitOverlay(row.overlay_text || "");
    const headline = hRaw || row.pin_title || "";
    const cta = cRaw || "";
    const text = `${row.overlay_text || ""} ${row.pin_title || ""} ${row.pin_description || ""}`;

    // 1. Category fit
    if (!VALID_CATEGORIES.has(catKey)) {
      categoryMismatch.push({ id: row.id, raw: row.category_key, normalised: catKey });
    }

    const candidate = {
      headline,
      cta,
      hook: row.hook_group || null,
      angle: detectAngle(text),
      benefit: detectBenefit(text),
      product_id: row.product_id,
      pin_queue_id: row.id,
    };

    const ev = guard.evaluate(candidate, catKey);
    const score = scoreVariety(guard, ev.final).total;

    const needsRewrite =
      !ev.ok ||
      Object.keys(ev.replacedFromPool).length > 0 ||
      score < minVarietyScore;

    if (!needsRewrite) {
      guard.register(ev.final, catKey);
      continue;
    }

    // Attempt repair: pull fresh values from the category pool until score >= min.
    let finalHeadline = ev.final.headline;
    let finalCta = ev.final.cta;
    let finalHook = ev.final.hook ?? row.hook_group ?? null;
    let finalScore = score;

    for (let attempt = 0; attempt < 6 && (finalScore < minVarietyScore || !ev.ok); attempt++) {
      const altHead = guard.pickFromPool(catKey, "headline");
      const altCta = guard.pickFromPool(catKey, "cta");
      const altHook = guard.pickFromPool(catKey, "hook");
      if (altHead) finalHeadline = altHead;
      if (altCta) finalCta = altCta;
      if (altHook) finalHook = altHook;
      const rescored = scoreVariety(guard, {
        headline: finalHeadline, cta: finalCta, hook: finalHook,
      });
      finalScore = rescored.total;
      if (finalScore >= minVarietyScore) break;
    }

    const stillBad = finalScore < minVarietyScore;
    if (stillBad) {
      lowVarietyCount++;
      remainingViolations.push({
        id: row.id, category: catKey, reasons: ev.reasons, score: finalScore,
      });
    }

    const newOverlay = finalCta ? `${finalHeadline} • ${finalCta}` : finalHeadline;
    corrected.push({
      id: row.id,
      category: catKey,
      before: { headline, cta, hook: row.hook_group, overlay: row.overlay_text },
      after: { headline: finalHeadline, cta: finalCta, hook: finalHook, overlay: newOverlay },
      score: finalScore,
      reasons: ev.reasons,
    });

    if (!dryRun) {
      await sb.from("pinterest_pin_queue").update({
        overlay_text: newOverlay,
        pin_title: finalHeadline,
        hook_group: finalHook,
      }).eq("id", row.id);
    }

    guard.register({
      headline: finalHeadline, cta: finalCta, hook: finalHook,
    }, catKey);
  }

  const snap = guard.snapshot();
  return new Response(JSON.stringify({
    ok: true,
    dryRun,
    inspected: drafts?.length ?? 0,
    corrected_count: corrected.length,
    low_variety_count: lowVarietyCount,
    category_mismatch_count: categoryMismatch.length,
    remaining_violations: remainingViolations,
    category_mismatch: categoryMismatch.slice(0, 50),
    corrected: corrected.slice(0, 100),
    report: {
      caps: snap.caps,
      totals: snap.totals,
      diversity_scores: snap.scores,
      top_repeated_90: snap.top_repeated_90,
    },
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});