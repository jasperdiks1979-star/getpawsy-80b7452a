// Phase 9 — Pinterest Market Intelligence Platform
// Read-only aggregator over existing market_*, pinterest_*, ee_p2_*, paip_*, agp_*
// tables. NO publishing, NO mutations to production data. Recommendations flow
// into the existing Execution Center via market_ai_recommendations.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { emitXaiDecision } from "../_shared/xai-decision.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function score(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

async function aggregate() {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const today = new Date().toISOString().slice(0, 10);

  const [
    trends, clusters, opportunities, recs, priority, products,
    competitorPatterns, competitorOpps, gapActions, seasonal,
    pinPerf, boards, keywordTrends, visualDna,
  ] = await Promise.all([
    sb.from("market_trending_products").select("*").order("score", { ascending: false }).limit(100),
    sb.from("market_trend_clusters").select("*").order("signal_score", { ascending: false }).limit(40),
    sb.from("market_opportunity_gaps").select("*").order("impact_score", { ascending: false }).limit(100),
    sb.from("market_ai_recommendations").select("*").eq("status", "pending").order("confidence", { ascending: false }).limit(100),
    sb.from("market_product_priority").select("*").eq("day", today).order("rank", { ascending: true }).limit(50),
    sb.from("market_product_scores").select("*").order("composite_score", { ascending: false }).limit(100),
    sb.from("pinterest_competitor_patterns").select("*").order("avg_success", { ascending: false }).limit(40),
    sb.from("pinterest_competitor_opportunities").select("*").order("gap_score", { ascending: false }).limit(50),
    sb.from("market_gap_action_items").select("*").order("impact_score", { ascending: false }).limit(50),
    sb.from("pinterest_trend_signals").select("*").order("score", { ascending: false }).limit(60),
    sb.from("pinterest_pin_performance").select("pin_id,product_id,impressions,saves,outbound_clicks,ctr").order("impressions", { ascending: false }).limit(100),
    sb.from("pinterest_board_performance").select("*").order("revenue", { ascending: false }).limit(20),
    sb.from("pmin_keyword_trends").select("*").order("trend_score", { ascending: false }).limit(100),
    sb.from("ee_p2_image_dna").select("*").limit(100),
  ]);

  // Module 1 — Market Overview
  const trendList = (trends.data ?? []) as any[];
  const clusterList = (clusters.data ?? []) as any[];
  const opps = (opportunities.data ?? []) as any[];
  const trendVelocity = score(clusterList.map((c) => Number(c.velocity ?? 0) * 50));
  const marketScore = score([
    score(trendList.slice(0, 20).map((t) => Number(t.score ?? 0))),
    trendVelocity,
    score(opps.slice(0, 20).map((o) => Number(o.impact_score ?? 0))),
  ]);
  const emerging = clusterList.filter((c) => ["emerging", "rising"].includes(c.status));
  const declining = clusterList.filter((c) => ["declining", "peaked"].includes(c.status));

  // Module 7 — Seasonal calendar (next 90 days)
  const seasonalSignals = (seasonal.data ?? []) as any[];
  const seasonalCalendar = seasonalSignals
    .filter((s) => s.source === "seasonal" || s.category === "seasonal")
    .slice(0, 30);

  // Module 8 — Content gap detector (already in market_gap_action_items)
  const contentGaps = (gapActions.data ?? []) as any[];

  // Module 10 — Product Match Engine
  const pinPerfByProduct = new Map<string, { imp: number; clk: number; ctr: number }>();
  for (const p of (pinPerf.data ?? []) as any[]) {
    if (!p.product_id) continue;
    const cur = pinPerfByProduct.get(p.product_id) ?? { imp: 0, clk: 0, ctr: 0 };
    cur.imp += Number(p.impressions ?? 0);
    cur.clk += Number(p.outbound_clicks ?? 0);
    cur.ctr = Math.max(cur.ctr, Number(p.ctr ?? 0));
    pinPerfByProduct.set(p.product_id, cur);
  }
  const topProducts = ((priority.data ?? []) as any[]).map((p) => {
    const perf = pinPerfByProduct.get(p.product_id);
    return {
      product_id: p.product_id,
      rank: p.rank,
      composite_score: p.composite_score,
      pinterest_score: perf ? Math.min(100, Math.round((perf.ctr || 0) * 100 + Math.log10((perf.imp || 1) + 1) * 10)) : null,
      recommended_channels: p.recommended_channels,
      rationale: p.rationale,
    };
  });

  return {
    generated_at: new Date().toISOString(),
    data_freshness_minutes: 60,
    overview: {
      market_score: marketScore,
      us_opportunity_score: score(opps.slice(0, 10).map((o) => Number(o.impact_score ?? 0))),
      competition_level: clusterList.length > 30 ? "high" : clusterList.length > 15 ? "medium" : "low",
      demand_trend: trendVelocity > 40 ? "growing" : trendVelocity > 20 ? "stable" : "declining",
      market_confidence: Math.min(100, 40 + clusterList.length + opps.length),
      top_opportunities: opps.slice(0, 20),
      top_threats: declining.slice(0, 20),
      emerging_count: emerging.length,
      declining_count: declining.length,
    },
    trends: { clusters: clusterList, trending_products: trendList.slice(0, 50) },
    keywords: (keywordTrends.data ?? []),
    competitors: { patterns: competitorPatterns.data ?? [], opportunities: competitorOpps.data ?? [] },
    visual_trends: { dna_samples: visualDna.data ?? [] },
    categories: (products.data ?? []),
    seasonal: seasonalCalendar,
    content_gaps: contentGaps,
    us_market: { boards: boards.data ?? [] },
    product_match: topProducts,
    recommendations: recs.data ?? [],
    counts: {
      trends: trendList.length,
      clusters: clusterList.length,
      opportunities: opps.length,
      recommendations: (recs.data ?? []).length,
      gaps: contentGaps.length,
      keywords: (keywordTrends.data ?? []).length,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action") ?? "snapshot";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.action) action = String(body.action);
      } catch (_) { /* no body */ }
    }

    if (action === "run") {
      const out = await runNightly();
      return new Response(JSON.stringify(out), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aggregate();
    const snap = await snapshotState();
    return new Response(JSON.stringify({ ...data, market_intel: snap }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// Pinterest Market Intelligence — nightly trend → opportunity loop
// ============================================================

type Signal = {
  key: string;
  kind: string;         // keyword|cluster|competitor_pattern|seasonal|visual_dna|board
  niche?: string | null;
  growth?: number;      // 0..1
  saturation?: number;  // 0..1 (1 = very saturated)
  competition?: number; // 0..1
  seasonality?: number; // 0..1
  intent?: number;      // 0..1
  age_days?: number;
  raw?: any;
};

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function num(v: any, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

function classifyLifecycle(s: Signal): "emerging" | "growing" | "peak" | "declining" | "expired" | "evergreen" | "seasonal" {
  if (s.kind === "seasonal") return "seasonal";
  const g = s.growth ?? 0;
  const sat = s.saturation ?? 0;
  const age = s.age_days ?? 30;
  if (age > 180 && g > 0.2 && sat < 0.6) return "evergreen";
  if (age > 120 && g <= 0.05) return "expired";
  if (g < -0.05) return "declining";
  if (g >= 0.4 && sat < 0.5) return "emerging";
  if (g >= 0.15) return "growing";
  if (sat >= 0.7 && g < 0.15) return "peak";
  return "growing";
}

function opportunityScore(s: Signal): { score: number; confidence: number } {
  const g = clamp01(s.growth ?? 0);
  const comp = clamp01(s.competition ?? 0.5);
  const sat = clamp01(s.saturation ?? 0.4);
  const intent = clamp01(s.intent ?? 0.5);
  const season = clamp01(s.seasonality ?? 0);
  // Reward growth + intent, penalize saturation + competition; seasonality is a bonus when relevant.
  const raw = 0.40 * g + 0.25 * intent + 0.15 * (1 - sat) + 0.10 * (1 - comp) + 0.10 * season;
  const score = Math.round(raw * 100);
  // Confidence rises with evidence age & moderate growth (avoid spikes).
  const ageFactor = clamp01(((s.age_days ?? 14) - 3) / 30);
  const stability = 1 - Math.abs((s.growth ?? 0) - 0.3); // peak near steady rise
  const confidence = clamp01(0.4 * ageFactor + 0.4 * stability + 0.2 * intent);
  return { score, confidence };
}

function recommendedAction(lifecycle: string, score: number): string {
  if (lifecycle === "expired" || lifecycle === "declining") return "throttle";
  if (lifecycle === "peak") return "harvest";
  if (lifecycle === "evergreen") return "sustain";
  if (score >= 70) return "amplify";
  if (score >= 50) return "test";
  return "monitor";
}

async function gatherSignals(sb: any): Promise<Signal[]> {
  const out: Signal[] = [];
  const today = Date.now();

  const [{ data: trends }, { data: keywords }, { data: clusters }, { data: cpatterns }, { data: copps }, { data: pinPerf }] = await Promise.all([
    sb.from("pinterest_trend_signals").select("*").order("score", { ascending: false }).limit(120),
    sb.from("pmin_keyword_trends").select("*").order("trend_score", { ascending: false }).limit(120),
    sb.from("market_trend_clusters").select("*").order("signal_score", { ascending: false }).limit(80),
    sb.from("pinterest_competitor_patterns").select("*").order("avg_success", { ascending: false }).limit(60),
    sb.from("pinterest_competitor_opportunities").select("*").order("gap_score", { ascending: false }).limit(60),
    sb.from("pinterest_pin_performance").select("ctr,saves,impressions,product_id,updated_at").order("impressions", { ascending: false }).limit(200),
  ]);

  // benchmark saturation from our own pin volume per niche-ish bucket
  const ourImpressionsTotal = (pinPerf ?? []).reduce((a: number, p: any) => a + num(p.impressions), 0);

  for (const t of (trends ?? [])) {
    const created = t.created_at ? new Date(t.created_at).getTime() : today;
    const ageDays = Math.max(1, Math.round((today - created) / 86400000));
    const source = String(t.source ?? "seasonal");
    out.push({
      key: `trend:${t.keyword ?? t.id}`,
      kind: source === "seasonal" ? "seasonal" : "keyword",
      niche: t.category ?? null,
      growth: clamp01(num(t.velocity, num(t.score) / 100)),
      intent: 0.6,
      seasonality: source === "seasonal" ? 0.8 : 0.2,
      competition: 0.4,
      saturation: clamp01(num(t.saturation, 0.3)),
      age_days: ageDays,
      raw: t,
    });
  }

  for (const k of (keywords ?? [])) {
    const created = k.created_at ? new Date(k.created_at).getTime() : today;
    const ageDays = Math.max(1, Math.round((today - created) / 86400000));
    out.push({
      key: `keyword:${k.keyword ?? k.term ?? k.id}`,
      kind: "keyword",
      niche: k.category ?? null,
      growth: clamp01(num(k.trend_score) / 100),
      intent: clamp01(num(k.commercial_intent, 0.55)),
      seasonality: clamp01(num(k.seasonality, 0.1)),
      competition: clamp01(num(k.competition, 0.4)),
      saturation: clamp01(num(k.saturation, 0.3)),
      age_days: ageDays,
      raw: k,
    });
  }

  for (const c of (clusters ?? [])) {
    out.push({
      key: `cluster:${c.cluster_key ?? c.id}`,
      kind: "cluster",
      niche: c.niche ?? c.category ?? null,
      growth: clamp01(num(c.velocity, num(c.signal_score) / 100)),
      intent: 0.55,
      seasonality: 0.15,
      competition: clamp01(num(c.competition, 0.45)),
      saturation: clamp01(num(c.saturation, 0.35)),
      age_days: 21,
      raw: c,
    });
  }

  for (const p of (cpatterns ?? [])) {
    const successAvg = clamp01(num(p.avg_success) / 100);
    out.push({
      key: `cpattern:${p.pattern_type}:${p.pattern_value}:${p.niche_key ?? "all"}`,
      kind: "competitor_pattern",
      niche: p.niche_key ?? null,
      growth: successAvg,
      intent: 0.5,
      saturation: clamp01(num(p.sample_size) / 200),
      competition: 0.6,
      seasonality: 0.1,
      age_days: 30,
      raw: p,
    });
  }

  for (const o of (copps ?? [])) {
    out.push({
      key: `cgap:${o.product_id ?? o.id}`,
      kind: "competitor_gap",
      niche: o.niche_key ?? null,
      growth: clamp01(num(o.gap_score) / 100),
      intent: 0.7,
      saturation: 0.2,
      competition: 0.3,
      seasonality: 0.1,
      age_days: 14,
      raw: o,
    });
  }

  return out;
}

async function snapshotState() {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const [{ data: opps }, { data: runs }] = await Promise.all([
    sb.from("pinterest_market_opportunities").select("*").eq("status", "active").order("opportunity_score", { ascending: false }).limit(120),
    sb.from("pinterest_market_intel_runs").select("*").order("started_at", { ascending: false }).limit(10),
  ]);
  const list = (opps ?? []) as any[];
  const byLifecycle = list.reduce<Record<string, number>>((a, r) => { a[r.lifecycle] = (a[r.lifecycle] ?? 0) + 1; return a; }, {});
  const avg = (k: string) => list.length ? list.reduce((a, r) => a + num(r[k]), 0) / list.length : 0;
  return {
    counts: byLifecycle,
    market_trend_score: Math.round(avg("opportunity_score")),
    trend_confidence: Number(avg("confidence").toFixed(2)),
    competition_index: Number(avg("competition_index").toFixed(2)),
    creative_saturation: Number(avg("saturation").toFixed(2)),
    expected_reach_total: list.reduce((a, r) => a + num(r.expected_reach), 0),
    expected_revenue_cents_total: list.reduce((a, r) => a + num(r.expected_revenue_cents), 0),
    emerging: list.filter((r) => r.lifecycle === "emerging").slice(0, 20),
    growing: list.filter((r) => r.lifecycle === "growing").slice(0, 20),
    peak: list.filter((r) => r.lifecycle === "peak").slice(0, 20),
    declining: list.filter((r) => r.lifecycle === "declining").slice(0, 20),
    recommendations: list
      .filter((r) => ["amplify", "test", "harvest"].includes(r.recommended_action))
      .slice(0, 20),
    last_runs: runs ?? [],
  };
}

async function runNightly() {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: runRow } = await sb.from("pinterest_market_intel_runs")
    .insert({ status: "running" }).select("id").single();
  const runId = runRow?.id as string | undefined;

  const signals = await gatherSignals(sb);
  let inserted = 0, updated = 0, expired = 0, xai = 0;

  const scored = signals.map((s) => {
    const { score, confidence } = opportunityScore(s);
    const lifecycle = classifyLifecycle(s);
    const reach = Math.round(1000 * (s.growth ?? 0.1) * (1 - (s.saturation ?? 0.3)) * (1 + (s.intent ?? 0.5)));
    const revCents = Math.round(reach * 0.012 * 100 * (s.intent ?? 0.5)); // crude expected RPM proxy
    return {
      signal_key: s.key,
      signal_kind: s.kind,
      niche: s.niche ?? null,
      lifecycle,
      opportunity_score: score,
      growth_velocity: s.growth ?? null,
      competition_index: s.competition ?? null,
      saturation: s.saturation ?? null,
      seasonality: s.seasonality ?? null,
      commercial_intent: s.intent ?? null,
      confidence,
      expected_reach: reach,
      expected_revenue_cents: revCents,
      recommended_action: recommendedAction(lifecycle, score),
      rationale: `${s.kind} signal · growth=${(s.growth ?? 0).toFixed(2)} · sat=${(s.saturation ?? 0).toFixed(2)} · intent=${(s.intent ?? 0).toFixed(2)}`,
      evidence: { source: s.kind, raw_keys: Object.keys(s.raw ?? {}).slice(0, 12) },
      status: "active",
      updated_at: new Date().toISOString(),
    };
  });

  // Upsert in chunks
  const CHUNK = 200;
  for (let i = 0; i < scored.length; i += CHUNK) {
    const slice = scored.slice(i, i + CHUNK);
    const { error, count } = await sb
      .from("pinterest_market_opportunities")
      .upsert(slice, { onConflict: "signal_key,signal_kind", count: "exact" });
    if (!error) inserted += slice.length; // PostgREST does not split insert/update counts here
  }

  // Mark stale rows as expired (not refreshed in this run > 14d old)
  const staleCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const { count: expCount } = await sb
    .from("pinterest_market_opportunities")
    .update({ status: "expired", lifecycle: "expired" }, { count: "exact" })
    .eq("status", "active")
    .lt("updated_at", staleCutoff);
  expired = expCount ?? 0;

  // Pick top high-confidence opportunities and emit XAI decisions
  const topForXai = scored
    .filter((s) => s.confidence >= 0.5 && s.opportunity_score >= 60 && ["emerging", "growing", "peak"].includes(s.lifecycle))
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, 12);

  for (const o of topForXai) {
    const liftPct = Math.min(0.6, (o.opportunity_score / 100) * 0.5);
    const ok = await emitXaiDecision({
      sourceEngine: "pinterest-market-intelligence",
      decisionType: `market_${o.recommended_action}`,
      subjectKind: o.signal_kind,
      subjectId: o.signal_key,
      summary: `${o.recommended_action.toUpperCase()} external Pinterest signal "${o.signal_key}" (${o.lifecycle}).`,
      reasonCodes: [
        o.opportunity_score >= 75 ? "HIGH_CONFIDENCE" : "FRESH_EVIDENCE",
        (o.competition_index ?? 0.5) < 0.4 ? "LOW_COMPETITION" : "BOARD_RELEVANCE",
        o.lifecycle === "seasonal" ? "SEASONAL_MATCH" : "CREATIVE_DIVERSITY",
      ],
      evidence: {
        sample_size: 1,
        freshness_days: 1,
        sources: ["pinterest_trend_signals", "pmin_keyword_trends", "market_trend_clusters", "pinterest_competitor_patterns"],
        metrics: {
          opportunity_score: o.opportunity_score,
          growth_velocity: Number((o.growth_velocity ?? 0).toFixed(3)),
          competition_index: Number((o.competition_index ?? 0).toFixed(3)),
          saturation: Number((o.saturation ?? 0).toFixed(3)),
        },
      },
      alternatives: [
        { option: "Ignore signal", rejection_reason: "Underestimates emerging demand", confidence: 0.3 },
        { option: "Full-spend amplification", rejection_reason: "Exceeds risk budget", confidence: 0.4 },
      ],
      counterfactual: {
        if_unchanged: { expected_metric: "reach", expected_value: 0, note: "Status quo misses early window" },
      },
      confidence: o.confidence,
      expectedLift: liftPct,
      risk: 1 - o.confidence,
      dedupeKey: `pinterest-market-intel:${o.signal_key}:${new Date().toISOString().slice(0, 10)}`,
      // Market Intelligence pulls external trend/keyword/competitor
      // signals — never proof of our own organic conversion. Council
      // must treat this as heuristic (external market prior), and
      // low-confidence signals as insufficient_data.
      evidenceSource: o.confidence < 0.5 ? "insufficient_data" : "heuristic",
    });
    if (ok) xai++;
  }

  const snap = await snapshotState();
  await sb.from("pinterest_market_intel_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      signals_seen: signals.length,
      opportunities_new: inserted,
      opportunities_updated: updated,
      opportunities_expired: expired,
      xai_emitted: xai,
      market_score: snap.market_trend_score,
      competition_index: snap.competition_index,
    })
    .eq("id", runId ?? "");

  return {
    run_id: runId,
    signals: signals.length,
    opportunities: scored.length,
    xai_emitted: xai,
    expired,
    market_intel: snap,
  };
}