// Genesis Market Intelligence DNA — external awareness API
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const n = (x: any, d = 0) => { const v = Number(x); return Number.isFinite(v) ? v : d; };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const handlers: Record<string, (p: any) => Promise<any>> = {
  async consult({ module_key, limit = 25 }) {
    let q = supabase.from("gmd_concepts").select("*").eq("is_active", true).order("weight", { ascending: false }).limit(limit);
    if (module_key) q = q.eq("module_key", module_key);
    const { data, error } = await q; if (error) throw error;
    return { concepts: data };
  },

  async recordTrend(t: any) {
    if (!t.label || !t.trend_type) throw new Error("label,trend_type required");
    const { data, error } = await supabase.from("gmd_trends").insert(t).select().single();
    if (error) throw error; return data;
  },

  async recordSearchSignal(s: any) {
    if (!s.source || !s.query) throw new Error("source,query required");
    const { data, error } = await supabase.from("gmd_search_signals").insert(s).select().single();
    if (error) throw error; return data;
  },

  async upsertCategory(c: any) {
    if (!c.key || !c.name) throw new Error("key,name required");
    const { error } = await supabase.from("gmd_categories").upsert({ ...c, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error; return { ok: true };
  },

  async recordCompetitorObservation(o: any) {
    if (!o.observation_type || !o.summary) throw new Error("observation_type,summary required");
    const { data, error } = await supabase.from("gmd_competitor_observations").insert(o).select().single();
    if (error) throw error; return data;
  },

  async recordPricingLandscape(p: any) {
    if (!p.category_key) throw new Error("category_key required");
    const { data, error } = await supabase.from("gmd_pricing_landscape").insert(p).select().single();
    if (error) throw error; return data;
  },

  async recordEconomicSignal(s: any) {
    if (!s.signal_type) throw new Error("signal_type required");
    const { data, error } = await supabase.from("gmd_economic_signals").insert(s).select().single();
    if (error) throw error; return data;
  },

  async addSeasonRecommendation(r: any) {
    if (!r.season_key || !r.recommendation_type || !r.recommendation) throw new Error("season_key,recommendation_type,recommendation required");
    const { data, error } = await supabase.from("gmd_season_recommendations").insert(r).select().single();
    if (error) throw error; return data;
  },

  async upsertRegionalProfile(p: any) {
    if (!p.region_code || !p.sub_region) throw new Error("region_code,sub_region required");
    const { error } = await supabase.from("gmd_regional_profiles").upsert({ ...p, updated_at: new Date().toISOString() }, { onConflict: "region_code,sub_region" });
    if (error) throw error; return { ok: true };
  },

  async recordSocialTrend(t: any) {
    if (!t.trend_label || !t.visual_type) throw new Error("trend_label,visual_type required");
    const { data, error } = await supabase.from("gmd_social_trends").insert(t).select().single();
    if (error) throw error; return data;
  },

  async openOpportunity(o: any) {
    if (!o.opportunity_type || !o.label) throw new Error("opportunity_type,label required");
    const { data, error } = await supabase.from("gmd_opportunities").insert(o).select().single();
    if (error) throw error; return data;
  },

  async recordRisk(r: any) {
    if (!r.risk_type || !r.label) throw new Error("risk_type,label required");
    const { data, error } = await supabase.from("gmd_risks").insert(r).select().single();
    if (error) throw error; return data;
  },

  async forecast({ forecast_type = "demand", subject_key, horizon_days = 30, features = {}, region_code = "US" }) {
    // Baseline: blend top trend signal strengths × economic direction for category/region
    const [{ data: trends }, { data: econ }, { data: cat }] = await Promise.all([
      supabase.from("gmd_trends").select("signal_strength,trend_type")
        .eq("status", "active").eq("category_key", subject_key ?? "").limit(20),
      supabase.from("gmd_economic_signals").select("business_impact_score").eq("region_code", region_code).order("observed_at", { ascending: false }).limit(10),
      subject_key ? supabase.from("gmd_categories").select("growth,demand,competition,profitability").eq("key", subject_key).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const trendAvg = (trends ?? []).reduce((a: number, b: any) => a + n(b.signal_strength), 0) / Math.max(1, (trends ?? []).length);
    const econAvg = (econ ?? []).reduce((a: number, b: any) => a + n(b.business_impact_score), 0) / Math.max(1, (econ ?? []).length);
    const catScore = cat ? clamp01((n((cat as any).growth) + n((cat as any).demand) - n((cat as any).competition)) / 2 + n((cat as any).profitability) * 0.5) : 0.5;
    const base = clamp01(0.5 * catScore + 0.3 * clamp01(trendAvg) + 0.2 * clamp01(0.5 + econAvg / 2));
    const ci = 1.96 * Math.sqrt((base * (1 - base)) / Math.max(7, horizon_days / 4));
    const row = {
      forecast_type, subject_key, region_code, horizon_days,
      predicted_value: Math.round(base * 1000) / 1000,
      ci_low: Math.max(0, base - ci), ci_high: Math.min(1, base + ci),
      confidence: clamp01(0.4 + (cat ? 0.3 : 0) + ((trends?.length ?? 0) > 3 ? 0.2 : 0) + ((econ?.length ?? 0) > 3 ? 0.1 : 0)),
      features,
    };
    const { data, error } = await supabase.from("gmd_forecasts").insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async recommend({ kind = "opportunities", limit = 10, region_code = "US", season_key, category_key }) {
    if (kind === "opportunities") {
      let q = supabase.from("gmd_opportunities").select("*").eq("status", "open").order("rank_score", { ascending: false }).limit(limit);
      if (region_code) q = q.eq("region_code", region_code);
      const { data, error } = await q; if (error) throw error; return { recommendations: data };
    }
    if (kind === "trends") {
      let q = supabase.from("gmd_trends").select("*").eq("status", "active").order("signal_strength", { ascending: false }).limit(limit);
      if (region_code) q = q.eq("region_code", region_code);
      if (category_key) q = q.eq("category_key", category_key);
      const { data, error } = await q; if (error) throw error; return { recommendations: data };
    }
    if (kind === "season") {
      let q = supabase.from("gmd_season_recommendations").select("*").eq("status", "open").order("priority", { ascending: false }).limit(limit);
      if (season_key) q = q.eq("season_key", season_key);
      const { data, error } = await q; if (error) throw error; return { recommendations: data };
    }
    if (kind === "risks") {
      const { data, error } = await supabase.from("gmd_risks").select("*").eq("status", "open")
        .order("severity", { ascending: false }).limit(limit);
      if (error) throw error; return { recommendations: data };
    }
    if (kind === "social") {
      const { data, error } = await supabase.from("gmd_social_trends").select("*").eq("status", "active")
        .order("signal_strength", { ascending: false }).limit(limit);
      if (error) throw error; return { recommendations: data };
    }
    if (kind === "pricing") {
      let q = supabase.from("gmd_pricing_landscape").select("*").order("observed_at", { ascending: false }).limit(limit);
      if (category_key) q = q.eq("category_key", category_key);
      const { data, error } = await q; if (error) throw error; return { recommendations: data };
    }
    throw new Error(`unknown kind: ${kind}`);
  },

  async searchKnowledge({ q, limit = 20 }) {
    if (!q) throw new Error("q required");
    const ilike = `%${q}%`;
    const [{ data: concepts }, { data: trends }, { data: opps }, { data: signals }] = await Promise.all([
      supabase.from("gmd_concepts").select("module_key,key,name,description,confidence,weight").or(`name.ilike.${ilike},description.ilike.${ilike},key.ilike.${ilike}`).limit(limit),
      supabase.from("gmd_trends").select("id,label,trend_type,signal_strength,category_key,region_code").ilike("label", ilike).limit(limit),
      supabase.from("gmd_opportunities").select("id,label,opportunity_type,rank_score,category_key,region_code").ilike("label", ilike).limit(limit),
      supabase.from("gmd_search_signals").select("source,query,volume,growth_pct,region_code").ilike("query", ilike).limit(limit),
    ]);
    return { concepts, trends, opportunities: opps, search_signals: signals };
  },

  async logAssumption(a: any) {
    if (!a.assumption) throw new Error("assumption required");
    const { data, error } = await supabase.from("gmd_assumption_log").insert(a).select().single();
    if (error) throw error; return data;
  },

  async retireAssumption({ id, reason }) {
    if (!id) throw new Error("id required");
    const { error } = await supabase.from("gmd_assumption_log").update({ status: "retired", reason, retired_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error; return { ok: true };
  },

  async stats() {
    const today = new Date().toISOString();
    const [{ data: mods }, { count: trendCount }, { data: hotTrends }, { data: opps }, { data: risks }, { data: cats }, { data: social }, { data: assumptions }] = await Promise.all([
      supabase.from("gmd_modules").select("*").order("key"),
      supabase.from("gmd_trends").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("gmd_trends").select("id,label,trend_type,signal_strength,confidence,category_key").eq("status","active").order("signal_strength", { ascending: false }).limit(10),
      supabase.from("gmd_opportunities").select("*").eq("status","open").order("rank_score", { ascending: false }).limit(10),
      supabase.from("gmd_risks").select("*").eq("status","open").order("severity", { ascending: false }).limit(10),
      supabase.from("gmd_categories").select("key,name,growth,demand,competition,profitability").order("growth", { ascending: false }).limit(15),
      supabase.from("gmd_social_trends").select("trend_label,visual_type,signal_strength").eq("status","active").order("signal_strength", { ascending: false }).limit(10),
      supabase.from("gmd_assumption_log").select("*").eq("status","active").order("created_at", { ascending: false }).limit(10),
    ]);
    void today;
    return { modules: mods, active_trend_count: trendCount, hot_trends: hotTrends, opportunities: opps, risks, categories: cats, social_trends: social, assumptions };
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
    await supabase.from("gmd_engine_consultations").insert({
      engine_source: payload.engine_source ?? "unknown",
      action, query: payload, response_summary: { ok: true }, latency_ms: Date.now() - t0,
    });
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});