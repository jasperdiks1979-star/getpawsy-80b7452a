// Phase 6 — Autonomous Pinterest Growth Engine (read-only analysis).
// Reads existing telemetry (Phase 1-5 only). NO Pinterest mutations.
// NO analytics writes. NO schema changes. Returns evidence-based growth
// intelligence: per-pin scoring + classification, root-cause analysis,
// creative-evolution suggestions, rotation/diversity audit, US keyword
// engine, board optimiser, publishing strategy, growth simulation,
// learning summary, and executive command center.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AnyRow = Record<string, any>;

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: { user } } = await sb.auth.getUser(auth.slice(7));
  if (!user) return false;
  const { data: role } = await sb.from("user_roles")
    .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return !!role;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const safeNum = (v: unknown, d = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};
const daysSince = (iso?: string | null): number => {
  if (!iso) return 9999;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 9999;
  return Math.max(0, (Date.now() - t) / 86400000);
};

// ──────────────────────────────────────────────────────────────────────
// Growth Score (0..100) per pin — weighted, normalised log-scale signal.
// Weights documented in /admin/pinterest-growth methodology card.
// ──────────────────────────────────────────────────────────────────────
function logNorm(x: number, cap: number): number {
  if (x <= 0) return 0;
  return clamp((Math.log10(1 + x) / Math.log10(1 + cap)) * 100);
}

type ScoredPin = {
  pin_id: string;
  product_id?: string | null;
  title?: string | null;
  description?: string | null;
  hook?: string | null;
  board_id?: string | null;
  board_name?: string | null;
  impressions: number;
  clicks: number;
  saves: number;
  revenue_cents: number;
  purchases: number;
  ctr: number;
  age_days: number;
  quality_score: number;
  trust_score: number;
  distribution_score: number;
  us_reach_score: number;
  growth_score: number;
  classification: "winner" | "growing" | "stable" | "weak" | "dead" | "needs_replacement";
  confidence: number;
};

function classify(s: number, imp: number, age: number): ScoredPin["classification"] {
  if (imp < 25 && age > 14) return "dead";
  if (s >= 80) return "winner";
  if (s >= 65) return "growing";
  if (s >= 45) return "stable";
  if (s >= 25) return "weak";
  return "needs_replacement";
}

function rootCauses(p: ScoredPin): { cause: string; evidence: string; confidence: number; impact: "low" | "med" | "high"; fix: string }[] {
  const causes: { cause: string; evidence: string; confidence: number; impact: "low" | "med" | "high"; fix: string }[] = [];
  const title = (p.title ?? "").trim();
  const desc = (p.description ?? "").trim();
  if (title.length < 25) causes.push({ cause: "Poor title", evidence: `title length=${title.length}`, confidence: 0.85, impact: "high", fix: "Rewrite to 40-100 chars, lead with outcome + US keyword." });
  if (desc.length < 100) causes.push({ cause: "Weak description", evidence: `desc length=${desc.length}`, confidence: 0.8, impact: "med", fix: "Expand to 150-400 chars with benefit + 3-5 keywords + soft CTA." });
  if (p.ctr > 0 && p.ctr < 0.005 && p.impressions > 200) causes.push({ cause: "Low engagement", evidence: `CTR=${(p.ctr * 100).toFixed(2)}% over ${p.impressions} impr`, confidence: 0.9, impact: "high", fix: "Try new hook + higher-contrast image variant." });
  if (p.quality_score && p.quality_score < 60) causes.push({ cause: "Poor image quality", evidence: `quality_score=${p.quality_score}`, confidence: 0.7, impact: "high", fix: "Regenerate with editorial scene + product realism gate." });
  if (p.us_reach_score < 35) causes.push({ cause: "Weak US relevance", evidence: `us_reach=${p.us_reach_score}`, confidence: 0.75, impact: "high", fix: "Tag with US keywords + retarget US-only board." });
  if (p.distribution_score < 30 && p.age_days > 5) causes.push({ cause: "Low distribution", evidence: `dist=${p.distribution_score}, age=${p.age_days.toFixed(0)}d`, confidence: 0.7, impact: "med", fix: "Move to higher-authority board, refresh metadata." });
  if (p.trust_score < 50) causes.push({ cause: "Low account/board trust", evidence: `trust=${p.trust_score}`, confidence: 0.6, impact: "med", fix: "Reduce post velocity; favour winner variants." });
  return causes.slice(0, 6);
}

