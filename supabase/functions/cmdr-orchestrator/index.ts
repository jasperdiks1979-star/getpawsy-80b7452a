// Wave 6 — Autonomous Commander AI orchestrator (Stage 6A)
// 8 modules: health-scan → goal-eval → resource-plan → model-router
//          → budget-check → decision-engine → simulation → self-healing
// Default mode = simulation. Never invokes downstream engines in 6A.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type StepOut = { step: string; status: "ok" | "skipped" | "failed"; output?: any; error?: string; ms?: number };

async function getSettings() {
  const { data } = await sb.from("cmdr_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? { kill_switch: false, mode: "simulation", autonomy_level: 1, default_model: "google/gemini-3-flash-preview",
    daily_ai_budget_cents: 500, daily_cloud_budget_cents: 500, daily_pinterest_budget_cents: 0, daily_ads_budget_cents: 0 };
}

async function audit(action: string, target: string | null, payload: any, reasoning?: string, confidence?: number, roi?: number, cost?: number) {
  await sb.from("cmdr_audit_log").insert({
    actor: "commander", action, target, payload,
    reasoning, confidence, expected_roi: roi, estimated_cost_cents: cost,
  });
}

// ===== 1. Health scan: snapshot every connected engine =====
const ENGINES = [
  { engine: "agp_growth_scorer", table: "agp_growth_scores", ts: "created_at" },
  { engine: "agp_signal_collector", table: "agp_signals_daily", ts: "created_at" },
  { engine: "agp_intelligence", table: "agp_daily_insights", ts: "created_at" },
  { engine: "aci_orchestrator", table: "aci_runs", ts: "started_at" },
  { engine: "aci_recommendations", table: "aci_recommendations", ts: "created_at" },
  { engine: "pinterest_publish", table: "pinterest_publish_logs", ts: "created_at" },
  { engine: "pinterest_autopilot", table: "pinterest_autopilot_decisions", ts: "created_at" },
  { engine: "cinematic_v3", table: "cinematic_v3_jobs", ts: "created_at" },
  { engine: "cpe_pipeline", table: "cpe_pipeline_runs", ts: "created_at" },
  { engine: "cj_media", table: "cj_media_sync_runs", ts: "created_at" },
  { engine: "seo_engine", table: "seo_engine_runs", ts: "created_at" },
  { engine: "stock_sync", table: "stock_sync_logs", ts: "created_at" },
  { engine: "creative_intelligence", table: "ai_revenue_insights", ts: "created_at" },
  { engine: "trend_engine", table: "growth_market_trends", ts: "created_at" },
  { engine: "forecast_engine", table: "agp_forecasts", ts: "created_at" },
  { engine: "learning_engine", table: "self_improvement_runs", ts: "created_at" },
];

async function healthScan(runId: string): Promise<StepOut> {
  const t = Date.now();
  const rows: any[] = [];
  for (const e of ENGINES) {
    try {
      const { data, error } = await sb.from(e.table).select(`${e.ts}`).order(e.ts, { ascending: false }).limit(1);
      if (error) {
        rows.push({ engine: e.engine, status: "unknown", details: { error: error.message } });
        continue;
      }
      const last = data?.[0]?.[e.ts] ? new Date(data[0][e.ts]) : null;
      const lag = last ? Math.floor((Date.now() - last.getTime()) / 1000) : null;
      let status = "ok";
      if (!last) status = "stale";
      else if (lag! > 60 * 60 * 48) status = "stale";
      else if (lag! > 60 * 60 * 24) status = "lagging";
      rows.push({ engine: e.engine, status, last_run_at: last?.toISOString() ?? null, lag_seconds: lag, error_rate: 0, details: {} });
    } catch (err: any) {
      rows.push({ engine: e.engine, status: "unknown", details: { error: String(err?.message ?? err) } });
    }
  }
  if (rows.length) await sb.from("cmdr_health_signals").insert(rows);
  return { step: "health_scan", status: "ok", output: { engines: rows.length, ok: rows.filter(r => r.status === "ok").length, lagging: rows.filter(r => r.status === "lagging").length, stale: rows.filter(r => r.status === "stale").length }, ms: Date.now() - t };
}

// ===== 2. Goal evaluation =====
async function goalEval(runId: string): Promise<StepOut> {
  const t = Date.now();
  const { data: goals } = await sb.from("cmdr_goals").select("*").eq("status", "active");
  const evals: any[] = [];
  for (const g of goals ?? []) {
    // Stage 6A: pull a current-value proxy when cheaply available, else null.
    let current: number | null = null;
    try {
      if (g.metric === "pinterest_ctr") {
        const { data } = await sb.from("pinterest_analytics_daily").select("clicks,impressions").gte("created_at", new Date(Date.now() - 7 * 86400e3).toISOString());
        const imp = (data ?? []).reduce((s: number, r: any) => s + Number(r.impressions || 0), 0);
        const clk = (data ?? []).reduce((s: number, r: any) => s + Number(r.clicks || 0), 0);
        current = imp > 0 ? (clk / imp) * 100 : 0;
      }
    } catch { /* noop */ }
    evals.push({ goal: g.name, metric: g.metric, target: g.target_value, current, weight: g.weight });
  }
  return { step: "goal_eval", status: "ok", output: { goals: evals.length, evaluations: evals }, ms: Date.now() - t };
}

