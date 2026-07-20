// Genesis Product Intelligence DNA — unified intelligence API
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DEFAULT_HEALTH_WEIGHTS = {
  sales_velocity: 0.18, conversion_rate: 0.16, margin: 0.16,
  inventory_health: 0.08, shipping_speed: 0.06, refund_rate: 0.06,
  customer_satisfaction: 0.08, pinterest_performance: 0.08,
  creative_performance: 0.06, trend_score: 0.05, seasonality: 0.03,
};

function n(x: any, d = 0) { const v = Number(x); return Number.isFinite(v) ? v : d; }
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

async function getHealthWeights() {
  const { data } = await supabase.from("gpd_settings").select("value").eq("key", "health_weights").maybeSingle();
  return { ...DEFAULT_HEALTH_WEIGHTS, ...(data?.value || {}) };
}

function overallHealth(h: any, w: any) {
  // refund_rate is inverse: 1-x
  const refund = 1 - clamp01(n(h.refund_rate));
  const blend =
    w.sales_velocity * clamp01(n(h.sales_velocity)) +
    w.conversion_rate * clamp01(n(h.conversion_rate)) +
    w.margin * clamp01(n(h.margin)) +
    w.inventory_health * clamp01(n(h.inventory_health)) +
    w.shipping_speed * clamp01(n(h.shipping_speed)) +
    w.refund_rate * refund +
    w.customer_satisfaction * clamp01(n(h.customer_satisfaction)) +
    w.pinterest_performance * clamp01(n(h.pinterest_performance)) +
    w.creative_performance * clamp01(n(h.creative_performance)) +
    w.trend_score * clamp01(n(h.trend_score)) +
    w.seasonality * clamp01(n(h.seasonality));
  return Math.round(blend * 1000) / 10; // 0..100
}