async function buildScoredPins(sb: ReturnType<typeof createClient>): Promise<ScoredPin[]> {
  const [perfRes, scoreRes, boardRes] = await Promise.all([
    sb.from("pinterest_pin_performance").select("pin_id,product_id,pin_title,pin_description,hook_angle,impressions,clicks,saves,ctr,performance_score,created_at,status").order("created_at", { ascending: false }).limit(1500),
    sb.from("pin_creative_scores").select("attempt_id,product_id,visual_realism,product_match,overall,board_score,ctr_prediction,conversion_prediction,passed_gate,created_at").order("created_at", { ascending: false }).limit(3000),
    sb.from("pinterest_board_performance").select("board_id,board_name,classification,us_share_30d,revenue_cents_30d,clicks_30d,publish_weight").limit(500),
  ]);
  const perf = (perfRes.data ?? []) as AnyRow[];
  const scores = (scoreRes.data ?? []) as AnyRow[];
  const boards = (boardRes.data ?? []) as AnyRow[];

  const scoreByProduct = new Map<string, AnyRow>();
  for (const s of scores) {
    const key = String(s.product_id ?? "");
    if (!key) continue;
    if (!scoreByProduct.has(key)) scoreByProduct.set(key, s);
  }
  const boardLookup = new Map<string, AnyRow>();
  for (const b of boards) boardLookup.set(String(b.board_id ?? ""), b);

  return perf.map((row): ScoredPin => {
    const impressions = safeNum(row.impressions);
    const clicks = safeNum(row.clicks);
    const saves = safeNum(row.saves);
    const ctr = impressions > 0 ? clicks / impressions : safeNum(row.ctr);
    const age = daysSince(row.created_at as string | undefined);
    const sc = scoreByProduct.get(String(row.product_id ?? ""));
    const quality_score = sc ? clamp(safeNum(sc.overall) * 100) : 50;
    const board = sc?.board_id ? boardLookup.get(String(sc.board_id)) : undefined;
    const us_reach_score = board ? clamp(safeNum(board.us_share_30d) * 100) : 40;
    const distribution_score = clamp(logNorm(impressions, 5000) * 0.7 + (board ? safeNum(board.publish_weight) * 30 : 15));
    const trust_score = board?.classification === "winner" ? 85 : board?.classification === "stable" ? 70 : 55;

    const wImpr = logNorm(impressions, 5000) * 0.20;
    const wClicks = logNorm(clicks, 200) * 0.20;
    const wSaves = logNorm(saves, 100) * 0.10;
    const wCtr = clamp(ctr * 100 * 20) * 0.15;
    const wQuality = quality_score * 0.15;
    const wUs = us_reach_score * 0.10;
    const wFresh = clamp(100 - age * 2) * 0.05;
    const wTrust = trust_score * 0.05;
    const growth_score = Math.round(clamp(wImpr + wClicks + wSaves + wCtr + wQuality + wUs + wFresh + wTrust));

    const confidence = clamp(logNorm(impressions, 1000) / 100, 0, 1);
    return {
      pin_id: String(row.pin_id ?? ""),
      product_id: row.product_id ?? null,
      title: row.pin_title ?? null,
      description: row.pin_description ?? null,
      hook: row.hook_angle ?? null,
      board_id: sc?.board_id ?? null,
      board_name: sc?.board_name ?? null,
      impressions, clicks, saves,
      revenue_cents: 0,
      purchases: 0,
      ctr,
      age_days: age,
      quality_score: Math.round(quality_score),
      trust_score,
      distribution_score: Math.round(distribution_score),
      us_reach_score: Math.round(us_reach_score),
      growth_score,
      classification: classify(growth_score, impressions, age),
      confidence: Math.round(confidence * 100) / 100,
    };
  });
}

