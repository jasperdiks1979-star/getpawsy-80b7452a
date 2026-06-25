import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

const SUBSCORES = [
  "seo","pinterest","media","creative","conversion","performance",
  "product_quality","catalog_health","traffic","revenue",
  "automation","ai_efficiency","trend_direction",
];

const FORECAST_METRICS = [
  "ga_sessions","ga_purchases","ga_revenue_cents","pin_impressions",
  "pin_clicks","cpe_spend_usd","cv3_renders","cj_in_stock_pct",
];

async function aiJson(prompt: string, system: string): Promise<any | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(txt);
  } catch { return null; }
}

// ---------- Forecast helpers ----------
function ewma(series: number[], alpha = 0.3): number {
  if (!series.length) return 0;
  let s = series[0];
  for (let i = 1; i < series.length; i++) s = alpha * series[i] + (1 - alpha) * s;
  return s;
}
function linreg(series: number[]): { slope: number; intercept: number } {
  const n = series.length;
  if (n < 2) return { slope: 0, intercept: series[0] ?? 0 };
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += series[i]; sxy += i * series[i]; sxx += i * i; }
  const slope = (n * sxy - sx * sy) / Math.max(1, n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}
function stddev(series: number[]): number {
  if (series.length < 2) return 0;
  const m = series.reduce((a, b) => a + b, 0) / series.length;
  const v = series.reduce((a, b) => a + (b - m) ** 2, 0) / series.length;
  return Math.sqrt(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();

  // Auth guard: internal secret OR admin JWT
  {
    const SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const internalOk = !!SECRET && req.headers.get("x-internal-secret") === SECRET;
    if (!internalOk) {
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      let ok = false;
      if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
        const { data: u } = await sb.auth.getUser(token);
        if (u?.user) {
          const { data: role } = await sb.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
          ok = !!role;
        }
      }
      if (!ok) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "content-type": "application/json" } });
    }
  }

  let body: any = {}; try { body = await req.json(); } catch {}
  const dry = !!body?.dry_run;
  const backfillDays = Number(body?.backfill ?? 0);
  const day: string = body?.day ?? ymd(new Date(Date.now() - 86_400_000));

  const { data: run } = await sb.from("agp_runs").insert({
    engine: "intelligence_orchestrator",
    trigger: body?.trigger ?? "manual",
    dry_run: dry,
    status: "running",
  }).select("id").single();
  const runId = run!.id;

  const stages: Record<string, any> = {};
  const stepLog = async (name: string, status: string, payload: any = {}) => {
    stages[name] = { status, ...payload };
    await sb.from("agp_run_steps").insert({
      run_id: runId, step: name, status, payload, finished_at: new Date().toISOString(),
    });
  };

  try {
    // ---------- Stage 1: Score Explainer ----------
    const { data: curr } = await sb.from("agp_growth_scores").select("*").eq("day", day).maybeSingle();
    const prevDay = ymd(new Date(new Date(day).getTime() - 86_400_000));
    const { data: prev } = await sb.from("agp_growth_scores").select("*").eq("day", prevDay).maybeSingle();

    const explanations: any[] = [];
    if (curr) {
      for (const ss of SUBSCORES) {
        const c = Number((curr as any)[ss] ?? 0);
        const p = prev ? Number((prev as any)[ss] ?? 0) : null;
        const abs = p == null ? 0 : c - p;
        const pct = p && p > 0 ? (abs / p) * 100 : 0;
        const reason = abs > 2 ? "improved vs prior day"
          : abs < -2 ? "declined vs prior day"
          : p == null ? "no prior baseline"
          : "stable vs prior day";
        const impact = Math.abs(abs) > 10 ? "high" : Math.abs(abs) > 3 ? "medium" : "low";
        explanations.push({
          day, subscore: ss, prev_value: p, curr_value: c,
          abs_delta: abs, pct_delta: pct,
          reason, confidence: 0.7, business_impact: impact,
          root_cause: c < 30 ? "low absolute value — review upstream signals" : "within expected band",
          expected_trend: abs > 0 ? "rising" : abs < 0 ? "falling" : "flat",
        });
      }
    }
    if (!dry && explanations.length) {
      await sb.from("agp_score_explanations").upsert(explanations, { onConflict: "day,subscore" });
    }
    await stepLog("score_explainer", "ok", { rows: explanations.length });

    // ---------- Stage 2: Forecaster ----------
    const { data: history } = await sb.from("agp_signals_daily")
      .select("*").lte("day", day).order("day", { ascending: true }).limit(90);
    const forecasts: any[] = [];
    for (const metric of FORECAST_METRICS) {
      const series = (history ?? []).map((r: any) => Number(r[metric] ?? 0));
      if (!series.length) continue;
      const base = ewma(series);
      const { slope } = linreg(series);
      const sd = stddev(series.slice(-30));
      for (const h of [1, 7, 30, 90]) {
        const predicted = Math.max(0, base + slope * h);
        const band = sd * Math.sqrt(h);
        forecasts.push({
          day, metric, horizon_days: h,
          predicted, low: Math.max(0, predicted - band), high: predicted + band,
          confidence: Math.max(0.2, Math.min(0.95, 1 - (sd / Math.max(1, base + 1)))),
          model: "ewma_linreg_v1",
        });
      }
    }
    if (!dry && forecasts.length) {
      await sb.from("agp_forecasts").upsert(forecasts, { onConflict: "day,metric,horizon_days" });
    }
    await stepLog("forecaster", "ok", { rows: forecasts.length, metrics: FORECAST_METRICS.length });

    // ---------- Stage 3: Opportunity Index ----------
    const { data: products } = await sb.from("products")
      .select("id,is_active,price,margin_percent,effective_stock,us_stock,image_url,seo_title,description")
      .eq("is_active", true).limit(800);
    const pids = (products ?? []).map((p: any) => p.id);

    const [{ data: healthRows }, { data: mediaRows }, { data: revOpp }] = await Promise.all([
      sb.from("agp_product_health").select("product_id,overall,media_quality,pinterest_ready,seo_ready,creative_quality").in("product_id", pids),
      sb.from("product_media").select("product_id,media_type").in("product_id", pids),
      sb.from("pinterest_revenue_opportunity_scores").select("product_id,score").in("product_id", pids),
    ]);
    const healthByP = new Map((healthRows ?? []).map((r: any) => [r.product_id, r]));
    const revByP = new Map((revOpp ?? []).map((r: any) => [r.product_id, Number(r.score) || 0]));
    const mediaByP: Record<string, number> = {};
    for (const m of mediaRows ?? []) {
      mediaByP[(m as any).product_id] = (mediaByP[(m as any).product_id] ?? 0) + 1;
    }

    const oppRows = (products ?? []).map((p: any) => {
      const h: any = healthByP.get(p.id) ?? {};
      const revPotential = clamp(Number(p.price || 0) * Number(p.margin_percent || 0.3) * 2);
      const pinPotential = revByP.get(p.id) ? clamp(revByP.get(p.id)! / 10) : (h.pinterest_ready ?? 0);
      const seoPotential = h.seo_ready ?? 0;
      const mediaQ = h.media_quality ?? Math.min(100, (mediaByP[p.id] ?? 0) * 25);
      const cjQ = (p.image_url ? 50 : 0) + ((p.description?.length ?? 0) >= 200 ? 50 : 0);
      const invHealth = (Number(p.us_stock || 0) > 0 ? 100 : Number(p.effective_stock || 0) > 0 ? 60 : 0);
      const compRisk = 30; // placeholder pending competitor lake hookup
      const trend = 50;
      const profitPotential = clamp(Number(p.margin_percent || 0) * 100);
      const ctr = 0; const cvr = 0;
      const overall = clamp(
        revPotential * 0.18 + pinPotential * 0.15 + seoPotential * 0.10
        + mediaQ * 0.08 + cjQ * 0.05 + invHealth * 0.10 + (100 - compRisk) * 0.05
        + trend * 0.04 + profitPotential * 0.20 + ctr * 0.025 + cvr * 0.025
      );
      const expMonthly = Math.round(Number(p.price || 0) * Number(p.margin_percent || 0.3) * (overall / 100) * 30 * 100);
      return {
        day, product_id: p.id,
        revenue_potential: revPotential, pinterest_potential: pinPotential, seo_potential: seoPotential,
        media_quality: mediaQ, cj_quality: cjQ, inventory_health: invHealth,
        competition_risk: compRisk, trend_score: trend, profit_potential: profitPotential,
        historical_ctr: ctr, historical_conversion: cvr,
        expected_roi: clamp(overall - 30, 0, 200),
        expected_monthly_rev_cents: expMonthly,
        expected_annual_rev_cents: expMonthly * 12,
        overall_score: overall,
      };
    });
    oppRows.sort((a, b) => b.overall_score - a.overall_score);
    oppRows.forEach((r, i) => (r as any).rank = i + 1);

    if (!dry && oppRows.length) {
      for (let i = 0; i < oppRows.length; i += 200) {
        await sb.from("agp_product_opportunity").upsert(oppRows.slice(i, i + 200), { onConflict: "day,product_id" });
      }
    }
    await stepLog("opportunity_indexer", "ok", { products: oppRows.length });

    // ---------- Stage 4: Business Explanations (AI rollup, single call) ----------
    let businessRows: any[] = [];
    let aiCost = 0;
    if (curr && explanations.length) {
      const compact = explanations.map(e => ({
        s: e.subscore, c: Number(e.curr_value?.toFixed(1)), d: Number(e.abs_delta?.toFixed(1)),
      }));
      const ai = await aiJson(
        `Subscores today and deltas: ${JSON.stringify(compact)}. Overall ${curr.overall}. For each subscore, write a 2-sentence plain-English narrative explaining what likely drove the score and 1-3 short suggested_actions. Output JSON {items:[{subscore,narrative,suggested_actions:[],expected_score_after}]}.`,
        "You are a senior ecommerce growth analyst. Be concrete, no fluff."
      );
      aiCost += 0.01;
      if (ai?.items) {
        businessRows = ai.items.map((it: any) => ({
          day, subscore: it.subscore,
          narrative_md: it.narrative,
          suggested_actions: it.suggested_actions ?? [],
          expected_score_after: Number(it.expected_score_after ?? null),
        })).filter((r: any) => SUBSCORES.includes(r.subscore));
        if (!dry && businessRows.length) {
          await sb.from("agp_business_explanations").upsert(businessRows, { onConflict: "day,subscore" });
        }
      }
    }
    await stepLog("business_explainer", "ok", { rows: businessRows.length, ai_cost_usd: aiCost });

    // ---------- Stage 5: Action Prioritizer ----------
    const priorities: any[] = [];
    // Source A: business explanations → one action per low subscore
    for (const e of explanations) {
      if (e.curr_value < 50) {
        const ssBoost = e.subscore;
        const rev = ssBoost === "revenue" || ssBoost === "conversion" ? 80 : 40;
        const pin = ssBoost === "pinterest" ? 90 : 30;
        const seo = ssBoost === "seo" ? 85 : 25;
        const traf = ssBoost === "traffic" ? 80 : 30;
        const prof = ssBoost === "revenue" ? 70 : 30;
        const conv = ssBoost === "conversion" ? 80 : 25;
        const difficulty = ssBoost === "pinterest" ? 40 : 55;
        const score = (rev * 1.5 + pin + seo + traf + prof + conv) / (difficulty / 50);
        priorities.push({
          day, source: "subscore_lift", source_id: ssBoost,
          title: `Lift ${ssBoost} subscore (currently ${Number(e.curr_value).toFixed(0)})`,
          description: e.reason,
          revenue_impact: rev, traffic_impact: traf, pinterest_impact: pin,
          seo_impact: seo, conversion_impact: conv, profit_impact: prof,
          difficulty, cloud_cost_usd: 0.1, ai_cost_usd: 0.05, exec_minutes: 30,
          confidence: 0.7, priority_score: score, status: "open",
        });
      }
    }
    // Source B: top opportunity products → top 10
    for (const p of oppRows.slice(0, 10)) {
      priorities.push({
        day, source: "product_opportunity", source_id: p.product_id,
        title: `Push top-opportunity product (#${p.rank})`,
        description: `Overall ${p.overall_score.toFixed(0)} — expected $${(p.expected_monthly_rev_cents/100).toFixed(0)}/mo`,
        revenue_impact: p.revenue_potential, traffic_impact: 40,
        pinterest_impact: p.pinterest_potential, seo_impact: p.seo_potential,
        conversion_impact: 50, profit_impact: p.profit_potential,
        difficulty: 45, cloud_cost_usd: 0.2, ai_cost_usd: 0.1, exec_minutes: 20,
        confidence: 0.75, priority_score: p.overall_score * 1.5, status: "open",
      });
    }
    priorities.sort((a, b) => b.priority_score - a.priority_score);
    if (!dry && priorities.length) {
      // Replace today's open priorities to keep idempotent
      await sb.from("agp_action_priorities").delete().eq("day", day);
      await sb.from("agp_action_priorities").insert(priorities);
    }
    await stepLog("action_prioritizer", "ok", { rows: priorities.length });

    // ---------- Stage 6: Daily Insights ----------
    const topProducts = oppRows.slice(0, 10).map(p => ({ product_id: p.product_id, score: p.overall_score, expected_monthly_cents: p.expected_monthly_rev_cents }));
    const wins = explanations.filter(e => e.abs_delta > 0).sort((a, b) => b.abs_delta - a.abs_delta).slice(0, 10);
    const problems = explanations.filter(e => e.abs_delta < 0).sort((a, b) => a.abs_delta - b.abs_delta).slice(0, 10);
    const lowestSub = [...explanations].sort((a, b) => a.curr_value - b.curr_value)[0];
    const insightsRow = {
      day,
      top_wins: wins.map(w => ({ subscore: w.subscore, delta: w.abs_delta })),
      top_problems: problems.map(w => ({ subscore: w.subscore, delta: w.abs_delta })),
      biggest_opportunity: topProducts[0] ?? null,
      biggest_threat: lowestSub ? { subscore: lowestSub.subscore, value: lowestSub.curr_value } : null,
      most_profitable_product: oppRows.sort((a, b) => b.profit_potential - a.profit_potential)[0] ?? null,
      fastest_category: null, worst_category: null,
      top_board: null, top_campaign: null, top_prompt: null, top_creative_style: null,
    };
    if (!dry) await sb.from("agp_daily_insights").upsert(insightsRow, { onConflict: "day" });
    await stepLog("daily_insights", "ok", {});

    // ---------- Stage 7: Self-Improver ----------
    let accuracyRows = 0;
    const { data: yForecasts } = await sb.from("agp_forecasts")
      .select("metric,horizon_days,predicted").eq("day", prevDay).eq("horizon_days", 1);
    const { data: todaySignals } = await sb.from("agp_signals_daily").select("*").eq("day", day).maybeSingle();
    const accRows: any[] = [];
    for (const f of yForecasts ?? []) {
      const actual = Number((todaySignals as any)?.[(f as any).metric] ?? 0);
      const pred = Number((f as any).predicted ?? 0);
      const err = pred - actual;
      const pe = actual > 0 ? Math.abs(err) / actual : 0;
      accRows.push({
        day, metric: (f as any).metric, horizon_days: 1,
        predicted: pred, actual, abs_error: Math.abs(err), pct_error: pe, mape_30d: pe,
        weight_adjustment: 0,
      });
    }
    if (!dry && accRows.length) {
      await sb.from("agp_prediction_accuracy").upsert(accRows, { onConflict: "day,metric,horizon_days" });
      accuracyRows = accRows.length;
    }
    await stepLog("self_improver", "ok", { rows: accuracyRows });

    // ---------- Finish ----------
    const counts = {
      day, dry_run: dry,
      explanations: explanations.length,
      forecasts: forecasts.length,
      products_ranked: oppRows.length,
      business_explanations: businessRows.length,
      priorities: priorities.length,
      accuracy_rows: accuracyRows,
      ai_cost_usd: aiCost,
    };
    await sb.from("agp_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(), counts,
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, run_id: runId, counts, stages }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    await sb.from("agp_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: String(e),
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: String(e), stages }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});