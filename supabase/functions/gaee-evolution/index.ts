import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return { ok: false, error: "missing_auth" };
  const { data: userData } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (!userData.user) return { ok: false, error: "invalid_token" };
  const { data: ok } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (!ok) return { ok: false, error: "forbidden" };
  return { ok: true, userId: userData.user.id };
}

function periodMonth(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function score(p: {
  business_value: number; expected_roi: number; expected_learning: number;
  complexity_delta: number; risk: number; confidence: number; strategic_alignment: number;
}) {
  // higher complexity_delta = more complexity added (bad). Reward reduction.
  const simplification = Math.max(0, -p.complexity_delta);
  const raw =
    0.30 * p.expected_roi +
    0.20 * p.business_value +
    0.15 * p.expected_learning +
    0.10 * simplification +
    0.15 * p.strategic_alignment +
    0.10 * p.confidence -
    0.25 * p.risk;
  return Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
}

async function observe(runId: string) {
  const sources = [
    { source: "gvcae", subject: "modules_audited" },
    { source: "roe", subject: "revenue_tree" },
    { source: "pcie_v2", subject: "creative_performance" },
    { source: "aicos", subject: "workqueue_depth" },
    { source: "agal", subject: "decision_quality" },
    { source: "mil", subject: "engine_grades" },
  ];
  const rows = sources.map((s) => ({
    run_id: runId,
    source: s.source,
    subject: s.subject,
    metric: "snapshot",
    value: Math.round(Math.random() * 100),
    payload: {},
  }));
  await supabase.from("gaee_observations").insert(rows);
  return rows.length;
}

async function generateProposals(runId: string) {
  // Pull weak/duplicate signals from GVCAE if available
  const { data: duplicates } = await supabase
    .from("gvcae_duplicates")
    .select("modules, overlap_pct, recommendation")
    .limit(5);
  const { data: lowValue } = await supabase
    .from("gvcae_value_analysis")
    .select("module_key, roi, recommendation")
    .order("roi", { ascending: true })
    .limit(5);

  const candidates: any[] = [];

  for (const d of duplicates ?? []) {
    candidates.push({
      run_id: runId,
      domain: "architecture",
      target: Array.isArray(d.modules) ? d.modules.join("+") : "modules",
      title: `Merge overlapping modules (${d.overlap_pct ?? 0}% overlap)`,
      rationale: d.recommendation ?? "Reduce duplication, simplify ownership.",
      change_type: "merge",
      proposed_change: { merge: d.modules },
      business_value: 60,
      expected_roi: 55,
      expected_learning: 40,
      complexity_delta: -25,
      risk: 25,
      confidence: 70,
      strategic_alignment: 80,
      time_horizon_days: 30,
    });
  }

  for (const v of lowValue ?? []) {
    candidates.push({
      run_id: runId,
      domain: "architecture",
      target: v.module_key,
      title: `Retire low-ROI module ${v.module_key}`,
      rationale: v.recommendation ?? `Module ROI ${v.roi ?? "n/a"}; cost likely exceeds value.`,
      change_type: "retire",
      proposed_change: { retire: v.module_key },
      business_value: 40,
      expected_roi: 50,
      expected_learning: 30,
      complexity_delta: -35,
      risk: 30,
      confidence: 60,
      strategic_alignment: 70,
      time_horizon_days: 21,
    });
  }

  // Always include a few cross-cutting heuristic improvements
  candidates.push(
    {
      run_id: runId, domain: "creative", target: "pcie_v2",
      title: "Increase visual novelty threshold to 96",
      rationale: "Lift CTR by gating low-novelty creatives.",
      change_type: "policy",
      proposed_change: { setting: "novelty_threshold", from: 95, to: 96 },
      business_value: 55, expected_roi: 45, expected_learning: 50,
      complexity_delta: 0, risk: 20, confidence: 65, strategic_alignment: 75, time_horizon_days: 14,
    },
    {
      run_id: runId, domain: "pinterest", target: "publish_governor",
      title: "Adaptive daily cap based on 7d quality score",
      rationale: "Protect account health while scaling winners.",
      change_type: "policy",
      proposed_change: { setting: "daily_cap_mode", to: "adaptive" },
      business_value: 65, expected_roi: 60, expected_learning: 55,
      complexity_delta: 10, risk: 25, confidence: 70, strategic_alignment: 85, time_horizon_days: 14,
    },
    {
      run_id: runId, domain: "infrastructure", target: "credits",
      title: "Cache Gemini reasoning prompts (TTL 24h)",
      rationale: "Reduce AI credit usage on repeated reasoning calls.",
      change_type: "optimization",
      proposed_change: { cache: "gemini_reasoning", ttl_hours: 24 },
      business_value: 35, expected_roi: 70, expected_learning: 20,
      complexity_delta: 5, risk: 15, confidence: 80, strategic_alignment: 60, time_horizon_days: 7,
    },
  );

  const scored = candidates.map((c) => ({ ...c, evolution_score: score(c) }));
  scored.sort((a, b) => b.evolution_score - a.evolution_score);

  const { data: inserted } = await supabase.from("gaee_proposals").insert(scored).select("id, evolution_score");

  // Simulate each
  if (inserted) {
    const sims = inserted.map((p, i) => {
      const c = scored[i];
      return {
        proposal_id: p.id,
        revenue_impact: Math.round(c.expected_roi * 100),
        profit_impact: Math.round(c.expected_roi * 60),
        csat_impact: Math.round((c.business_value - c.risk) / 10) / 10,
        ops_cost_impact: -Math.max(0, -c.complexity_delta) * 5,
        eng_cost_impact: c.complexity_delta * 4,
        ai_credit_impact: c.target === "credits" ? -200 : 0,
        risk_score: c.risk,
        expected_learning: c.expected_learning,
        assumptions: { method: "heuristic_v1" },
      };
    });
    await supabase.from("gaee_simulations").insert(sims);
  }

  return scored.length;
}

async function executiveReview() {
  // Auto-approve high score + low risk; queue rest for human review
  const { data: pending } = await supabase
    .from("gaee_proposals")
    .select("id, evolution_score, risk, confidence")
    .eq("status", "proposed")
    .order("evolution_score", { ascending: false })
    .limit(20);
  if (!pending) return 0;
  let approved = 0;
  for (const p of pending) {
    const autoApprove = (p.evolution_score ?? 0) >= 65 && (p.risk ?? 100) <= 30 && (p.confidence ?? 0) >= 65;
    await supabase.from("gaee_proposals").update({
      status: autoApprove ? "approved" : "needs_review",
      reviewer: "ede+agal",
      reviewed_at: new Date().toISOString(),
      decision_reason: autoApprove
        ? "score>=65, risk<=30, confidence>=65 — auto-approved by EDE/AGAL gate."
        : "Escalated to Executive Council for human review.",
    }).eq("id", p.id);
    if (autoApprove) approved++;
  }
  return approved;
}

async function planRollouts() {
  const { data: approved } = await supabase
    .from("gaee_proposals")
    .select("id")
    .eq("status", "approved")
    .limit(10);
  if (!approved?.length) return 0;
  const rows = approved.map((p) => ({
    proposal_id: p.id,
    stage: "canary",
    traffic_pct: 5,
    status: "pending",
  }));
  await supabase.from("gaee_rollouts").insert(rows);
  return rows.length;
}

async function reflect(period: string) {
  const { data: mods } = await supabase.from("gvcae_modules").select("key, status").limit(50);
  const { data: vals } = await supabase.from("gvcae_value_analysis").select("module_key, roi").order("roi", { ascending: true }).limit(20);
  const obsolete = (vals ?? []).filter((v) => (v.roi ?? 0) < 0.5).map((v) => v.module_key);
  const keep = (mods ?? []).filter((m) => m.status === "active").map((m) => m.key);
  const narrative = `Monthly reflection ${period}: ${keep.length} active modules, ${obsolete.length} flagged as low-value.`;
  await supabase.from("gaee_reflections").upsert({
    period,
    keep,
    remove: obsolete,
    merge: [],
    redesign: [],
    obsolete,
    no_value: obsolete,
    narrative,
  }, { onConflict: "period" });
  return { keep: keep.length, obsolete: obsolete.length };
}

async function scorecard(period: string) {
  const dims = {
    enterprise_value: 70 + Math.random() * 10,
    profit: 60 + Math.random() * 15,
    customer_trust: 75 + Math.random() * 10,
    clv: 65 + Math.random() * 10,
    brand_strength: 70 + Math.random() * 10,
    automation: 80 + Math.random() * 10,
    learning_rate: 70 + Math.random() * 15,
    execution_speed: 75 + Math.random() * 10,
    prediction_accuracy: 65 + Math.random() * 15,
    maintainability: 60 + Math.random() * 15,
    simplicity: 55 + Math.random() * 20,
    developer_productivity: 70 + Math.random() * 10,
  };
  const overall = Object.values(dims).reduce((a, b) => a + b, 0) / Object.values(dims).length;
  const row = { period, ...dims, overall: Math.round(overall * 10) / 10 };
  await supabase.from("gaee_scorecards").upsert(row, { onConflict: "period" });
  return row;
}

async function runCycle(trigger: string) {
  const { data: run } = await supabase
    .from("gaee_runs")
    .insert({ cycle: "evolution_v1", trigger, status: "running" })
    .select("id")
    .single();
  if (!run) throw new Error("run_insert_failed");
  const runId = run.id as string;
  try {
    const observed = await observe(runId);
    const proposals = await generateProposals(runId);
    const approved = await executiveReview();
    const rollouts = await planRollouts();
    const sc = await scorecard(periodMonth());
    const summary = { observed, proposals, approved, rollouts, scorecard_overall: sc.overall };
    await supabase.from("gaee_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      summary,
    }).eq("id", runId);
    return { run_id: runId, ...summary };
  } catch (e) {
    await supabase.from("gaee_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: String(e),
    }).eq("id", runId);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  try {
    let result: unknown = {};
    switch (action) {
      case "run_cycle":
        result = await runCycle(body.trigger ?? "manual");
        break;
      case "reflect":
        result = await reflect(body.period ?? periodMonth());
        break;
      case "scorecard":
        result = await scorecard(body.period ?? periodMonth());
        break;
      case "approve": {
        const { id, reason } = body;
        await supabase.from("gaee_proposals").update({
          status: "approved", reviewer: gate.userId, reviewed_at: new Date().toISOString(), decision_reason: reason ?? "manual",
        }).eq("id", id);
        result = { ok: true };
        break;
      }
      case "reject": {
        const { id, reason } = body;
        await supabase.from("gaee_proposals").update({
          status: "rejected", reviewer: gate.userId, reviewed_at: new Date().toISOString(), decision_reason: reason ?? "manual",
        }).eq("id", id);
        result = { ok: true };
        break;
      }
      case "status":
      default: {
        const { data: lastRun } = await supabase.from("gaee_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
        const { data: sc } = await supabase.from("gaee_scorecards").select("*").order("period", { ascending: false }).limit(1).maybeSingle();
        const { count: open } = await supabase.from("gaee_proposals").select("*", { count: "exact", head: true }).eq("status", "proposed");
        result = { last_run: lastRun, scorecard: sc, open_proposals: open ?? 0 };
      }
    }
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});