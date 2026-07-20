// Genesis Creative DNA — unified intelligence API
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DEFAULT_WEIGHTS = { ctr: 0.10, outbound: 0.20, save: 0.15, atc: 0.15, cvr: 0.20, roas: 0.20 };

function num(x: any, d = 0) { const n = Number(x); return Number.isFinite(n) ? n : d; }

async function getWeights() {
  const { data } = await supabase.from("gcd_settings").select("value").eq("key", "success_score_weights").maybeSingle();
  return { ...DEFAULT_WEIGHTS, ...(data?.value || {}) };
}

function successScore(p: any, w: any) {
  const ctr = p.impressions > 0 ? p.clicks / p.impressions : 0;
  const outbound = p.impressions > 0 ? p.outbound_clicks / p.impressions : 0;
  const save = p.impressions > 0 ? p.saves / p.impressions : 0;
  const atc = p.clicks > 0 ? p.add_to_cart / p.clicks : 0;
  const cvr = p.clicks > 0 ? p.purchases / p.clicks : 0;
  const roas = p.revenue_usd > 0 ? p.revenue_usd / Math.max(1, num(p.cost_usd, 1)) / 5 : 0;
  const norm = (x: number, k: number) => Math.min(1, x / k);
  const composite =
    w.ctr * norm(ctr, 0.05) +
    w.outbound * norm(outbound, 0.02) +
    w.save * norm(save, 0.03) +
    w.atc * norm(atc, 0.10) +
    w.cvr * norm(cvr, 0.02) +
    w.roas * Math.min(1, roas);
  return { ctr, outbound_ctr: outbound, save_rate: save, atc_rate: atc, cvr, roas, success_score: Math.round(composite * 1000) / 10 };
}

