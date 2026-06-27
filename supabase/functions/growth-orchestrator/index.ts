// Phase 8 — Autonomous Growth Orchestrator.
//
// Reuses existing recommendation sources (no duplicated analytics or business
// logic) and writes only orchestration state into growth_orchestrator_* tables.
//
// Actions:
//   run            → collect, dedupe, rank, group, score (default)
//   simulate       → produce simulation rows for plan or rec
//   record_outcome → store learning event and update weights heuristically
//   snapshot       → return latest run + recs + plans for the executive UI
//
// All actions require an authenticated admin (user_roles.role = 'admin').

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AnyRow = Record<string, any>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  // Allow service-role (cron/system) calls to bypass user check.
  if (token === SERVICE_ROLE) {
    return { sb: createClient(SUPABASE_URL, SERVICE_ROLE), user: { id: "system", email: "cron@system" } as any };
  }
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return null;
  const { data: role } = await sb
    .from("user_roles").select("role")
    .eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return role ? { sb, user } : null;
}

function clamp(n: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, n)); }
function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

function slug(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// ── Normalised recommendation shape (matches frontend) ─────────────────
interface Rec {
  dedup_key: string;
  source: string;
  source_id: string | null;
  title: string;
  category: string | null;
  evidence: AnyRow;
  confidence: number;
  expected_impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  est_traffic_gain: number;
  est_revenue_gain: number;
  est_time_to_value_hours: number;
  historical_success: number;
}

function impactBand(conf: number, traffic: number, revenue: number): "high" | "medium" | "low" {
  if (conf >= 0.85 && (traffic > 500 || revenue > 250)) return "high";
  if (conf >= 0.6 || traffic > 100 || revenue > 50) return "medium";
  return "low";
}
function riskFromConfidence(c: number): "low" | "medium" | "high" {
  if (c >= 0.85) return "low";
  if (c >= 0.6) return "medium";
  return "high";
}
function effortFromHint(text: string): "low" | "medium" | "high" {
  const t = (text || "").toLowerCase();
  if (/archive|pause|reschedule|disable|move/.test(t)) return "low";
  if (/regenerate|video|board.*split|board.*merge|new campaign/.test(t)) return "high";
  return "medium";
}
function ttvHoursFromEffort(e: "low" | "medium" | "high") {
  return e === "low" ? 2 : e === "medium" ? 12 : 48;
}

// ── Sources ─────────────────────────────────────────────────────────────

async function collect(sb: ReturnType<typeof createClient>): Promise<Rec[]> {
  const out: Rec[] = [];

  // Existing rec sources (already powering Execution Center, Commander, etc.)
  const [growth, commander, peAi, mi, aci, cro] = await Promise.all([
    sb.from("pinterest_growth_actions")
      .select("id, action_type, product_slug, reason, payload, created_at")
      .order("created_at", { ascending: false }).limit(200),
    sb.from("commander_recommendations")
      .select("id, title, reason, affected_engine, confidence_score, estimated_roi_usd, risk_level, suggested_action, payload, created_at")
      .order("created_at", { ascending: false }).limit(200),
    sb.from("pe_ai_recommendations")
      .select("id, optimizer, recommendation, evidence, confidence, expected_impact, required_action, created_at")
      .order("created_at", { ascending: false }).limit(200),
    sb.from("mi_recommendations")
      .select("id, title, body, confidence, expected_impact, category, created_at")
      .order("created_at", { ascending: false }).limit(200),
    sb.from("aci_recommendations")
      .select("id, title, rationale, confidence, impact_estimate, risk_level, category, created_at")
      .order("created_at", { ascending: false }).limit(200),
    sb.from("cro_findings")
      .select("id, title, evidence, severity, confidence, suggested_fix, category, created_at")
      .order("created_at", { ascending: false }).limit(200),
  ]);

  (growth.data || []).forEach((r: AnyRow) => {
    const conf = clamp(num(r.payload?.confidence, 0.7));
    const traffic = num(r.payload?.estimated_traffic_gain ?? r.payload?.expected_impressions, 100);
    const revenue = num(r.payload?.estimated_revenue_gain ?? r.payload?.expected_revenue, 0);
    const eff = effortFromHint(r.action_type || "");
    out.push({
      dedup_key: `growth:${r.action_type}:${slug(r.product_slug || "global")}`,
      source: "pinterest_growth_engine",
      source_id: String(r.id),
      title: `${r.action_type}: ${r.product_slug ?? "(global)"}`,
      category: "pinterest",
      evidence: { reason: r.reason, payload: r.payload },
      confidence: conf,
      expected_impact: impactBand(conf, traffic, revenue),
      effort: eff,
      risk: riskFromConfidence(conf),
      est_traffic_gain: traffic,
      est_revenue_gain: revenue,
      est_time_to_value_hours: ttvHoursFromEffort(eff),
      historical_success: 0.5,
    });
  });

  (commander.data || []).forEach((r: AnyRow) => {
    const conf = clamp(num(r.confidence_score, 0.7));
    const revenue = num(r.estimated_roi_usd, 0);
    const eff = effortFromHint(r.suggested_action || r.title || "");
    out.push({
      dedup_key: `commander:${slug(r.affected_engine || "")}:${slug(r.title)}`,
      source: r.affected_engine || "commander",
      source_id: String(r.id),
      title: r.title,
      category: r.affected_engine || "strategy",
      evidence: { reason: r.reason, payload: r.payload },
      confidence: conf,
      expected_impact: impactBand(conf, num(r.payload?.estimated_traffic_gain, 0), revenue),
      effort: eff,
      risk: (r.risk_level as Rec["risk"]) || riskFromConfidence(conf),
      est_traffic_gain: num(r.payload?.estimated_traffic_gain, 0),
      est_revenue_gain: revenue,
      est_time_to_value_hours: ttvHoursFromEffort(eff),
      historical_success: 0.5,
    });
  });

  (peAi.data || []).forEach((r: AnyRow) => {
    const conf = clamp(num(r.confidence, 0.7));
    const eff = effortFromHint(r.required_action || r.recommendation || "");
    const title = (r.recommendation || "").slice(0, 120);
    out.push({
      dedup_key: `pe_ai:${slug(r.optimizer || "")}:${slug(title)}`,
      source: r.optimizer || "pe_ai",
      source_id: String(r.id),
      title: title || "PE recommendation",
      category: "pinterest_ads",
      evidence: { evidence: r.evidence, expected_impact: r.expected_impact },
      confidence: conf,
      expected_impact: (r.expected_impact as Rec["expected_impact"]) || impactBand(conf, 0, 0),
      effort: eff,
      risk: riskFromConfidence(conf),
      est_traffic_gain: 0,
      est_revenue_gain: 0,
      est_time_to_value_hours: ttvHoursFromEffort(eff),
      historical_success: 0.5,
    });
  });

  (mi.data || []).forEach((r: AnyRow) => {
    const conf = clamp(num(r.confidence, 0.6));
    const eff = effortFromHint(r.title || "");
    out.push({
      dedup_key: `mi:${slug(r.category || "")}:${slug(r.title)}`,
      source: "market_intelligence",
      source_id: String(r.id),
      title: r.title,
      category: r.category || "market",
      evidence: { body: r.body },
      confidence: conf,
      expected_impact: (r.expected_impact as Rec["expected_impact"]) || impactBand(conf, 0, 0),
      effort: eff,
      risk: riskFromConfidence(conf),
      est_traffic_gain: 0,
      est_revenue_gain: 0,
      est_time_to_value_hours: ttvHoursFromEffort(eff),
      historical_success: 0.5,
    });
  });

  (aci.data || []).forEach((r: AnyRow) => {
    const conf = clamp(num(r.confidence, 0.6));
    const eff = effortFromHint(r.title || "");
    out.push({
      dedup_key: `aci:${slug(r.category || "")}:${slug(r.title)}`,
      source: "aci",
      source_id: String(r.id),
      title: r.title,
      category: r.category || "commerce",
      evidence: { rationale: r.rationale, impact: r.impact_estimate },
      confidence: conf,
      expected_impact: impactBand(conf, 0, num(r.impact_estimate, 0)),
      effort: eff,
      risk: (r.risk_level as Rec["risk"]) || riskFromConfidence(conf),
      est_traffic_gain: 0,
      est_revenue_gain: num(r.impact_estimate, 0),
      est_time_to_value_hours: ttvHoursFromEffort(eff),
      historical_success: 0.5,
    });
  });

  (cro.data || []).forEach((r: AnyRow) => {
    const conf = clamp(num(r.confidence, 0.6));
    const eff = effortFromHint(r.suggested_fix || r.title || "");
    const sev = (r.severity || "").toString().toLowerCase();
    const impact: Rec["expected_impact"] = sev === "high" ? "high" : sev === "low" ? "low" : "medium";
    out.push({
      dedup_key: `cro:${slug(r.category || "")}:${slug(r.title)}`,
      source: "cro_audit",
      source_id: String(r.id),
      title: r.title,
      category: r.category || "cro",
      evidence: { evidence: r.evidence, fix: r.suggested_fix, severity: r.severity },
      confidence: conf,
      expected_impact: impact,
      effort: eff,
      risk: riskFromConfidence(conf),
      est_traffic_gain: 0,
      est_revenue_gain: 0,
      est_time_to_value_hours: ttvHoursFromEffort(eff),
      historical_success: 0.5,
    });
  });

  return out;
}

function dedupe(recs: Rec[]): Rec[] {
  const seen = new Map<string, Rec>();
  for (const r of recs) {
    const prev = seen.get(r.dedup_key);
    if (!prev) { seen.set(r.dedup_key, r); continue; }
    // Keep the higher-confidence variant; merge evidence.
    if (r.confidence > prev.confidence) {
      seen.set(r.dedup_key, { ...r, evidence: { ...prev.evidence, ...r.evidence } });
    } else {
      prev.evidence = { ...r.evidence, ...prev.evidence };
    }
  }
  return [...seen.values()];
}

async function loadWeights(sb: ReturnType<typeof createClient>) {
  const { data } = await sb.from("growth_orchestrator_weights").select("key,weight");
  const w: Record<string, number> = {};
  for (const r of data || []) w[(r as any).key] = num((r as any).weight, 0);
  return {
    impact: w.impact ?? 0.30,
    confidence: w.confidence ?? 0.20,
    risk_penalty: w.risk_penalty ?? 0.15,
    cost_penalty: w.cost_penalty ?? 0.10,
    traffic_gain: w.traffic_gain ?? 0.10,
    conversion_gain: w.conversion_gain ?? 0.10,
    history: w.history ?? 0.05,
  };
}

async function loadHistory(sb: ReturnType<typeof createClient>, keys: string[]): Promise<Record<string, number>> {
  if (!keys.length) return {};
  const { data } = await sb
    .from("growth_orchestrator_outcomes")
    .select("dedup_key,outcome")
    .in("dedup_key", keys);
  const acc: Record<string, { good: number; total: number }> = {};
  for (const r of data || []) {
    const k = (r as any).dedup_key as string;
    if (!k) continue;
    acc[k] ??= { good: 0, total: 0 };
    acc[k].total++;
    const o = (r as any).outcome as string;
    if (o === "executed_success" || o === "accepted") acc[k].good++;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(acc)) out[k] = v.total ? v.good / v.total : 0.5;
  return out;
}

function scoreRec(r: Rec, w: Awaited<ReturnType<typeof loadWeights>>): number {
  const impactScore = r.expected_impact === "high" ? 1 : r.expected_impact === "medium" ? 0.6 : 0.3;
  const riskScore = r.risk === "low" ? 1 : r.risk === "medium" ? 0.6 : 0.3;
  const effortScore = r.effort === "low" ? 1 : r.effort === "medium" ? 0.6 : 0.3;
  const trafficNorm = clamp(Math.log10(1 + r.est_traffic_gain) / Math.log10(1 + 5000));
  const revenueNorm = clamp(Math.log10(1 + r.est_revenue_gain) / Math.log10(1 + 2000));
  const ttvBoost = clamp(1 - Math.min(r.est_time_to_value_hours, 168) / 168);
  return (
    w.impact * impactScore +
    w.confidence * r.confidence +
    w.risk_penalty * riskScore +
    w.cost_penalty * effortScore +
    w.traffic_gain * trafficNorm +
    w.conversion_gain * revenueNorm +
    w.history * r.historical_success +
    0.02 * ttvBoost
  );
}

function detectConflicts(recs: Array<Rec & { id: string }>): Record<string, string[]> {
  // A simple conflict heuristic: two recommendations targeting the same
  // product/category with opposing verbs (pause vs scale, archive vs boost).
  const VERB_PAIRS: Array<[RegExp, RegExp]> = [
    [/pause|archive|disable/i, /scale|boost|increase|expand/i],
    [/merge/i, /split/i],
  ];
  const conflicts: Record<string, string[]> = {};
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i], b = recs[j];
      if ((a.category || "") !== (b.category || "")) continue;
      for (const [x, y] of VERB_PAIRS) {
        if ((x.test(a.title) && y.test(b.title)) || (y.test(a.title) && x.test(b.title))) {
          (conflicts[a.id] ||= []).push(b.id);
          (conflicts[b.id] ||= []).push(a.id);
        }
      }
    }
  }
  return conflicts;
}