// ===== 3. Resource plan (no execution in 6A) =====
const PLAN_TEMPLATE = [
  { engine: "agp-signal-collector", priority: 90, cost: 0 },
  { engine: "agp-growth-scorer", priority: 88, cost: 0 },
  { engine: "agp-intelligence-orchestrator", priority: 85, cost: 2 },
  { engine: "aci-orchestrator", priority: 80, cost: 1 },
  { engine: "pinterest-growth-engine", priority: 75, cost: 0 },
  { engine: "cpe-orchestrator", priority: 70, cost: 5 },
  { engine: "cj-media-orchestrator", priority: 60, cost: 0 },
  { engine: "agp-self-healing-watcher", priority: 50, cost: 0 },
];

async function resourcePlan(runId: string): Promise<StepOut> {
  const t = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  await sb.from("cmdr_resource_plan").delete().eq("plan_date", today).eq("run_id", runId);
  const rows = PLAN_TEMPLATE.map((p, i) => ({
    run_id: runId, plan_date: today, engine: p.engine,
    scheduled_for: new Date(Date.now() + i * 15 * 60_000).toISOString(),
    expected_calls: 1, expected_cost_cents: p.cost, priority: p.priority, status: "planned",
    notes: "Stage 6A: plan-only, no execution",
  }));
  await sb.from("cmdr_resource_plan").insert(rows);
  return { step: "resource_plan", status: "ok", output: { planned: rows.length }, ms: Date.now() - t };
}

// ===== 4. Model router (no calls in 6A; logs intent) =====
const MODEL_CANDIDATES: Record<string, string[]> = {
  classification: ["google/gemini-2.5-flash-lite", "google/gemini-3-flash-preview"],
  generation: ["google/gemini-3-flash-preview", "google/gemini-2.5-flash"],
  reasoning: ["google/gemini-2.5-pro", "openai/gpt-5-mini"],
  vision: ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"],
};

function chooseModel(task: keyof typeof MODEL_CANDIDATES, defaultModel: string) {
  const cands = MODEL_CANDIDATES[task] ?? [defaultModel];
  return { chosen: cands[0], candidates: cands, reason: "lowest-cost first; quality fallback available" };
}

async function modelRouter(runId: string, defaultModel: string): Promise<StepOut> {
  const t = Date.now();
  const tasks = Object.keys(MODEL_CANDIDATES) as Array<keyof typeof MODEL_CANDIDATES>;
  const rows = tasks.map(task => {
    const c = chooseModel(task, defaultModel);
    return { run_id: runId, task: String(task), candidates: c.candidates, chosen_model: c.chosen, reason: c.reason, cost_cents: 0, success: true };
  });
  await sb.from("cmdr_model_route_log").insert(rows);
  return { step: "model_router", status: "ok", output: { tasks: rows.length }, ms: Date.now() - t };
}

// ===== 5. Budget check =====
async function budgetCheck(runId: string, s: any): Promise<StepOut> {
  const t = Date.now();
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const categories = [
    { category: "ai", budget: s.daily_ai_budget_cents },
    { category: "cloud", budget: s.daily_cloud_budget_cents },
    { category: "pinterest", budget: s.daily_pinterest_budget_cents },
    { category: "ads", budget: s.daily_ads_budget_cents },
  ];
  const rows = categories.map(c => ({
    period: "day", period_start: startOfDay, category: c.category,
    budget_cents: c.budget, spent_cents: 0, remaining_cents: c.budget, breached: false,
    updated_at: new Date().toISOString(),
  }));
  // upsert-by-delete-then-insert for today's day buckets
  for (const r of rows) {
    await sb.from("cmdr_budget_ledger").delete().eq("period", "day").eq("period_start", r.period_start).eq("category", r.category);
  }
  await sb.from("cmdr_budget_ledger").insert(rows);
  return { step: "budget_check", status: "ok", output: { tracked: rows.length, breached: 0 }, ms: Date.now() - t };
}

