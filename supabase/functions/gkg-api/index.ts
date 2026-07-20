// Genesis Knowledge Graph & Reasoning Engine — cognitive brain API
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

async function llm(prompt: string, system?: string, jsonMode = true) {
  if (!LOVABLE_KEY) throw new Error("LOVABLE_API_KEY missing");
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (res.status === 429) throw new Error("ai_rate_limited");
  if (res.status === 402) throw new Error("ai_credits_exhausted");
  if (!res.ok) throw new Error(`ai_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const content = j?.choices?.[0]?.message?.content ?? "";
  if (!jsonMode) return { text: content };
  try { return JSON.parse(content); } catch { return { _raw: content }; }
}

async function dnaSnapshot() {
  // Pull compact summary from every DNA so reasoning is grounded.
  const [gbd, gcp, gpi, gcd, gad, gpd, gmd] = await Promise.all([
    supabase.from("gbd_modules").select("key,name,avg_confidence,concept_count").order("key"),
    supabase.from("gcp_modules").select("key,name,avg_confidence,concept_count").order("key"),
    supabase.from("gpi_modules").select("key,name,avg_confidence,concept_count").order("key"),
    supabase.from("gcd_modules").select("key,name,avg_confidence,concept_count").order("key"),
    supabase.from("gad_modules").select("key,name,avg_confidence,concept_count").order("key"),
    supabase.from("gpd_modules").select("key,name,avg_confidence,concept_count").order("key"),
    supabase.from("gmd_modules").select("key,name,avg_confidence,concept_count").order("key"),
  ]);
  return {
    business_dna: gbd.data ?? [],
    customer_psychology_dna: gcp.data ?? [],
    pinterest_dna: gpi.data ?? [],
    creative_dna: gcd.data ?? [],
    analytics_dna: gad.data ?? [],
    product_dna: gpd.data ?? [],
    market_dna: gmd.data ?? [],
  };
}

const handlers: Record<string, (p: any) => Promise<any>> = {
  async upsertNode(p) {
    const { data, error } = await supabase.rpc("gkg_upsert_node", {
      p_type: p.node_type, p_ref_id: String(p.ref_id), p_label: p.label,
      p_description: p.description ?? null, p_attributes: p.attributes ?? {},
      p_confidence: p.confidence ?? 0.7, p_importance: p.importance ?? 0.5,
      p_source_dna: p.source_dna ?? null,
    });
    if (error) throw error;
    return { id: data };
  },

  async upsertEdge(p) {
    // Accept either node ids or (type, ref_id) pairs
    async function resolve(side: any) {
      if (side.id) return side.id;
      const { data } = await supabase.from("gkg_nodes").select("id").eq("node_type", side.node_type).eq("ref_id", String(side.ref_id)).maybeSingle();
      if (data?.id) return data.id;
      const { data: created, error } = await supabase.rpc("gkg_upsert_node", {
        p_type: side.node_type, p_ref_id: String(side.ref_id), p_label: side.label ?? String(side.ref_id),
        p_description: null, p_attributes: {}, p_confidence: 0.6, p_importance: 0.4, p_source_dna: side.source_dna ?? null,
      });
      if (error) throw error;
      return created;
    }
    const from = await resolve(p.from);
    const to = await resolve(p.to);
    const { data, error } = await supabase.rpc("gkg_upsert_edge", {
      p_from: from, p_to: to, p_relation: p.relation,
      p_weight: p.weight ?? 0.5, p_confidence: p.confidence ?? 0.5,
      p_attributes: p.attributes ?? {}, p_source_dna: p.source_dna ?? null,
      p_positive: p.positive ?? 1, p_negative: p.negative ?? 0,
    });
    if (error) throw error;
    return { id: data, from, to };
  },

  async searchKnowledge({ q, limit = 25 }) {
    if (!q) throw new Error("q required");
    const ilike = `%${q}%`;
    const [{ data: nodes }, { data: memories }, { data: hyps }, { data: traces }] = await Promise.all([
      supabase.from("gkg_nodes").select("id,node_type,ref_id,label,confidence,importance,source_dna").ilike("label", ilike).limit(limit),
      supabase.from("gkg_memory").select("id,memory_type,title,importance,confidence,tags").or(`title.ilike.${ilike},body.ilike.${ilike}`).limit(limit),
      supabase.from("gkg_hypotheses").select("id,question,hypothesis,confidence,status").or(`question.ilike.${ilike},hypothesis.ilike.${ilike}`).limit(limit),
      supabase.from("gkg_reasoning_traces").select("id,question,conclusion,confidence,source_engine,created_at").or(`question.ilike.${ilike},conclusion.ilike.${ilike}`).order("created_at",{ascending:false}).limit(limit),
    ]);
    return { nodes, memories, hypotheses: hyps, traces };
  },

  async semanticSearch({ q, limit = 10 }) {
    if (!q) throw new Error("q required");
    // Use the LLM to translate the question to filters + an answer plan.
    const summary = await dnaSnapshot();
    const out = await llm(
      `Question: ${q}\nReturn JSON: { "intent":"...", "relevant_dna":["..."], "graph_filters":{"node_types":["product","creative","..."]}, "search_terms":["..."] }\nDNA snapshot:\n${JSON.stringify(summary).slice(0, 4000)}`,
      "You translate natural-language commerce questions into knowledge-graph search filters. JSON only.",
      true,
    );
    const terms: string[] = Array.isArray(out?.search_terms) ? out.search_terms.slice(0, 5) : [q];
    const ilike = `%${terms[0]}%`;
    const { data: nodes } = await supabase.from("gkg_nodes").select("id,node_type,label,importance,confidence").ilike("label", ilike).limit(limit);
    return { plan: out, nodes };
  },

  async generateHypotheses({ question, source_engine = "unknown", k = 5 }) {
    if (!question) throw new Error("question required");
    const snap = await dnaSnapshot();
    const out = await llm(
      `Question: ${question}\nGenerate ${k} hypotheses for GetPawsy. Each must include: hypothesis, evidence (string[]), counter_evidence (string[]), confidence (0..1), expected_impact_usd (number|null), validation_plan (string).\nReturn JSON: { "alternatives": [ ... ] }\nDNA snapshot:\n${JSON.stringify(snap).slice(0, 3500)}`,
      "You are GetPawsy's commerce reasoning brain. Be specific, evidence-based, conservative on confidence. JSON only.",
      true,
    );
    const alts = Array.isArray(out?.alternatives) ? out.alternatives : [];
    const primary = alts[0] ?? { hypothesis: "no_primary", evidence: [], counter_evidence: [], confidence: 0.3 };
    const { data, error } = await supabase.from("gkg_hypotheses").insert({
      question,
      hypothesis: primary.hypothesis ?? "n/a",
      alternatives: alts,
      evidence: { items: primary.evidence ?? [] },
      counter_evidence: { items: primary.counter_evidence ?? [] },
      expected_impact_usd: primary.expected_impact_usd ?? null,
      confidence: clamp01(primary.confidence ?? 0.4),
      validation_plan: primary.validation_plan ?? null,
      source_engine,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async findRootCause({ symptom, context = {}, source_engine = "unknown" }) {
    if (!symptom) throw new Error("symptom required");
    const snap = await dnaSnapshot();
    const out = await llm(
      `Symptom: ${symptom}\nContext: ${JSON.stringify(context).slice(0, 1500)}\nDerive a causal chain (cause→effect) ending in the most likely root cause. JSON: { "cause_chain": [{"step":1,"observation":"...","reasoning":"..."}], "root_cause":"...", "evidence_chain":["..."], "confidence":0..1 }\nDNA snapshot:\n${JSON.stringify(snap).slice(0, 3000)}`,
      "You are a causal-reasoning engine. Distinguish correlation from causation. JSON only.",
      true,
    );
    const { data, error } = await supabase.from("gkg_root_causes").insert({
      symptom,
      cause_chain: out?.cause_chain ?? [],
      root_cause: out?.root_cause ?? "unknown",
      evidence_chain: out?.evidence_chain ?? [],
      confidence: clamp01(out?.confidence ?? 0.4),
    }).select().single();
    if (error) throw error;
    return data;
  },

  async predictOutcome({ scenario, intervention = {}, baseline = {} }) {
    if (!scenario) throw new Error("scenario required");
    const out = await llm(
      `Scenario: ${scenario}\nIntervention: ${JSON.stringify(intervention)}\nBaseline: ${JSON.stringify(baseline)}\nReturn JSON: { "predicted_outcome": {...}, "expected_impact_usd": number|null, "risk_score":0..1, "confidence":0..1, "reasoning": "..." }`,
      "You are a counterfactual reasoning engine. Be conservative. Never recommend execution. JSON only.",
      true,
    );
    const { data, error } = await supabase.from("gkg_counterfactuals").insert({
      scenario, intervention, baseline,
      predicted_outcome: out?.predicted_outcome ?? {},
      expected_impact_usd: out?.expected_impact_usd ?? null,
      risk_score: clamp01(out?.risk_score ?? 0.5),
      confidence: clamp01(out?.confidence ?? 0.4),
    }).select().single();
    if (error) throw error;
    return data;
  },

  async reason({ question, source_engine = "unknown" }) {
    if (!question) throw new Error("question required");
    const snap = await dnaSnapshot();
    const out = await llm(
      `Question: ${question}\nReason step by step. Consult relevant DNA. Provide alternatives. Conclude with confidence.\nReturn JSON: { "evidence":[...], "reasoning_chain":[{"step":1,"thought":"..."}], "alternatives":[{"option":"...","reason":"..."}], "conclusion":"...", "confidence":0..1, "expected_outcome":{...}, "consulted_dna":["business","customer","pinterest","creative","analytics","product","market"] }\nDNA snapshot:\n${JSON.stringify(snap).slice(0, 3500)}`,
      "You are GetPawsy's reasoning engine. Always explainable. JSON only.",
      true,
    );
    const { data, error } = await supabase.from("gkg_reasoning_traces").insert({
      question,
      source_engine,
      evidence: out?.evidence ?? [],
      reasoning_chain: out?.reasoning_chain ?? [],
      alternatives: out?.alternatives ?? [],
      conclusion: out?.conclusion ?? "inconclusive",
      confidence: clamp01(out?.confidence ?? 0.4),
      expected_outcome: out?.expected_outcome ?? {},
      consulted_dna: Array.isArray(out?.consulted_dna) ? out.consulted_dna : [],
    }).select().single();
    if (error) throw error;
    return data;
  },

  async buildDecisionBrief({ decision_topic, target_consumer = "executive_board" }) {
    if (!decision_topic) throw new Error("decision_topic required");
    const snap = await dnaSnapshot();
    const out = await llm(
      `Decision topic: ${decision_topic}\nTarget consumer: ${target_consumer}\nReturn JSON: { "summary":"...", "recommendation":"...", "evidence":[...], "alternatives":[...], "risks":[...], "expected_business_value_usd": number|null, "confidence":0..1 }\nDNA snapshot:\n${JSON.stringify(snap).slice(0, 3000)}`,
      "You prepare crisp decision briefs for senior decision-makers. JSON only. Recommendations only — never authorize execution.",
      true,
    );
    const { data, error } = await supabase.from("gkg_decision_briefs").insert({
      decision_topic, target_consumer,
      summary: out?.summary ?? "",
      recommendation: out?.recommendation ?? "",
      evidence: out?.evidence ?? [],
      alternatives: out?.alternatives ?? [],
      risks: out?.risks ?? [],
      expected_business_value_usd: out?.expected_business_value_usd ?? null,
      confidence: clamp01(out?.confidence ?? 0.4),
    }).select().single();
    if (error) throw error;
    return data;
  },

  async recordOutcome({ trace_id, actual_outcome, learning }) {
    if (!trace_id) throw new Error("trace_id required");
    const { error } = await supabase.from("gkg_reasoning_traces").update({
      actual_outcome, learning, outcome_at: new Date().toISOString(),
    }).eq("id", trace_id);
    if (error) throw error;
    return { ok: true };
  },

  async addMemory(m) {
    if (!m.title || !m.body || !m.memory_type) throw new Error("memory_type,title,body required");
    const { data, error } = await supabase.from("gkg_memory").insert(m).select().single();
    if (error) throw error;
    return data;
  },

  async detectContradiction(c) {
    const { data, error } = await supabase.from("gkg_contradictions").insert(c).select().single();
    if (error) throw error;
    return data;
  },

  async evolve() {
    const { data, error } = await supabase.rpc("gkg_evolve");
    if (error) throw error;
    return data;
  },

  async neighbors({ node_id, relation, direction = "both", limit = 50 }) {
    if (!node_id) throw new Error("node_id required");
    let outE: any = []; let inE: any = [];
    if (direction !== "in") {
      let q = supabase.from("gkg_edges").select("id,relation,to_node,weight,confidence,evidence_count").eq("from_node", node_id).eq("is_active", true).limit(limit);
      if (relation) q = q.eq("relation", relation);
      const { data } = await q; outE = data ?? [];
    }
    if (direction !== "out") {
      let q = supabase.from("gkg_edges").select("id,relation,from_node,weight,confidence,evidence_count").eq("to_node", node_id).eq("is_active", true).limit(limit);
      if (relation) q = q.eq("relation", relation);
      const { data } = await q; inE = data ?? [];
    }
    return { outgoing: outE, incoming: inE };
  },

  async stats() {
    const [{ count: nodeCount }, { count: edgeCount }, { count: memCount }, { data: topNodes }, { data: hotHyp }, { data: rootCauses }, { data: traces }, { data: briefs }, { data: contradictions }] = await Promise.all([
      supabase.from("gkg_nodes").select("*", { count: "exact", head: true }),
      supabase.from("gkg_edges").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("gkg_memory").select("*", { count: "exact", head: true }),
      supabase.from("gkg_nodes").select("id,node_type,label,importance,confidence,source_dna").order("importance", { ascending: false }).limit(15),
      supabase.from("gkg_hypotheses").select("*").eq("status","open").order("confidence",{ascending:false}).limit(10),
      supabase.from("gkg_root_causes").select("*").eq("status","open").order("detected_at",{ascending:false}).limit(10),
      supabase.from("gkg_reasoning_traces").select("id,question,conclusion,confidence,source_engine,created_at").order("created_at",{ascending:false}).limit(10),
      supabase.from("gkg_decision_briefs").select("*").order("created_at",{ascending:false}).limit(10),
      supabase.from("gkg_contradictions").select("*").eq("resolution_status","open").order("severity",{ascending:false}).limit(10),
    ]);
    return { node_count: nodeCount, active_edge_count: edgeCount, memory_count: memCount, top_nodes: topNodes, hot_hypotheses: hotHyp, recent_root_causes: rootCauses, recent_traces: traces, briefs, contradictions };
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
    await supabase.from("gkg_consultations").insert({
      engine_source: payload.source_engine ?? payload.engine_source ?? "unknown",
      action, query: payload, response_summary: { ok: true }, latency_ms: Date.now() - t0,
    });
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = msg === "ai_rate_limited" ? 429 : msg === "ai_credits_exhausted" ? 402 : 500;
    return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});