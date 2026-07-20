// Genesis Revenue Optimization Engine — commercial optimization API
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

async function snapshotForDate(d: string) {
  const { data } = await supabase.from("roe_snapshots").select("*").eq("snapshot_date", d).order("source").limit(1).maybeSingle();
  return data;
}

async function dnaSnapshot() {
  const [{ data: gbd }, { data: gpd }, { data: gmd }, { data: gcp }] = await Promise.all([
    supabase.from("gbd_modules").select("key,name,avg_confidence,concept_count").limit(15),
    supabase.from("gpd_modules").select("key,name,avg_confidence,concept_count").limit(15),
    supabase.from("gmd_modules").select("key,name,avg_confidence,concept_count").limit(15),
    supabase.from("gcp_modules").select("key,name,avg_confidence,concept_count").limit(15),
  ]);
  return { business: gbd ?? [], product: gpd ?? [], market: gmd ?? [], customer: gcp ?? [] };
}

const handlers: Record<string, (p: any) => Promise<any>> = {
  async ingestSnapshot(p) {
    const row = { snapshot_date: p.snapshot_date ?? today(), source: p.source ?? "composite", ...p.metrics, attributes: p.attributes ?? {} };
    const { data, error } = await supabase.from("roe_snapshots")
      .upsert(row, { onConflict: "snapshot_date,source" }).select().single();
    if (error) throw error;
    return data;
  },

  async recomputeRevenueTree({ snapshot_date }) {
    const d = snapshot_date ?? today();
    const snap = await snapshotForDate(d);
    if (!snap) throw new Error("no snapshot for date");
    const r = Number(snap.revenue ?? 0);
    const nodes: Array<{ node: string; value: number; dRev: number; dProf: number }> = [
      { node: "traffic", value: snap.visitors ?? 0, dRev: r / Math.max(1, snap.visitors ?? 1), dProf: (snap.net_margin ?? 0) / Math.max(1, snap.visitors ?? 1) },
      { node: "ctr", value: snap.ctr ?? 0, dRev: r / Math.max(0.0001, snap.ctr ?? 0.01), dProf: (snap.net_margin ?? 0) / Math.max(0.0001, snap.ctr ?? 0.01) },
      { node: "qualified", value: snap.qualified_visits ?? 0, dRev: r / Math.max(1, snap.qualified_visits ?? 1), dProf: (snap.net_margin ?? 0) / Math.max(1, snap.qualified_visits ?? 1) },
      { node: "cvr", value: (snap.orders ?? 0) / Math.max(1, snap.qualified_visits ?? 1), dRev: r / Math.max(0.0001, (snap.orders ?? 0) / Math.max(1, snap.qualified_visits ?? 1)), dProf: (snap.net_margin ?? 0) / Math.max(0.0001, (snap.orders ?? 0) / Math.max(1, snap.qualified_visits ?? 1)) },
      { node: "orders", value: snap.orders ?? 0, dRev: snap.aov ?? 0, dProf: ((snap.aov ?? 0) * 0.3) },
      { node: "aov", value: snap.aov ?? 0, dRev: snap.orders ?? 0, dProf: ((snap.orders ?? 0) * 0.3) },
      { node: "revenue", value: r, dRev: 1, dProf: 0.3 },
      { node: "gross_margin", value: snap.gross_margin ?? 0, dRev: 0, dProf: 1 },
      { node: "net_margin", value: snap.net_margin ?? 0, dRev: 0, dProf: 1 },
      { node: "cash_flow", value: snap.cash_flow ?? 0, dRev: 0, dProf: 1 },
    ];
    const rows = nodes.map(n => ({ snapshot_date: d, node: n.node, value: n.value, sensitivity_revenue: n.dRev, sensitivity_profit: n.dProf }));
    await supabase.from("roe_revenue_tree").upsert(rows, { onConflict: "snapshot_date,node" });
    return rows;
  },

  async findBottleneck({ horizon_days = 14 }) {
    const since = new Date(Date.now() - horizon_days * 86400000).toISOString().slice(0, 10);
    const { data: snaps } = await supabase.from("roe_snapshots").select("*").gte("snapshot_date", since).order("snapshot_date");
    const dna = await dnaSnapshot();
    const out = await llm(
      `Given these ${horizon_days}-day daily snapshots: ${JSON.stringify(snaps ?? []).slice(0, 4000)}\nDNA summary: ${JSON.stringify(dna).slice(0, 1500)}\nIdentify the top 5 highest-value constraints across areas (revenue|profit|conversion|traffic|trust|operational|inventory|creative). JSON: { "bottlenecks":[{"area":"...","description":"...","severity":0..1,"expected_unlock_usd":number,"recommended_action":"...","confidence":0..1,"evidence":["..."]}] }`,
      "You diagnose business constraints conservatively, profit-first. JSON only."
    );
    const rows = (out?.bottlenecks ?? []).map((b: any) => ({
      area: b.area, description: b.description, severity: clamp01(b.severity ?? 0.5),
      expected_unlock_usd: b.expected_unlock_usd ?? null, recommended_action: b.recommended_action ?? null,
      confidence: clamp01(b.confidence ?? 0.5), evidence: b.evidence ?? [],
    }));
    if (rows.length) await supabase.from("roe_bottlenecks").insert(rows);
    return rows;
  },

  async marginalValue({ lever, delta_pct, baseline_snapshot_date }) {
    if (!lever || delta_pct == null) throw new Error("lever, delta_pct required");
    const snap = await snapshotForDate(baseline_snapshot_date ?? today());
    if (!snap) throw new Error("no baseline snapshot");
    const r = Number(snap.revenue ?? 0);
    // simple elasticity-based defaults
    const elasticityMap: Record<string, number> = { ctr: 1.0, cvr: 1.0, aov: 1.0, repeat: 0.6, refund: -0.8, cac: -0.6, price: 0.7, bundle: 0.5 };
    const elasticity = elasticityMap[lever] ?? 0.5;
    const expRev = r * (Number(delta_pct) / 100) * elasticity;
    const expProfit = expRev * 0.3; // assume 30% incremental margin
    const expPayback = Number(snap.payback_days ?? 60);
    const { data, error } = await supabase.from("roe_marginal_value").insert({
      lever, delta_pct,
      expected_revenue_usd: expRev,
      expected_profit_usd: expProfit,
      expected_payback_days: expPayback,
      risk: lever === "price" ? 0.6 : 0.4,
      roi: expProfit > 0 ? expProfit / Math.max(1, Math.abs(expRev) * 0.1) : 0,
      confidence: 0.55,
      notes: `elasticity ${elasticity}`,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async rankPortfolio({ snapshot_date, products }) {
    const d = snapshot_date ?? today();
    if (!Array.isArray(products) || !products.length) throw new Error("products[] required");
    const rows: any[] = [];
    for (const p of products) {
      const { data: score } = await supabase.rpc("roe_portfolio_score", {
        revenue_30d: p.revenue_30d ?? 0, profit_30d: p.profit_30d ?? 0, margin_pct: p.margin_pct ?? 0,
        growth_pct: p.growth_pct ?? 0, trend_score: p.trend_score ?? 0, ltv_score: p.ltv_score ?? 0,
        refund_rate: p.refund_rate ?? 0, operational_complexity: p.operational_complexity ?? 0,
        shipping_cost: p.shipping_cost ?? 0, inventory_stability: p.inventory_stability ?? 0,
        expected_future_value_usd: p.expected_future_value_usd ?? 0,
      });
      const composite = Number(score) || 0;
      const action = composite > 5 ? "scale" : composite > 2 ? "hold" : composite > 0 ? "optimize" : "retire";
      rows.push({ snapshot_date: d, product_id: String(p.product_id), product_label: p.product_label ?? null,
        revenue_30d: p.revenue_30d, profit_30d: p.profit_30d, margin_pct: p.margin_pct,
        growth_pct: p.growth_pct, trend_score: p.trend_score, ltv_score: p.ltv_score,
        refund_rate: p.refund_rate, operational_complexity: p.operational_complexity,
        shipping_cost: p.shipping_cost, inventory_stability: p.inventory_stability,
        expected_future_value_usd: p.expected_future_value_usd,
        composite_score: composite, recommended_action: action });
    }
    rows.sort((a, b) => b.composite_score - a.composite_score);
    rows.forEach((r, i) => (r.rank = i + 1));
    await supabase.from("roe_portfolio_ranks").upsert(rows, { onConflict: "snapshot_date,product_id" });
    return rows;
  },

  async recommendInvestment({ snapshot_date, available_resources }) {
    const d = snapshot_date ?? today();
    const snap = await snapshotForDate(d);
    const dna = await dnaSnapshot();
    const { data: bottlenecks } = await supabase.from("roe_bottlenecks").select("*").eq("status", "open").order("severity",{ascending:false}).limit(10);
    const out = await llm(
      `Recommend capital allocation as share percentages summing to 100. Resources: ${JSON.stringify(available_resources ?? ["engineering","ai_credits","pinterest_publish","video","creative","ads","seo","expansion","infra"])}.\nLatest snapshot: ${JSON.stringify(snap ?? {})}\nOpen bottlenecks: ${JSON.stringify(bottlenecks ?? [])}\nDNA: ${JSON.stringify(dna).slice(0,1500)}\nReturn JSON: { "allocations":[{"resource":"...","recommended_share_pct":0..100,"expected_return_usd":number,"rationale":"...","confidence":0..1}] }`,
      "You allocate capital based on highest expected long-term return, profit-first. JSON only."
    );
    const rows = (out?.allocations ?? []).map((a: any) => ({
      snapshot_date: d, resource: a.resource, recommended_share_pct: Number(a.recommended_share_pct ?? 0),
      expected_return_usd: a.expected_return_usd ?? null, rationale: a.rationale ?? null,
      confidence: clamp01(a.confidence ?? 0.5),
    }));
    if (rows.length) await supabase.from("roe_capital_allocations").upsert(rows, { onConflict: "snapshot_date,resource" });
    return rows;
  },

  async simulate({ scenario, intervention }) {
    if (!scenario) throw new Error("scenario required");
    const snap = await snapshotForDate(today());
    const out = await llm(
      `Scenario: ${scenario}\nIntervention: ${JSON.stringify(intervention ?? {})}\nLatest snapshot: ${JSON.stringify(snap ?? {})}\nEstimate the business impact. Return JSON: { "expected_revenue_usd":number, "expected_profit_usd":number, "expected_cash_flow_usd":number, "expected_risk":0..1, "confidence":0..1, "rationale":"..." }`,
      "You produce conservative profit-first simulations. Never recommend execution. JSON only."
    );
    const { data, error } = await supabase.from("roe_simulations").insert({
      scenario, intervention: intervention ?? {},
      expected_revenue_usd: out?.expected_revenue_usd ?? null,
      expected_profit_usd: out?.expected_profit_usd ?? null,
      expected_cash_flow_usd: out?.expected_cash_flow_usd ?? null,
      expected_risk: clamp01(out?.expected_risk ?? 0.5),
      confidence: clamp01(out?.confidence ?? 0.5),
      rationale: out?.rationale ?? null,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async predictRevenue({ horizon = "daily", days = 14 }) {
    const { data: snaps } = await supabase.from("roe_snapshots").select("snapshot_date,revenue,net_margin").order("snapshot_date",{ascending:false}).limit(60);
    const series = (snaps ?? []).slice().reverse();
    const out = await llm(
      `Historic daily snapshots: ${JSON.stringify(series).slice(0, 3500)}\nForecast the next ${days} ${horizon} periods of revenue and profit. JSON: { "forecasts":[{"target_date":"YYYY-MM-DD","revenue":number,"revenue_ci_low":number,"revenue_ci_high":number,"profit":number,"profit_ci_low":number,"profit_ci_high":number}], "model":"...","model_version":"..." }`,
      "You produce honest forecasts with 95% confidence intervals. Be conservative. JSON only."
    );
    const rows: any[] = [];
    for (const f of out?.forecasts ?? []) {
      rows.push({ horizon, metric: "revenue", target_date: f.target_date, forecast: f.revenue, ci_low: f.revenue_ci_low, ci_high: f.revenue_ci_high, model: out?.model ?? "llm", model_version: out?.model_version ?? "v1" });
      rows.push({ horizon, metric: "profit", target_date: f.target_date, forecast: f.profit, ci_low: f.profit_ci_low, ci_high: f.profit_ci_high, model: out?.model ?? "llm", model_version: out?.model_version ?? "v1" });
    }
    if (rows.length) await supabase.from("roe_forecasts").upsert(rows, { onConflict: "horizon,metric,target_date,model_version" });
    return rows;
  },

  async recordUnitEconomics(p) {
    const row = { snapshot_date: p.snapshot_date ?? today(), ...p };
    delete (row as any).snapshot_date_skip;
    const { data, error } = await supabase.from("roe_unit_economics")
      .upsert(row, { onConflict: "snapshot_date" }).select().single();
    if (error) throw error;
    await supabase.rpc("roe_compose_scorecard", { p_date: row.snapshot_date });
    return data;
  },

  async recommendPricing(p) {
    if (!p.product_id || !p.recommended_price) throw new Error("product_id, recommended_price required");
    const { data, error } = await supabase.from("roe_pricing_recommendations").insert({
      product_id: String(p.product_id),
      current_price: p.current_price ?? null,
      recommended_price: Number(p.recommended_price),
      expected_conversion_impact: p.expected_conversion_impact ?? null,
      expected_margin_impact: p.expected_margin_impact ?? null,
      expected_revenue_impact_usd: p.expected_revenue_impact_usd ?? null,
      expected_ltv_impact: p.expected_ltv_impact ?? null,
      brand_impact: p.brand_impact ?? null,
      competitive_position: p.competitive_position ?? null,
      rationale: p.rationale ?? null,
      confidence: clamp01(p.confidence ?? 0.5),
      status: "pending_approval",
    }).select().single();
    if (error) throw error;
    return data;
  },

  async approvePricing({ id, approved_by, decision = "approved" }) {
    const { data, error } = await supabase.from("roe_pricing_recommendations")
      .update({ status: decision, approved_by: approved_by ?? "human", approved_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async recommendScaling(p) {
    if (!p.channel || !p.target) throw new Error("channel, target required");
    const { data, error } = await supabase.from("roe_scaling_opportunities").insert({
      channel: p.channel, target: p.target,
      current_spend_usd: p.current_spend_usd ?? null,
      recommended_spend_usd: p.recommended_spend_usd ?? null,
      expected_marginal_return: p.expected_marginal_return ?? null,
      expected_revenue_usd: p.expected_revenue_usd ?? null,
      expected_profit_usd: p.expected_profit_usd ?? null,
      risk: clamp01(p.risk ?? 0.4),
      rationale: p.rationale ?? null,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async calculateEnterpriseValue({ snapshot_date }) {
    const d = snapshot_date ?? today();
    const { data } = await supabase.rpc("roe_compose_scorecard", { p_date: d });
    const { data: scorecard } = await supabase.from("roe_executive_scorecard").select("*").eq("snapshot_date", d).maybeSingle();
    return { ...(data ?? {}), scorecard };
  },

  async searchRevenueKnowledge({ q, limit = 25 }) {
    if (!q) throw new Error("q required");
    const ilike = `%${q}%`;
    const [{ data: bot }, { data: sim }, { data: pri }, { data: scl }, { data: pr }] = await Promise.all([
      supabase.from("roe_bottlenecks").select("*").or(`description.ilike.${ilike},area.ilike.${ilike}`).limit(limit),
      supabase.from("roe_simulations").select("*").ilike("scenario", ilike).limit(limit),
      supabase.from("roe_pricing_recommendations").select("*").or(`rationale.ilike.${ilike},product_id.ilike.${ilike}`).limit(limit),
      supabase.from("roe_scaling_opportunities").select("*").or(`channel.ilike.${ilike},target.ilike.${ilike},rationale.ilike.${ilike}`).limit(limit),
      supabase.from("roe_portfolio_ranks").select("*").or(`product_id.ilike.${ilike},product_label.ilike.${ilike}`).order("composite_score",{ascending:false}).limit(limit),
    ]);
    return { bottlenecks: bot ?? [], simulations: sim ?? [], pricing: pri ?? [], scaling: scl ?? [], portfolio: pr ?? [] };
  },

  async stats() {
    const d = today();
    const [{ data: snap }, { data: scorecard }, { data: ue }, { data: bot }, { data: tree }, { data: portfolio }, { data: alloc }, { data: forecasts }, { data: pricing }, { data: scaling }] = await Promise.all([
      supabase.from("roe_snapshots").select("*").order("snapshot_date",{ascending:false}).limit(7),
      supabase.from("roe_executive_scorecard").select("*").order("snapshot_date",{ascending:false}).limit(1).maybeSingle(),
      supabase.from("roe_unit_economics").select("*").order("snapshot_date",{ascending:false}).limit(1).maybeSingle(),
      supabase.from("roe_bottlenecks").select("*").eq("status","open").order("severity",{ascending:false}).limit(10),
      supabase.from("roe_revenue_tree").select("*").eq("snapshot_date", d),
      supabase.from("roe_portfolio_ranks").select("*").order("snapshot_date",{ascending:false}).order("composite_score",{ascending:false}).limit(15),
      supabase.from("roe_capital_allocations").select("*").order("snapshot_date",{ascending:false}).limit(15),
      supabase.from("roe_forecasts").select("*").order("target_date",{ascending:true}).limit(30),
      supabase.from("roe_pricing_recommendations").select("*").order("created_at",{ascending:false}).limit(10),
      supabase.from("roe_scaling_opportunities").select("*").eq("status","open").order("expected_profit_usd",{ascending:false}).limit(10),
    ]);
    return { snapshots: snap ?? [], scorecard, unit_economics: ue, bottlenecks: bot ?? [], revenue_tree: tree ?? [], portfolio: portfolio ?? [], capital: alloc ?? [], forecasts: forecasts ?? [], pricing: pricing ?? [], scaling: scaling ?? [] };
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
    await supabase.from("roe_consultations").insert({
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