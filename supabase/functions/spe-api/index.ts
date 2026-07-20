// Genesis Strategic Planning Engine — long-horizon strategy API
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
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const dt = new Date(d); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0,10); };

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

async function strategicContext() {
  const [obj, init, risk, cap, mat, snap, scorecard] = await Promise.all([
    supabase.from("spe_objectives").select("id,slug,title,horizon,priority,status,expected_value_usd,confidence").eq("status","active").order("priority",{ascending:false}).limit(30),
    supabase.from("spe_initiatives").select("id,title,horizon,status,business_value,cost_usd,roi,priority,confidence").in("status",["proposed","planned","in_progress"]).order("priority",{ascending:false}).limit(30),
    supabase.from("spe_risks").select("title,category,probability,impact_usd,severity,status").eq("status","open").order("severity",{ascending:false}).limit(20),
    supabase.from("spe_capabilities").select("capability,domain,current_level,target_level"),
    supabase.from("spe_maturity").select("domain,score,weakest_area"),
    supabase.from("roe_snapshots").select("*").order("snapshot_date",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("roe_executive_scorecard").select("*").order("snapshot_date",{ascending:false}).limit(1).maybeSingle(),
  ]);
  return {
    objectives: obj.data ?? [], initiatives: init.data ?? [], risks: risk.data ?? [],
    capabilities: cap.data ?? [], maturity: mat.data ?? [],
    latest_revenue_snapshot: snap.data ?? null, executive_scorecard: scorecard.data ?? null,
  };
}

async function logEvolution(event: string, kind: string | null, id: string | null, before: any, after: any, rationale: string, confidence: number) {
  await supabase.from("spe_evolution_log").insert({ event, entity_kind: kind, entity_id: id, before_state: before, after_state: after, rationale, confidence });
}

const SYSTEM_PLANNER = `You are the Strategic Planning Engine for GetPawsy, an autonomous US pet commerce AI company.
You optimize the LONG TERM, not today's metrics. Every recommendation MUST include:
 - rationale grounded in provided evidence
 - expected_value_usd, confidence (0..1), risk (0..1)
 - explicit alignment with Genesis Constitution (profit + long-term enterprise value, US-first, explainable, auditable, reversible).
Return strict JSON only.`;

const handlers: Record<string, (p: any) => Promise<any>> = {
  async createObjective(p) {
    const slug = p.slug ?? (p.title ?? "obj-" + crypto.randomUUID().slice(0,8)).toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,60);
    const row = {
      slug, title: p.title, description: p.description ?? null,
      horizon: p.horizon ?? "90d", parent_id: p.parent_id ?? null,
      level: p.level ?? "objective", owner: p.owner ?? null,
      priority: clamp01(p.priority ?? 0.5),
      expected_value_usd: p.expected_value_usd ?? null,
      confidence: clamp01(p.confidence ?? 0.5),
      status: p.status ?? "active", metric: p.metric ?? null,
      target_value: p.target_value ?? null, current_value: p.current_value ?? null,
      dependencies: p.dependencies ?? [], tags: p.tags ?? [],
      evidence: p.evidence ?? [], rationale: p.rationale ?? null,
    };
    const { data, error } = await supabase.from("spe_objectives").upsert(row, { onConflict: "slug" }).select().single();
    if (error) throw error;
    await logEvolution("objective_upsert","objective",data.id,null,data,p.rationale ?? "manual upsert", row.confidence);
    return data;
  },

  async listObjectives({ horizon, status }) {
    let q = supabase.from("spe_objectives").select("*").order("priority",{ascending:false}).limit(200);
    if (horizon) q = q.eq("horizon", horizon);
    if (status) q = q.eq("status", status);
    const { data } = await q;
    return data ?? [];
  },

  async prioritizeInitiatives() {
    const ctx = await strategicContext();
    const ai = await llm(JSON.stringify({
      task: "Rank the open initiatives. Score each in [0..1]. Consider business value, cost, risk, ROI, dependency unlock and strategic alignment. Return { ranked: [{id, priority, business_value, risk, roi, confidence, rationale}] }.",
      context: ctx,
    }), SYSTEM_PLANNER);
    const ranked: Array<any> = Array.isArray(ai?.ranked) ? ai.ranked : [];
    for (const r of ranked) {
      if (!r?.id) continue;
      await supabase.from("spe_initiatives").update({
        priority: clamp01(r.priority ?? 0.5),
        business_value: r.business_value ?? null,
        risk: r.risk ?? null, roi: r.roi ?? null,
        confidence: clamp01(r.confidence ?? 0.5),
        rationale: r.rationale ?? null,
      }).eq("id", r.id);
    }
    await logEvolution("prioritize_initiatives", null, null, null, { count: ranked.length }, "AI re-prioritization", 0.7);
    return { count: ranked.length, ranked };
  },

  async generateInitiatives({ count = 5 }) {
    const ctx = await strategicContext();
    const ai = await llm(JSON.stringify({
      task: `Propose ${count} new strategic initiatives that close the biggest gaps. Each: { title, description, horizon, business_value, cost_usd, risk, roi, expected_revenue_usd, expected_profit_usd, expected_learning, confidence, rationale, objective_slug }.`,
      context: ctx,
    }), SYSTEM_PLANNER);
    const proposals: Array<any> = Array.isArray(ai?.proposals ?? ai?.initiatives) ? (ai.proposals ?? ai.initiatives) : [];
    const inserted: any[] = [];
    for (const p of proposals) {
      let objective_id: string | null = null;
      if (p.objective_slug) {
        const { data } = await supabase.from("spe_objectives").select("id").eq("slug", p.objective_slug).maybeSingle();
        objective_id = data?.id ?? null;
      }
      const { data } = await supabase.from("spe_initiatives").insert({
        title: p.title, description: p.description ?? null,
        objective_id, horizon: p.horizon ?? "90d",
        business_value: p.business_value ?? null, cost_usd: p.cost_usd ?? null,
        risk: p.risk ?? null, roi: p.roi ?? null,
        expected_revenue_usd: p.expected_revenue_usd ?? null,
        expected_profit_usd: p.expected_profit_usd ?? null,
        expected_learning: p.expected_learning ?? null,
        confidence: clamp01(p.confidence ?? 0.5),
        rationale: p.rationale ?? null,
      }).select().single();
      if (data) inserted.push(data);
    }
    return { count: inserted.length, inserted };
  },

  async generateRoadmap({ horizon = "quarter" }) {
    const { data: inits } = await supabase.from("spe_initiatives").select("*").in("status",["proposed","planned","in_progress"]).order("priority",{ascending:false}).limit(40);
    const ctx = await strategicContext();
    const ai = await llm(JSON.stringify({
      task: `Assemble a living roadmap for ${horizon}. Place each initiative in one of: current_quarter, next_quarter, future_backlog, deferred. Respect resource constraints, dependencies, and risk. Return { plan: [{ initiative_id, bucket, position, start_date, target_date, notes }] }.`,
      context: { ...ctx, initiatives: inits ?? [] },
    }), SYSTEM_PLANNER);
    const plan: Array<any> = Array.isArray(ai?.plan) ? ai.plan : [];
    await supabase.from("spe_roadmap").delete().in("bucket", ["current_quarter","next_quarter","future_backlog","deferred"]);
    for (const r of plan) {
      if (!r?.initiative_id) continue;
      await supabase.from("spe_roadmap").insert({
        bucket: r.bucket ?? "future_backlog",
        initiative_id: r.initiative_id,
        position: r.position ?? 0,
        start_date: r.start_date ?? null,
        target_date: r.target_date ?? null,
        notes: r.notes ?? null,
      });
    }
    await logEvolution("generate_roadmap", null, null, null, { horizon, count: plan.length }, "AI roadmap synthesis", 0.7);
    return { count: plan.length, plan };
  },

  async planQuarter() { return handlers.generateRoadmap({ horizon: "quarter" }); },

  async planYear() {
    const ctx = await strategicContext();
    const ai = await llm(JSON.stringify({
      task: "Produce a 1-year strategic plan. Return { themes: [{name, rationale}], objectives: [{slug,title,horizon,priority,expected_value_usd,confidence,rationale,metric,target_value}], milestones: [{quarter,description,success_metric}], capabilities_needed: [string], risks: [{title,category,probability,impact_usd,mitigation}] }.",
      context: ctx,
    }), SYSTEM_PLANNER);
    const objs: Array<any> = Array.isArray(ai?.objectives) ? ai.objectives : [];
    for (const o of objs) {
      const slug = (o.slug ?? o.title ?? "obj").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,60);
      await supabase.from("spe_objectives").upsert({
        slug, title: o.title, horizon: o.horizon ?? "1y",
        priority: clamp01(o.priority ?? 0.5),
        expected_value_usd: o.expected_value_usd ?? null,
        confidence: clamp01(o.confidence ?? 0.5),
        metric: o.metric ?? null, target_value: o.target_value ?? null,
        rationale: o.rationale ?? null, level: "strategic_goal",
      }, { onConflict: "slug" });
    }
    for (const r of (ai?.risks ?? []) as any[]) {
      await supabase.from("spe_risks").insert({
        title: r.title, category: r.category ?? null,
        probability: clamp01(r.probability ?? 0.3),
        impact_usd: r.impact_usd ?? null,
        severity: clamp01((r.probability ?? 0.3) * Math.min(1, (r.impact_usd ?? 1000) / 100000)),
        mitigation: r.mitigation ?? null, status: "open",
      });
    }
    await logEvolution("plan_year", null, null, null, ai, "AI annual plan", 0.7);
    return ai;
  },

  async forecastObjectives({ horizons = ["30d","90d","1y"] }) {
    const { data: objs } = await supabase.from("spe_objectives").select("*").eq("status","active");
    const ai = await llm(JSON.stringify({
      task: "For each objective, forecast the metric at each horizon end-date. Return { forecasts: [{ objective_slug, horizon, target_date_iso, forecast, ci_low, ci_high, method, confidence }] }.",
      objectives: objs ?? [], horizons, today: today(),
    }), SYSTEM_PLANNER);
    const forecasts: Array<any> = Array.isArray(ai?.forecasts) ? ai.forecasts : [];
    const inserted: any[] = [];
    for (const f of forecasts) {
      const { data: obj } = await supabase.from("spe_objectives").select("id").eq("slug", f.objective_slug).maybeSingle();
      if (!obj) continue;
      const { data } = await supabase.from("spe_forecasts").insert({
        objective_id: obj.id, horizon: f.horizon ?? "90d",
        target_date: f.target_date_iso ?? addDays(today(), 90),
        forecast: f.forecast ?? 0, ci_low: f.ci_low ?? null, ci_high: f.ci_high ?? null,
        method: f.method ?? "llm", confidence: clamp01(f.confidence ?? 0.5),
        features: f.features ?? {},
      }).select().single();
      if (data) inserted.push(data);
    }
    return { count: inserted.length, inserted };
  },

  async analyzeRisks() {
    const ctx = await strategicContext();
    const ai = await llm(JSON.stringify({
      task: "Identify the top strategic risks for GetPawsy (Pinterest algorithm, supplier concentration, inventory, AI dependency, traffic concentration, policy, economic). For each: { title, category, probability(0..1), impact_usd, severity(0..1), mitigation, monitoring, owner }.",
      context: ctx,
    }), SYSTEM_PLANNER);
    const risks: Array<any> = Array.isArray(ai?.risks) ? ai.risks : [];
    for (const r of risks) {
      await supabase.from("spe_risks").insert({
        title: r.title, category: r.category ?? null,
        probability: clamp01(r.probability ?? 0.3),
        impact_usd: r.impact_usd ?? null,
        severity: clamp01(r.severity ?? ((r.probability ?? 0.3) * 0.6)),
        mitigation: r.mitigation ?? null, monitoring: r.monitoring ?? null,
        owner: r.owner ?? null, status: "open",
      });
    }
    return { count: risks.length, risks };
  },

  async generateScenarios({ horizon = "90d" }) {
    const ctx = await strategicContext();
    const ai = await llm(JSON.stringify({
      task: `For horizon ${horizon}, produce strategic scenarios: best_case, expected_case, worst_case, disruption_case, rapid_growth_case, supply_chain_failure, pinterest_traffic_loss. For each: { scenario, assumptions, expected_revenue_usd, expected_profit_usd, expected_risk, strategic_response, confidence, rationale }.`,
      context: ctx, horizon,
    }), SYSTEM_PLANNER);
    const scenarios: Array<any> = Array.isArray(ai?.scenarios) ? ai.scenarios : [];
    for (const s of scenarios) {
      await supabase.from("spe_scenarios").insert({
        scenario: s.scenario, horizon,
        assumptions: s.assumptions ?? {},
        expected_revenue_usd: s.expected_revenue_usd ?? null,
        expected_profit_usd: s.expected_profit_usd ?? null,
        expected_risk: clamp01(s.expected_risk ?? 0.3),
        strategic_response: s.strategic_response ?? null,
        confidence: clamp01(s.confidence ?? 0.5),
        rationale: s.rationale ?? null,
      });
    }
    return { count: scenarios.length, scenarios };
  },

  async recommendInvestments({ budget_usd = 5000 }) {
    const ctx = await strategicContext();
    const { data: caps } = await supabase.from("spe_capabilities").select("*");
    const ai = await llm(JSON.stringify({
      task: `Allocate a ${budget_usd} USD strategic budget across the highest-leverage targets (initiatives, capabilities, experiments). For each: { target, amount_usd, rationale, expected_return_usd, expected_payback_days, risk, confidence }. Sum must equal budget.`,
      context: { ...ctx, capabilities: caps ?? [] }, budget_usd,
    }), SYSTEM_PLANNER);
    const allocations: Array<any> = Array.isArray(ai?.allocations) ? ai.allocations : [];
    const inserted: any[] = [];
    for (const a of allocations) {
      const { data } = await supabase.from("spe_investments").insert({
        target: a.target, amount_usd: a.amount_usd ?? 0,
        rationale: a.rationale ?? null,
        expected_return_usd: a.expected_return_usd ?? null,
        expected_payback_days: a.expected_payback_days ?? null,
        risk: clamp01(a.risk ?? 0.3),
        confidence: clamp01(a.confidence ?? 0.5),
        status: "recommended",
      }).select().single();
      if (data) inserted.push(data);
    }
    return { count: inserted.length, inserted };
  },

  async approveInvestment({ id, approved_by = "human", decision = "approved" }) {
    const { data, error } = await supabase.from("spe_investments").update({
      status: decision, approved_by, approved_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) throw error;
    await logEvolution("investment_decision","investment",id,null,data,`Human decision: ${decision}`, 0.95);
    return data;
  },

  async scoreMaturity() {
    const ctx = await strategicContext();
    const { data: domains } = await supabase.from("spe_settings").select("value").eq("key","domains").maybeSingle();
    const domainList: string[] = (domains?.value as string[]) ?? ["strategy","marketing","pinterest","creative","analytics","revenue","automation","governance","knowledge","experimentation","planning"];
    const ai = await llm(JSON.stringify({
      task: "Score business maturity 0..1 for each domain. Identify weakest_area and recommendations. Return { maturity: [{ domain, score, weakest_area, recommendations, evidence }] }.",
      context: ctx, domains: domainList,
    }), SYSTEM_PLANNER);
    const rows: Array<any> = Array.isArray(ai?.maturity) ? ai.maturity : [];
    for (const r of rows) {
      await supabase.from("spe_maturity").upsert({
        domain: r.domain, score: clamp01(r.score ?? 0.5),
        weakest_area: r.weakest_area ?? null,
        evidence: r.evidence ?? [],
        recommendations: r.recommendations ?? null,
      }, { onConflict: "domain" });
    }
    return { count: rows.length, rows };
  },

  async mapCapabilities() {
    const ctx = await strategicContext();
    const ai = await llm(JSON.stringify({
      task: "Map company capabilities across creative, marketing, analytics, automation, ai, customer_service, product_discovery, pricing, supply_chain, revenue_optimization. For each: { capability, domain, current_level(0..1), target_level(0..1), gap_notes, owner }.",
      context: ctx,
    }), SYSTEM_PLANNER);
    const rows: Array<any> = Array.isArray(ai?.capabilities) ? ai.capabilities : [];
    for (const r of rows) {
      await supabase.from("spe_capabilities").upsert({
        capability: r.capability, domain: r.domain ?? null,
        current_level: clamp01(r.current_level ?? 0.5),
        target_level: clamp01(r.target_level ?? 0.8),
        gap_notes: r.gap_notes ?? null, owner: r.owner ?? null,
      }, { onConflict: "capability" });
    }
    return { count: rows.length, rows };
  },

  async planResources({ resources }) {
    const list = Array.isArray(resources) ? resources : ["engineering","creative_generation","ai_credits","pinterest_publishing","video_rendering","experiment_bandwidth","infrastructure"];
    const ctx = await strategicContext();
    const ai = await llm(JSON.stringify({
      task: "Estimate capacity and propose allocation per strategic value. Return { plan: [{ resource, capacity_units, used_units, unit_label, allocation: { ...buckets: pct } , notes }] }.",
      context: ctx, resources: list,
    }), SYSTEM_PLANNER);
    const plan: Array<any> = Array.isArray(ai?.plan) ? ai.plan : [];
    for (const r of plan) {
      await supabase.from("spe_resources").upsert({
        resource: r.resource,
        capacity_units: r.capacity_units ?? null,
        used_units: r.used_units ?? null,
        unit_label: r.unit_label ?? "units",
        allocation: r.allocation ?? {}, notes: r.notes ?? null,
      }, { onConflict: "resource" });
    }
    return { count: plan.length, plan };
  },

  async generateExecutiveBrief({ cadence = "daily" }) {
    const ctx = await strategicContext();
    const ai = await llm(JSON.stringify({
      task: `Generate a ${cadence} executive briefing (max 10 bullets in summary). Return { summary, achievements, risks, forecasts, priorities, recommended_investments, recommended_experiments, recommended_pauses, confidence }.`,
      context: ctx, cadence,
    }), SYSTEM_PLANNER);
    const end = today();
    const startDays = cadence === "daily" ? 1 : cadence === "weekly" ? 7 : cadence === "monthly" ? 30 : cadence === "quarterly" ? 90 : 365;
    const { data } = await supabase.from("spe_briefings").insert({
      cadence, period_start: addDays(end, -startDays), period_end: end,
      summary: String(ai?.summary ?? ""),
      achievements: ai?.achievements ?? [], risks: ai?.risks ?? [],
      forecasts: ai?.forecasts ?? [], priorities: ai?.priorities ?? [],
      recommended_investments: ai?.recommended_investments ?? [],
      recommended_experiments: ai?.recommended_experiments ?? [],
      recommended_pauses: ai?.recommended_pauses ?? [],
      confidence: clamp01(ai?.confidence ?? 0.6),
    }).select().single();
    return data;
  },

  async addDependency({ from_kind, from_id, to_kind, to_id, relation = "depends_on", blocker = false, notes }) {
    const { data, error } = await supabase.from("spe_dependencies").upsert(
      { from_kind, from_id, to_kind, to_id, relation, blocker, notes }, { onConflict: "from_kind,from_id,to_kind,to_id,relation" }
    ).select().single();
    if (error) throw error;
    return data;
  },

  async criticalPath() {
    const [{ data: deps }, { data: inits }] = await Promise.all([
      supabase.from("spe_dependencies").select("*"),
      supabase.from("spe_initiatives").select("id,title,priority,status,effort_weeks"),
    ]);
    // Naive: rank initiatives by inbound blockers × priority
    const inbound: Record<string, number> = {};
    for (const d of (deps ?? [])) {
      if (d.blocker) inbound[d.to_id] = (inbound[d.to_id] ?? 0) + 1;
    }
    const ranked = (inits ?? []).map((i: any) => ({
      ...i, inbound_blockers: inbound[i.id] ?? 0,
      criticality: (i.priority ?? 0) * (1 + (inbound[i.id] ?? 0)),
    })).sort((a, b) => b.criticality - a.criticality).slice(0, 20);
    return { ranked };
  },

  async searchStrategy({ q, limit = 25 }) {
    if (!q) return { objectives: [], initiatives: [], risks: [], scenarios: [] };
    const like = `%${q}%`;
    const [o, i, r, s] = await Promise.all([
      supabase.from("spe_objectives").select("id,slug,title,horizon,priority,status").or(`title.ilike.${like},description.ilike.${like}`).limit(limit),
      supabase.from("spe_initiatives").select("id,title,horizon,status,priority").or(`title.ilike.${like},description.ilike.${like}`).limit(limit),
      supabase.from("spe_risks").select("id,title,category,severity,status").or(`title.ilike.${like},mitigation.ilike.${like}`).limit(limit),
      supabase.from("spe_scenarios").select("id,scenario,horizon,confidence").or(`scenario.ilike.${like},rationale.ilike.${like}`).limit(limit),
    ]);
    return { objectives: o.data ?? [], initiatives: i.data ?? [], risks: r.data ?? [], scenarios: s.data ?? [] };
  },

  async stats() {
    const [obj, init, rm, risks, scen, brief, inv, cap, mat] = await Promise.all([
      supabase.from("spe_objectives").select("*").order("priority",{ascending:false}).limit(50),
      supabase.from("spe_initiatives").select("*").order("priority",{ascending:false}).limit(50),
      supabase.from("spe_roadmap").select("*, initiative:spe_initiatives(title,horizon,priority,status)").order("position",{ascending:true}).limit(100),
      supabase.from("spe_risks").select("*").eq("status","open").order("severity",{ascending:false}).limit(20),
      supabase.from("spe_scenarios").select("*").order("created_at",{ascending:false}).limit(20),
      supabase.from("spe_briefings").select("*").order("created_at",{ascending:false}).limit(10),
      supabase.from("spe_investments").select("*").order("created_at",{ascending:false}).limit(20),
      supabase.from("spe_capabilities").select("*").order("current_level",{ascending:true}).limit(40),
      supabase.from("spe_maturity").select("*").order("score",{ascending:true}).limit(20),
    ]);
    return {
      objectives: obj.data ?? [], initiatives: init.data ?? [], roadmap: rm.data ?? [],
      risks: risks.data ?? [], scenarios: scen.data ?? [], briefings: brief.data ?? [],
      investments: inv.data ?? [], capabilities: cap.data ?? [], maturity: mat.data ?? [],
    };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const t0 = Date.now();
  try {
    const { action, ...payload } = await req.json();
    const fn = handlers[action];
    if (!fn) return new Response(JSON.stringify({ ok: false, error: `unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const result = await fn(payload);
    await supabase.from("spe_consultations").insert({
      engine_source: payload.source_engine ?? "unknown", action, query: payload,
      response_summary: { ok: true }, latency_ms: Date.now() - t0,
    });
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = msg === "ai_rate_limited" ? 429 : msg === "ai_credits_exhausted" ? 402 : 500;
    return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});