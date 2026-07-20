// PIE — Product Intelligence Engine (Phase 4)
// Computes Opportunity Score per product, persists scores+history, makes
// promotion decisions, populates rolling marketing calendar, runs the
// "daily AI meeting", and exposes admin actions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { aosHeartbeat, aosEvent, aosKnowledge, aosTask } from "../_shared/aos-bus.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Action =
  | "score_all"
  | "decide"
  | "daily_meeting"
  | "schedule_calendar"
  | "feedback_loop"
  | "run_full"
  | "dashboard";

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const norm = (v: number, max: number) => (max <= 0 ? 0 : clamp(v / max, 0, 1));

function seasonalityFactor(category: string | null): number {
  const m = new Date().getUTCMonth() + 1;
  const winter = [11, 12, 1, 2];
  const summer = [6, 7, 8];
  const c = (category || "").toLowerCase();
  if (winter.includes(m) && /(bed|warm|sweater|jacket|blanket|heated)/.test(c)) return 1;
  if (summer.includes(m) && /(cool|travel|car|pool|outdoor|harness)/.test(c)) return 1;
  return 0.55;
}

function tierFromScore(s: number): string {
  if (s >= 80) return "winner";
  if (s >= 65) return "high_opp";
  if (s >= 45) return "watch";
  if (s >= 25) return "neutral";
  return "skip";
}

async function loadWeights(sb: any): Promise<Record<string, number>> {
  const { data } = await sb.from("pie_learning_weights").select("weight_key, weight_value");
  const w: Record<string, number> = {};
  for (const r of data ?? []) w[r.weight_key] = Number(r.weight_value) || 1;
  return w;
}