const handlers: Record<string, (p: any) => Promise<any>> = {
  async consult({ module_key, limit = 25 }) {
    let q = supabase.from("gcd_concepts").select("*").eq("is_active", true).order("weight", { ascending: false }).limit(limit);
    if (module_key) q = q.eq("module_key", module_key);
    const { data, error } = await q;
    if (error) throw error;
    return { concepts: data };
  },
  async recommend({ family = "lifestyle", gene_types = ["camera", "lighting", "color", "composition", "typography"], top_k = 3 }) {
    const out: any = { family, recommendations: {} };
    for (const t of gene_types) {
      const { data } = await supabase.from("gcd_genes")
        .select("*").eq("family", family).eq("gene_type", t).eq("is_active", true)
        .order("weight", { ascending: false }).limit(top_k);
      out.recommendations[t] = data || [];
    }
    return out;
  },
  async upsertCreative(genome: any) {
    const { creative_id, visual_dna, ...rest } = genome;
    if (!creative_id) throw new Error("creative_id required");
    const { error: e1 } = await supabase.from("gcd_creatives").upsert({ creative_id, ...rest }, { onConflict: "creative_id" });
    if (e1) throw e1;
    if (visual_dna) {
      const { error: e2 } = await supabase.from("gcd_visual_dna").upsert({ creative_id, ...visual_dna }, { onConflict: "creative_id" });
      if (e2) throw e2;
    }
    return { ok: true, creative_id };
  },
  async recordPerformance(p: any) {
    if (!p.creative_id) throw new Error("creative_id required");
    const weights = await getWeights();
    const scored = successScore(p, weights);
    const payload = {
      creative_id: p.creative_id,
      snapshot_date: p.snapshot_date ?? new Date().toISOString().slice(0, 10),
      impressions: num(p.impressions), clicks: num(p.clicks),
      outbound_clicks: num(p.outbound_clicks), saves: num(p.saves),
      add_to_cart: num(p.add_to_cart), checkouts: num(p.checkouts),
      purchases: num(p.purchases), revenue_usd: num(p.revenue_usd),
      profit_usd: num(p.profit_usd), returns: num(p.returns), refunds_usd: num(p.refunds_usd),
      ...scored, metadata: p.metadata ?? {},
    };
    const { error } = await supabase.from("gcd_performance").upsert(payload, { onConflict: "creative_id,snapshot_date" });
    if (error) throw error;
    return { ok: true, scored };
  },
  async predict({ creative_id, prediction_type = "ctr", features = {} }) {
    // Simple baseline: average winning-gene weight (placeholder for ML model)
    const { data: genes } = await supabase.from("gcd_genes").select("weight,confidence").eq("is_active", true).order("weight", { ascending: false }).limit(50);
    const w = (genes ?? []).reduce((a, g: any) => a + num(g.weight), 0) / Math.max(1, (genes ?? []).length);
    const predicted = Math.round(w * 1000) / 1000;
    const conf = (genes ?? []).reduce((a, g: any) => a + num(g.confidence), 0) / Math.max(1, (genes ?? []).length);
    const ci = 1.96 * Math.sqrt((predicted * (1 - predicted)) / Math.max(20, (genes ?? []).length));
    const row = {
      creative_id: creative_id ?? null,
      prediction_type,
      predicted_value: predicted,
      ci_low: Math.max(0, predicted - ci),
      ci_high: Math.min(1, predicted + ci),
      confidence: conf,
      features,
      engine_source: "gcd-api",
    };
    const { data, error } = await supabase.from("gcd_predictions").insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async recordLearning(l: any) {
    if (!l.engine_source || !l.insight) throw new Error("engine_source and insight required");
    const { data: row, error } = await supabase.from("gcd_learnings").insert(l).select().single();
    if (error) throw error;
    // Apply EMA update if concept or gene specified
    if (l.module_key && l.concept_key && (l.delta_weight || l.delta_confidence)) {
      const { data: c } = await supabase.from("gcd_concepts").select("*").eq("module_key", l.module_key).eq("key", l.concept_key).maybeSingle();
      if (c) {
        const alpha = 0.2;
        const newW = Math.max(0, Math.min(1, num(c.weight) + alpha * num(l.delta_weight)));
        const newC = Math.max(0, Math.min(1, num(c.confidence) + alpha * num(l.delta_confidence)));
        await supabase.from("gcd_concepts").update({
          weight: newW, confidence: newC,
          evidence_count: num(c.evidence_count) + 1,
          positive_evidence: num(c.positive_evidence) + (num(l.delta_weight) > 0 ? 1 : 0),
          negative_evidence: num(c.negative_evidence) + (num(l.delta_weight) < 0 ? 1 : 0),
          last_evidence_at: new Date().toISOString(),
        }).eq("id", c.id);
      }
    }
    if (l.family && l.gene_type && l.gene_value) {
      const { data: g } = await supabase.from("gcd_genes").select("*").eq("family", l.family).eq("gene_type", l.gene_type).eq("gene_value", l.gene_value).maybeSingle();
      if (g) {
        const alpha = 0.2;
        const newW = Math.max(0, Math.min(1, num(g.weight) + alpha * num(l.delta_weight)));
        const win = num(l.delta_weight) > 0;
        await supabase.from("gcd_genes").update({
          weight: newW,
          confidence: Math.max(0, Math.min(1, num(g.confidence) + alpha * num(l.delta_confidence))),
          evidence_count: num(g.evidence_count) + 1,
          wins: num(g.wins) + (win ? 1 : 0),
          losses: num(g.losses) + (win ? 0 : 1),
          last_evidence_at: new Date().toISOString(),
        }).eq("id", g.id);
      }
    }
    await supabase.from("gcd_learnings").update({ applied: true }).eq("id", row.id);
    return { ok: true, id: row.id };
  },
  async stats() {
    const [{ data: mods }, { count: creatives }, { count: perfRows }, { data: topPins }] = await Promise.all([
      supabase.from("gcd_modules").select("*").order("key"),
      supabase.from("gcd_creatives").select("*", { count: "exact", head: true }),
      supabase.from("gcd_performance").select("*", { count: "exact", head: true }),
      supabase.from("gcd_performance").select("creative_id,success_score,revenue_usd,impressions").order("success_score", { ascending: false }).limit(10),
    ]);
    return { modules: mods, creative_count: creatives, performance_rows: perfRows, top_creatives: topPins };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const started = Date.now();
  try {
    const { action, ...payload } = await req.json();
    const fn = handlers[action];
    if (!fn) return new Response(JSON.stringify({ ok: false, error: `unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const result = await fn(payload);
    await supabase.from("gcd_engine_consultations").insert({
      engine_source: payload.engine_source ?? "unknown",
      action,
      query: payload,
      response_summary: { ok: true },
      latency_ms: Date.now() - started,
    });
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});