function buildPlans(recs: Array<Rec & { id: string; score: number }>) {
  // Group by category. Within a category, dependencies = lower-scored items
  // depend on the top item (operator approves the anchor first).
  const byCat = new Map<string, Array<Rec & { id: string; score: number }>>();
  for (const r of recs) {
    const cat = r.category || "general";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(r);
  }
  const plans: Array<{ title: string; category: string; rec_ids: string[]; depends_on: string[]; score: number }> = [];
  for (const [cat, items] of byCat) {
    items.sort((a, b) => b.score - a.score);
    const top = items.slice(0, 6);
    if (!top.length) continue;
    plans.push({
      title: `${cat[0]?.toUpperCase()}${cat.slice(1)} plan`,
      category: cat,
      rec_ids: top.map(r => r.id),
      depends_on: [],
      score: top.reduce((s, r) => s + r.score, 0) / top.length,
    });
  }
  plans.sort((a, b) => b.score - a.score);
  return plans;
}

// ── Snapshots from existing systems for health/validation scores ────────

async function readScores(sb: ReturnType<typeof createClient>) {
  const [valRun, health, alerts] = await Promise.all([
    sb.from("production_validation_runs")
      .select("status,passed_count,failed_count,warning_count")
      .order("started_at", { ascending: false }).limit(1),
    sb.from("analytics_health_checks")
      .select("probe_key,status,checked_at")
      .order("checked_at", { ascending: false }).limit(200),
    sb.from("analytics_alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  let validationScore = 0;
  const v = (valRun.data || [])[0] as AnyRow | undefined;
  if (v) {
    const total = num(v.passed_count) + num(v.failed_count) + num(v.warning_count);
    validationScore = total ? clamp((num(v.passed_count) + num(v.warning_count) * 0.5) / total) * 100 : 0;
  }

  const seen = new Set<string>(); let g = 0, y = 0, r2 = 0;
  for (const row of (health.data || []) as AnyRow[]) {
    if (seen.has(row.probe_key)) continue;
    seen.add(row.probe_key);
    if (row.status === "green") g++;
    else if (row.status === "yellow") y++;
    else if (row.status === "red") r2++;
  }
  const probeTotal = g + y + r2;
  const probeScore = probeTotal ? ((g + y * 0.5) / probeTotal) * 100 : 0;
  const openAlerts = (alerts as AnyRow).count ?? 0;
  const healthScore = clamp((probeScore - openAlerts * 10) / 100) * 100;

  return { validationScore, healthScore };
}

// ── Handlers ────────────────────────────────────────────────────────────

async function actionRun(sb: ReturnType<typeof createClient>, trigger: string) {
  const { data: runRow, error: runErr } = await sb
    .from("growth_orchestrator_runs")
    .insert({ trigger_source: trigger, status: "running" })
    .select("*").single();
  if (runErr || !runRow) throw runErr || new Error("run_insert_failed");
  const runId = (runRow as AnyRow).id as string;

  try {
    const raw = await collect(sb);
    const deduped = dedupe(raw);
    const weights = await loadWeights(sb);
    const history = await loadHistory(sb, deduped.map(r => r.dedup_key));
    deduped.forEach(r => { r.historical_success = history[r.dedup_key] ?? r.historical_success; });

    // Insert recs (without plan_id yet) so we get their ids.
    const inserts = deduped.map(r => ({
      run_id: runId,
      dedup_key: r.dedup_key,
      source: r.source,
      source_id: r.source_id,
      title: r.title,
      category: r.category,
      evidence: r.evidence,
      confidence: r.confidence,
      expected_impact: r.expected_impact,
      effort: r.effort,
      risk: r.risk,
      est_traffic_gain: r.est_traffic_gain,
      est_revenue_gain: r.est_revenue_gain,
      est_time_to_value_hours: r.est_time_to_value_hours,
      historical_success: r.historical_success,
      score: scoreRec(r, weights),
    }));

    const { data: insertedRaw, error: insErr } = await sb
      .from("growth_orchestrator_recommendations")
      .insert(inserts)
      .select("id,dedup_key,title,category,score,confidence,risk,effort,expected_impact,est_traffic_gain,est_revenue_gain,est_time_to_value_hours");
    if (insErr) throw insErr;
    const inserted = (insertedRaw || []) as AnyRow[];

    // Rank
    inserted.sort((a, b) => num(b.score) - num(a.score));
    await Promise.all(inserted.map((row, idx) =>
      sb.from("growth_orchestrator_recommendations").update({ rank: idx + 1 }).eq("id", row.id),
    ));

    // Conflicts + obsolete
    const enriched = inserted.map(r => ({
      ...(r as any),
      dedup_key: r.dedup_key,
      source: "",
      source_id: null,
      evidence: {},
      confidence: num(r.confidence),
      expected_impact: r.expected_impact,
      effort: r.effort,
      risk: r.risk,
      est_traffic_gain: num(r.est_traffic_gain),
      est_revenue_gain: num(r.est_revenue_gain),
      est_time_to_value_hours: num(r.est_time_to_value_hours),
      historical_success: 0,
    })) as Array<Rec & { id: string; score: number }>;

    const conflicts = detectConflicts(enriched);
    await Promise.all(Object.entries(conflicts).map(([id, others]) =>
      sb.from("growth_orchestrator_recommendations").update({ conflicts_with: others }).eq("id", id),
    ));

    // Plans
    const planDrafts = buildPlans(enriched);
    const planRows = planDrafts.map(p => ({
      run_id: runId,
      title: p.title,
      category: p.category,
      rec_ids: p.rec_ids,
      depends_on: p.depends_on,
      score: p.score,
    }));
    let plansInserted: AnyRow[] = [];
    if (planRows.length) {
      const { data: pIns, error: pErr } = await sb
        .from("growth_orchestrator_plans").insert(planRows).select("*");
      if (pErr) throw pErr;
      plansInserted = pIns || [];
      // back-fill plan_id on recs
      await Promise.all(plansInserted.flatMap((p: AnyRow) =>
        (p.rec_ids as string[]).map((rid: string) =>
          sb.from("growth_orchestrator_recommendations").update({ plan_id: p.id }).eq("id", rid)),
      ));
    }

    // Scores
    const { validationScore, healthScore } = await readScores(sb);
    const topScores = enriched.slice(0, 20).map(e => e.score);
    const growthScore = topScores.length
      ? clamp(topScores.reduce((s, n) => s + n, 0) / topScores.length) * 100
      : 0;

    await sb.from("growth_orchestrator_runs").update({
      finished_at: new Date().toISOString(),
      status: "complete",
      collected_count: raw.length,
      deduped_count: deduped.length,
      plans_count: plansInserted.length,
      growth_score: growthScore,
      health_score: healthScore,
      validation_score: validationScore,
    }).eq("id", runId);

    return {
      ok: true,
      run_id: runId,
      collected: raw.length,
      deduped: deduped.length,
      plans: plansInserted.length,
      growth_score: growthScore,
      health_score: healthScore,
      validation_score: validationScore,
    };
  } catch (e) {
    await sb.from("growth_orchestrator_runs").update({
      finished_at: new Date().toISOString(),
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    }).eq("id", runId);
    throw e;
  }
}

async function actionSimulate(sb: ReturnType<typeof createClient>, body: AnyRow) {
  const recIds: string[] = Array.isArray(body.rec_ids) ? body.rec_ids
    : body.rec_id ? [body.rec_id] : [];
  const planId: string | null = body.plan_id || null;

  let recs: AnyRow[] = [];
  if (recIds.length) {
    const { data } = await sb
      .from("growth_orchestrator_recommendations")
      .select("*").in("id", recIds);
    recs = data || [];
  } else if (planId) {
    const { data: pl } = await sb
      .from("growth_orchestrator_plans").select("rec_ids").eq("id", planId).maybeSingle();
    if (pl) {
      const { data } = await sb.from("growth_orchestrator_recommendations")
        .select("*").in("id", (pl as AnyRow).rec_ids || []);
      recs = data || [];
    }
  }
  if (!recs.length) return { ok: false, error: "no_recs" };

  const traffic = recs.reduce((s, r) => s + num(r.est_traffic_gain), 0);
  const revenue = recs.reduce((s, r) => s + num(r.est_revenue_gain), 0);
  const confidence = recs.reduce((s, r) => s + num(r.confidence), 0) / recs.length;
  const risks = recs
    .filter(r => r.risk !== "low")
    .map(r => ({ rec_id: r.id, title: r.title, risk: r.risk, why: r.evidence?.reason ?? null }));
  const dashboards = Array.from(new Set(recs.map(r => {
    const c = (r.category || "").toLowerCase();
    if (c.includes("pinterest")) return "/admin/pinterest-growth";
    if (c.includes("cro")) return "/admin/cro-command";
    if (c.includes("ads")) return "/admin/pinterest-distribution";
    return "/admin/growth-commander";
  })));
  const pmetrics = Array.from(new Set(recs
    .filter(r => (r.category || "").includes("pinterest"))
    .map(r => r.expected_impact === "high" ? "impressions+ctr+revenue" : "impressions+ctr")));
  const rollback = recs.some(r => r.effort === "high") ? "high"
    : recs.some(r => r.effort === "medium") ? "medium" : "low";
  const minutes = Math.round(recs.reduce((s, r) => s + num(r.est_time_to_value_hours), 0) * 60 / recs.length);

  const { data, error } = await sb
    .from("growth_orchestrator_simulations")
    .insert({
      plan_id: planId,
      rec_id: recIds.length === 1 ? recIds[0] : null,
      estimated_traffic_uplift: traffic,
      estimated_revenue_uplift: revenue,
      estimated_conversion_uplift: confidence,
      risks,
      affected_dashboards: dashboards,
      affected_analytics: ["analytics_funnel_waterfall", "analytics_health_checks"],
      affected_pinterest_metrics: pmetrics,
      rollback_complexity: rollback,
      estimated_impl_minutes: minutes,
      notes: body.notes ?? null,
    })
    .select("*").single();
  if (error) throw error;
  return { ok: true, simulation: data };
}

async function actionRecordOutcome(sb: ReturnType<typeof createClient>, body: AnyRow) {
  const { rec_id, plan_id, dedup_key, outcome, traffic_delta, conversion_delta, pinterest_delta, notes } = body;
  if (!outcome) return { ok: false, error: "outcome_required" };
  const { data, error } = await sb
    .from("growth_orchestrator_outcomes")
    .insert({
      rec_id: rec_id ?? null, plan_id: plan_id ?? null, dedup_key: dedup_key ?? null,
      source: body.source ?? null, outcome,
      traffic_delta: traffic_delta ?? null,
      conversion_delta: conversion_delta ?? null,
      pinterest_delta: pinterest_delta ?? null,
      notes: notes ?? null,
    })
    .select("*").single();
  if (error) throw error;

  // Learning: nudge history weight up/down based on aggregate success rate.
  const { data: agg } = await sb
    .from("growth_orchestrator_outcomes")
    .select("outcome", { count: "exact" })
    .limit(1000);
  if (agg) {
    const total = agg.length;
    const good = agg.filter((r: any) =>
      r.outcome === "executed_success" || r.outcome === "accepted").length;
    const successRate = total ? good / total : 0.5;
    const target = clamp(0.04 + successRate * 0.06, 0.02, 0.15);
    await sb.from("growth_orchestrator_weights")
      .update({ weight: target, updated_at: new Date().toISOString() })
      .eq("key", "history");
  }
  return { ok: true, outcome: data };
}

async function actionSnapshot(sb: ReturnType<typeof createClient>) {
  const { data: runs } = await sb.from("growth_orchestrator_runs")
    .select("*").order("started_at", { ascending: false }).limit(1);
  const run = (runs || [])[0] as AnyRow | undefined;
  if (!run) return { ok: true, run: null, recommendations: [], plans: [], outcomes_summary: null };

  const [recs, plans, outcomes] = await Promise.all([
    sb.from("growth_orchestrator_recommendations")
      .select("*").eq("run_id", run.id).order("rank", { ascending: true }).limit(50),
    sb.from("growth_orchestrator_plans")
      .select("*").eq("run_id", run.id).order("score", { ascending: false }),
    sb.from("growth_orchestrator_outcomes")
      .select("outcome", { count: "exact" }).limit(1),
  ]);

  return {
    ok: true,
    run,
    recommendations: recs.data || [],
    plans: plans.data || [],
    outcomes_total: (outcomes as AnyRow).count ?? 0,
  };
}

// ── Server ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = await requireAdmin(req);
    if (!admin) return json({ error: "forbidden" }, 403);
    let body: AnyRow = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const action = (body.action as string) || "snapshot";
    if (action === "run") return json(await actionRun(admin.sb, body.trigger || "manual"));
    if (action === "simulate") return json(await actionSimulate(admin.sb, body));
    if (action === "record_outcome") return json(await actionRecordOutcome(admin.sb, body));
    if (action === "snapshot") return json(await actionSnapshot(admin.sb));
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: message }, 500);
  }
});