async function scoreAll(sb: any, runId: string) {
  const weights = await loadWeights(sb);

  const { data: products, error } = await sb
    .from("products")
    .select("id, slug, name, category, price, cost_price, margin_percent, us_stock, eu_stock, image_url, is_active, stock_sync_status, is_fast_shipping, is_us_warehouse, content_readiness_score, inventory_score, created_at")
    .eq("is_active", true)
    .limit(2000);
  if (error) throw error;

  // 30d metric rollup for historical / demand
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data: metrics } = await sb
    .from("pie_product_metrics")
    .select("product_id, impressions, clicks, saves, purchases, revenue_cents")
    .gte("metric_date", since);
  const agg = new Map<string, any>();
  for (const m of metrics ?? []) {
    const a = agg.get(m.product_id) ?? { i: 0, c: 0, s: 0, p: 0, r: 0 };
    a.i += m.impressions; a.c += m.clicks; a.s += m.saves; a.p += m.purchases; a.r += m.revenue_cents;
    agg.set(m.product_id, a);
  }

  // Diversity: last 7 days promotions per product/category
  const recentSince = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: recentPromos } = await sb
    .from("pie_promotion_history")
    .select("product_id, published_at")
    .gte("published_at", recentSince);
  const promoCount = new Map<string, number>();
  for (const p of recentPromos ?? []) promoCount.set(p.product_id, (promoCount.get(p.product_id) ?? 0) + 1);

  // Trend signals
  const { data: trends } = await sb
    .from("pie_product_trending")
    .select("product_id, trend_score")
    .gte("captured_at", since);
  const trendByP = new Map<string, number>();
  for (const t of trends ?? []) trendByP.set(t.product_id, Math.max(trendByP.get(t.product_id) ?? 0, Number(t.trend_score) || 0));

  const upserts: any[] = [];
  const history: any[] = [];

  for (const p of products ?? []) {
    const a = agg.get(p.id) ?? { i: 0, c: 0, s: 0, p: 0, r: 0 };
    const ctr = a.i > 0 ? a.c / a.i : 0;
    const cvr = a.c > 0 ? a.p / a.c : 0;

    // Margin
    const price = Number(p.price ?? 0);
    const cost = Number(p.cost_price ?? 0);
    const margin = price > 0 ? (price - cost) / price : Number(p.margin_percent ?? 0) / 100;
    const projected_margin = clamp(margin, 0, 1);

    // Inventory safety
    const stock = Number(p.us_stock ?? 0) + Number(p.eu_stock ?? 0);
    const stockOk = p.stock_sync_status === "ok" && stock > 0;
    const invSafety = stockOk ? clamp(0.4 + Math.log10(stock + 1) / 3, 0, 1) : 0;

    // Demand: clicks normalized
    const demand = norm(a.c, 200);
    // Historical revenue
    const historical = norm(a.r / 100, 500);
    // Projected metrics
    const projected_ctr = clamp(ctr * 50, 0, 1); // 2% CTR = 1.0
    const projected_conversion = clamp(cvr * 25, 0, 1); // 4% CVR = 1.0
    const projected_revenue_cents = Math.round((a.r / Math.max(1, a.i)) * 1000); // per 1k imps

    const trend = clamp((trendByP.get(p.id) ?? 0) / 100, 0, 1);
    const seasonality = seasonalityFactor(p.category);
    const novelty = norm(
      (Date.now() - new Date(p.created_at).getTime()) / 86400_000 < 60 ? 1 : 0.3,
      1,
    );
    const competition = 0.6; // placeholder until competitor intel feeds in
    const recentPromoCount = promoCount.get(p.id) ?? 0;
    const diversity = clamp(1 - recentPromoCount / 5, 0, 1);

    // Hard blockers
    const block_reasons: string[] = [];
    if (!stockOk) block_reasons.push("out_of_stock");
    if (!p.image_url) block_reasons.push("missing_image");
    if (price <= 0) block_reasons.push("missing_price");
    if (margin < 0.15) block_reasons.push("low_margin");
    if ((p.content_readiness_score ?? 0) < 50 && a.i === 0) block_reasons.push("low_content_readiness");

    const factors = {
      projected_revenue: norm(projected_revenue_cents, 5000),
      projected_ctr,
      projected_conversion,
      projected_margin,
      demand,
      trend,
      seasonality,
      inventory_safety: invSafety,
      novelty,
      competition,
      historical,
      diversity,
    } as Record<string, number>;

    let weightedSum = 0;
    let weightTotal = 0;
    for (const [k, v] of Object.entries(factors)) {
      const w = weights[k] ?? 1;
      weightedSum += v * w;
      weightTotal += w;
    }
    let opportunity = weightTotal > 0 ? (weightedSum / weightTotal) * 100 : 0;
    if (block_reasons.length > 0) opportunity = Math.min(opportunity, 15);

    const tier = block_reasons.length > 0 ? "skip" : tierFromScore(opportunity);
    const confidence = clamp(0.3 + Math.log10(a.i + 10) / 5, 0, 1);

    upserts.push({
      product_id: p.id,
      opportunity_score: Number(opportunity.toFixed(2)),
      projected_revenue_cents,
      projected_ctr,
      projected_conversion,
      projected_margin,
      demand_score: demand,
      trend_score: trend,
      seasonality_score: seasonality,
      inventory_safety_score: invSafety,
      novelty_score: novelty,
      competition_score: competition,
      historical_score: historical,
      diversity_score: diversity,
      margin_intelligence: { price, cost, margin, profit_per_sale_cents: Math.round((price - cost) * 100) },
      inventory_intelligence: { stock, us: p.us_stock, eu: p.eu_stock, status: p.stock_sync_status, fast: p.is_fast_shipping, us_warehouse: p.is_us_warehouse },
      trend_intelligence: { trend_score: trend, seasonality },
      creative_match: {},
      confidence,
      tier,
      block_reasons,
      computed_at: new Date().toISOString(),
    });
    history.push({
      product_id: p.id,
      opportunity_score: Number(opportunity.toFixed(2)),
      components: factors,
      tier,
      run_id: runId,
    });
  }

  // Batch upserts
  for (let i = 0; i < upserts.length; i += 500) {
    await sb.from("pie_product_scores").upsert(upserts.slice(i, i + 500), { onConflict: "product_id" });
  }
  for (let i = 0; i < history.length; i += 500) {
    await sb.from("pie_product_history").insert(history.slice(i, i + 500));
  }
  return { scored: upserts.length };
}

async function decide(sb: any, runId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: scores } = await sb
    .from("pie_product_scores")
    .select("*")
    .gte("opportunity_score", 45)
    .order("opportunity_score", { ascending: false })
    .limit(50);

  const rows = (scores ?? []).map((s: any) => ({
    product_id: s.product_id,
    decision_date: today,
    decision: s.block_reasons.length > 0 ? "skip" : "promote",
    opportunity_score: s.opportunity_score,
    expected_revenue_cents: s.projected_revenue_cents,
    expected_ctr: s.projected_ctr,
    expected_profit_cents: Math.round((s.margin_intelligence?.profit_per_sale_cents ?? 0) * (s.projected_conversion ?? 0) * 100),
    expected_risk: 1 - s.confidence,
    reasoning: s.block_reasons.length > 0
      ? `Blocked: ${s.block_reasons.join(", ")}`
      : `Tier=${s.tier}, opp=${s.opportunity_score}, margin=${(s.projected_margin * 100).toFixed(0)}%, demand=${(s.demand_score * 100).toFixed(0)}%`,
    reason_codes: s.block_reasons.length > 0 ? s.block_reasons : ["opportunity_high"],
    channel: "pinterest",
    scheduled_for: new Date(Date.now() + 6 * 3600_000).toISOString(),
    run_id: runId,
  }));
  if (rows.length) {
    await sb.from("pie_promotion_decisions").upsert(rows, { onConflict: "product_id,decision_date,channel" });
  }
  return { decisions: rows.length };
}