const handlers: Record<string, (p: any) => Promise<any>> = {
  async consult({ module_key, limit = 25 }) {
    let q = supabase.from("gpd_concepts").select("*").eq("is_active", true).order("weight", { ascending: false }).limit(limit);
    if (module_key) q = q.eq("module_key", module_key);
    const { data, error } = await q; if (error) throw error;
    return { concepts: data };
  },

  async upsertProduct(p: any) {
    if (!p.product_id) throw new Error("product_id required");
    const { error } = await supabase.from("gpd_products").upsert(p, { onConflict: "product_id" });
    if (error) throw error;
    return { ok: true };
  },

  async recordCommercial(c: any) {
    if (!c.product_id) throw new Error("product_id required");
    const revenue = n(c.current_price);
    const cogs = n(c.cost_price) + n(c.shipping_cost) + n(c.import_cost) + n(c.transaction_fees);
    const gross = revenue - cogs;
    const contribution = gross - n(c.ad_cost);
    const margin = revenue > 0 ? gross / revenue : 0;
    const breakeven_roas = contribution !== 0 && n(c.ad_cost) > 0 ? revenue / n(c.ad_cost) : null;
    const breakeven_cpa = contribution > 0 ? contribution : null;
    const payload = {
      ...c,
      snapshot_date: c.snapshot_date ?? new Date().toISOString().slice(0, 10),
      gross_profit: gross, net_profit: contribution, contribution_margin: contribution,
      actual_margin_pct: margin, breakeven_roas, breakeven_cpa,
    };
    const { error } = await supabase.from("gpd_commercial").upsert(payload, { onConflict: "product_id,snapshot_date" });
    if (error) throw error;
    return { ok: true, gross, margin };
  },

  async recordPriceChange({ product_id, price, currency = "USD", reason, source }) {
    if (!product_id || price == null) throw new Error("product_id,price required");
    const { data, error } = await supabase.from("gpd_price_history").insert({ product_id, price, currency, reason, source }).select().single();
    if (error) throw error;
    return data;
  },

  async recordHealth(h: any) {
    if (!h.product_id) throw new Error("product_id required");
    const weights = await getHealthWeights();
    const overall = overallHealth(h, weights);
    const payload = {
      ...h,
      snapshot_date: h.snapshot_date ?? new Date().toISOString().slice(0, 10),
      overall_score: overall,
    };
    const { error } = await supabase.from("gpd_health").upsert(payload, { onConflict: "product_id,snapshot_date" });
    if (error) throw error;
    return { ok: true, overall };
  },

  async upsertIntent(i: any) {
    if (!i.product_id) throw new Error("product_id required");
    const { error } = await supabase.from("gpd_intent").upsert({ ...i, updated_at: new Date().toISOString() }, { onConflict: "product_id" });
    if (error) throw error;
    return { ok: true };
  },

  async upsertCustomerFit(rows: any[]) {
    const list = Array.isArray(rows) ? rows : rows?.items ?? [];
    if (!list.length) throw new Error("items required");
    const { error } = await supabase.from("gpd_customer_fit").upsert(list, { onConflict: "product_id,segment" });
    if (error) throw error;
    return { ok: true, count: list.length };
  },

  async openOpportunity(o: any) {
    const { data, error } = await supabase.from("gpd_opportunities").insert(o).select().single();
    if (error) throw error;
    return data;
  },

  async recordTrend(t: any) {
    const { data, error } = await supabase.from("gpd_trends").insert(t).select().single();
    if (error) throw error;
    return data;
  },

  async proposeBundle(b: any) {
    const { data, error } = await supabase.from("gpd_bundles").insert(b).select().single();
    if (error) throw error;
    return data;
  },

  async recommendPrice(p: any) {
    const { data, error } = await supabase.from("gpd_price_recommendations").insert(p).select().single();
    if (error) throw error;
    return data;
  },

  async updateInventory(i: any) {
    if (!i.product_id) throw new Error("product_id required");
    const { error } = await supabase.from("gpd_inventory").upsert({ ...i, updated_at: new Date().toISOString() }, { onConflict: "product_id" });
    if (error) throw error;
    return { ok: true };
  },

  async upsertCreativeMatch(m: any) {
    if (!m.product_id) throw new Error("product_id required");
    const { error } = await supabase.from("gpd_creative_match").upsert({ ...m, updated_at: new Date().toISOString() }, { onConflict: "product_id" });
    if (error) throw error;
    return { ok: true };
  },

  async predict({ product_id, prediction_type = "revenue", features = {} }) {
    // Baseline: blend recent health overall + intent purchase probability
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: h }, { data: it }] = await Promise.all([
      supabase.from("gpd_health").select("overall_score").eq("product_id", product_id).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("gpd_intent").select("purchase_probability,refund_probability").eq("product_id", product_id).maybeSingle(),
    ]);
    const score = clamp01(((n(h?.overall_score) / 100) + n(it?.purchase_probability)) / 2);
    const refundDrag = 1 - clamp01(n(it?.refund_probability) * 0.5);
    const predicted = Math.round(score * refundDrag * 1000) / 1000;
    const ci = 1.96 * Math.sqrt(predicted * (1 - predicted) / 30);
    const row = {
      product_id, prediction_type,
      predicted_value: predicted, ci_low: Math.max(0, predicted - ci), ci_high: Math.min(1, predicted + ci),
      confidence: clamp01(0.4 + (h ? 0.3 : 0) + (it ? 0.3 : 0)),
      features, engine_source: "gpd-api",
    };
    const { data, error } = await supabase.from("gpd_predictions").insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async addDiscovery(d: any) {
    const { data, error } = await supabase.from("gpd_discovery").insert(d).select().single();
    if (error) throw error;
    return data;
  },

  async recommend({ kind = "products", product_id, limit = 10 }) {
    if (kind === "products") {
      // Top products by latest overall_score
      const { data, error } = await supabase
        .from("gpd_health").select("product_id,overall_score,snapshot_date,margin,conversion_rate")
        .order("overall_score", { ascending: false }).limit(limit);
      if (error) throw error;
      return { recommendations: data };
    }
    if (kind === "bundles") {
      const { data, error } = await supabase.from("gpd_bundles")
        .select("*").eq("status", "proposed").order("expected_profit_lift", { ascending: false }).limit(limit);
      if (error) throw error; return { recommendations: data };
    }
    if (kind === "creative") {
      if (!product_id) throw new Error("product_id required for creative");
      const { data, error } = await supabase.from("gpd_creative_match").select("*").eq("product_id", product_id).maybeSingle();
      if (error) throw error; return { recommendation: data };
    }
    if (kind === "opportunities") {
      const { data, error } = await supabase.from("gpd_opportunities")
        .select("*").eq("status","open").order("priority", { ascending: false }).limit(limit);
      if (error) throw error; return { recommendations: data };
    }
    throw new Error(`unknown kind: ${kind}`);
  },

  async stats() {
    const [{ data: mods }, { count: productCount }, { data: topHealth }, { data: opps }, { data: bundles }, { data: discs }] = await Promise.all([
      supabase.from("gpd_modules").select("*").order("key"),
      supabase.from("gpd_products").select("*", { count: "exact", head: true }),
      supabase.from("gpd_health").select("product_id,overall_score,snapshot_date").order("overall_score", { ascending: false }).limit(10),
      supabase.from("gpd_opportunities").select("*").eq("status","open").order("priority", { ascending: false }).limit(10),
      supabase.from("gpd_bundles").select("*").eq("status","proposed").order("expected_profit_lift", { ascending: false }).limit(10),
      supabase.from("gpd_discovery").select("*").eq("status","open").order("score", { ascending: false }).limit(10),
    ]);
    return { modules: mods, product_count: productCount, top_health: topHealth, open_opportunities: opps, bundles, discoveries: discs };
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
    await supabase.from("gpd_engine_consultations").insert({
      engine_source: payload.engine_source ?? "unknown",
      action, query: payload, response_summary: { ok: true }, latency_ms: Date.now() - t0,
    });
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});