function diversityAudit(pins: ScoredPin[]) {
  const titleMap = new Map<string, number>();
  const productMap = new Map<string, number>();
  const boardMap = new Map<string, number>();
  for (const p of pins) {
    const t = (p.title ?? "").toLowerCase().trim();
    if (t) titleMap.set(t, (titleMap.get(t) ?? 0) + 1);
    if (p.product_id) productMap.set(String(p.product_id), (productMap.get(String(p.product_id)) ?? 0) + 1);
    if (p.board_id) boardMap.set(String(p.board_id), (boardMap.get(String(p.board_id)) ?? 0) + 1);
  }
  const dupTitles = [...titleMap.entries()].filter(([, n]) => n > 1).length;
  const dupProducts = [...productMap.entries()].filter(([, n]) => n > 3).length;
  const total = Math.max(1, pins.length);
  const titleDiversity = Math.round(((titleMap.size) / total) * 100);
  const boardDiversity = Math.round(((boardMap.size) / total) * 100);
  return { dupTitles, dupProducts, titleDiversity, boardDiversity, uniqueBoards: boardMap.size };
}

async function buildPayload(sb: ReturnType<typeof createClient>) {
  const pins = await buildScoredPins(sb);
  const bucket = { winner: 0, growing: 0, stable: 0, weak: 0, dead: 0, needs_replacement: 0 } as Record<ScoredPin["classification"], number>;
  for (const p of pins) bucket[p.classification]++;

  // Module 2 — root causes for underperformers
  const underperformers = pins.filter(p => ["weak", "dead", "needs_replacement"].includes(p.classification)).slice(0, 100);
  const rootCauseList = underperformers.map(p => ({
    pin_id: p.pin_id,
    growth_score: p.growth_score,
    classification: p.classification,
    causes: rootCauses(p),
  }));

  // Module 3 — creative evolution (suggest variants for top opportunities)
  const evolution = pins
    .filter(p => p.classification === "growing" || p.classification === "stable")
    .sort((a, b) => b.growth_score - a.growth_score)
    .slice(0, 30)
    .map(p => ({
      pin_id: p.pin_id,
      base_growth_score: p.growth_score,
      predicted_lift: clamp(Math.round((90 - p.growth_score) * 0.4)),
      vary: ["headline", "hook", "image_layout", "color_palette", "scene"],
      threshold_met: (90 - p.growth_score) * 0.4 >= 8,
    }))
    .filter(e => e.threshold_met);

  // Module 4 — rotation/diversity
  const diversity = diversityAudit(pins);

  // Module 5 — US keyword engine
  const { data: kwBank } = await sb.from("pinterest_keyword_bank")
    .select("keyword,score,ctr_observed,used_count,niche")
    .order("score", { ascending: false }).limit(500);
  const topKeywords = (kwBank ?? []).slice(0, 50);

  // Module 6 — board optimiser
  const { data: boards } = await sb.from("pinterest_board_performance")
    .select("board_id,board_name,classification,us_share_30d,revenue_cents_30d,clicks_30d,publish_weight,impressions_30d,saves_30d,ctr").limit(300);
  const boardRecs = (boards ?? []).map((b: AnyRow) => {
    const us = safeNum(b.us_share_30d);
    const ctr = safeNum(b.ctr);
    const recs: string[] = [];
    if (us < 0.3) recs.push("Reduce posting; low US share");
    if (ctr < 0.005 && safeNum(b.impressions_30d) > 500) recs.push("Refresh metadata / try new hook family");
    if (b.classification === "winner") recs.push("Increase publish_weight by 25%");
    if (safeNum(b.clicks_30d) < 5 && safeNum(b.impressions_30d) > 1000) recs.push("Consider archive or rename");
    return { ...b, recommendations: recs };
  });

  // Module 7 — AI publishing strategy (heuristic, evidence-based on hours of best CTR)
  const hourBuckets = new Array(24).fill(0).map(() => ({ impr: 0, clicks: 0 }));
  for (const p of pins) {
    const created = p.age_days >= 9999 ? null : new Date(Date.now() - p.age_days * 86400000);
    if (!created) continue;
    const h = created.getUTCHours();
    hourBuckets[h].impr += p.impressions;
    hourBuckets[h].clicks += p.clicks;
  }
  const bestHours = hourBuckets
    .map((b, i) => ({ utc_hour: i, ctr: b.impr ? b.clicks / b.impr : 0, impr: b.impr }))
    .filter(b => b.impr > 50)
    .sort((a, b) => b.ctr - a.ctr).slice(0, 6);
  const strategy = {
    pins_per_day: 8,
    gap_minutes: 90,
    best_hours_utc: bestHours,
    us_zone_recommendation: "Stagger across US-East 09:00-12:00, US-Central 13:00-15:00, US-West 17:00-20:00",
  };

  // Module 8 — growth simulation (deterministic, transparent formulas)
  const totalImpr = pins.reduce((s, p) => s + p.impressions, 0);
  const totalClicks = pins.reduce((s, p) => s + p.clicks, 0);
  const baseCtr = totalImpr ? totalClicks / totalImpr : 0;
  const simulate = (multImpr: number, multCtr: number) => {
    const impr = Math.round(totalImpr * multImpr);
    const clicks = Math.round(impr * baseCtr * multCtr);
    const purchases = Math.round(clicks * 0.018);
    const revenue_cents = purchases * 3200;
    return { impressions: impr, clicks, saves: Math.round(clicks * 0.4), purchases, revenue_cents };
  };
  const simulation = {
    current: simulate(1, 1),
    improved: simulate(1.25, 1.2),
    aggressive: simulate(1.6, 1.35),
    seasonal: simulate(1.4, 1.25),
  };

  // Module 9 — continuous learning summary
  const winners = pins.filter(p => p.classification === "winner").slice(0, 50);
  const winningHooks = [...new Set(winners.map(w => w.hook).filter(Boolean))].slice(0, 15);
  const winningBoards = [...new Set(winners.map(w => w.board_name).filter(Boolean))].slice(0, 15);
  const learning = {
    sample_size: pins.length,
    winners: winners.length,
    winning_hooks: winningHooks,
    winning_boards: winningBoards,
    last_updated: new Date().toISOString(),
  };

  // Module 10 — executive
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const executive = {
    overall_health: avg(pins.map(p => p.growth_score)),
    growth_score: avg(pins.map(p => p.growth_score)),
    distribution_score: avg(pins.map(p => p.distribution_score)),
    creative_diversity: diversity.titleDiversity,
    us_readiness: avg(pins.map(p => p.us_reach_score)),
    keyword_coverage: Math.min(100, (topKeywords.length / 250) * 100),
    board_quality: avg((boards ?? []).map((b: AnyRow) => b.classification === "winner" ? 90 : b.classification === "stable" ? 70 : 50)),
    publishing_quality: bestHours.length >= 3 ? 75 : 55,
    predicted_monthly_visitors: simulation.improved.clicks,
    predicted_monthly_revenue_cents: simulation.improved.revenue_cents,
  };

  const opportunities = pins
    .filter(p => p.classification === "growing")
    .sort((a, b) => b.growth_score - a.growth_score).slice(0, 20)
    .map(p => ({ pin_id: p.pin_id, growth_score: p.growth_score, est_revenue_lift_cents: Math.round((90 - p.growth_score) * 250), action: "Scale: clone variants to top US boards" }));
  const risks = pins
    .filter(p => p.classification === "dead" || p.classification === "needs_replacement")
    .slice(0, 20)
    .map(p => ({ pin_id: p.pin_id, growth_score: p.growth_score, reason: rootCauses(p)[0]?.cause ?? "Underperforming", action: "Retire + replace via Creative Evolution" }));
  const improvements = evolution.slice(0, 20).map(e => ({
    pin_id: e.pin_id,
    predicted_lift_pts: e.predicted_lift,
    est_revenue_impact_cents: e.predicted_lift * 350,
    action: `Generate variant — vary: ${e.vary.join(", ")}`,
  }));

  return {
    generated_at: new Date().toISOString(),
    classification_counts: bucket,
    pins_top: pins.slice(0, 200),
    root_causes: rootCauseList,
    evolution,
    diversity,
    keywords: { top: topKeywords, coverage: topKeywords.length },
    boards: boardRecs,
    publishing_strategy: strategy,
    simulation,
    learning,
    executive,
    opportunities,
    risks,
    improvements,
    methodology: {
      growth_score_weights: { impressions: 0.2, clicks: 0.2, saves: 0.1, ctr: 0.15, quality: 0.15, us_reach: 0.1, freshness: 0.05, trust: 0.05 },
      classification_thresholds: { winner: 80, growing: 65, stable: 45, weak: 25, dead: "impr<25 & age>14" },
      confidence: "log-normalised by impressions vs 1000 cap",
      safety: ["read-only", "no Pinterest mutations", "no deletes", "no auto-publish", "originals preserved"],
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!await isAdmin(req)) {
      return new Response(JSON.stringify({ ok: false, error: "admin_required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const payload = await buildPayload(sb);
    return new Response(JSON.stringify({ ok: true, ...payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});