async function scheduleCalendar(sb: any) {
  const { data: decisions } = await sb
    .from("pie_promotion_decisions")
    .select("product_id, opportunity_score, scheduled_for, channel")
    .eq("decision", "promote")
    .gte("decision_date", new Date().toISOString().slice(0, 10))
    .order("opportunity_score", { ascending: false })
    .limit(40);
  const rows = (decisions ?? []).map((d: any, i: number) => ({
    product_id: d.product_id,
    channel: d.channel,
    scheduled_for: new Date(Date.now() + (i + 1) * 90 * 60_000).toISOString(),
    status: "scheduled",
    opportunity_score: d.opportunity_score,
    brief: { source: "pie", rank: i + 1 },
  }));
  if (rows.length) {
    await sb.from("pie_marketing_calendar").upsert(rows, { onConflict: "product_id,channel,scheduled_for" });
  }
  return { scheduled: rows.length };
}

async function dailyMeeting(sb: any) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: top } = await sb
    .from("pie_product_scores")
    .select("product_id, opportunity_score, tier, projected_revenue_cents, margin_intelligence, block_reasons, trend_score, demand_score")
    .order("opportunity_score", { ascending: false })
    .limit(100);
  const winners = (top ?? []).filter((t: any) => t.tier === "winner");
  const gems = (top ?? []).filter((t: any) => t.tier === "high_opp" && (t.demand_score ?? 0) < 0.3);
  const expectedRev = winners.reduce((s: number, w: any) => s + (w.projected_revenue_cents ?? 0), 0);
  const expectedProfit = winners.reduce(
    (s: number, w: any) => s + (w.margin_intelligence?.profit_per_sale_cents ?? 0),
    0,
  );
  const briefing = [
    `Evaluated ${top?.length ?? 0} products.`,
    `${winners.length} winners selected for promotion.`,
    `${gems.length} hidden gems flagged for testing.`,
    `Expected daily revenue contribution: $${(expectedRev / 100).toFixed(2)}.`,
    `Top categories: trend-led + high-margin.`,
  ].join(" ");
  await sb.from("pie_daily_meetings").upsert({
    meeting_date: today,
    products_evaluated: top?.length ?? 0,
    winners_selected: winners.length,
    hidden_gems: gems.length,
    expected_total_revenue_cents: expectedRev,
    expected_total_profit_cents: expectedProfit,
    briefing,
    rankings: top ?? [],
    summary: { generated_at: new Date().toISOString() },
  }, { onConflict: "meeting_date" });
  return { briefing, winners: winners.length, gems: gems.length };
}

