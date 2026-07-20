// Genesis Autonomous Experimentation Engine — scientific lab API
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number(x) || 0));

async function llm(prompt: string, system: string) {
  if (!LOVABLE_KEY) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    }),
  });
  if (res.status === 429) throw new Error("ai_rate_limited");
  if (res.status === 402) throw new Error("ai_credits_exhausted");
  if (!res.ok) throw new Error(`ai_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  try { return JSON.parse(j?.choices?.[0]?.message?.content ?? "{}"); } catch { return {}; }
}

// Statistical helpers
function normalCdf(z: number) {
  // Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
function twoTailedP(z: number) {
  return 2 * (1 - normalCdf(Math.abs(z)));
}
function wilsonCI(succ: number, n: number, z = 1.96) {
  if (n === 0) return { low: 0, high: 0 };
  const p = succ / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}
// Beta-Binomial Monte Carlo P(variant > control)
function gammaSample(alpha: number) {
  // Marsaglia & Tsang
  if (alpha < 1) return gammaSample(alpha + 1) * Math.pow(Math.random(), 1 / alpha);
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      const u1 = Math.random(); const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function betaSample(a: number, b: number) {
  const x = gammaSample(a); return x / (x + gammaSample(b));
}
function probBest(succA: number, nA: number, succB: number, nB: number, sims = 4000) {
  let wins = 0;
  const aA = succA + 1, bA = nA - succA + 1;
  const aB = succB + 1, bB = nB - succB + 1;
  for (let i = 0; i < sims; i++) if (betaSample(aB, bB) > betaSample(aA, bA)) wins++;
  return wins / sims;
}

const handlers: Record<string, (p: any) => Promise<any>> = {
  async createHypothesis(p) {
    if (!p.area || !p.statement) throw new Error("area,statement required");
    const { data, error } = await supabase.from("aee_hypotheses").insert({
      area: p.area, statement: p.statement,
      business_rationale: p.business_rationale ?? null,
      supporting_evidence: p.supporting_evidence ?? [],
      alternative_explanations: p.alternative_explanations ?? [],
      expected_revenue_usd: p.expected_revenue_usd ?? null,
      expected_profit_usd: p.expected_profit_usd ?? null,
      expected_customer_impact: p.expected_customer_impact ?? null,
      expected_learning_value: clamp01(p.expected_learning_value ?? 0.5),
      confidence: clamp01(p.confidence ?? 0.5),
      risk: clamp01(p.risk ?? 0.5),
      implementation_cost: clamp01(p.implementation_cost ?? 0.3),
      opportunity_size: clamp01(p.opportunity_size ?? 0.5),
      business_alignment: clamp01(p.business_alignment ?? 0.5),
      source_engine: p.source_engine ?? "ui",
    }).select().single();
    if (error) throw error;
    const { data: pscore } = await supabase.rpc("aee_priority_score", { p: data.id });
    await supabase.from("aee_hypotheses").update({ priority_score: pscore }).eq("id", data.id);
    return { ...data, priority_score: pscore };
  },

  async createExperiment(p) {
    if (!p.area || !p.name || !p.objective || !p.primary_metric) throw new Error("area,name,objective,primary_metric required");
    const variants: any[] = p.variants ?? [
      { variant_key: "control", label: "Control", is_control: true, weight: 0.5 },
      { variant_key: "treatment", label: "Treatment", is_control: false, weight: 0.5 },
    ];
    const { data: exp, error } = await supabase.from("aee_experiments").insert({
      hypothesis_id: p.hypothesis_id ?? null,
      area: p.area, name: p.name, objective: p.objective,
      design: p.design ?? "ab",
      primary_metric: p.primary_metric,
      guardrail_metrics: p.guardrail_metrics ?? [],
      business_metric: p.business_metric ?? "profit",
      rollout_pct: p.rollout_pct ?? 1,
      target_audience: p.target_audience ?? {},
      traffic_allocation: p.traffic_allocation ?? Object.fromEntries(variants.map((v: any) => [v.variant_key, v.weight])),
      minimum_sample_size: p.minimum_sample_size ?? null,
      minimum_detectable_effect: p.minimum_detectable_effect ?? null,
      expected_duration_days: p.expected_duration_days ?? 14,
      risk_level: p.risk_level ?? "medium",
      governance_required: !!p.governance_required || p.risk_level === "high" || p.risk_level === "critical",
      submitted_by: p.submitted_by ?? "ui",
    }).select().single();
    if (error) throw error;
    const vrows = variants.map((v: any) => ({ ...v, experiment_id: exp.id }));
    const { error: vErr } = await supabase.from("aee_variants").insert(vrows);
    if (vErr) throw vErr;
    return exp;
  },

  async approveExperiment({ experiment_id, approved_by = "human" }) {
    const { data, error } = await supabase.from("aee_experiments")
      .update({ status: "approved", approved_by, approved_at: new Date().toISOString() })
      .eq("id", experiment_id).select().single();
    if (error) throw error;
    return data;
  },

  async launchExperiment({ experiment_id, rollout_pct }) {
    const { data, error } = await supabase.from("aee_experiments")
      .update({ status: "running", started_at: new Date().toISOString(), ...(rollout_pct ? { rollout_pct } : {}) })
      .eq("id", experiment_id).select().single();
    if (error) throw error;
    return data;
  },

  async pauseExperiment({ experiment_id, reason }) {
    const { data, error } = await supabase.from("aee_experiments").update({ status: "paused" }).eq("id", experiment_id).select().single();
    if (error) throw error;
    await supabase.from("aee_safety_log").insert({ experiment_id, trigger: "manual_pause", details: { reason }, action_taken: "paused" });
    return data;
  },

  async stopExperiment({ experiment_id, reason }) {
    const { data, error } = await supabase.from("aee_experiments")
      .update({ status: "stopped", ended_at: new Date().toISOString() }).eq("id", experiment_id).select().single();
    if (error) throw error;
    await supabase.from("aee_safety_log").insert({ experiment_id, trigger: "manual_stop", details: { reason }, action_taken: "stopped" });
    return data;
  },

  async assign({ experiment_id, subject_type, subject_id }) {
    if (!experiment_id || !subject_type || !subject_id) throw new Error("experiment_id,subject_type,subject_id required");
    const { data: existing } = await supabase.from("aee_assignments")
      .select("variant_id").eq("experiment_id", experiment_id).eq("subject_type", subject_type).eq("subject_id", String(subject_id)).maybeSingle();
    if (existing?.variant_id) return { variant_id: existing.variant_id, reused: true };
    const { data: variants } = await supabase.from("aee_variants").select("*").eq("experiment_id", experiment_id);
    if (!variants?.length) throw new Error("no variants");
    const total = variants.reduce((s, v) => s + Number(v.weight || 0), 0) || 1;
    let r = Math.random() * total; let chosen = variants[0];
    for (const v of variants) { r -= Number(v.weight || 0); if (r <= 0) { chosen = v; break; } }
    const { error } = await supabase.from("aee_assignments").insert({ experiment_id, variant_id: chosen.id, subject_type, subject_id: String(subject_id) });
    if (error && !String(error.message).includes("duplicate")) throw error;
    return { variant_id: chosen.id, variant_key: chosen.variant_key, reused: false };
  },

  async record({ experiment_id, variant_id, metric, exposure_delta = 0, success_delta = 0, value_delta = 0, profit_delta = 0, attributes = {} }) {
    if (!experiment_id || !variant_id || !metric) throw new Error("experiment_id,variant_id,metric required");
    const { error } = await supabase.from("aee_observations").insert({ experiment_id, variant_id, metric, exposure_delta, success_delta, value_delta, profit_delta, attributes });
    if (error) throw error;
    // also bump variant rollups
    await supabase.rpc("aee_evaluate_zscore", { c_succ: 0, c_n: 0, t_succ: 0, t_n: 0 }); // noop to ensure helper is callable
    const { data: v } = await supabase.from("aee_variants").select("*").eq("id", variant_id).single();
    if (v) {
      await supabase.from("aee_variants").update({
        exposure: (v.exposure || 0) + Number(exposure_delta || 0),
        successes: (v.successes || 0) + Number(success_delta || 0),
        value_sum: Number(v.value_sum || 0) + Number(value_delta || 0),
        profit_sum: Number(v.profit_sum || 0) + Number(profit_delta || 0),
      }).eq("id", variant_id);
    }
    return { ok: true };
  },

  async evaluateExperiment({ experiment_id, sig_threshold = 0.05, prob_threshold = 0.95 }) {
    const { data: exp } = await supabase.from("aee_experiments").select("*").eq("id", experiment_id).single();
    if (!exp) throw new Error("experiment not found");
    const { data: variants } = await supabase.from("aee_variants").select("*").eq("experiment_id", experiment_id);
    if (!variants?.length) throw new Error("no variants");
    const control = variants.find((v) => v.is_control) ?? variants[0];
    const evaluated_at = new Date().toISOString();
    const rows: any[] = [];
    for (const v of variants) {
      const ci = wilsonCI(v.successes ?? 0, v.exposure ?? 0);
      const cr = (v.exposure ?? 0) > 0 ? (v.successes ?? 0) / v.exposure : 0;
      let z = 0, p = 1, lift = 0, pbest = 0.5;
      if (v.id !== control.id) {
        const { data: zres } = await supabase.rpc("aee_evaluate_zscore", {
          c_succ: control.successes ?? 0, c_n: control.exposure ?? 0,
          t_succ: v.successes ?? 0, t_n: v.exposure ?? 0,
        });
        z = Number(zres?.z ?? 0); lift = Number(zres?.lift ?? 0); p = twoTailedP(z);
        if ((v.exposure ?? 0) > 0 && (control.exposure ?? 0) > 0) {
          pbest = probBest(control.successes ?? 0, control.exposure ?? 0, v.successes ?? 0, v.exposure ?? 0);
        }
      } else {
        pbest = 0.5;
      }
      rows.push({
        experiment_id, variant_id: v.id,
        n: v.exposure ?? 0,
        conv_rate: cr, lift, ci_low: ci.low, ci_high: ci.high,
        z, p_value: p, bayesian_prob_best: pbest,
        power: null, mde: exp.minimum_detectable_effect ?? null,
        business_value_usd: Number(v.value_sum ?? 0),
        profit_usd: Number(v.profit_sum ?? 0),
        ltv_delta: null,
        is_significant: v.id !== control.id && p < sig_threshold,
        evaluated_at,
      });
    }
    const { error } = await supabase.from("aee_results").insert(rows);
    if (error) throw error;
    await supabase.from("aee_experiments").update({ status: "evaluated", evaluated_at }).eq("id", experiment_id);

    // safety: guardrail breach if any non-control variant has profit_usd < 0 and large neg lift
    const breached = rows.find((r) => r.variant_id !== control.id && (r.profit_usd < 0 && r.lift < -0.1 && r.n > 50));
    if (breached) {
      await supabase.from("aee_experiments").update({ status: "stopped", ended_at: new Date().toISOString() }).eq("id", experiment_id);
      await supabase.from("aee_safety_log").insert({ experiment_id, trigger: "guardrail_profit_drop", details: breached, action_taken: "stopped" });
    }
    return { results: rows, control_id: control.id };
  },

  async declareWinner({ experiment_id, recommended_action }) {
    const evalRes = await handlers.evaluateExperiment({ experiment_id });
    const control = (evalRes.results as any[]).find((r) => r.variant_id === evalRes.control_id);
    const candidates = (evalRes.results as any[]).filter((r) => r.variant_id !== evalRes.control_id);
    candidates.sort((a, b) => (b.profit_usd - a.profit_usd) || (b.bayesian_prob_best - a.bayesian_prob_best));
    const top = candidates[0];
    if (!top || !(top.is_significant || top.bayesian_prob_best >= 0.95)) {
      await supabase.from("aee_experiments").update({ status: "no_difference" }).eq("id", experiment_id);
      return { outcome: "no_difference", top };
    }
    const { data: winner, error } = await supabase.from("aee_winners").upsert({
      experiment_id, winning_variant: top.variant_id,
      business_lift_pct: top.lift, revenue_lift_usd: top.business_value_usd - (control?.business_value_usd ?? 0),
      profit_lift_usd: top.profit_usd - (control?.profit_usd ?? 0),
      confidence: 1 - top.p_value,
      bayesian_prob_best: top.bayesian_prob_best,
      recommended_action: recommended_action ?? "promote_to_playbook",
    }, { onConflict: "experiment_id" }).select().single();
    if (error) throw error;
    await supabase.from("aee_experiments").update({ status: "winner_declared" }).eq("id", experiment_id);
    return { outcome: "winner_declared", winner };
  },

  async declareNoDifference({ experiment_id, lessons }) {
    await supabase.from("aee_experiments").update({ status: "no_difference" }).eq("id", experiment_id);
    if (lessons) await supabase.from("aee_failures").insert({ experiment_id, why_failed: "no_significant_difference", lessons });
    return { ok: true };
  },

  async recordFailure({ experiment_id, why_failed, unexpected_outcomes = [], alternative_explanations = [], lessons, business_lessons }) {
    const { data, error } = await supabase.from("aee_failures").upsert({
      experiment_id, why_failed, unexpected_outcomes, alternative_explanations, lessons, business_lessons,
    }, { onConflict: "experiment_id" }).select().single();
    if (error) throw error;
    await supabase.from("aee_experiments").update({ status: "failed", ended_at: new Date().toISOString() }).eq("id", experiment_id);
    return data;
  },

  async generateLearning({ experiment_id }) {
    const { data: exp } = await supabase.from("aee_experiments").select("*").eq("id", experiment_id).single();
    const { data: variants } = await supabase.from("aee_variants").select("*").eq("experiment_id", experiment_id);
    const { data: results } = await supabase.from("aee_results").select("*").eq("experiment_id", experiment_id).order("evaluated_at",{ascending:false}).limit(variants?.length ?? 4);
    const { data: winner } = await supabase.from("aee_winners").select("*").eq("experiment_id", experiment_id).maybeSingle();
    const out = await llm(
      `Summarize the business learning from this experiment.\nExperiment: ${JSON.stringify(exp)}\nVariants: ${JSON.stringify(variants)}\nResults: ${JSON.stringify(results)}\nWinner: ${JSON.stringify(winner)}\nReturn JSON: { "summary":"...", "playbook":{"recipe":{...},"applicability":"..."}, "lessons":["..."] }`,
      "You convert experiment results into reusable business knowledge. JSON only."
    );
    if (winner && out?.playbook?.recipe) {
      await supabase.from("aee_playbooks").insert({
        area: exp?.area ?? "general",
        name: `${exp?.name ?? "experiment"} winner playbook`,
        derived_from: experiment_id,
        recipe: out.playbook.recipe,
        business_lift_usd: winner?.profit_lift_usd ?? null,
        applicability: out.playbook.applicability ?? null,
      });
    }
    return out;
  },

  async recommendExperiment({ limit = 5 }) {
    const { data: open } = await supabase.from("aee_hypotheses").select("*").eq("status","open").order("priority_score",{ascending:false}).limit(50);
    const out = await llm(
      `Rank the highest-value next experiments for GetPawsy. Hypotheses:\n${JSON.stringify(open ?? [])}\nReturn JSON: { "recommendations":[{"recommendation_type":"highest_value|highest_uncertainty|biggest_opportunity|weakest_assumption|most_expensive_unknown","area":"...","title":"...","rationale":"...","expected_value_usd":number,"confidence":0..1,"priority_score":number,"hypothesis_id":"...or null"}] }`,
      "You curate the daily experiment backlog. JSON only."
    );
    const rows = (out?.recommendations ?? []).slice(0, limit).map((r: any) => ({
      recommendation_type: r.recommendation_type ?? "highest_value",
      area: r.area ?? "general",
      title: r.title ?? "next experiment",
      rationale: r.rationale ?? "",
      expected_value_usd: r.expected_value_usd ?? null,
      confidence: clamp01(r.confidence ?? 0.5),
      priority_score: r.priority_score ?? null,
      hypothesis_id: r.hypothesis_id && r.hypothesis_id.length === 36 ? r.hypothesis_id : null,
    }));
    if (rows.length) await supabase.from("aee_recommendations").insert(rows);
    return rows;
  },

  async searchExperiments({ q, status, area, limit = 50 }) {
    let qy = supabase.from("aee_experiments").select("*").order("created_at",{ascending:false}).limit(limit);
    if (status) qy = qy.eq("status", status);
    if (area) qy = qy.eq("area", area);
    if (q) qy = qy.or(`name.ilike.%${q}%,objective.ilike.%${q}%`);
    const { data } = await qy;
    return data ?? [];
  },

  async getExperiment({ experiment_id }) {
    const [{ data: exp }, { data: variants }, { data: results }, { data: winner }, { data: failure }, { data: safety }] = await Promise.all([
      supabase.from("aee_experiments").select("*").eq("id", experiment_id).single(),
      supabase.from("aee_variants").select("*").eq("experiment_id", experiment_id),
      supabase.from("aee_results").select("*").eq("experiment_id", experiment_id).order("evaluated_at",{ascending:false}).limit(20),
      supabase.from("aee_winners").select("*").eq("experiment_id", experiment_id).maybeSingle(),
      supabase.from("aee_failures").select("*").eq("experiment_id", experiment_id).maybeSingle(),
      supabase.from("aee_safety_log").select("*").eq("experiment_id", experiment_id).order("created_at",{ascending:false}).limit(20),
    ]);
    return { experiment: exp, variants: variants ?? [], results: results ?? [], winner, failure, safety: safety ?? [] };
  },

  async stats() {
    const [{ count: live }, { count: total }, { count: hypos }, { data: recent }, { data: winners }, { data: failures }, { data: playbooks }, { data: recs }] = await Promise.all([
      supabase.from("aee_experiments").select("*", { count: "exact", head: true }).in("status", ["running","approved","paused"]),
      supabase.from("aee_experiments").select("*", { count: "exact", head: true }),
      supabase.from("aee_hypotheses").select("*", { count: "exact", head: true }).eq("status","open"),
      supabase.from("aee_experiments").select("id,name,area,status,rollout_pct,created_at").order("created_at",{ascending:false}).limit(15),
      supabase.from("aee_winners").select("*").order("declared_at",{ascending:false}).limit(10),
      supabase.from("aee_failures").select("*").order("failed_at",{ascending:false}).limit(10),
      supabase.from("aee_playbooks").select("*").eq("is_active",true).order("created_at",{ascending:false}).limit(10),
      supabase.from("aee_recommendations").select("*").eq("status","open").order("priority_score",{ascending:false}).limit(10),
    ]);
    return { live_count: live, total_count: total, open_hypotheses: hypos, recent_experiments: recent ?? [], winners: winners ?? [], failures: failures ?? [], playbooks: playbooks ?? [], recommendations: recs ?? [] };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    const { action, ...payload } = await req.json();
    const fn = handlers[action];
    if (!fn) return new Response(JSON.stringify({ ok: false, error: `unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const result = await fn(payload);
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = msg === "ai_rate_limited" ? 429 : msg === "ai_credits_exhausted" ? 402 : 500;
    return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});