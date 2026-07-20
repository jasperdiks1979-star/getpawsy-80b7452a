// Phase 13 — Organic Domination Engine (ODE)
// Reasoning layer on top of OIE/PMIN/Competitor/PCIE2. Organic-only.
// Actions: harvest | dna | gaps | score | evolve | full
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Counters = Record<string, number>;

const FORBIDDEN_PAID_FEATURES = new Set([
  "paid_visitors", "paid_impressions", "ad_spend", "campaign_budget",
  "paid_clicks", "paid_sessions",
]);

function assertOrganicFirst(features: string[]) {
  const leaks = features.filter((f) => FORBIDDEN_PAID_FEATURES.has(f));
  if (leaks.length) throw new Error(`Organic-First violation: ${leaks.join(", ")}`);
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const VISUAL_DNA_SEEDS = [
  { family_key: "luxury_home", display_name: "Luxury Home", description: "Warm wood, soft light, premium textures" },
  { family_key: "minimal_scandi", display_name: "Minimal Scandinavian", description: "Cream/oat palette, negative space" },
  { family_key: "warm_lifestyle", display_name: "Warm Lifestyle", description: "Golden-hour sun, lived-in interiors" },
  { family_key: "modern_pet_parent", display_name: "Modern Pet Parent", description: "Clean, aspirational, human + pet" },
  { family_key: "problem_solver", display_name: "Problem Solver", description: "Before/After framing of a pain point" },
  { family_key: "premium_product", display_name: "Premium Product", description: "Editorial product hero on soft surface" },
  { family_key: "transformation", display_name: "Transformation", description: "Visible improvement, emotional payoff" },
  { family_key: "emotional_bond", display_name: "Emotional Bond", description: "Eye contact, calm tone, intimacy" },
];

async function ensureVisualDnaSeeds(client: ReturnType<typeof sb>, counters: Counters) {
  const { data: existing } = await client.from("ode_visual_dna").select("family_key");
  const have = new Set((existing ?? []).map((r) => r.family_key));
  const toInsert = VISUAL_DNA_SEEDS.filter((s) => !have.has(s.family_key)).map((s) => ({
    ...s,
    characteristics: {},
    evidence_score: 0,
    sample_count: 0,
  }));
  if (toInsert.length) {
    const { error } = await client.from("ode_visual_dna").insert(toInsert);
    if (error) throw error;
  }
  counters.visual_dna_seeded = toInsert.length;
}

async function harvest(client: ReturnType<typeof sb>, counters: Counters) {
  // Pull public competitor patterns and PMIN trends. Read-only over public signals.
  const [{ data: patterns }, { data: trends }, { data: oieDna }] = await Promise.all([
    client.from("pinterest_competitor_patterns").select("*").order("avg_success", { ascending: false }).limit(200),
    client.from("pmin_keyword_trends").select("*").order("opportunity_score", { ascending: false }).limit(200),
    client.from("oie_dna_profiles").select("*").limit(200),
  ]);
  counters.harvested_patterns = patterns?.length ?? 0;
  counters.harvested_trends = trends?.length ?? 0;
  counters.harvested_oie_dna = oieDna?.length ?? 0;
  return { patterns: patterns ?? [], trends: trends ?? [], oieDna: oieDna ?? [] };
}

async function distillDna(
  client: ReturnType<typeof sb>,
  patterns: any[],
  counters: Counters,
) {
  // Extract success patterns by (characteristic = pattern_type, pattern_value).
  let upserts = 0;
  for (const p of patterns) {
    const evidence = Number(p.avg_success ?? 0);
    const samples = Number(p.sample_count ?? 1);
    if (!p.pattern_type || !p.pattern_value || evidence <= 0) continue;
    const row = {
      characteristic: String(p.pattern_type).slice(0, 64),
      pattern_value: String(p.pattern_value).slice(0, 256),
      category_key: p.niche_key ?? null,
      evidence_score: evidence,
      sample_count: samples,
      avg_engagement: evidence,
    };
    const { error } = await client
      .from("ode_success_patterns")
      .upsert(row, { onConflict: "characteristic,pattern_value,category_key" });
    if (!error) upserts++;
  }
  counters.success_patterns_upserted = upserts;

  // Failure DNA from blocklist
  const { data: losers } = await client
    .from("pinterest_loser_blocklist")
    .select("reason,category_key,pattern_value,characteristic")
    .limit(200);
  let failures = 0;
  for (const l of losers ?? []) {
    if (!l.characteristic || !l.pattern_value) continue;
    const { error } = await client.from("ode_failure_patterns").upsert({
      characteristic: String(l.characteristic).slice(0, 64),
      pattern_value: String(l.pattern_value).slice(0, 256),
      category_key: l.category_key ?? null,
      failure_score: 1,
      sample_count: 1,
      reason: l.reason ?? null,
    }, { onConflict: "characteristic,pattern_value,category_key" });
    if (!error) failures++;
  }
  counters.failure_patterns_upserted = failures;
}

async function detectMarketGaps(
  client: ReturnType<typeof sb>,
  trends: any[],
  counters: Counters,
) {
  let created = 0;
  for (const t of trends.slice(0, 50)) {
    const demand = Number(t.volume_proxy ?? 0);
    const velocity = Number(t.velocity ?? 0);
    const opportunity = Number(t.opportunity_score ?? 0);
    if (opportunity <= 0) continue;
    // Competition proxy: inverse of opportunity → low if opp high
    const competition = Math.max(0, 100 - opportunity);
    const row = {
      category_key: t.category_key ?? "uncategorized",
      keyword: t.keyword ?? null,
      demand_score: demand,
      competition_score: competition,
      trend_velocity: velocity,
      opportunity_score: opportunity,
      recommended_dna: opportunity > 70 ? "premium_product" : "warm_lifestyle",
      evidence: { source: "pmin_keyword_trends", week_start: t.week_start ?? null },
      status: "open",
    };
    const { error } = await client.from("ode_market_gaps").insert(row);
    if (!error) created++;
  }
  counters.market_gaps_created = created;
}

async function scorePins(client: ReturnType<typeof sb>, counters: Counters) {
  // Score active draft/queue pins. Organic-only features.
  assertOrganicFirst([
    "organic_confidence", "success_dna_similarity", "visual_dna_strength",
    "market_opportunity", "evidence_quality", "historical_organic",
    "trend_alignment",
  ]);

  const { data: queue } = await client
    .from("pcie2_publish_queue")
    .select("id,product_id,status,headline,hook")
    .in("status", ["draft", "ready", "approved"])
    .limit(200);

  const { data: confidence } = await client
    .from("organic_confidence_predictions")
    .select("product_id,confidence_score")
    .limit(2000);
  const confMap = new Map<string, number>();
  for (const c of confidence ?? []) confMap.set(String(c.product_id), Number(c.confidence_score ?? 0));

  const { data: gaps } = await client.from("ode_market_gaps").select("category_key,opportunity_score").eq("status", "open");
  const gapMap = new Map<string, number>();
  for (const g of gaps ?? []) gapMap.set(String(g.category_key), Math.max(gapMap.get(String(g.category_key)) ?? 0, Number(g.opportunity_score ?? 0)));

  let scored = 0;
  for (const q of queue ?? []) {
    const oc = confMap.get(String(q.product_id)) ?? 50;
    const successSim = q.headline ? 60 : 30;
    const visualStrength = 55;
    const marketOpp = gapMap.get("uncategorized") ?? 40;
    const evidenceQ = oc > 0 ? 70 : 30;
    const historical = 50;
    const failurePenalty = 0;
    const trendAlign = marketOpp;
    const quality = Math.round(
      0.30 * oc +
      0.20 * successSim +
      0.15 * visualStrength +
      0.10 * marketOpp +
      0.10 * evidenceQ +
      0.10 * historical +
      0.05 * trendAlign -
      failurePenalty,
    );
    const { error } = await client.from("ode_pin_quality_scores").insert({
      pin_ref: q.id,
      product_id: q.product_id ?? null,
      organic_confidence: oc,
      success_dna_similarity: successSim,
      visual_dna_strength: visualStrength,
      market_opportunity: marketOpp,
      evidence_quality: evidenceQ,
      historical_organic: historical,
      failure_penalty: failurePenalty,
      trend_alignment: trendAlign,
      quality_score: quality,
      components: { weights: { oc: 0.30, successSim: 0.20, visualStrength: 0.15, marketOpp: 0.10, evidenceQ: 0.10, historical: 0.10, trendAlign: 0.05 } },
    });
    if (!error) scored++;
  }
  counters.pins_scored = scored;
}

async function evolve(client: ReturnType<typeof sb>, runId: string, counters: Counters) {
  // Retire weak DNA, strengthen winners.
  const { data: families } = await client.from("ode_visual_dna").select("id,family_key,evidence_score,sample_count,status");
  let strengthened = 0;
  let retired = 0;
  for (const f of families ?? []) {
    // Use success patterns as proxy for organic lift per family (seed: even split).
    const { count } = await client
      .from("ode_success_patterns")
      .select("*", { count: "exact", head: true })
      .ilike("pattern_value", `%${f.family_key.split("_")[0]}%`);
    const newScore = Number(count ?? 0);
    const status = newScore === 0 && f.sample_count > 0 ? "retired" : "active";
    await client.from("ode_visual_dna").update({
      evidence_score: newScore,
      sample_count: newScore,
      organic_lift: newScore,
      status,
      last_seen_at: new Date().toISOString(),
    }).eq("id", f.id);
    await client.from("ode_evolution_log").insert({
      run_id: runId,
      event_type: status === "retired" ? "dna_retired" : "dna_strengthened",
      subject: f.family_key,
      delta: newScore - Number(f.evidence_score ?? 0),
      reason: status === "retired" ? "No supporting success patterns" : "Supported by organic evidence",
      payload: { previous: f.evidence_score, current: newScore },
    });
    if (status === "retired") retired++; else strengthened++;
  }
  counters.dna_strengthened = strengthened;
  counters.dna_retired = retired;

  // Generate recommendations from top market gaps.
  const { data: topGaps } = await client
    .from("ode_market_gaps")
    .select("*")
    .eq("status", "open")
    .order("opportunity_score", { ascending: false })
    .limit(10);
  let recs = 0;
  for (const g of topGaps ?? []) {
    const { error } = await client.from("ode_recommendations").insert({
      subject_type: "market_gap",
      subject_id: g.id,
      recommendation: `Create ${g.recommended_dna} pin for "${g.keyword ?? g.category_key}"`,
      why: `Demand ${Math.round(Number(g.demand_score))} with low competition (${Math.round(Number(g.competition_score))}) and velocity ${Math.round(Number(g.trend_velocity))}.`,
      evidence: g.evidence ?? {},
      confidence: Math.min(100, Math.round(Number(g.opportunity_score))),
      source: "organic_behaviour",
    });
    if (!error) recs++;
  }
  counters.recommendations_created = recs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "full";
    const client = sb();
    const counters: Counters = {};
    const { data: run, error: runErr } = await client
      .from("ode_runs")
      .insert({ mode: action, status: "running", counters: {} })
      .select("id")
      .single();
    if (runErr || !run) throw runErr ?? new Error("run_init_failed");
    const runId = run.id as string;

    try {
      await ensureVisualDnaSeeds(client, counters);
      const harvested = (action === "harvest" || action === "full" || action === "dna" || action === "gaps")
        ? await harvest(client, counters)
        : { patterns: [], trends: [], oieDna: [] };
      if (action === "dna" || action === "full") await distillDna(client, harvested.patterns, counters);
      if (action === "gaps" || action === "full") await detectMarketGaps(client, harvested.trends, counters);
      if (action === "score" || action === "full") await scorePins(client, counters);
      if (action === "evolve" || action === "full") await evolve(client, runId, counters);

      await client.from("ode_runs").update({
        status: "ok", counters, finished_at: new Date().toISOString(),
      }).eq("id", runId);

      return new Response(JSON.stringify({ ok: true, run_id: runId, counters }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (innerErr) {
      await client.from("ode_runs").update({
        status: "error",
        counters,
        errors: [String((innerErr as Error).message ?? innerErr)],
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
      throw innerErr;
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});