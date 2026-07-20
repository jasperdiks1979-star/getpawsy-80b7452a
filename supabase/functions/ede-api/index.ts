// Genesis Executive Decision Engine — board-level decision API
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";
import { fetchOrganicHealth, fetchOrganicProductRanking, fetchOrganicPinRanking } from "../_shared/organic-ranking.ts";

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
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (res.status === 429) throw new Error("ai_rate_limited");
  if (res.status === 402) throw new Error("ai_credits_exhausted");
  if (!res.ok) throw new Error(`ai_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  try { return JSON.parse(j?.choices?.[0]?.message?.content ?? "{}"); } catch { return {}; }
}

async function dnaSnapshot() {
  const [gbd, gpd, gmd, gcp] = await Promise.all([
    supabase.from("gbd_modules").select("key,name,avg_confidence,concept_count").limit(20),
    supabase.from("gpd_modules").select("key,name,avg_confidence,concept_count").limit(20),
    supabase.from("gmd_modules").select("key,name,avg_confidence,concept_count").limit(20),
    supabase.from("gcp_modules").select("key,name,avg_confidence,concept_count").limit(20),
  ]);
  // Organic-First Layer-1 truth attached to every board briefing.
  const [health, topProducts, topPins] = await Promise.all([
    fetchOrganicHealth(supabase).catch(() => null),
    fetchOrganicProductRanking(supabase).then((r) => r.slice(0, 20)).catch(() => []),
    fetchOrganicPinRanking(supabase).then((r) => r.slice(0, 20)).catch(() => []),
  ]);
  return {
    business: gbd.data ?? [],
    product: gpd.data ?? [],
    market: gmd.data ?? [],
    customer: gcp.data ?? [],
    organic_first: {
      principle: "Organic conversions > ATC > product views > sessions. Paid = validation only.",
      health,
      top_organic_products: topProducts,
      top_organic_pins: topPins,
    },
  };
}

const handlers: Record<string, (p: any) => Promise<any>> = {
  async proposeDecision(p) {
    if (!p.proposal_type || !p.title || !p.summary) throw new Error("proposal_type,title,summary required");
    // Phase 1 evidence-source tag on every proposal. Soft-enforce:
    // default to 'heuristic' when the caller doesn't supply one.
    const allowedEv = new Set(["organic", "paid", "blended", "heuristic", "insufficient_data"]);
    const evidence_source = allowedEv.has(p.evidence_source) ? p.evidence_source : "heuristic";
    if (!allowedEv.has(p.evidence_source)) {
      console.warn(`[ede-api] proposal missing evidence_source (defaulted to heuristic) type=${p.proposal_type} title=${p.title}`);
    }
    const { data, error } = await supabase.from("ede_proposals").insert({
      proposal_type: p.proposal_type,
      title: p.title,
      summary: p.summary,
      submitted_by: p.submitted_by ?? "unknown",
      baseline: p.baseline ?? {},
      intervention: p.intervention ?? {},
      evidence: p.evidence ?? [],
      consulted_dna: p.consulted_dna ?? [],
      risk_level: p.risk_level ?? "medium",
      estimated_impact_usd: p.estimated_impact_usd ?? null,
      status: "draft",
      requires_human: !!p.requires_human,
      evidence_source,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async generateAlternatives({ proposal_id, k = 5 }) {
    const { data: prop, error } = await supabase.from("ede_proposals").select("*").eq("id", proposal_id).single();
    if (error) throw error;
    const snap = await dnaSnapshot();
    const out = await llm(
      `Proposal: ${prop.title}\nSummary: ${prop.summary}\nBaseline: ${JSON.stringify(prop.baseline)}\nIntervention: ${JSON.stringify(prop.intervention)}\nGenerate ${k} ranked strategic alternatives. JSON: { "alternatives":[{"rank":1,"option_label":"...","description":"...","expected_impact_usd":number|null,"risk":0..1,"confidence":0..1}] }\nDNA: ${JSON.stringify(snap).slice(0,2000)}`,
      "You generate diverse strategic alternatives for executive review. Always include do-nothing and reduce-effort variants. JSON only."
    );
    const rows = (out?.alternatives ?? []).slice(0, k).map((a: any, i: number) => ({
      proposal_id, rank: a.rank ?? i + 1,
      option_label: a.option_label ?? `Option ${i + 1}`,
      description: a.description ?? null,
      expected_impact_usd: a.expected_impact_usd ?? null,
      risk: clamp01(a.risk ?? 0.5),
      confidence: clamp01(a.confidence ?? 0.5),
      attributes: a.attributes ?? {},
    }));
    if (rows.length) {
      const { error: insErr } = await supabase.from("ede_alternatives").insert(rows);
      if (insErr) throw insErr;
    }
    return rows;
  },

  async simulateScenario({ proposal_id, scenario_type, description }) {
    if (!proposal_id || !scenario_type) throw new Error("proposal_id,scenario_type required");
    const { data: prop } = await supabase.from("ede_proposals").select("*").eq("id", proposal_id).single();
    const out = await llm(
      `Proposal: ${prop?.title}\nSummary: ${prop?.summary}\nScenario: ${scenario_type} — ${description ?? ""}\nSimulate. JSON: { "description":"...", "predicted_outcome":{}, "probability":0..1, "expected_impact_usd":number|null, "recovery_plan":"..." }`,
      "You produce conservative scenario simulations. Never authorize execution. JSON only."
    );
    const { data, error } = await supabase.from("ede_scenarios").insert({
      proposal_id, scenario_type,
      description: out?.description ?? description ?? scenario_type,
      predicted_outcome: out?.predicted_outcome ?? {},
      probability: clamp01(out?.probability ?? 0.25),
      expected_impact_usd: out?.expected_impact_usd ?? null,
      recovery_plan: out?.recovery_plan ?? null,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async calculateBusinessValue({ proposal_id }) {
    const { data: prop } = await supabase.from("ede_proposals").select("*").eq("id", proposal_id).single();
    if (!prop) throw new Error("proposal not found");
    const snap = await dnaSnapshot();
    const out = await llm(
      `Score this proposal across all business value axes. Proposal: ${prop.title}\n${prop.summary}\nBaseline: ${JSON.stringify(prop.baseline)}\nIntervention: ${JSON.stringify(prop.intervention)}\nReturn JSON with: revenue_impact_usd, profit_impact_usd, customer_impact_score(0..1), operational_impact_score, brand_impact_score, strategic_impact_score, risk_score, cost_usd, expected_roi, time_horizon_days, learning_value_score, data_completeness, historical_similarity, forecast_accuracy, business_confidence.\nDNA: ${JSON.stringify(snap).slice(0,1500)}`,
      "You quantify business value with conservative confidence. JSON only."
    );
    const row = { proposal_id, ...out };
    const { data, error } = await supabase.from("ede_business_value")
      .upsert(row, { onConflict: "proposal_id" }).select().single();
    if (error) throw error;
    return data;
  },

  async runExecutiveVote({ proposal_id }) {
    const { data: prop, error: pe } = await supabase.from("ede_proposals").select("*").eq("id", proposal_id).single();
    if (pe) throw pe;
    const { data: execs } = await supabase.from("ede_executives").select("*").eq("active", true);
    const { data: bv } = await supabase.from("ede_business_value").select("*").eq("proposal_id", proposal_id).maybeSingle();
    const { data: alts } = await supabase.from("ede_alternatives").select("*").eq("proposal_id", proposal_id).order("rank");
    const { data: scns } = await supabase.from("ede_scenarios").select("*").eq("proposal_id", proposal_id);

    await supabase.from("ede_proposals").update({ status: "voting", voting_opened_at: new Date().toISOString() }).eq("id", proposal_id);

    const votes: any[] = [];
    for (const ex of execs ?? []) {
      const out = await llm(
        `You are the ${ex.title} of GetPawsy. Perspective: ${ex.perspective}. Mandate: ${ex.mandate}.\nProposal: ${prop.title}\n${prop.summary}\nIntervention: ${JSON.stringify(prop.intervention)}\nBusiness value: ${JSON.stringify(bv ?? {})}\nAlternatives: ${JSON.stringify(alts ?? [])}\nScenarios: ${JSON.stringify(scns ?? [])}\nVote. JSON: { "vote":"approve|reject|conditional|abstain", "conditions":"...optional", "reasoning":"...", "confidence":0..1, "perspective_impact":{...}, "evidence":["..."] }`,
        `You vote strictly from the ${ex.title} viewpoint. Be rigorous, evidence-based, conservative. JSON only.`
      );
      votes.push({
        proposal_id, executive_id: ex.id,
        vote: ["approve","reject","conditional","abstain"].includes(out?.vote) ? out.vote : "abstain",
        conditions: out?.conditions ?? null,
        reasoning: out?.reasoning ?? "no reasoning",
        confidence: clamp01(out?.confidence ?? 0.5),
        perspective_impact: out?.perspective_impact ?? {},
        evidence: Array.isArray(out?.evidence) ? out.evidence : [],
        weight_at_vote: Number(ex.weight) || 1.0,
      });
      await supabase.from("ede_executives").update({ vote_count: (ex.vote_count ?? 0) + 1 }).eq("id", ex.id);
    }
    if (votes.length) {
      await supabase.from("ede_votes").upsert(votes, { onConflict: "proposal_id,executive_id" });
    }

    // weighted consensus
    const scoreMap: Record<string, number> = { approve: 1, conditional: 0.5, reject: -1, abstain: 0 };
    let weighted = 0, participating = 0, approveW = 0, rejectW = 0, condW = 0, totalConf = 0;
    for (const v of votes) {
      const w = v.weight_at_vote * v.confidence;
      weighted += (scoreMap[v.vote] ?? 0) * w;
      participating += v.vote === "abstain" ? 0 : v.weight_at_vote;
      totalConf += v.confidence * v.weight_at_vote;
      if (v.vote === "approve") approveW += v.weight_at_vote;
      else if (v.vote === "reject") rejectW += v.weight_at_vote;
      else if (v.vote === "conditional") condW += v.weight_at_vote;
    }
    const totalActive = (execs ?? []).reduce((s, e) => s + Number(e.weight || 1), 0) || 1;
    const approvalPct = participating > 0 ? (approveW + 0.5 * condW) / participating : 0;

    // veto rule: CRO Risk reject blocks unless overridden
    const riskExec = (execs ?? []).find((e) => e.role_key === "cro_risk");
    const riskVote = votes.find((v) => v.executive_id === riskExec?.id);
    const cfoExec = (execs ?? []).find((e) => e.role_key === "cfo");
    const cfoVote = votes.find((v) => v.executive_id === cfoExec?.id);
    const riskVeto = riskVote?.vote === "reject" && (prop.risk_level === "high" || prop.risk_level === "critical");
    const cfoVeto = cfoVote?.vote === "reject" && Number(bv?.profit_impact_usd ?? 0) < 0;

    let outcome: "approved" | "conditional" | "rejected" = "rejected";
    if (riskVeto || cfoVeto) outcome = "rejected";
    else if (approvalPct >= 0.66 && condW === 0) outcome = "approved";
    else if (approvalPct >= 0.50) outcome = "conditional";

    const governanceRequired = prop.risk_level === "critical" || (bv?.risk_score ?? 0) >= 0.7;
    const humanRequired = !!prop.requires_human || prop.risk_level === "critical" || riskVeto;

    const rationaleParts: string[] = [
      `Approval ${(approvalPct * 100).toFixed(0)}% (weight ${participating.toFixed(2)}/${totalActive.toFixed(2)}).`,
    ];
    if (riskVeto) rationaleParts.push("Risk veto triggered.");
    if (cfoVeto) rationaleParts.push("CFO veto: negative profit impact.");
    if (governanceRequired) rationaleParts.push("Governance review required.");
    if (humanRequired) rationaleParts.push("Human approval required.");

    const { data: decision, error: de } = await supabase.from("ede_decisions").upsert({
      proposal_id, outcome, weighted_score: weighted,
      approval_pct: approvalPct, participating_weight: participating,
      conditions: votes.filter((v) => v.vote === "conditional").map((v) => v.conditions).filter(Boolean).join(" | ") || null,
      rollback_plan: null,
      governance_required: governanceRequired,
      human_required: humanRequired,
      rationale: rationaleParts.join(" "),
      evidence: votes.map((v) => ({ executive_id: v.executive_id, vote: v.vote, confidence: v.confidence, evidence: v.evidence })),
      confidence: clamp01(participating > 0 ? totalConf / participating : 0.4),
    }, { onConflict: "proposal_id" }).select().single();
    if (de) throw de;

    await supabase.from("ede_proposals").update({
      status: outcome,
      decided_at: new Date().toISOString(),
    }).eq("id", proposal_id);

    return { decision, votes };
  },

  async approveDecision({ proposal_id, executed_at, approver }) {
    const { data, error } = await supabase.from("ede_proposals").update({
      status: "executed", executed_at: executed_at ?? new Date().toISOString(),
    }).eq("id", proposal_id).select().single();
    if (error) throw error;
    return { proposal: data, approver };
  },

  async reviewDecision({ proposal_id, expected, actual, reviewer }) {
    // compute deltas + decision_quality_score (1 - normalized error)
    const delta: Record<string, number> = {};
    let errSum = 0, nKeys = 0;
    for (const k of Object.keys(expected ?? {})) {
      const e = Number(expected[k]); const a = Number(actual?.[k]);
      if (!Number.isFinite(e) || !Number.isFinite(a)) continue;
      delta[k] = a - e;
      const denom = Math.max(1, Math.abs(e));
      errSum += Math.abs(a - e) / denom; nKeys++;
    }
    const dqs = nKeys > 0 ? Math.max(0, 1 - errSum / nKeys) : null;
    const { data, error } = await supabase.from("ede_post_reviews").upsert({
      proposal_id, expected: expected ?? {}, actual: actual ?? {}, delta,
      decision_quality_score: dqs, reviewer: reviewer ?? "automation",
    }, { onConflict: "proposal_id" }).select().single();
    if (error) throw error;

    // update executive accuracies for voters
    if (dqs !== null) {
      const { data: votes } = await supabase.from("ede_votes").select("executive_id,vote,confidence").eq("proposal_id", proposal_id);
      const { data: prop } = await supabase.from("ede_proposals").select("status").eq("id", proposal_id).single();
      const wasApproved = prop?.status === "executed";
      for (const v of votes ?? []) {
        const alignment = wasApproved
          ? (v.vote === "approve" ? 1 : v.vote === "conditional" ? 0.5 : 0)
          : (v.vote === "reject" ? 1 : v.vote === "abstain" ? 0.5 : 0);
        const accuracy = alignment * dqs + (1 - alignment) * (1 - dqs);
        const { data: ex } = await supabase.from("ede_executives").select("*").eq("id", v.executive_id).single();
        if (!ex) continue;
        const ema = (prev: number, x: number) => 0.85 * Number(prev) + 0.15 * x;
        await supabase.from("ede_executives").update({
          prediction_accuracy: ema(ex.prediction_accuracy, accuracy),
          business_accuracy: ema(ex.business_accuracy, accuracy),
          financial_accuracy: ema(ex.financial_accuracy, accuracy),
          trust_score: ema(ex.trust_score, accuracy),
          confidence_calibration: ema(ex.confidence_calibration, 1 - Math.abs(Number(v.confidence) - accuracy)),
          learning_score: Math.min(1, Number(ex.learning_score) + 0.005),
        }).eq("id", v.executive_id);
      }
      await supabase.rpc("ede_recalc_weights");
    }

    await supabase.from("ede_proposals").update({ status: "reviewed" }).eq("id", proposal_id);
    return data;
  },

  async evaluateProposal({ proposal_id, alternatives_k = 5, scenarios = ["best","expected","worst","black_swan"] }) {
    await handlers.generateAlternatives({ proposal_id, k: alternatives_k });
    for (const s of scenarios) {
      await handlers.simulateScenario({ proposal_id, scenario_type: s, description: null });
    }
    await handlers.calculateBusinessValue({ proposal_id });
    return handlers.runExecutiveVote({ proposal_id });
  },

  async listQueue({ status = "draft", limit = 50 }) {
    const { data } = await supabase.from("ede_proposals").select("*").eq("status", status).order("created_at",{ascending:false}).limit(limit);
    return data ?? [];
  },

  async getProposal({ proposal_id }) {
    const [{ data: prop }, { data: alts }, { data: bv }, { data: scn }, { data: votes }, { data: dec }, { data: rev }] = await Promise.all([
      supabase.from("ede_proposals").select("*").eq("id", proposal_id).single(),
      supabase.from("ede_alternatives").select("*").eq("proposal_id", proposal_id).order("rank"),
      supabase.from("ede_business_value").select("*").eq("proposal_id", proposal_id).maybeSingle(),
      supabase.from("ede_scenarios").select("*").eq("proposal_id", proposal_id),
      supabase.from("ede_votes").select("*, ede_executives(role_key,title)").eq("proposal_id", proposal_id),
      supabase.from("ede_decisions").select("*").eq("proposal_id", proposal_id).maybeSingle(),
      supabase.from("ede_post_reviews").select("*").eq("proposal_id", proposal_id).maybeSingle(),
    ]);
    return { proposal: prop, alternatives: alts ?? [], business_value: bv, scenarios: scn ?? [], votes: votes ?? [], decision: dec, review: rev };
  },

  async stats() {
    const [{ data: execs }, { count: pending }, { count: total }, { data: recent }, { data: decisions }] = await Promise.all([
      supabase.from("ede_executives").select("*").order("weight",{ascending:false}),
      supabase.from("ede_proposals").select("*", { count: "exact", head: true }).in("status", ["draft","voting"]),
      supabase.from("ede_proposals").select("*", { count: "exact", head: true }),
      supabase.from("ede_proposals").select("id,title,proposal_type,risk_level,status,created_at").order("created_at",{ascending:false}).limit(15),
      supabase.from("ede_decisions").select("proposal_id,outcome,approval_pct,confidence,decided_at,governance_required,human_required").order("decided_at",{ascending:false}).limit(15),
    ]);
    return { executives: execs ?? [], pending_count: pending, total_count: total, recent_proposals: recent ?? [], recent_decisions: decisions ?? [] };
  },

  async recalcWeights() {
    const { data, error } = await supabase.rpc("ede_recalc_weights");
    if (error) throw error;
    return data;
  },

  async organicFirstSnapshot() {
    const [health, products, pins] = await Promise.all([
      fetchOrganicHealth(supabase),
      fetchOrganicProductRanking(supabase),
      fetchOrganicPinRanking(supabase),
    ]);
    return {
      layer: "Layer 1 — Organic Truth",
      views_consumed: [
        "v_organic_product_ranking_30d",
        "v_organic_pin_ranking_30d",
        "v_organic_ranking_health",
      ],
      hierarchy: [
        "1. organic_purchases",
        "2. organic_add_to_cart",
        "3. organic_product_views",
        "4. organic_sessions",
        "5. paid = validation only",
      ],
      health,
      top_products: products.slice(0, 50),
      top_pins: pins.slice(0, 50),
    };
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