async function feedbackLoop(sb: any) {
  // For each promotion in the last 7d, attach observed metrics from pie_product_metrics
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: promos } = await sb
    .from("pie_promotion_history")
    .select("id, product_id, published_at")
    .gte("published_at", since);
  let updated = 0;
  for (const p of promos ?? []) {
    const { data: m } = await sb
      .from("pie_product_metrics")
      .select("impressions, clicks, saves, purchases, revenue_cents")
      .eq("product_id", p.product_id)
      .gte("metric_date", p.published_at.slice(0, 10));
    const tot = (m ?? []).reduce(
      (a: any, r: any) => ({
        i: a.i + r.impressions, c: a.c + r.clicks, s: a.s + r.saves, p: a.p + r.purchases, r: a.r + r.revenue_cents,
      }),
      { i: 0, c: 0, s: 0, p: 0, r: 0 },
    );
    await sb.from("pie_promotion_results").upsert({
      promotion_id: p.id,
      product_id: p.product_id,
      observed_impressions: tot.i,
      observed_clicks: tot.c,
      observed_saves: tot.s,
      observed_purchases: tot.p,
      observed_revenue_cents: tot.r,
      observed_profit_cents: 0,
    });
    updated++;
  }
  return { updated };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const action: Action = body.action ?? "run_full";
  const dry: boolean = !!body.dry_run;

  const { data: runRow } = await sb
    .from("pie_engine_runs")
    .insert({ action, status: "running" })
    .select("id")
    .single();
  const runId = runRow!.id;
  const summary: Record<string, any> = { dry };

  // AOS: heartbeat + run started event
  await aosHeartbeat("pie", "ok");
  await aosEvent({
    event_type: "engine.run.started",
    source_engine: "pie",
    subject: runId,
    payload: { action, dry },
  });

  try {
    if (action === "score_all" || action === "run_full") {
      summary.score = await scoreAll(sb, runId);
    }
    if (action === "decide" || action === "run_full") {
      summary.decide = await decide(sb, runId);
    }
    if (action === "schedule_calendar" || action === "run_full") {
      summary.calendar = await scheduleCalendar(sb);
    }
    if (action === "daily_meeting" || action === "run_full") {
      summary.meeting = await dailyMeeting(sb);
    }
    if (action === "feedback_loop") {
      summary.feedback = await feedbackLoop(sb);
    }
    if (action === "dashboard") {
      const { data: top } = await sb.from("pie_product_scores").select("*").order("opportunity_score", { ascending: false }).limit(50);
      summary.top = top;
    }

    await sb.from("pie_engine_runs").update({
      status: "ok",
      summary,
      products_scanned: summary.score?.scored ?? 0,
      decisions_made: summary.decide?.decisions ?? 0,
      promotions_scheduled: summary.calendar?.scheduled ?? 0,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);

    // AOS integration: publish events, knowledge, and follow-up tasks.
    try {
      const { data: winners } = await sb
        .from("pie_product_scores")
        .select("product_id, opportunity_score, tier, projected_revenue_cents, projected_margin, block_reasons, confidence")
        .order("opportunity_score", { ascending: false })
        .limit(20);

      const top = winners ?? [];
      const promote = top.filter((w: any) => w.tier === "winner" || w.tier === "high_opp");

      // Per-winner events + follow-up creative tasks for the top 5.
      for (let i = 0; i < promote.length; i++) {
        const w: any = promote[i];
        await aosEvent({
          event_type: "opportunity.high",
          source_engine: "pie",
          subject: String(w.product_id),
          payload: {
            opportunity_score: w.opportunity_score,
            tier: w.tier,
            projected_revenue_cents: w.projected_revenue_cents,
            projected_margin: w.projected_margin,
            confidence: w.confidence,
          },
          severity: w.tier === "winner" ? "info" : "info",
        });
        if (i < 5) {
          await aosTask({
            title: `Generate creatives for top opportunity ${w.product_id}`,
            category: "creative.generate",
            owner_engine: "pcie_v2",
            priority: Math.min(95, 60 + Math.round(Number(w.opportunity_score) / 4)),
            payload: {
              product_id: w.product_id,
              opportunity_score: w.opportunity_score,
              tier: w.tier,
              source: "pie",
              run_id: runId,
            },
          });
        }
      }

      // Knowledge: rolling Top 10 opportunities (superseded each run).
      await aosKnowledge({
        topic: "product.opportunities",
        key: "top10",
        publisher_engine: "pie",
        kind: "ranking",
        confidence: 0.85,
        tags: ["pie", "opportunity"],
        payload: {
          generated_at: new Date().toISOString(),
          run_id: runId,
          items: top.slice(0, 10).map((w: any) => ({
            product_id: w.product_id,
            opportunity_score: w.opportunity_score,
            tier: w.tier,
            projected_revenue_cents: w.projected_revenue_cents,
            blocked: (w.block_reasons ?? []).length > 0,
          })),
        },
      });

      // Knowledge: daily AI meeting briefing as plain English.
      if (summary.meeting?.briefing) {
        const today = new Date().toISOString().slice(0, 10);
        await aosKnowledge({
          topic: "pie.daily_briefing",
          key: today,
          publisher_engine: "pie",
          kind: "briefing",
          confidence: 0.9,
          tags: ["pie", "briefing"],
          payload: {
            date: today,
            briefing: summary.meeting.briefing,
            winners: summary.meeting.winners ?? 0,
            gems: summary.meeting.gems ?? 0,
            run_id: runId,
          },
        });
      }

      // Run-complete event with concise summary for the bus consumers.
      await aosEvent({
        event_type: "engine.run.complete",
        source_engine: "pie",
        subject: runId,
        payload: {
          action,
          scored: summary.score?.scored ?? 0,
          decisions: summary.decide?.decisions ?? 0,
          scheduled: summary.calendar?.scheduled ?? 0,
          winners: summary.meeting?.winners ?? promote.filter((p: any) => p.tier === "winner").length,
        },
      });
      await aosHeartbeat("pie", "ok");
    } catch (busErr) {
      // Bus failures must never break the engine.
      console.warn("[pie-engine] AOS bus publish failed", busErr);
    }

    return new Response(JSON.stringify({ ok: true, run_id: runId, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await sb.from("pie_engine_runs").update({
      status: "error", error: (e as Error).message, finished_at: new Date().toISOString(),
    }).eq("id", runId);
    await aosEvent({
      event_type: "engine.run.failed",
      source_engine: "pie",
      subject: runId,
      payload: { action, error: (e as Error).message },
      severity: "critical",
    });
    await aosHeartbeat("pie", "degraded");
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});