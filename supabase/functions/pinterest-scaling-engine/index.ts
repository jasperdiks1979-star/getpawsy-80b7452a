import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

const TOTAL_DAILY_DEFAULT = 30;
const FLOOR_PER_BOARD = 1;
const CAP_PER_BOARD = 8;
const PRIOR_CTR = 0.025;        // 2.5% baseline
const PRIOR_STRENGTH = 200;     // pseudo-impressions for new boards
const HOOK_FATIGUE_THRESHOLD = 0.15; // 15% of volume

function traceId() {
  return crypto.randomUUID().slice(0, 8);
}

function jsonResponse(body: unknown, status = 200, trace = "") {
  return new Response(JSON.stringify({ ok: status < 400, traceId: trace, ...(body as object) }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normalize duplicate category keys (cat-litter vs cat_litter)
function normalizeCat(k: string | null): string {
  if (!k) return "uncategorized";
  return k.toLowerCase().replace(/-/g, "_").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = traceId();

  // Auth: admin user OR internal secret (for cron)
  const authz = req.headers.get("authorization") ?? "";
  const internalKey = req.headers.get("x-internal-secret") ?? "";
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let isAuthorized = false;
  if (internalKey && internalKey === INTERNAL_SECRET) {
    isAuthorized = true;
  } else if (authz.startsWith("Bearer ")) {
    const token = authz.slice(7);
    const { data: u } = await supabase.auth.getUser(token);
    if (u?.user) {
      const { data: roleRow } = await supabase
        .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      isAuthorized = !!roleRow;
    }
  }
  if (!isAuthorized) return jsonResponse({ message: "Unauthorized" }, 401, trace);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const totalDailyTarget: number = Math.max(5, Math.min(80, Number(body.totalDailyTarget) || TOTAL_DAILY_DEFAULT));
  const triggerSource: string = body.trigger || "manual";

  // 1. Active boards
  const { data: boards, error: boardsErr } = await supabase
    .from("pinterest_boards")
    .select("id,name,tier,priority,clicks_30d,saves_30d,revenue_cents_30d")
    .eq("is_blacklisted", false)
    .eq("is_sandbox", false);
  if (boardsErr) return jsonResponse({ message: "boards query failed", error: boardsErr.message }, 500, trace);
  if (!boards?.length) return jsonResponse({ message: "no active boards" }, 400, trace);

  // 2. Per-board pin performance (last 30d) by joining queue → performance
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: queueRows } = await supabase
    .from("pinterest_pin_queue")
    .select("board_id,pinterest_pin_id,category_key,hook_group,product_id,posted_at,status")
    .gte("posted_at", since)
    .not("pinterest_pin_id", "is", null);

  const pinIds = (queueRows ?? []).map((r) => r.pinterest_pin_id).filter(Boolean) as string[];
  const perfMap = new Map<string, { impressions: number; clicks: number; saves: number }>();
  // chunk for IN clause
  for (let i = 0; i < pinIds.length; i += 500) {
    const chunk = pinIds.slice(i, i + 500);
    const { data: perfChunk } = await supabase
      .from("pinterest_pin_performance")
      .select("pin_id,impressions,clicks,saves")
      .in("pin_id", chunk);
    for (const p of perfChunk ?? []) {
      perfMap.set(p.pin_id as string, {
        impressions: p.impressions ?? 0, clicks: p.clicks ?? 0, saves: p.saves ?? 0,
      });
    }
  }

  // Aggregate per board
  const perBoard = new Map<string, { impressions: number; clicks: number; saves: number; pin_count: number }>();
  for (const r of queueRows ?? []) {
    const bid = r.board_id || "_unknown";
    const stat = perBoard.get(bid) ?? { impressions: 0, clicks: 0, saves: 0, pin_count: 0 };
    stat.pin_count += 1;
    const perf = perfMap.get(r.pinterest_pin_id as string);
    if (perf) {
      stat.impressions += perf.impressions;
      stat.clicks += perf.clicks;
      stat.saves += perf.saves;
    }
    perBoard.set(bid, stat);
  }

  // 3. Smoothed CTR per board + allocation
  type BA = {
    board_id: string; board_name: string; pin_count: number;
    impressions: number; clicks: number; saves: number;
    smoothed_ctr: number; weight: number; daily_quota: number; reason: string;
  };
  const analyses: BA[] = boards.map((b) => {
    const s = perBoard.get(b.id) ?? { impressions: 0, clicks: 0, saves: 0, pin_count: 0 };
    const smoothed = (s.clicks + PRIOR_CTR * PRIOR_STRENGTH) / (s.impressions + PRIOR_STRENGTH);
    return {
      board_id: b.id,
      board_name: b.name,
      pin_count: s.pin_count,
      impressions: s.impressions,
      clicks: s.clicks,
      saves: s.saves,
      smoothed_ctr: Number(smoothed.toFixed(5)),
      weight: 0,
      daily_quota: FLOOR_PER_BOARD,
      reason: "",
    };
  });

  const totalWeight = analyses.reduce((s, a) => s + a.smoothed_ctr, 0) || 1;
  let assigned = 0;
  for (const a of analyses) {
    a.weight = Number((a.smoothed_ctr / totalWeight).toFixed(4));
    const raw = Math.round(a.weight * totalDailyTarget);
    a.daily_quota = Math.max(FLOOR_PER_BOARD, Math.min(CAP_PER_BOARD, raw));
    assigned += a.daily_quota;
  }
  // Reconcile to target: drop or boost from lowest CTR
  const sorted = [...analyses].sort((x, y) => x.smoothed_ctr - y.smoothed_ctr);
  while (assigned > totalDailyTarget) {
    const v = sorted.find((a) => a.daily_quota > FLOOR_PER_BOARD);
    if (!v) break;
    v.daily_quota -= 1; assigned -= 1;
  }
  const sortedHi = [...analyses].sort((x, y) => y.smoothed_ctr - x.smoothed_ctr);
  while (assigned < totalDailyTarget) {
    const v = sortedHi.find((a) => a.daily_quota < CAP_PER_BOARD);
    if (!v) break;
    v.daily_quota += 1; assigned += 1;
  }
  for (const a of analyses) {
    a.reason = a.impressions === 0
      ? `cold start — prior CTR ${PRIOR_CTR}`
      : `30d ctr ${(a.clicks / Math.max(1, a.impressions) * 100).toFixed(2)}% → smoothed ${(a.smoothed_ctr * 100).toFixed(2)}%`;
  }

  // 4. Category gap analysis
  const { data: prods } = await supabase
    .from("products")
    .select("category,pinterest_category")
    .eq("is_active", true);
  const productCatCount = new Map<string, number>();
  for (const p of prods ?? []) {
    const key = normalizeCat(p.pinterest_category || p.category);
    productCatCount.set(key, (productCatCount.get(key) ?? 0) + 1);
  }
  const pinCatCount = new Map<string, number>();
  for (const r of queueRows ?? []) {
    const key = normalizeCat(r.category_key);
    pinCatCount.set(key, (pinCatCount.get(key) ?? 0) + 1);
  }
  const totalProducts = (prods ?? []).length || 1;
  const totalQueued = (queueRows ?? []).length || 1;
  const allCats = new Set([...productCatCount.keys(), ...pinCatCount.keys()]);
  const categoryGaps = [...allCats].map((cat) => {
    const prodShare = (productCatCount.get(cat) ?? 0) / totalProducts;
    const pinShare = (pinCatCount.get(cat) ?? 0) / totalQueued;
    const gap = prodShare - pinShare;
    return {
      category: cat,
      product_count: productCatCount.get(cat) ?? 0,
      pin_count_30d: pinCatCount.get(cat) ?? 0,
      product_share: Number(prodShare.toFixed(4)),
      pin_share: Number(pinShare.toFixed(4)),
      gap_score: Number(gap.toFixed(4)),
      status: gap > 0.05 ? "undercovered" : gap < -0.05 ? "overcovered" : "balanced",
    };
  }).filter((c) => c.product_count >= 3 || c.pin_count_30d >= 10)
    .sort((a, b) => b.gap_score - a.gap_score);

  // 5. Hook fatigue
  const hookCount = new Map<string, number>();
  for (const r of queueRows ?? []) {
    const h = (r.hook_group || "").trim();
    if (!h) continue;
    hookCount.set(h, (hookCount.get(h) ?? 0) + 1);
  }
  const hookFatigue = [...hookCount.entries()]
    .map(([hook, count]) => ({
      hook,
      count,
      share: Number((count / totalQueued).toFixed(4)),
      fatigued: count / totalQueued > HOOK_FATIGUE_THRESHOLD,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // 6. Recommendations
  const recs: { type: string; priority: "high" | "medium" | "low"; message: string; detail?: unknown }[] = [];
  for (const g of categoryGaps.slice(0, 5)) {
    if (g.status === "undercovered" && g.product_count >= 5) {
      recs.push({
        type: "expand_category",
        priority: "high",
        message: `Generate more pins for "${g.category}" — ${g.product_count} products but only ${g.pin_count_30d} pins in 30d`,
        detail: g,
      });
    }
  }
  for (const h of hookFatigue.filter((x) => x.fatigued).slice(0, 3)) {
    recs.push({
      type: "retire_hook",
      priority: "high",
      message: `Hook "${h.hook}" is ${(h.share * 100).toFixed(1)}% of all pins — retire or rotate`,
      detail: h,
    });
  }
  for (const a of analyses.filter((x) => x.impressions > 500 && x.smoothed_ctr < PRIOR_CTR * 0.6)) {
    recs.push({
      type: "throttle_board",
      priority: "medium",
      message: `Board "${a.board_name}" has ${a.impressions} impressions but CTR ${(a.smoothed_ctr * 100).toFixed(2)}% — throttled to ${a.daily_quota}/day`,
      detail: { board_id: a.board_id, quota: a.daily_quota },
    });
  }
  for (const a of analyses.filter((x) => x.smoothed_ctr > PRIOR_CTR * 1.5).slice(0, 3)) {
    recs.push({
      type: "scale_board",
      priority: "high",
      message: `Board "${a.board_name}" outperforms baseline (CTR ${(a.smoothed_ctr * 100).toFixed(2)}%) — scaled to ${a.daily_quota}/day`,
      detail: { board_id: a.board_id, quota: a.daily_quota },
    });
  }

  // 7. Persist scaling run + quotas
  const { data: runRow, error: runErr } = await supabase
    .from("pinterest_scaling_runs")
    .insert({
      total_daily_target: totalDailyTarget,
      trigger: triggerSource,
      board_analysis: analyses,
      category_gaps: categoryGaps.slice(0, 40),
      hook_fatigue: hookFatigue,
      recommendations: recs,
      summary: {
        total_boards: analyses.length,
        total_pins_30d: totalQueued,
        total_impressions_30d: analyses.reduce((s, a) => s + a.impressions, 0),
        total_clicks_30d: analyses.reduce((s, a) => s + a.clicks, 0),
        undercovered_cats: categoryGaps.filter((c) => c.status === "undercovered").length,
        fatigued_hooks: hookFatigue.filter((h) => h.fatigued).length,
      },
    })
    .select("id").single();
  if (runErr) return jsonResponse({ message: "run insert failed", error: runErr.message }, 500, trace);

  const today = new Date().toISOString().slice(0, 10);
  const quotaRows = analyses.map((a) => ({
    board_id: a.board_id,
    board_name: a.board_name,
    effective_date: today,
    daily_quota: a.daily_quota,
    smoothed_ctr: a.smoothed_ctr,
    impressions_30d: a.impressions,
    clicks_30d: a.clicks,
    weight: a.weight,
    reason: a.reason,
    run_id: runRow!.id,
  }));
  const { error: qErr } = await supabase
    .from("pinterest_board_quotas")
    .upsert(quotaRows, { onConflict: "board_id,effective_date" });
  if (qErr) return jsonResponse({ message: "quota upsert failed", error: qErr.message, runId: runRow!.id }, 500, trace);

  return jsonResponse({
    message: "scaling engine ran successfully",
    runId: runRow!.id,
    totalDailyTarget,
    boards: analyses.length,
    recommendations: recs.length,
    summary: {
      undercovered_cats: categoryGaps.filter((c) => c.status === "undercovered").length,
      fatigued_hooks: hookFatigue.filter((h) => h.fatigued).length,
    },
  }, 200, trace);
});