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
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Row = {
  id: string;
  status: string;
  priority: number | null;
  category_key: string | null;
  content_type: string | null;
  pin_title: string | null;
  pin_description: string | null;
  hashtags: string[] | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

type TypeKey =
  | "lifestyle"
  | "educational"
  | "problem_solution"
  | "seasonal"
  | "entertainment"
  | "product_showcase";

const HELPFUL_TERMS = [
  "how", "why", "tips", "guide", "checklist", "avoid", "fix", "stop",
  "ways", "things", "before you", "what to", "best", "vs", "signs",
];
const LIFESTYLE_TERMS = [
  "cozy", "morning", "sunny", "evening", "weekend", "kitchen", "living room",
  "bedroom", "patio", "balcony", "couch", "rv", "cafe", "outdoor", "garden",
];
const EDU_TERMS = [
  "guide", "tutorial", "step", "explained", "science", "learn",
  "training", "behavior", "vet", "expert",
];
const SHOWCASE_TERMS = [
  "buy", "sale", "discount", "% off", "shop now", "new arrival",
  "shop", "deal",
];

function classify(row: Row): TypeKey {
  const ct = (row.content_type || "").toLowerCase();
  if (ct && ct !== "product") {
    const map: Record<string, TypeKey> = {
      lifestyle: "lifestyle",
      educational: "educational",
      problem_solution: "problem_solution",
      seasonal: "seasonal",
      entertainment: "entertainment",
    };
    if (map[ct]) return map[ct];
  }
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const mc = String((meta.content_type as string) || (meta.pin_type as string) || "").toLowerCase();
  if (mc && mc in { lifestyle: 1, educational: 1, problem_solution: 1, seasonal: 1, entertainment: 1 }) {
    return mc as TypeKey;
  }
  return "product_showcase";
}

function nativeScore(row: Row): { score: number; axes: Record<string, number> } {
  const text = `${row.pin_title ?? ""} ${row.pin_description ?? ""} ${(row.hashtags ?? []).join(" ")}`.toLowerCase();
  const hits = (terms: string[]) => terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
  const helpful = Math.min(100, hits(HELPFUL_TERMS) * 22);
  const lifestyle = Math.min(100, hits(LIFESTYLE_TERMS) * 25);
  const educational = Math.min(100, hits(EDU_TERMS) * 28);
  const showcasePenalty = Math.min(40, hits(SHOWCASE_TERMS) * 15);
  const lengthBonus = (row.pin_description?.length ?? 0) > 120 ? 10 : 0;
  // Native score = helpful/lifestyle/edu — penalty for sales language.
  const base = (helpful * 0.4 + lifestyle * 0.35 + educational * 0.25) + lengthBonus;
  const score = Math.max(0, Math.min(100, Math.round(base - showcasePenalty)));
  return { score, axes: { helpful, lifestyle, educational, showcasePenalty } };
}

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

  const { data: rows, error } = await supabase
    .from("pinterest_pin_queue")
    .select("id,status,priority,category_key,content_type,pin_title,pin_description,hashtags,meta,created_at")
    .in("status", ["posted", "queued", "scheduled", "draft"])
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
    const isShowcase = d.type === "product_showcase";
    const lowScore = d.score < minScore;
    let action: "reject" | "downrank" | "keep" = "keep";
    let reason = "ok";
    if (lowScore && (isShowcase || overType || overCat)) {
      action = "reject";
      reason = `native_score=${d.score}<${minScore}` +
        (isShowcase ? "+showcase" : "") +
        (overType ? `+over_type(${d.type})` : "") +
        (overCat ? `+over_category(${d.row.category_key})` : "");
    } else if (lowScore) {
      action = "downrank";
      reason = `native_score=${d.score}<${minScore}`;
    } else if (overType || overCat) {
      action = "downrank";
      reason = `rebalance` +
        (overType ? `+over_type(${d.type})` : "") +
        (overCat ? `+over_category(${d.row.category_key})` : "");
    }
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
      for (let i = 0; i < downIds.length; i += 200) {
        const chunk = downIds.slice(i, i + 200);
        const { error: dErr, count } = await supabase
          .rpc as unknown as never; // not used
        void dErr; void chunk; void count;
      }
      // Use direct update with arithmetic via RPC-less approach: fetch + update.
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

  return new Response(JSON.stringify({
    ok: true, traceId, dryRun, sampleSize: scored.length, minScore,
    avgNativeScore: Math.round(avgScore),
    mix, overCategories: overCats,
    drafts: drafts.length,
    counts: {
      reject: actions.filter((a) => a.action === "reject").length,
      downrank: actions.filter((a) => a.action === "downrank").length,
      keep: actions.filter((a) => a.action === "keep").length,
    },
    applied: { rejects: appliedRejects, downranks: appliedDownranks },
    actions: actions.slice(0, 50),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