// ===== 6. Decision engine (Stage 6A: surface from ACI recommendations, status=pending) =====
async function decisionEngine(runId: string, mode: string): Promise<StepOut> {
  const t = Date.now();
  const { data: recs } = await sb.from("aci_recommendations").select("id,type,priority,rationale,expected_lift_pct,estimated_cost_usd,target_id").eq("status", "pending").order("priority", { ascending: false }).limit(20);
  const decisions = (recs ?? []).map((r: any) => ({
    run_id: runId,
    target_engine: "aci",
    action: r.type ?? "execute_recommendation",
    reasoning: r.rationale ?? "Surfaced from ACI",
    confidence: 0.6,
    expected_roi: Number(r.expected_lift_pct ?? 0) / 100,
    estimated_cost_cents: Math.round(Number(r.estimated_cost_usd ?? 0) * 100),
    priority: Number(r.priority ?? 50),
    status: mode === "autonomous" ? "approved" : "pending",
    payload: { source: "aci_recommendation", recommendation_id: r.id, target_id: r.target_id },
  }));
  if (decisions.length) await sb.from("cmdr_decisions").insert(decisions);
  return { step: "decision_engine", status: "ok", output: { decisions: decisions.length, mode }, ms: Date.now() - t };
}

// ===== 7. Simulation engine =====
async function simulation(runId: string): Promise<StepOut> {
  const t = Date.now();
  const { data: pending } = await sb.from("cmdr_decisions").select("id,expected_roi,estimated_cost_cents").eq("run_id", runId).eq("status", "pending");
  const sims = (pending ?? []).map((d: any) => {
    const roi = Number(d.expected_roi ?? 0);
    const threshold = 0.05;
    return {
      decision_id: d.id,
      expected_roi: roi,
      expected_clicks: 0,
      expected_revenue_cents: 0,
      expected_conversions: 0,
      expected_ai_cost_cents: 0,
      expected_cloud_cost_cents: d.estimated_cost_cents ?? 0,
      threshold,
      passed: roi >= threshold,
      rationale: roi >= threshold ? "expected_roi >= threshold" : "expected_roi below threshold; recommend delay",
    };
  });
  if (sims.length) await sb.from("cmdr_simulations").insert(sims);
  return { step: "simulation", status: "ok", output: { simulated: sims.length, passed: sims.filter(s => s.passed).length }, ms: Date.now() - t };
}

// ===== 8. Self-healing (detect-only in 6A) =====
async function selfHealing(runId: string): Promise<StepOut> {
  const t = Date.now();
  const { data: signals } = await sb.from("cmdr_health_signals").select("engine,status,lag_seconds").gte("observed_at", new Date(Date.now() - 5 * 60_000).toISOString());
  const issues = (signals ?? []).filter((s: any) => s.status === "stale" || s.status === "lagging" || s.status === "unknown");
  for (const i of issues) {
    await audit("detect_issue", i.engine, i, `engine ${i.engine} reporting ${i.status}`, 0.8, 0, 0);
  }
  return { step: "self_healing", status: "ok", output: { issues_detected: issues.length, auto_actions: 0 }, ms: Date.now() - t };
}

// ===== Orchestrator =====
async function runOrchestrator(trigger: string) {
  const settings = await getSettings();
  if (settings.kill_switch) {
    await audit("kill_switch_blocked", null, { trigger });
    return { ok: false, error: "kill_switch_active" };
  }
  const mode = settings.mode ?? "simulation";
  const { data: run, error: runErr } = await sb.from("cmdr_runs").insert({ trigger, mode, status: "running" }).select("*").single();
  if (runErr || !run) return { ok: false, error: runErr?.message ?? "run_create_failed" };

  const recordStep = async (s: StepOut) => {
    await sb.from("cmdr_run_steps").insert({
      run_id: run.id, step: s.step, status: s.status, output: s.output ?? {}, error: s.error, finished_at: new Date().toISOString(),
    });
  };

  const steps: StepOut[] = [];
  try {
    const s1 = await healthScan(run.id); await recordStep(s1); steps.push(s1);
    const s2 = await goalEval(run.id); await recordStep(s2); steps.push(s2);
    const s3 = await resourcePlan(run.id); await recordStep(s3); steps.push(s3);
    const s4 = await modelRouter(run.id, settings.default_model); await recordStep(s4); steps.push(s4);
    const s5 = await budgetCheck(run.id, settings); await recordStep(s5); steps.push(s5);
    const s6 = await decisionEngine(run.id, mode); await recordStep(s6); steps.push(s6);
    const s7 = await simulation(run.id); await recordStep(s7); steps.push(s7);
    const s8 = await selfHealing(run.id); await recordStep(s8); steps.push(s8);

    const summary = { steps: steps.length, ok: steps.filter(s => s.status === "ok").length, mode };
    await sb.from("cmdr_runs").update({ status: "ok", finished_at: new Date().toISOString(), summary }).eq("id", run.id);
    await audit("orchestrator_run_complete", run.id, summary, "Stage 6A simulation tick", 1, 0, 0);
    return { ok: true, run_id: run.id, mode, steps };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    await sb.from("cmdr_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: msg }).eq("id", run.id);
    return { ok: false, run_id: run.id, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const trigger = body?.trigger ?? "manual";
    const result = await runOrchestrator(trigger);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});