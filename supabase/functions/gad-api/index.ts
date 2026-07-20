// Genesis Analytics DNA — unified intelligence API (observes only)
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function num(x: any, d = 0) { const n = Number(x); return Number.isFinite(n) ? n : d; }

function computeConfidence(p: { completeness?: number; freshness?: number; sampling?: number; consistency?: number }) {
  const w = { completeness: 0.30, freshness: 0.20, sampling: 0.15, consistency: 0.35 };
  const c = clamp01(num(p.completeness, 0.5)) * w.completeness
          + clamp01(num(p.freshness, 0.5))    * w.freshness
          + clamp01(num(p.sampling, 0.5))     * w.sampling
          + clamp01(num(p.consistency, 0.5))  * w.consistency;
  return Math.round(c * 1000) / 1000;
}

const handlers: Record<string, (p: any) => Promise<any>> = {
  async consult({ module_key, limit = 25 }) {
    let q = supabase.from("gad_concepts").select("*").eq("is_active", true).order("weight", { ascending: false }).limit(limit);
    if (module_key) q = q.eq("module_key", module_key);
    const { data, error } = await q;
    if (error) throw error;
    return { concepts: data };
  },
  async recordEvent(e: any) {
    if (!e.event_name) throw new Error("event_name required");
    const { error } = await supabase.from("gad_events").insert({
      event_name: e.event_name, source_key: e.source_key,
      occurred_at: e.occurred_at ?? new Date().toISOString(),
      session_id: e.session_id, visitor_id: e.visitor_id,
      device: e.device, country: e.country,
      product_id: e.product_id, creative_id: e.creative_id, board_id: e.board_id,
      campaign: e.campaign, traffic_source: e.traffic_source,
      utm: e.utm ?? {}, pinterest_ids: e.pinterest_ids ?? {}, tiktok_ids: e.tiktok_ids ?? {},
      revenue_usd: e.revenue_usd, metadata: e.metadata ?? {}, trust_score: num(e.trust_score, 0.7),
    });
    if (error) throw error;
    return { ok: true };
  },
  async recordMetric(m: any) {
    if (!m.metric_key) throw new Error("metric_key required");
    const confidence = m.confidence ?? computeConfidence(m);
    const { data, error } = await supabase.from("gad_metrics").upsert({
      metric_key: m.metric_key,
      snapshot_date: m.snapshot_date ?? new Date().toISOString().slice(0, 10),
      scope: m.scope ?? "global", scope_ref: m.scope_ref ?? null,
      value: num(m.value), completeness: m.completeness, freshness: m.freshness,
      sampling: m.sampling, consistency: m.consistency, latency_ms: m.latency_ms,
      confidence, metadata: m.metadata ?? {},
    }, { onConflict: "metric_key,snapshot_date,scope,scope_ref" }).select().single();
    if (error) throw error;
    return data;
  },
  async validateTruth(v: any) {
    if (!v.metric_key || !v.source_a || !v.source_b) throw new Error("metric_key,source_a,source_b required");
    const a = num(v.value_a), b = num(v.value_b);
    const delta_abs = Math.abs(a - b);
    const denom = Math.max(1e-9, Math.abs(a) + Math.abs(b)) / 2;
    const delta_pct = delta_abs / denom;
    const status = delta_pct < 0.02 ? "match" : delta_pct < 0.10 ? "warn" : "mismatch";
    const confidence = clamp01(1 - delta_pct);
    const { data, error } = await supabase.from("gad_truth_validations").insert({
      metric_key: v.metric_key, scope: v.scope, scope_ref: v.scope_ref,
      source_a: v.source_a, value_a: a, source_b: v.source_b, value_b: b,
      delta_abs, delta_pct, status, confidence, notes: v.notes, metadata: v.metadata ?? {},
    }).select().single();
    if (error) throw error;
    return data;
  },
  async reportAnomaly(a: any) {
    if (!a.anomaly_type) throw new Error("anomaly_type required");
    const obs = num(a.observed), exp = num(a.expected);
    const sigma = num(a.sigma, Math.max(1, Math.abs(exp) * 0.15));
    const z = sigma > 0 ? (obs - exp) / sigma : 0;
    const sev = Math.abs(z) > 3 ? "critical" : Math.abs(z) > 2 ? "high" : Math.abs(z) > 1 ? "medium" : "low";
    const { data, error } = await supabase.from("gad_anomalies").insert({
      anomaly_type: a.anomaly_type, severity: a.severity ?? sev,
      scope: a.scope, scope_ref: a.scope_ref,
      observed: obs, expected: exp, z_score: z,
      confidence: clamp01(Math.min(1, Math.abs(z) / 3)),
      metadata: a.metadata ?? {},
    }).select().single();
    if (error) throw error;
    return data;
  },
  async recordAttribution(rows: any) {
    const list = Array.isArray(rows) ? rows : rows.items ?? [];
    if (!list.length) throw new Error("items required");
    const { error } = await supabase.from("gad_attributions").insert(list);
    if (error) throw error;
    return { ok: true, inserted: list.length };
  },
  async recordForecast(f: any) {
    const { data, error } = await supabase.from("gad_forecasts").insert({
      forecast_type: f.forecast_type, scope: f.scope, scope_ref: f.scope_ref,
      predicted_value: num(f.predicted_value), ci_low: f.ci_low, ci_high: f.ci_high,
      predicted_for: f.predicted_for, engine_source: f.engine_source,
      metadata: f.metadata ?? {},
    }).select().single();
    if (error) throw error;
    return data;
  },
  async resolveForecast({ id, actual_value }) {
    const { data: f } = await supabase.from("gad_forecasts").select("*").eq("id", id).maybeSingle();
    if (!f) throw new Error("forecast not found");
    const err = Math.abs(num(actual_value) - num(f.predicted_value)) / Math.max(1e-9, Math.abs(num(f.predicted_value)));
    const accuracy = clamp01(1 - err);
    const { data, error } = await supabase.from("gad_forecasts").update({
      actual_value: num(actual_value), accuracy_score: accuracy, resolved_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async auditDecision(d: any) {
    const { data, error } = await supabase.from("gad_ai_decision_audit").insert({
      engine_source: d.engine_source, decision: d.decision, reason: d.reason,
      confidence: num(d.confidence, 0.5), expected_outcome: d.expected_outcome ?? {},
      metadata: d.metadata ?? {},
    }).select().single();
    if (error) throw error;
    return data;
  },
  async resolveDecision({ id, actual_outcome, financial_impact_usd, learning }) {
    const { data, error } = await supabase.from("gad_ai_decision_audit").update({
      actual_outcome, financial_impact_usd, learning, status: "resolved",
      resolved_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async stats() {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: mods }, { count: events24 }, { count: anomalies }, { data: validations }, { data: funnel }] = await Promise.all([
      supabase.from("gad_modules").select("*").order("key"),
      supabase.from("gad_events").select("*", { count: "exact", head: true }).gte("occurred_at", new Date(Date.now() - 86400e3).toISOString()),
      supabase.from("gad_anomalies").select("*", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("gad_truth_validations").select("status, confidence").order("created_at", { ascending: false }).limit(50),
      supabase.from("gad_funnel_snapshots").select("*").eq("snapshot_date", today).order("step_order"),
    ]);
    const truthScore = validations && validations.length
      ? Math.round(validations.reduce((s: number, v: any) => s + Number(v.confidence ?? 0), 0) / validations.length * 100) : null;
    return { modules: mods, events_24h: events24, open_anomalies: anomalies, truth_score: truthScore, funnel };
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
    await supabase.from("gad_engine_consultations").insert({
      engine_source: payload.engine_source ?? "unknown",
      action, query: payload, response_summary: { ok: true }, latency_ms: Date.now() - t0,
    });
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});